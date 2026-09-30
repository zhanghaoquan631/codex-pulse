/**
 * Browser-local media storage for the offline archive experience.
 *
 * Files stay in IndexedDB on this device. This module never sends a request,
 * never derives an external URL, and only returns an object URL for the
 * browser session that explicitly asked to display a locally owned image.
 */

const DATABASE_NAME = 'mezip-local-media-v1';
const STORE_NAME = 'images';

export interface LocalMediaReference {
  readonly ownerId: string;
  readonly mediaId: string;
}

function keyFor(reference: LocalMediaReference): string {
  return `${reference.ownerId}:${reference.mediaId}`;
}

function databaseAvailable(): boolean {
  return typeof indexedDB !== 'undefined';
}

function openDatabase(): Promise<IDBDatabase> {
  return new Promise((resolve, reject) => {
    const request = indexedDB.open(DATABASE_NAME, 1);
    request.onerror = () => reject(request.error ?? new Error('无法打开本机图片库。'));
    request.onupgradeneeded = () => {
      if (!request.result.objectStoreNames.contains(STORE_NAME)) {
        request.result.createObjectStore(STORE_NAME);
      }
    };
    request.onsuccess = () => resolve(request.result);
  });
}

async function withStore<T>(
  mode: IDBTransactionMode,
  operation: (store: IDBObjectStore) => IDBRequest<T>,
): Promise<T> {
  const database = await openDatabase();
  try {
    return await new Promise<T>((resolve, reject) => {
      const transaction = database.transaction(STORE_NAME, mode);
      const request = operation(transaction.objectStore(STORE_NAME));
      request.onerror = () => reject(request.error ?? new Error('本机图片库操作失败。'));
      request.onsuccess = () => resolve(request.result);
      transaction.onerror = () => reject(transaction.error ?? new Error('本机图片库操作失败。'));
    });
  } finally {
    database.close();
  }
}

/** A deliberately small, device-local vault. It fails closed if IndexedDB is unavailable. */
export class LocalMediaVault {
  async save(reference: LocalMediaReference, file: Blob): Promise<void> {
    if (!databaseAvailable()) throw new Error('此浏览器不支持本机图片保存。');
    await withStore('readwrite', (store) => store.put(file, keyFor(reference)));
  }

  async read(reference: LocalMediaReference): Promise<Blob | null> {
    if (!databaseAvailable()) return null;
    const result = await withStore('readonly', (store) => store.get(keyFor(reference)));
    return result instanceof Blob ? result : null;
  }

  async remove(reference: LocalMediaReference): Promise<void> {
    if (!databaseAvailable()) return;
    await withStore('readwrite', (store) => store.delete(keyFor(reference)));
  }
}

export const localMediaVault = new LocalMediaVault();
