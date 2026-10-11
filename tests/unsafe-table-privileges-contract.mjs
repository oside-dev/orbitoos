import assert from "node:assert/strict";
import { readFileSync } from "node:fs";

const read = (path) => readFileSync(new URL(path, import.meta.url), "utf8");
const migration = read("../supabase/migrations/20261011102000_orbitoos_restrict_unsafe_table_privileges.sql");
const normalizedMigration = migration.toLowerCase().replace(/\s+/g, " ").trim();
const workflow = read("../.github/workflows/validate.yml");
const runbook = read("../docs/operations/migration-history-reconciliation.md");

assert.ok(
  normalizedMigration.includes(
    "alter default privileges for role postgres in schema public revoke all privileges on tables from anon, authenticated;",
  ),
  "New application tables created by the migration role must not inherit broad browser table grants.",
);
assert.ok(
  normalizedMigration.includes(
    "alter default privileges for role postgres in schema public revoke all privileges on sequences from anon, authenticated;",
  ),
  "New application sequences created by the migration role must not inherit broad browser sequence grants.",
);
assert.ok(
  normalizedMigration.includes(
    "revoke all privileges on table public.activities, public.api_logs, public.notifications, public.plans, public.profiles from public, anon, authenticated;",
  ),
  "The migration must remove inherited/broad table privileges from public browser roles on all affected tables.",
);

for (const statement of [
  "grant select, insert, update, delete on table public.activities to authenticated;",
  "grant select, insert, delete on table public.api_logs to authenticated;",
  "grant select, insert, update, delete on table public.notifications to authenticated;",
  "grant select on table public.plans to anon, authenticated;",
  "grant select, insert, update, delete on table public.profiles to authenticated;",
]) {
  assert.ok(
    normalizedMigration.includes(statement),
    "Missing least-privilege replacement grant: " + statement,
  );
}

const grants = [...migration.matchAll(/\bgrant\s+([^;]+);/gi)].map((match) => match[1]);
for (const grant of grants) {
  assert.ok(
    !/\b(all|truncate|references|trigger)\b/i.test(grant),
    "The migration must not restore broad or table-wide privileges: " + grant,
  );
}

assert.ok(
  workflow.includes("supabase/migrations/20261011102000_orbitoos_restrict_unsafe_table_privileges.sql") &&
    workflow.includes("tests/unsafe-table-privileges-contract.mjs") &&
    workflow.includes("node tests/unsafe-table-privileges-contract.mjs"),
  "The migration and its security contract must be wired into CI.",
);
assert.ok(
  runbook.includes("20261011102000_orbitoos_restrict_unsafe_table_privileges") &&
    runbook.includes("TRUNCATE") &&
    runbook.includes("source-only"),
  "The runbook must distinguish this pending migration from the 22 production-applied migrations and explain the table-level privilege risk.",
);

console.log("OrbitOS unsafe table privilege contract tests passed.");
