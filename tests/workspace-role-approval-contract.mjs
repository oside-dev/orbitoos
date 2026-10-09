import assert from "node:assert/strict";
import { readFileSync } from "node:fs";

const read = (path) => readFileSync(new URL(path, import.meta.url), "utf8");
const migration = read("../supabase/migrations/20261009090948_orbitoos_workspace_role_approval_guard.sql").toLowerCase();
const schema = read("../supabase/schema.sql").toLowerCase();
const workflow = read("../.github/workflows/validate.yml");

for (const fragment of [
  "create or replace function private.guard_content_approval_role()",
  "security invoker",
  "set search_path = ''",
  "from public.workspace_members as wm",
  "new.status",
  "new.approved",
  "old.body is distinct from new.body",
  "coalesce(v_role, '') not in ('owner', 'admin', 'editor')",
  "create trigger content_items_approval_role_guard",
  "create trigger content_variants_approval_role_guard",
]) {
  assert.ok(migration.includes(fragment), "Missing approval security boundary: " + fragment);
}

for (const policy of [
  "create policy schedules_member_insert",
  "create policy schedules_member_update",
  "create policy schedules_member_delete",
]) {
  const start = migration.indexOf(policy);
  assert.ok(start >= 0, "Missing role-scoped schedule policy: " + policy);
  const nextPolicy = migration.indexOf("create policy schedules_member_", start + policy.length);
  const block = migration.slice(start, nextPolicy < 0 ? migration.length : nextPolicy);
  assert.ok(
    block.includes("wm.role in ('owner', 'admin', 'editor')"),
    "Schedule mutations must be limited to owner/admin/editor: " + policy,
  );
}

assert.ok(
  migration.includes("drop policy if exists schedules_member_insert") &&
    migration.includes("drop policy if exists schedules_member_update") &&
    migration.includes("drop policy if exists schedules_member_delete"),
  "Broad member-only schedule policies must be replaced.",
);

for (const fragment of [
  "create or replace function private.guard_content_approval_role()",
  "create trigger content_items_approval_role_guard",
  "create trigger content_variants_approval_role_guard",
  "wm.role in ('owner', 'admin', 'editor')",
]) {
  assert.ok(schema.includes(fragment), "Fresh-install schema missing role guard: " + fragment);
}

assert.ok(
  workflow.includes("tests/workspace-role-approval-contract.mjs") &&
    workflow.includes("node tests/workspace-role-approval-contract.mjs"),
  "Role enforcement contract test must be part of CI.",
);

console.log("OrbitOS workspace role and approval security contract tests passed.");
