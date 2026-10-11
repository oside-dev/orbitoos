# Database migration history reconciliation

**Audit date:** 2026-10-11  
**Purpose:** reconcile tracked schema history with the connected production project's applied migration versions.

## Current state

The connected Supabase project currently reports 22 applied migrations, ending at `20261009232954_orbitoos_profiles_workspace_visibility`. The repository tracks those 22 production version/name pairs under `supabase/migrations/`. This security branch adds `20261011102000_orbitoos_restrict_unsafe_table_privileges` as a **source-only pending migration**; it is not yet recorded as applied to production.

The preceding main commit (`3188967cd95a98959bad6f1b396fa2c13b36b21e`) passed runtime/security contract tests, browser E2E, and a fresh local replay of the 22-version historical chain in GitHub Actions. The new pending migration must pass the same CI pipeline before it is considered release-ready. A successful local replay proves replayability, not exact schema equivalence to production.

Most restored migrations were recovered from the versioned SQL contracts already stored under `docs/architecture/`. The initial schema was recovered from historical repository commit `0b80dc7bb83de2c28aaf7ef6bd07a060cc41645f`, and workspace/brand indexes from commit `39f69be5ae7146c78c3dd7c7673cd55fac71fada`.

**Important limitation:** `20261008092905_orbitoos_foundation_expansion_v2.sql` is reconstructed from read-only production schema catalog observations plus the tracked social-publishing foundation SQL; it is not a byte-for-byte copy of the original manually applied SQL. The historical local replay passed, but a production-to-local schema comparison is still outstanding.

## Security finding: excessive table-level grants

A read-only production catalog query on 2026-10-11 found effective `TRUNCATE`, `REFERENCES`, and `TRIGGER` privileges for both `anon` and `authenticated` on `activities`, `api_logs`, `notifications`, and `plans`. The `authenticated` role also had those table-level privileges on the optional legacy `profiles` table. RLS was enabled, and the inspected row policies were scoped to workspace membership, the signed-in user, or active plans, but **RLS does not protect a table from `TRUNCATE`**. The broad default grants therefore did not follow the intended row-level security boundary.

The pending source migration `20261011102000_orbitoos_restrict_unsafe_table_privileges` revokes browser-role table grants on those five tables, then restores only the operations supported by existing policies: workspace-scoped CRUD for activities and notifications; SELECT/INSERT/DELETE for API logs; SELECT-only active plan access; and self/workspace-scoped profile access. It also revokes broad default table and sequence privileges for `anon` and `authenticated` on future objects created by the application migration role (`postgres`) in `public`, so the same grants are not silently reintroduced by later migrations. Explicit `service_role` permissions are retained. Its CI contract checks both current-table grants and future-object defaults.

**Production is not yet fixed by this source change.** The migration must pass CI, be reviewed, and then be applied as a controlled release. Until that deployment is verified, do not describe the production grants as remediated. Keep both publishing gates and token refresh disabled during this verification.

## Follow-up acceptance criteria

1. Compare tables, columns, constraints, indexes, RLS policies, grants, functions, extension placement, and scheduled-job definitions between a clean local replay and production using read-only metadata queries.
2. Resolve only verified differences. Keep production changes separate from repository reconstruction and review any DDL before applying it.
3. Release the pending `20261011102000_orbitoos_restrict_unsafe_table_privileges` migration only after its CI replay and contract test pass; then query effective grants again to confirm `anon` and `authenticated` do not hold `TRUNCATE`, `REFERENCES`, or `TRIGGER` on the five tables.
4. Query `pg_default_acl` after release and confirm the `postgres` defaults for `public` tables and sequences no longer grant privileges to `anon` or `authenticated`.
5. Verify that the active-plan SELECT path and intended authenticated row-scoped operations still work after the privilege migration.
6. Verify scheduler and Vault setup without copying production secret values. Keep `ORBITOS_PUBLISHING_ENABLED`, `ORBITOS_INSTAGRAM_PUBLISHING_ADAPTER_ENABLED`, and `ORBITOS_INSTAGRAM_REFRESH_ENABLED` disabled throughout verification.
7. Do not claim full production schema parity until the comparison is complete.

The pending security migration and its CI changes have not been applied to the live production database. This is a reproducibility/schema-parity issue and an identified least-privilege gap, not evidence that the production app is down.
