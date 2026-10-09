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
- M16 — Publishing worker shell — secret-key-authenticated Edge Function, fail-closed execution, adapter-readiness gates, and sanitized failure handling; no official adapter is registered yet
- M17 — Vault-backed social credentials — service-role-only token store/read/delete RPCs, encrypted per-account Vault values, and automatic secret cleanup when references are removed
- M18 — Instagram Login OAuth foundation — signed-in workspace-admin start endpoint, hashed single-use callback state, server-side token exchange, Vault storage, and disabled-by-default configuration

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

This is orchestration infrastructure, not a live publisher. Jobs will not be sent to social networks until an official provider adapter, OAuth credential lifecycle, provider idempotency strategy, rate limits, and human approval checks are implemented and configured. Error diagnostics must be sanitized before they are persisted.


## Publishing worker shell

M16 adds `supabase/functions/publishing-worker/index.ts`. The endpoint validates a Supabase secret key through `@supabase/server`; the Edge Function gateway's JWT check is disabled only because the handler applies its own secret-key authentication. It is disabled unless `ORBITOS_PUBLISHING_ENABLED=true`, and even then it returns without claiming jobs until an official adapter is registered with credentials, idempotency, and rate-limit capabilities marked ready. The repository does not set the worker-enable flag or add a schedule.

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

Reconnect operations reuse an existing social account's database ID so private Vault references and publishing-job foreign keys remain stable. If Vault token rotation fails, the callback restores the previous account status and metadata instead of forcing a healthy existing account into a reauthorization state. If final status persistence fails, it preserves the credential for an existing account rather than deleting it; newly created accounts still clean up newly written secrets on finalization failure.

The OAuth state table also has supporting indexes on its user, workspace, and brand foreign keys so cleanup and parent-row cascades do not need unindexed scans.
