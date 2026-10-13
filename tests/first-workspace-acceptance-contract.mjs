import assert from "node:assert/strict";
import { readFileSync } from "node:fs";

const runbook = readFileSync(
  new URL("../docs/operations/first-workspace-acceptance.md", import.meta.url),
  "utf8",
);
const readme = readFileSync(new URL("../README.md", import.meta.url), "utf8");
const workflow = readFileSync(
  new URL("../.github/workflows/validate.yml", import.meta.url),
  "utf8",
);

for (const required of [
  "Latest read-only production preflight: 2026-10-13",
  "on_auth_user_created",
  "private.handle_new_user",
  "20261012030454_track_auth_profile_creation_trigger",
  "Confirm your email",
  "Backend persistent",
  "bootstrap-workspace",
  "demo can be restored there",
  "Check integration setup",
  "ORBITOS_PUBLISHING_ENABLED",
  "ORBITOS_INSTAGRAM_PUBLISHING_ADAPTER_ENABLED",
  "ORBITOS_INSTAGRAM_REFRESH_ENABLED",
  "https://supabase.com/docs/guides/auth/redirect-urls",
  "https://supabase.com/docs/guides/auth/auth-smtp",
  "https://developers.facebook.com/docs/instagram-platform/instagram-api-with-instagram-login",
  "24/24 application tables have RLS enabled",
  "all 84 application indexes are valid and ready",
  "all 95 CHECK, foreign-key, primary-key, and unique constraints are validated",
  "semantically equivalent in all seven cases",
  "23 pgTAP assertions against a disposable local Supabase/PostgreSQL database",
  "all 53 standalone source index definitions",
  "managed `supabase_admin` role still has a `public` default ACL",
  "Default-ACL compatibility therefore remains open for non-`postgres` object-creation roles.",
  "110/110 column defaults",
  "95/95 constraint definitions",
  "All 46 foreign keys match their ordered column sets",
  "Two CHECK expressions were manually confirmed semantically equivalent",
  "Default-ACL compatibility therefore remains open for non-postgres object-creation roles.",
  "Real signed-in idea creation → variant edit → reload persistence remains pending",
  "BLOCKED",
]) {
  assert.ok(runbook.includes(required), `Acceptance runbook is missing: ${required}`);
}

assert.ok(
  readme.includes("docs/operations/first-workspace-acceptance.md"),
  "README must link to the first-workspace acceptance runbook.",
);
assert.equal(
  (workflow.match(/node tests\/application-browser-bridge-auth\.mjs/g) ?? []).length,
  1,
  "The application browser bridge auth test must run once, not twice.",
);
assert.ok(
  workflow.includes("test -f supabase/tests/rls_workspace_isolation_test.sql"),
  "The PostgreSQL RLS integration fixture must be present in the migration job.",
);
assert.ok(
  workflow.includes("run: supabase test db"),
  "The migration job must execute the pgTAP database integration suite.",
);
const databaseRlsTest = readFileSync(
  new URL("../supabase/tests/rls_workspace_isolation_test.sql", import.meta.url),
  "utf8",
);
assert.ok(
  databaseRlsTest.includes("SELECT plan(23);"),
  "The database RLS/catalog suite must keep its 23 planned assertions.",
);
assert.ok(
  workflow.includes("node tests/first-workspace-acceptance-contract.mjs"),
  "The acceptance-runbook contract must run in CI.",
);

console.log("OrbitOS first-workspace acceptance contract tests passed.");
