import { describe, expect, it } from 'vitest';

import {
  accountScopedCacheKey,
  parseMezipDeepLink,
  PlatformCapabilityRegistry,
} from '../../packages/shared-types/src/index.js';
import {
  LocalArchiveAdapter,
  MemoryArchiveStorage,
} from '../../apps/web/src/archiveStore.js';
import {
  MemoryMessagingStorage,
  MessagingDraftCache,
  MessagingOutbox,
} from '../../apps/web/src/messagingOutbox.js';
import {
  DevelopmentMiniAuthAdapter,
  OfficialWeChatAuthAdapter,
} from '../../apps/wechat-miniprogram/miniprogram/lib/mini-auth-adapter.js';
import { toSafeNotificationEnvelope } from '../../services/notification/src/index.js';

describe('Phase 22 multi-platform foundation', () => {
  it('keeps Web local archive/messages/drafts isolated when a development account switches', () => {
    const archive = new LocalArchiveAdapter({ ownerId: 'demo_aaaaaaaa', storage: new MemoryArchiveStorage() });
    archive.create({ kind: 'LIFE', title: 'only account A can read this' });

    const messagingStorage = new MemoryMessagingStorage();
    const outbox = new MessagingOutbox({ storage: messagingStorage, accountSubject: 'demo_aaaaaaaa' });
    const drafts = new MessagingDraftCache({ storage: messagingStorage, accountSubject: 'demo_aaaaaaaa' });
    outbox.enqueue({ clientMessageId: 'message-a', conversationId: 'conversation-a', body: 'private draft' });
    drafts.save('conversation-a', 'private local text');

    archive.setOwner('demo_bbbbbbbb');
    outbox.setAccountSubject('demo_bbbbbbbb');
    drafts.setAccountSubject('demo_bbbbbbbb');
    expect(archive.list()).toEqual([]);
    expect(outbox.list()).toEqual([]);
    expect(drafts.get('conversation-a')).toBeNull();
    expect(accountScopedCacheKey('messages', 'demo_aaaaaaaa')).not.toBe(accountScopedCacheKey('messages', 'demo_bbbbbbbb'));
  });

  it('does not accept a client identity from a Mini login code and keeps development simulation explicit', async () => {
    const development = new DevelopmentMiniAuthAdapter();
    expect(development.verify({ provider: 'EMAIL', identifier: 'one@example.com', code: '123456' }))
      .toMatchObject({ ok: true, session: { mode: 'DEVELOPMENT_MOCK' } });

    const official = new OfficialWeChatAuthAdapter({ requestCode: async () => 'wx-login-code' });
    await expect(official.signIn()).rejects.toMatchObject({ code: 'PRODUCTION_PENDING' });
  });

  it('rejects foreign/forged deep links and leaves missing capabilities disabled', () => {
    expect(parseMezipDeepLink('https://app.mezip.example/social/post/post_1', 'https://app.mezip.example'))
      .toEqual({ kind: 'POST', resourceId: 'post_1' });
    expect(parseMezipDeepLink('https://app.mezip.example/social/post/post_1?ownerId=other', 'https://app.mezip.example'))
      .toBeUndefined();
    expect(parseMezipDeepLink('https://evil.example/membership', 'https://app.mezip.example')).toBeUndefined();

    const capabilities = new PlatformCapabilityRegistry([]);
    expect(capabilities.canUse('IOS', 'MEMBERSHIP', 'WRITE')).toBe(false);
  });

  it('keeps device notification envelopes free of private body text', () => {
    const safe = toSafeNotificationEnvelope({
      userId: 'owner_a',
      channel: 'WECHAT',
      type: 'MESSAGE',
      title: 'new message from a private conversation',
      body: 'private message that must not be shown on a lock screen',
    });
    expect(JSON.stringify(safe)).not.toContain('private message');
    expect(safe).toMatchObject({ body: '打开应用后查看详情' });
  });
});
