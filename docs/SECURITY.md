# OrbitOS Security Boundary

## Workspace ownership

The persistent target model treats a workspace as the tenant boundary.

- Authenticated users obtain access through `workspace_members`.
- Membership rows connect `auth.users.id` to a workspace and carry a role.
- Application records carry `workspace_id`.
- Brand and execution records additionally carry `brand_id`.
- The browser must never receive a Supabase service-role/secret key.

## RLS strategy

All exposed application tables have Row Level Security enabled.

Access is limited to authenticated users whose workspace membership is resolved through `private.user_workspace_ids()`.

The helper is deliberately placed in the non-exposed `private` schema and uses `security definer set search_path = ''` so it can read membership rows without creating recursive RLS policies. This follows Supabase's documented membership-policy pattern.

The contract grants:

- Workspace members: read access to memberships.
- Authenticated workspace members: CRUD access to brand/content/analytics/learning records in their own workspaces.
- Workspace provisioning and membership writes: backend-controlled until a dedicated invitation/bootstrap flow exists.

## Why this is not live yet

OrbitOS remains local-first. The repository contains the persistent schema and adapter contract, but no live Supabase project is created or connected by default.

When a real backend is introduced, Auth supplies the user identity and RLS enforces workspace ownership at the database boundary.

## Publishing boundary

Database authentication does not enable social publishing. Publishing still requires the existing official-adapter, credentials, idempotency, rate-limit, schedule, human-approval, and audit gates.
## Runtime honesty

The UI must never label the local browser runtime as authenticated or backend-persistent. Runtime mode is explicit and comes from the runtime environment boundary. A future Supabase connection must provide a verified Auth user and workspace membership before switching to authenticated-persistent mode.