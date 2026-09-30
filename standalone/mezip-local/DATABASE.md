# Database Design

## Chosen model

PostgreSQL is the source of truth for transactional data; object storage contains encrypted
media objects while PostgreSQL stores metadata and ownership. A transactional outbox publishes
events for aggregation, scan, notification, analytics, and sync. No database is provisioned
in Phase 0.

The canonical initial DDL lives in `infrastructure/database/001_initial_schema.sql`; the ER
description is in `docs/database/ERD.md`.

## Tenant isolation

Personal tables always include `owner_id` referencing `users(id)`. Community resources have
an explicit author/owner and group membership context. Billing ownership is immutable after
order creation. In deployment, PostgreSQL row-level security will bind a transaction-local
principal to `owner_id`; application-level scope remains mandatory so a missing RLS policy is
not a data leak.

### Ownership, visibility, and Published Snapshots

Ordinary user content is `PRIVATE` by default and uses only the independent visibility values
`PRIVATE`, `COMMUNITY`, `GROUP`, `DIRECT_SHARE`, and `PUBLIC`. Membership plan codes (`FREE`,
`GO`, `PLUS`, `PRO`, `PRO_MAX`) are entitlement inputs, never ordinary content-privacy values.
An explicit owner publish creates a separate Published Snapshot (with its own ID, revision,
audience, moderation state, and audit metadata); the private Original remains owned and private.
Changing an Original must not mutate an existing snapshot. Updating a published item requires an
explicit new snapshot version or update operation. Founder/Official audience tiers may be stored
as a separate audience policy, but must never be interpreted as permission to read a private
source or another ordinary user's rows.

## Primary aggregates

| Aggregate  | Tables                                                                                                                                                                                                                                                                                                                               |
| ---------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| Identity   | users, auth_identities, otp_challenges, sessions, devices, consents, account_deletion_requests, roles, user_roles, audit_log                                                                                                                                                                                                         |
| Archive    | private_records, timeline_events, ai_sessions, fitness_entries, history_entries, media_assets                                                                                                                                                                                                                                        |
| Community  | published_snapshots, community_posts, post_reactions, comments, saved_posts, user_follows, user_blocks, community_groups, group_memberships, group_posts, channels, channel_memberships, channel_posts, activities, activity_registrations, community_notifications, reports, moderation_cases                                       |
| Messaging  | conversations, conversation_members, direct_conversation_pairs, messages, message_reactions, message_read_states, message_attachments, message_reports, conversation_settings, message_drafts, user_presence, messaging_outbox/idempotency and safe notification/outbox projections                                                  |
| Commerce   | products, orders, payment_transactions, payment_events, refunds, subscriptions, membership_history, entitlements, plan_entitlements, campaigns, benefit_grants, coupons, redemption_codes, redemptions, redemption_benefit_grants, badges, user_badges, invite_relationships, invite_rewards, storage_grants, membership_admin_audit |
| AI Gateway | ai_gateway_providers, ai_gateway_models, ai_gateway_capabilities, ai_gateway_model_capabilities, ai_gateway_user_byok_credentials, ai_gateway_conversations, ai_gateway_invocations, ai_gateway_usage_ledger, ai_gateway_provider_health, ai_gateway_admin_audit                                                                     |
| Operations | feature_flags, outbox_events, moderation_cases, break_glass_access                                                                                                                                                                                                                                                                   |

## Root and Admin foundation (Phase 3 schema foundation)

The platform reserves one server-side `admin_identity` for the single
`ORIGINAL_DEVELOPER_ROOT` (`ODR`). Equivalent existing tables may be extended; a second parallel
identity model must not be introduced. The identity must carry `id`, `user_id`, `admin_type`,
`status`, `created_at`, and `last_authenticated_at`, with a uniqueness invariant that allows
at most one ODR identity across all statuses (revocation does not free the slot). Ordinary
`ADMIN`, `MODERATOR`, `SUPPORT`, and `SUPER_ADMIN` identities
cannot assign, clone, promote, or transfer ODR through a normal API.

The foundation reserves (or uses approved equivalents of) `admin_identities`,
`admin_capabilities`, `admin_access_audit`, `channels`, `channel_memberships`,
`channel_posts`/`channel_snapshots`, and `benefit_grants`. Every ODR private-data read appends an
audit row containing `admin_id`, `target_user_id`, resource/action, timestamp, session and
environment context, and optional reason. Audit storage is append-oriented and protected from
ordinary deletion. ODR read, sensitive-data read, `ROOT_READ_PRIVATE_MESSAGES`, modify, delete,
export, `ROOT_BULK_EXPORT`, channel, entitlement, benefit, feature-flag, and audit capabilities
are separate; `ROOT_BULK_EXPORT` is default-disabled. The checked-in Phase 3 migration
`infrastructure/database/004_root_access_channels.sql` provides these tables, constraints,
append-only audit triggers, and RLS helpers. It establishes the schema/security foundation. Phase
4 extends it with Community persistence, Phase 5 extends the existing Messaging aggregate, and
Phase 6 extends the existing commerce aggregate while preserving the same Root/API/RLS boundary.
None of these migrations activates an unrestricted Admin Command Center UI or a live merchant
payment integration.

An ODR read is read-only and must not create a user revision. Any future ODR repair uses a
separate `ADMIN_REVISION` record that preserves original content, replacement content, actor,
time, and reason; it never rewrites the author as the user.

### Channels

Channel types are `OFFICIAL`, `COMMUNITY`, `BETA`, `FEEDBACK`, `EVENT`, `CREATOR`, and
`DEVELOPER`. A channel membership never grants archive access. Private Life/Timeline/Media/
Fitness/History data becomes Channel Content only after an explicit post, reply, upload, or
publish action; the private Original remains separate from each Channel Snapshot.

The ODR-only Membership Simulator is a development `Simulation Context` and must display
`DEVELOPMENT SIMULATION`; it cannot change a real subscription, payment, or production
entitlement state.

## Phase 4 Community persistence contract

The checked-in Phase 4 migration `infrastructure/database/005_phase4_community.sql` may extend
existing Community tables or use the equivalent relations below; it is additive and is not a
production deployment command. It must not duplicate the Phase 3 snapshot, Media, Root, or Channel foundations.
All Community
content retains `owner_user_id`/`owner_id` (or an approved equivalent) and uses opaque IDs,
foreign-key or equivalent referential integrity, server-assigned actor IDs, timestamps, status,
and soft-delete metadata where applicable.

| Aggregate     | Canonical relation(s)                                                            | Required invariants                                                                                                                                                                                                                                                                                                                                                                                                |
| ------------- | -------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| Publication   | `published_snapshots`, `community_posts`, `group_posts`, `channel_posts`         | A Published Snapshot stores `id`, owner, source type/id, selected snapshot content/media, ordinary visibility, publication/update time, and status. It is independent from its private Original; post edits/deletes never mutate/archive-delete the Original. Posts use `DRAFT`/`PUBLISHED`/`HIDDEN`/`REMOVED`/`DELETED`.                                                                                          |
| Interactions  | `post_reactions`, `comments`, `saved_posts`, `user_follows`, `user_blocks`       | One active reaction per `(user, post, reaction_type)`, one save per `(user, post)`, one follow per `(follower, followed)`, and one block per `(blocker, blocked)`. Comments reserve `parent_comment_id` and enforce a two-level UI; saves are owner-private.                                                                                                                                                       |
| Groups        | `community_groups`, `group_memberships`, `group_posts`                           | Groups are `PUBLIC`/`PRIVATE` with `INVITE_ONLY` reserved; memberships are unique and use `OWNER`/`ADMIN`/`MEMBER`. Private access requires server-confirmed membership. `GROUP_CREATE` is separately policy-gated, not an unlimited default. A departing owner transfers ownership or archives the Group.                                                                                                         |
| Channels      | existing `channels`, `channel_memberships`, `channel_snapshots`, `channel_posts` | Channel type/audience/membership is separate from ordinary personal visibility. Official creation is Root-capability controlled; user submissions reference an explicit publish/post/reply/upload action.                                                                                                                                                                                                          |
| Activities    | `activities`, `activity_registrations`                                           | Activity records include creator, title/description, start/end/timezone, location/optional online URL, optional capacity, visibility, status, and timestamps. Creation is policy-scoped to Founder, eligible Group Owner, or a future explicitly entitled Creator. Statuses are `DRAFT`/`PUBLISHED`/`CANCELLED`/`COMPLETED`/`DELETED`; one active registration per user/activity and capacity admission is atomic. |
| Safety        | `reports`, `moderation_cases`                                                    | Reports target post/comment/user/group/channel/activity with protected reporter identity. Cases use `OPEN`/`REVIEWING`/`ACTIONED`/`DISMISSED`; actions reserve hide/remove/warn/suspend/ban/restore and retain actor/reason/audit metadata.                                                                                                                                                                        |
| Notifications | `community_notifications`                                                        | Records only recipient, type, minimal safe summary/reference, `UNREAD`/`READ`, and timestamps. It does not duplicate private/archive/report bodies.                                                                                                                                                                                                                                                                |

Ordinary content visibility remains exactly `PRIVATE`, `COMMUNITY`, `GROUP`, `DIRECT_SHARE`, and
`PUBLIC`; the internal `SNAPSHOT` pipeline state and Founder/Official audience
(`FOUNDER_PUBLIC` through `FOUNDER_PRO_MAX`) are separate columns/policies. Membership plans
never populate ordinary visibility. Group, Channel, Activity, and Feed projections filter
visibility, membership, Founder audience/entitlement, moderation state, block relations, and
deletion before returning rows.

Feed, comments, followers/following, group/channel posts and members, activities, notifications,
reports, and moderation cases require stable cursor indexes. Ranking v1 persists only enough
trusted projection data for transparent chronological/recent/simple-engagement ordering; it does
not store a private Archive-derived behavioral recommendation profile. Counters may be derived or
maintained transactionally, but correctness and idempotency take precedence over an aggressive
cache.

Community media uses existing `archive_media_assets`/`archive_media_links` or their approved
Media Service equivalent. A Community/Group/Channel snapshot must create an authorized media-link
relationship; a known `media_asset_id` alone never authorizes delivery. Reports, private Group
content, full post/comment bodies, and private Originals are excluded from ordinary logs and from
unapproved analytics payloads.

## Canonical membership price configuration

The following is the only effective Product Owner price configuration as of 2026-08-16:

| Plan code | Display price | `amount_fen` (integer CNY fen) |
| --------- | ------------- | -----------------------------: |
| `FREE`    | ¥0            |                              0 |
| `GO`      | ¥10/月        |                           1000 |
| `PLUS`    | ¥20/月        |                           2000 |
| `PRO`     | ¥40/月        |                           4000 |
| `PRO_MAX` | ¥80/月        |                           8000 |

All monetary columns (`products.amount_fen`, `orders.amount_fen`, `orders.base_amount_fen`,
`orders.discount_amount_fen`, `orders.payable_amount_fen`, `payment_transactions.amount_fen`,
`payment_events.amount_fen`, and `refunds.amount_fen`) are PostgreSQL `integer` values
representing CNY fen. Floats, decimal currency values, and client-supplied prices are invalid.
The server remains the authority for the active product/price version; migration
`007_phase6_membership_payments.sql` and `packages/shared-types/src/index.ts`
(`membershipPriceFen`) enforce the frozen configuration. Applying that migration to production
remains a separate Human Action Required step.

## FREE baseline and entitlement projection

Every active account receives a non-purchased `FREE` baseline projection. It covers the
account's own private Life Archive, life/text records, basic image/video media, Timeline,
history-reading records and cases, fitness, basic movement/steps, basic AI Usage records,
basic statistics, personal profile, data export, public Community browsing, and Founder
snapshots explicitly published for `FREE`.

The baseline never grants another principal's private rows. It also never grants Founder
private source records, private devices, private messages, or Founder DM. Paid plans add
capabilities according to
[`docs/membership/ENTITLEMENT_MATRIX.md`](docs/membership/ENTITLEMENT_MATRIX.md) and do not
change `owner_id` predicates. Because the baseline is not a purchase, its
`entitlements.subscription_id` may be `NULL`; revocable paid projections remain linked to a
subscription/order.

## Identity and session model (Phase 1)

`users` is the canonical person/account row. `auth_identities` has a unique normalized
`(provider, subject)` and a foreign key to `users`; it stores provider metadata and verification
timestamps, never raw OAuth credentials or OTP codes. `otp_challenges` stores only a keyed hash,
purpose, expiry, resend cooldown, attempt count, lock/consume state, and a rate-limit key.
`sessions` stores a hash of the refresh credential, a session-family identifier for rotation
reuse detection, device/platform metadata, expiry, and revocation timestamps. `consents` records
the accepted Terms/Privacy versions. `account_deletion_requests` records a verified request and
retention workflow. All rows are owner-scoped and auditable; no client-provided `user_id` is
accepted as authority.

The schema must enforce one active identity per provider subject, single-use OTP challenges,
refresh rotation/revocation, and last-identity protection at the service boundary. Access
tokens are short-lived and not persisted as plaintext database values. Phase 1 uses a local
in-memory repository for tests and a reviewed PostgreSQL migration for deployment; no local
test data is production data.

## Capability and Benefits projection

The entitlement resolver projects additive capability codes rather than a plan boolean. Phase 6
implements the Benefits model through `campaigns`, `benefit_grants`, `coupons`, `redemptions`,
`redemption_codes`, `redemption_benefit_grants`, `badges`/`user_badges`,
`invite_relationships`/`invite_rewards`, and `storage_grants`. Each effective grant records its
user, benefit shape, capability/plan/quota/badge payload as applicable, source, reason, operator,
optional campaign/coupon/redemption relation, time window, revocation state, and idempotency key.
Grant resolution is deterministic and time-bounded; it supports gifts, promotions, trials, gray
rollouts, Founder/Internal grants, storage, badges, and controlled invite rewards without changing
integer CNY-fen prices or owner predicates. Invite relations/rewards are durable internal records;
there is no consumer self-issuance route.

## Data lifecycle

Soft deletion is used for user-visible records when recovery/audit is required; retention
policies decide when physical deletion occurs. Account deletion queues a verified workflow for
profile, private archive, devices, tokens, shares, media, and community relations; finance and
audit records follow legal/operational retention rather than an unsafe blanket erase.

## Phase 3 Personal Life Archive schema

Migration `infrastructure/database/003_phase3_archive.sql` adds the archive core without
replacing the Phase 0 `private_records` table. New domain rows are owner-scoped and use
opaque UUIDs:

| Aggregate        | Tables                                                                       | Invariant                                                                                                                                                                                                                                                                                                                                                                                       |
| ---------------- | ---------------------------------------------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Life             | `life_entries`, `life_revisions`                                             | `kind` remains the cross-domain `mezip_record_kind`; `life_type` carries TEXT/PHOTO/VIDEO/MIXED/NOTE/MEMORY; immutable creation context includes record source, optional device and server receipt time; source is private by default and revisions are append-only                                                                                                                             |
| Publication / AI | `life_published_snapshots`, `life_ai_insights`                               | Published Snapshot and `AI_GENERATED` output are separate from the private source; ordinary visibility is PRIVATE/COMMUNITY/GROUP/DIRECT_SHARE/PUBLIC, while Founder/Official audience tiers are a separate policy. The Phase 3 archive foundation emits a non-delivered `SNAPSHOT`; Phase 4 Community creates delivery only from an authorized source reference and never mutates the Original |
| Timeline         | `archive_timeline_events`                                                    | one projection row references `source_type` + `source_id`; it does not duplicate the source body                                                                                                                                                                                                                                                                                                |
| History          | `archive_history_entries`                                                    | owner-scoped reading/people/event notes with occurred/studied timestamps                                                                                                                                                                                                                                                                                                                        |
| Fitness          | `archive_fitness_sessions`, `archive_body_metrics`, `archive_step_records`   | optional body metrics; source is recorded for imported/manual steps                                                                                                                                                                                                                                                                                                                             |
| Daily Pack       | `archive_daily_packs`                                                        | one idempotent per-owner local-day index/summary, not a copy of source records                                                                                                                                                                                                                                                                                                                  |
| Media            | `archive_media_assets`, `archive_media_links`                                | metadata only; owner, MIME, size, hash, storage key and scan state are required                                                                                                                                                                                                                                                                                                                 |
| Quota            | `archive_storage_usage`                                                      | per-owner byte usage and configurable quota; no unlimited-storage promise                                                                                                                                                                                                                                                                                                                       |
| Sync / audit     | `archive_offline_mutations`, `archive_conflicts`, `archive_idempotency_keys` | offline drafts, explicit conflict resolution and replay-safe writes                                                                                                                                                                                                                                                                                                                             |

All Phase 3 tables enable row-level security using `mezip.principal_id`, and application
handlers repeat the owner predicate. Resource reads by an ID belonging to another principal
return the same privacy-preserving not-found/denied result as other archive resources.

Life writes carry `idempotency_key`; updates carry the expected `version` and create a new
revision rather than overwriting history. Delete first sets `TRASHED`; permanent deletion is a
separate explicit operation. `occurred_at`, `created_at`, `updated_at`,
`server_received_at`, and IANA `timezone` are retained so a backfilled event appears in its
real historical position. Unknown timezone defaults to `Etc/UTC`; clients provide an IANA
timezone rather than assuming UTC+8 for every user.

Media states are `UPLOADING`, `PROCESSING`, `READY`, `FAILED`, `QUARANTINED`, and `DELETED`.
The `StorageProvider` contract (implemented locally by `LocalDevelopmentStorage`) supports
local/mock and future object storage; no cloud SDK is embedded in archive business logic. Export
records contain a schema version, export time,
owner-scoped JSON, body/step data, and media references/checksums metadata. A production download must use a
short-lived authorized mechanism rather than a permanent public URL.

Passwords, OTPs, refresh/access tokens, OAuth credentials, WeChat/payment secrets, encryption
master keys, and provider API keys are never stored as readable application data. Passwords and
OTP values are one-way hashed; provider secrets use encrypted server-side secret storage with
rotate/replace/revoke operations. Even ODR cannot query plaintext secrets. Sensitive archive
fields are capability-gated and excluded from ordinary logs and exports unless the applicable
explicit authorization exists.

## Phase 5 Realtime Messaging schema

Migration `infrastructure/database/006_phase5_messaging.sql` extends the existing Messaging
aggregate; it is additive and is not a deployment command. It reuses Phase 1 identity, Phase 3
Media, Phase 4 Group Membership/block/moderation/notifications, and Phase 3/4 Root audit helpers.
It must not create a second user, Group, Media, Block, Root, or object-storage source of truth.

| Aggregate         | Tables / relation                                                      | Required invariant                                                                                                                                                                                                              |
| ----------------- | ---------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Conversation      | `conversations`, `conversation_members`, `direct_conversation_pairs`   | opaque IDs; canonical unordered direct-user pair is unique; group conversation binds one Phase 4 `group_id`; active member state is server authoritative; one user’s mute/pin/archive does not change another member’s view.    |
| Messages          | `messages`, `message_reactions`, `message_read_states`                 | sender is server assigned; sequence is monotonically unique within a conversation; `(sender_id, client_message_id)` is unique; author edit/delete is controlled; Group read state is per member, never a single global boolean. |
| Attachments       | `message_attachments` → Phase 3 `archive_media_assets` / links         | attachment is an authorized reference only; no duplicate storage key; its read requires conversation access plus Media owner/link/scan authorization.                                                                           |
| User state        | `message_drafts`, `conversation_settings`, `user_presence`             | drafts and preferences are self/member scoped; `mute`, `archive`, and `pin` are per user; presence is coarse and low-frequency. Typing is TTL-bound transport/cache state, not a durable Message row.                           |
| Safety / delivery | `message_reports`, messaging notification/outbox/idempotency relations | reporter is protected; notifications retain a safe summary/reference only; client retry returns the original message; rate-limit/repeated-message metadata does not retain body text unnecessarily.                             |

Every normal-user Conversation/Message/Attachment query performs a membership predicate in the
same query and receives PostgreSQL RLS or equivalent defense-in-depth. Group scope additionally
checks current active Group Membership. A member whose Group Membership is removed or banned loses
message, attachment, search, receipt, typing, and event access. `PRO_MAX` or any other plan does
not relax any predicate.

Message media delivery keeps the Phase 3 service lifecycle (`UPLOADING`, `PROCESSING`, `READY`,
`FAILED`, `QUARANTINED`, `DELETED`) and short-lived safe delivery. The database stores metadata
and allowed link relations, never audio/video/file bytes or permanent public URLs. Private body,
voice recording, attachment name/URL, and unseen message preview are excluded from routine logs,
analytics, error bodies, and notification rows.

`ORIGINAL_DEVELOPER_ROOT` has no consumer-table bypass. Any Root private conversation/message/
attachment read enters through the Admin API, checks `ROOT_READ_PRIVATE_MESSAGES`, and appends an
`admin_access_audit` event in the same protected operation. An audit-less private read is an
invalid schema/service path; normal `ADMIN`, `SUPER_ADMIN`, and `MODERATOR` cannot use it.

## Phase 6 Membership, Benefits, and Billing schema

Migration `infrastructure/database/007_phase6_membership_payments.sql` is additive to the prior
commerce foundation and is **not** a production deployment command. It retains `products`,
`orders`, `payment_transactions`, `refunds`, `subscriptions`, and `entitlements` as the canonical
relations, extending them rather than creating a parallel membership/payment system.
`subscriptions` is the durable Membership relation; `membership_plans`, `memberships`, and
`payments` are semantic projections for callers/reporting.

| Aggregate                       | Canonical relations / projection                                                                         | Required invariant                                                                                                                                                                                                                                                         |
| ------------------------------- | -------------------------------------------------------------------------------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Frozen catalogue                | `products` → `membership_plans`                                                                          | exactly the five frozen CNY integer-fen prices; paid plans use `NON_AUTO_RENEWING_MONTHLY_PASS`; `FREE` is a non-purchased baseline.                                                                                                                                       |
| Order / checkout                | `orders`, `redemptions` coupon reservation                                                               | server-derived plan/base/discount/payable values; unique `order_no`; provider is one of `WECHAT_PAY`/`ALIPAY`/`UNIONPAY`/`MOCK`; pending orders expire and release an unused coupon reservation.                                                                           |
| Payment callback                | `payment_transactions`, `payment_events` → `payments`                                                    | provider payment ID and `(provider, provider_transaction_id)` are unique; CNY/fen amount, order/provider relationship, and verified-event digest are retained; raw callback secrets/payloads are not a consumer relation.                                                  |
| Membership / rights             | `subscriptions` → `memberships`, `membership_history`, `entitlements`, `plan_entitlements`               | a verified payment or server-authorized grant creates time-bounded, revocable Membership/entitlement projections; history records lifecycle/source, not a client plan claim.                                                                                               |
| Benefits                        | `campaigns`, `coupons`, `redemption_codes`, `redemptions`, `benefit_grants`, `redemption_benefit_grants` | coupons/redemption codes are bounded by active window/count and one-user redemption constraints; code secrets are stored as a hash plus non-secret prefix; grants are shaped as capability, membership days, storage bytes, coupon, or badge and are revocable/idempotent. |
| Recognition / referrals / quota | `badges`, `user_badges`, `invite_relationships`, `invite_rewards`, `storage_grants`                      | badge and invite-reward links are separate auditable records; each invitee has at most one inviter; storage grants use positive integer bytes and never bypass Archive media authorization.                                                                                |
| Administration                  | `membership_admin_audit`                                                                                 | campaign/coupon/redemption/benefit/payment-metadata operations use separately authenticated server administration and append an audit row; consumers get no direct write policy.                                                                                           |

Consumer RLS is self-scoped for Membership, orders, payment metadata, refunds, entitlements,
history, benefits, redemptions, badges, invite participants, and storage grants. Callback events,
admin audit, catalogue-management relations, redemption-code hashes, and server grant joins have
no consumer direct policy. Production must apply/rehearse this migration with a server role and a
concrete `MembershipDurableRepository`; the checked-in SQL and local adapters do not assert that a
production database has been migrated or that payment data has been verified there.

## Phase 7 AI Usage schema

Migration `infrastructure/database/008_phase7_ai_usage.sql` is additive and is a reviewed
deployment input, not proof that a production database has been migrated. It creates:

| Aggregate                 | Relations                                                                            | Required invariant                                                                                                                                                   |
| ------------------------- | ------------------------------------------------------------------------------------ | -------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Approved registry         | `ai_usage_provider_registry`, `ai_usage_app_registry`                                | fixed provider/app vocabulary, status and allowed collector types; consumer clients cannot write either registry.                                                    |
| Owner control and pairing | `user_ai_usage_preferences`, `ai_usage_pairings`, `ai_usage_devices`                 | all automatic controls default false; pairing/device credentials are SHA-256 verifiers, issued plaintext once, ingest-scoped and revocable.                          |
| Ingest/idempotency        | `ai_usage_batches`, `ai_usage_idempotency`                                           | batch identity is unique per device; manual/import/range-delete keys are owner scoped and conflict on a changed payload.                                             |
| Source sessions           | `ai_usage_sessions`, `ai_usage_canonical_activities`, `ai_usage_session_corrections` | session rows contain only approved metadata; opaque activity digests implement source precedence/deduplication; corrections/deletes preserve reason/timestamp state. |
| Projection                | `ai_usage_daily_aggregates`                                                          | private per-owner/local-day/timezone/app/provider duration/count cache, recomputed from canonical active sessions.                                                   |

No Phase 7 relation has a prompt, response, content, title, screenshot, raw domain, full URL,
cookie, token, keystroke, or clipboard column. All migration-008 relations use `ENABLE ROW LEVEL
SECURITY` plus `FORCE ROW LEVEL SECURITY`; raw consumer SQL policies are deliberately absent.
Trusted server adapters apply principal-derived owner scope and return safe projections, while
collector verifiers/hashes, client event ids, activity digests, batch fingerprints and correction
reasons remain server-only. `ROOT_READ_AI_USAGE` is a distinct Root capability; every bounded Root
metadata read is audited and ordinary Admin/Moderator has no direct access.

## Phase 8 AI Gateway schema

Migration `infrastructure/database/009_phase8_ai_gateway.sql` is additive, reviewed deployment
input for the Unified AI Gateway. It is **not** proof that a production PostgreSQL database has
been migrated, that a durable repository has been wired, or that an external Provider has been
configured. It preserves the separate Phase 7 AI Usage aggregate and introduces no consumer
direct-SQL policy.

| Aggregate                          | Relations                                                                                                                                | Required invariant                                                                                                                                                                                                                                                                                                                                                        |
| ---------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Provider/model/capability registry | `ai_gateway_providers`, `ai_gateway_models`, `ai_gateway_capabilities`, `ai_gateway_model_capabilities`, `ai_gateway_model_availability` | Registry is server-maintained; provider adapter type/base-reference state, model context/pricing/release/deprecation/sync metadata, capability and availability history survive deprecation rather than deleting historical references. Registry rows contain descriptive configuration state only, never a provider API key.                                             |
| System and user credentials        | `ai_gateway_system_credentials`, `ai_gateway_user_byok_credentials`, `ai_gateway_user_preferences`                                       | A system row contains only a managed-secret reference. A user BYOK row stores an encryption algorithm/key id/encrypted envelope, safe validation state and an optional server-only fingerprint; there is deliberately no plaintext key/token/value column or public raw-fingerprint projection. A user preference stores only default Provider/Model registry references. |
| Private AI conversation foundation | `ai_gateway_conversations`, `ai_gateway_messages`                                                                                        | AI conversations are separate from human Messaging and owner-scoped. Current service flow persists conversation metadata only; the reserved message relation requires encrypted content and is not a normal prompt/response archive.                                                                                                                                      |
| Invocation/stream history          | `ai_gateway_invocations`, `ai_gateway_invocation_events`, `ai_gateway_idempotency`, `ai_gateway_invocation_tool_policies`                | Invocation metadata is owner-scoped and idempotent. It records selected registry identifiers, state, count/size and `NONE` context scope—not a prompt, provider raw response, private attachment or arbitrary tool policy.                                                                                                                                                |
| Metering and availability          | `ai_gateway_usage_ledger`, `ai_gateway_provider_health`, `ai_gateway_policies`                                                           | Ledger records normalized usage/status numbers and health/circuit metadata only. Server-only policy rows freeze default execution/fallback/context/tool posture. Unknown provider pricing remains unpriced/not configured; no fabricated cost is stored.                                                                                                                  |
| Future-tool and Root operations    | `ai_gateway_tool_registry`, `ai_gateway_admin_audit`                                                                                     | Tools are deny-by-default/disabled in Phase 8. `ROOT_MANAGE_AI_GATEWAY` is a separate Root capability and registry/health actions append an AI Gateway audit row without provider secrets or user content.                                                                                                                                                                |

The migration seeds `LOCAL` as the sole active local-development path and seeds external provider
codes (`OPENAI`, `OPENAI_COMPATIBLE`, `ANTHROPIC`, `GOOGLE`, `CUSTOM`) as disabled/not configured.
It also reserves the standard capability registry, while only local text/chat, structured output
and streaming are active. `VISION`, image generation, audio, tool calling, code/reasoning and
embedding remain explicit disabled foundations unless a future approved adapter/policy activates
them.

Every Phase 8 Gateway relation has `ENABLE ROW LEVEL SECURITY` plus `FORCE ROW LEVEL SECURITY`.
The migration intentionally creates no raw consumer policy: trusted server composition derives the
authenticated owner and returns a safe DTO. The separate AI Gateway Root audit is append-only.
Production still requires a migration rehearsal with least-privileged database roles, an approved
managed-secret/KMS implementation, backup/restore evidence, encryption-key rotation procedure,
and a review of provider data handling. Those external steps are Human Action Required and must
not be inferred from local SQL or an in-memory development vault.

## Phase 9 Personal Knowledge schema

Migration `infrastructure/database/010_phase9_personal_ai_rag.sql` is additive to the Archive and AI
Gateway foundations. It stores derived personal-index state separately from Archive Originals and
does not create a consumer bypass around Archive ownership/RLS.

| Aggregate                  | Relations                                                                                                                                       | Required invariant                                                                                                                                                                                                                                                  |
| -------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Source and index lifecycle | `personal_knowledge_sources`, `personal_knowledge_chunks`, `personal_knowledge_embeddings`, `personal_index_jobs`, `personal_ai_index_versions` | Every source/chunk/embedding has an owner, canonical source identity, lifecycle state, occurrence time, revision/index version and content hash. Chunks are derived data; trash/delete/revision/reindex lifecycle changes make stale data unavailable to retrieval. |
| Query and citations        | `personal_ai_queries`, `personal_ai_citations`, `personal_ai_conversations`                                                                     | Query rows retain safe status/latency/count metadata, not normal-log copies of full source text, prompt context or raw Provider output. Citations are owner-authorized source references and cannot be used as an IDOR route.                                       |
| Insights and privacy       | `ai_insights`, `personal_ai_preferences`                                                                                                        | AI Insights are a separate truth layer linked to query/citations. Preference and versioned consent fields are self-owned; consent/version/accepted time do not grant a whole-account scope.                                                                         |

Every Personal Knowledge relation participates in the repository RLS pattern (`ENABLE` + `FORCE`
RLS with no raw consumer policy). Trusted service composition derives the owner and returns a
safe projection. Vectors, embeddings, provider/model identifiers and index metadata are derived
personal data: they are owner-isolated, deletable and never the only portable form of an archive.
The local deterministic embedding/vector provider is test/development support only; applying the
migration with least-privilege roles, a real vector backend and durable production repository is
Human Action Required.

## Phase 10 Creator Lab migration 012

Migration `012_phase10_creator_lab.sql` is additive and creates owner-scoped creator projects,
repositories/connections, workspace files/snapshots/changes, Git commit metadata, GitHub links,
releases/assets, exports, AI change sets and project settings. Composite owner keys, path/sensitive
content checks, encrypted content columns, checksums, `ENABLE/FORCE ROW LEVEL SECURITY`, and the
absence of consumer raw-table policies are intentional. It is not a production deployment claim;
apply, backup/restore, service-role grants and durable repository rehearsal remain pending.

## Phase 11 Sandbox Runtime migration 013

Migration `013_phase11_sandbox_runtime.sql` is additive and defines owner/project-scoped runtimes, tasks,
logs, processes, ports, private previews, workspace changes, usage, terminal sessions, secret-reference-only
environment metadata, hashed scoped-token metadata, artifacts and structured diagnostics. It enforces
`/workspace`, no host mounts/privileged/host network/PID/IPC/Docker socket and `ENABLE/FORCE ROW LEVEL
SECURITY` with no consumer raw-table policy. Applying migration 013, configuring the trusted service role and
deploying a durable provider/repository/worker are Production Readiness Human Action Required.

## Phase 12 Deployment migration 014

Migration `014_phase12_deployment.sql` is additive and defines deployments,
immutable artifacts, redacted logs/health, preview shares, custom domains,
environment/public variables, opaque secret references, usage, publishing
visibility/publication metadata and provider configuration references. It
uses owner composite keys, hostname/token/hash checks and `ENABLE/FORCE ROW
LEVEL SECURITY` without consumer raw-table policies. Applying it to real
PostgreSQL, configuring service-role grants, durable workers and backup/
restore remains `PENDING HUMAN ACTION`.

## Phase 13 migration 015

`infrastructure/database/015_phase13_social_connectors.sql` adds external account/credential-reference, OAuth-state, import-job/cursor, Social Archive, collection, publication and connector-audit relations. Tables use owner-scoped composite keys and FORCE RLS with no consumer raw-table policies; production service-role grants and migration rehearsal remain pending human action. No plaintext token, cookie, refresh secret or provider credential is stored. The service now has an explicit owner-scoped persistence seam and local restart-test implementation; a real Postgres repository is still a production gate, not claimed complete.

## Migration 016 — Portable Archive

`infrastructure/database/016_phase14_portable_archives.sql` is additive and stores owner-scoped
export/import jobs, section checksums, restore/conflict metadata, backup/version/download-token
metadata, Annual Archive projections and manual-only legacy plans/recipients/rules. Composite owner
constraints, `ENABLE/FORCE ROW LEVEL SECURITY` and no consumer raw-table policies are intentional.
Portable payload bytes belong in reviewed object storage; the local service uses an in-memory seam until
a durable repository/object-store implementation is deployed and rehearsed.

## Migration 020 — Creator Ecosystem

`020_phase20_creator_ecosystem.sql` extends, rather than duplicates, the
canonical Phase 10 creator project/workspace/release model. It adds owner
profiles, independent publication settings, ordered media, immutable published
snapshots, hashed expiring download grants, aggregate stats and audit events.
All relations use owner/project composite constraints where applicable and
`ENABLE` plus `FORCE ROW LEVEL SECURITY`; no raw consumer policy is granted.
The migration is a design and local-development foundation only. Applying it,
rehearsing service-role grants/RLS, durable repository transactions, artifact
storage/scan and backup/restore are Production Readiness Human Action Required.

## Migration 021 — Phase 21 billing platforms

`021_phase21_billing_platforms.sql` is additive to canonical commerce tables
from migration 007. It adds provider/platform-to-frozen-plan mappings,
provider subscription/cancellation metadata, reconciliation jobs/items and
Apple IAP provider recognition; it does not create a second product, order,
payment, Membership or entitlement truth. New internal billing relations use
`ENABLE` plus `FORCE ROW LEVEL SECURITY` and intentionally have no consumer
raw-table policy. Applying/rehearsing migration 021, named service-role grants,
real transaction behavior, backup/restore and provider reconciliation remain
Production Readiness Human Action Required.
