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
## Publishing outcome reconciliation

Ambiguous provider outcomes are not automatically retried. The `publishing-reconciliation` Edge Function requires a verified signed-in user and permits only workspace owners/admins to resolve a failed job marked `PUBLISH_OUTCOME_UNKNOWN`. The operator identity is derived from the verified session, never from request input, and the database rechecks the operator's workspace role.

The database RPC is executable only by `service_role`, uses `SECURITY INVOKER` with an empty search path, and writes to a private RLS-enabled audit table. The table grants the service role select/insert only; it grants no update/delete, and audit rows have no cascading job foreign key. Resolutions are limited to confirming an actual provider post ID or closing the job without retry. The RPC and endpoint never enqueue or publish content.

## Publishing operations read boundary

The Settings operations panel is shown only when the signed-in runtime carries a workspace owner/admin role. Its Edge Function also verifies the signed-in user and checks membership server-side; the database RPC repeats that role check rather than trusting the browser. The RPC is `SECURITY INVOKER`, uses an empty search path, and can be executed only by `service_role`.

The returned summary contains workspace-scoped counts and up to 50 recent jobs plus 50 reconciliation events. The response intentionally omits job payloads, idempotency keys, Vault references, access tokens, and raw provider exceptions. Error-message text is bounded, and the UI escapes all values before rendering them. The view is read-only: it cannot retry, cancel, approve, reconcile, or publish jobs.

## Runtime honesty

The UI must never label the local browser runtime as authenticated or backend-persistent. Runtime mode is explicit and comes from the runtime environment boundary. A future Supabase connection must provide a verified Auth user and workspace membership before switching to authenticated-persistent mode.