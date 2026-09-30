import { createDecipheriv } from 'node:crypto';

import type { AuthenticatedPrincipal } from '@me-zip/shared-types';

import {
  ArchiveError,
  type WeChatSportEncryptedPayload,
  type WeChatSportVerifier,
} from './index.js';

export interface WeChatSessionKeyResolver {
  /** Returns the authenticated principal's current WeChat session key only. */
  getSessionKey(principal: AuthenticatedPrincipal): string | null;
}

export interface WeChatSportCryptoVerifierOptions {
  readonly appId: string;
  readonly sessionKeyResolver: WeChatSessionKeyResolver;
}

interface WeChatStepEnvelope {
  readonly watermark?: { readonly appid?: unknown };
  readonly stepInfoList?: readonly { readonly timestamp?: unknown; readonly step?: unknown }[];
}

function strictBase64(value: string, field: string): Buffer {
  const compact = value.trim();
  if (
    compact.length === 0 ||
    compact.length > 200_000 ||
    compact.length % 4 !== 0 ||
    !/^[A-Za-z0-9+/]*={0,2}$/u.test(compact)
  ) {
    throw new ArchiveError('VALIDATION', `WeChat Sport ${field} is invalid.`);
  }
  return Buffer.from(compact, 'base64');
}

function localMidnight(timestampSeconds: number): string {
  const date = new Date(timestampSeconds * 1_000);
  if (!Number.isFinite(date.getTime())) {
    throw new ArchiveError('VALIDATION', 'WeChat Sport timestamp is invalid.');
  }
  return new Date(Date.UTC(date.getUTCFullYear(), date.getUTCMonth(), date.getUTCDate())).toISOString();
}

/** Server-only AES-CBC verifier for `wx.getWeRunData()` payloads. */
export class WeChatSportCryptoVerifier implements WeChatSportVerifier {
  private readonly appId: string;

  public constructor(private readonly options: WeChatSportCryptoVerifierOptions) {
    this.appId = options.appId.trim();
    if (this.appId.length === 0 || this.appId.length > 200) {
      throw new ArchiveError('INVALID_STATE', 'WeChat Sport application is not configured.');
    }
  }

  public verify(
    principal: AuthenticatedPrincipal,
    input: Pick<WeChatSportEncryptedPayload, 'encryptedData' | 'iv'>,
  ): readonly { readonly day: string; readonly steps: number }[] {
    const sessionKey = this.options.sessionKeyResolver.getSessionKey(principal);
    if (sessionKey === null) {
      throw new ArchiveError('INVALID_STATE', 'Your WeChat session is not available for step synchronization.');
    }
    const key = strictBase64(sessionKey, 'session key');
    const iv = strictBase64(input.iv, 'IV');
    const encrypted = strictBase64(input.encryptedData, 'encrypted data');
    if (key.byteLength !== 16 || iv.byteLength !== 16 || encrypted.byteLength < 16) {
      throw new ArchiveError('VALIDATION', 'WeChat Sport encrypted data is invalid.');
    }
    let decoded: WeChatStepEnvelope;
    try {
      const decipher = createDecipheriv('aes-128-cbc', key, iv);
      const plaintext = Buffer.concat([decipher.update(encrypted), decipher.final()]).toString('utf8');
      decoded = JSON.parse(plaintext) as WeChatStepEnvelope;
    } catch {
      throw new ArchiveError('FORBIDDEN', 'WeChat Sport data could not be verified.');
    }
    if (decoded.watermark?.appid !== this.appId || !Array.isArray(decoded.stepInfoList)) {
      throw new ArchiveError('FORBIDDEN', 'WeChat Sport data belongs to a different application.');
    }
    const byDay = new Map<string, number>();
    for (const item of decoded.stepInfoList) {
      if (
        typeof item.timestamp !== 'number' ||
        !Number.isSafeInteger(item.timestamp) ||
        item.timestamp <= 0 ||
        typeof item.step !== 'number' ||
        !Number.isSafeInteger(item.step) ||
        item.step < 0
      ) {
        throw new ArchiveError('VALIDATION', 'WeChat Sport step data is invalid.');
      }
      byDay.set(localMidnight(item.timestamp), item.step);
    }
    if (byDay.size === 0 || byDay.size > 366) {
      throw new ArchiveError('VALIDATION', 'WeChat Sport data did not contain supported records.');
    }
    return [...byDay.entries()].map(([day, steps]) => ({ day, steps }));
  }
}
