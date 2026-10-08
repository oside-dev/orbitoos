import assert from "node:assert/strict";
import { readFileSync } from "node:fs";

const sql = readFileSync(new URL("../supabase/schema.sql", import.meta.url), "utf8");

const requiredTables = [
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
  assert.equal(
    brandColumns.length,
    table === "brands" ? 0 : 1,
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
