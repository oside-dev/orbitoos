import assert from "node:assert/strict";
import { readFileSync } from "node:fs";

const read = (path) => readFileSync(new URL(path, import.meta.url), "utf8");
const migrationPath = "../supabase/migrations/20261012030454_track_auth_profile_creation_trigger.sql";
const migration = read(migrationPath).toLowerCase();
const privilegeMigrationPath = "../supabase/migrations/20261013050901_restrict_auth_profile_trigger_execution.sql";
const privilegeMigration = read(privilegeMigrationPath).toLowerCase();
const runbook = read("../docs/operations/migration-history-reconciliation.md");
const workspaceRunbook = read("../docs/operations/first-workspace-acceptance.md");
const workflow = read("../.github/workflows/validate.yml");

for (const fragment of [
  "create or replace function private.handle_new_user()",
  "returns trigger",
  "security definer",
  "set search_path = ''",
  "insert into public.profiles (id, full_name, avatar_url, username, website)",
  "on conflict (id) do nothing",
  "t.tgrelid = 'auth.users'::regclass",
  "t.tgname = 'on_auth_user_created'",
  "t.tgfoid = 'private.handle_new_user()'::regprocedure",
  "create trigger on_auth_user_created after insert on auth.users for each row execute function private.handle_new_user()",
]) {
  assert.ok(migration.includes(fragment), "Missing auth profile trigger migration contract: " + fragment);
}

assert.ok(
  migration.includes("raise exception 'auth.users already has on_auth_user_created with a different function'"),
  "The migration must fail closed rather than silently accept a conflicting trigger of the same name.",
);

assert.ok(
  runbook.includes("20261012030454_track_auth_profile_creation_trigger") &&
    runbook.includes("private.handle_new_user") &&
    runbook.includes("on_auth_user_created") &&
    runbook.includes("26 applied migrations"),
  "Migration reconciliation runbook must document the observed and tracked trigger.",
);
assert.ok(
  workspaceRunbook.includes("on_auth_user_created") &&
    workspaceRunbook.includes("private.handle_new_user"),
  "Workspace acceptance runbook must document the signup profile side effect.",
);
assert.ok(
  workflow.includes("supabase/migrations/20261012030454_track_auth_profile_creation_trigger.sql") &&
    workflow.includes("tests/auth-profile-trigger-contract.mjs") &&
    workflow.includes("node tests/auth-profile-trigger-contract.mjs"),
  "The auth profile trigger migration and contract must run in CI.",
);


for (const fragment of [
  "revoke execute on function private.handle_new_user() from public, anon, authenticated, service_role",
  "has_function_privilege('anon', 'private.handle_new_user()', 'execute')",
  "has_function_privilege('authenticated', 'private.handle_new_user()', 'execute')",
  "has_function_privilege('service_role', 'private.handle_new_user()', 'execute')",
  "auth.users.on_auth_user_created trigger must remain attached to private.handle_new_user()",
]) {
  assert.ok(
    privilegeMigration.includes(fragment),
    "Missing auth profile trigger privilege hardening contract: " + fragment,
  );
}

assert.ok(
  runbook.includes("20261013050901_restrict_auth_profile_trigger_execution"),
  "Migration reconciliation runbook must document the privilege-hardening migration.",
);

console.log("OrbitOS auth profile trigger contract tests passed.");
