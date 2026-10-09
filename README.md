# OrbitOS

**OrbitOS — Your AI Content Operating System**

A modular, zero-budget-first social media operating system.

## Core loop

Idea → Research → Strategy → Draft → Platform Variants → Creative → Review → Approve → Schedule → Publish → Analytics → Learning

## Current runtime

The browser MVP is dependency-free and local-first:

- browser persistence through localStorage
- portable JSON backup/import
- deterministic local content generation
- local research and analytics fixtures
- human approval before scheduling
- per-platform schedule records without external publishing
- external social publishing disabled
- no paid AI/API dependency

The browser UI uses a compatibility bridge into the modular runtime for core content operations. Existing v4 UI state remains intact while domain/core state moves toward the backend-ready data model.

## Free/local AI

OrbitOS now has an optional provider adapter for a locally running Ollama API.

- The AI contract is provider-neutral.
- The default runtime does not require a model.
- The runtime selects the provider through a small factory boundary.
- Ollama can be enabled from Settings with a localhost model; the browser never stores provider secrets.
- No AI credentials are stored in the browser.
- Deterministic local generation remains the fallback.

The adapter targets Ollama's local API without taking a dependency on an Ollama SDK.

## Architecture

The repository is split into four internal layers:

- Domain — stable models, stages, content entities, schedules, and state
- Agents/Core — orchestrator plus specialist agents and business rules
- Adapters — replaceable persistence/content/research/publishing/metrics/AI implementations
- Runtime UI — current static browser application plus the browser compatibility bridge

Agents depend on contracts rather than vendor SDKs. That lets providers change without rewriting the product.

The runtime materializes content_items, content_variants, and schedules separately from ideas, matching the target backend contract.

## Zero-budget policy

No paid service is a hard dependency for the core product.

Optional external providers may be added later, but:

1. the local workflow must remain usable,
2. secrets must never ship to the browser,
3. publishing stays disabled until an official adapter and approval boundary exist,
4. schedules remain local records until publishing is explicitly enabled.

## Repository

Canonical source:

https://github.com/oside-dev/orbitoos

Production runtime:

https://orbitoos.vercel.app

## Engineering roadmap

- M0 — Foundation — complete
- M1 — Content operating loop — active
- M2 — Internal domain/core/adapters split — active foundation work
- M3 — Free/local AI adapter — runtime-integrated; deterministic default + opt-in Ollama
- M4 — Persistent backend adapter — SDK-independent adapter foundation + schema contract
- M5 — Publishing safety gateway — complete; official platform adapters remain gated
- M6 — Analytics + learning loop — ingestion safety, provenance, metric-derived learning; real platform adapters remain gated
- M7 — Multi-brand foundation — brand registry, active-brand runtime context, legacy migration, persistence scoping, and UI isolation
- M8 — Workspace security foundation — membership boundary, authenticated RLS contract, secure helper schema, and backend-controlled provisioning
- M9 — Application runtime shell — explicit local/remote runtime modes, workspace identity context, and authenticated-runtime handoff boundary
- M10 — Persistent content operating loop — real Supabase Auth + workspace bootstrap + persisted create/edit/approve/schedule lifecycle
- M11 — Content intelligence foundation — persisted Strategy Agent artifact linked to each idea and restored across workspace reloads
- M12 — Strategy-aware learning — performance metrics are correlated back to persisted strategy angles
- M13 — Imported analytics provider contract — CSV/JSON report imports use a provider adapter boundary
- M14 — Social publishing foundation — workspace-scoped social account metadata, durable publishing jobs, idempotency records, and secret-reference boundaries; official OAuth/platform adapters remain gated
- M15 — Publishing job orchestration — atomic leased claims, expired-lease recovery, bounded retries, and service-role-only job transition RPCs; worker execution and official platform adapters remain gated
- M16 — Publishing worker shell — secret-key-authenticated Edge Function, fail-closed execution, adapter-readiness gates, and sanitized failure handling
- M17 — Vault-backed social credentials — service-role-only token store/read/delete RPCs, encrypted per-account Vault values, and automatic secret cleanup when references are removed
- M18 — Instagram Login OAuth foundation — signed-in workspace-admin start endpoint, hashed single-use callback state, server-side token exchange, Vault storage, and disabled-by-default configuration
- M19 — Instagram token refresh foundation — service-role-only refresh endpoint, Vault token rotation, expiry metadata maintenance, and a safe reauthorization state for invalid/expired tokens; no schedule is enabled
- M20 — Platform media URL contract — validated HTTPS media references on content variants, persistent storage, and the publishing worker's approved-variant read model; publishing stays disabled
- M21 — Atomic Instagram reconnect — database-locked account upserts preserve primary keys during parallel reconnects; private credential/state tables have explicit service-role-only RLS policies
- M22 — Instagram Reels publisher — official container/status/publish flow, quota checks, Vault-only tokens, durable checkpoints and duplicate-safe manual reconciliation; disabled by default
- M23 — Audited publishing reconciliation — owner/admin-only resolution of ambiguous outcomes, immutable private audit evidence, and no automatic retry of uncertain posts
- M24 — Publishing operations overview — owner/admin-only read-only job counts, retry diagnostics, recent publishing jobs, and reconciliation audit evidence in Settings
- M25 — Scheduled job materialization — eligible approved schedules become idempotent durable jobs only after the worker's global and official-adapter gates pass; no scheduler or live publishing flag is enabled

The next engineering work happens in GitHub first. Production deployment is a release activity, not the development loop.

## Validation

Pull requests and main-branch pushes run the existing runtime checks plus framework-free Node contract tests for domain stages and analytics report parsing.


## Social publishing foundation

The persistence layer now separates public social-account metadata from credential references. Access/refresh credentials are represented by secret names only; credential values do not enter OrbitOS state, content payloads, or browser storage. Approved schedules can materialize durable publishing jobs when a matching connected social account exists.

The live SQL contract is recorded in `docs/architecture/social-publishing-foundation.sql`. Actual platform OAuth adapters and worker execution remain the next gated layer.

## Publishing job orchestration

The M15 database contract in `docs/architecture/publishing-job-orchestration.sql` adds:
- atomic job claiming with `FOR UPDATE SKIP LOCKED`, scoped to the worker's explicitly supported platforms,
- claim-time checks for a connected account plus approved content and variant,
- lease tokens and expiry recovery to prevent a stale worker from finalizing a reclaimed job,
- bounded attempt counts and delayed retry scheduling,
- backend-only claim/complete/retry RPCs granted only to `service_role`.

This is orchestration infrastructure; M22 adds the first official adapter for Instagram Reels only. The worker stays disabled until the global server-side publishing switch, the adapter-specific switch, and a supported Meta API version are configured. Jobs still require an approved variant and a connected account, and error diagnostics remain sanitized.


## Publishing worker shell

M16 adds `supabase/functions/publishing-worker/index.ts`. The endpoint validates a Supabase secret key through `@supabase/server`; the Edge Function gateway's JWT check is disabled only because the handler applies its own secret-key authentication. It is disabled unless `ORBITOS_PUBLISHING_ENABLED=true`. The Instagram adapter added later also requires `ORBITOS_INSTAGRAM_PUBLISHING_ADAPTER_ENABLED=true` and `META_GRAPH_API_VERSION`. No publishing flag or schedule is set by the repository.

## Vault-backed social credentials

The M17 contract in `docs/architecture/social-account-vault.sql` adds backend-only RPCs for storing, reading, rotating, and deleting an account's access/refresh tokens. Token values are encrypted with Supabase Vault; the private account table retains only stable secret names. The RPCs check the caller role, revoke execution from `PUBLIC`, `anon`, and `authenticated`, and grant access only to `service_role`. Removing a secret-reference row also removes the referenced Vault entries, including when the account row is deleted.

These helpers are infrastructure only. OAuth start/callback handlers still need Meta app credentials and redirect-URI configuration before an account can be connected. Browser clients never call the token-reading RPCs.

## Instagram Login OAuth foundation

M18 adds `instagram-oauth-start` and `instagram-oauth-callback` Edge Functions plus `docs/architecture/social-oauth-state.sql`. Start requires a signed-in workspace owner/admin and a brand in that workspace. State is random and short-lived; only its SHA-256 hash is stored. The public callback consumes that state once before it processes a provider response. Access tokens are written directly to Supabase Vault and never returned to the browser, stored in public metadata, or logged.

Instagram Login uses the current professional-account scopes `instagram_business_basic` and `instagram_business_content_publish`; the older `business_content_publish` scope is deprecated. This login flow supports Instagram Business/Creator accounts without a linked Facebook Page. See the [official Meta Instagram Login collection](https://www.postman.com/meta/instagram/folder/6raa77c/instagram-api-with-instagram-login).

Live connection stays unavailable until these Supabase Edge Function secrets are configured in the Dashboard: `META_INSTAGRAM_APP_ID` and `META_INSTAGRAM_APP_SECRET`. The callback URI to register in the Meta app is:

`https://lkcbtgqdvzmaihcnxxwk.supabase.co/functions/v1/instagram-oauth-callback`

`META_INSTAGRAM_REDIRECT_URI` can override that URI if the registered redirect differs; `ORBITOS_APP_URL` can override the frontend return destination. Neither app credentials nor tokens belong in GitHub. Without the required credentials, the endpoints fail closed. No background schedule is configured and the publishing worker still has no registered adapter.

## Instagram reconnect safety

M21 moves reconnect identity into the backend-only RPC `public.upsert_instagram_social_account`. The function locks existing rows and performs an insert-on-conflict recovery path, so simultaneous OAuth callbacks cannot rotate the account primary key used by Vault references and publishing-job foreign keys. The RPC returns the prior status and metadata, allowing the callback to restore them if secure token storage or final status persistence fails. Existing credentials are not erased just because a metadata update fails.

Private secret-reference and OAuth-state tables have explicit `service_role`-only RLS policies and continue to deny table privileges to `anon` and `authenticated`. No client policy or browser credential access was added.

The OAuth state table also has supporting indexes on its user, workspace, and brand foreign keys so cleanup and parent-row cascades do not need unindexed scans.

## Instagram long-lived token refresh

M19 adds `instagram-token-refresh`, which scans a small batch of connected Instagram Login accounts whose `tokenExpiresAt` is within seven days. It calls Meta's official `graph.instagram.com/refresh_access_token` endpoint, stores the rotated token through the backend-only Vault RPC, and updates expiry metadata only after the token write succeeds. Expired tokens or Meta's invalid-token OAuth error mark the account as needing reauthorization; network/provider errors are counted without exposing raw errors or tokens.

The endpoint requires Supabase secret-key authentication plus `ORBITOS_INSTAGRAM_REFRESH_ENABLED=true`; the flag is not set by this source change. No cron job or auto-publish schedule is created. The documented refresh requirements are that the token is still valid and at least 24 hours old; this endpoint only selects tokens approaching expiry. See [Meta's Instagram Login refresh token reference](https://developers.facebook.com/docs/instagram-platform/reference/refresh_access_token).

## Platform media URL contract

M20 adds an optional `mediaUrl` to each platform-native content variant. It is validated as an HTTPS URL with a public-looking hostname, without embedded username/password credentials or a local/IP host. Empty values remain valid while drafting; Instagram publishing will require a URL that the platform can fetch without authentication. The application does not download or proxy the media and therefore cannot guarantee reachability at save time.

The new `media_url` column is added to fresh schemas and through the idempotent migration `docs/architecture/content-variant-media-url.sql` for existing installations. The worker loads the field. The M22 Instagram Reels adapter can use it only when an operator explicitly configures both publishing flags and a supported Meta API version; those switches remain off.

## Audited publishing reconciliation

M23 adds the private `publishing_job_reconciliation_events` audit table, a service-role-only database RPC, and the signed-in `publishing-reconciliation` Edge Function. Only workspace owners/admins can resolve a failed job marked `PUBLISH_OUTCOME_UNKNOWN`. An operator must record evidence and choose either `confirmed_published` with the real provider post ID or `closed_without_retry` after checking the account. The operation atomically updates the job and records the audit event; it never queues or re-publishes the job. The audit record is private and does not cascade-delete with the job. This endpoint is separate from the publishing worker and does not enable publishing flags or schedules.

## Scheduled publishing job materialization

M25 adds the backend-only `materialize_scheduled_publishing_jobs` RPC and calls it from the publishing worker after the global publishing switch and official-adapter readiness checks pass, but before due jobs are claimed. It creates durable queued jobs only when the schedule remains `scheduled`, the content and latest matching platform variant are explicitly approved, the matching social account is connected, and exactly one account matches the schedule's workspace/brand/platform. This avoids silently publishing the same scheduled content to every connected account.

The job ID and idempotency key are derived from the schedule ID, and duplicate inserts are ignored atomically. Instagram Reels and YouTube Shorts schedule labels are normalized to their account platform identifiers. The worker reports materialization counts alongside claimed-job outcomes.

This does **not** enable a cron/automatic invocation schedule. The worker remains disabled unless the global publishing switch, an official adapter, and its required configuration are explicitly enabled; live posting has not been activated as part of M25.

## Publishing operations overview

M24 adds a read-only owner/admin operations panel to Settings. It shows workspace-scoped publishing-job counts, attempts and retry timestamps, sanitized error diagnostics, provider post IDs, and the latest reconciliation audit evidence. Data is loaded only on request through the signed-in browser runtime and the JWT-protected `publishing-operations` Edge Function. A service-role-only, `SECURITY INVOKER` database RPC rechecks workspace owner/admin membership and returns at most 50 recent jobs and 50 audit events. The UI does not expose retry, cancel, approve, or publish actions.

## Instagram Reels publishing adapter

M22 adds the first official provider adapter for Instagram Login, limited to the `Instagram Reels` variant. It requires an HTTPS public video URL with an `.mp4` or `.mov` path and the `instagram_business_content_publish` permission.

The adapter checks publishing quota, creates a media container, polls its state until `FINISHED`, then calls `media_publish`. It reads access tokens only through the backend-only Vault RPC and sends them to Meta in the HTTPS Authorization header. Lease-fenced checkpoints are stored with the publishing job so a worker restart can reuse an existing container or recover a provider post ID.

If the publish request times out or the response is ambiguous, the job is marked `PUBLISH_OUTCOME_UNKNOWN` for manual reconciliation rather than automatically posting again. This avoids duplicates when Meta accepted a post but the worker lost the response.

Activation later requires `META_GRAPH_API_VERSION`, `ORBITOS_INSTAGRAM_PUBLISHING_ADAPTER_ENABLED=true`, and the separate `ORBITOS_PUBLISHING_ENABLED=true` in Supabase Edge Function secrets. None of these switches is enabled here; no publishing schedule is added.
