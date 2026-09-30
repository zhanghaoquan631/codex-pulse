import { describe, expect, it } from 'vitest';

import { LocalDevelopmentStorage } from './storage.js';

describe('LocalDevelopmentStorage', () => {
  it('stores metadata and bytes behind the provider contract', () => {
    const storage = new LocalDevelopmentStorage({
      now: () => '2026-08-17T12:00:00.000Z',
    });
    const metadata = storage.put({
      key: 'owner-a/photo.jpg',
      contentType: 'image/jpeg',
      bytes: new Uint8Array([1, 2, 3]),
      sha256: 'a'.repeat(64),
    });
    expect(metadata.bytes).toBe(3);
    expect(storage.head('owner-a/photo.jpg')).toEqual(metadata);
    expect([...(storage.read('owner-a/photo.jpg') ?? [])]).toEqual([1, 2, 3]);
  });

  it('returns expiring local URLs and rejects unknown objects', () => {
    const storage = new LocalDevelopmentStorage();
    storage.put({
      key: 'owner-a/photo.jpg',
      contentType: 'image/jpeg',
      bytes: new Uint8Array([1]),
    });
    expect(storage.createSignedReadUrl('owner-a/photo.jpg')).toContain('expires=');
    expect(() => storage.createSignedReadUrl('owner-a/missing.jpg')).toThrow('not found');
  });

  it('deletes objects without exposing permanent URLs', () => {
    const storage = new LocalDevelopmentStorage();
    storage.put({
      key: 'owner-a/photo.jpg',
      contentType: 'image/jpeg',
      bytes: new Uint8Array([1]),
    });
    storage.delete('owner-a/photo.jpg');
    expect(storage.head('owner-a/photo.jpg')).toBeNull();
    expect(() => storage.createSignedReadUrl('owner-a/photo.jpg')).toThrow();
  });
});
