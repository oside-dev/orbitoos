# OrbitOS Engineering Rules

## Development loop

GitHub is the development source of truth.

Work sequence:

1. change domain/core/adapters/tests in GitHub,
2. validate through GitHub Actions,
3. inspect the diff,
4. deploy to Vercel only when a release checkpoint is reached.

Frequent inline Vercel deployments are intentionally avoided.

## Layer rules

### Domain
Contains stable data shapes and pure helpers.

Domain code must not import:
- browser APIs,
- Vercel SDKs,
- Supabase SDKs,
- social platform SDKs,
- AI vendor SDKs.

### Core
Owns business rules and agent orchestration.

Core code may import domain contracts, but not vendor implementations.

### Adapters
Translate external services into the domain contracts.

Examples:
- local store
- backend store
- AI provider
- research provider
- social publisher
- analytics ingestion

### UI
Owns rendering and user interaction. UI should call core/adapters through stable APIs instead of embedding business rules permanently.

## Publishing safety

Real publishing is always a separate execution boundary:

draft → review → human approval → schedule → publisher adapter

No background process may bypass approval.

## Cost safety

A free/local implementation must remain available for core workflows. Optional paid providers must never become mandatory to open, edit, review, or export workspace data.


## Authentication boundary

Authentication is an adapter boundary, not a core dependency.

- Core/domain code never imports a Supabase SDK.
- The Supabase auth adapter returns sanitized session metadata only; access and refresh tokens stay inside the auth client.
- A workspace context adapter resolves the authenticated user's accessible workspaces.
- The authenticated persistent runtime refuses to initialize without a real authenticated user and a workspace membership.
- Workspace provisioning and membership mutation remain backend-controlled until an explicit invitation/bootstrap flow exists.
