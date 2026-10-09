import assert from "node:assert/strict";
import { readFileSync } from "node:fs";

const migration = readFileSync(
  new URL("../supabase/migrations/20261009114305_orbitoos_workspace_settings_role_guard.sql", import.meta.url),
  "utf8",
).toLowerCase();
const schema = readFileSync(new URL("../supabase/schema.sql", import.meta.url), "utf8").toLowerCase();
const ui = readFileSync(new URL("../index.html", import.meta.url), "utf8");
const workflow = readFileSync(new URL("../.github/workflows/validate.yml", import.meta.url), "utf8");

assert.ok(
  migration.includes("drop policy if exists workspaces_member_update on public.workspaces"),
  "Migration must replace the existing permissive workspace update policy.",
);
const migrationPolicy = migration.slice(migration.indexOf("create policy workspaces_member_update"));
assert.ok(migrationPolicy.startsWith("create policy workspaces_member_update"));
assert.ok(migrationPolicy.includes("for update"));
assert.ok(migrationPolicy.includes("to authenticated"));
assert.equal(
  (migrationPolicy.match(/wm\.role in \('owner', 'admin'\)/g) ?? []).length,
  2,
  "Both USING and WITH CHECK must require owner/admin membership.",
);
assert.equal(
  (migrationPolicy.match(/wm\.user_id = \(select auth\.uid\(\)\)/g) ?? []).length,
  2,
  "Both policy predicates must bind the role to the current authenticated user.",
);
assert.equal(
  (migrationPolicy.match(/id in \(select private\.user_workspace_ids\(\)\)/g) ?? []).length,
  2,
  "Both policy predicates must keep workspace membership scoping.",
);

const schemaStart = schema.indexOf('create policy "workspaces_member_update"');
const schemaEnd = schema.indexOf('create policy "brands_member_read"', schemaStart);
assert.ok(schemaStart >= 0 && schemaEnd > schemaStart, "Canonical schema must define workspace update policy.");
const schemaPolicy = schema.slice(schemaStart, schemaEnd);
assert.equal(
  (schemaPolicy.match(/wm\.role in \('owner', 'admin'\)/g) ?? []).length,
  2,
  "Canonical schema must match the owner/admin migration.",
);

assert.ok(
  ui.includes("function canManageWorkspaceSettings()") &&
    ui.includes("Only workspace owners or admins can change workspace AI settings."),
  "UI must fail closed for non-admin workspace settings changes.",
);
assert.ok(
  workflow.includes("tests/workspace-settings-role-guard-contract.mjs") &&
    workflow.includes("node tests/workspace-settings-role-guard-contract.mjs"),
  "Workspace settings role contract must run in CI.",
);

console.log("OrbitOS workspace settings role guard contract tests passed.");
