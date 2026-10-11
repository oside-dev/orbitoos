# Database migration history reconciliation

**Audit date:** 2026-10-11  
**Purpose:** reconcile tracked schema history with the connected production project's applied migration versions.

## Current state

The connected Supabase project reported 22 applied migrations, ending at `20261009232954_orbitoos_profiles_workspace_visibility`. The repository now tracks all 22 version/name pairs under `supabase/migrations/`.

The current GitHub Actions database-migrations job starts a fresh local Supabase stack and applies all tracked migrations. The current head passed that job, along with runtime/security contract tests and browser E2E. This establishes that the tracked SQL is replayable in the test environment; it does not establish exact schema equivalence to production.

Most restored migrations were recovered from the versioned SQL contracts already stored under `docs/architecture/`. The initial schema was recovered from historical repository commit `0b80dc7bb83de2c28aaf7ef6bd07a060cc41645f`, and workspace/brand indexes from commit `39f69be5ae7146c78c3dd7c7673cd55fac71fada`.

**Important limitation:** `20261008092905_orbitoos_foundation_expansion_v2.sql` is reconstructed from read-only production schema catalog observations plus the tracked social-publishing foundation SQL; it is not a byte-for-byte copy of the original manually applied SQL. The final local replay passed, but a production-to-local schema comparison is still outstanding.

## Follow-up acceptance criteria

1. Compare tables, columns, constraints, indexes, RLS policies, grants, functions, extension placement, and scheduled-job definitions between a clean local replay and production using read-only metadata queries.
2. Resolve only verified differences. Keep production changes separate from repository reconstruction and review any DDL before applying it.
3. Verify scheduler and Vault setup without copying production secret values. Keep `ORBITOS_PUBLISHING_ENABLED`, `ORBITOS_INSTAGRAM_PUBLISHING_ADAPTER_ENABLED`, and `ORBITOS_INSTAGRAM_REFRESH_ENABLED` disabled throughout verification.
4. Do not claim full production schema parity until the comparison is complete.

The migration files and CI changes in this branch have not been applied to the live production database. This is a reproducibility/schema-parity issue, not evidence that the production app is down.
