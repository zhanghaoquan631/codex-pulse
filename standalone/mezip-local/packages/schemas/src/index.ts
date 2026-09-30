import { z } from 'zod';

export const idSchema = z.string().uuid();
export const cnyFenSchema = z.number().int().nonnegative();
export const planCodeSchema = z.enum(['FREE', 'GO', 'PLUS', 'PRO', 'PRO_MAX']);
export const timezoneSchema = z.string().min(1).max(100);

export const authProviderSchema = z.enum([
  'WECHAT',
  'PHONE',
  'EMAIL',
  'GOOGLE',
  'APPLE',
]);
export const otpChallengePurposeSchema = z.enum([
  'SIGN_IN',
  'LINK_IDENTITY',
  'RECOVERY',
]);
export const platformSchema = z.enum([
  'WEB',
  'WECHAT_MINIPROGRAM',
  'WINDOWS',
  'IOS',
  'ANDROID',
  'BROWSER_EXTENSION',
]);

export const consentSchema = z.object({
  termsVersion: z.string().trim().min(1).max(100),
  privacyVersion: z.string().trim().min(1).max(100),
});

/** Start an OTP challenge without accepting a client-supplied user id. */
export const authStartOtpSchema = z.object({
  provider: z.enum(['PHONE', 'EMAIL']),
  identifier: z.string().trim().min(3).max(320),
  purpose: otpChallengePurposeSchema.default('SIGN_IN'),
  deviceId: idSchema.optional(),
});

export const authVerifyOtpSchema = z.object({
  challengeId: idSchema,
  code: z.string().regex(/^\d{6}$/),
  deviceId: idSchema.optional(),
  consent: consentSchema.optional(),
});

export const authExternalVerifySchema = z.object({
  provider: z.enum(['WECHAT', 'GOOGLE', 'APPLE']),
  credential: z.string().min(1).max(10_000),
  deviceId: idSchema.optional(),
  consent: consentSchema,
});

export const authRefreshSchema = z.object({
  refreshToken: z.string().min(32).max(512),
});

export const authLogoutSchema = z.object({
  sessionId: idSchema.optional(),
  refreshToken: z.string().min(32).max(512).optional(),
});

export const identityLinkSchema = z.object({
  provider: authProviderSchema,
  identifier: z.string().trim().min(3).max(320).optional(),
  credential: z.string().min(1).max(10_000).optional(),
});

export const identityUnlinkSchema = z.object({
  identityId: idSchema,
});

export const accountDeletionRequestSchema = z.object({
  reason: z.string().trim().max(1_000).optional(),
});

export const privateRecordCreateSchema = z.object({
  kind: z.enum([
    'LIFE',
    'HISTORY',
    'FITNESS',
    'AI',
    'MOVEMENT',
    'ACHIEVEMENT',
    'CREATOR',
  ]),
  title: z.string().trim().min(1).max(240).optional(),
  body: z.string().max(50_000).optional(),
  occurredAt: z.string().datetime({ offset: true }),
  timezone: timezoneSchema,
});

export const checkoutRequestSchema = z.object({
  productId: idSchema,
});

export const messageSendSchema = z.object({
  clientMessageId: idSchema,
  kind: z.enum(['TEXT', 'IMAGE', 'VIDEO', 'VOICE', 'FILE', 'REACTION']),
  body: z.record(z.string(), z.unknown()).default({}),
  replyToId: idSchema.optional(),
  quoteMessageId: idSchema.optional(),
});

// Phase 3 archive contracts. These schemas are transport boundaries; ownerId,
// status, revision and visibility are always assigned by the server.
export const lifeTypeSchema = z.enum([
  'TEXT',
  'PHOTO',
  'VIDEO',
  'MIXED',
  'NOTE',
  'MEMORY',
]);
export const archiveRevisionSourceSchema = z.enum([
  'ONLINE',
  'OFFLINE',
  'IMPORT',
  'SYSTEM',
]);
export const archiveEntryCreateSchema = z.object({
  kind: z.enum([
    'LIFE',
    'HISTORY',
    'FITNESS',
    'AI',
    'MOVEMENT',
    'ACHIEVEMENT',
    'CREATOR',
  ]),
  lifeType: lifeTypeSchema.nullable().optional(),
  title: z.string().trim().max(240).nullable().optional(),
  body: z.string().max(50_000).nullable().optional(),
  occurredAt: z.string().datetime({ offset: true }),
  timezone: timezoneSchema.optional(),
  recordSource: z.string().trim().min(1).max(80).optional(),
  deviceId: z.string().trim().min(1).max(240).nullable().optional(),
  metadata: z.record(z.string(), z.unknown()).optional(),
  tags: z.array(z.string().trim().min(1).max(80)).max(30).optional(),
  idempotencyKey: z.string().trim().min(8).max(200).optional(),
  source: archiveRevisionSourceSchema.optional(),
});
export const archiveEntryPatchSchema = archiveEntryCreateSchema
  .omit({
    kind: true,
    recordSource: true,
    deviceId: true,
    idempotencyKey: true,
  })
  .partial()
  .extend({
    expectedRevision: z.number().int().positive().optional(),
  });
export const historyCreateSchema = z.object({
  title: z.string().trim().min(1).max(240),
  date: z.string().datetime({ offset: true }),
  entryId: idSchema.nullable().optional(),
  dynasty: z.string().trim().max(120).nullable().optional(),
  people: z.array(z.string().trim().max(160)).max(100).optional(),
  events: z.array(z.string().trim().max(500)).max(100).optional(),
  quotation: z.string().max(5_000).nullable().optional(),
  reflection: z.string().max(50_000).nullable().optional(),
  tags: z.array(z.string().trim().max(80)).max(30).optional(),
  idempotencyKey: z.string().trim().min(8).max(200).optional(),
});
export const fitnessCreateSchema = z.object({
  occurredAt: z.string().datetime({ offset: true }),
  entryId: idSchema.nullable().optional(),
  trainingType: z
    .enum(['STRENGTH', 'CARDIO', 'RUNNING', 'WALKING', 'CYCLING', 'OTHER'])
    .nullable()
    .optional(),
  bodyParts: z.array(z.string().trim().max(80)).max(30).optional(),
  durationSeconds: z.number().int().nonnegative().nullable().optional(),
  stateScore: z.number().int().min(1).max(10).nullable().optional(),
  exercises: z.array(z.record(z.string(), z.unknown())).max(100).optional(),
  idempotencyKey: z.string().trim().min(8).max(200).optional(),
});
export const stepsUpsertSchema = z.object({
  day: z.string().datetime({ offset: true }),
  steps: z.number().int().nonnegative(),
  source: z.enum([
    'MANUAL',
    'WECHAT',
    'APPLE_HEALTH',
    'ANDROID_HEALTH',
    'IMPORT',
    'OTHER',
  ]),
  idempotencyKey: z.string().trim().min(8).max(200).optional(),
});
export const mediaRegisterSchema = z.object({
  storageKey: z.string().trim().min(1).max(1_000),
  contentType: z
    .string()
    .trim()
    .regex(/^[\w.-]+\/[\w.+-]+$/),
  bytes: z.number().int().nonnegative(),
  sha256: z
    .string()
    .regex(/^[a-f0-9]{64}$/i)
    .nullable()
    .optional(),
  width: z.number().int().positive().nullable().optional(),
  height: z.number().int().positive().nullable().optional(),
  durationMs: z.number().int().nonnegative().nullable().optional(),
  originalFilename: z.string().max(255).nullable().optional(),
  metadata: z.record(z.string(), z.unknown()).optional(),
  idempotencyKey: z.string().trim().min(8).max(200).optional(),
});
export const offlineMutationSchema = z.object({
  clientMutationId: z.string().trim().min(1).max(200),
  entityType: z.enum([
    'ENTRY',
    'HISTORY',
    'FITNESS',
    'DAILY_PACK',
    'MEDIA',
    'STEPS',
    'BODY_METRIC',
  ]),
  entityId: idSchema.nullable().optional(),
  operation: z.enum(['CREATE', 'UPDATE', 'TRASH', 'RESTORE', 'DELETE']),
  payload: z.record(z.string(), z.unknown()),
  baseRevision: z.number().int().positive().nullable().optional(),
});

// Root/Admin and Channel contracts.  These schemas are transport boundaries;
// actor identity, ownership, status, timestamps, and capabilities are always
// derived by the server-side Admin API.  In particular, no consumer input
// schema accepts `adminType: ORIGINAL_DEVELOPER_ROOT` or an owner override.
export const adminTypeSchema = z.enum([
  'ORIGINAL_DEVELOPER_ROOT',
  'ADMIN',
  'MODERATOR',
  'SUPPORT',
]);
export const adminIdentityStatusSchema = z.enum(['ACTIVE', 'SUSPENDED', 'REVOKED']);
export const adminCapabilityCodeSchema = z.enum([
  'ROOT_READ_USER_DATA',
  'ROOT_READ_SENSITIVE_DATA',
  'ROOT_READ_PRIVATE_MESSAGES',
  'ROOT_READ_AI_USAGE',
  'ROOT_MODIFY_USER_DATA',
  'ROOT_DELETE_USER_DATA',
  'ROOT_EXPORT_USER_DATA',
  'ROOT_BULK_EXPORT',
  'ROOT_MANAGE_CHANNELS',
  'ROOT_MANAGE_MEMBERSHIP',
  'ROOT_MANAGE_ENTITLEMENTS',
  'ROOT_MANAGE_BENEFITS',
  'ROOT_MANAGE_FEATURE_FLAGS',
  'ROOT_VIEW_AUDIT',
]);
export const adminAccessActionSchema = z.enum([
  'VIEW_USER',
  'READ_PROFILE',
  'READ_LIFE',
  'READ_TIMELINE',
  'READ_HISTORY',
  'READ_FITNESS',
  'READ_BODY_METRICS',
  'READ_STEPS',
  'READ_DAILY_PACK',
  'READ_MEDIA',
  'READ_AI_USAGE',
  'READ_DEVICES',
  'READ_COMMUNITY',
  'READ_CHANNEL',
  'READ_MEMBERSHIP',
  'READ_SECURITY_METADATA',
  'READ_MESSAGE',
  'EXPORT_USER_DATA',
  'ADMIN_REVISION',
  'DELETE_USER_DATA',
]);

/** A server-authorized Admin data read/write request; actor is never client supplied. */
export const adminAccessRequestSchema = z.object({
  targetUserId: idSchema,
  resourceType: z.string().trim().min(1).max(120),
  resourceId: idSchema.optional(),
  action: adminAccessActionSchema,
  reason: z.string().trim().max(2_000).optional(),
});

/** Capability grants are accepted only by the separately authenticated Admin API. */
export const adminCapabilityGrantSchema = z.object({
  adminIdentityId: idSchema,
  capability: adminCapabilityCodeSchema,
  reason: z.string().trim().min(1).max(2_000),
});

/** Membership simulation changes entitlements only; it never changes payment or root state. */
export const membershipSimulationSchema = z.object({
  planCode: planCodeSchema,
});

export const channelTypeSchema = z.enum([
  'OFFICIAL',
  'COMMUNITY',
  'BETA',
  'FEEDBACK',
  'EVENT',
  'CREATOR',
  'DEVELOPER',
]);
export const founderAudienceSchema = z.enum([
  'FOUNDER_PUBLIC',
  'FOUNDER_FREE',
  'FOUNDER_GO',
  'FOUNDER_PLUS',
  'FOUNDER_PRO',
  'FOUNDER_PRO_MAX',
]);
export const channelVisibilitySchema = z.enum([
  'PRIVATE',
  'COMMUNITY',
  'GROUP',
  'DIRECT_SHARE',
  'PUBLIC',
]);
export const channelPublicationVisibilitySchema = z.enum([
  'COMMUNITY',
  'GROUP',
  'DIRECT_SHARE',
  'PUBLIC',
]);

/** Creates a channel owned by the authenticated principal; ownerId is server derived. */
export const channelCreateSchema = z.object({
  type: channelTypeSchema,
  slug: z
    .string()
    .trim()
    .min(1)
    .max(120)
    .regex(/^[a-z0-9][a-z0-9-]*$/),
  name: z.string().trim().min(1).max(240),
  description: z.string().trim().max(5_000).optional(),
  visibility: channelVisibilitySchema.default('PUBLIC'),
  founderAudience: founderAudienceSchema.nullable().optional(),
});

export const channelMembershipChangeSchema = z.object({
  channelId: idSchema,
  action: z.enum(['JOIN', 'LEAVE', 'ACCEPT_INVITE', 'DECLINE_INVITE']),
});

/**
 * Explicitly publishes selected fields from an owner record into a new
 * snapshot. This is a transport boundary: raw selectedContent is forbidden;
 * the server reads the authorized source revision and performs the projection.
 */
export const channelSnapshotCreateSchema = z.object({
  channelId: idSchema,
  sourceEntryId: idSchema,
  sourceRevision: z.number().int().positive(),
  selectedFieldKeys: z
    .array(z.enum(['title', 'body', 'occurredAt', 'timezone', 'tags']))
    .min(1)
    .max(5)
    .optional(),
  selectedMediaIds: z.array(idSchema).max(12).optional(),
  visibility: channelPublicationVisibilitySchema,
  founderAudience: founderAudienceSchema.nullable().optional(),
});

/** A post may be a direct authored body or reference an explicit channel snapshot. */
export const channelPostCreateSchema = z
  .object({
    channelId: idSchema,
    snapshotId: idSchema.optional(),
    body: z.string().trim().max(50_000).optional(),
    visibility: channelPublicationVisibilitySchema.default('COMMUNITY'),
  })
  .refine((value) => value.snapshotId !== undefined || Boolean(value.body), {
    message: 'channel post requires an explicit snapshot or non-empty body',
    path: ['body'],
  });

// ---------------------------------------------------------------------------
// Phase 4 Community transport schemas
// ---------------------------------------------------------------------------
// Actor identity, plan, root authority, visibility overrides, moderation
// status, ownership, timestamps and counters are all server-derived. These
// request schemas deliberately never accept them from a consumer client.

export const communityVisibilitySchema = z.enum([
  'COMMUNITY',
  'GROUP',
  'DIRECT_SHARE',
  'PUBLIC',
]);
export const communityFeedModeSchema = z.enum(['DISCOVER', 'FOLLOWING', 'LATEST']);
export const communityReactionTypeSchema = z.enum(['LIKE']);
export const communityMediaReferenceSchema = z.object({
  mediaId: idSchema,
  kind: z.enum(['IMAGE', 'VIDEO']),
  altText: z.string().trim().max(500).nullable().optional(),
});
export const communityPaginationSchema = z.object({
  cursor: z.string().trim().min(1).max(1_000).optional(),
  limit: z.coerce.number().int().min(1).max(100).optional(),
});

export const communitySnapshotCreateSchema = z.object({
  sourceEntryId: idSchema,
  sourceRevision: z.number().int().positive().optional(),
  /** Field names only: clients never submit a private original body as publication content. */
  selectedFieldKeys: z
    .array(z.enum(['title', 'body', 'occurredAt', 'timezone', 'tags']))
    .min(1)
    .max(5)
    .optional(),
  selectedMediaIds: z.array(idSchema).max(12).optional(),
  target: z
    .object({
      visibility: communityVisibilitySchema.default('COMMUNITY'),
      groupId: idSchema.nullable().optional(),
      channelId: idSchema.nullable().optional(),
    })
    .optional(),
});

export const communityPostCreateSchema = z
  .object({
    body: z.string().trim().max(50_000).optional(),
    mediaIds: z.array(idSchema).max(12).optional(),
    archiveSnapshotId: idSchema.optional(),
    groupId: idSchema.optional(),
    channelId: idSchema.optional(),
    activityId: idSchema.optional(),
    visibility: communityVisibilitySchema.default('COMMUNITY'),
    /** Recipient identities are opaque IDs; the service still re-authorizes them server-side. */
    directShareRecipientIds: z.array(idSchema).min(1).max(100).optional(),
  })
  .refine(
    (value) =>
      Boolean(value.body) ||
      (value.mediaIds?.length ?? 0) > 0 ||
      value.archiveSnapshotId !== undefined,
    {
      message: 'community post requires text, media, or an explicit published snapshot',
    },
  )
  .refine((value) => !(value.groupId !== undefined && value.visibility !== 'GROUP'), {
    message: 'group post visibility must be GROUP',
    path: ['visibility'],
  })
  .refine(
    (value) =>
      value.visibility === 'DIRECT_SHARE'
        ? (value.directShareRecipientIds?.length ?? 0) > 0
        : value.directShareRecipientIds === undefined,
    {
      message: 'direct-share posts require explicit recipients',
      path: ['directShareRecipientIds'],
    },
  )
  .superRefine((value, context) => {
    const recipients = value.directShareRecipientIds;
    if (recipients !== undefined && new Set(recipients).size !== recipients.length) {
      context.addIssue({
        code: 'custom',
        message: 'direct-share recipients must be unique',
        path: ['directShareRecipientIds'],
      });
    }
  });

export const communityPostPatchSchema = z
  .object({
    body: z.string().trim().max(50_000).nullable().optional(),
    mediaIds: z.array(idSchema).max(12).optional(),
  })
  .refine(
    (value) =>
      value.body !== null ||
      (value.mediaIds?.length ?? 0) > 0 ||
      value.body === undefined,
    { message: 'a post cannot be emptied without media' },
  );

/** Quote commentary is separate from the referenced, already-published post. */
export const communityQuoteCreateSchema = z
  .object({
    commentary: z.string().trim().max(50_000).nullable().optional(),
  })
  .strict();

export const communityCommentCreateSchema = z.object({
  body: z.string().trim().min(1).max(10_000),
});
export const communityCommentPatchSchema = z.object({
  body: z.string().trim().min(1).max(10_000),
});

export const communityGroupVisibilitySchema = z.enum([
  'PUBLIC',
  'PRIVATE',
  'INVITE_ONLY',
]);
export const communityGroupCreateSchema = z.object({
  name: z.string().trim().min(1).max(240),
  description: z.string().trim().max(5_000).nullable().optional(),
  avatarMediaId: idSchema.nullable().optional(),
  coverMediaId: idSchema.nullable().optional(),
  visibility: communityGroupVisibilitySchema.default('PUBLIC'),
});
export const communityGroupMembershipActionSchema = z.object({
  action: z.enum([
    'JOIN',
    'LEAVE',
    'APPROVE',
    'REMOVE',
    'BAN',
    'INVITE',
    'ACCEPT_INVITE',
  ]),
  userId: idSchema.optional(),
});
export const communityGroupOwnershipTransferSchema = z.object({
  nextOwnerUserId: idSchema,
});

export const communityChannelCreateSchema = z.object({
  type: channelTypeSchema,
  slug: z
    .string()
    .trim()
    .min(1)
    .max(120)
    .regex(/^[a-z0-9][a-z0-9-]*$/),
  name: z.string().trim().min(1).max(240),
  description: z.string().trim().max(5_000).nullable().optional(),
  visibility: communityVisibilitySchema.default('PUBLIC'),
  founderAudience: founderAudienceSchema.nullable().optional(),
});
export const communityChannelPostCreateSchema = z
  .object({
    body: z.string().trim().max(50_000).optional(),
    mediaIds: z.array(idSchema).max(12).optional(),
    archiveSnapshotId: idSchema.optional(),
    visibility: communityVisibilitySchema.default('COMMUNITY'),
    founderAudience: founderAudienceSchema.nullable().optional(),
  })
  .refine(
    (value) =>
      Boolean(value.body) ||
      (value.mediaIds?.length ?? 0) > 0 ||
      value.archiveSnapshotId !== undefined,
    { message: 'channel post requires text, media, or an explicit published snapshot' },
  );
export const communityChannelMembershipActionSchema = z.object({
  action: z.enum(['JOIN', 'LEAVE']),
});

export const communityActivityCreateSchema = z
  .object({
    groupId: idSchema.nullable().optional(),
    channelId: idSchema.nullable().optional(),
    kind: z.enum(['ONLINE', 'OFFLINE', 'COMMUNITY', 'FOUNDER', 'GROUP']),
    title: z.string().trim().min(1).max(240),
    description: z.string().trim().max(20_000).nullable().optional(),
    startAt: z.string().datetime({ offset: true }),
    endAt: z.string().datetime({ offset: true }).nullable().optional(),
    timezone: timezoneSchema,
    locationText: z.string().trim().max(1_000).nullable().optional(),
    onlineUrl: z.string().url().max(2_000).nullable().optional(),
    capacity: z.number().int().positive().max(100_000).nullable().optional(),
    visibility: communityVisibilitySchema.default('COMMUNITY'),
    founderAudience: founderAudienceSchema.nullable().optional(),
  })
  .refine(
    (value) =>
      value.endAt === undefined ||
      value.endAt === null ||
      Date.parse(value.endAt) >= Date.parse(value.startAt),
    { message: 'endAt must not precede startAt', path: ['endAt'] },
  );
export const communityActivityRegistrationActionSchema = z.object({
  action: z.enum(['JOIN', 'CANCEL']),
});

export const communityProfilePatchSchema = z.object({
  displayName: z.string().trim().min(1).max(120).optional(),
  avatarMediaId: idSchema.nullable().optional(),
  bio: z.string().trim().max(1_000).nullable().optional(),
  profileVisibility: z.enum(['PUBLIC', 'PRIVATE']).optional(),
  followPermission: z.enum(['EVERYONE', 'NOBODY']).optional(),
});

export const communityReportCreateSchema = z.object({
  targetType: z.enum(['POST', 'COMMENT', 'USER', 'GROUP', 'CHANNEL', 'ACTIVITY']),
  targetId: idSchema,
  reason: z.enum([
    'SPAM',
    'HARASSMENT',
    'HATE',
    'SEXUAL',
    'VIOLENCE',
    'SCAM',
    'MISINFORMATION',
    'PRIVACY',
    'COPYRIGHT',
    'OTHER',
  ]),
  details: z.string().trim().max(4_000).nullable().optional(),
});

/** Admin boundary only: the transport must resolve a server-authenticated moderator/root. */
export const communityModerationActionSchema = z.object({
  action: z.enum([
    'HIDE_CONTENT',
    'REMOVE_CONTENT',
    'WARN_USER',
    'SUSPEND_USER',
    'BAN_USER',
    'RESTORE_CONTENT',
  ]),
  reason: z.string().trim().min(1).max(2_000),
});

// ---------------------------------------------------------------------------
// Phase 5 Messaging transport schemas
// ---------------------------------------------------------------------------
// Actor identity, membership role, Root authority, sequence, status,
// timestamps and media metadata are all server-derived. A client may submit an
// opaque media id, but the messaging service re-authorizes it before storing a
// reference. No request schema accepts a principal, plan, admin identity, or
// arbitrary participant list.

export const messagingPaginationSchema = z.object({
  cursor: z.string().trim().min(1).max(1_000).optional(),
  limit: z.coerce.number().int().min(1).max(100).optional(),
  beforeSequence: z.coerce.number().int().nonnegative().optional(),
});

export const messagingDirectConversationCreateSchema = z.object({
  recipientUserId: idSchema,
}).strict();

export const messagingRequestResolveSchema = z.object({
  action: z.enum(['ACCEPT', 'REJECT']),
});

export const messagingGroupConversationCreateSchema = z.object({
  groupId: idSchema,
});

const messagingMediaIdsSchema = z
  .array(idSchema)
  .max(12)
  .superRefine((value, context) => {
    if (new Set(value).size !== value.length) {
      context.addIssue({ code: 'custom', message: 'mediaIds must be unique' });
    }
  });

/** clientMessageId is generated before an offline enqueue and must be reused
 * for every retry of that exact outbox item. */
export const messagingMessageCreateSchema = z
  .object({
    clientMessageId: idSchema,
    body: z.string().trim().min(1).max(10_000).optional(),
    mediaIds: messagingMediaIdsSchema.optional(),
    replyToMessageId: idSchema.nullable().optional(),
  })
  .refine((value) => value.body !== undefined || (value.mediaIds?.length ?? 0) > 0, {
    message: 'a message requires text or at least one authorized media reference',
  });

export const messagingMessagePatchSchema = z
  .object({
    body: z.string().trim().min(1).max(10_000).nullable().optional(),
    mediaIds: messagingMediaIdsSchema.optional(),
  })
  .refine(
    (value) =>
      (value.body !== undefined && value.body !== null) ||
      (value.mediaIds !== undefined && value.mediaIds.length > 0),
    {
      message:
        'an edited message requires text or at least one authorized media reference',
    },
  );

export const messagingReactionSchema = z.object({
  type: z.enum(['LIKE', 'LOVE', 'LAUGH', 'SURPRISED', 'SAD', 'THANKS']),
});

export const messagingReadSchema = z.object({
  sequence: z.number().int().nonnegative(),
});

export const messagingDraftSchema = z.object({
  body: z.string().trim().max(10_000).nullable().optional(),
  mediaIds: messagingMediaIdsSchema.optional(),
  replyToMessageId: idSchema.nullable().optional(),
});

export const messagingUserSettingsPatchSchema = z
  .object({
    directMessagePolicy: z.enum(['EVERYONE', 'NOBODY']).optional(),
    readReceiptsEnabled: z.boolean().optional(),
    notificationLevel: z.enum(['ALL', 'MENTIONS', 'NONE']).optional(),
  })
  .refine((value) => Object.keys(value).length > 0, {
    message: 'at least one messaging setting is required',
  });

export const messagingConversationPreferencesSchema = z
  .object({
    mutedUntil: z.string().datetime({ offset: true }).nullable().optional(),
    pinned: z.boolean().optional(),
    archived: z.boolean().optional(),
  })
  .refine((value) => Object.keys(value).length > 0, {
    message: 'at least one conversation preference is required',
  });

/** Typing is an ephemeral, rate-limited transport signal. It never carries
 * draft text or a client-supplied participant. */
export const messagingTypingSchema = z.object({
  active: z.boolean(),
});

/** Presence can only update the authenticated session's own state. */
export const messagingPresenceSchema = z.object({
  status: z.enum(['ONLINE', 'AWAY', 'OFFLINE']),
  ttlMs: z.number().int().min(1_000).max(300_000).optional(),
});

export const messagingSearchSchema = z.object({
  q: z.string().trim().min(1).max(200),
});

export const messagingBlockSchema = z.object({
  userId: idSchema,
});

export const messagingReportCreateSchema = z.object({
  reason: z.enum([
    'SPAM',
    'HARASSMENT',
    'HATE',
    'SEXUAL',
    'VIOLENCE',
    'SCAM',
    'PRIVACY',
    'OTHER',
  ]),
  details: z.string().trim().max(4_000).nullable().optional(),
});

/** Admin message reads only accept an audited target. The authenticated Root
 * identity and capability are resolved by the Admin boundary, never JSON. */
export const adminMessagingPrivateReadSchema = z.object({
  targetUserId: idSchema,
  reason: z.string().trim().max(2_000).optional(),
});

// ---------------------------------------------------------------------------
// Phase 6 Membership, Benefits and Payments transport schemas
// ---------------------------------------------------------------------------
// Money, user identity, order state, payment confirmation, entitlement state,
// and administrative authority are always server-derived. Consumer requests
// deliberately cannot submit an amount, `paymentSuccess`, user id, or plan
// override. Provider callbacks are verified by a provider adapter, not zod.

export const membershipPaymentProviderSchema = z.enum([
  'WECHAT_PAY',
  'ALIPAY',
  'UNIONPAY',
  'APPLE_IAP',
  'MOCK',
]);
export const membershipCapabilitySchema = z.enum([
  'ARCHIVE_PRIVATE',
  'MEDIA_BASIC',
  'TIMELINE_PRIVATE',
  'HISTORY_PRIVATE',
  'FITNESS_PRIVATE',
  'MOVEMENT_BASIC',
  'AI_USAGE_BASIC',
  'STATS_BASIC',
  'PROFILE_SELF',
  'DATA_EXPORT',
  'COMMUNITY_READ',
  'COMMUNITY_POST',
  'COMMUNITY_COMMENT',
  'COMMUNITY_GROUP',
  'COMMUNITY_INTERACT',
  'COMMUNITY_PUBLISH',
  'COMMUNITY_FOLLOW',
  'COMMUNITY_SAVE',
  'GROUP_JOIN',
  'GROUP_CREATE',
  'ACTIVITY_JOIN',
  'CHANNEL_PREMIUM_ACCESS',
  'FOUNDER_INBOX_ACCESS',
  'FOUNDER_DM',
  'FOUNDER_PRIORITY_INBOX',
  'FOUNDER_PRO_FEED',
  'FOUNDER_CIRCLE_ACCESS',
  'FOUNDER_CONTACT_REQUEST',
  'CREATOR_LAB_ACCESS',
  'VIBE_CODING_ACCESS',
  'CODE_HUB_ACCESS',
  'CODE_DOWNLOAD_ACCESS',
  'FOUNDER_CURATED_SOCIAL_ACCESS',
  'VIBE_CODING',
  'CODE_HUB',
  'SOURCE_DOWNLOAD',
  'RELEASE_DOWNLOAD',
  'ADVANCED_ANALYTICS',
  'MEDIA_STORAGE_PLUS',
  'SANDBOX_RUNTIME_ACCESS',
  'PROJECT_DEPLOY_ACCESS',
  'PREVIEW_DEPLOY_ACCESS',
  'PRODUCTION_DEPLOY_ACCESS',
  'CUSTOM_DOMAIN_ACCESS',
  'EXTENDED_PREVIEW',
  'DEPLOYMENT_BANDWIDTH',
  'BUILD_MINUTES',
]);

export const membershipCheckoutSchema = z.object({
  planCode: planCodeSchema.exclude(['FREE']),
  provider: membershipPaymentProviderSchema,
  couponCode: z.string().trim().min(3).max(128).optional(),
});

export const membershipCouponRedeemSchema = z.object({
  code: z.string().trim().min(3).max(128),
});

export const membershipRedemptionCodeSchema = z.object({
  code: z.string().trim().min(12).max(256),
});

export const membershipRefundRequestSchema = z.object({
  reason: z.string().trim().min(1).max(1_000),
});

/** Campaign benefit templates are Admin-only. Consumer claim requests are
 * intentionally an empty body plus an opaque campaign id in the URL. */
export const membershipCampaignBenefitSchema = z
  .object({
    type: z.enum([
      'MEMBERSHIP_DAYS',
      'TEMP_ENTITLEMENT',
      'STORAGE_BYTES',
      'BADGE',
      'FEATURE_ACCESS',
    ]),
    capability: membershipCapabilitySchema.nullable().optional(),
    membershipDays: z.number().int().positive().max(3_660).nullable().optional(),
    planCode: planCodeSchema.exclude(['FREE']).nullable().optional(),
    storageBytes: z
      .number()
      .int()
      .positive()
      .max(10_995_116_277_760)
      .nullable()
      .optional(),
    badgeCode: z.string().trim().min(1).max(120).nullable().optional(),
    endsAt: z.string().datetime({ offset: true }).nullable().optional(),
  })
  .superRefine((value, context) => {
    if (
      (value.type === 'TEMP_ENTITLEMENT' || value.type === 'FEATURE_ACCESS') &&
      value.capability === undefined
    ) {
      context.addIssue({
        code: 'custom',
        message: 'feature campaign benefit requires capability',
        path: ['capability'],
      });
    }
    if (
      value.type === 'MEMBERSHIP_DAYS' &&
      (value.membershipDays === undefined || value.planCode === undefined)
    ) {
      context.addIssue({
        code: 'custom',
        message: 'membership campaign benefit requires plan and days',
        path: ['membershipDays'],
      });
    }
    if (value.type === 'STORAGE_BYTES' && value.storageBytes === undefined) {
      context.addIssue({
        code: 'custom',
        message: 'storage campaign benefit requires bytes',
        path: ['storageBytes'],
      });
    }
    if (value.type === 'BADGE' && value.badgeCode === undefined) {
      context.addIssue({
        code: 'custom',
        message: 'badge campaign benefit requires badgeCode',
        path: ['badgeCode'],
      });
    }
  });

export const membershipCampaignClaimSchema = z.object({}).strict();

export const membershipAdminCampaignCreateSchema = z
  .object({
    code: z
      .string()
      .trim()
      .min(3)
      .max(80)
      .regex(/^[A-Z0-9][A-Z0-9_-]*$/),
    audience: z.enum([
      'ALL_USERS',
      'NEW_USERS',
      'FREE_USERS',
      'GO_USERS',
      'PLUS_USERS',
      'PRO_USERS',
      'PRO_MAX_USERS',
      'SELECTED_USERS',
      'INVITED_USERS',
    ]),
    benefits: z.array(membershipCampaignBenefitSchema).min(1).max(20),
    /** Opaque targets are accepted only by the separately authenticated Admin
     * route for SELECTED_USERS; they are never returned to customers. */
    targetUserIds: z.array(idSchema).min(1).max(10_000).optional(),
    startsAt: z.string().datetime({ offset: true }),
    endsAt: z.string().datetime({ offset: true }).nullable().optional(),
  })
  .superRefine((value, context) => {
    if (
      value.endsAt !== undefined &&
      value.endsAt !== null &&
      Date.parse(value.endsAt) <= Date.parse(value.startsAt)
    ) {
      context.addIssue({
        code: 'custom',
        message: 'campaign end must be after start',
        path: ['endsAt'],
      });
    }
    if (
      value.audience === 'SELECTED_USERS' &&
      (value.targetUserIds === undefined || value.targetUserIds.length === 0)
    ) {
      context.addIssue({
        code: 'custom',
        message: 'selected campaign requires targets',
        path: ['targetUserIds'],
      });
    }
    if (value.audience !== 'SELECTED_USERS' && value.targetUserIds !== undefined) {
      context.addIssue({
        code: 'custom',
        message: 'targets are only valid for selected campaigns',
        path: ['targetUserIds'],
      });
    }
    if (
      value.targetUserIds !== undefined &&
      new Set(value.targetUserIds).size !== value.targetUserIds.length
    ) {
      context.addIssue({
        code: 'custom',
        message: 'campaign targets must be unique',
        path: ['targetUserIds'],
      });
    }
    for (const [index, benefit] of value.benefits.entries()) {
      if (
        benefit.endsAt !== undefined &&
        benefit.endsAt !== null &&
        Date.parse(benefit.endsAt) <= Date.parse(value.startsAt)
      ) {
        context.addIssue({
          code: 'custom',
          message: 'campaign benefit end must be after campaign start',
          path: ['benefits', index, 'endsAt'],
        });
      }
    }
  });

export const membershipAdminCampaignStatusSchema = z.object({
  status: z.enum(['DRAFT', 'SCHEDULED', 'ACTIVE', 'PAUSED', 'ENDED', 'CANCELLED']),
  reason: z.string().trim().min(1).max(2_000),
});

export const membershipAdminCouponCreateSchema = z
  .object({
    code: z
      .string()
      .trim()
      .min(3)
      .max(80)
      .regex(/^[A-Z0-9][A-Z0-9_-]*$/),
    discountKind: z.enum(['FIXED_FEN', 'PERCENTAGE']),
    discountValue: z.number().int().positive(),
    applicablePlans: z
      .array(planCodeSchema.exclude(['FREE']))
      .min(1)
      .max(4),
    maxRedemptions: z.number().int().positive().nullable().optional(),
    startsAt: z.string().datetime({ offset: true }),
    endsAt: z.string().datetime({ offset: true }).nullable().optional(),
    campaignId: idSchema.nullable().optional(),
  })
  .superRefine((value, context) => {
    if (value.discountKind === 'PERCENTAGE' && value.discountValue > 100) {
      context.addIssue({
        code: 'custom',
        message: 'percentage discount cannot exceed 100',
        path: ['discountValue'],
      });
    }
    if (
      value.endsAt !== undefined &&
      value.endsAt !== null &&
      Date.parse(value.endsAt) <= Date.parse(value.startsAt)
    ) {
      context.addIssue({
        code: 'custom',
        message: 'coupon end must be after start',
        path: ['endsAt'],
      });
    }
    if (new Set(value.applicablePlans).size !== value.applicablePlans.length) {
      context.addIssue({
        code: 'custom',
        message: 'applicable plans must be unique',
        path: ['applicablePlans'],
      });
    }
  });

export const membershipAdminRedemptionCodeCreateSchema = z
  .object({
    maxRedemptions: z.number().int().positive().max(1_000_000).default(1),
    startsAt: z.string().datetime({ offset: true }),
    endsAt: z.string().datetime({ offset: true }).nullable().optional(),
    membershipDays: z.number().int().positive().max(3_660).nullable().optional(),
    planCode: planCodeSchema.exclude(['FREE']).nullable().optional(),
    storageBytes: z
      .number()
      .int()
      .positive()
      .max(10_995_116_277_760)
      .nullable()
      .optional(),
    capability: membershipCapabilitySchema.nullable().optional(),
    badgeCode: z.string().trim().min(1).max(120).nullable().optional(),
  })
  .refine(
    (value) =>
      value.membershipDays !== undefined ||
      value.storageBytes !== undefined ||
      value.capability !== undefined ||
      value.badgeCode !== undefined,
    { message: 'a redemption code needs at least one benefit' },
  )
  .refine(
    (value) =>
      value.endsAt === undefined ||
      value.endsAt === null ||
      Date.parse(value.endsAt) > Date.parse(value.startsAt),
    {
      message: 'redemption code end must be after start',
      path: ['endsAt'],
    },
  );

export const membershipAdminBenefitGrantSchema = z
  .object({
    targetUserId: idSchema,
    type: z.enum([
      'MEMBERSHIP_DAYS',
      'TEMP_ENTITLEMENT',
      'STORAGE_BYTES',
      'COUPON',
      'BADGE',
      'FEATURE_ACCESS',
    ]),
    capability: membershipCapabilitySchema.nullable().optional(),
    membershipDays: z.number().int().positive().max(3_660).nullable().optional(),
    planCode: planCodeSchema.exclude(['FREE']).nullable().optional(),
    storageBytes: z
      .number()
      .int()
      .positive()
      .max(10_995_116_277_760)
      .nullable()
      .optional(),
    badgeCode: z.string().trim().min(1).max(120).nullable().optional(),
    couponId: idSchema.nullable().optional(),
    campaignId: idSchema.nullable().optional(),
    startsAt: z.string().datetime({ offset: true }).optional(),
    endsAt: z.string().datetime({ offset: true }).nullable().optional(),
    reason: z.string().trim().min(1).max(2_000),
  })
  .superRefine((value, context) => {
    if (
      (value.type === 'TEMP_ENTITLEMENT' || value.type === 'FEATURE_ACCESS') &&
      value.capability === undefined
    ) {
      context.addIssue({
        code: 'custom',
        message: 'feature grants require capability',
        path: ['capability'],
      });
    }
    if (value.type === 'MEMBERSHIP_DAYS' && value.membershipDays === undefined) {
      context.addIssue({
        code: 'custom',
        message: 'membership grant requires days',
        path: ['membershipDays'],
      });
    }
    if (value.type === 'STORAGE_BYTES' && value.storageBytes === undefined) {
      context.addIssue({
        code: 'custom',
        message: 'storage grant requires bytes',
        path: ['storageBytes'],
      });
    }
    if (value.type === 'BADGE' && value.badgeCode === undefined) {
      context.addIssue({
        code: 'custom',
        message: 'badge grant requires badgeCode',
        path: ['badgeCode'],
      });
    }
    if (
      value.endsAt !== undefined &&
      value.endsAt !== null &&
      value.startsAt !== undefined &&
      Date.parse(value.endsAt) <= Date.parse(value.startsAt)
    ) {
      context.addIssue({
        code: 'custom',
        message: 'benefit end must be after start',
        path: ['endsAt'],
      });
    }
  });

export const membershipAdminBenefitRevokeSchema = z.object({
  reason: z.string().trim().min(1).max(2_000),
});

// ---------------------------------------------------------------------------
// Phase 7 AI Usage transport schemas
// ---------------------------------------------------------------------------
// These strict boundaries are intentionally metadata-only.  No schema below
// permits a user id, a client-selected collection source, prompts, responses,
// clipboard/keystroke content, cookies/tokens, page body, raw domain, or URL.

export const aiUsageDeviceTypeSchema = z.enum(['WINDOWS_AGENT', 'BROWSER_EXTENSION']);
export const aiUsageAppCodeSchema = z.enum([
  'CHATGPT',
  'CODEX',
  'CLAUDE',
  'GEMINI',
  'COPILOT',
  'CURSOR',
  'CLAUDE_CODE',
  'PERPLEXITY',
  'OTHER_AI',
]);
export const aiUsageActivityHashSchema = z.string().regex(/^sha256:[a-f0-9]{64}$/iu);
export const aiUsageClientIdSchema = z
  .string()
  .trim()
  .min(8)
  .max(200)
  .regex(/^[A-Za-z0-9_-]+$/u);
const aiUsageSecondsSchema = z.number().int().min(0).max(86_400);
const aiUsageTimestampSchema = z.string().datetime({ offset: true });

export const aiUsagePreferencesPatchSchema = z
  .object({
    enabled: z.boolean().optional(),
    windowsAgentEnabled: z.boolean().optional(),
    browserExtensionEnabled: z.boolean().optional(),
    idleThresholdSeconds: z.number().int().min(30).max(3_600).optional(),
    timezone: timezoneSchema.optional(),
  })
  .strict()
  .refine((value) => Object.keys(value).length > 0, {
    message: 'at least one AI Usage preference is required',
  });

/** Pairing is initiated by the authenticated account owner.  `deviceType` is
 * constrained to the approved collectors; it never grants a user identity to
 * the device client. */
export const aiUsagePairingCreateSchema = z
  .object({
    deviceType: aiUsageDeviceTypeSchema,
    deviceLabel: z.string().trim().min(1).max(120).optional(),
  })
  .strict();

/** This is the only device-side pairing payload. The pairing id is in the
 * route and the one-time code is verified against a server-side hash. */
export const aiUsagePairingCompleteSchema = z
  .object({
    pairingCode: z
      .string()
      .trim()
      .min(8)
      .max(64)
      .regex(/^[A-Z0-9_-]+$/u),
    deviceLabel: z.string().trim().min(1).max(120).optional(),
  })
  .strict();

export const aiUsageBatchEventSchema = z
  .object({
    clientEventId: aiUsageClientIdSchema,
    appCode: aiUsageAppCodeSchema,
    /** Opaque, locally-derived digest used solely for source precedence. It
     * must be a SHA-256 representation, never a raw hostname or URL. */
    activityHash: aiUsageActivityHashSchema,
    startedAt: aiUsageTimestampSchema,
    endedAt: aiUsageTimestampSchema,
    activeSeconds: aiUsageSecondsSchema,
    idleSeconds: aiUsageSecondsSchema,
  })
  .strict()
  .superRefine((value, context) => {
    const elapsedSeconds =
      (Date.parse(value.endedAt) - Date.parse(value.startedAt)) / 1_000;
    if (
      !Number.isFinite(elapsedSeconds) ||
      elapsedSeconds <= 0 ||
      elapsedSeconds > 86_400
    ) {
      context.addIssue({
        code: 'custom',
        message: 'usage event interval must be within one day',
        path: ['endedAt'],
      });
      return;
    }
    if (value.activeSeconds + value.idleSeconds > Math.ceil(elapsedSeconds) + 1) {
      context.addIssue({
        code: 'custom',
        message: 'usage seconds exceed event interval',
        path: ['activeSeconds'],
      });
    }
  });

/** Offline retry identity is scoped by the authenticated device credential,
 * not a client-provided user id. */
export const aiUsageBatchIngestSchema = z
  .object({
    batchId: aiUsageClientIdSchema,
    events: z.array(aiUsageBatchEventSchema).min(1).max(500),
  })
  .strict()
  .superRefine((value, context) => {
    const ids = value.events.map((event) => event.clientEventId);
    if (new Set(ids).size !== ids.length) {
      context.addIssue({
        code: 'custom',
        message: 'usage batch event ids must be unique',
        path: ['events'],
      });
    }
  });

export const aiUsageSessionCorrectionSchema = z
  .object({
    startedAt: aiUsageTimestampSchema.optional(),
    endedAt: aiUsageTimestampSchema.optional(),
    activeSeconds: aiUsageSecondsSchema.optional(),
    idleSeconds: aiUsageSecondsSchema.optional(),
    reason: z.string().trim().min(1).max(500),
  })
  .strict()
  .superRefine((value, context) => {
    if (
      value.startedAt === undefined &&
      value.endedAt === undefined &&
      value.activeSeconds === undefined &&
      value.idleSeconds === undefined
    ) {
      context.addIssue({
        code: 'custom',
        message: 'a session correction needs a changed field',
      });
    }
    if (
      value.startedAt !== undefined &&
      value.endedAt !== undefined &&
      Date.parse(value.endedAt) <= Date.parse(value.startedAt)
    ) {
      context.addIssue({
        code: 'custom',
        message: 'correction end must be after start',
        path: ['endedAt'],
      });
    }
  });

export const aiUsageSessionDeleteSchema = z
  .object({ reason: z.string().trim().min(1).max(500) })
  .strict();

export const aiUsageRangeDeleteSchema = z
  .object({
    from: aiUsageTimestampSchema,
    to: aiUsageTimestampSchema,
    reason: z.string().trim().min(1).max(500),
    idempotencyKey: aiUsageClientIdSchema,
  })
  .strict()
  .refine((value) => Date.parse(value.to) >= Date.parse(value.from), {
    message: 'delete range end must not precede start',
    path: ['to'],
  });

/** Mini-program/manual entry is intentionally separate from device ingest so
 * a client cannot choose a collector source or impersonate a paired device. */
const aiUsageManualSessionFieldsSchema = z
  .object({
    appCode: aiUsageAppCodeSchema,
    startedAt: aiUsageTimestampSchema,
    endedAt: aiUsageTimestampSchema,
    activeSeconds: aiUsageSecondsSchema,
    idleSeconds: aiUsageSecondsSchema.default(0),
    idempotencyKey: aiUsageClientIdSchema,
  })
  .strict();

export const aiUsageManualSessionCreateSchema =
  aiUsageManualSessionFieldsSchema.superRefine((value, context) => {
    const elapsedSeconds =
      (Date.parse(value.endedAt) - Date.parse(value.startedAt)) / 1_000;
    if (
      !Number.isFinite(elapsedSeconds) ||
      elapsedSeconds <= 0 ||
      elapsedSeconds > 86_400
    ) {
      context.addIssue({
        code: 'custom',
        message: 'manual usage interval must be within one day',
        path: ['endedAt'],
      });
      return;
    }
    if (value.activeSeconds + value.idleSeconds > Math.ceil(elapsedSeconds) + 1) {
      context.addIssue({
        code: 'custom',
        message: 'usage seconds exceed manual interval',
        path: ['activeSeconds'],
      });
    }
  });

/** Import remains metadata-only. `externalRecordId` is an opaque local record
 * key, not a URL, title, prompt, response, or browser history value. */
export const aiUsageImportSessionSchema = aiUsageManualSessionFieldsSchema
  .extend({
    externalRecordId: aiUsageClientIdSchema,
  })
  .strict()
  .superRefine((value, context) => {
    const elapsedSeconds =
      (Date.parse(value.endedAt) - Date.parse(value.startedAt)) / 1_000;
    if (
      !Number.isFinite(elapsedSeconds) ||
      elapsedSeconds <= 0 ||
      elapsedSeconds > 86_400
    ) {
      context.addIssue({
        code: 'custom',
        message: 'import usage interval must be within one day',
        path: ['endedAt'],
      });
      return;
    }
    if (value.activeSeconds + value.idleSeconds > Math.ceil(elapsedSeconds) + 1) {
      context.addIssue({
        code: 'custom',
        message: 'usage seconds exceed import interval',
        path: ['activeSeconds'],
      });
    }
  });

export const aiUsageRangeQuerySchema = z
  .object({
    from: aiUsageTimestampSchema.optional(),
    to: aiUsageTimestampSchema.optional(),
    limit: z.coerce.number().int().min(1).max(500).optional(),
  })
  .strict()
  .refine(
    (value) =>
      value.from === undefined ||
      value.to === undefined ||
      Date.parse(value.to) >= Date.parse(value.from),
    {
      message: 'usage range end must not precede start',
      path: ['to'],
    },
  );

/** Separate Root route only. Actor/capability come from the authenticated
 * server principal; the input supplies a target and optional audit reason. */
export const adminAiUsageReadSchema = z
  .object({
    targetUserId: idSchema,
    reason: z.string().trim().max(2_000).optional(),
  })
  .strict();

// ---------------------------------------------------------------------------
// Phase 8 AI Gateway transport schemas
// ---------------------------------------------------------------------------
// The gateway accepts self-owned invocation content only. Provider identity,
// credential selection, owner, quota, metering, cost, status, and cancellation
// authority are all derived at the trusted server boundary.

export const aiGatewayProviderCodeSchema = z.enum([
  'LOCAL',
  'OPENAI',
  'OPENAI_COMPATIBLE',
  'ANTHROPIC',
  'GOOGLE',
  'CUSTOM',
]);
export const aiGatewayByokProviderCodeSchema = aiGatewayProviderCodeSchema.exclude([
  'LOCAL',
]);
export const aiGatewayCapabilityCodeSchema = z.enum([
  'CHAT_COMPLETION',
  'TEXT_GENERATION',
  'TEXT',
  'VISION',
  'CODE',
  'REASONING',
  'IMAGE_GENERATION',
  'AUDIO_INPUT',
  'AUDIO_OUTPUT',
  'TOOL_CALLING',
  'STRUCTURED_OUTPUT',
  'STREAMING',
  'EMBEDDING',
]);
export const aiGatewayModelCodeSchema = z
  .string()
  .trim()
  .min(2)
  .max(120)
  .regex(/^[A-Z0-9][A-Z0-9_.-]*$/u);
export const aiGatewayClientIdSchema = z
  .string()
  .trim()
  .min(8)
  .max(200)
  .regex(/^[A-Za-z0-9_-]+$/u);

/** Consumers may provide only USER messages. Server-only instructions and
 * generated assistant output never share this transport input shape. */
export const aiGatewayInvocationMessageSchema = z
  .object({
    role: z.literal('USER'),
    content: z.string().trim().min(1).max(50_000),
  })
  .strict();

/** Context is explicit opt-out by default. Phase 8 has no archive/media/
 * message retrieval bridge, so any attempt to request a private source is
 * rejected at the transport boundary. */
export const aiGatewayContextSchema = z
  .object({
    scope: z.literal('NONE'),
  })
  .strict();

export const aiGatewayInvocationCreateSchema = z
  .object({
    modelCode: aiGatewayModelCodeSchema,
    capabilityCode: aiGatewayCapabilityCodeSchema,
    messages: z.array(aiGatewayInvocationMessageSchema).min(1).max(64),
    stream: z.boolean().optional(),
    context: aiGatewayContextSchema.optional(),
    conversationId: idSchema.optional(),
  })
  .strict();

/** Phase 8 creates only a private AI-domain conversation metadata record.
 * No human Messaging identifier, owner id, prompt, response, or provider
 * credential can be supplied by a consumer. */
export const aiGatewayConversationCreateSchema = z
  .object({
    title: z.string().trim().min(1).max(160).optional(),
  })
  .strict();

export const aiGatewayConversationListQuerySchema = z
  .object({
    cursor: aiGatewayClientIdSchema.optional(),
    limit: z.coerce.number().int().min(1).max(100).optional(),
  })
  .strict();

/** Defaults are user-owned registry references only. They cannot carry a
 * credential choice, plan, entitlement, owner or Root override. */
export const aiGatewayPreferencesUpdateSchema = z
  .object({
    defaultProviderCode: aiGatewayProviderCodeSchema.nullable().optional(),
    defaultModelCode: aiGatewayModelCodeSchema.nullable().optional(),
  })
  .strict()
  .refine(
    (value) =>
      value.defaultProviderCode !== undefined || value.defaultModelCode !== undefined,
    'At least one AI Gateway default must be supplied.',
  );

/** Cancellation is idempotency-keyed in the request header and has no client
 * status, owner, provider, cost, or root override fields. */
export const aiGatewayInvocationCancelSchema = z.object({}).strict();

export const aiGatewayInvocationListQuerySchema = z
  .object({
    cursor: aiGatewayClientIdSchema.optional(),
    limit: z.coerce.number().int().min(1).max(100).optional(),
  })
  .strict();

export const aiGatewayInvocationEventQuerySchema = z
  .object({
    afterSequence: z.coerce.number().int().min(0).max(1_000_000).optional(),
    limit: z.coerce.number().int().min(1).max(500).optional(),
  })
  .strict();

/** The encrypted envelope is deliberately opaque to schemas and public
 * projections. Plain API keys, key fingerprints, `secret`, and a user id are
 * rejected because they are not part of this strict shape. */
export const aiGatewayByokEnvelopeSchema = z
  .object({
    algorithm: z.enum(['RSA-OAEP-256', 'X25519-AES-GCM']),
    keyId: z
      .string()
      .trim()
      .min(1)
      .max(120)
      .regex(/^[A-Za-z0-9_.-]+$/u),
    ciphertext: z
      .string()
      .trim()
      .min(32)
      .max(65_536)
      .regex(/^[A-Za-z0-9_-]+={0,2}$/u),
  })
  .strict();

export const aiGatewayByokConfigureSchema = z
  .object({
    encryptedEnvelope: aiGatewayByokEnvelopeSchema,
  })
  .strict();

/** Server-admin inputs remain separate from the consumer gateway contract.
 * Actor identity/capability are derived by the Admin API, never supplied here. */
export const aiGatewayAdminRegistryStatusSchema = z.enum([
  'ACTIVE',
  'DEGRADED',
  'DISABLED',
  'UNAVAILABLE',
  'CONFIG_REQUIRED',
  'DEPRECATED',
]);

export const aiGatewayAdminRegistryUpdateSchema = z
  .object({
    status: aiGatewayAdminRegistryStatusSchema,
    reason: z.string().trim().min(1).max(2_000),
  })
  .strict();

/** Root can submit only a managed-secret locator, never the provider secret
 * itself. The narrow `scheme:identifier` form rejects typical raw key values,
 * whitespace and serialized credential blobs. */
export const aiGatewayAdminSystemCredentialReferenceSchema = z
  .object({
    secretReference: z
      .string()
      .trim()
      .min(4)
      .max(500)
      .regex(/^[A-Za-z][A-Za-z0-9_-]{1,63}:[A-Za-z0-9_./-]{1,420}$/u),
    reason: z.string().trim().min(1).max(2_000),
  })
  .strict();

// ---------------------------------------------------------------------------
// Phase 9 Personal AI transport schemas
// ---------------------------------------------------------------------------
// All request shapes are strict. In particular, `ownerId`, `ownerUserId`,
// `root`, `adminType`, `planCode`, and private message fields cannot cross the
// consumer boundary. Ownership is derived from the authenticated principal.

export const personalAiScopeSchema = z.enum([
  'NONE',
  'SELECTED_ENTRY',
  'SELECTED_ENTRIES',
  'CURRENT_DAY',
  'DATE_RANGE',
  'LIFE',
  'TIMELINE',
  'HISTORY',
  'FITNESS',
  'DAILY_PACK',
  'AI_USAGE',
  'SELECTED_MEDIA',
  'USER_SELECTED_ARCHIVE',
]);
export const personalAiSourceTypeSchema = z.enum([
  'LIFE',
  'TIMELINE',
  'HISTORY',
  'FITNESS',
  'STEPS',
  'DAILY_PACK',
  'AI_USAGE',
  'TAGS',
  'PUBLISHED_SNAPSHOT',
]);
export const personalAiSearchModeSchema = z.enum(['KEYWORD', 'SEMANTIC', 'HYBRID']);
export const personalAiArchiveModeSchema = z.enum([
  'ARCHIVE_ONLY',
  'ARCHIVE_PLUS_GENERAL',
]);
export const personalAiDateRangeSchema = z
  .object({
    from: z.string().datetime({ offset: true }),
    to: z.string().datetime({ offset: true }),
  })
  .strict()
  .refine((value) => Date.parse(value.to) >= Date.parse(value.from), {
    message: 'date range end must not precede start',
    path: ['to'],
  });
export const personalAiQuerySchema = z
  .object({
    question: z.string().trim().min(1).max(12_000),
    scope: personalAiScopeSchema,
    dateRange: personalAiDateRangeSchema.optional(),
    sourceTypes: z.array(personalAiSourceTypeSchema).max(20).optional(),
    selectedEntryIds: z.array(idSchema).max(100).optional(),
    selectedMediaIds: z.array(idSchema).max(100).optional(),
    searchMode: personalAiSearchModeSchema.optional(),
    archiveMode: personalAiArchiveModeSchema.optional(),
    topK: z.number().int().min(1).max(50).optional(),
    contextBudgetTokens: z.number().int().min(128).max(32_000).optional(),
    conversationId: idSchema.optional(),
  })
  .strict()
  .refine((value) => value.scope !== 'DATE_RANGE' || value.dateRange !== undefined, {
    message: 'DATE_RANGE scope requires dateRange',
    path: ['dateRange'],
  })
  .refine(
    (value) =>
      !['SELECTED_ENTRY', 'SELECTED_ENTRIES'].includes(value.scope) ||
      (value.selectedEntryIds?.length ?? 0) > 0,
    {
      message: 'selected entry scopes require selectedEntryIds',
      path: ['selectedEntryIds'],
    },
  )
  .refine(
    (value) =>
      value.scope !== 'SELECTED_MEDIA' || (value.selectedMediaIds?.length ?? 0) > 0,
    {
      message: 'SELECTED_MEDIA scope requires selectedMediaIds',
      path: ['selectedMediaIds'],
    },
  );
export const personalAiPreferencesUpdateSchema = z
  .object({
    enabled: z.boolean().optional(),
    archiveMode: personalAiArchiveModeSchema.optional(),
    defaultScope: personalAiScopeSchema.optional(),
    includeHistoricalRevisions: z.boolean().optional(),
  })
  .strict()
  .refine(
    (value) => Object.keys(value).length > 0,
    'At least one preference must be supplied.',
  );
export const personalAiConsentSchema = z
  .object({ version: z.string().trim().min(1).max(100) })
  .strict();
/** Personal AI export is self-only and metadata-only. The caller may choose
 * only whether to include lifecycle metadata for conversations/deleted
 * insights; it cannot select another owner, source payload, raw vector, or
 * provider credential. */
export const personalAiExportRequestSchema = z
  .object({
    includeConversations: z.boolean().optional(),
    includeDeletedInsights: z.boolean().optional(),
  })
  .strict();
export const personalAiExportStatusSchema = z.enum([
  'PENDING',
  'PROCESSING',
  'READY',
  'FAILED',
  'EXPIRED',
  'DELETED',
]);
export const personalAiExportFormatSchema = z.literal('JSON');
export const personalAiExportListQuerySchema = z
  .object({
    cursor: aiGatewayClientIdSchema.optional(),
    limit: z.coerce.number().int().min(1).max(100).optional(),
  })
  .strict();
export const personalAiIndexJobSchema = z
  .object({
    scope: personalAiScopeSchema,
    dateRange: personalAiDateRangeSchema.optional(),
    sourceTypes: z.array(personalAiSourceTypeSchema).max(20).optional(),
    selectedEntryIds: z.array(idSchema).max(100).optional(),
    selectedMediaIds: z.array(idSchema).max(100).optional(),
    includeHistoricalRevisions: z.boolean().optional(),
  })
  .strict();
export const personalAiIndexJobListQuerySchema = z
  .object({
    cursor: aiGatewayClientIdSchema.optional(),
    limit: z.coerce.number().int().min(1).max(100).optional(),
  })
  .strict();
export const personalAiSourceListQuerySchema = z
  .object({
    scope: personalAiScopeSchema.default('NONE'),
    from: z.string().datetime({ offset: true }).optional(),
    to: z.string().datetime({ offset: true }).optional(),
    sourceTypes: z.string().trim().max(500).optional(),
  })
  .strict()
  .refine(
    (value) =>
      value.from === undefined ||
      value.to === undefined ||
      Date.parse(value.to) >= Date.parse(value.from),
    {
      message: 'source range end must not precede start',
      path: ['to'],
    },
  );
export const personalAiQueryListQuerySchema = z
  .object({
    cursor: aiGatewayClientIdSchema.optional(),
    limit: z.coerce.number().int().min(1).max(100).optional(),
  })
  .strict();
export const personalAiInsightSaveSchema = z
  .object({ title: z.string().trim().max(240).nullable().optional() })
  .strict();
export const personalAiIndexMutationSchema = z.object({}).strict();
export const personalAiConversationCreateSchema = z
  .object({ scope: personalAiScopeSchema.optional() })
  .strict();

// ---------------------------------------------------------------------------
// Phase 10 Creator Lab / Code Hub request schemas
// ---------------------------------------------------------------------------

export const creatorProjectTypeSchema = z.enum([
  'WEB',
  'MINI_PROGRAM',
  'SCRIPT',
  'LIBRARY',
  'DESIGN_CODE',
  'OTHER',
]);
export const creatorProjectVisibilitySchema = z.enum([
  'PRIVATE',
  'UNLISTED',
  'PUBLISHED',
]);
export const creatorRepositorySourceSchema = z.enum([
  'LOCAL',
  'GITHUB',
  'IMPORTED_ZIP',
  'TEMPLATE',
]);
export const creatorPathSchema = z
  .string()
  .trim()
  .min(1)
  .max(512)
  .refine(
    (value) =>
      !value.includes('\0') &&
      !value.includes('\\') &&
      !value.startsWith('/') &&
      !/^(?:\.\.?)(?:\/|$)/u.test(value),
    'workspace path is unsafe',
  )
  .refine(
    (value) =>
      value
        .split('/')
        .every((segment) => segment !== '' && segment !== '.' && segment !== '..'),
    'workspace path contains traversal',
  )
  .refine(
    (value) =>
      !/(^|\/)(?:\.env(?:\.|$)|id_rsa|id_ed25519|credentials?(?:\.|$)|secrets?(?:\.|$))/iu.test(
        value,
      ),
    'sensitive files are not addressable',
  );
export const creatorProjectCreateSchema = z
  .object({
    name: z.string().trim().min(1).max(120),
    description: z.string().max(2_000).default(''),
    type: creatorProjectTypeSchema,
    visibility: creatorProjectVisibilitySchema.default('PRIVATE'),
    template: z.enum(['BLANK', 'REACT_WEB', 'MINI_PROGRAM', 'BASIC_TS']).optional(),
  })
  .strict();
export const creatorProjectListQuerySchema = z
  .object({
    cursor: idSchema.optional(),
    limit: z.coerce.number().int().min(1).max(100).default(50),
  })
  .strict();
export const creatorFileCreateSchema = z
  .object({
    path: creatorPathSchema,
    kind: z.enum(['FILE', 'FOLDER']).default('FILE'),
    content: z.string().max(1_000_000).optional(),
    expectedVersion: z.number().int().min(0).optional(),
  })
  .strict()
  .refine(
    (value) => value.kind === 'FOLDER' || value.content !== undefined,
    'file content is required',
  );
export const creatorFileUpdateSchema = z
  .object({
    path: creatorPathSchema,
    content: z.string().max(1_000_000),
    expectedChecksum: z.string().regex(/^[a-f0-9]{64}$/u),
    expectedVersion: z.number().int().min(0),
  })
  .strict();
export const creatorFileMoveSchema = z
  .object({
    path: creatorPathSchema,
    nextPath: creatorPathSchema,
    expectedVersion: z.number().int().min(0),
  })
  .strict();
export const creatorFileDeleteSchema = z
  .object({ expectedVersion: z.number().int().min(0) })
  .strict();
export const creatorSnapshotSchema = z
  .object({ reason: z.enum(['AI_APPLY', 'IMPORT', 'BULK_EDIT', 'DELETE', 'MANUAL']) })
  .strict();
export const creatorGitCommitSchema = z
  .object({
    message: z.string().trim().min(1).max(240),
    paths: z.array(creatorPathSchema).max(500).default([]),
    expectedVersion: z.number().int().min(0),
  })
  .strict();
export const creatorAiChangeRequestSchema = z
  .object({
    request: z.string().trim().min(1).max(4_000),
    scopePaths: z.array(creatorPathSchema).min(1).max(100),
    expectedVersion: z.number().int().min(0),
    files: z
      .array(
        z
          .object({
            path: creatorPathSchema,
            operation: z.enum(['CREATE', 'UPDATE', 'RENAME', 'MOVE', 'DELETE']),
            nextPath: creatorPathSchema.nullable().optional(),
            expectedChecksum: z
              .string()
              .regex(/^[a-f0-9]{64}$/u)
              .nullable()
              .optional(),
            content: z.string().max(1_000_000).nullable().optional(),
          })
          .strict(),
      )
      .max(100)
      .optional(),
  })
  .strict();
export const creatorApplyChangeSchema = z
  .object({ expectedVersion: z.number().int().min(0) })
  .strict();
export const creatorReleaseCreateSchema = z
  .object({
    version: z
      .string()
      .trim()
      .regex(/^v?\d+\.\d+\.\d+$/u),
    title: z.string().trim().min(1).max(160),
    notes: z.string().max(10_000),
    sourceCommitId: idSchema.nullable().optional(),
  })
  .strict();
export const creatorGithubConnectSchema = z
  .object({
    accountLabel: z.string().trim().min(1).max(120),
    authorizationReference: z.string().trim().min(1).max(256),
  })
  .strict();
export const creatorGithubAuthorizationCompleteSchema = z
  .object({
    code: z.string().trim().min(1).max(10_000),
    state: z.string().trim().min(16).max(512),
  })
  .strict();
export const creatorGithubImportSchema = z
  .object({
    connectionId: idSchema,
    repositoryFullName: z
      .string()
      .trim()
      .regex(/^[A-Za-z0-9_.-]+\/[A-Za-z0-9_.-]+$/u),
    projectName: z.string().trim().min(1).max(120),
  })
  .strict();
export const creatorExportSchema = z.object({}).strict();

// ---------------------------------------------------------------------------
// Phase 20 — Creator ecosystem. All owner, role, plan, release state and
// provider values are derived by the server rather than accepted from clients.
// ---------------------------------------------------------------------------

const creatorEcosystemVisibilitySchema = z.enum(['PRIVATE', 'UNLISTED', 'PUBLIC']);
const creatorSourceVisibilitySchema = z.enum(['PRIVATE', 'OWNER_ONLY', 'ENTITLEMENT_GATED', 'PUBLIC']);
const creatorDownloadVisibilitySchema = z.enum(['DISABLED', 'OWNER_ONLY', 'ENTITLEMENT_GATED', 'PUBLIC']);
const creatorDemoVisibilitySchema = z.enum(['DISABLED', 'PRIVATE', 'ENTITLEMENT_GATED', 'PUBLIC']);
const creatorTagSchema = z.string().trim().min(1).max(64).regex(/^[\p{L}\p{N}][\p{L}\p{N} .+/#_-]*$/u);

export const creatorProfileUpdateSchema = z
  .object({
    username: z.string().trim().min(3).max(40).regex(/^[A-Za-z0-9][A-Za-z0-9_-]*$/u).optional(),
    displayName: z.string().trim().min(1).max(120).optional(),
    avatarMediaId: idSchema.nullable().optional(),
    bio: z.string().trim().max(1_000).nullable().optional(),
    profileVisibility: z.enum(['PUBLIC', 'PRIVATE']).optional(),
  })
  .strict()
  .refine((value) => Object.keys(value).length > 0, 'at least one profile field is required');

export const creatorProjectMetadataUpdateSchema = z
  .object({
    slug: z.string().trim().min(3).max(96).regex(/^[a-z0-9]+(?:-[a-z0-9]+)*$/u).nullable().optional(),
    coverMediaId: idSchema.nullable().optional(),
    tags: z.array(creatorTagSchema).max(20).optional(),
    technologies: z.array(creatorTagSchema).max(30).optional(),
    projectVisibility: creatorEcosystemVisibilitySchema.optional(),
    sourceVisibility: creatorSourceVisibilitySchema.optional(),
    downloadVisibility: creatorDownloadVisibilitySchema.optional(),
    demoVisibility: creatorDemoVisibilitySchema.optional(),
  })
  .strict()
  .refine((value) => Object.keys(value).length > 0, 'at least one project metadata field is required');

export const creatorProjectMediaSchema = z
  .object({
    mediaId: idSchema,
    kind: z.enum(['COVER', 'SCREENSHOT']),
    caption: z.string().trim().max(320).nullable().optional(),
    position: z.number().int().min(0).max(100).optional(),
  })
  .strict();

export const creatorProjectPublishSchema = z
  .object({
    releaseId: idSchema.nullable().optional(),
    idempotencyKey: z.string().trim().min(16).max(200),
  })
  .strict();
export const creatorProjectSocialPublishSchema = z
  .object({ snapshotId: idSchema })
  .strict();
export const creatorReleaseAssetRegisterSchema = z
  .object({
    releaseId: idSchema,
    name: z.string().trim().min(1).max(240).refine((value) => !/[\\/\0]/u.test(value), 'asset name is unsafe'),
    sizeBytes: z.number().int().min(0).max(1_000_000_000),
    checksum: z.string().regex(/^[a-f0-9]{64}$/u),
    contentType: z.string().trim().min(1).max(160),
  })
  .strict();
export const creatorProjectUnpublishSchema = z.object({}).strict();
export const creatorProjectSourceQuerySchema = z
  .object({ path: creatorPathSchema })
  .strict();
export const creatorProjectDownloadSchema = z
  .object({ assetId: idSchema })
  .strict();
export const creatorProjectSaveSchema = z
  .object({ saved: z.boolean(), idempotencyKey: z.string().trim().min(16).max(200) })
  .strict();
export const creatorProjectFollowSchema = z
  .object({ followed: z.boolean(), idempotencyKey: z.string().trim().min(16).max(200) })
  .strict();
export const creatorProjectSearchSchema = z
  .object({ q: z.string().trim().min(1).max(200), limit: z.coerce.number().int().min(1).max(50).default(20) })
  .strict();
export const creatorProjectCollaboratorSchema = z
  .object({ userId: idSchema, role: z.enum(['EDITOR', 'VIEWER']) })
  .strict();

// ---------------------------------------------------------------------------
// Phase 11 — sandbox runtime transport schemas
// ---------------------------------------------------------------------------

export const sandboxRuntimeNetworkModeSchema = z.enum([
  'DENY_ALL',
  'REGISTRY_ONLY',
  'ALLOWLIST',
]);
export const sandboxRuntimeTaskTypeSchema = z.enum([
  'INSTALL',
  'BUILD',
  'TEST',
  'LINT',
  'TYPECHECK',
  'DEV_SERVER',
  'COMMAND',
  'PREVIEW',
]);
export const sandboxRuntimeCreateSchema = z
  .object({
    runtimeImage: z
      .string()
      .trim()
      .min(1)
      .max(160)
      .regex(/^[A-Za-z0-9._:/-]+$/u)
      .optional(),
    networkMode: sandboxRuntimeNetworkModeSchema.default('DENY_ALL'),
    allowedHosts: z
      .array(
        z
          .string()
          .trim()
          .min(1)
          .max(253)
          .regex(/^[A-Za-z0-9.-]+$/u),
      )
      .max(20)
      .default([]),
    allowedPorts: z.array(z.number().int().min(1).max(65535)).max(20).default([]),
  })
  .strict();
export const sandboxRuntimeCommandSchema = z
  .object({
    command: z
      .string()
      .trim()
      .min(1)
      .max(2_000)
      .refine(
        (value) =>
          !value.includes('\0') &&
          !/(?:\/var\/run\/docker\.sock|--privileged|host\s+(?:network|pid|ipc)|mount\s+-t|curl\s+169\.254\.169\.254)/iu.test(
            value,
          ),
        'command is not allowed by sandbox policy',
      ),
    timeoutMs: z.number().int().min(100).max(300_000).optional(),
    workingDirectory: z
      .string()
      .trim()
      .min(1)
      .max(512)
      .regex(/^\/workspace(?:\/[A-Za-z0-9._-]+)*$/u)
      .default('/workspace'),
  })
  .strict();
export const sandboxRuntimeTaskSchema = z
  .object({
    type: sandboxRuntimeTaskTypeSchema,
    timeoutMs: z.number().int().min(100).max(300_000).optional(),
  })
  .strict();
/** Cancellation has no process, provider, status, owner or command override. */
export const sandboxRuntimeTaskCancelSchema = z.object({}).strict();
export const sandboxRuntimePortSchema = z
  .object({
    internalPort: z.number().int().min(1).max(65535),
    protocol: z.enum(['HTTP', 'HTTPS', 'WS']).default('HTTP'),
  })
  .strict();
export const sandboxRuntimeSyncSchema = z
  .object({
    changeIds: z.array(idSchema).max(500).default([]),
    expectedWorkspaceVersion: z.number().int().min(1),
  })
  .strict();
export const sandboxRuntimeTerminalOpenSchema = z
  .object({
    columns: z.number().int().min(20).max(400).default(120),
    rows: z.number().int().min(5).max(200).default(32),
  })
  .strict();
/** Input is forwarded only to the isolated provider. API consumers cannot pick
 * a host cwd, owner, environment value, token or shell executable. */
export const sandboxRuntimeTerminalInputSchema = z
  .object({ input: z.string().min(1).max(8_000) })
  .strict();
export const sandboxRuntimeTerminalResizeSchema = z
  .object({
    columns: z.number().int().min(20).max(400),
    rows: z.number().int().min(5).max(200),
  })
  .strict();
export const sandboxRuntimeEnvironmentSchema = z
  .object({
    key: z
      .string()
      .trim()
      .regex(/^[A-Z][A-Z0-9_]{0,127}$/u),
    secretReference: idSchema,
  })
  .strict();
export const sandboxRuntimeChangeReviewSchema = z
  .object({ action: z.enum(['REVIEW', 'REJECT', 'APPLY']) })
  .strict();

// ---------------------------------------------------------------------------
// Phase 12 — deployment / publishing transport schemas
// ---------------------------------------------------------------------------

export const deploymentEnvironmentSchema = z.enum(['PREVIEW', 'PRODUCTION']);
export const deploymentProviderSchema = z.enum(['MOCK_STATIC', 'STATIC_WEB', 'MANAGED_WEB', 'CONTAINER_RUNTIME']);
export const deploymentSourceTypeSchema = z.enum(['COMMIT', 'RELEASE', 'SNAPSHOT']);
export const previewVisibilitySchema = z.enum(['PRIVATE', 'LINK_ONLY', 'PUBLIC']);
export const deploymentCreateSchema = z
  .object({
    projectId: idSchema,
    environment: deploymentEnvironmentSchema,
    provider: deploymentProviderSchema.optional(),
    sourceType: deploymentSourceTypeSchema,
    sourceRevision: z.string().trim().min(1).max(256),
    releaseId: idSchema.nullable().optional(),
    buildCommand: z.string().trim().min(1).max(500).optional(),
    packageManager: z.enum(['npm', 'pnpm', 'yarn']).optional(),
    lockfileHash: z.string().regex(/^[a-f0-9]{64}$/u).optional(),
    confirmProduction: z.boolean().optional(),
    actor: z.enum(['USER', 'AI_ASSISTED']).optional(),
  })
  .strict();
export const deploymentListQuerySchema = z
  .object({ limit: z.coerce.number().int().min(1).max(100).optional() })
  .strict();
export const deploymentPreviewShareSchema = z
  .object({ visibility: previewVisibilitySchema.optional(), expiresInDays: z.union([z.literal(1), z.literal(7), z.literal(30)]).optional(), passwordProtected: z.boolean().optional() })
  .strict();
export const deploymentRollbackSchema = z
  .object({ targetDeploymentId: idSchema, confirmProduction: z.literal(true) })
  .strict();
export const deploymentLogQuerySchema = z
  .object({ cursor: z.coerce.number().int().min(0).optional(), limit: z.coerce.number().int().min(1).max(200).optional() })
  .strict();
export const deploymentDomainCreateSchema = z
  .object({ projectId: idSchema, deploymentId: idSchema, hostname: z.string().trim().min(4).max(253), verificationMethod: z.enum(['DNS_TXT', 'DNS_CNAME']).optional() })
  .strict();
export const deploymentEnvironmentPatchSchema = z
  .object({ publicEnv: z.record(z.string().regex(/^[A-Z_][A-Z0-9_]{0,63}$/u), z.string().max(4_000)).default({}), secretRefs: z.array(z.string().regex(/^(?:vault|secret):\/\/[A-Za-z0-9._/-]+$/u)).max(100).default([]) })
  .strict();
export const deploymentSecretSchema = z
  .object({ projectId: idSchema, environment: deploymentEnvironmentSchema, name: z.string().regex(/^[A-Z_][A-Z0-9_]{0,63}$/u), secretReference: z.string().regex(/^(?:vault|secret):\/\/[A-Za-z0-9._/-]+$/u) })
  .strict();
export const deploymentPublishSchema = z
  .object({ releaseId: idSchema.nullable().optional(), projectVisibility: z.enum(['PRIVATE', 'UNLISTED', 'PUBLISHED']).optional(), sourceVisibility: z.enum(['PRIVATE', 'SELECTED_RELEASE', 'PUBLIC']).optional(), downloadVisibility: z.enum(['PRIVATE', 'SELECTED_RELEASE', 'PUBLIC']).optional(), description: z.string().max(10_000).optional(), screenshots: z.array(z.string().url()).max(12).optional(), demoUrl: z.string().url().nullable().optional(), readme: z.string().max(100_000).nullable().optional() })
  .strict();
export const deploymentUnpublishSchema = z.object({}).strict();

// ---------------------------------------------------------------------------
// Phase 13 — External social connectors
// ---------------------------------------------------------------------------

export const socialConnectorProviderSchema = z.enum(['X', 'DOUYIN', 'MANUAL_LINK']);
export const socialConnectorCapabilitySchema = z.enum([
  'PROFILE_READ',
  'POST_READ',
  'MEDIA_READ',
  'PUBLISH',
  'LIKES_READ',
  'BOOKMARKS_READ',
  'FAVORITES_READ',
  'COLLECTION_READ',
  'ANALYTICS_READ',
]);
export const socialArchiveVisibilitySchema = z.enum(['PRIVATE', 'COMMUNITY', 'GROUP', 'PUBLIC']);
export const socialArchiveContentTypeSchema = z.enum([
  'POST',
  'VIDEO',
  'IMAGE',
  'LINK',
  'THREAD',
  'PROFILE_REFERENCE',
  'MANUAL_SAVE',
]);
export const socialArchiveSourceSchema = z.enum(['OFFICIAL_API', 'MANUAL_LINK', 'USER_IMPORT', 'PUBLISHED_SNAPSHOT']);
export const socialImportJobTypeSchema = z.enum(['INITIAL', 'INCREMENTAL', 'MANUAL']);
export const socialPaginationSchema = z
  .object({
    cursor: z.string().trim().min(1).max(500).optional(),
    limit: z.coerce.number().int().min(1).max(100).optional(),
  })
  .strict();

export const socialOAuthStartSchema = z
  .object({
    provider: socialConnectorProviderSchema.exclude(['MANUAL_LINK']),
    redirectUri: z.string().url().max(2_000),
    consentVersion: z.string().trim().min(1).max(100),
    requestedScopes: z.array(z.string().trim().min(1).max(100)).min(1).max(20),
    codeChallenge: z.string().trim().min(43).max(128).optional(),
  })
  .strict();
export const socialOAuthCallbackSchema = z
  .object({
    provider: socialConnectorProviderSchema.exclude(['MANUAL_LINK']),
    state: z.string().trim().min(32).max(256),
    code: z.string().trim().min(1).max(2_000),
    redirectUri: z.string().url().max(2_000),
    codeVerifier: z.string().trim().min(43).max(256).optional(),
  })
  .strict();
export const socialSyncSchema = z.object({ accountId: idSchema }).strict();
export const socialAccountSettingsSchema = z
  .object({
    requestedScopes: z.array(z.string().trim().min(1).max(100)).min(1).max(20).optional(),
    autoSync: z.boolean().optional(),
  })
  .strict()
  .refine((value) => value.requestedScopes !== undefined || value.autoSync !== undefined, 'at least one account setting is required');
export const socialDisconnectSchema = z.object({ accountId: idSchema }).strict();
export const socialDeleteDataSchema = z
  .object({
    provider: socialConnectorProviderSchema.optional(),
    accountId: idSchema.optional(),
    from: z.string().datetime().optional(),
    to: z.string().datetime().optional(),
  })
  .strict()
  .refine((value) => value.accountId !== undefined || value.provider !== undefined || value.from !== undefined || value.to !== undefined, 'a deletion scope is required');
export const socialManualSaveSchema = z
  .object({
    url: z.string().url().max(2_000),
    note: z.string().trim().max(10_000).nullable().optional(),
    tags: z.array(z.string().trim().min(1).max(80)).max(30).optional(),
    collectionIds: z.array(idSchema).max(20).optional(),
    visibility: socialArchiveVisibilitySchema.default('PRIVATE'),
  })
  .strict();
export const socialArchivePatchSchema = z
  .object({
    note: z.string().trim().max(10_000).nullable().optional(),
    tags: z.array(z.string().trim().min(1).max(80)).max(30).optional(),
    collectionIds: z.array(idSchema).max(20).optional(),
  })
  .strict();
export const socialArchiveQuerySchema = socialPaginationSchema
  .extend({
    provider: socialConnectorProviderSchema.optional(),
    query: z.string().trim().max(200).optional(),
    tag: z.string().trim().max(80).optional(),
    collectionId: idSchema.optional(),
    from: z.string().datetime().optional(),
    to: z.string().datetime().optional(),
    founderOnly: z.coerce.boolean().optional(),
  })
  .strict();
export const socialCollectionCreateSchema = z
  .object({
    name: z.string().trim().min(1).max(120),
    description: z.string().trim().max(2_000).nullable().optional(),
    visibility: z.enum(['PRIVATE', 'PUBLIC']).default('PRIVATE'),
  })
  .strict();
export const socialCollectionPatchSchema = socialCollectionCreateSchema.partial().strict();
export const socialCollectionItemSchema = z.object({ archiveItemId: idSchema }).strict();
export const socialSnapshotPublishSchema = z
  .object({
    archiveItemId: idSchema,
    target: z.enum(['COMMUNITY', 'GROUP', 'PROFILE', 'PUBLIC']),
    visibility: socialArchiveVisibilitySchema,
    groupId: idSchema.optional(),
  })
  .strict();
export const socialExternalPublishSchema = z
  .object({
    archiveItemId: idSchema,
    accountId: idSchema,
    visibility: z.enum(['PUBLIC', 'UNLISTED']).optional(),
    text: z.string().trim().max(50_000).optional(),
    mediaIds: z.array(idSchema).max(4).optional(),
  })
  .strict();
export const socialFounderCurateSchema = z
  .object({
    archiveItemId: idSchema,
    audience: z.enum(['PUBLIC', 'FREE', 'GO', 'PLUS', 'PRO', 'PRO_MAX']),
  })
  .strict();

// ---------------------------------------------------------------------------
// Phase 19 — Connected apps / external identity
// ---------------------------------------------------------------------------

export const externalIdentityProviderSchema = z.enum([
  'X',
  'CHATGPT',
  'WECHAT',
  'HONOR_OF_KINGS',
  'GITHUB',
]);
export const externalIdentityOAuthProviderSchema = z.enum(['X', 'GITHUB']);
export const externalIdentityVisibilitySchema = z.enum(['PRIVATE', 'PUBLIC']);
const externalIdentityTextSchema = z.string().trim().min(1).max(500);
const externalIdentityOptionalTextSchema = z.string().trim().min(1).max(2_000).nullable().optional();
const externalIdentityOptionalUrlSchema = z.string().url().max(2_000).nullable().optional();

/**
 * The body deliberately exposes only named, safe profile fields. There is no
 * generic metadata/token/cookie field through which a client could persist a
 * provider response or credential dump.
 */
export const externalIdentityCreateSchema = z
  .object({
    provider: externalIdentityProviderSchema,
    displayName: externalIdentityTextSchema,
    handle: z.string().trim().min(1).max(160).nullable().optional(),
    publicUrl: externalIdentityOptionalUrlSchema,
    avatarUrl: externalIdentityOptionalUrlSchema,
    description: externalIdentityOptionalTextSchema,
    visibility: externalIdentityVisibilitySchema.default('PRIVATE'),
    wechatId: z.string().trim().min(1).max(100).nullable().optional(),
    qrMediaId: idSchema.nullable().optional(),
    contactPreference: z.enum(['MESSAGE_FIRST', 'COPY_ID', 'SHOW_QR']).optional(),
    gameId: z.string().trim().min(1).max(100).nullable().optional(),
    region: z.string().trim().min(1).max(120).nullable().optional(),
    rank: z.string().trim().min(1).max(120).nullable().optional(),
    favoriteHero: z.string().trim().min(1).max(120).nullable().optional(),
    featuredRepositories: z
      .array(
        z
          .object({
            name: z.string().trim().min(1).max(200),
            url: z.string().url().max(2_000),
            description: z.string().trim().min(1).max(500).nullable().optional(),
          })
          .strict(),
      )
      .max(12)
      .optional(),
  })
  .strict();

export const externalIdentityUpdateSchema = externalIdentityCreateSchema
  .omit({ provider: true })
  .partial()
  .strict();
export const externalIdentityVisibilityUpdateSchema = z
  .object({ visibility: externalIdentityVisibilitySchema })
  .strict();
export const externalIdentityReorderSchema = z
  .object({ identityIds: z.array(idSchema).min(1).max(50) })
  .strict();
export const externalIdentityOAuthStartSchema = z
  .object({
    provider: externalIdentityOAuthProviderSchema,
    redirectUri: z.string().url().max(2_000),
  })
  .strict();
export const externalIdentityOAuthCallbackSchema = z
  .object({
    provider: externalIdentityOAuthProviderSchema,
    state: z.string().trim().min(32).max(256),
    code: z.string().trim().min(1).max(2_000),
    redirectUri: z.string().url().max(2_000),
  })
  .strict();
export const externalIdentityLaunchSchema = z
  .object({ action: z.enum(['OPEN', 'COPY', 'QR']) })
  .strict();

// X Local Capture — browser events never carry a client-supplied owner id.
export const xCaptureActionTypeSchema = z.enum([
  'like', 'unlike', 'bookmark', 'unbookmark', 'opened', 'viewed',
  'copied_link', 'share_to_mezip', 'manual_save', 'add_note', 'follow', 'unfollow',
]);
export const xCapturePlatformSchema = z.enum(['X', 'DOUYIN', 'BILIBILI', 'WECHAT_WEB', 'EDGE']);
export const xCaptureSourceSchema = z.enum(['LOCAL_CAPTURE', 'MANUAL_IMPORT', 'SHARE_EXTENSION']);
export const xCaptureEventInputSchema = z
  .object({
    actionType: xCaptureActionTypeSchema,
    platform: xCapturePlatformSchema.default('X'),
    postUrl: z.string().url().max(2_000),
    postId: z.string().trim().max(300).nullable().optional(),
    authorHandle: z.string().trim().max(300).nullable().optional(),
    pageTitle: z.string().trim().max(1_000).nullable().optional(),
    capturedAt: z.string().datetime().optional(),
    captureMethod: z.enum(['EXPLICIT_ACTION', 'VISIBLE_STATE']).optional(),
    observedAt: z.string().datetime().optional(),
    captureAccount: z.object({ profileUrl: z.string().url().max(500), displayName: z.string().trim().max(120) }).strict().optional(),
    source: xCaptureSourceSchema.default('LOCAL_CAPTURE'),
    device: z.string().trim().max(120).nullable().optional(),
    browser: z.string().trim().max(120).nullable().optional(),
    note: z.string().trim().max(10_000).nullable().optional(),
    tags: z.array(z.string().trim().min(1).max(80)).max(30).optional(),
  })
  .strict();
export const xCaptureSettingsPatchSchema = z
  .object({
    enabled: z.boolean().optional(),
    captureLikes: z.boolean().optional(),
    captureBookmarks: z.boolean().optional(),
    captureViews: z.boolean().optional(),
    captureSharedLinks: z.boolean().optional(),
    watchCapture: z.boolean().optional(),
    savePageMetadata: z.boolean().optional(),
    autoSync: z.boolean().optional(),
  })
  .strict()
  .refine((value) => Object.keys(value).length > 0, 'at least one capture setting is required');
export const xCaptureTimelineQuerySchema = z
  .object({
    actionType: xCaptureActionTypeSchema.optional(),
    from: z.string().datetime().optional(),
    to: z.string().datetime().optional(),
    query: z.string().trim().max(200).optional(),
    limit: z.coerce.number().int().min(1).max(100).optional(),
    cursor: z.string().trim().min(1).max(500).optional(),
  })
  .strict();
export const xCaptureEnrichmentSchema = z
  .object({
    eventId: idSchema,
    postUrl: z.string().url().max(2_000),
    postId: z.string().trim().max(300).nullable().optional(),
    authorHandle: z.string().trim().max(300).nullable().optional(),
    pageTitle: z.string().trim().max(1_000).nullable().optional(),
    textExcerpt: z.string().trim().max(50_000).nullable().optional(),
    media: z.array(z.record(z.string(), z.unknown())).max(20).optional(),
    status: z.enum(['AVAILABLE', 'FAILED']).optional(),
  })
  .strict();

export const xCaptureSpecialFavoriteInputSchema = z
  .object({
    postUrl: z.string().url().max(2_000),
    postId: z.string().trim().max(300).nullable().optional(),
    authorHandle: z.string().trim().max(300).nullable().optional(),
    pageTitle: z.string().trim().max(1_000).nullable().optional(),
    note: z.string().trim().max(10_000).nullable().optional(),
    tags: z.array(z.string().trim().min(1).max(80)).max(30).optional(),
    sourceEventId: z.string().trim().min(1).max(300).optional(),
  })
  .strict();

/** Canonical private-library transport. It accepts only an already captured
 * X post reference; the service verifies that the owner has a like, bookmark,
 * or explicit saved-link event before creating a record. */
export const xCapturePrivateLibraryInputSchema = z.object({
  postUrl: z.string().url().max(2_000),
  postId: z.string().trim().max(300).nullable().optional(),
  pageTitle: z.string().trim().max(1_000).nullable().optional(),
  note: z.string().trim().max(10_000).nullable().optional(),
  tags: z.array(z.string().trim().min(1).max(80)).max(30).optional(),
  collectionId: z.string().trim().max(300).nullable().optional(),
  sourceEventId: z.string().trim().min(1).max(300).optional(),
}).strict();

export const xCapturePrivateLibraryPatchSchema = z.object({
  note: z.string().trim().max(10_000).nullable().optional(),
  tags: z.array(z.string().trim().min(1).max(80)).max(30).optional(),
  collectionId: z.string().trim().max(300).nullable().optional(),
}).strict().refine((value) => Object.keys(value).length > 0, 'at least one library field is required');

export const xCapturePrivateLibraryQuerySchema = z.object({
  query: z.string().trim().max(200).optional(),
  kind: z.enum(['all', 'text', 'image', 'video', 'link']).optional(),
  tag: z.string().trim().max(80).optional(),
  collectionId: z.string().trim().max(300).optional(),
}).strict();

export const xCapturePrivateLibraryBatchSchema = z.object({
  items: z.array(xCapturePrivateLibraryInputSchema).min(1).max(100),
}).strict();

export const xCapturePrivateLibraryCollectionInputSchema = z.object({
  name: z.string().trim().min(1).max(200),
  description: z.string().trim().max(2_000).nullable().optional(),
  icon: z.string().trim().max(40).nullable().optional(),
}).strict();

export const xCapturePrivateLibraryCollectionPatchSchema = z.object({
  name: z.string().trim().min(1).max(200).optional(),
  description: z.string().trim().max(2_000).nullable().optional(),
  icon: z.string().trim().max(40).nullable().optional(),
}).strict().refine((value) => Object.keys(value).length > 0, 'at least one collection field is required');

export const watchContentTypeSchema = z.enum(['MOVIE', 'EPISODE', 'LONG_VIDEO', 'VIDEO', 'SHORT_VIDEO', 'OTHER_VIDEO']);
export const watchStatusSchema = z.enum(['STARTED', 'IN_PROGRESS', 'COMPLETED']);

/** Progress checkpoints are accepted only from the current page/player. The
 * service decides whether a record is created and how much real play time is
 * accumulated. */
export const watchProgressInputSchema = z.object({
  sessionId: z.string().trim().min(1).max(200),
  captureId: z.string().regex(/^[a-zA-Z0-9_-]{1,160}$/u).optional(),
  sequence: z.number().int().positive().max(Number.MAX_SAFE_INTEGER).optional(),
  sessionActualPlayedSeconds: z.number().finite().min(0).max(31_536_000).optional(),
  contentKey: z.string().trim().min(1).max(1_000).optional(),
  contentType: watchContentTypeSchema.default('VIDEO'),
  platform: z.string().trim().min(1).max(120),
  domain: z.string().trim().min(1).max(255),
  videoId: z.string().trim().max(500).nullable().optional(),
  title: z.string().trim().max(500).default('未命名视频'),
  subtitle: z.string().trim().max(1_000).nullable().optional(),
  creator: z.string().trim().max(300).nullable().optional(),
  url: z.string().url().max(4_000),
  canonicalUrl: z.string().url().max(4_000),
  thumbnail: z.string().url().max(4_000).nullable().optional(),
  poster: z.string().url().max(4_000).nullable().optional(),
  durationSeconds: z.number().finite().min(0).max(86_400),
  currentTimeSeconds: z.number().finite().min(0).max(86_400),
  actualPlayedSeconds: z.number().finite().min(0).max(3_600).default(0),
  eventType: z.enum(['play', 'progress', 'pause', 'seeking', 'seeked', 'ended', 'visibilitychange', 'pagehide']).default('progress'),
  startedAt: z.string().datetime({ offset: true }).optional(),
  endedAt: z.string().datetime({ offset: true }).nullable().optional(),
  metadata: z.record(z.string(), z.unknown()).optional(),
}).strict().superRefine((value, context) => {
  if ((value.sequence === undefined) !== (value.sessionActualPlayedSeconds === undefined)) context.addIssue({ code: 'custom', path: ['sequence'], message: 'sequence and sessionActualPlayedSeconds must be supplied together' });
  const frame = value.metadata?.lastFrame;
  if (frame !== undefined && (typeof frame !== 'string' || frame.length > 10_000 || !/^data:image\/jpeg;base64,[A-Za-z0-9+/]+={0,2}$/u.test(frame))) context.addIssue({ code: 'custom', path: ['metadata', 'lastFrame'], message: 'lastFrame must be a JPEG data URL of at most 10000 characters' });
  if (value.metadata?.frameStatus !== undefined && !['captured', 'cross-origin-blocked', 'protected', 'unavailable', 'too-large'].includes(String(value.metadata.frameStatus))) context.addIssue({ code: 'custom', path: ['metadata', 'frameStatus'], message: 'Unknown frame capture status' });
});

export const watchQuerySchema = z.object({
  status: watchStatusSchema.optional(),
  contentType: watchContentTypeSchema.optional(),
  query: z.string().trim().max(200).optional(),
  limit: z.coerce.number().int().min(1).max(100).optional(),
  cursor: z.string().min(1).max(1_000).regex(/^[A-Za-z0-9_-]+$/u).optional(),
}).strict();

export const watchPrivateLibraryInputSchema = z.object({
  note: z.string().trim().max(10_000).nullable().optional(),
  tags: z.array(z.string().trim().min(1).max(80)).max(30).optional(),
  collectionId: z.string().trim().max(300).nullable().optional(),
}).strict();

export const resourceTypeSchema = z.enum(['WEBPAGE', 'ARTICLE', 'CODE', 'X_LINK']);
export const resourceStatusSchema = z.enum(['IN_PROGRESS', 'COMPLETED']);
export const resourceRecordInputSchema = z.object({
  resourceType: resourceTypeSchema,
  title: z.string().trim().max(500).optional(),
  platform: z.string().trim().max(200).optional(),
  author: z.string().trim().max(300).nullable().optional(),
  description: z.string().trim().max(10_000).nullable().optional(),
  url: z.string().url().max(4_000),
  canonicalUrl: z.string().url().max(4_000).optional(),
  currentProgressPercent: z.number().finite().min(0).max(100).optional(),
  status: resourceStatusSchema.optional(),
  liked: z.boolean().optional(),
  bookmarked: z.boolean().optional(),
  note: z.string().trim().max(10_000).nullable().optional(),
  tags: z.array(z.string().trim().min(1).max(80)).max(30).optional(),
  metadata: z.record(z.string(), z.unknown()).optional(),
}).strict();
export const resourceRecordPatchSchema = resourceRecordInputSchema.partial().omit({ resourceType: true, url: true, canonicalUrl: true, metadata: true }).strict().refine((value) => Object.keys(value).length > 0, 'at least one resource field is required');
export const resourceRecordQuerySchema = z.object({ resourceType: resourceTypeSchema.optional(), status: resourceStatusSchema.optional(), query: z.string().trim().max(200).optional() }).strict();
export const resourceOpenInputSchema = z.object({
  source: z.enum(['MEZIP_READING_HISTORY', 'X_LINK_COLLECTION']).optional(),
  idempotencyKey: z.string().trim().min(1).max(300).optional(),
}).strict();
