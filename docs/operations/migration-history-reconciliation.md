# Database migration history reconciliation

**Audit date:** 2026-10-12  
**Purpose:** reconcile tracked schema history with the connected production project's applied migration versions.

## Current state

The connected Supabase project now reports 23 applied migrations, ending at `20261012022853_restrict_unsafe_legacy_table_privileges`. The repository tracks all 23 production version/name pairs under `supabase/migrations/`. The migration was applied through the connected Supabase project on 2026-10-12; the returned production migration history records version `20261012022853`, so the repository filename must use that exact version and name.

The merged main commit (`15cdfa5bbdc0ed9e62bc5e4af8ae1f576ca9cfd1`) passed runtime/security contract tests, browser E2E, and fresh local migration replay in GitHub Actions. A successful local replay proves replayability, not exact schema equivalence to production.

Most restored migrations were recovered from the versioned SQL contracts already stored under `docs/architecture/`. The initial schema was recovered from historical repository commit `0b80dc7bb83de2c28aaf7ef6bd07a060cc41645f`, and workspace/brand indexes from commit `39f69be5ae7146c78c3dd7c7673cd55fac71fada`.

**Important limitation:** `20261008092905_orbitoos_foundation_expansion_v2.sql` is reconstructed from read-only production schema catalog observations plus the tracked social-publishing foundation SQL; it is not a byte-for-byte copy of the original manually applied SQL. The historical local replay passed, but a production-to-local schema comparison is still outstanding.

## Security finding: excessive table-level grants

A read-only production catalog query on 2026-10-11 found effective `TRUNCATE`, `REFERENCES`, and `TRIGGER` privileges for both `anon` and `authenticated` on `activities`, `api_logs`, `notifications`, and `plans`. The `authenticated` role also had those table-level privileges on the optional legacy `profiles` table. RLS was enabled, and the inspected row policies were scoped to workspace membership, the signed-in user, or active plans, but **RLS does not protect a table from `TRUNCATE`**. The broad default grants therefore did not follow the intended row-level security boundary.

The production migration `20261012022853_restrict_unsafe_legacy_table_privileges` revokes browser-role table grants on those five tables, then restores only the operations supported by existing policies: workspace-scoped CRUD for activities and notifications; SELECT/INSERT/DELETE for API logs; SELECT-only active plan access; and self/workspace-scoped profile access. It also revokes broad default table and sequence privileges for `anon` and `authenticated` on future objects created by the application migration role (`postgres`) in `public`. Explicit `service_role` permissions are retained.

**Post-apply verification on 2026-10-12:** a read-only query confirmed that RLS remained enabled and effective `TRUNCATE`, `REFERENCES`, and `TRIGGER` privileges were false for both browser roles on all five tables. The `postgres` default ACL entries for new `public` tables and sequences no longer list `anon` or `authenticated`. The application tables inspected are owned by `postgres`. The managed `supabase_admin` role still has its own broad default ACL entry; it was not changed because that superuser may be used by Supabase-managed operations. Revisit only after a separate compatibility assessment identifies whether application objects are ever created under that role.

The production Auth user/workspace/membership/social-account/schedule/job counts are still zero, so real-account workspace acceptance has not yet passed. Keep publishing and token-refresh feature switches disabled until that acceptance and operator-controlled Meta setup are complete.

## Follow-up acceptance criteria

1. Compare tables, columns, constraints, indexes, RLS policies, grants, functions, extension placement, and scheduled-job definitions between a clean local replay and production using read-only metadata queries.
2. Resolve only verified differences. Keep production changes separate from repository reconstruction and review any DDL before applying it.
3. Keep the production grant checks as a regression acceptance step and rerun them after privilege-related migrations.
4. Compare the managed `supabase_admin` default ACL with the intended platform behavior before any decision to change it.
5. Verify the active-plan SELECT path and intended authenticated row-scoped operations with a real operator workspace once available.
6. Verify scheduler and Vault setup without copying production secret values. Keep `ORBITOS_PUBLISHING_ENABLED`, `ORBITOS_INSTAGRAM_PUBLISHING_ADAPTER_ENABLED`, and `ORBITOS_INSTAGRAM_REFRESH_ENABLED` disabled until the real account acceptance, credential configuration, and controlled publishing test are separately approved.
7. Do not claim full production schema parity until the comparison is complete.

The production privilege hardening is now applied and verified at the effective table-grant level. The larger schema-parity comparison remains open, and the real authenticated workspace acceptance is still blocked on an operator-controlled account and email confirmation.
