import assert from "node:assert/strict";
import { readFileSync } from "node:fs";

const migration = readFileSync(
  new URL("../supabase/migrations/20261009232954_orbitoos_profiles_workspace_visibility.sql", import.meta.url),
  "utf8",
).toLowerCase();
const security = readFileSync(new URL("../docs/SECURITY.md", import.meta.url), "utf8").toLowerCase();
const workflow = readFileSync(new URL("../.github/workflows/validate.yml", import.meta.url), "utf8");

assert.ok(
  migration.includes("to_regclass('public.profiles') is not null"),
  "The migration must be a no-op on fresh projects where the optional legacy profiles table does not exist.",
);
assert.ok(
  migration.includes("drop policy if exists profiles_public_read on public.profiles") &&
    migration.includes("create policy profiles_workspace_member_read"),
  "The migration must replace global authenticated profile reads with a workspace-scoped policy.",
);
assert.ok(
  migration.includes("id = (select auth.uid())") &&
    migration.includes("wm.user_id = profiles.id") &&
    migration.includes("wm.workspace_id in") &&
    migration.includes("private.user_workspace_ids()"),
  "Users may read their own profile and profiles belonging to members in their workspace(s), but not an unrelated directory.",
);
assert.ok(
  migration.includes("revoke all on table public.profiles from anon"),
  "Anonymous role grants must be removed from the optional profile table.",
);
assert.ok(
  security.includes("profiles_workspace_member_read") &&
    security.includes("profiles_public_read") &&
    security.includes("workspace"),
  "Security documentation must explain the profile visibility boundary.",
);
assert.ok(
  workflow.includes("tests/profile-workspace-visibility-contract.mjs") &&
    workflow.includes("node tests/profile-workspace-visibility-contract.mjs"),
  "The profile visibility contract must run in CI.",
);

console.log("OrbitOS profile workspace visibility contract tests passed.");
