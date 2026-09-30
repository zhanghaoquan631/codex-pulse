import { createCipheriv, createDecipheriv, randomBytes } from 'node:crypto';
import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import type {
  SocialCredentialStore,
  SocialPersistence,
  SocialPersistenceSnapshot,
} from '@me-zip/social-connectors';
import type { XCredentialVault, XTokenRecord } from '@me-zip/social-connector-x';

interface SealedValue {
  readonly iv: string;
  readonly tag: string;
  readonly ciphertext: string;
}

interface LocalXStoreDocument {
  readonly version: 1;
  readonly socialState: SealedValue | null;
  readonly providerTokens: Readonly<Record<string, SealedValue>>;
  readonly credentialReferences: Readonly<Record<string, SealedValue>>;
}

const emptyDocument = (): LocalXStoreDocument => ({
  version: 1,
  socialState: null,
  providerTokens: {},
  credentialReferences: {},
});

function sealedValue(value: unknown): value is SealedValue {
  if (value === null || typeof value !== 'object' || Array.isArray(value)) return false;
  const row = value as Readonly<Record<string, unknown>>;
  return Object.keys(row).length === 3 &&
    typeof row.iv === 'string' && /^[A-Za-z0-9_-]+$/u.test(row.iv) &&
    typeof row.tag === 'string' && /^[A-Za-z0-9_-]+$/u.test(row.tag) &&
    typeof row.ciphertext === 'string' && /^[A-Za-z0-9_-]+$/u.test(row.ciphertext);
}

function parseDocument(value: string): LocalXStoreDocument {
  let parsed: unknown;
  try {
    parsed = JSON.parse(value);
  } catch {
    throw new Error('Local X connector store is not valid JSON.');
  }
  if (parsed === null || typeof parsed !== 'object' || Array.isArray(parsed)) {
    throw new Error('Local X connector store is invalid.');
  }
  const row = parsed as Readonly<Record<string, unknown>>;
  if (row.version !== 1 || (row.socialState !== null && !sealedValue(row.socialState)) ||
    row.providerTokens === null || typeof row.providerTokens !== 'object' || Array.isArray(row.providerTokens) ||
    row.credentialReferences === null || typeof row.credentialReferences !== 'object' || Array.isArray(row.credentialReferences) ||
    Object.values(row.providerTokens).some((item) => !sealedValue(item)) ||
    Object.values(row.credentialReferences).some((item) => !sealedValue(item))) {
    throw new Error('Local X connector store has an invalid shape.');
  }
  return structuredClone(parsed) as LocalXStoreDocument;
}

function localKey(keyPath: string): Buffer {
  if (!existsSync(keyPath)) {
    mkdirSync(dirname(keyPath), { recursive: true });
    writeFileSync(keyPath, randomBytes(32).toString('base64url'), { encoding: 'utf8', mode: 0o600 });
  }
  const encoded = readFileSync(keyPath, 'utf8').trim();
  if (!/^[A-Za-z0-9_-]{43}$/u.test(encoded)) {
    throw new Error('Local X connector encryption key is invalid.');
  }
  const key = Buffer.from(encoded, 'base64url');
  if (key.byteLength !== 32) throw new Error('Local X connector encryption key is invalid.');
  return key;
}

/**
 * A local-development-only encrypted store. Both OAuth tokens and private
 * archive state stay outside the repository and are encrypted at rest.
 */
export class EncryptedLocalXConnectorStore
  implements XCredentialVault, SocialCredentialStore, SocialPersistence
{
  public readonly durable = true;
  private readonly dataPath: string;
  private readonly key: Buffer;

  public constructor(options: { readonly dataPath: string; readonly keyPath: string }) {
    this.dataPath = resolve(options.dataPath);
    this.key = localKey(resolve(options.keyPath));
  }

  public read(): SocialPersistenceSnapshot | null;
  public read(externalAccountId: string): Promise<XTokenRecord | null>;
  public read(externalAccountId?: string): SocialPersistenceSnapshot | null | Promise<XTokenRecord | null> {
    if (externalAccountId !== undefined) return this.readToken(externalAccountId);
    const state = this.readDocument().socialState;
    if (state === null) return null;
    const value = this.open(state, 'social-state');
    let snapshot: unknown;
    try {
      snapshot = JSON.parse(value);
    } catch {
      throw new Error('Local X connector archive state is invalid.');
    }
    return structuredClone(snapshot) as SocialPersistenceSnapshot;
  }

  public write(snapshot: SocialPersistenceSnapshot): void;
  public write(externalAccountId: string, token: XTokenRecord): Promise<void>;
  public write(
    snapshotOrExternalAccountId: SocialPersistenceSnapshot | string,
    token?: XTokenRecord,
  ): void | Promise<void> {
    if (typeof snapshotOrExternalAccountId === 'string') {
      if (token === undefined) return Promise.reject(new Error('Local X connector token is invalid.'));
      return this.writeToken(snapshotOrExternalAccountId, token);
    }
    const document = this.readDocument();
    this.writeDocument({ ...document, socialState: this.seal(JSON.stringify(snapshotOrExternalAccountId), 'social-state') });
  }

  private async readToken(externalAccountId: string): Promise<XTokenRecord | null> {
    const token = this.readDocument().providerTokens[externalAccountId];
    if (token === undefined) return null;
    let value: unknown;
    try {
      value = JSON.parse(this.open(token, `token:${externalAccountId}`));
    } catch {
      throw new Error('Local X connector token is invalid.');
    }
    return structuredClone(value) as XTokenRecord;
  }

  private async writeToken(externalAccountId: string, token: XTokenRecord): Promise<void> {
    if (externalAccountId.trim().length === 0 || token.accessToken.trim().length === 0) {
      throw new Error('Local X connector token is invalid.');
    }
    const document = this.readDocument();
    this.writeDocument({
      ...document,
      providerTokens: {
        ...document.providerTokens,
        [externalAccountId]: this.seal(JSON.stringify(token), `token:${externalAccountId}`),
      },
    });
  }

  public async put(accountId: string, encryptedCredential: string): Promise<void> {
    if (!/^(?:encrypted|ciphertext):/u.test(encryptedCredential)) {
      throw new Error('A server credential reference is required.');
    }
    const document = this.readDocument();
    this.writeDocument({
      ...document,
      credentialReferences: {
        ...document.credentialReferences,
        [accountId]: this.seal(encryptedCredential, `credential:${accountId}`),
      },
    });
  }

  public async remove(identifier: string): Promise<void> {
    const document = this.readDocument();
    const providerTokens = { ...document.providerTokens };
    const credentialReferences = { ...document.credentialReferences };
    delete providerTokens[identifier];
    delete credentialReferences[identifier];
    this.writeDocument({ ...document, providerTokens, credentialReferences });
  }

  private readDocument(): LocalXStoreDocument {
    try {
      return parseDocument(readFileSync(this.dataPath, 'utf8'));
    } catch (error) {
      if (error !== null && typeof error === 'object' && 'code' in error && error.code === 'ENOENT') return emptyDocument();
      throw error;
    }
  }

  private writeDocument(document: LocalXStoreDocument): void {
    mkdirSync(dirname(this.dataPath), { recursive: true });
    writeFileSync(this.dataPath, JSON.stringify(document), { encoding: 'utf8', mode: 0o600 });
  }

  private seal(plaintext: string, aad: string): SealedValue {
    const iv = randomBytes(12);
    const cipher = createCipheriv('aes-256-gcm', this.key, iv);
    cipher.setAAD(Buffer.from(aad, 'utf8'));
    const ciphertext = Buffer.concat([cipher.update(plaintext, 'utf8'), cipher.final()]);
    return { iv: iv.toString('base64url'), tag: cipher.getAuthTag().toString('base64url'), ciphertext: ciphertext.toString('base64url') };
  }

  private open(value: SealedValue, aad: string): string {
    try {
      const decipher = createDecipheriv('aes-256-gcm', this.key, Buffer.from(value.iv, 'base64url'));
      decipher.setAAD(Buffer.from(aad, 'utf8'));
      decipher.setAuthTag(Buffer.from(value.tag, 'base64url'));
      return Buffer.concat([decipher.update(Buffer.from(value.ciphertext, 'base64url')), decipher.final()]).toString('utf8');
    } catch {
      throw new Error('Local X connector encrypted data could not be opened.');
    }
  }
}
