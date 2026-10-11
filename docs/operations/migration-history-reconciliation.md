# Database migration history reconciliation

**Audit date:** 2026-10-11  
**Purpose:** reconcile tracked schema history with the connected production project's applied migration versions.

## Current state

The connected Supabase project reported 22 applied migrations, ending at `20261009232954_orbitoos_profiles_workspace_visibility`. The repository now tracks all 22 version/name pairs under `supabase/migrations/`. The CI contract checks filename format, uniqueness, the complete version set, and required objects in the critical migration files.

Most restored migrations were recovered from the versioned SQL contracts already stored under `docs/architecture/`. The initial schema was recovered from historical repository commit `0b80dc7bb83de2c28aaf7ef6bd07a060cc41645f`, and workspace/brand indexes from commit `39f69be5ae7146c78c3dd7c7673cd55fac71fada`.

**Important:** the `20261008092905_orbitoos_foundation_expansion_v2.sql` file is reconstructed from read-only production schema catalog observations plus the tracked social-publishing foundation SQL; it is not a byte-for-byte copy of the original applied SQL.

## Verification still required

The repository version map and static object checks do **not** prove the migration chain can replay on an empty database. Until a clean replay has been run against a disposable local PostgreSQL/Supabase environment, do not claim that `supabase db reset` or a fresh-project `supabase db push` is verified.

Next acceptance work:
1. Apply the full migration chain to a disposable database, never production.
2. Verify tables, columns, constraints, indexes, RLS policies, grants and functions.
3. Confirm scheduler migrations create the intended cron definitions without enabling publishing; validate Vault setup without copying production secret values.
4. Keep `ORBITOS_PUBLISHING_ENABLED`, `ORBITOS_INSTAGRAM_PUBLISHING_ADAPTER_ENABLED`, and `ORBITOS_INSTAGRAM_REFRESH_ENABLED` disabled during the replay and first-workspace acceptance.

The restored files are repository changes only. They have not been applied to the live production database. This issue concerns reproducibility, not evidence that the production app is down.
