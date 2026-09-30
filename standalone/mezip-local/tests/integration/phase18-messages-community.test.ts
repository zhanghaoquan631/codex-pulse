import { describe, expect, it } from 'vitest';

import type { AuthenticatedPrincipal } from '@me-zip/shared-types';

import {
  InMemoryMessagingEntitlements,
  InMemoryMessagingFounderDirectory,
  InMemoryMessagingGroupProvider,
  MessagingService,
} from '../../services/messaging/src/index.js';

const principal = (userId: string, roles: readonly string[] = ['USER']): AuthenticatedPrincipal => ({
  userId,
  sessionId: `session-${userId}`,
  roles,
  issuedAt: '2026-08-20T00:00:00.000Z',
});

function service(options: ConstructorParameters<typeof MessagingService>[0] = {}) {
  let sequence = 0;
  return new MessagingService({
    ...options,
    runtime: {
      now: () => '2026-08-20T00:00:00.000Z',
      id: () => `00000000-0000-4000-8000-${String(++sequence).padStart(12, '0')}`,
    },
  });
}

describe('Phase 18 Messages and Community integration', () => {
  it('keeps a stranger request recipient-controlled, idempotent, and participant-scoped', () => {
    const messages = service();
    const alice = principal('00000000-0000-4000-8000-000000000301');
    const bob = principal('00000000-0000-4000-8000-000000000302');
    const proMax = principal('00000000-0000-4000-8000-000000000303', ['USER', 'PRO_MAX']);

    const first = messages.createMessageRequest(alice, bob.userId, 'request-one');
    const retry = messages.createMessageRequest(alice, bob.userId, 'request-one');
    expect(retry.id).toBe(first.id);
    expect(first.requestState).toBe('PENDING');
    expect(() => messages.listMessages(bob, first.id)).toThrow();
    expect(() => messages.listMessages(proMax, first.id)).toThrow();

    messages.send(alice, first.id, {
      clientMessageId: 'request-message',
      body: 'May I message you?',
    });
    const accepted = messages.resolveMessageRequest(bob, first.id, 'ACCEPT', 'accept-one');
    expect(accepted.requestState).toBe('ACCEPTED');
    expect(messages.listMessages(bob, first.id).items).toHaveLength(1);
  });

  it('enforces private group membership and channel-like group conversation access', () => {
    const groups = new InMemoryMessagingGroupProvider();
    const owner = principal('00000000-0000-4000-8000-000000000311');
    const member = principal('00000000-0000-4000-8000-000000000312');
    const outsider = principal('00000000-0000-4000-8000-000000000313', ['USER', 'PRO_MAX']);
    groups.set('private-group', 'Private group', [
      { userId: owner.userId, role: 'OWNER' },
      { userId: member.userId, role: 'MEMBER' },
    ]);
    const messages = service({ groupProvider: groups });
    const conversation = messages.openGroup(owner, 'private-group', 'group-open');
    messages.send(owner, conversation.id, { clientMessageId: 'private-group-message', body: 'Members only.' });

    expect(messages.listMessages(member, conversation.id).items).toHaveLength(1);
    expect(() => messages.listMessages(outsider, conversation.id)).toThrow();
  });

  it('keeps Founder Inbox entitlement-scoped and never gives the Founder arbitrary DM access', () => {
    const entitlements = new InMemoryMessagingEntitlements();
    const founders = new InMemoryMessagingFounderDirectory();
    const founder = principal('00000000-0000-4000-8000-000000000321');
    const entitled = principal('00000000-0000-4000-8000-000000000322');
    const alice = principal('00000000-0000-4000-8000-000000000323');
    const bob = principal('00000000-0000-4000-8000-000000000324');
    founders.setFounderUserId(founder.userId);
    entitlements.set(entitled.userId, ['FOUNDER_INBOX_ACCESS']);
    const messages = service({ entitlementResolver: entitlements, founderDirectory: founders });

    const inbox = messages.openFounderInbox(entitled, 'founder-inbox');
    expect(messages.listMessages(founder, inbox.id).items).toEqual([]);
    const unrelated = messages.openDirect(alice, bob.userId, 'unrelated-direct');
    messages.send(alice, unrelated.id, { clientMessageId: 'unrelated-message', body: 'Not for Founder.' });
    expect(() => messages.listMessages(founder, unrelated.id)).toThrow();
  });
});
