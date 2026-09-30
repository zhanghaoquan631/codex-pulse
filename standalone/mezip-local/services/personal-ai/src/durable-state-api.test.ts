import { describe, expect, it } from 'vitest';

import type { AuthenticatedPrincipal } from '@me-zip/shared-types';
import {
  DurablePersonalAIStateApiAdapter,
  type DurablePersonalAIStateApiOptions,
} from './durable-state-api.js';
import type { PersonalAIDurableRepository } from './persistence.js';
import type { PersonalAIDurableOwnerState } from './persistence.js';

const alice: AuthenticatedPrincipal = { userId: 'alice', sessionId: 'session-a', roles: ['USER'], issuedAt: '2026-08-18T00:00:00.000Z' };

const emptyState = (): PersonalAIDurableOwnerState => ({
  ownerId: 'alice',
  preferences: null,
  currentConsent: { accepted: false, version: null, acceptedAt: null, providerDisclosure: '' },
  consentEvents: [],
  sources: [],
  chunks: [],
  conversations: [],
  queries: [],
  citations: [],
  insights: [],
});

function fixture() {
  let state = emptyState();
  const repository = {
    productionSafe: true as const,
    storageKind: 'POSTGRES_OWNER_SCOPED_TRANSACTIONAL' as const,
    loadOwnerState: async () => structuredClone(state),
    writePreferences: async ({ preferences }: { readonly preferences: NonNullable<PersonalAIDurableOwnerState['preferences']> }) => { state = { ...state, preferences }; },
    appendConsent: async ({ event }: { readonly event: PersonalAIDurableOwnerState['consentEvents'][number] }) => {
      state = { ...state, currentConsent: { accepted: event.eventType === 'ACCEPTED', version: event.consentVersion, acceptedAt: event.occurredAt, providerDisclosure: '' }, consentEvents: [...state.consentEvents, event] };
    },
    enqueueIndexJob: async () => { throw new Error('unused'); },
    claimIndexJobs: async () => [],
    renewIndexJobLease: async () => null,
    persistIndexProjection: async () => undefined,
    completeIndexJob: async () => undefined,
    failIndexJob: async () => undefined,
    invalidateSource: async () => undefined,
    persistQuery: async () => undefined,
    persistInsight: async () => undefined,
    clearOwner: async () => undefined,
    claimIndexOutbox: async () => [],
    acknowledgeIndexOutbox: async () => undefined,
    releaseIndexOutbox: async () => undefined,
  } satisfies PersonalAIDurableRepository;
  const options: DurablePersonalAIStateApiOptions = {
    repository,
    trustedPrincipalResolver: { productionSafe: true, resolveOwnerId: (principal) => principal.userId === 'alice' ? 'alice' : null },
    now: () => '2026-08-18T00:00:00.000Z',
  };
  return { adapter: new DurablePersonalAIStateApiAdapter(options), read: () => state };
}

describe('durable Personal AI state API', () => {
  it('reads and writes only the authenticated owner preferences and consent', async () => {
    const { adapter, read } = fixture();
    const preferences = await adapter.handle({ method: 'PATCH', path: '/v1/personal-ai/preferences', principal: alice, body: { enabled: true }, headers: { 'idempotency-key': 'pref-00000001' } });
    expect(preferences.status).toBe(200);
    expect((preferences.body.data as { enabled: boolean }).enabled).toBe(true);
    const consent = await adapter.handle({ method: 'PUT', path: '/v1/personal-ai/consent', principal: alice, body: { version: 'policy-v1' }, headers: { 'idempotency-key': 'consent-000001' } });
    expect(consent.status).toBe(200);
    expect(read().currentConsent.accepted).toBe(true);
    const privacy = await adapter.handle({ method: 'GET', path: '/v1/personal-ai/privacy', principal: alice });
    expect(privacy.status).toBe(200);
    expect((privacy.body.data as { preferences: { enabled: boolean } }).preferences.enabled).toBe(true);
  });

  it('rejects a mismatched trusted owner and fail-closes unsupported durable routes', async () => {
    const { adapter } = fixture();
    const forbidden = await adapter.handle({ method: 'GET', path: '/v1/personal-ai/preferences', principal: { ...alice, userId: 'bob' } });
    expect(forbidden.status).toBe(403);
    const unavailable = await adapter.handle({ method: 'POST', path: '/v1/personal-ai/queries', principal: alice, body: { question: 'x' } });
    expect(unavailable.status).toBe(503);
    expect(unavailable.body.error?.code).toBe('NOT_CONFIGURED');
  });

  it('does not accept owner fields in state mutation bodies', async () => {
    const { adapter } = fixture();
    const result = await adapter.handle({ method: 'PATCH', path: '/v1/personal-ai/preferences', principal: alice, body: { enabled: true, ownerId: 'bob' } });
    expect(result.status).toBe(400);
  });
});
