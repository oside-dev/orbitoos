import assert from "node:assert/strict";
import { readFileSync, readdirSync } from "node:fs";
import { join } from "node:path";
import { fileURLToPath } from "node:url";

const migrationsDir = fileURLToPath(new URL("../supabase/migrations/", import.meta.url));
const files = readdirSync(migrationsDir).filter((name) => name.endsWith(".sql")).sort();
const versions = files.map((name) => {
  const match = name.match(/^(\d{14})_(.+)\.sql$/);
  assert.ok(match, \`Migration filename must begin with a 14-digit version: \${name}\`);
  return { version: match[1], name: match[2], file: name };
});

assert.equal(new Set(versions.map(({ version }) => version)).size, versions.length,
  "Migration versions must be unique.");

const expected = new Map([
  ["20261008053220", "orbitoos_initial_schema"],
  ["20261008053534", "orbitoos_foreign_key_indexes"],
  ["20261008060308", "content_strategy_artifact"],
  ["20261008092905", "orbitoos_foundation_expansion_v2"],
  ["20261008092920", "orbitoos_api_logs_actor_index"],
  ["20261009023848", "orbitoos_publishing_job_orchestration"],
  ["20261009024728", "orbitoos_social_account_vault"],
  ["20261009025607", "orbitoos_social_oauth_state"],
  ["20261009031316", "orbitoos_social_oauth_fk_indexes"],
  ["20261009032345", "orbitoos_content_variant_media_url"],
  ["20261009040018", "orbitoos_social_account_reconnect"],
  ["20261009052046", "orbitoos_publishing_job_reconciliation"],
  ["20261009052255", "orbitoos_publishing_job_reconciliation_policies"],
  ["20261009055320", "orbitoos_publishing_operations_overview"],
  ["20261009062240", "orbitoos_scheduled_job_materialization"],
  ["20261009075030", "orbitoos_publishing_scheduler"],
  ["20261009082359", "orbitoos_instagram_token_refresh_scheduler"],
  ["20261009085818", "orbitoos_backend_owned_records"],
  ["20261009090948", "orbitoos_workspace_role_approval_guard"],
  ["20261009091753", "orbitoos_approved_content_role_guard"],
  ["20261009114305", "orbitoos_workspace_settings_role_guard"],
  ["20261009232954", "orbitoos_profiles_workspace_visibility"],
]);

assert.equal(versions.length, expected.size,
  "Tracked migration file count must match the recorded 22-entry production history.");
for (const migration of versions) {
  assert.equal(expected.get(migration.version), migration.name,
    \`Tracked migration does not match expected version/name: \${migration.file}\`);
}
for (const version of expected.keys()) {
  assert.ok(versions.some((migration) => migration.version === version),
    \`Missing tracked migration for recorded production version \${version}\`);
}

// Static object contracts keep critical schema dependencies from silently
// disappearing. These are not a substitute for applying the full chain to a
// disposable Postgres/Supabase database.
const readMigration = (name) => readFileSync(join(migrationsDir, name), "utf8");
const requiredObjects = new Map([
  ["20261008053220_orbitoos_initial_schema.sql", [
    "create table if not exists workspaces",
    "create table if not exists workspace_members",
    "create or replace function private.user_workspace_ids()",
    "alter table if exists learning_insights enable row level security",
  ]],
  ["20261008053534_orbitoos_foreign_key_indexes.sql", [
    "brands_workspace_id_idx", "ideas_brand_id_idx", "content_variants_content_item_id_idx",
  ]],
  ["20261008060308_content_strategy_artifact.sql", [
    "add column if not exists strategy jsonb",
  ]],
  ["20261008092905_orbitoos_foundation_expansion_v2.sql", [
    "create table if not exists public.activities",
    "create table if not exists public.api_logs",
    "create table if not exists public.profiles",
    "create table if not exists public.plans",
    "create table if not exists public.subscriptions",
    "create table if not exists public.social_accounts",
    "create table if not exists public.publishing_jobs",
    "create table if not exists private.social_account_secrets",
    "create policy subscriptions_member_read",
  ]],
  ["20261008092920_orbitoos_api_logs_actor_index.sql", [
    "api_logs_actor_user_id_idx",
  ]],
  ["20261009023848_orbitoos_publishing_job_orchestration.sql", [
    "create or replace function public.claim_due_publishing_jobs",
    "for update of j skip locked", "lease_expires_at", "max_attempts",
  ]],
  ["20261009024728_orbitoos_social_account_vault.sql", [
    "create or replace function public.store_social_account_secret",
    "create or replace function public.get_social_account_secret",
    "vault.create_secret", "service_role",
  ]],
  ["20261009025607_orbitoos_social_oauth_state.sql", [
    "create table if not exists private.social_oauth_states",
    "create or replace function public.create_social_oauth_state",
    "create or replace function public.consume_social_oauth_state",
  ]],
  ["20261009031316_orbitoos_social_oauth_fk_indexes.sql", [
    "social_oauth_states_user_idx", "social_oauth_states_workspace_idx",
    "social_oauth_states_brand_idx",
  ]],
  ["20261009032345_orbitoos_content_variant_media_url.sql", [
    "add column if not exists media_url",
  ]],
  ["20261009040018_orbitoos_social_account_reconnect.sql", [
    "create or replace function public.upsert_instagram_social_account",
  ]],
  ["20261009052046_orbitoos_publishing_job_reconciliation.sql", [
    "create table if not exists private.publishing_job_reconciliation_events",
    "create or replace function public.reconcile_unknown_publishing_job",
  ]],
  ["20261009052255_orbitoos_publishing_job_reconciliation_policies.sql", [
    "publishing_job_reconciliation_service_role_read",
    "publishing_job_reconciliation_service_role_insert",
  ]],
  ["20261009055320_orbitoos_publishing_operations_overview.sql", [
    "create or replace function public.get_publishing_operations_overview",
  ]],
  ["20261009062240_orbitoos_scheduled_job_materialization.sql", [
    "create or replace function public.materialize_scheduled_publishing_jobs",
  ]],
  ["20261009075030_orbitoos_publishing_scheduler.sql", [
    "orbitoos-publishing-scheduler", "claim_orbitoos_publishing_scheduler_lease",
  ]],
  ["20261009082359_orbitoos_instagram_token_refresh_scheduler.sql", [
    "orbitoos-instagram-token-refresh", "instagram-token-refresh-scheduler",
  ]],
  ["20261009085818_orbitoos_backend_owned_records.sql", [
    "revoke all on table public.social_accounts", "grant select on table public.subscriptions to authenticated",
  ]],
  ["20261009090948_orbitoos_workspace_role_approval_guard.sql", [
    "workspaces_member_update", "owner", "admin",
  ]],
  ["20261009091753_orbitoos_approved_content_role_guard.sql", [
    "approved", "owner", "admin",
  ]],
  ["20261009114305_orbitoos_workspace_settings_role_guard.sql", [
    "workspaces_member_update", "owner", "admin",
  ]],
  ["20261009232954_orbitoos_profiles_workspace_visibility.sql", [
    "profiles_workspace_member_read", "revoke all on table public.profiles from anon",
  ]],
]);
for (const [name, fragments] of requiredObjects) {
  const source = readMigration(name).toLowerCase();
  for (const fragment of fragments) {
    assert.ok(source.includes(fragment.toLowerCase()),
      \`Missing required migration object \${fragment} in \${name}\`);
  }
}

console.log(\`Migration history contract passed: \${versions.length} versioned files and critical object contracts checked. Full database replay is still a separate acceptance gate.\`);
