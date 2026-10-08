# OrbitOS

**OrbitOS — Your AI Content Operating System**

A modular, zero-budget-first social media operating system.

## Core loop

Idea → Research → Strategy → Draft → Platform Variants → Review → Approve → Schedule → Analytics → Learning

## Current runtime

The browser MVP is dependency-free and local-first:

- browser persistence through localStorage
- portable JSON backup/import
- deterministic local content generation
- local research and analytics fixtures
- human approval before scheduling
- external social publishing disabled
- no paid AI/API dependency

## Architecture

The repository is being split into four internal layers:

- **Domain** — stable models and pipeline stages
- **Core** — orchestration and business rules
- **Adapters** — replaceable persistence/content/research/publishing implementations
- **Runtime UI** — current static browser application

Agents depend on contracts rather than vendor SDKs. That lets providers change without rewriting the product.

## Zero-budget policy

No paid service is a hard dependency for the core product.

Optional external providers may be added later, but:

1. the local workflow must remain usable,
2. secrets must never ship to the browser,
3. publishing stays disabled until an official adapter and approval boundary exist.

## Repository

Canonical source:

https://github.com/oside-dev/orbitoos

Production runtime:

https://orbitoos.vercel.app

## Engineering roadmap

- M0 — Foundation
- M1 — Content operating loop
- M2 — Internal domain/core/adapters split
- M3 — Free/local AI adapter
- M4 — Persistent backend adapter
- M5 — Official publishing adapters
- M6 — Real analytics ingestion + learning
- M7 — Multi-brand automation

The next engineering work happens in GitHub first. Production deployment is a release activity, not the development loop.
