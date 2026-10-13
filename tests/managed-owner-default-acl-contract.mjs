import assert from "node:assert/strict";
import { readFileSync, readdirSync } from "node:fs";
import { join } from "node:path";
import { fileURLToPath } from "node:url";

const migrationsDir = fileURLToPath(new URL("../supabase/migrations/", import.meta.url));
const migrationFiles = readdirSync(migrationsDir)
  .filter((name) => name.endsWith(".sql"))
  .sort();

assert.ok(migrationFiles.length > 0, "The application migration chain must exist.");

// The connected production catalog audit found that all current public/private
// application tables and functions are postgres-owned. supabase_admin has
// platform-managed default ACLs, including in public; do not silently change
// those ACLs as part of application migrations. If ownership requirements ever
// change, a separate compatibility review must explicitly account for it.
const forbiddenManagedRoleChanges = [
  {
    label: "SET ROLE supabase_admin",
    pattern: /\bSET\s+ROLE\s+["']?supabase_admin\b/i,
  },
  {
    label: "ALTER DEFAULT PRIVILEGES for supabase_admin",
    pattern: /\bALTER\s+DEFAULT\s+PRIVILEGES\b[\s\S]{0,400}\b(?:FOR\s+ROLE|FOR\s+USER)\s+["']?supabase_admin\b/i,
  },
];

for (const file of migrationFiles) {
  const sql = readFileSync(join(migrationsDir, file), "utf8");
  for (const rule of forbiddenManagedRoleChanges) {
    assert.equal(
      rule.pattern.test(sql),
      false,
      `Application migration ${file} must not change managed role behavior without an explicit reviewed exception: ${rule.label}`,
    );
  }
}

const runbook = readFileSync(
  new URL("../docs/operations/migration-history-reconciliation.md", import.meta.url),
  "utf8",
);
assert.ok(
  runbook.includes("no current application table, sequence, view, or function is owned by `supabase_admin`"),
  "The reconciliation runbook must preserve the audited current application-object ownership finding.",
);
assert.ok(
  runbook.includes("Application DDL must continue through the `postgres` migration path"),
  "Application schema DDL must remain on the tracked postgres-owned migration path.",
);

console.log("Managed owner default ACL contract passed: app migrations preserve platform-managed supabase_admin defaults.");
