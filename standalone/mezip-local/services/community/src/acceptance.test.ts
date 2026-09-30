import { describe, expect, it } from 'vitest';

import {
  ArchiveCommunitySnapshotSource,
} from './archive.js';
import {
  CommunityAuthorizationError,
  CommunityError,
  CommunityService,
  InMemoryCommunityEntitlements,
  type CommunityAdministrationAccess,
} from './index.js';
import { InMemoryArchiveRepository } from '@me-zip/archive';
import type { AuthenticatedPrincipal } from '@me-zip/shared-types';

const founder: AuthenticatedPrincipal = {
  userId: 'founder-user',
  sessionId: 'founder-session',
  roles: ['USER'],
  issuedAt: '2026-08-17T00:00:00.000Z',
};
const member: AuthenticatedPrincipal = {
  userId: 'member-user',
  sessionId: 'member-session',
  roles: ['USER'],
  issuedAt: '2026-08-17T00:00:00.000Z',
};
const outsiderProMax: AuthenticatedPrincipal = {
  userId: 'outsider-pro-max',
  sessionId: 'outsider-pro-max-session',
  roles: ['USER'],
  issuedAt: '2026-08-17T00:00:00.000Z',
};
const proViewer: AuthenticatedPrincipal = {
  userId: 'pro-viewer',
  sessionId: 'pro-viewer-session',
  roles: ['USER'],
  issuedAt: '2026-08-17T00:00:00.000Z',
};
const proMaxViewer: AuthenticatedPrincipal = {
  userId: 'pro-max-viewer',
  sessionId: 'pro-max-viewer-session',
  roles: ['USER'],
  issuedAt: '2026-08-17T00:00:00.000Z',
};
const root: AuthenticatedPrincipal = {
  userId: 'root-user',
  sessionId: 'root-session',
  roles: ['SUPER_ADMIN'],
  issuedAt: '2026-08-17T00:00:00.000Z',
  adminIdentityId: 'root-identity',
  adminType: 'ORIGINAL_DEVELOPER_ROOT',
};

function runtime() {
  let sequence = 0;
  return {
    id: () => `acceptance-${++sequence}`,
    now: () => '2026-08-17T12:00:00.000Z',
  };
}

function entitlements(): InMemoryCommunityEntitlements {
  const value = new InMemoryCommunityEntitlements({
    now: () => new Date('2026-08-17T12:00:00.000Z'),
  });
  value.set(founder.userId, { planCode: 'GO' });
  value.set(member.userId, { planCode: 'GO' });
  value.set(outsiderProMax.userId, { planCode: 'PRO_MAX' });
  value.set(proViewer.userId, { planCode: 'PRO' });
  value.set(proMaxViewer.userId, { planCode: 'PRO_MAX' });
  value.set(root.userId, { planCode: 'PRO_MAX' });
  return value;
}

function administration(): CommunityAdministrationAccess {
  const isRoot = (principal: AuthenticatedPrincipal): boolean =>
    principal.userId === root.userId &&
    principal.adminIdentityId === root.adminIdentityId &&
    principal.adminType === 'ORIGINAL_DEVELOPER_ROOT';
  const requireRoot = (principal: AuthenticatedPrincipal): void => {
    if (!isRoot(principal)) throw new CommunityAuthorizationError();
  };
  return {
    readPrivateGroup: requireRoot,
    readReports: requireRoot,
    manageOfficialChannel: requireRoot,
    moderate: (principal, _input, operation) => {
      requireRoot(principal);
      return operation();
    },
  };
}

function service(options: { readonly snapshotSource?: ArchiveCommunitySnapshotSource } = {}): CommunityService {
  return new CommunityService({
    entitlements: entitlements(),
    administration: administration(),
    runtime: runtime(),
    ...(options.snapshotSource === undefined ? {} : { snapshotSource: options.snapshotSource }),
  });
}

describe('Phase 4 owner acceptance evidence', () => {
  it('keeps Founder Official Channels and premium audience entitlements separate from Root spoofing', () => {
    const community = service();
    const channel = community.createChannel(root, {
      type: 'OFFICIAL',
      slug: 'mezip-official',
      name: 'ME.zip 官方',
      visibility: 'PUBLIC',
      founderAudience: 'FOUNDER_PRO_MAX',
      idempotencyKey: 'official-channel',
    });
    const post = community.createChannelPost(root, channel.id, {
      body: 'PRO MAX 官方频道内容',
      idempotencyKey: 'official-post',
    });

    expect(community.listChannelPosts(proMaxViewer, channel.id).items.map((item) => item.id)).toContain(post.id);
    expect(() => community.getChannel(proViewer, channel.id)).toThrow();
    expect(() => community.listChannelPosts(proViewer, channel.id)).toThrow();

    const forgedRoot = { ...member, adminType: 'ORIGINAL_DEVELOPER_ROOT' as const };
    expect(() => community.createChannel(forgedRoot, {
      type: 'OFFICIAL',
      slug: 'forged-channel',
      name: '伪造频道',
    })).toThrow(CommunityError);
  });

  it('isolates private Group posts while preserving interactions, notifications, search, and replies', () => {
    const community = service();
    const group = community.createGroup(root, {
      name: 'Private circle',
      visibility: 'PRIVATE',
      idempotencyKey: 'private-group',
    });
    community.manageGroupMembership(root, group.id, member.userId, 'INVITE', 'invite-member');
    community.manageGroupMembership(member, group.id, member.userId, 'ACCEPT_INVITE', 'accept-member');
    const privatePost = community.createPost(member, {
      body: 'private circle only phrase',
      groupId: group.id,
      visibility: 'GROUP',
      idempotencyKey: 'private-group-post',
    });

    expect(community.getPost(member, privatePost.id).id).toBe(privatePost.id);
    expect(() => community.getPost(outsiderProMax, privatePost.id)).toThrow();
    expect(community.search(outsiderProMax, 'private circle only phrase').items).toHaveLength(0);
    expect(community.search(member, 'private circle only phrase').items.map((item) => item.id)).toContain(privatePost.id);

    const publicPost = community.createPost(root, {
      body: 'public interaction phrase',
      visibility: 'PUBLIC',
      idempotencyKey: 'public-interaction-post',
    });
    const comment = community.createComment(member, publicPost.id, 'first comment', 'comment-1');
    const reply = community.createReply(root, comment.id, 'one-level reply', 'reply-1');
    expect(reply.parentCommentId).toBe(comment.id);
    expect(community.savePost(member, publicPost.id, 'save-1').saved).toBe(true);
    expect(community.listSavedPosts(member).items.map((item) => item.id)).toContain(publicPost.id);
    community.followUser(member, root.userId, 'follow-1');
    const notifications = community.listNotifications(root, { unreadOnly: true }).items;
    expect(notifications.some((item) => item.type === 'COMMENT')).toBe(true);
    expect(notifications.some((item) => item.type === 'FOLLOW')).toBe(true);
    expect(community.markNotificationRead(root, notifications[0]!.id, 'notification-read').status).toBe('READ');
  });

  it('prevents PRO MAX from reading another owner\'s private Archive Original', () => {
    const archive = new InMemoryArchiveRepository({
      runtime: {
        id: (() => {
          let sequence = 0;
          return () => `archive-acceptance-${++sequence}`;
        })(),
        now: () => '2026-08-17T12:00:00.000Z',
      },
    });
    const entry = archive.createEntry(founder, {
      kind: 'LIFE',
      title: 'Private Founder original',
      body: 'never delivered directly',
      occurredAt: '2026-08-17T08:00:00.000Z',
    });
    const community = service({ snapshotSource: new ArchiveCommunitySnapshotSource(archive) });

    expect(() => archive.getEntry(outsiderProMax, entry.id)).toThrow();
    expect(() => community.publishSnapshot(outsiderProMax, { sourceEntryId: entry.id })).toThrow();
    expect(() => community.publishSnapshot(proMaxViewer, { sourceEntryId: entry.id })).toThrow();
  });
});
