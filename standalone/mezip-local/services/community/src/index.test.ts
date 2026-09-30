import { describe, expect, it } from 'vitest';

import {
  InMemoryArchiveRepository,
} from '@me-zip/archive';
import type { AuthenticatedPrincipal } from '@me-zip/shared-types';

import { ArchiveCommunitySnapshotSource } from './archive.js';
import {
  CommunityError,
  CommunityService,
  InMemoryCommunityEntitlements,
  InMemoryCommunityPersistence,
  type CommunityAdministrationAccess,
} from './index.js';

const owner: AuthenticatedPrincipal = {
  userId: 'user-owner',
  sessionId: 'session-owner',
  roles: ['USER'],
  issuedAt: '2026-08-17T00:00:00.000Z',
};
const member: AuthenticatedPrincipal = {
  userId: 'user-member',
  sessionId: 'session-member',
  roles: ['USER'],
  issuedAt: '2026-08-17T00:00:00.000Z',
};
const third: AuthenticatedPrincipal = {
  userId: 'user-third',
  sessionId: 'session-third',
  roles: ['USER'],
  issuedAt: '2026-08-17T00:00:00.000Z',
};

function makeRuntime() {
  let sequence = 0;
  return {
    id: () => `community-${++sequence}`,
    now: () => '2026-08-17T12:00:00.000Z',
  };
}

function makeArchive() {
  let sequence = 0;
  return new InMemoryArchiveRepository({
    runtime: {
      id: () => `archive-${++sequence}`,
      now: () => '2026-08-17T12:00:00.000Z',
    },
    quotaBytes: 10_000_000,
  });
}

function makeEntitlements() {
  const entitlements = new InMemoryCommunityEntitlements({
    now: () => new Date('2026-08-17T12:00:00.000Z'),
  });
  entitlements.set(owner.userId, { planCode: 'GO' });
  entitlements.set(member.userId, { planCode: 'GO' });
  entitlements.set(third.userId, { planCode: 'GO' });
  return entitlements;
}

function expectCode(action: () => unknown, code: CommunityError['code']): void {
  let caught: unknown;
  try {
    action();
  } catch (error) {
    caught = error;
  }
  expect(caught).toBeInstanceOf(CommunityError);
  expect((caught as CommunityError).code).toBe(code);
}

describe('Phase 4 Community domain', () => {
  it('keeps FREE archive ownership separate from Community write entitlements', () => {
    const archive = makeArchive();
    const entry = archive.createEntry(owner, {
      kind: 'LIFE',
      title: 'Private original',
      body: 'Only the owner can read this.',
      occurredAt: '2026-08-17T08:00:00.000Z',
    });
    const entitlements = makeEntitlements();
    entitlements.set(owner.userId, { planCode: 'FREE' });
    const service = new CommunityService({
      entitlements,
      snapshotSource: new ArchiveCommunitySnapshotSource(archive),
      runtime: makeRuntime(),
    });

    expect(service.getFeed(owner).items).toHaveLength(0);
    expectCode(
      () => service.createPost(owner, { body: 'FREE cannot publish directly.' }),
      'ENTITLEMENT_REQUIRED',
    );
    expect(archive.getEntry(owner, entry.id).body).toContain('Only the owner');
    expect(() => archive.getEntry(member, entry.id)).toThrow();
  });

  it('keeps FREE visibility limited to public Community while GO reads the feed', () => {
    const entitlements = makeEntitlements();
    entitlements.set(member.userId, { planCode: 'FREE' });
    const service = new CommunityService({ entitlements, runtime: makeRuntime() });
    const communityPost = service.createPost(owner, { body: 'GO-only community post', idempotencyKey: 'go-post' });
    const publicPost = service.createPost(owner, {
      body: 'Public baseline post',
      visibility: 'PUBLIC',
      idempotencyKey: 'public-post',
    });

    expect(service.getFeed(member).items.map((item) => item.id)).toEqual([publicPost.id]);
    expectCode(() => service.getPost(member, communityPost.id), 'NOT_FOUND');
    expect(service.getPost(member, publicPost.id).id).toBe(publicPost.id);
    expect(service.getFeed(owner).items.map((item) => item.id)).toEqual(
      expect.arrayContaining([communityPost.id, publicPost.id]),
    );
  });

  it('validates direct-share recipients and never treats them as a client-owned field', () => {
    const service = new CommunityService({ entitlements: makeEntitlements(), runtime: makeRuntime() });
    expectCode(
      () => service.createPost(owner, { body: 'missing recipient', visibility: 'DIRECT_SHARE' }),
      'VALIDATION',
    );
    expectCode(
      () =>
        service.createPost(owner, {
          body: 'self recipient',
          visibility: 'DIRECT_SHARE',
          directShareRecipientIds: [owner.userId],
        }),
      'VALIDATION',
    );
    const post = service.createPost(owner, {
      body: 'explicit recipient',
      visibility: 'DIRECT_SHARE',
      directShareRecipientIds: [member.userId],
      idempotencyKey: 'direct-share',
    });
    expect(service.getPost(member, post.id).id).toBe(post.id);
    expectCode(() => service.getPost(third, post.id), 'NOT_FOUND');
    expect(service.toSnapshot().posts[0]).not.toHaveProperty('ownerId');
  });

  it('rejects duplicate direct-share recipients at the service boundary', () => {
    const service = new CommunityService({ entitlements: makeEntitlements(), runtime: makeRuntime() });
    expectCode(
      () => service.createPost(owner, {
        body: 'duplicate recipient',
        visibility: 'DIRECT_SHARE',
        directShareRecipientIds: [member.userId, member.userId],
      }),
      'VALIDATION',
    );
  });

  it('creates an immutable delivery snapshot and never exposes another owner\'s source', () => {
    const archive = makeArchive();
    const entry = archive.createEntry(owner, {
      kind: 'LIFE',
      title: 'Version one',
      body: 'Snapshot body one',
      occurredAt: '2026-08-17T08:00:00.000Z',
    });
    const service = new CommunityService({
      entitlements: makeEntitlements(),
      snapshotSource: new ArchiveCommunitySnapshotSource(archive),
      runtime: makeRuntime(),
    });
    const published = service.publishSnapshot(owner, {
      sourceEntryId: entry.id,
      selectedFieldKeys: ['title', 'body'],
      idempotencyKey: 'snapshot-1',
    });
    const post = published.post;
    expect(published.snapshot.id).toBe(post.publishedSnapshotId);
    expect(post.body).toBeNull();
    archive.updateEntry(owner, entry.id, { title: 'Version two', body: 'Changed original' });

    const state = service.toSnapshot();
    const delivery = state.snapshots.find((snapshot) => snapshot.id === post.publishedSnapshotId);
    expect(delivery?.snapshotContent.title).toBe('Version one');
    expect(delivery?.snapshotContent.body).toBe('Snapshot body one');
    expectCode(
      () => service.createPost(member, { body: 'guess', archiveSnapshotId: published.snapshot.archiveSnapshotId }),
      'NOT_FOUND',
    );
  });

  it('makes interactions idempotent and blocks ordinary visibility/interactions', () => {
    const service = new CommunityService({ entitlements: makeEntitlements(), runtime: makeRuntime() });
    const post = service.createPost(owner, { body: 'A unique community post', idempotencyKey: 'post-1' });
    expect(service.createPost(owner, { body: 'A unique community post', idempotencyKey: 'post-1' }).id).toBe(post.id);
    const firstReaction = service.addReaction(member, post.id, 'LIKE', 'reaction-1');
    expect(service.addReaction(member, post.id, 'LIKE', 'reaction-1')).toEqual(firstReaction);
    expect(service.removeReaction(member, post.id, 'LIKE', 'remove-1').removed).toBe(true);
    expect(service.removeReaction(member, post.id, 'LIKE', 'remove-2').removed).toBe(false);

    service.followUser(member, owner.userId, 'follow-1');
    service.blockUser(owner, member.userId, 'block-1');
    expect(service.getFeed(member).items.some((item) => item.id === post.id)).toBe(false);
    expectCode(() => service.addReaction(member, post.id), 'BLOCKED');
    expect(service.unblockUser(owner, member.userId, 'unblock-1').blocked).toBe(false);
  });

  it('enforces private group membership, owner transfer/leave rules, and activity capacity', () => {
    const adminAccess: CommunityAdministrationAccess = {
      readPrivateGroup: (principal) => {
        if (principal.userId !== owner.userId) throw new CommunityError('FORBIDDEN', 'Admin boundary required.');
      },
      readReports: () => undefined,
      manageOfficialChannel: () => undefined,
      moderate: (_principal, _input, operation) => operation(),
    };
    const service = new CommunityService({
      entitlements: makeEntitlements(),
      runtime: makeRuntime(),
      administration: adminAccess,
    });
    const group = service.createGroup(owner, { name: 'Private circle', visibility: 'PRIVATE' });
    expectCode(() => service.getGroup(member, group.id), 'NOT_FOUND');
    expectCode(() => service.leaveGroup(owner, group.id), 'INVALID_STATE');
    service.manageGroupMembership(owner, group.id, member.userId, 'INVITE');
    service.manageGroupMembership(member, group.id, member.userId, 'ACCEPT_INVITE');
    service.transferGroupOwnership(owner, group.id, member.userId, 'transfer-1');
    expect(service.leaveGroup(owner, group.id).status).toBe('LEFT');

    const activity = service.createActivity(owner, {
      kind: 'ONLINE',
      title: 'One seat',
      startAt: '2026-08-18T08:00:00.000Z',
      timezone: 'Asia/Shanghai',
      capacity: 1,
    });
    expect(service.joinActivity(member, activity.id, 'join-1').status).toBe('ACTIVE');
    expect(service.joinActivity(member, activity.id, 'join-duplicate').status).toBe('ACTIVE');
    expectCode(() => service.joinActivity(third, activity.id, 'join-full'), 'CAPACITY_FULL');
    expect(service.cancelActivityRegistration(member, activity.id, 'cancel-1').status).toBe('CANCELLED');
    expect(service.joinActivity(third, activity.id, 'join-after-cancel').status).toBe('ACTIVE');
  });

  it('keeps reports behind the admin boundary and applies moderation actions', () => {
    const adminAccess: CommunityAdministrationAccess = {
      readPrivateGroup: () => undefined,
      readReports: (principal) => {
        if (principal.userId !== owner.userId) throw new CommunityError('FORBIDDEN', 'Admin boundary required.');
      },
      manageOfficialChannel: () => undefined,
      moderate: (principal, _input, operation) => {
        if (principal.userId !== owner.userId) throw new CommunityError('FORBIDDEN', 'Admin boundary required.');
        return operation();
      },
    };
    const service = new CommunityService({
      entitlements: makeEntitlements(),
      runtime: makeRuntime(),
      administration: adminAccess,
    });
    const post = service.createPost(owner, { body: 'Reportable unique content' });
    const report = service.createReport(member, {
      targetType: 'POST',
      targetId: post.id,
      reason: 'SPAM',
      details: 'This is a test report.',
    });
    expectCode(() => service.listReports(member), 'FORBIDDEN');
    const cases = service.listModerationCases(owner);
    expect(cases.items).toHaveLength(1);
    const moderated = service.moderate(owner, cases.items[0]!.id, {
      action: 'HIDE_CONTENT',
      reason: 'Reviewed by trusted moderation boundary.',
    });
    expect(moderated.status).toBe('ACTIONED');
    expect(service.getFeed(member).items.some((item) => item.id === post.id)).toBe(false);
    expect(report.status).toBe('OPEN');
  });

  it('hydrates the full aggregate through the persistence seam', () => {
    const persistence = new InMemoryCommunityPersistence();
    const first = new CommunityService({
      entitlements: makeEntitlements(),
      persistence,
      runtime: makeRuntime(),
    });
    first.createPost(owner, { body: 'Persisted unique post' });
    expect(persistence.read()?.posts).toHaveLength(1);
    const second = new CommunityService({
      entitlements: makeEntitlements(),
      persistence,
      runtime: makeRuntime(),
    });
    expect(second.getFeed(member).items[0]?.body).toBe('Persisted unique post');
  });

  it('creates a quote as commentary plus a source relation and redacts an unavailable original', () => {
    const service = new CommunityService({ entitlements: makeEntitlements(), runtime: makeRuntime() });
    const original = service.createPost(owner, {
      body: 'Published source body must not be copied into the quote.',
      visibility: 'PUBLIC',
      idempotencyKey: 'quote-source',
    });
    const quote = service.createQuote(member, original.id, 'My public commentary.', 'quote-1');
    expect(quote.authorId).toBe(member.userId);
    expect(quote.body).toBe('My public commentary.');
    expect(quote.quote).toMatchObject({
      state: 'AVAILABLE',
      post: { id: original.id, body: 'Published source body must not be copied into the quote.' },
    });
    expect(quote).not.toHaveProperty('quotedPostId');
    expect(service.createQuote(member, original.id, 'My public commentary.', 'quote-1').id).toBe(quote.id);

    service.blockUser(owner, member.userId, 'block-after-quote');
    const afterBlock = service.getPost(member, quote.id);
    expect(afterBlock.quote).toEqual({ state: 'UNAVAILABLE' });
    expect(JSON.stringify(afterBlock.quote)).not.toContain('Published source body');
    service.deletePost(owner, original.id, 'delete-source');
    const afterDeletion = service.getPost(member, quote.id);
    expect(afterDeletion.quote).toEqual({ state: 'UNAVAILABLE' });
    expect(JSON.stringify(afterDeletion.quote)).not.toContain('Published source body');
  });

  it('enforces the private and block firewall for quote and repost operations', () => {
    const service = new CommunityService({ entitlements: makeEntitlements(), runtime: makeRuntime() });
    const directShare = service.createPost(owner, {
      body: 'Recipient-only Social publication',
      visibility: 'DIRECT_SHARE',
      directShareRecipientIds: [member.userId],
      idempotencyKey: 'direct-source',
    });
    expectCode(() => service.createQuote(member, directShare.id, 'cannot make this public'), 'FORBIDDEN');
    expectCode(() => service.setRepost(member, directShare.id, true), 'FORBIDDEN');
    expectCode(() => service.createQuote(member, 'private-life-entry-id', 'cannot quote an Archive id'), 'NOT_FOUND');

    const publicPost = service.createPost(owner, { body: 'Block-safe source', visibility: 'PUBLIC' });
    service.blockUser(owner, member.userId, 'block-quote-repost');
    expectCode(() => service.createQuote(member, publicPost.id, 'blocked'), 'BLOCKED');
    expectCode(() => service.setRepost(member, publicPost.id, true), 'BLOCKED');
  });

  it('keeps a unique repost relationship, attributes it in Following, supports undo, and isolates viewers', () => {
    const persistence = new InMemoryCommunityPersistence();
    const first = new CommunityService({ entitlements: makeEntitlements(), persistence, runtime: makeRuntime() });
    const original = first.createPost(owner, { body: 'Repost source', visibility: 'PUBLIC' });
    for (let index = 0; index < 5; index += 1) {
      const state = first.setRepost(member, original.id, true, `repost-${index}`);
      expect(state.reposted).toBe(true);
      expect(state.repostCount).toBe(1);
    }
    expect(first.toSnapshot().reposts).toHaveLength(1);
    first.followUser(third, member.userId, 'follow-reposter');
    const following = first.getFeed(third, 'FOLLOWING');
    expect(following.items).toHaveLength(1);
    expect(following.items[0]).toMatchObject({
      id: original.id,
      body: 'Repost source',
      repostCount: 1,
      repostedBy: { author: { userId: member.userId } },
    });
    expect(first.getPost(owner, original.id).viewer.reposted).toBe(false);

    const recovered = new CommunityService({ entitlements: makeEntitlements(), persistence, runtime: makeRuntime() });
    expect(recovered.getPost(member, original.id).viewer.reposted).toBe(true);
    expect(recovered.setRepost(member, original.id, false, 'undo-repost')).toMatchObject({ reposted: false, repostCount: 0 });
    expect(recovered.getPost(member, original.id).viewer.reposted).toBe(false);

    recovered.setRepost(member, original.id, true, 'repost-again');
    recovered.deletePost(owner, original.id, 'delete-repost-source');
    expectCode(() => recovered.getPost(third, original.id), 'NOT_FOUND');
    expect(recovered.setRepost(member, original.id, false, 'undo-unavailable')).toMatchObject({ reposted: false, repostCount: 0 });
  });
});
