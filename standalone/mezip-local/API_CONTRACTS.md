# API Contracts

## Phase 19 Connected Apps / External Identity

`/v1/external-identities` is self-scoped through the trusted request principal.
It lists, creates, updates, hides/shows, orders, disconnects, and resolves a
server-validated launch plan for external identity metadata. It never accepts
an owner/root/plan/provider-token/cookie/raw-provider-response field.

Routes are `GET /providers`, `GET|POST /`, `GET|PATCH|DELETE /:id`,
`PATCH /:id/visibility`, `POST /reorder`, `GET /connections`,
`POST /oauth/start`, `POST /oauth/callback`, `POST /:id/disconnect`, and
`POST /:id/launch`. Public safe fields alone are available from
`GET /v1/public/profiles/:ownerId/external-identities`; QR media IDs,
credential references, scopes, and owner data are omitted.

## Phase 18 messaging and community completion

Consumer messaging routes are self-scoped through the trusted request principal. The Phase 18
request flow is `POST /v1/messaging/requests` with only `recipientUserId`, then
`POST /v1/messaging/conversations/{conversationId}/request` with `ACCEPT` or `REJECT`.
Both accept an idempotency key and never accept an owner, participant list, role, plan, Founder, or
Root field. Conversation, unread/read, message, block, report, group, channel and activity routes
continue to use their existing typed SDK/API surfaces rather than a duplicate Phase 18 API system.

Message responses and notification tasks expose safe state and identifiers only; they do not expose
unrelated transcript bodies, raw private-media URLs, credentials, or moderation-wide private data.

## Baseline

- JSON over versioned HTTPS routes: `/v1/...`
- All writes require an `Idempotency-Key` unless the route is explicitly safe/idempotent.
- Every request carries a generated `X-Request-Id`; responses echo it.
- Server derives `principalId`, tenant/owner scope, price, entitlement, and permission.
- Dates are ISO 8601 UTC timestamps; local-day queries also include an IANA timezone.
- Monetary amounts are integer CNY fen.

## Response envelope

```ts
type ApiSuccess<T> = { data: T; meta: { requestId: string } };
type ApiFailure = {
  error: { code: string; message: string; retryable: boolean; requestId: string };
};
```

Do not expose SQL, provider error bodies, secrets, or another tenant’s identifiers.

## Authorization rule

Routes never accept a trusted `userId`/`ownerId` from the client for self-scoped data.
Collection queries resolve `owner_id = authenticated_principal.id`. Resource routes load by
opaque ID **and** owner scope in the same query; a non-match returns a privacy-preserving
`404` where appropriate.

`FREE` is a real server-derived baseline, not a display-only placeholder. The archive, basic
media, Timeline, history, fitness, movement, basic AI Usage, statistics, profile, and export
contracts are available for the authenticated principal's own resources. Public Community
reads and explicitly published Founder `FOUNDER_FREE` snapshots are also readable. Community writes
require `GO` or higher; Founder Inbox access is authorized server-side by
`FOUNDER_INBOX_ACCESS`, with optional server-only ordering through `FOUNDER_PRIORITY_INBOX`; creator
surfaces require the documented higher-tier entitlement. A client plan label never authorizes a
Founder route. None of these contracts permits cross-owner reads or access to a Founder private
source record.

Membership and content privacy are separate decisions. Ordinary user content uses only
`PRIVATE`, `COMMUNITY`, `GROUP`, `DIRECT_SHARE`, or `PUBLIC`; `FREE`/`GO`/`PLUS`/`PRO`/
`PRO_MAX` are not visibility values. A private Original is never exposed by an entitlement.
The owner must explicitly publish a separate Published Snapshot, and later edits require an
explicit snapshot update or new version rather than silently changing an already-published copy.

## Contract families

| Prefix           | Contract                                                                                                    |
| ---------------- | ----------------------------------------------------------------------------------------------------------- |
| `/v1/archive`    | private records, timeline, history, fitness, life, export, deletion                                         |
| `/v1/media`      | intent, upload completion, scan status, safe delivery URL                                                   |
| `/v1/community`  | Feed, published posts/snapshots, interactions, Groups, Channels, Activities, notifications, reports, search |
| `/v1/messaging`  | conversation membership, send/ack/read/sync, offline/realtime and safe message operations                   |
| `/v1/membership` | authenticated membership overview, frozen catalogue, benefits, coupons, and redemptions                     |
| `/v1/billing`    | server-priced checkout, owned orders, and refund requests                                                   |
| `/v1/payment`    | provider callback ingress only; never a consumer-success endpoint                                           |
| `/v1/ai-gateway` | authenticated self-service provider/model/capability projections and AI invocation boundary                 |
| `/v1/admin`      | Command Center projections and high-risk workflows with audit/re-auth                                       |
| `/v1/connectors` | consented official OAuth, import state, disconnect                                                          |
| `/v1/external-identities` | self-owned Connected Apps profile metadata, official OAuth state, visibility, ordering and launch plans |

## Normal API versus Admin API boundary

The consumer path is:

`Consumer Web/Mini Program → Normal User API`

The platform-admin path is:

`Admin Command Center → Admin API → Root Authorization → Domain Services → Database`

`/v1/admin` is not a consumer endpoint: Web/Mini Program clients do not receive Root
credentials, Root claims are never accepted from a request body/header/URL, and no client
connects directly to the database. The server resolves the authenticated ODR identity and the
narrow capability for each Admin request. The API contract reserves separate capabilities for
`ROOT_READ_USER_DATA`, `ROOT_READ_SENSITIVE_DATA`, `ROOT_READ_PRIVATE_MESSAGES`,
`ROOT_MODIFY_USER_DATA`, `ROOT_DELETE_USER_DATA`, `ROOT_EXPORT_USER_DATA`, `ROOT_BULK_EXPORT`,
`ROOT_MANAGE_CHANNELS`, `ROOT_MANAGE_ENTITLEMENTS`, `ROOT_MANAGE_BENEFITS`, and `ROOT_VIEW_AUDIT`.
Read never implies write/delete/export/message access, and `ROOT_BULK_EXPORT` is default-disabled.
`ROOT_MANAGE_AI_GATEWAY` is a separate capability for the Phase 8 provider-registry/health
maintenance boundary; it does not grant provider-secret visibility, user BYOK visibility, or
private AI conversation access.

The only Root identity is `ORIGINAL_DEVELOPER_ROOT`. It is server-side, separate from all
membership plans and ordinary `ADMIN`/`SUPER_ADMIN` roles, and cannot be assigned by a normal
role API. ODR reads of private or sensitive data require stronger Root authentication and append
an automatic `ADMIN_ACCESS_AUDIT` event. At minimum the event records `admin_id`,
`target_user_id`, resource/action, timestamp, session/device/IP/environment context, and an
optional reason. ODR platform reads do not wait for temporary target-user approval; the Root
session, capability, and audit are the authorization boundary. Audit events are append-oriented
and not deletable through ordinary Admin UI.

## Phase 1 identity and session contracts

All auth routes are versioned, rate-limited, and return opaque IDs. They never accept a
client-supplied `userId` as an authority.

| Route                                                                                           | Contract                                                                                                                                                    |
| ----------------------------------------------------------------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `POST /v1/auth/otp/start`                                                                       | Normalize an Email/Phone identifier, create a single-use challenge, hash the code, enforce cooldown/rate limits, and dispatch through a configured adapter. |
| `POST /v1/auth/otp/verify`                                                                      | Verify challenge/code once; reject expired, locked, consumed, or replayed challenges; resolve/create the unified User and issue a session after consent.    |
| `POST /v1/auth/providers/{provider}/verify`                                                     | Verify a WeChat/Google adapter assertion and resolve/create one User; provider credentials never enter the response.                                        |
| `POST /v1/auth/refresh`                                                                         | Rotate the refresh credential; reuse of a retired credential revokes its session family.                                                                    |
| `POST /v1/auth/logout` / `POST /v1/auth/logout-all`                                             | Revoke one session or all principal sessions idempotently.                                                                                                  |
| `GET /v1/auth/identities` / `POST /v1/auth/identities/link` / `DELETE /v1/auth/identities/{id}` | List, verify-and-link, or safely unlink identities with last-recovery-identity protection.                                                                  |
| `GET /v1/auth/sessions` / `DELETE /v1/auth/sessions/{id}`                                       | List and revoke only the authenticated principal's device sessions.                                                                                         |
| `GET /v1/me` / `POST /v1/me/consents` / `POST /v1/me/account-deletion`                          | Read self, record consent versions, and create a verified deletion request.                                                                                 |

The response envelope exposes a short-lived access token and a refresh credential only over
the approved transport; logs and errors expose neither. Local adapters may return a test
delivery marker, but production adapters must not reveal OTP content.

## Entitlement and Benefits contract

Domain routes call a server-side capability resolver. A request may receive a capability
decision with `allowed`, `code`, and an expiry/source explanation suitable for UI messaging;
it may not submit an authoritative plan, amount, grant, coupon result, or entitlement flag.
Phase 6 implements idempotent, auditable, time-bounded, owner/audience-scoped campaign,
benefit, coupon, and redemption workflows. A result is still limited by owner scope, snapshot
audience, consent, moderation, block/mute, retention, and revocation rules.

## Channels, publication, and simulator foundation

Channel contracts reserve `OFFICIAL`, `COMMUNITY`, `BETA`, `FEEDBACK`, `EVENT`, `CREATOR`, and
`DEVELOPER` types. Joining a channel does not authorize archive reads. Channel posts/snapshots
are created only by an explicit user publish/post/reply/upload action and remain separate from a
private Original. Founder/Official audience tiers apply to those published items only.

The Membership Simulator is an ODR/development-only context (`VIEW AS FREE`, `VIEW AS GO`,
`VIEW AS PLUS`, `VIEW AS PRO`, `VIEW AS PRO MAX`). It changes only simulated entitlement
resolution, must return a visible `DEVELOPMENT SIMULATION`/`VIEWING AS …` marker, and cannot
mutate a real subscription, payment, Root identity, or production membership state.

Admin responses must never contain plaintext passwords, OTPs, refresh/access tokens, OAuth,
WeChat/payment, encryption-master, or provider API secrets. Secret routes expose only
rotate/replace/revoke operations backed by encrypted server-side storage.

## Critical write contracts

### Publish an authorized source as a Published Snapshot

`POST /v1/community/snapshots { sourceEntryId, sourceRevision?, selectedFieldKeys?, selectedMediaIds?, target? }`

The client supplies only an opaque, owner-authorized source reference and an allowlisted selection;
it never sends a raw private Original body, copied private media payload, or client-authored owner/
audience authority. `target` may carry only permitted ordinary destination metadata/visibility,
never a plan or Founder-audience value. The server verifies ownership and source eligibility,
re-resolves the selected source fields/media itself, creates a separate Published Snapshot with the
server-derived target/audience policy, and records an audit event. It never flips the source
Original to public. A later change requires an explicit snapshot update or a new published version.

### Start checkout

`POST /v1/billing/checkouts { planCode, provider, couponCode? }` with `Idempotency-Key`

`planCode` excludes `FREE`; `provider` is a validated provider code; a coupon is an optional
opaque code. The server looks up the frozen product price, validates the coupon and upgrade policy,
creates an expiring order, invokes the configured provider adapter, and returns only the provider
payload appropriate for that adapter. `amount`, `paymentSuccess`, entitlement list, `userId`,
Admin/Root field, or callback trust field are rejected/ignored as non-authoritative.

### Payment callback

`POST /v1/payment/callbacks/{provider}`

The callback uses the raw provider body plus headers and has no browser/Mini principal. The server
delegates signature verification to the configured provider adapter before order activation, then
checks provider/order binding, CNY integer-fen amount, currency, expiry/state transition, and
unique provider transaction replay protection. Only that verified path may create the paid
Membership/entitlement projection. An unavailable provider/verifier fails closed; this contract
does not claim a production provider callback has been connected or verified.

## Phase 6 Membership, Benefits, and Billing contracts

**Local acceptance status:** the route facade, schemas, typed SDK, and local domain implementation
have passed local acceptance. Production provider integration remains Human Action Required and is
not Phase 7 scope. All normal-user routes derive the authenticated principal. Every POST shown
below requires `Idempotency-Key` unless it is an explicitly idempotent read.

| Route                                                                                         | Contract                                                                                                                                                                                                                                     |
| --------------------------------------------------------------------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `GET /v1/membership/overview`                                                                 | Returns only the caller's effective plan, active Membership projection, server-resolved entitlements, own benefit grants, and aggregated storage quota (`base + plan + benefit + manual` bytes). It never changes entitlement state.         |
| `GET /v1/membership/plans`                                                                    | Returns the frozen catalogue only: FREE `0`, GO `1000`, PLUS `2000`, PRO `4000`, PRO_MAX `8000`, all CNY integer fen and non-auto-renewing monthly-pass metadata.                                                                            |
| `GET /v1/membership/benefits`, `GET /v1/membership/coupons`, `GET /v1/membership/redemptions` | Returns caller-safe benefit/coupon/redemption projections. Coupon eligibility and prior-use checks are repeated by checkout; secret redemption codes and another user's grants are never returned.                                           |
| `POST /v1/membership/redemptions { code }`                                                    | Rate-limited, hash-checked, one-user/one-code idempotent redemption. A valid code can issue only its predefined membership-days, storage, capability, and/or badge benefit; it cannot accept client-supplied benefit data.                   |
| `GET /v1/billing/orders`, `GET /v1/billing/orders/{orderId}`                                  | Returns only the authenticated user's orders, including server-derived base/discount/payable CNY-fen amounts and truthful state. Unknown/cross-owner IDs are privacy-preserving `404`s.                                                      |
| `POST /v1/billing/checkouts { planCode, provider, couponCode? }`                              | Creates/reuses an expiring server-priced checkout. Client payload never selects the amount, success state, owner, entitlements, or grant. A missing/unconfigured provider returns a safe unavailable error instead of a fabricated checkout. |
| `POST /v1/billing/orders/{orderId}/refund-requests { reason }`                                | Creates/reuses a caller-owned paid-order refund request. It records `REQUESTED`; it must not report a completed provider refund or alter access until the server's refund/reconciliation policy does so.                                     |
| `POST /v1/payment/callbacks/{provider}`                                                       | Provider-only ingress as defined above. It is not callable as a consumer confirmation endpoint and has no consumer principal.                                                                                                                |
| `POST /v1/admin/membership/campaigns`, `PATCH /v1/admin/membership/campaigns/{id}/status`     | Separately authenticated Membership Administration create/status operations for campaign code, audience, window, and reason.                                                                                                                 |
| `POST /v1/admin/membership/coupons`, `POST /v1/admin/membership/redemption-codes`             | Creates a server-owned coupon or secure redemption definition. Redemption responses expose a secret code only at controlled issuance time; persisted projections use a hash/prefix rather than the secret.                                   |
| `POST /v1/admin/membership/benefits`, `POST /v1/admin/membership/benefits/{id}/revoke`        | Grants/revokes a time-bounded capability/feature, membership-days, storage-bytes, or badge benefit with reason, idempotency, and audit. It never changes private-record ownership or ordinary content visibility.                            |
| `GET /v1/admin/membership/payments`                                                           | Narrow, separately authenticated payment-metadata view with an audit event. It exposes no raw callback body, provider secret, or client-selected Root bypass.                                                                                |

Membership Administration requires a server-authenticated admin identity and the narrow
`MANAGE_CAMPAIGNS`, `MANAGE_COUPONS`, `MANAGE_REDEMPTIONS`, `GRANT_BENEFITS`,
`MANAGE_MEMBERSHIPS`, or `VIEW_PAYMENT_METADATA` capability applicable to the operation. It is
not granted by a customer plan, `ADMIN`/`SUPER_ADMIN` role label, browser field, or `root=true`
parameter. Root capabilities remain separate and do not expose payment/provider secrets.

Expected safe errors include `PROVIDER_UNAVAILABLE`, `ORDER_EXPIRED`, `ORDER_NOT_PAYABLE`,
`PAYMENT_NOT_VERIFIED`, `PAYMENT_AMOUNT_MISMATCH`, `PAYMENT_CURRENCY_MISMATCH`,
`PAYMENT_PROVIDER_MISMATCH`, `PAYMENT_REPLAY`, `COUPON_INVALID`, `COUPON_ALREADY_USED`,
`REDEMPTION_INVALID`, `REDEMPTION_ALREADY_USED`, `UPGRADE_POLICY_REQUIRED`, and idempotency
conflict/replay codes. Clients render these inline or at route level and never use a popup or a
local success toggle to claim payment/entitlement completion.

## Phase 5 Messaging contracts

`/v1/messaging` is the normal-user Messaging boundary. It receives a session-authenticated
principal from the server and derives sender, conversation membership, Group Membership, block
relationship, entitlement, owner scope, and Root context there. It never accepts a trusted
`userId`, participant/member list, plan, entitlement, `isFounder`, Admin/Root claim, or
`root=true` override from the client.

The canonical client-retry identity is `clientMessageId` (wire casing) / `client_message_id`
(storage casing). A send has one stable ID before local offline enqueue; the server enforces a
unique sender/client-message relation and returns the original result for the same-payload replay.
A reused ID with a different payload receives a safe idempotency conflict. Message bodies,
attachment IDs, reply target, and search query are schema-bounded; raw storage keys, signed URLs,
private Archive content, and media bytes are not accepted on this API.

| Route family                                                                                                             | Contract                                                                                                                                                                                                                                                                                                                                                                                                            |
| ------------------------------------------------------------------------------------------------------------------------ | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `GET /v1/messaging/conversations?cursor=…&includeArchived=…`, `GET /v1/messaging/conversations/{id}`                     | Cursor-paginated, member-authorized Inbox summaries/detail with safe preview, unread/pin/mute/archive context and no inaccessible conversation projection. Client view filters cannot broaden the server result.                                                                                                                                                                                                    |
| `POST /v1/messaging/conversations/direct`                                                                                | Opens/reuses a canonical one-pair DM from an opaque target reference. Server checks authenticated actor, DM policy, Block, anti-spam and pair uniqueness; the client cannot supply its own participant list. A configured Founder target is rejected here and may only be opened through the explicit Founder Inbox command.                                                                                        |
| `POST /v1/messaging/conversations/group`                                                                                 | Opens/reuses a Group Conversation from an opaque Group reference. The server rechecks Phase 4 active membership and Group owner/admin creation policy; caller-supplied members or roles are ignored.                                                                                                                                                                                                                |
| `GET /v1/messaging/founder/inbox`, `POST /v1/messaging/founder/conversation`                                             | Founder Inbox list/open path. Server resolves `FOUNDER_INBOX_ACCESS`; the command alone creates or marks the durable Founder-Inbox conversation relation. `FOUNDER_PRIORITY_INBOX` is separate server-side ordering only. A plan string never grants access or implies a reply-time promise.                                                                                                                        |
| `GET /v1/messaging/conversations/{id}/messages?cursor=…`, `GET /…/{id}/messages/backfill?afterSequence=…`                | Cursor-paginated authorized Messages and safe realtime-gap backfill. Group read requires active Group Membership; a non-member/removed/banned principal cannot infer message existence, sender, attachment, or sequence.                                                                                                                                                                                            |
| `POST /v1/messaging/conversations/{id}/messages`                                                                         | Sends `{ clientMessageId, body?, mediaIds?, replyToMessageId? }`. The server derives sender, checks active membership/block/rate/moderation/media authorization, writes atomically and emits outbox/realtime/notification work. The server derives canonical `TEXT`, `IMAGE`, `VIDEO`, `VOICE`, `FILE`, or `SYSTEM` type from the authorized body/media reference; media IDs resolve through Phase 3 Media Service. |
| `PATCH/DELETE /v1/messaging/messages/{messageId}`                                                                        | Author-scoped edit/soft-delete with status/version checks. A delete does not erase another member's receipt/audit requirement or change a private Archive Original.                                                                                                                                                                                                                                                 |
| `PUT/DELETE /v1/messaging/messages/{messageId}/reactions/{type}`                                                         | Idempotent active/remove reaction relation; state is authorized by conversation membership and returned as a safe aggregate/projection.                                                                                                                                                                                                                                                                             |
| `POST /v1/messaging/conversations/{id}/read`, `GET /v1/messaging/unread`                                                 | Per-member receipt/read-sequence and unread summaries. Group receipt is not a global `message.read = true`.                                                                                                                                                                                                                                                                                                         |
| `GET/PUT/DELETE /v1/messaging/conversations/{id}/draft`, `PATCH /…/{id}/preferences`, `GET/PATCH /v1/messaging/settings` | Self-scoped draft, personal mute/archive/pin and user notification/DM settings. They do not alter another member's view or grant message access.                                                                                                                                                                                                                                                                    |
| `GET /v1/messaging/search?q=…`                                                                                           | Searches only conversations the authenticated principal can read; no Archive fallback, cross-user private match, or hidden result count.                                                                                                                                                                                                                                                                            |
| `POST /v1/messaging/conversations/{id}/typing`, `GET /v1/messaging/presence/{userId}`, `PATCH /v1/messaging/presence`    | Authorized short-TTL typing and coarse `ONLINE`/`AWAY`/`OFFLINE` presence foundation. They do not create durable Message rows or disclose an unrelated user.                                                                                                                                                                                                                                                        |
| `PUT/DELETE /v1/messaging/blocks/{userId}`, `POST /v1/messaging/messages/{messageId}/reports`                            | Actor-owned block and controlled Message report. A block prevents new DM/send in the blocked direction; reports preserve reporter privacy and enter the moderation foundation.                                                                                                                                                                                                                                      |
| `GET /v1/messaging/realtime` (authenticated WebSocket/SSE upgrade or equivalent)                                         | Authenticated event stream for `message.created`, `message.updated`, `message.deleted`, `message.reaction.updated`, `conversation.read`, `typing.started`, `typing.stopped`, and `presence.updated`. Events are scoped by the same membership query as REST; reconnect uses backoff and a refresh/poll backfill remains available.                                                                                  |
| `/v1/admin/messaging/...`                                                                                                | Separate Admin API only. Private transcript/attachment reads require server-resolved `ORIGINAL_DEVELOPER_ROOT`, `ROOT_READ_PRIVATE_MESSAGES`, stronger Root authentication, an explicit target/reason when required, and one automatic `ADMIN_ACCESS_AUDIT` for every read. Normal Admin/Moderator and all consumer routes are denied.                                                                              |

All Messaging errors use the standard safe envelope and map to inline UI states rather than raw
exception text or a surprise popup. Expected codes include `CONVERSATION_NOT_FOUND`,
`CONVERSATION_MEMBERSHIP_REQUIRED`, `FOUNDER_INBOX_REQUIRED`, `MESSAGE_BLOCKED`,
`MESSAGE_RATE_LIMITED`, `MESSAGE_IDEMPOTENCY_CONFLICT`, `ATTACHMENT_UNAVAILABLE`,
`REALTIME_UNAVAILABLE`, and `ROOT_CAPABILITY_REQUIRED`. Error/log/analytics payloads omit private
message body, attachment bytes/URLs, microphone data, and unseen conversation identifiers.

## Phase 4 Community contracts

`/v1/community` is the normal-user Community boundary. It receives the authenticated principal
from the server, never a trusted owner, author, moderator, membership-plan, Founder-audience, or
Root field from the client. Every Community route evaluates ordinary visibility (`PRIVATE`,
`COMMUNITY`, `GROUP`, `DIRECT_SHARE`, `PUBLIC`), group/channel membership, block state,
moderation/deletion state, and server-derived entitlement before it returns or mutates data.
Founder/Official audience (`FOUNDER_PUBLIC`, `FOUNDER_FREE`, `FOUNDER_GO`, `FOUNDER_PLUS`,
`FOUNDER_PRO`, `FOUNDER_PRO_MAX`) is a separate eligibility decision and never exposes a private
Original.

| Route family                                                                                                                | Contract                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                          |
| --------------------------------------------------------------------------------------------------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `GET /v1/community/feed?view=following\|discover\|latest&cursor=…`                                                          | Cursor-paginated eligible Feed. Response includes `nextCursor`/terminal state and a documented `rankingVersion`/factors summary. `latest` is chronological, `following` is chronological over eligible followed authors, and `discover` uses recent eligible content with a simple engagement tie-break only.                                                                                                                                                                                                                                                                                                                     |
| `GET /v1/community/search?q=…&cursor=…`                                                                                     | Searches only eligible public/Community/Group/Channel/Activity projections and public profile fields; never Archive Originals, private media, private Daily Packs, or private profile data.                                                                                                                                                                                                                                                                                                                                                                                                                                       |
| `POST /v1/community/posts`, `GET/PATCH/DELETE /v1/community/posts/{id}`                                                     | Create/read/edit/soft-delete an authored Community Post with text/image/video foundation/mixed content or a Published Snapshot reference. Statuses are `DRAFT`, `PUBLISHED`, `HIDDEN`, `REMOVED`, `DELETED`; edit/delete never changes the source Original.                                                                                                                                                                                                                                                                                                                                                                       |
| `POST /v1/community/snapshots`                                                                                              | Owner-only explicit publication from `{ sourceEntryId, sourceRevision?, selectedFieldKeys?, selectedMediaIds?, target? }`. `target` carries only permitted ordinary destination metadata/visibility, never a plan or Founder audience. The server—not the client—reads the eligible private source and re-resolves selected media IDs, then atomically returns `{ snapshot, post }`: an immutable Published Snapshot plus an independently editable Community Post envelope. Raw private Original content is not accepted. A source revision later changes only through explicit republish/update; it is never silently mirrored. |
| `PUT/DELETE /v1/community/posts/{id}/reactions/{type}`                                                                      | Idempotent reaction set/remove. V1 accepts `LIKE`; a unique actor/post/type relation prevents double-click duplicates.                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                            |
| `GET/POST /v1/community/posts/{id}/comments`, `PATCH/DELETE /v1/community/comments/{id}`                                    | Cursor-paginated comments/replies; `parentCommentId` permits one reply level in the UI. Authors control only their own comments; moderation is a separate capability.                                                                                                                                                                                                                                                                                                                                                                                                                                                             |
| `PUT/DELETE /v1/community/posts/{id}/save`                                                                                  | Idempotent private save/bookmark relation visible only to the saving principal.                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                   |
| `PUT/DELETE /v1/community/users/{id}/follow`, `PUT/DELETE /v1/community/users/{id}/block`                                   | Idempotent follow/block relations. Follow grants no private-data access; block prevents ordinary mutual Feed/interactions and does not affect ODR Admin access.                                                                                                                                                                                                                                                                                                                                                                                                                                                                   |
| `GET/POST /v1/community/groups`, `GET/PATCH/DELETE /v1/community/groups/{id}`                                               | Public/private Group lifecycle. `POST` requires the separately resolved `GROUP_CREATE` policy (Founder/Internal or explicit approved entitlement), never an unlimited default grant; owner/admin/member rules are server-side and a departing owner must transfer or archive.                                                                                                                                                                                                                                                                                                                                                     |
| `POST /v1/community/groups/{id}/memberships/{join\|leave\|approve\|remove\|ban}` and Group post routes                      | Unique membership and server-confirmed private Group access. Public join may be immediate; private join requires request/invite. Group posts require explicit publication, never automatic Archive import.                                                                                                                                                                                                                                                                                                                                                                                                                        |
| `GET /v1/community/channels`, channel membership/post routes                                                                | Typed Channel listing/subscription/join/post flows. Community submissions are explicit. Official Channel creation/moderation is excluded from consumer routes.                                                                                                                                                                                                                                                                                                                                                                                                                                                                    |
| `GET/POST /v1/community/activities`, activity detail/update routes, `PUT/DELETE /v1/community/activities/{id}/registration` | Online/offline Activity lifecycle plus idempotent join/cancel. Creation/update is server-scoped to Founder, eligible Group Owner, or future explicitly entitled Creator; it is not universally open. Capacity admission is server-atomic; attendee projections expose only approved public display data.                                                                                                                                                                                                                                                                                                                          |
| `GET /v1/community/notifications`, `POST /v1/community/notifications/{id}/read`                                             | Cursor-paginated minimal notification summaries and `UNREAD`/`READ`; no realtime/DM contract is implied.                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                          |
| `POST /v1/community/reports`                                                                                                | Report a post/comment/user/group/channel/activity with a controlled reason. Reporter identity is hidden from the reported target and body text is redacted from ordinary logs.                                                                                                                                                                                                                                                                                                                                                                                                                                                    |
| `/v1/admin/community/...`                                                                                                   | Separately authenticated Admin API for scoped moderation and ODR official-channel/community actions. Normal consumer tokens, `ADMIN`, `MODERATOR`, and membership plans cannot forge Root-only endpoints/capabilities.                                                                                                                                                                                                                                                                                                                                                                                                            |

All Community writes use `Idempotency-Key` unless their HTTP semantics are explicitly idempotent;
the service also maintains relation-level uniqueness for reaction/save/follow/block/group-join/
activity-registration. Capacity join, ownership transfer, snapshot publish, and moderation case
action use one transaction or an equivalent atomic boundary. Authorization never relies on a
stale cache, local plan string, hidden UI, caller-supplied ranking score, or `official` flag.

Community-specific errors remain privacy-preserving where a resource may be hidden:

- `COMMUNITY_NOT_FOUND` (`404`): resource is absent, deleted, hidden, blocked, or outside scope;
- `COMMUNITY_ENTITLEMENT_REQUIRED` (`403`): server-derived Community/Founder capability absent;
- `COMMUNITY_BLOCKED` (`403`): an ordinary interaction is blocked;
- `GROUP_MEMBERSHIP_REQUIRED` (`403`): private Group scope is absent;
- `CONTENT_UNAVAILABLE` (`409`): status/moderation/deletion prevents mutation;
- `ACTIVITY_FULL` (`409`): atomic capacity check declined the registration; and
- `COMMUNITY_IDEMPOTENCY_REPLAY` (`409`): a reused key has a different payload.

Community responses provide calm, actionable UI-safe codes; browser/Mini clients must render an
inline or route-level explanation rather than a raw `403` or surprise popup. Notification polling
or explicit refresh remains allowed. Realtime Messaging, DM/group chat, and the dedicated Phase 5
contracts below are separately authorized; no Community route becomes a private-message override.

## Phase 3 archive contracts

All routes below are under `/v1/archive` (except `/v1/media`), require an authenticated
principal, and derive owner scope from that principal. Collection endpoints use cursor
pagination and accept an IANA timezone for local-day grouping. Mutating requests require an
`Idempotency-Key`; updates additionally send `expectedRevision` (the adapter accepts the
legacy alias `expectedVersion`) and return a conflict rather than silently replacing a newer
revision.

| Route                                                                               | Purpose                                                                                                                                                                                             |
| ----------------------------------------------------------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `POST /v1/archive/life` / `GET /v1/archive/life`                                    | create and cursor-list the caller's private Life entries                                                                                                                                            |
| `GET/PATCH/DELETE /v1/archive/life/{id}`                                            | read, create a revision, or soft-trash one owned entry                                                                                                                                              |
| `GET /v1/archive/life/{id}/revisions`                                               | list immutable revisions for the owned entry                                                                                                                                                        |
| `POST /v1/archive/life/{id}/restore` / `POST /permanent-delete`                     | restore or explicitly destroy a trashed entry                                                                                                                                                       |
| `POST /v1/archive/life/{id}/publish`                                                | Phase 3 local/archive publication foundation; source remains private. A delivered Community snapshot uses the separately specified `POST /v1/community/snapshots` owner-authorized-source contract. |
| `GET/POST /v1/archive/life/{id}/ai-insights`                                        | list or append an AI insight tied to the exact source revision                                                                                                                                      |
| `GET /v1/archive/timeline`                                                          | aggregate owner-scoped source references by time range/type                                                                                                                                         |
| `POST /v1/archive/history` and `GET/PATCH/DELETE /history/{id}`                     | History/Reading CRUD                                                                                                                                                                                |
| `POST /v1/archive/fitness` and `GET/PATCH/DELETE /fitness/{id}`                     | Fitness session CRUD                                                                                                                                                                                |
| `POST /v1/archive/body-metrics` / `POST /v1/archive/steps`                          | optional body metrics and source-labelled steps                                                                                                                                                     |
| `GET /v1/archive/daily-pack/{date}` / `POST /v1/archive/daily-pack/{date}/complete` | deterministic local-day summary and idempotent pack index                                                                                                                                           |
| `GET /v1/archive/search?q=...`                                                      | owner-scoped search over Life, History, Fitness and Timeline references                                                                                                                             |
| `POST /v1/archive/export` / `GET /v1/archive/exports/{id}`                          | authorized JSON/`.mezip` manifest export and status                                                                                                                                                 |
| `POST /v1/media/intents` / `POST /v1/media/{id}/complete` / `GET /v1/media/{id}`    | quota-checked metadata intent, hash/scan completion and safe owner read                                                                                                                             |
| `GET /v1/media/{id}/download`                                                       | owner-checked, scan-approved, expiring signed read URL                                                                                                                                              |

Life, History, Fitness, media, revisions and exports all enforce object-level ownership in
the server handler. A client cannot submit `ownerId`, another principal's `userId`, a plan,
an entitlement, a price, or an audience as an authority. `published_snapshots` are created by
the explicit publish route and are never inferred from a private record's UI state.
The Phase 3 archive route remains a non-delivered `SNAPSHOT` foundation. Phase 4 Community
delivery uses the separately authorized `POST /v1/community/snapshots` contract and never accepts
raw Original content from the client. Ordinary content visibility is
`PRIVATE`/`COMMUNITY`/`GROUP`/`DIRECT_SHARE`/`PUBLIC`; any Founder/Official tier audience is a
separate policy on the Published Snapshot, never a replacement for ownership or an entitlement
to read its private source.

Life creation accepts an optional IANA `timezone`, `recordSource`, and `deviceId`; the server
assigns `serverReceivedAt`. Timeline responses keep `occurredAt`, `createdAt`, `updatedAt`,
`serverReceivedAt`, and timezone distinct so backfilled events do not move to their import date.
Export responses expose the canonical `schema_version` / `exported_at` manifest fields, explicit
Life/History/Fitness/Daily Pack and timeline metadata collections, and `media_policy=MANIFEST_ONLY`;
trash inclusion is explicit rather than silently exporting deleted records.

### Phase 3 response and error additions

The existing envelope remains authoritative. Archive handlers may return:

- `ARCHIVE_VERSION_CONFLICT` (`409`, retryable): expected version is stale;
- `ARCHIVE_IDEMPOTENCY_REPLAY` (`409`, non-retryable): key was used with a different payload;
- `ARCHIVE_NOT_FOUND` (`404`, privacy-preserving): ID is absent or outside owner scope;
- `ARCHIVE_FORBIDDEN` (`403`): capability or state disallows the operation;
- `MEDIA_QUOTA_EXCEEDED` (`413`): quota/size policy failed; and
- `ARCHIVE_OFFLINE_PENDING` (`202`): local adapter has retained a draft for later retry.

Responses never include private bodies in logs or analytics, and AI insight payloads are
explicitly marked `AI_GENERATED` and returned separately from source records.

The framework-neutral implementation seam is `services/archive/src/api.ts` (`ArchiveApiAdapter`).
It maps the route table to the same owner-scoped repository used by tests and local adapters;
HTTP/WeChat transport code must provide the authenticated principal and never accept a client
`ownerId` as authority. Publication and AI routes are deliberately separate from source CRUD:
`POST /v1/archive/life/{id}/publish` creates only the non-delivered archive snapshot foundation,
while `POST /v1/community/snapshots` creates the separately authorized Community delivery copy and
`POST /v1/archive/life/{id}/ai-insights` records an append-only insight tied to an exact source
revision. None of those routes mutates the Original or its Revision history.

Phase 3 scope established ownership, publication, Root authorization, capability, audit, and API
boundaries. Phase 4 activates the separately specified Community contracts while preserving the
archive owner boundary. Phase 5 activates the Messaging contracts above, and Phase 6 activates the
bounded Membership/Benefits/Billing route facade. Neither activates a complete Admin Command
Center UI, merchant onboarding/live-provider verification, AI recommendation/connector, or
code-execution contracts.

## Phase 7 AI Usage contracts

All ordinary AI Usage routes derive the authenticated owner. They never accept `userId`, collector
source/platform authority, paired device id, activity digest, registry write, plan/entitlement, or
Root/Admin field from consumer JSON. Requests and responses are metadata-only; error envelopes
never echo a disallowed input.

| Route                                                                                                                                                                           | Contract                                                                                                                                                                                                                                                    |
| ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `GET /v1/ai-usage/apps`, `GET /v1/ai-usage/providers`                                                                                                                           | Read-only approved registry projection. It is not an AI model, credential, or gateway catalogue.                                                                                                                                                            |
| `GET /v1/ai-usage/overview`, `GET/PATCH /v1/ai-usage/preferences`                                                                                                               | Self-scoped aggregate and consent controls. Defaults are paused; patch controls only global/Windows/Browser enablement, idle threshold, and timezone.                                                                                                       |
| `GET /v1/ai-usage/devices`, `GET/POST /v1/ai-usage/pairings`, `DELETE /v1/ai-usage/devices/{deviceId}`                                                                          | Owner lists devices/pairings, creates a one-time pairing code, and revokes only their own device. Plain pairing/device credentials are never returned by list routes.                                                                                       |
| `GET /v1/ai-usage/sessions`, `POST /v1/ai-usage/manual-sessions`, `POST /v1/ai-usage/imports`, `PATCH/DELETE /v1/ai-usage/sessions/{sessionId}`, `DELETE /v1/ai-usage/sessions` | Owner-only metadata sessions, explicit manual/import source, correction/delete reason, range deletion and replay safety. Source precedence is server derived.                                                                                               |
| `GET /v1/ai-usage/export`                                                                                                                                                       | Owner export containing only safe sessions/aggregates/preferences/devices; no pairing verifier, device credential, raw activity digest, prompt/content, domain or URL.                                                                                      |
| `POST /v1/ai-usage/device-pairings/{pairingId}/complete`                                                                                                                        | Collector-only completion with pairing code and optional label. It issues one ingest-scoped credential once; it does not accept a user id or consumer session owner override.                                                                               |
| `POST /v1/ai-usage/batches`                                                                                                                                                     | Collector-only offline batch ingest. Auth is the `X-MEZIP-DEVICE-CREDENTIAL` header over authenticated transport; payload contains approved app/time/duration/opaque event metadata only and is rejected while tracking is paused or the device is revoked. |
| `GET /v1/admin/users/{userId}/ai-usage`                                                                                                                                         | Separate Admin API. Requires server-resolved `ORIGINAL_DEVELOPER_ROOT` plus `ROOT_READ_AI_USAGE`, returns bounded metadata only, and appends one Root audit event per read; normal consumer/Admin/Moderator routes are denied.                              |

Daily Pack integration is an internal Archive port, not a consumer route: AI Usage can merge only a
private aggregate stats fragment for the owner/local day. It must not create a public post,
Timeline source body, Founder snapshot, or recommendation. The native collector, browser
extension, real deployment transport, permission grant, and physical-device observation remain
Human Action Required; this contract does not claim actual collection has occurred.

## Phase 8 AI Gateway contracts

All `/v1/ai-gateway` consumer routes derive the owner and authority from the authenticated
principal. Consumer JSON has no `userId`, `ownerId`, `plan`, entitlement grant, Root/Admin flag,
provider credential id, system-secret reference, raw provider endpoint, quota override, cost,
fallback policy, tool allowlist or conversation-owner field. The API edge normalizes all provider
errors to safe product codes and never returns raw provider bodies, prompts, responses, keys or
encrypted BYOK envelopes.

| Route                                                                                      | Contract                                                                                                                                                                                                                                                                                                                            |
| ------------------------------------------------------------------------------------------ | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `GET /v1/ai-gateway/providers`, `/models`, `/capabilities`                                 | Read-only server registry projections. Current local development serves a `LOCAL` adapter; external provider/model entries remain disabled/not configured until server composition and official-provider verification are complete.                                                                                                 |
| `GET /v1/ai-gateway/quota`                                                                 | Owner-safe usage quota/remaining projection. The client cannot set usage, price, quota, credential mode or a plan/entitlement.                                                                                                                                                                                                      |
| `GET/PATCH /v1/ai-gateway/preferences`                                                     | Self-only saved Provider/Model registry references. The server rejects an unknown, unavailable or mismatched model; a saved default never chooses a credential or bypasses entitlement/availability checks.                                                                                                                         |
| `GET/POST /v1/ai-gateway/conversations`, `DELETE /v1/ai-gateway/conversations/{id}`        | Owner-private AI-domain conversation metadata only. It is not a human Messaging conversation and cannot select another owner. Mutations require an `Idempotency-Key`.                                                                                                                                                               |
| `GET/POST /v1/ai-gateway/invocations`, `GET /v1/ai-gateway/invocations/{id}`               | A self-owned normalized request with server-checked model/capability, entitlement, provider/model availability, credential strategy, quota and rate limit. Input permits only user messages, a local model code, explicit `NONE` context and optional self-owned AI conversation ID; the service owns provider choice and metering. |
| `GET /v1/ai-gateway/invocations/{id}/events`, `GET /v1/ai-gateway/invocations/{id}/stream` | Owner-scoped normalized stream metadata/event sequence. The stream handshake is transport-neutral; authenticated transport remains required. Output event ordering, failure and cancellation are represented without provider raw error exposure.                                                                                   |
| `POST /v1/ai-gateway/invocations/{id}/cancel`                                              | Owner-only, idempotency-keyed stop request. It stops consumer stream processing and calls the adapter cancellation seam when supported; it cannot change another owner’s request or claim a free retry.                                                                                                                             |
| `GET /v1/ai-gateway/byok`                                                                  | Safe per-owner provider status only: provider, configured/revoked state, created/last validation time and an optional non-reversible display mask. No GET route returns an envelope, plaintext key, raw fingerprint or secret reference.                                                                                            |
| `PUT/DELETE /v1/ai-gateway/byok/{providerCode}`                                            | Connect/revoke a self-owned non-local Provider BYOK record. The only accepted credential payload is an opaque encrypted envelope; client selection cannot force server credential precedence. The checked-in local vault is a development/test seam, not a production KMS claim.                                                    |

The gateway maps invalid input to `VALIDATION`, ownership absence to `NOT_FOUND`/`FORBIDDEN`,
entitlement failure to `ENTITLEMENT_REQUIRED`, quota/rate limits to `QUOTA_EXCEEDED`/
`RATE_LIMITED`, unavailable registry/credential state to a safe unavailable/configuration error,
and timeout/provider failures to a safe normalized error. Retryability is returned only as a safe
product hint. The current local adapter does not represent a real provider success, provider price,
or external data-retention commitment.

`/v1/admin/ai-gateway` is a separate server-composed Admin API. It requires the server-resolved
`ORIGINAL_DEVELOPER_ROOT` identity plus `ROOT_MANAGE_AI_GATEWAY`; consumer request fields such as
`admin=true` or `root=true` have no effect. Its current routes list provider metadata, set
provider/model status with an audited reason, synchronize the local model registry, read provider
health metadata, and write/read only an opaque system-credential configuration status. They deliberately do not reveal system credential references, BYOK
envelopes, plaintext keys, raw provider errors, AI prompts/responses or another user’s AI history.
Every registry/health action appends the separate AI Gateway admin audit trail.

Production API origin, external-provider adapter transport, provider credential configuration,
official API validation, server key-management integration, and deployed HTTPS verification are
Human Action Required. An absent production configuration fails closed; no consumer route may
silently switch to a local/mock provider in production.

## Phase 9 Personal AI contracts

All Personal AI consumer routes are under `/v1/personal-ai`, require the authenticated current
user, and derive that owner on the server. No request accepts a user/owner ID, Root/Admin flag,
entitlement/plan, raw embedding/vector, arbitrary provider endpoint, private-message scope or
archive body copied from the client. `ARCHIVE_ONLY` is the default answer mode; only an explicit,
authorized scope can make an Archive source eligible.

| Route                                                                                                            | Contract                                                                                                                                                                                                                                                                               |
| ---------------------------------------------------------------------------------------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `GET/PATCH /v1/personal-ai/preferences`, `GET/PUT /v1/personal-ai/consent`                                       | Reads/updates only the caller's Personal AI enabled state, safe source defaults and versioned consent. Disabling stops new retrieval/index work; it does not delete Originals.                                                                                                         |
| `GET /v1/personal-ai/sources`, `GET/POST /v1/personal-ai/index-jobs`                                             | Returns safe self index status/source summaries or queues a bounded self-only index/reindex request. The caller cannot submit another owner's ID, a raw embedding, a Message conversation or arbitrary source content.                                                                 |
| `POST /v1/personal-ai/queries`, `GET /v1/personal-ai/queries/{id}`, `GET /v1/personal-ai/queries/{id}/citations` | Creates/reads a self-owned explicit-scope question and its safe answer/citations. The service validates scope, source ownership, consent, entitlement, provider/model availability, quota and rate policy before retrieval/generation. Citation detail is re-authorized on every read. |
| `GET /v1/personal-ai/insights`, `POST /v1/personal-ai/queries/{id}/insight`                                      | Lists or explicitly saves caller-owned AI Insight metadata. A save creates a separate `AI_INSIGHT`; it never overwrites a Life/History/Fitness Original or silently creates a revision.                                                                                                |
| `POST /v1/personal-ai/index/rebuild`, `DELETE /v1/personal-ai/index`                                             | Self-only rebuild or derived-index clear. Clear/delete removes chunks/embeddings/retrieval references while preserving Archive Originals.                                                                                                                                              |

Errors are privacy-preserving: disabled/consent/index state, unavailable provider, entitlement,
quota/rate, invalid scope and inaccessible source return safe codes suitable for inline UI. They
must not disclose a foreign source, chunk/vector, citation excerpt, private Message, prompt
context, credential, raw Provider error or Root-only metadata.

## Phase 10 Creator Lab contracts

Creator Lab consumer routes are under `/v1/creator`: project list/create/read/trash, file
list/read/create/update/move/delete/search, snapshots/restore, Git status/diff/history/commit,
AI change proposal/apply/rollback, GitHub connection/import, releases/publish and project export.
Inputs are strict and contain no owner/user/Root/plan fields. Paths reject traversal, absolute paths,
backslashes and sensitive credential filenames; file content is size-limited and secret-like content
is rejected. GitHub authorization is represented by a server-side reference only. Production GitHub
OAuth, repository sync and release hosting remain Human Action Required.

## Phase 11 Sandbox Runtime API

Sandbox routes are under `/v1/sandbox/runtimes`: list/create/get, start/stop/restart/destroy, command,
typed task/cancel, task/log/problem/artifact/usage reads, terminal open/input/resize/close, secret-reference
injection and redacted environment projection, opaque runtime-token metadata, recovery, workspace change
detect/review/sync, approved port exposure and private preview create/read. Inputs contain no owner, Root,
plan, credential value, host mount, provider secret, arbitrary preview origin or workspace content. The trusted
server derives ownership and capability `SANDBOX_RUNTIME_ACCESS`; Mock is local-only. Provider execution,
durable queue, real preview gateway and production service-role deployment remain Human Action Required.

## Phase 12 Deployment API

Deployment routes are under `/v1/deployments`, `/v1/projects/:projectId`,
`/v1/preview-shares`, `/v1/domains` and `/v1/public/projects`. They cover
explicit commit/release/snapshot deploys, status/history/logs/health,
cancel/delete/rollback, preview share/revoke/access, DNS/domain verification,
environment public values, opaque secret references, usage and separate
project/source/download publishing visibility. Inputs are strict and contain
no owner, Root, plan, raw secret, provider credential or arbitrary runtime
command fields. `MOCK_STATIC` is local-only; real provider/TLS/DNS/worker
verification is `PENDING HUMAN ACTION`.

## Phase 13 social API

Consumer routes live under `/v1/social/*` for providers/capabilities, OAuth callback, accounts, sync/import jobs, archive/manual links, collections and publication. `/v1/admin/social/*` is a separate Root/Admin boundary. Requests never accept owner, plan, entitlement or Root fields; actor and Founder audience are server-derived. `MANUAL_LINK` is the honest fallback when X/Douyin capability is `NOT_VERIFIED`.
## Phase 14 Portable Archive API

Portable routes live under `/v1/archive`: export jobs, short-lived download metadata/bytes, manifest verification, import preview/restore, backups, Annual Archive and manual-only legacy projections. Inputs contain no owner, Root, token, password echo or credential authority. `.mezip` uses `MEZIP_DIRECTORY_JSON_V1`, `mezip.archive.v1`, portable IDs and SHA-256 checksums. Missing configuration returns an unavailable projection; it never fabricates a local export or restore success.

## Phase 20 Creator Ecosystem API

Owner routes live under `/v1/creator-ecosystem`: profile, home, project
detail/metadata/media, publish/unpublish, explicit social-update publish,
read-only source, release asset/download ticket, private save/follow and
aggregate stats. Public routes are limited to `/v1/public/creator-profiles/*`
and `/v1/public/creator-projects/*`; they expose only explicit public
profiles and published snapshots. Inputs are strict and never accept an owner,
role, Root flag, plan/capability, raw source, secret, provider token or
arbitrary URL. Project publishing requires an idempotency key. Download tokens
are opaque, owner-bound and short-lived; source/download/demo visibility is
checked server-side on every operation.

## Phase 21 Billing provider contract

`POST /v1/billing/checkouts` accepts only an explicit paid `planCode`, provider
and optional coupon code plus an idempotency key. The trusted server routing
context, not request JSON, supplies the billing platform. Amount, currency,
order owner, payment status, Membership, entitlement, Admin and Root are never
consumer inputs. `GET /v1/membership/payment-providers` projects provider,
checkout/callback capability and readiness only. `POST /v1/payment/callbacks/:provider`
remains provider ingress: it has no consumer principal or client success flag
and must verify a signed raw callback before access changes. Consumer order,
refund, overview, history and benefit reads remain self-scoped.

## Phase 22 cross-client API discipline

All Web/Mini/iOS adapters use the same typed `/v1/` domain routes and the
server derives actor, owner, role, entitlement, payment state and visibility.
The common client error set is `UNAUTHORIZED`, `FORBIDDEN`, `NOT_FOUND`,
`CONFLICT`, `RATE_LIMITED`, `OFFLINE`, `VALIDATION_ERROR`,
`PROVIDER_UNAVAILABLE`, `ENTITLEMENT_REQUIRED`, `PRODUCTION_PENDING`,
`SERVER_ERROR` and `UNKNOWN`. Deep-link resource IDs are navigation hints;
they are re-authorized by the normal server read and never accept owner/Root
query parameters.
