# Architecture — ME Core (Product Freeze v1.1)

## Decision summary

ME.zip is a TypeScript-first monorepo with independently deployable product surfaces and
domain services. Phase 0 deliberately establishes contracts and thin shells, not a
production network or cloud account.

```text
Web / WeChat Mini Program / Native Companions / Browser Extension
                         |
                    API edge (BFF)
                         |
       Auth | Archive | Community | Messaging | Payment | Media
                         |
             PostgreSQL + object storage + event/outbox
                         |
    notification | analytics | sync | official social connectors
```

## Repository boundaries

| Area                    | Owns                                                                                            | Cannot own                                                                  |
| ----------------------- | ----------------------------------------------------------------------------------------------- | --------------------------------------------------------------------------- |
| `apps/*`                | presentation, local state, platform permission UX                                               | authorization, price, entitlement truth, secrets                            |
| `services/api`          | request composition and edge policy                                                             | direct payment-provider assumptions                                         |
| `services/auth`         | identity/session policy and RBAC policy                                                         | user archive content                                                        |
| `services/payment`      | orders, provider abstraction, subscriptions, entitlements                                       | client-controlled prices                                                    |
| `services/ai-gateway`   | provider/model/capability registry, normalized AI requests, safe metering and credential policy | browser/Mini secrets, direct Archive/Message reads, client privilege claims |
| `services/messaging`    | conversations, delivery state, message sequencing                                               | invisible administrator snooping                                            |
| `services/media`        | metadata, signed upload flow, quarantine lifecycle                                              | executable content serving before approval                                  |
| `services/*connectors*` | official OAuth/API adapters                                                                     | scraping, reverse engineering, credential capture                           |
| `packages/*`            | portable types, schemas, utilities, design tokens, SDK contracts                                | tenant bypasses or production secrets                                       |

The Phase 0 Web and admin shells are Vite + React + TypeScript. The Mini Program shell is
native WeChat Mini Program TypeScript/WXML/WXSS. The Windows Agent is intentionally only a
typed design shell; the implementation candidate is Tauri 2 after an explicit Windows
capability and packaging review. iOS and Android folders hold architecture/consent contracts
only until official platform documentation is verified.

## Phase 1 identity boundary

`services/auth` owns the unified `users` + `auth_identities` model, provider adapters,
OTP challenges, sessions, consent versions, account-deletion requests, and identity-linking
policy. Provider adapters expose a small verification contract and never expose provider
tokens to clients or persist raw OTP/refresh credentials. The initial adapter set is WeChat,
Phone, Email, and Google; local/dev adapters are mocks and production credentials are injected
only through the environment secret manager.

The auth flow is deliberately explicit:

`Welcome → choose provider → start challenge/adapter verification → verify → create or resolve
one User → record consent → issue access + rotating refresh session`.

OTP verification enforces a normalized identifier, a server-generated challenge, hashed code,
expiry, resend cooldown, attempt budget, per-account/per-identifier/IP rate limits, single-use
consumption, and replay rejection. Refresh tokens are hashed and rotated; reuse revokes the
session family. Logout, logout-all, device-session listing/revocation, recovery, and
last-identity protection are server operations. The browser and Mini Program only render
state and submit opaque challenge/credential values.

## Identity, entitlement, and Benefits boundary

Phase 1 established the identity and entitlement seam. Phase 6 now implements the
server-authoritative Membership/Billing domain in `services/payment`: frozen plan catalogue,
orders, provider abstraction, Membership lifecycle, additive entitlement projection, Benefits,
coupons/redemptions, and refund-request state. Domain services ask the resolver for a capability
and still enforce `owner_id`/snapshot audience predicates. No app may infer a capability from a
local plan string.

`campaigns`, `benefit_grants`, `coupons`, `redemptions`, secure redemption-code definitions,
storage grants, badges, and invite-reward relations remain bounded server data. Grants are
time-bounded, idempotent, revocable, and audited. The local implementation deliberately fails
closed when a payment provider/gateway/verifier is not configured; it does not establish a real
merchant account, production callback endpoint, or verified production payment capture.

## Data and command flow

1. The client authenticates and sends no authoritative owner, plan, price, or privilege.
2. API edge resolves an authenticated principal and correlates request/audit IDs.
3. Domain service validates schema, derives tenant scope server-side, then checks RBAC/ABAC.
4. A database transaction commits source state and a transactional outbox event.
5. Workers consume the outbox idempotently for notifications, aggregation, scans, and sync.
6. Clients read projection APIs scoped to the principal. Payments and entitlements always
   refresh from the server after asynchronous callbacks.

## Environment lanes

| Lane        | Purpose                       | Rules                                                     |
| ----------- | ----------------------------- | --------------------------------------------------------- |
| local       | individual development        | synthetic data, local placeholders, no production secrets |
| development | shared engineering validation | isolated cloud resources and test accounts                |
| staging     | release rehearsal             | production-like but isolated, sanitized/synthetic data    |
| production  | public service                | protected deploys, audited access, flags, backups, alerts |

No direct development occurs in production. Every deployment is feature-flagged and can roll
from internal → alpha → beta → 5% → 20% → 50% → 100%.

## Integration gates

Before implementation, a responsible engineer must read and record the current official
documentation for: WeChat Sport, WeChat subscription messages/payment, X APIs/OAuth, Douyin
open platform, Apple platform capabilities, Android platform capabilities, Windows APIs,
and Chrome/Edge extension APIs. Phase 0 makes no claim that any unverified API exists.

## Deferred platform rules

- Browser extension records only domain, active-tab/focused state, start/end/duration.
  It never records prompts, chat content, password, cookie, token, keystrokes, or page body.
- Windows idle cutoff defaults to three minutes without input; it must be clearly disclosed
  and locally cached/encrypted where platform support permits.
- Mobile collection is labelled `自动`, `部分自动`, or `手动` based only on legal official APIs.
- AI quota import happens only with a suitable official usage API; otherwise users configure
  it manually.

## Observability contract

Production instrumentation must monitor crash-free rate, API error rate and P95, payment
success and refund failure, message delivery/WebSocket health, upload/sync failure, and
database/object-storage health. See `docs/operations/OBSERVABILITY.md`.

## Phase 3 archive boundary

`services/archive` is the server-side authority for the Personal Life Archive core. It owns
Life entries and revisions, History, Fitness, Body Metrics, Steps, Timeline aggregation, Daily
Pack indexes, archive search, media metadata/quota, and owner-scoped export manifests. The
service derives the owner from the authenticated principal, validates opaque resource IDs in
the same owner-scoped lookup, applies idempotency keys to writes, and rejects stale
`version`/revision writes instead of silently overwriting another device.

The Web and Mini Program use platform adapters only for local/dev persistence. Those adapters
implement the same archive contract and persist under the current authenticated user's
namespace; they are not authorization boundaries and cannot be promoted to production. A
production API request still passes through the API edge and `services/archive` before any
database or object-storage write.

Phase 3 source records remain `PRIVATE` by default. The local/dev publish foundation creates a
separate audience-scoped snapshot; Community delivery and moderation were deferred until Phase 4.
Editing or deleting a source never mutates an already-issued snapshot. AI assistance is represented
by separately stored `AI_GENERATED` insight records and is not allowed to modify an Original or
Revision.

The archive write path is:

`client adapter → API edge → archive authorization/schema/idempotency → PostgreSQL transaction
→ timeline/outbox event → object-storage/media worker`

Media bytes never enter PostgreSQL. The database stores owner-scoped metadata, storage keys,
content hashes, scan state, and links. Local development uses the deterministic
`LocalDevelopmentStorage` implementation in `services/archive/src/storage.ts` and quarantine
checks; cloud provider details remain behind the same `StorageProvider` contract. Local search
is exposed through `LocalSearchProvider` so a database/full-text provider can replace it without
changing archive routes.

## Phase 4 Community, Groups, Channels, and Activities boundary

Phase 4 adds a Community domain alongside Archive without taking ownership of private Originals,
media storage, identity, or entitlement truth. It owns published Community/Group/Channel/Event
projections, social relations, moderation cases, notification summaries, cursor feed/search
projections, and their authorization. Web and Mini Program call the same server/domain contract;
they do not keep a second Community authorization or ranking implementation.

```text
Consumer Web / WeChat Mini Program
                |
             API edge
                |
 Auth + Entitlement + Community authorization
                |
 Community domain ── explicit snapshot/media reference ── Archive / Media domain
                |
 PostgreSQL transaction + outbox ──> notification / moderation / feed projection workers
```

The only Archive-to-Community path is explicit publication:

`PRIVATE Original → server owner check + selected fields/media → immutable Published Snapshot → Community/Group/Channel/Public projection`.

For that boundary, the client submits an opaque `sourceEntryId` and allowlisted field/media
selection only. The server reads the authorized source and creates the snapshot; a client never
posts a copied private Original body or gains a read path to the source through the Community API.

The Community domain never queries private Archive lists to populate Feed, search, or
recommendation. A published/post edit uses its own version or new snapshot and never writes an
Archive Original. Existing Media service authorization remains authoritative: Community only
receives a selected, authorized snapshot/media relationship and never treats a guessed
`media_asset_id` as public delivery permission.

### Read model and ranking v1

Every Feed, comments list, follower list, group/channel posts list, activity list, notification
list, and moderation queue is cursor-paginated. A cursor encodes a stable ordered projection, not
a client-provided privilege. `LATEST` is chronological eligible content; `FOLLOWING` is the same
over eligible followed authors; `DISCOVER` is recent eligible content with a documented simple
engagement tie-break. Visibility, group/channel membership, Founder audience/entitlement,
moderation status, and block filters are evaluated before ranking. No private archive fields,
behavioral profile, or ML recommendation score participate in ranking v1.

Authorization is never served from an untrusted/stale client cache. A cache may accelerate an
already authorized projection but every protected read/write rechecks trusted membership,
visibility, block, moderation, and entitlement state. Feed/post counters favor correctness over
aggressive denormalization.

### Transaction and event boundaries

Reaction, save, follow, group membership, and activity registration relations are idempotent and
unique per relevant actor/resource. Activity capacity join, group ownership transfer, publish
snapshot, and moderation action plus case transition are transactional (or use an equivalent
atomic consistency boundary). Community notifications are outbox-driven/pollable foundation
events with minimal summary only.

Groups carry server-authorized public/private membership and `OWNER`/`ADMIN`/`MEMBER` roles.
Channels retain their Root/official boundary; channel audience is a Founder/Official entitlement
rule rather than ordinary personal visibility. Activities carry capacity/registration constraints
and cannot disclose contact or identity data through participant projections.

### Administration and production boundary

Moderation is a scoped Community capability, not an implicit Root grant. `ORIGINAL_DEVELOPER_ROOT`
uses the existing Admin Command Center/Admin API boundary and append-oriented audit trail for
Community, Group, Channel, Activity, Report, and moderation actions. Consumer routes cannot
forge an Admin/Root audience, owner, moderation state, or capability.

Phase 4 preserves the Phase 3 archive freeze except for minimal Community integration seams.
Phase 5 Messaging and the Phase 6 Membership/Benefits/Billing domain are locally accepted.
Local automated evidence is not a substitute for real WeChat AppID,
production PostgreSQL migration, merchant/provider credentials, callback verification, or
production rollout verification.

## Phase 5 Realtime Messaging boundary

Messaging owns Conversations, Conversation Members, Message envelopes, per-member state,
reactions, attachment references, reports, user conversation settings, drafts/outbox state, and
coarse presence/ephemeral typing. It does **not** own Identity, Entitlement truth, Group Membership,
block truth, Media bytes, Archive Originals, Community Published Snapshots, or Root identity.

```text
Consumer Web / WeChat Mini Program
        |               |
typed Messaging SDK   RealtimeTransport
        |               |
     API edge + session authentication
        |               |
Messaging authorization ── entitlement / block / Group Membership / Media authorization
        |               |
PostgreSQL transaction + idempotency / outbox
        |               |
event fan-out / reconnect-backoff / safe polling-or-refresh fallback
```

The normal-user path always derives actor and membership server-side. A canonical direct-message
pair prevents duplicate DMs. Group reads/sends use current active Group Membership; a caller that
is not an active member receives no group body, attachment, event, or search projection. Founder
Inbox queries resolve `FOUNDER_INBOX_ACCESS` (and optional `FOUNDER_PRIORITY_INBOX`) through the
entitlement service, never from a plan string. Community Block is rechecked before a new DM or
send; it does not become an archive/message read override.

The message write path is:

`client outbox(client_message_id) → API edge → Messaging schema/authorization/rate check →
transaction + unique idempotency result → outbox → RealtimeTransport + notification projection`.

`client_message_id` is stable across local retry/reconnect. Message mutations are version/author
scoped as applicable; delivery/read is represented as per-recipient/member state rather than a
single group-wide `message.read` flag. Typing is a throttled, short-TTL transport state with
disconnect cleanup; presence is coarse and low-frequency. If realtime is unavailable, reconnect
with backoff then use explicit refresh or safe polling without disabling the conversation.

Attachments are references to Phase 3 Media Service rows. The Messaging domain authorizes the
conversation/member relation and Media re-authorizes owner/link/scan/delivery before issuing an
expiring URL. No Message API accepts raw storage keys or creates a second object store.

Root reads never share the consumer messaging path: `Admin Command Center → Admin API → Root
authorization(ROOT_READ_PRIVATE_MESSAGES) → Messaging domain → audit`. Every private
conversation/message/attachment read produces `ADMIN_ACCESS_AUDIT`; normal Admin/Moderator roles
and consumer `root` fields cannot reach it.

## Phase 6 Membership, Benefits, and Billing boundary

```text
Consumer Web / WeChat Mini Program
              |
        typed Membership SDK
              |
API edge + authenticated principal + Idempotency-Key
              |
 MembershipService ── server price catalogue / capability resolver
       |                    |                    |
 orders + payments     Benefits/Admin         configured provider adapter
       |                    |                    |
 PostgreSQL transaction / RLS / audit    signed callback verifier
```

The consumer API accepts only an eligible `planCode`, provider code, optional coupon code, and
idempotency key. It never accepts an amount, payment-success signal, entitlement override,
another user ID, Admin/Root flag, or callback trust flag. `MembershipService` resolves the actual
price and CNY-fen discount on the server, then creates an expiring order and delegates payment
intent creation to an injected provider. A configured provider callback is verified before order
lookup/activation; provider transaction uniqueness, order/provider/amount/currency checks, paid
state, Membership activation, plan-entitlement materialization, and audit/persistence are one
domain transaction boundary.

Migration `007_phase6_membership_payments.sql` extends the established commerce source of truth;
`subscriptions` is the durable Membership relation, while `memberships`, `membership_plans`, and
`payments` are semantic views. `MembershipDurableRepository` specifies the production transaction
seam but is not itself a deployed PostgreSQL adapter. The checked-in Fake provider is a local-test
tool only. `WeChatPaymentProvider` requires injected merchant configuration, gateway, and callback
verifier and otherwise fails closed.

Membership Administration is a separate server-authenticated boundary with narrow capabilities
for campaigns, coupons, redemption codes, benefit grants/revocation, and payment-metadata view.
It emits append-only membership-admin audit entries; a normal consumer, plan, or Root claim cannot
create that identity. Root remains separately governed by its own Admin API/capabilities and does
not receive payment secrets or an unaudited consumer-path bypass.

Production-payment integration remains Human Action Required: apply/rehearse the migration with a concrete
repository, provision merchant credentials/certificates and HTTPS callback routing, connect the
official provider SDK/verifier, perform live reconciliation and refund operations, and validate the
real Mini Program payment path. Phase 6 local acceptance does not claim those actions occurred;
they are an external operational dependency, not Phase 7 scope.

## Phase 7 AI Usage architecture

`services/analytics` owns the Phase 7 AI Usage domain and is the only service that resolves the
approved app/provider registry, collector precedence, owner timezone/day aggregation, correction,
deletion, export, device pairing/revocation, and bounded Root read. It composes with Archive
through `AiUsageArchiveIntegration`: only a private `DailyPack.stats.aiUsage` aggregate is merged;
Archive keeps Daily Pack persistence, revisions, and Timeline ownership.

```text
Web / Mini Program (owner dashboard, controls, manual/import) ─┐
Windows Agent / Browser Extension (paired ingest only) ─────────┼─> API edge
                                                                  │
                                             services/analytics ──┼─> Archive Daily Pack port
                                                                  └─> PostgreSQL migration 008
```

The ordinary UI SDK has no device credential, user id, collector source/platform authority,
activity hash, Root flag, or registry-write method. A one-time pairing code completes on the
collector boundary and issues an ingest-only device credential once; server storage keeps only its
hash. Collector batches use that credential in a request header, never in URL/query/body. The
Windows and Chromium implementations are local tracker foundations. They must remain paused until
owner consent and an accepted pairing; they do not establish that any native/browser data has been
collected in this environment.

## Phase 8 Unified AI Gateway architecture

`services/ai-gateway` is a separate AI execution domain. It does not reuse the Phase 7 AI Usage
registry: Phase 7 labels describe metadata-only usage time, while Phase 8 registry entries define
server-reviewed provider/model/capability availability. The API edge supplies an authenticated
principal; it never accepts a client-selected owner, entitlement, credential reference, Admin/Root
flag, quota, cost or fallback policy.

```text
Web / Mini AI Lab (server projections only)
              │ SDK / authenticated API
              ▼
       services/ai-gateway
  ┌───────────┼──────────────────────────────────────────────────────────────┐
  │ registry + capability filter │ auth/entitlement/quota/rate policy        │
  │ invocation + stream events   │ timeout/retry/circuit + no-default-fallback│
  │ conversation metadata        │ safe usage ledger                          │
  └───────────┴──────────────────────────────────────────────────────────────┘
              │ normalized, server-only adapter contract
              ▼
 Local deterministic adapter ──────┐
 Reviewed external provider adapter │ (future, configured server-side only)
              │                    │
              ▼                    ▼
       synthetic local output   official Provider API
```

The checked-in runtime deliberately ships only the deterministic `LOCAL` adapter. `OPENAI`,
`OPENAI_COMPATIBLE`, `ANTHROPIC`, `GOOGLE`, and `CUSTOM` are registry values with disabled/not-
configured external paths. An external adapter must implement the server-only capability contract
for model discovery (where officially supported), credential validation, request/stream creation,
cancellation, health, normalized errors, and usage metadata. It is not acceptable to scrape a
website, use a consumer desktop client as a provider API, or promote a mock to a production claim.

Provider/model status and availability are distinct: registry state uses `ACTIVE`, `DEGRADED`,
`DISABLED`, `UNAVAILABLE`, `CONFIG_REQUIRED`, or `DEPRECATED`; availability/health tell the UI
whether a configured route can safely be selected. Model capability metadata—not a model name—is
the only input to text, vision, image, audio, code, reasoning, structured-output, streaming,
embedding, or tool eligibility. The Phase 8 shipping policy enables only the local text/chat,
structured-output and streaming foundation. Future media adapters must take an explicit,
owner-authorized attachment reference through the appropriate Media-domain authorization port.

### Credential and privacy boundary

System credentials are resolved only by trusted server composition from a managed secret reference.
BYOK is a write-only encrypted-envelope boundary: consumer surfaces can see only safe status,
created/validated time and an optional non-reversible display mask, never a recoverable key or raw
fingerprint. The default
development vault is intentionally not a production key-management system. Production KMS/secret
manager wiring, official provider credential validation, deletion/rotation rehearsal and
deployment monitoring remain Human Action Required.

Invocation records deliberately exclude full prompts, responses, private attachment contents,
provider raw errors and keys. The gateway takes current user input only for the selected request;
its Phase 8 context scope is `NONE` and it cannot automatically retrieve Archive, Messaging,
Media, AI Usage or any whole-account RAG corpus. AI conversation metadata is a separate private
domain, not a human `services/messaging` conversation.

### Safety and administration boundary

The gateway applies a bounded execution policy (timeout, limited retry for normalized retryable
errors, per-provider circuit state, quota reservation and per-user/provider/model rate limit).
There is no automatic cross-provider fallback. A later explicit fallback policy must remain
server-controlled and user-visible. All tools are deny-by-default and the checked-in tool policy
has no database, filesystem, shell, HTTP, payment, Admin or Root tool adapter.

Root provider management is a separate `/v1/admin/ai-gateway` composition with
`ORIGINAL_DEVELOPER_ROOT` plus `ROOT_MANAGE_AI_GATEWAY`, not a plan or BYOK side effect. It may
manage registry/health metadata and a write-only managed-secret configuration reference/status,
and emits append-only AI Gateway administration audit records; it does not return a provider
secret/reference. Current production provider integration,
production database deployment and deployed client origin are explicitly not evidenced by this
local architecture.

## Phase 9 Personal Knowledge architecture

The Phase 9 development gate is Owner-accepted. This architecture therefore permits the next
development phase to proceed while keeping the production gate separate: real PostgreSQL/pgvector,
FORCE RLS rehearsal, deployed workers/outbox, reviewed provider credentials, monitoring and
recovery exercises remain **PENDING HUMAN ACTION** and are not local production evidence.

`services/personal-ai` is a separate, owner-scoped Personal Knowledge domain. It composes an
ordinary authenticated user with an explicit scope and reviewed Archive/AI Usage ports; it never
receives an Admin principal, Root capability, another owner identifier, or direct database access
to private records. `Ask My Archive` is therefore distinct from the Phase 8 general AI Lab:
retrieval is authorized before the Phase 8 Gateway receives a bounded evidence context.

```text
Web / Mini Ask My Archive
          │ self-only SDK / authenticated API
          ▼
  services/personal-ai
  ├─ consent + explicit scope + ordinary owner authorization
  ├─ source extraction → chunk/index job → deterministic embedding/vector provider
  ├─ keyword + semantic + structured retrieval → score fusion / bounded context
  └─ citations + AI Insight metadata ──────────────┐
                                                     ▼
                  Phase 8 Gateway (one bounded archive-only generation)
```

The Personal Knowledge layer indexes only current-user, explicitly supported Archive sources.
Private Messages are absent from its source vocabulary, and media/OCR/video/voice processing is
not a default extraction path. Each chunk carries owner, canonical source, occurrence time,
revision/index version and lifecycle status. Timeline pointers are not indexed as duplicate
Originals; a current revision replaces the retrievable prior revision. Trash, permanent delete,
source permission loss, clear-index and failed/rebuild flows update the derived index without
modifying the user's Original archive.

Embedding and vector search are provider interfaces. The checked-in local development path may be
deterministic, but it does not turn a browser or Mini Program into an embedding client and it does
not prove production vector/Provider deployment. Structured questions (for example fitness
counts or AI Usage duration) use an owner-scoped aggregate port rather than pretending a vector
search is authoritative. The query planner is bounded rule classification, not an autonomous
agent or full-account background crawler.

## Phase 10 Creator Lab / Safe Code Workspace

Creator Lab is a separate owner-scoped domain. The service stores project/file metadata, encrypted
workspace content, checksums, snapshots, optimistic workspace versions, structured Git metadata,
release manifests and AI change proposals. The consumer SDK/API exposes typed `/v1/creator/*`
routes; every request derives the actor from the trusted host principal. AI changes are proposal →
explicit review/apply → snapshot/rollback, and no route invokes a shell, terminal, container or
untrusted preview. GitHub and durable PostgreSQL adapters are seams only until production
credentials, RLS roles, worker scheduling and external-provider verification are completed.

## Phase 11 isolated runtime

The Owner has accepted the Phase 11 development gate: local/development acceptance is PASS and the
next development phase is authorized. The production gate remains `READY FOR PRODUCTION = NO` with
real provider, isolation, durable worker, database, preview gateway, vault/KMS, monitoring and recovery
verification explicitly `PENDING HUMAN ACTION`.

Sandbox Runtime is a separate provider boundary below Creator Lab. `SandboxRuntimeService` owns policy,
entitlement and project checks; `SandboxRuntimeProvider` is the only execution integration point. The
local Mock implementation is intentionally execution-disabled. Runtime state is ephemeral and `/workspace`-only
with fixed limits, deny-by-default network policy, redacted logs and private expiring previews. Terminal sessions
use a fixed `/workspace` cwd and never retain input; secret injection accepts only vault references and runtime
tokens are scoped, short-lived and projected as hashes only. Workspace changes remain detect → review → sync;
they cannot silently overwrite Creator source. A separate preview-gateway boundary owns private HTTPS forwarding,
CSP and expiry. A production composition must inject a reviewed provider, isolated preview gateway and durable
repository/worker; no host shell is part of the app.

## Phase 12 deployment and publishing

Phase 12 adds the owner-scoped Deployment Service, immutable static artifact
contract, provider abstraction, preview sharing, custom-domain/TLS foundation,
secret-reference metadata, publishing visibility, usage counters, API/SDK
surfaces, and fail-closed Web/Mini management panels. The local
`MOCK_STATIC` provider is execution-free and synthetic. A real deployment
provider, durable repository, worker/scheduler, preview gateway, DNS/TLS,
vault/KMS and production runtime remain `PENDING HUMAN ACTION`; see
`docs/operations/DEPLOYMENT_ARCHITECTURE.md`.

## Phase 13 social connector boundary

`services/social-connectors` owns provider abstraction, OAuth state/PKCE checks, account binding, incremental import jobs, metadata-first Social Archive items, collections, manual links and snapshot publication. X and Douyin adapters are fail-closed until current official capability review and approved credentials exist. Web and Mini consume typed SDK projections; raw OAuth credentials, provider tokens and private external payloads never cross that boundary.

## Phase 19 Connected Apps / External Identity boundary

`services/external-identity` owns an owner-scoped identity-card and official
OAuth connection boundary for X, ChatGPT/GPT, WeChat, Honor of Kings, and
GitHub. It does not own login identity, Archive content, Creator source trees,
or Social Connector imports. The API resolves the current principal, enforces
private-by-default identity metadata, produces a separate safe public profile
projection, and returns an approved launch plan rather than allowing a client
to open arbitrary URLs.

X/GitHub OAuth is server mediated: server-generated PKCE verifier/S256
challenge, exact redirect registration, single-use owner-bound state, official
provider URL validation, encrypted credential-vault port, and audit seam.
Web/Mini only consume safe projections and never receive provider tokens,
refresh tokens, QR bytes, private repositories, chat data, Cookie/session data,
or raw provider response bodies.

## Phase 14 Portable Life Archive

`services/archive` owns the additive `.mezip` container, manifest/schema/checksum verification, password AES-256-GCM foundation, import preview/conflicts, backups, Annual Archive and manual-only Digital Legacy foundation. The local implementation is an in-memory development seam; production object storage, durable workers, KMS and database service-role deployment remain a separate production gate. API/SDK/Web/Mini derive ownership from the trusted principal and fail closed when the service is unavailable. Sensitive credentials, prompts/responses, raw embeddings and private-message data never cross the portable boundary.

## Phase 20 Creator Ecosystem boundary

`services/creator-ecosystem` is a thin, owner-scoped publication layer over
the existing Phase 10 Creator Lab project, workspace and release records. It
does not create a second project, source, release, deployment or follow
system. Creator profiles are private by default. Project visibility, source
visibility, download visibility and demo visibility are separate server-side
decisions. Publishing creates an immutable, metadata-only snapshot after a
workspace secret scan; publishing a project never exposes its source, private
repository, credentials, raw deployment configuration or a permanent download
URL. Public discovery reads only public creator profiles and published public
snapshots. Phase 17 supplies the follow graph and private Save to ME semantics;
Phase 19 supplies only safe opted-in public identity links. Real repository,
artifact, preview, database and worker providers remain a production gate.

## Phase 21 Billing architecture

`services/payment` remains the one Billing and Membership authority; Phase 21
extends it rather than creating a checkout, subscription or entitlement
duplicate. The server resolves authenticated owner, platform, frozen paid plan
and CNY-fen price, then persists Order/PaymentAttempt state through the durable
repository. A provider adapter may create an external intent, but it cannot
activate access. Only its verified signed callback may atomically record a
payment event, settle the order, materialize Membership/entitlements and append
audit/history. Provider transaction identity and request idempotency are
durable uniqueness boundaries.

The provider boundary exposes only safe availability/readiness projections to
clients. It contains configuration-gated WeChat Pay, Alipay and Apple IAP
adapters plus a development-only Fake adapter. Reconciliation deliberately
observes pending provider state without turning a client/provider query into
an entitlement grant. Refund requests remain `REQUESTED` until an authorized
provider reconciliation result changes server truth.

## Phase 22 multi-client architecture

Web, Mobile Web, WeChat Mini Program and the iOS companion share domain/API
contracts, privacy, membership/billing, entitlement and identity authority.
Platform code supplies presentation and platform adapters only. The capability
matrix, Mini/iOS foundations, deep-link and client-security boundaries live in
`docs/operations/{PLATFORM_CAPABILITY_MATRIX,MINI_PROGRAM_ARCHITECTURE,IOS_ARCHITECTURE,DEEP_LINKS,PLATFORM_ADAPTERS,CLIENT_SECURITY}.md`.
Missing provider/merchant/AppID/API configuration is an explicit unavailable
state, never a client success fallback.

## Phase 24 production operations architecture

`packages/utils` owns the portable production configuration validator; the API
host composes it with dependency readiness, security headers, redacted events
and coarse metrics. Durable database, queue, private storage, distributed rate
limit and KMS adapters remain host-owned infrastructure ports. The repository
does not claim that a local/in-memory adapter is a deployed operational system.

## Phase 25 release-control architecture

`services/release-management` owns release-channel/build/tester/flag/feedback
contracts. It is not an identity, membership, billing or analytics authority.
Its local state is development-only; a durable production repository and
operator tooling require the separate Phase 24 production gate. API consumers
receive their own enrollment and safe feature result, never another tester’s
cohort or privileged controls.
