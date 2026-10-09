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

## Workspace roles for approval and scheduling

Workspace-scoped CRUD access remains governed by RLS. Approval is a separate authorization boundary: browser writes that create or transition content into/out of an approved state, modify any protected field on an already-approved record, change its workspace/brand/content linkage, or delete approved content are accepted only for workspace owners, admins, and editors. This includes both `content_items.status` and `content_variants.approved/status`; the database guard is not a UI-only check.

Schedules remain visible to workspace members, but inserting, updating, and deleting them requires the owner, admin, or editor role. Analysts and viewers can still read content and schedules and work with drafts, but cannot directly set approval state, change protected fields on approved records, delete approved content, or alter schedule records. The UI also hides approval/scheduling actions for these roles; database enforcement remains authoritative. The scheduler independently rechecks approval before job materialization, so a schedule alone does not authorize publishing.

## Current deployment posture

The production UI remains local-first by default. The Supabase project hosts the live schema, authentication boundary, OAuth/publishing Edge Functions, Vault-backed credentials, and gated schedulers. The current database has no authenticated users, connected social accounts, scheduled records, or publishing jobs, so real-account integration still requires an operator-controlled setup and test.

When the browser uses authenticated-persistent mode, Auth supplies the verified user identity and RLS enforces workspace ownership at the database boundary.

## Publishing boundary

Database authentication does not enable social publishing. Publishing still requires the existing official-adapter, credentials, idempotency, rate-limit, schedule, human-approval, and audit gates.
## Publishing outcome reconciliation

Ambiguous provider outcomes are not automatically retried. The `publishing-reconciliation` Edge Function requires a verified signed-in user and permits only workspace owners/admins to resolve a failed job marked `PUBLISH_OUTCOME_UNKNOWN`. The operator identity is derived from the verified session, never from request input, and the database rechecks the operator's workspace role.

The database RPC is executable only by `service_role`, uses `SECURITY INVOKER` with an empty search path, and writes to a private RLS-enabled audit table. The table grants the service role select/insert only; it grants no update/delete, and audit rows have no cascading job foreign key. Resolutions are limited to confirming an actual provider post ID or closing the job without retry. The RPC and endpoint never enqueue or publish content.

## Publishing operations read boundary

The Settings operations panel is shown only when the signed-in runtime carries a workspace owner/admin role. Its Edge Function also verifies the signed-in user and checks membership server-side; the database RPC repeats that role check rather than trusting the browser. The RPC is `SECURITY INVOKER`, uses an empty search path, and can be executed only by `service_role`.

The returned summary contains workspace-scoped counts and up to 50 recent jobs plus 50 reconciliation events. The response intentionally omits job payloads, idempotency keys, Vault references, access tokens, and raw provider exceptions. Error-message text is bounded, and the UI escapes all values before rendering them. The view is read-only: it cannot retry, cancel, approve, reconcile, or publish jobs.

## Scheduled job materialization

The `materialize_scheduled_publishing_jobs` database RPC is `SECURITY INVOKER`, uses an empty search path, and is executable only by `service_role`. The worker calls it only after the global publishing switch is explicitly enabled and at least one official adapter passes readiness checks. The RPC does not contact a provider; it creates durable queued records only after re-checking workspace/brand scope, approved content, the latest approved platform variant, and a unique connected account match.

Schedule-derived IDs and idempotency keys plus conflict-safe inserts make repeated invocations safe. The RPC does not change schedules, auto-approve content, fan out one schedule to multiple matching accounts, or create a worker cron. Browser/client roles cannot execute the RPC.

## Runtime honesty

The UI must never label the local browser runtime as authenticated or backend-persistent. Runtime mode is explicit and comes from the runtime environment boundary. A future Supabase connection must provide a verified Auth user and workspace membership before switching to authenticated-persistent mode.

## Backend-owned records

The browser must not write `social_accounts`, `publishing_jobs`, or `subscriptions` directly. Authenticated workspace members retain RLS-scoped read access only. OAuth callbacks own social-account metadata; job materialization and lease-fenced worker RPCs own publishing state; trusted backend/billing services own subscription state. The browser persistence adapter reads these records for display but excludes them from snapshot writes.
