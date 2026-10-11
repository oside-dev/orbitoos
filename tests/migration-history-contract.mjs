import assert from "node:assert/strict";
import { readdirSync } from "node:fs";
import { basename, join } from "node:path";
import { fileURLToPath } from "node:url";

const migrationsDir = fileURLToPath(new URL("../supabase/migrations/", import.meta.url));
const files = readdirSync(migrationsDir).filter((name) => name.endsWith(".sql")).sort();
const versions = files.map((name) => {
  const match = name.match(/^(\\d{14})_(.+)\\.sql$/);
  assert.ok(match, `Migration filename must begin with a 14-digit version: ${name}`);
  return { version: match[1], name: match[2], file: name };
});

assert.equal(new Set(versions.map(({ version }) => version)).size, versions.length,
  "Migration versions must be unique.");

// These are the tracked migrations whose application versions are recorded in
// the live Supabase project's migration history. This intentionally validates
// only the tracked subset; it does not claim that historical baseline SQL has
// been fully restored to supabase/migrations/.
const recordedProductionMigrations = new Map([
  ["20261008060308", "content_strategy_artifact"],
  ["20261009075030", "orbitoos_publishing_scheduler"],
  ["20261009082359", "orbitoos_instagram_token_refresh_scheduler"],
  ["20261009085818", "orbitoos_backend_owned_records"],
  ["20261009090948", "orbitoos_workspace_role_approval_guard"],
  ["20261009091753", "orbitoos_approved_content_role_guard"],
  ["20261009114305", "orbitoos_workspace_settings_role_guard"],
  ["20261009232954", "orbitoos_profiles_workspace_visibility"],
]);

for (const migration of versions) {
  assert.equal(
    recordedProductionMigrations.get(migration.version),
    migration.name,
    `Tracked migration does not match the recorded production version/name: ${migration.file}`,
  );
}

for (const version of recordedProductionMigrations.keys()) {
  assert.ok(versions.some((migration) => migration.version === version),
    `Missing tracked migration for recorded production version ${version}`);
}

console.log(`Migration version contract passed (${versions.length} tracked migrations checked against the production history subset).`);
