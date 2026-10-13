import assert from "node:assert/strict";
import { readFileSync } from "node:fs";

const read = (path) => readFileSync(new URL(path, import.meta.url), "utf8");
const migrationPath = "../supabase/migrations/20261013060348_public_function_default_execute_privileges.sql";
const migration = read(migrationPath).toLowerCase().replace(/\s+/g, " ").trim();
const workflow = read("../.github/workflows/validate.yml");
const runbook = read("../docs/operations/migration-history-reconciliation.md");

assert.ok(
  migration.includes("alter default privileges for role postgres revoke execute on functions from public;"),
  "New postgres-owned functions must not inherit PostgreSQL's default PUBLIC EXECUTE privilege.",
);
assert.ok(
  migration.includes("alter default privileges for role postgres in schema public revoke execute on functions from anon, authenticated;"),
  "New postgres-owned public-schema functions must not inherit direct EXECUTE grants for browser roles.",
);
assert.ok(
  workflow.includes("supabase/migrations/20261013060348_public_function_default_execute_privileges.sql") &&
    workflow.includes("tests/public-function-default-privileges-contract.mjs") &&
    workflow.includes("node tests/public-function-default-privileges-contract.mjs"),
  "The migration and default-function privilege contract must be wired into CI.",
);
assert.ok(
  runbook.includes("supabase/migrations/20261013060348_public_function_default_execute_privileges.sql") &&
    runbook.includes("pending source migration") &&
    runbook.includes("global default `PUBLIC EXECUTE` grant"),
  "The migration-history runbook must explain that the default-privilege migration is pending and not yet production-applied.",
);

console.log("OrbitOS public function default privilege contract tests passed.");
