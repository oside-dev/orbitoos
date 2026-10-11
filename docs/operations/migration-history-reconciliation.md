# Database migration history reconciliation

**Audit date:** 2026-10-11  
**Purpose:** prevent schema-history drift from being mistaken for a clean-install-ready database.

## Observed production state

The connected Supabase project `orbitoos` was healthy during this audit. Its applied migration history contains 22 entries, ending at `20261009232954_orbitoos_profiles_workspace_visibility`.

The repository's `supabase/migrations/` directory contains only eight migration files. Two of those filenames did not match the versions recorded by the live database; this change aligns them:

- `20261008060308_content_strategy_artifact.sql`
- `20261009075030_orbitoos_publishing_scheduler.sql`

The eight currently tracked migration files are checked against the recorded production version/name subset by `tests/migration-history-contract.mjs`. This is **not** a claim that all historical migration SQL is restored.

## Missing historical migration files

The production database reports these applied migrations without matching files under `supabase/migrations/`:

- `20261008053220_orbitoos_initial_schema`
- `20261008053534_orbitoos_foreign_key_indexes`
- `20261008092905_orbitoos_foundation_expansion_v2`
- `20261008092920_orbitoos_api_logs_actor_index`
- `20261009023848_orbitoos_publishing_job_orchestration`
- `20261009024728_orbitoos_social_account_vault`
- `20261009025607_orbitoos_social_oauth_state`
- `20261009031316_orbitoos_social_oauth_fk_indexes`
- `20261009032345_orbitoos_content_variant_media_url`
- `20261009040018_orbitoos_social_account_reconnect`
- `20261009052046_orbitoos_publishing_job_reconciliation`
- `20261009052255_orbitoos_publishing_job_reconciliation_policies`
- `20261009055320_orbitoos_publishing_operations_overview`
- `20261009062240_orbitoos_scheduled_job_materialization`

Some related SQL contracts are stored under `docs/architecture/`, but those files are not a complete, ordered replacement for the missing migration history.

## Important distinction

`supabase/schema.sql` currently defines the core content/workspace tables. The live database also has support tables and publishing/OAuth infrastructure that are not fully represented by that snapshot. A successful runtime test or a green GitHub Actions run does not establish that a fresh database can be rebuilt from this repository.

Until the history is reconciled, do **not** assume `supabase db reset` or `supabase db push` against a new project will reproduce the live database safely. Do not repair this by marking migrations applied without actually validating their effects.

## Follow-up acceptance criteria

1. Recover or deliberately replace the missing migration history in version order, with reviewed SQL and accurate names.
2. Build a disposable Supabase development branch/database from the repository migration chain.
3. Compare tables, constraints, RLS policies/grants, functions, indexes, Vault references, and scheduled job definitions against the intended schema. Never copy production secret values into source.
4. Keep live publishing and token refresh disabled during the reconciliation and workspace acceptance checks.
5. Only then document clean-install/recovery as verified.

This is a repository reproducibility issue, not evidence that the current production application is down.
