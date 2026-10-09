import assert from "node:assert/strict";
import { readFileSync } from "node:fs";

const read = (path) => readFileSync(new URL(path, import.meta.url), "utf8");
const endpoint = read("../supabase/functions/instagram-integration-readiness/index.ts");
const bridge = read("../src/runtime/application-browser-bridge.mjs");
const ui = read("../index.html");
const config = read("../supabase/config.toml");
const runbook = read("../docs/operations/instagram-reels-publishing-runbook.md");
const workflow = read("../.github/workflows/validate.yml");

for (const [source, fragment, label] of [
  [endpoint, 'withSupabase({ auth: "user" }', "user JWT authentication"],
  [endpoint, 'if (req.method !== "POST")', "POST-only endpoint"],
  [endpoint, "ctx.userClaims?.id ?? ctx.jwtClaims?.sub", "verified operator identity"],
  [endpoint, '["owner", "admin"].includes(String(membership.role))', "owner/admin authorization"],
  [endpoint, "META_INSTAGRAM_APP_ID", "Meta app ID presence check"],
  [endpoint, "META_INSTAGRAM_APP_SECRET", "Meta app secret presence check"],
  [endpoint, "META_INSTAGRAM_REDIRECT_URI", "redirect configuration status"],
  [endpoint, "ORBITOS_PUBLISHING_ENABLED", "global publishing gate status"],
  [endpoint, "ORBITOS_INSTAGRAM_PUBLISHING_ADAPTER_ENABLED", "Instagram adapter gate status"],
  [endpoint, "ORBITOS_INSTAGRAM_REFRESH_ENABLED", "token refresh gate status"],
  [endpoint, "Cache-Control", "no-store response"],
  [bridge, 'client.functions.invoke("instagram-integration-readiness"', "bridge invocation"],
  [bridge, "getInstagramIntegrationReadiness,", "bridge export"],
  [ui, "function renderInstagramReadinessPanel(workspaceId)", "readiness panel"],
  [ui, "Check integration setup", "readiness check control"],
  [ui, "appSecretConfigured", "boolean-only secret display"],
  [ui, "Publishing remains disabled until the operator deliberately enables it.", "safe activation posture"],
  [config, "[functions.instagram-integration-readiness]\nverify_jwt = true", "JWT verification config"],
  [runbook, "META_INSTAGRAM_APP_ID", "documented Meta app ID secret"],
  [runbook, "META_INSTAGRAM_APP_SECRET", "documented Meta app secret"],
  [runbook, "instagram-integration-readiness", "readiness endpoint runbook"],
  [workflow, "supabase/functions/instagram-integration-readiness/index.ts", "CI endpoint file check"],
  [workflow, "tests/instagram-integration-readiness-contract.mjs", "CI contract test"],
  [workflow, "node tests/instagram-integration-readiness-contract.mjs", "CI contract execution"],
]) assert.ok(source.includes(fragment), "Missing integration readiness contract (" + label + "): " + fragment);
for (const forbidden of ["return { appId:", "return { appSecret:", "accessToken:", "Deno.env.toObject"]) {
  assert.ok(!endpoint.includes(forbidden), "Readiness endpoint must never disclose credential values.");
}
console.log("OrbitOS Instagram integration readiness contract tests passed.");
