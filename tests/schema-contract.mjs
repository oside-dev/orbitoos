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

const publishingJobSql = readFileSync(
  new URL("../docs/architecture/publishing-job-orchestration.sql", import.meta.url),
  "utf8",
).toLowerCase();

const publishingJobContract = [
  "add column if not exists max_attempts",
  "add column if not exists next_attempt_at",
  "add column if not exists lease_expires_at",
  "add column if not exists lease_token uuid",
  "create or replace function public.claim_due_publishing_jobs",
  "p_platforms text[]",
  "for update of j skip locked",
  "sa.status = 'connected'",
  "ci.status = 'approved'",
  "cv.approved is true",
  "create or replace function public.complete_publishing_job",
  "create or replace function public.retry_publishing_job",
  "security invoker",
  "revoke all on function public.claim_due_publishing_jobs(integer, integer, text[])",
  "grant execute on function public.claim_due_publishing_jobs(integer, integer, text[])",
  "grant execute on function public.complete_publishing_job(text, uuid, text)",
  "grant execute on function public.retry_publishing_job(text, uuid, text, text, integer)",
];

for (const fragment of publishingJobContract) {
  assert.ok(
    publishingJobSql.includes(fragment),
    "Missing publishing job orchestration fragment: " + fragment,
  );
}

console.log("OrbitOS publishing job orchestration contract tests passed.");

const publishingWorker = readFileSync(
  new URL("../supabase/functions/publishing-worker/index.ts", import.meta.url),
  "utf8",
);

const publishingWorkerContract = [
  'withSupabase({ auth: "secret" }',
  'Deno.env.get("ORBITOS_PUBLISHING_ENABLED") !== "true"',
  "return Object.freeze({});",
  'return json({ error: "NO_OFFICIAL_ADAPTER_CONFIGURED" }, 503);',
  "adapter.enabled === true",
  "adapter.official === true",
  "adapter.credentialsReady === true",
  "adapter.supportsIdempotency === true",
  "adapter.rateLimitReady === true",
  '"claim_due_publishing_jobs"',
  "p_platforms: platforms",
  '"PROVIDER_REQUEST_FAILED"',
  "The official publishing adapter reported a failure.",
  ".eq(\"lease_token\", job.lease_token)",
];

for (const fragment of publishingWorkerContract) {
  assert.ok(
    publishingWorker.includes(fragment),
    "Missing publishing worker safety fragment: " + fragment,
  );
}

const supabaseConfig = readFileSync(
  new URL("../supabase/config.toml", import.meta.url),
  "utf8",
);

assert.ok(
  supabaseConfig.includes("[functions.publishing-worker]") &&
    supabaseConfig.includes("verify_jwt = false"),
  "Publishing worker's custom secret authentication configuration is missing.",
);

console.log("OrbitOS publishing worker safety contract tests passed.");

const socialVaultSql = readFileSync(
  new URL("../docs/architecture/social-account-vault.sql", import.meta.url),
  "utf8",
).toLowerCase();

const socialVaultContract = [
  "create or replace function public.store_social_account_secret(",
  "create or replace function public.get_social_account_secret(",
  "create or replace function public.delete_social_account_secrets(",
  "create or replace function private.delete_social_account_vault_secrets()",
  "vault.create_secret",
  "vault.update_secret",
  "vault.decrypted_secrets",
  "delete from vault.secrets",
  "auth.role()",
  "set search_path = ''",
  "revoke all on function public.store_social_account_secret(text, text, text)",
  "revoke all on function public.get_social_account_secret(text, text)",
  "revoke all on function public.delete_social_account_secrets(text)",
  "grant execute on function public.store_social_account_secret(text, text, text)",
  "grant execute on function public.get_social_account_secret(text, text)",
  "grant execute on function public.delete_social_account_secrets(text)",
  "grant execute on function private.delete_social_account_vault_secrets()",
];

for (const fragment of socialVaultContract) {
  assert.ok(
    socialVaultSql.includes(fragment),
    "Missing Vault-backed social credential contract fragment: " + fragment,
  );
}

console.log("OrbitOS Vault-backed social credential contract tests passed.");


const oauthStateSql = readFileSync(
  new URL("../docs/architecture/social-oauth-state.sql", import.meta.url),
  "utf8",
).toLowerCase();

const oauthStateContract = [
  "create table if not exists private.social_oauth_states",
  "state_hash text primary key",
  "create index if not exists social_oauth_states_expiry_idx",
  "create index if not exists social_oauth_states_user_idx",
  "create index if not exists social_oauth_states_workspace_idx",
  "create index if not exists social_oauth_states_brand_idx",
  "references auth.users(id) on delete cascade",
  "alter table private.social_oauth_states enable row level security",
  "create or replace function public.create_social_oauth_state(",
  "create or replace function public.consume_social_oauth_state(",
  "consumed_at is null",
  "expires_at > pg_catalog.now()",
  "wm.user_id = s.user_id",
  "b.workspace_id = s.workspace_id",
  "revoke all on function public.create_social_oauth_state(text, uuid, text, text, timestamptz)",
  "revoke all on function public.consume_social_oauth_state(text)",
  "grant execute on function public.create_social_oauth_state(text, uuid, text, text, timestamptz)",
  "grant execute on function public.consume_social_oauth_state(text)",
];

for (const fragment of oauthStateContract) {
  assert.ok(
    oauthStateSql.includes(fragment),
    "Missing single-use social OAuth state fragment: " + fragment,
  );
}

const oauthStart = readFileSync(
  new URL("../supabase/functions/instagram-oauth-start/index.ts", import.meta.url),
  "utf8",
);
const oauthCallback = readFileSync(
  new URL("../supabase/functions/instagram-oauth-callback/index.ts", import.meta.url),
  "utf8",
);

const instagramOAuthContract = [
  [oauthStart, 'withSupabase({ auth: "user" }'],
  [oauthStart, '"instagram_business_basic"'],
  [oauthStart, '"instagram_business_content_publish"'],
  [oauthStart, '"create_social_oauth_state"'],
  [oauthStart, '["owner", "admin"]'],
  [oauthStart, 'return json(req, { error: "OAUTH_NOT_CONFIGURED" }, 503);'],
  [oauthCallback, 'withSupabase({ auth: "none" }'],
  [oauthCallback, '"consume_social_oauth_state"'],
  [oauthCallback, '"https://api.instagram.com/oauth/access_token"'],
  [oauthCallback, '"https://graph.instagram.com/access_token"'],
  [oauthCallback, '"https://graph.instagram.com/me"'],
  [oauthCallback, '"store_social_account_secret"'],
  [oauthCallback, '.select("id, status, metadata, connected_at")'],
  [oauthCallback, 'id: existingAccount?.id ?? "social-instagram-" + crypto.randomUUID()'],
  [oauthCallback, 'status: existingAccount.status'],
  [oauthCallback, 'metadata: existingAccount.metadata ?? {}'],
  [oauthCallback, 'if (!existingAccount) {'],
  [oauthCallback, '"delete_social_account_secrets"'],
  [oauthCallback, 'return appResult("token_storage_failed");'],
  [oauthCallback, 'return appResult("connected");'],
];

for (const [source, fragment] of instagramOAuthContract) {
  assert.ok(
    source.includes(fragment),
    "Missing Instagram OAuth safety fragment: " + fragment,
  );
}

assert.ok(
  supabaseConfig.includes("[functions.instagram-oauth-callback]") &&
    supabaseConfig.includes("verify_jwt = false") &&
    supabaseConfig.includes("[functions.instagram-oauth-start]") &&
    supabaseConfig.includes("verify_jwt = true"),
  "Instagram OAuth Edge Function auth configuration is incomplete.",
);

console.log("OrbitOS Instagram OAuth contract tests passed.");

const oauthBrowserBridge = readFileSync(
  new URL("../src/runtime/application-browser-bridge.mjs", import.meta.url),
  "utf8",
);
const oauthSettingsUi = readFileSync(
  new URL("../index.html", import.meta.url),
  "utf8",
);

const instagramConnectUiContract = [
  [oauthBrowserBridge, 'client.functions.invoke("instagram-oauth-start"'],
  [oauthBrowserBridge, 'authorizationUrl.origin !== "https://www.instagram.com"'],
  [oauthBrowserBridge, 'authorizationUrl.pathname !== "/oauth/authorize"'],
  [oauthBrowserBridge, "startInstagramOAuth"],
  [oauthSettingsUi, 'btn(connectedInstagram.length?"Reconnect Instagram":"Connect Instagram","connectInstagram()",true)'],
  [oauthSettingsUi, "async function connectInstagram()"],
  [oauthSettingsUi, "window.location.assign(result.authorizationUrl)"],
  [oauthSettingsUi, "function consumeInstagramOAuthResult()"],
  [oauthSettingsUi, "consumeInstagramOAuthResult()"],
  [oauthSettingsUi, 'connected:"Instagram account connected securely."'],
  [oauthBrowserBridge, "Instagram connection is not configured yet."],
  [oauthSettingsUi, "Connecting an account does not enable automatic publishing."],
];

for (const [source, fragment] of instagramConnectUiContract) {
  assert.ok(
    source.includes(fragment),
    "Missing Instagram connect UI safety fragment: " + fragment,
  );
}

const oauthBootIndex = oauthSettingsUi.indexOf("async function boot()");
const oauthResultCallIndex = oauthSettingsUi.indexOf(
  "consumeInstagramOAuthResult();",
  oauthBootIndex,
);
const oauthBootCatchIndex = oauthSettingsUi.indexOf(
  " }catch(error){",
  oauthResultCallIndex,
);
assert.ok(
  oauthBootIndex >= 0 &&
    oauthResultCallIndex > oauthBootIndex &&
    oauthBootCatchIndex > oauthResultCallIndex,
  "OAuth callback result should be consumed during the initial boot render.",
);

console.log("OrbitOS Instagram connect UI contract tests passed.");

const tokenRefresh = readFileSync(
  new URL("../supabase/functions/instagram-token-refresh/index.ts", import.meta.url),
  "utf8",
);
const tokenRefreshContract = [
  ['withSupabase({ auth: "secret" }', "Server-only authentication is required."],
  ['Deno.env.get("ORBITOS_INSTAGRAM_REFRESH_ENABLED") !== "true"', "Token refresh must default to disabled."],
  ['"https://graph.instagram.com/refresh_access_token"', "Refresh must use Meta's official Instagram Login endpoint."],
  ['"ig_refresh_token"', "Refresh must use the Instagram Login grant."],
  ['"get_social_account_secret"', "Refresh must read the current token through the private Vault RPC."],
  ['"store_social_account_secret"', "Refresh must persist the new token through Vault."],
  ['"tokenExpiresAt"', "Refresh must maintain the expiry metadata."],
  ['status: "reauth_required"', "Expired/invalid credentials must require a fresh connection."],
  ["AbortSignal.timeout(8000)", "Provider requests must be time bounded."],
  ['"TOKEN_REFRESH_DISABLED"', "Disabled refresh must fail closed."],
  ['url.searchParams.set("access_token", currentToken)', "Token must only be passed to the official provider endpoint."],
];
for (const [fragment, message] of tokenRefreshContract) {
  assert.ok(tokenRefresh.includes(fragment), message);
}

assert.ok(
  supabaseConfig.includes("[functions.instagram-token-refresh]") &&
    supabaseConfig.includes("verify_jwt = false"),
  "Instagram token refresh must declare custom secret-key auth configuration.",
);

console.log("OrbitOS Instagram token refresh contract tests passed.");
