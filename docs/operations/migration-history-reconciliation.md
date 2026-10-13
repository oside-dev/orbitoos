# Database migration history reconciliation

**Audit date:** 2026-10-12  
**Purpose:** reconcile tracked schema history with the connected production project's applied migration versions.

## Current state

The connected Supabase project reports 25 applied migrations, ending at `20261013050901_restrict_auth_profile_trigger_execution`. The repository tracks all 25 production version/name pairs under `supabase/migrations/`. The latest migration was applied through the connected Supabase project on 2026-10-13; Supabase recorded the exact version/name pair `20261013050901 / restrict_auth_profile_trigger_execution`.

The latest main validation run passed runtime/security contract tests, browser E2E, and fresh local migration replay in GitHub Actions. A successful local replay proves replayability, not exact schema equivalence to production.

Most restored migrations were recovered from the versioned SQL contracts already stored under `docs/architecture/`. The initial schema was recovered from historical repository commit `0b80dc7bb83de2c28aaf7ef6bd07a060cc41645f`, and workspace/brand indexes from commit `39f69be5ae7146c78c3dd7c7673cd55fac71fada`.

**Important limitation:** `20261008092905_orbitoos_foundation_expansion_v2.sql` is reconstructed from read-only production schema catalog observations plus the tracked social-publishing foundation SQL; it is not a byte-for-byte copy of the original manually applied SQL. The tracked clean-local migration replay passes, but a complete production-to-local schema comparison is still outstanding.

## Schema parity finding: Auth profile bootstrap trigger

A read-only catalog audit on 2026-10-12 found the live trigger `auth.on_auth_user_created`, calling `private.handle_new_user()`. The function is `SECURITY DEFINER`, sets an empty `search_path`, and inserts a supplementary `public.profiles` row from user metadata with `ON CONFLICT (id) DO NOTHING`. That function and trigger were present in production but were missing from the tracked migration chain and `supabase/schema.sql`, so a newly rebuilt local database could behave differently on Auth signup.

Migration `20261012030454_track_auth_profile_creation_trigger` is now applied to production and tracked in source. It recreates the same function definition and adds the trigger only if the exact trigger/function binding is absent; it fails closed if a trigger with the same name points elsewhere. The live trigger remains enabled. A later observed signup created one confirmed Auth user and one profile row, demonstrating the trigger's profile side effect; the separate workspace bootstrap acceptance still needs verification.

A follow-up least-privilege audit on 2026-10-13 found PostgreSQL's default function ACL left EXECUTE effective for anon, authenticated, and service_role on this trigger helper. Migration `20261013050901_restrict_auth_profile_trigger_execution` is applied in production and tracked in source at the exact recorded version. It revokes EXECUTE from PUBLIC, anon, authenticated, and service_role, then checks the effective ACLs and the trigger/function binding. A read-only post-apply query confirmed EXECUTE is false for anon, authenticated, and service_role, and the Auth trigger remains enabled. The migration history now records 25 applied versions.

## Security finding: excessive table-level grants

A read-only production catalog query on 2026-10-11 found effective `TRUNCATE`, `REFERENCES`, and `TRIGGER` privileges for both `anon` and `authenticated` on `activities`, `api_logs`, `notifications`, and `plans`. The `authenticated` role also had those table-level privileges on the optional legacy `profiles` table. RLS was enabled, and the inspected row policies were scoped to workspace membership, the signed-in user, or active plans, but **RLS does not protect a table from `TRUNCATE`**. The broad default grants therefore did not follow the intended row-level security boundary.

The production migration `20261012022853_restrict_unsafe_legacy_table_privileges` revokes browser-role table grants on those five tables, then restores only the operations supported by existing policies: workspace-scoped CRUD for activities and notifications; SELECT/INSERT/DELETE for API logs; SELECT-only active plan access; and self/workspace-scoped profile access. It also revokes broad default table and sequence privileges for `anon` and `authenticated` on future objects created by the application migration role (`postgres`) in `public`. Explicit `service_role` permissions are retained.

**Post-apply verification on 2026-10-12:** a read-only query confirmed that RLS remained enabled and effective `TRUNCATE`, `REFERENCES`, and `TRIGGER` privileges were false for both browser roles on all five tables. The `postgres` default ACL entries for new `public` tables and sequences no longer list `anon` or `authenticated`. The application tables inspected are owned by `postgres`. The managed `supabase_admin` role still has its own broad default ACL entry; it was not changed because that superuser may be used by Supabase-managed operations. Revisit only after a separate compatibility assessment identifies whether application objects are ever created under that role.

A real signup has now created one confirmed Auth user and one profile row, but the workspace, membership, brand, ideas, content items, schedules, social accounts, and publishing jobs remain zero because `bootstrap-workspace` returns HTTP 401. The auth profile trigger has therefore been exercised; the separate workspace bootstrap has not passed acceptance. A source fix for the normalized user-claim field is in review/deployment. Keep publishing and token-refresh feature switches disabled until workspace acceptance and operator-controlled Meta setup are complete.

## Read-only core-schema parity checkpoint — 2026-10-13

A follow-up catalog comparison was run against the connected production project `lkcbtgqdvzmaihcnxxwk` without changing database state.

- The canonical `supabase/schema.sql` plus the tracked expansion/alter migrations were compared against the live `public` and `private` table catalog.
- All **24** live application tables had a matching tracked source table definition.
- All **243** live application columns matched a tracked source column by table and column name. Data types also matched after normalizing PostgreSQL's `timestamptz` alias to `timestamp with time zone`.
- For the 11 canonical core tables, all **39** tracked RLS policy names/commands/roles were found live, with no extra policy names in that subset.
- All 24 explicit non-constraint indexes in `supabase/schema.sql` were present. Additional live indexes include primary-key/unique-constraint backing indexes and `schedules_materialization_idx`, which is introduced by later scheduled-job materialization work.
- The two live content approval role-guard triggers on `content_items` and `content_variants` correspond to tracked later migrations.

This is a **partial parity checkpoint**, not proof of full schema equivalence. The audit has not yet completed expression-level comparison of all defaults, check/FK constraint definitions, all index definitions, RLS predicates on every table, effective grants/default ACLs, all functions/triggers, extensions, and scheduler/Vault configuration. The reconstructed foundation-expansion migration remains the reason to keep the full comparison open. No production DDL or data was changed during this checkpoint.

## Follow-up acceptance criteria

1. Finish the production-to-local comparison for all tables/columns, constraints, indexes, RLS policies, grants, functions/triggers, extensions, and scheduled-job definitions. The auth profile bootstrap trigger is now tracked, but the reconstructed foundation-expansion migration still warrants a full catalog diff.
2. Resolve only verified differences. Keep production changes separate from repository reconstruction and review any DDL before applying it.
3. Keep the production grant checks as a regression acceptance step and rerun them after privilege-related migrations.
4. Compare the managed `supabase_admin` default ACL with the intended platform behavior before any decision to change it.
5. Verify the active-plan SELECT path and intended authenticated row-scoped operations with a real operator workspace once available.
6. Verify scheduler and Vault setup without copying production secret values. Keep `ORBITOS_PUBLISHING_ENABLED`, `ORBITOS_INSTAGRAM_PUBLISHING_ADAPTER_ENABLED`, and `ORBITOS_INSTAGRAM_REFRESH_ENABLED` disabled until the real account acceptance, credential configuration, and controlled publishing test are separately approved.
7. Do not claim full production schema parity until the comparison is complete.

The production privilege hardening is now applied and verified at the effective table-grant level. The larger schema-parity comparison remains open, and the real authenticated workspace acceptance is still blocked on an operator-controlled account and email confirmation.
