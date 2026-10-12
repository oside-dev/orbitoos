# Database migration history reconciliation

**Audit date:** 2026-10-12  
**Purpose:** reconcile tracked schema history with the connected production project's applied migration versions.

## Current state

The connected Supabase project now reports 24 applied migrations, ending at `20261012030454_track_auth_profile_creation_trigger`. The repository tracks all 24 production version/name pairs under `supabase/migrations/`. The latest migration was applied through the connected Supabase project on 2026-10-12; Supabase recorded the exact version/name pair `20261012030454 / track_auth_profile_creation_trigger`.

The merged main commit (`15cdfa5bbdc0ed9e62bc5e4af8ae1f576ca9cfd1`) passed runtime/security contract tests, browser E2E, and fresh local migration replay in GitHub Actions. A successful local replay proves replayability, not exact schema equivalence to production.

Most restored migrations were recovered from the versioned SQL contracts already stored under `docs/architecture/`. The initial schema was recovered from historical repository commit `0b80dc7bb83de2c28aaf7ef6bd07a060cc41645f`, and workspace/brand indexes from commit `39f69be5ae7146c78c3dd7c7673cd55fac71fada`.

**Important limitation:** `20261008092905_orbitoos_foundation_expansion_v2.sql` is reconstructed from read-only production schema catalog observations plus the tracked social-publishing foundation SQL; it is not a byte-for-byte copy of the original manually applied SQL. The tracked clean-local migration replay passes, but a complete production-to-local schema comparison is still outstanding.

## Schema parity finding: Auth profile bootstrap trigger

A read-only catalog audit on 2026-10-12 found the live trigger `auth.on_auth_user_created`, calling `private.handle_new_user()`. The function is `SECURITY DEFINER`, sets an empty `search_path`, and inserts a supplementary `public.profiles` row from user metadata with `ON CONFLICT (id) DO NOTHING`. That function and trigger were present in production but were missing from the tracked migration chain and `supabase/schema.sql`, so a newly rebuilt local database could behave differently on Auth signup.

Migration `20261012030454_track_auth_profile_creation_trigger` is now applied to production and tracked in source. It recreates the same function definition and adds the trigger only if the exact trigger/function binding is absent; it fails closed if a trigger with the same name points elsewhere. The live trigger remains enabled and the Auth user/profile counts remain zero, so a real signup has not yet exercised it end to end.

## Security finding: excessive table-level grants

A read-only production catalog query on 2026-10-11 found effective `TRUNCATE`, `REFERENCES`, and `TRIGGER` privileges for both `anon` and `authenticated` on `activities`, `api_logs`, `notifications`, and `plans`. The `authenticated` role also had those table-level privileges on the optional legacy `profiles` table. RLS was enabled, and the inspected row policies were scoped to workspace membership, the signed-in user, or active plans, but **RLS does not protect a table from `TRUNCATE`**. The broad default grants therefore did not follow the intended row-level security boundary.

The production migration `20261012022853_restrict_unsafe_legacy_table_privileges` revokes browser-role table grants on those five tables, then restores only the operations supported by existing policies: workspace-scoped CRUD for activities and notifications; SELECT/INSERT/DELETE for API logs; SELECT-only active plan access; and self/workspace-scoped profile access. It also revokes broad default table and sequence privileges for `anon` and `authenticated` on future objects created by the application migration role (`postgres`) in `public`. Explicit `service_role` permissions are retained.

**Post-apply verification on 2026-10-12:** a read-only query confirmed that RLS remained enabled and effective `TRUNCATE`, `REFERENCES`, and `TRIGGER` privileges were false for both browser roles on all five tables. The `postgres` default ACL entries for new `public` tables and sequences no longer list `anon` or `authenticated`. The application tables inspected are owned by `postgres`. The managed `supabase_admin` role still has its own broad default ACL entry; it was not changed because that superuser may be used by Supabase-managed operations. Revisit only after a separate compatibility assessment identifies whether application objects are ever created under that role.

The production Auth user/workspace/membership/social-account/schedule/job/content-item/profile counts are still zero, so real-account workspace acceptance has not yet passed. The auth profile trigger is now tracked, but remains unexercised until a real signup. Keep publishing and token-refresh feature switches disabled until workspace acceptance and operator-controlled Meta setup are complete.

## Follow-up acceptance criteria

1. Finish the production-to-local comparison for all tables/columns, constraints, indexes, RLS policies, grants, functions/triggers, extensions, and scheduled-job definitions. The auth profile bootstrap trigger is now tracked, but the reconstructed foundation-expansion migration still warrants a full catalog diff.
2. Resolve only verified differences. Keep production changes separate from repository reconstruction and review any DDL before applying it.
3. Keep the production grant checks as a regression acceptance step and rerun them after privilege-related migrations.
4. Compare the managed `supabase_admin` default ACL with the intended platform behavior before any decision to change it.
5. Verify the active-plan SELECT path and intended authenticated row-scoped operations with a real operator workspace once available.
6. Verify scheduler and Vault setup without copying production secret values. Keep `ORBITOS_PUBLISHING_ENABLED`, `ORBITOS_INSTAGRAM_PUBLISHING_ADAPTER_ENABLED`, and `ORBITOS_INSTAGRAM_REFRESH_ENABLED` disabled until the real account acceptance, credential configuration, and controlled publishing test are separately approved.
7. Do not claim full production schema parity until the comparison is complete.

The production privilege hardening is now applied and verified at the effective table-grant level. The larger schema-parity comparison remains open, and the real authenticated workspace acceptance is still blocked on an operator-controlled account and email confirmation.
