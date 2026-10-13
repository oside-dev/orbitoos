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
  "Full predicate-level parity remains open",
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
  workflow.includes("node tests/first-workspace-acceptance-contract.mjs"),
  "The acceptance-runbook contract must run in CI.",
);

console.log("OrbitOS first-workspace acceptance contract tests passed.");
