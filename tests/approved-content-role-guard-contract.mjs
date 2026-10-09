import assert from "node:assert/strict";
import { readFileSync } from "node:fs";

const read = (path) => readFileSync(new URL(path, import.meta.url), "utf8");
const migration = read("../supabase/migrations/20261009091753_orbitoos_approved_content_role_guard.sql").toLowerCase();
const schema = read("../supabase/schema.sql").toLowerCase();
const workflow = read("../.github/workflows/validate.yml");

for (const fragment of [
  "create or replace function private.guard_content_approval_role()",
  "security invoker",
  "set search_path = ''",
  "from public.workspace_members as wm",
  "if tg_op = 'delete' then",
  "to_jsonb(old) - 'updated_at'",
  "coalesce(v_role, '') not in ('owner', 'admin', 'editor')",
  "before insert or update or delete on public.content_items",
  "before insert or update or delete on public.content_variants",
  "return old;",
]) {
  assert.ok(migration.includes(fragment), "Missing approved-content guard: " + fragment);
}

assert.ok(
  (migration.match(/to_jsonb\(old\) - 'updated_at'/g) ?? []).length >= 2,
  "Both content item and content variant mutation checks must detect any protected row changes.",
);

for (const fragment of [
  "create or replace function private.guard_content_approval_role()",
  "before insert or update or delete on public.content_items",
  "before insert or update or delete on public.content_variants",
  "to_jsonb(old) - 'updated_at'",
]) {
  assert.ok(schema.includes(fragment), "Fresh-install schema missing guard: " + fragment);
}

assert.ok(
  workflow.includes("supabase/migrations/20261009091753_orbitoos_approved_content_role_guard.sql") &&
    workflow.includes("tests/approved-content-role-guard-contract.mjs") &&
    workflow.includes("node tests/approved-content-role-guard-contract.mjs"),
  "Approved-content guard test and migration must be enforced by CI.",
);

console.log("OrbitOS approved-content delete/scope guard contract tests passed.");
