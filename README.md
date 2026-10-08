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
- M5 — Official publishing adapters
- M6 — Real analytics ingestion + learning
- M7 — Multi-brand automation

The next engineering work happens in GitHub first. Production deployment is a release activity, not the development loop.
