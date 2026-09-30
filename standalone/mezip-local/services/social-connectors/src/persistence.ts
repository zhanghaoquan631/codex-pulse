import type {
  ExternalSocialAccount,
  SocialArchiveItem,
  SocialCollection,
  SocialConnectorAuditEvent,
  SocialExternalPublication,
  SocialImportJob,
  SocialPublication,
} from '@me-zip/shared-types';

export interface SocialPersistedAccount extends ExternalSocialAccount {
  readonly encryptedCredentialRef: string | null;
}

export interface SocialPersistedImportJob extends SocialImportJob {
  readonly idempotencyKey: string;
}

export interface SocialPersistedCollection extends SocialCollection {
  readonly itemIds: readonly string[];
}

export interface SocialPersistedIdempotency {
  readonly scopeKey: string;
  readonly fingerprint: string;
  readonly value: unknown;
}

export interface SocialPersistenceSnapshot {
  readonly accounts: readonly SocialPersistedAccount[];
  readonly jobs: readonly SocialPersistedImportJob[];
  readonly archives: readonly SocialArchiveItem[];
  readonly collections: readonly SocialPersistedCollection[];
  readonly publications: readonly SocialPublication[];
  readonly externalPublications: readonly SocialExternalPublication[];
  readonly cursors: readonly { readonly accountId: string; readonly cursor: string | null }[];
  readonly idempotency: readonly SocialPersistedIdempotency[];
  readonly auditEvents: readonly SocialConnectorAuditEvent[];
}

/** Production must replace this with owner-scoped transactions for migration 015. */
export interface SocialPersistence {
  readonly durable: boolean;
  read(): SocialPersistenceSnapshot | null;
  write(snapshot: SocialPersistenceSnapshot): void;
}

function clone<T>(value: T): T {
  return structuredClone(value);
}

export class InMemorySocialPersistence implements SocialPersistence {
  public readonly durable = false;
  private snapshot: SocialPersistenceSnapshot | null = null;

  public read(): SocialPersistenceSnapshot | null {
    return this.snapshot === null ? null : clone(this.snapshot);
  }

  public write(snapshot: SocialPersistenceSnapshot): void {
    this.snapshot = clone(snapshot);
  }
}
