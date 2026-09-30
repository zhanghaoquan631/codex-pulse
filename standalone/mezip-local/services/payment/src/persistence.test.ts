import { readFile } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';

import { describe, expect, it } from 'vitest';

import type {
  Membership,
  MembershipOrder,
} from '@me-zip/shared-types';

import {
  MembershipDurableIdempotencyConflictError,
  PostgresMembershipRepository,
  type MembershipDurableRepository,
  type PostgresMembershipDatabase,
  type PostgresMembershipTransaction,
  toMembershipDurableOrderRow,
} from './persistence.js';
import {
  MembershipService,
  type MembershipStateSnapshot,
} from './membership.js';

const now = '2026-08-18T12:00:00.000Z';
const phase6MigrationPath = fileURLToPath(
  new URL('../../../infrastructure/database/007_phase6_membership_payments.sql', import.meta.url),
);
const phase21MigrationPath = fileURLToPath(
  new URL('../../../infrastructure/database/021_phase21_billing_platforms.sql', import.meta.url),
);

function emptySnapshot(): MembershipStateSnapshot {
  return {
    memberships: [], membershipHistory: [], entitlements: [], benefitGrants: [],
    orders: [], payments: [], paymentEvents: [], refunds: [], coupons: [],
    campaigns: [], campaignTargets: [], campaignClaims: [], redemptionCodes: [],
    redemptions: [], badges: [], inviteRelationships: [], inviteRewards: [],
    adminAudits: [], idempotency: [],
  };
}

class RecordingDatabase implements PostgresMembershipDatabase {
  public readonly statements: { readonly text: string; readonly values: readonly unknown[] }[] = [];
  private readonly idempotency = new Map<string, string>();

  public async transaction<T>(operation: (transaction: PostgresMembershipTransaction) => Promise<T>): Promise<T> {
    const transaction: PostgresMembershipTransaction = {
      query: async <Row extends Record<string, unknown> = Record<string, unknown>>(statement: { readonly text: string; readonly values: readonly unknown[] }) => {
        this.statements.push(statement);
        if (statement.text.includes('INSERT INTO membership_idempotency')) {
          const [key, fingerprint] = statement.values as readonly [string, string];
          if (this.idempotency.has(key)) return { rows: [] as readonly Row[] };
          this.idempotency.set(key, fingerprint);
          return { rows: [{ scope_key: key }] as unknown as readonly Row[] };
        }
        if (statement.text.includes('SELECT fingerprint FROM membership_idempotency')) {
          const key = statement.values[0] as string;
          const fingerprint = this.idempotency.get(key);
          return {
            rows: fingerprint === undefined
              ? [] as readonly Row[]
              : [{ fingerprint }] as unknown as readonly Row[],
          };
        }
        if (statement.text.includes('INSERT INTO orders')) {
          return { rows: [{ id: 'order-1' }] as unknown as readonly Row[] };
        }
        return { rows: [] as readonly Row[] };
      },
    };
    return operation(transaction);
  }
}

class SnapshotRepository implements MembershipDurableRepository {
  public constructor(private readonly snapshot: MembershipStateSnapshot) {}
  public async loadSnapshot(): Promise<MembershipStateSnapshot> { return structuredClone(this.snapshot); }
  public async persistCheckout() { return { applied: true }; }
  public async persistPendingPayment() { return { applied: true }; }
  public async applyVerifiedPayment() { return { applied: true }; }
  public async persistBenefitGrant() { return { applied: true }; }
  public async persistBenefitRevocation() { return { applied: true }; }
  public async persistRefundRequest() { return { applied: true }; }
  public async persistExpiry() { return { applied: true }; }
  public async persistCampaign() { return { applied: true }; }
  public async persistCampaignStatus() { return { applied: true }; }
  public async persistCoupon() { return { applied: true }; }
  public async persistRedemptionCode() { return { applied: true }; }
  public async persistCustomerGrants() { return { applied: true }; }
  public async persistAdminAudit() { return { applied: true }; }
}

function checkoutOrder(): MembershipOrder {
  return {
    id: 'order-1', orderNo: 'MZORDER1', userId: 'user-1', planCode: 'GO',
    baseAmountFen: 1000, discountAmountFen: 0, payableAmountFen: 1000,
    currency: 'CNY', couponId: null, provider: 'MOCK', status: 'CREATED',
    createdAt: now, expiresAt: '2026-08-18T12:30:00.000Z', paidAt: null, updatedAt: now,
  };
}

describe('PostgresMembershipRepository durable contracts', () => {
  it('keeps explicit-user campaign audience evaluation server-only', async () => {
    const migration = await readFile(phase6MigrationPath, 'utf8');
    expect(migration).toContain(
      'REVOKE ALL ON FUNCTION mezip_phase6_campaign_audience_allowed(uuid, uuid) FROM PUBLIC;',
    );
  });

  it('keeps Apple product mapping and reconciliation relations server-only', async () => {
    const migration = await readFile(phase21MigrationPath, 'utf8');
    expect(migration).toContain("'APPLE_IAP'");
    expect(migration).toContain('billing_provider_product_mappings');
    expect(migration).toContain('billing_reconciliation_jobs');
    expect(migration).toContain('FORCE ROW LEVEL SECURITY');
    expect(migration).not.toContain('CREATE POLICY');
  });

  it('reserves idempotency before the checkout row and rejects a conflicting fingerprint', async () => {
    const database = new RecordingDatabase();
    const repository = new PostgresMembershipRepository(database);
    const order = checkoutOrder();
    const firstWrite = {
      order: toMembershipDurableOrderRow(order), couponReservation: null,
      idempotencyKey: 'checkout:user-1:checkout-key-0001',
      idempotency: { key: 'checkout:user-1:checkout-key-0001', fingerprint: '{"planCode":"GO"}', result: order },
    } as const;
    await expect(repository.persistCheckout(firstWrite)).resolves.toEqual({ applied: true });
    const reserveIndex = database.statements.findIndex((statement) => statement.text.includes('INSERT INTO membership_idempotency'));
    const orderIndex = database.statements.findIndex((statement) => statement.text.includes('INSERT INTO orders'));
    expect(reserveIndex).toBeGreaterThanOrEqual(0);
    expect(orderIndex).toBeGreaterThan(reserveIndex);
    await expect(repository.persistCheckout(firstWrite)).resolves.toEqual({ applied: false });
    await expect(repository.persistCheckout({
      ...firstWrite,
      idempotency: { ...firstWrite.idempotency, fingerprint: '{"planCode":"PRO_MAX"}' },
    })).rejects.toBeInstanceOf(MembershipDurableIdempotencyConflictError);
  });

  it('hydrates a durable paid membership, and a rehydrated revoked benefit pass loses actual access', async () => {
    const active: Membership = {
      id: 'membership-1', userId: 'user-1', orderId: null, planCode: 'PLUS',
      status: 'ACTIVE', source: 'ADMIN_GRANT', sourceReference: 'benefit-grant:grant-1',
      startsAt: '2026-08-17T00:00:00.000Z', expiresAt: '2026-08-25T00:00:00.000Z',
      createdAt: now, updatedAt: now, revokedAt: null,
    };
    const runtime = { now: () => now, id: () => 'unused-id', randomCodeBytes: () => Buffer.alloc(24) };
    const activeService = await MembershipService.fromDurable({
      durableRepository: new SnapshotRepository({ ...emptySnapshot(), memberships: [active] }), runtime,
    });
    expect(activeService.isDurableRepositoryConfigured()).toBe(true);
    expect(activeService.hasActualUser('user-1', 'FOUNDER_INBOX_ACCESS')).toBe(true);

    const revoked: Membership = { ...active, status: 'REVOKED', revokedAt: now, updatedAt: now };
    const rehydrated = await MembershipService.fromDurable({
      durableRepository: new SnapshotRepository({ ...emptySnapshot(), memberships: [revoked] }), runtime,
    });
    expect(rehydrated.hasActualUser('user-1', 'FOUNDER_INBOX_ACCESS')).toBe(false);
  });
});
