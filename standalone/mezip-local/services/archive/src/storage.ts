/**
 * Object-storage seam for archive media. The archive repository stores only
 * metadata; this contract keeps byte handling behind an injectable provider.
 */

export interface StoragePutInput {
  readonly key: string;
  readonly contentType: string;
  readonly bytes: Uint8Array;
  readonly sha256?: string | null;
}

export interface StorageObjectMetadata {
  readonly key: string;
  readonly contentType: string;
  readonly bytes: number;
  readonly sha256: string | null;
  readonly createdAt: string;
  readonly updatedAt: string;
}

export interface StorageProvider {
  put(input: StoragePutInput): StorageObjectMetadata;
  head(key: string): StorageObjectMetadata | null;
  delete(key: string): void;
  createSignedReadUrl(key: string, expiresInSeconds?: number): string;
}

interface StoredObject {
  readonly metadata: StorageObjectMetadata;
  readonly bytes: Uint8Array;
}

export interface LocalDevelopmentStorageOptions {
  readonly now?: () => string;
  readonly baseUrl?: string;
}

/** Deterministic in-memory provider for local development and unit tests. */
export class LocalDevelopmentStorage implements StorageProvider {
  private readonly objects = new Map<string, StoredObject>();
  private readonly now: () => string;
  private readonly baseUrl: string;

  public constructor(options: LocalDevelopmentStorageOptions = {}) {
    this.now = options.now ?? (() => new Date().toISOString());
    this.baseUrl = options.baseUrl ?? 'http://local-object-storage.invalid';
  }

  public put(input: StoragePutInput): StorageObjectMetadata {
    if (input.key.trim() === '' || input.key.includes('..')) {
      throw new Error('Storage key must be an opaque, non-empty value.');
    }
    if (!/^[\w.-]+\/[\w.+-]+$/.test(input.contentType)) {
      throw new Error('Storage contentType must be a valid MIME type.');
    }
    const timestamp = this.now();
    const previous = this.objects.get(input.key);
    const metadata: StorageObjectMetadata = {
      key: input.key,
      contentType: input.contentType,
      bytes: input.bytes.byteLength,
      sha256: input.sha256 ?? null,
      createdAt: previous?.metadata.createdAt ?? timestamp,
      updatedAt: timestamp,
    };
    this.objects.set(input.key, {
      metadata,
      bytes: new Uint8Array(input.bytes),
    });
    return cloneMetadata(metadata);
  }

  public head(key: string): StorageObjectMetadata | null {
    const object = this.objects.get(key);
    return object === undefined ? null : cloneMetadata(object.metadata);
  }

  public delete(key: string): void {
    this.objects.delete(key);
  }

  public createSignedReadUrl(key: string, expiresInSeconds = 300): string {
    if (this.objects.has(key) === false) {
      throw new Error('Storage object was not found.');
    }
    if (!Number.isSafeInteger(expiresInSeconds) || expiresInSeconds < 1 || expiresInSeconds > 86_400) {
      throw new Error('Signed URL expiry must be between 1 and 86400 seconds.');
    }
    const expiresAt = Date.parse(this.now()) + expiresInSeconds * 1000;
    return `${this.baseUrl}/${encodeURIComponent(key)}?expires=${expiresAt}`;
  }

  /** Test-only/local inspection helper; production callers should use `head`. */
  public read(key: string): Uint8Array | null {
    const object = this.objects.get(key);
    return object === undefined ? null : new Uint8Array(object.bytes);
  }
}

function cloneMetadata(metadata: StorageObjectMetadata): StorageObjectMetadata {
  return { ...metadata };
}
