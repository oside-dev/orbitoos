import assert from "node:assert/strict";
import { readFileSync } from "node:fs";

const sql = readFileSync(new URL("../supabase/schema.sql", import.meta.url), "utf8");

const requiredTables = [
  "workspace_members",
  "brands",
  "ideas",
  "research_items",
  "content_items",
  "content_variants",
  "schedules",
  "analytics_snapshots",
  "agent_runs",
  "learning_insights",
];

for (const table of requiredTables) {
  const match = sql.match(
    new RegExp(
      "create table if not exists " +
        table +
        " \\(([\\s\\S]*?)\\n\\);",
      "m",
    ),
  );
  assert.ok(match, "Missing schema table: " + table);

  const brandColumns = match[1].match(/^[ ]*brand_id[ ]+/gm) ?? [];
  const brandExpected =
    table === "brands" || table === "workspace_members" ? 0 : 1;
  assert.equal(
    brandColumns.length,
    brandExpected,
    "Unexpected brand_id definition count for " + table,
  );
}

for (const table of requiredTables) {
  const rls = new RegExp(
    "alter table if exists " + table + " enable row level security;",
  );
  assert.ok(rls.test(sql), "Missing RLS for " + table);
}

console.log("OrbitOS schema contract tests passed.");

const securityContract = [
  "create schema if not exists private;",
  "create or replace function private.user_workspace_ids()",
  "security definer",
  "set search_path = ''",
  'grant execute on function private.user_workspace_ids() to authenticated;',
  'revoke execute on function private.user_workspace_ids() from anon;',
  'revoke all on table workspace_members from anon, authenticated;',
  'grant select on table workspace_members to authenticated;',
  'create policy "workspace_members_member_read"',
  'create policy "brands_member_read"',
  'create policy "ideas_member_read"',
  'create policy "content_items_member_read"',
  'create policy "learning_member_read"',
];

for (const fragment of securityContract) {
  assert.ok(sql.includes(fragment), "Missing security contract fragment: " + fragment);
}

assert.ok(
  sql.includes("workspace_id in (select private.user_workspace_ids())"),
  "Workspace membership predicate missing from RLS policies.",
);

console.log("OrbitOS schema security contract tests passed.");
