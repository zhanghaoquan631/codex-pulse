import { createCipheriv, randomBytes } from 'node:crypto';

import { describe, expect, it } from 'vitest';

import type { AuthenticatedPrincipal } from '@me-zip/shared-types';

import { ArchiveError } from './index.js';
import { WeChatSportCryptoVerifier } from './wechat-sport.js';

const owner: AuthenticatedPrincipal = {
  userId: 'wechat-owner',
  sessionId: 'wechat-session',
  roles: ['USER'],
  issuedAt: '2026-08-17T00:00:00.000Z',
};

function encryptedPayload(appId: string, key: Buffer, iv: Buffer) {
  const cipher = createCipheriv('aes-128-cbc', key, iv);
  const body = JSON.stringify({
    watermark: { appid: appId },
    stepInfoList: [{ timestamp: 1_755_388_800, step: 8_888 }],
  });
  return {
    encryptedData: Buffer.concat([cipher.update(body, 'utf8'), cipher.final()]).toString('base64'),
    iv: iv.toString('base64'),
  };
}

describe('WeChatSportCryptoVerifier', () => {
  it("decrypts only the authenticated owner's correctly watermarked payload", () => {
    const key = randomBytes(16);
    const iv = randomBytes(16);
    const verifier = new WeChatSportCryptoVerifier({
      appId: 'wx-mezip',
      sessionKeyResolver: { getSessionKey: (principal) => principal.userId === owner.userId ? key.toString('base64') : null },
    });
    expect(verifier.verify(owner, encryptedPayload('wx-mezip', key, iv))).toEqual([
      { day: '2025-08-17T00:00:00.000Z', steps: 8_888 },
    ]);
    expect(() => verifier.verify({ ...owner, userId: 'other' }, encryptedPayload('wx-mezip', key, iv))).toThrow(ArchiveError);
    expect(() => verifier.verify(owner, encryptedPayload('wrong-app', key, iv))).toThrow(ArchiveError);
  });
});
