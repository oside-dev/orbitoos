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

const instagramOAuthSql = readFileSync(
  new URL("../docs/architecture/instagram-oauth-foundation.sql", import.meta.url),
  "utf8",
).toLowerCase();
const instagramStart = readFileSync(
  new URL("../supabase/functions/instagram-oauth-start/index.ts", import.meta.url),
  "utf8",
);
const instagramCallback = readFileSync(
  new URL("../supabase/functions/instagram-oauth-callback/index.ts", import.meta.url),
  "utf8",
);
const supabaseConfig = readFileSync(
  new URL("../supabase/config.toml", import.meta.url),
  "utf8",
);

const instagramOAuthSqlContract = [
  "create table if not exists private.social_oauth_states",
  "state_hash text not null unique",
  "alter table private.social_oauth_states enable row level security",
  "create or replace function public.create_social_oauth_state",
  "create or replace function public.consume_social_oauth_state",
  "create or replace function public.persist_instagram_connection",
  "security definer",
  "set search_path = ''",
  "vault.create_secret",
  "vault.update_secret",
  "instagram_business_basic",
  "instagram_business_content_publish",
  "revoke all on function public.create_social_oauth_state",
  "revoke all on function public.consume_social_oauth_state",
  "revoke all on function public.persist_instagram_connection",
  "grant execute on function public.create_social_oauth_state",
  "grant execute on function public.consume_social_oauth_state",
  "grant execute on function public.persist_instagram_connection",
];

for (const fragment of instagramOAuthSqlContract) {
  assert.ok(
    instagramOAuthSql.includes(fragment),
    "Missing Instagram OAuth SQL security-contract fragment: " + fragment,
  );
}

for (const fragment of [
  'withSupabase({ auth: "user" }',
  "crypto.getRandomValues",
  "create_social_oauth_state",
  "instagram_business_basic",
  "instagram_business_content_publish",
  "INSTAGRAM_APP_SECRET",
]) {
  assert.ok(
    instagramStart.includes(fragment),
    "Missing Instagram OAuth start guard: " + fragment,
  );
}

for (const fragment of [
  'withSupabase({ auth: "none" }',
  "consume_social_oauth_state",
  "persist_instagram_connection",
  "required_permissions_missing",
  "Referrer-Policy",
  "Cache-Control",
]) {
  assert.ok(
    instagramCallback.includes(fragment),
    "Missing Instagram OAuth callback guard: " + fragment,
  );
}

assert.ok(
  supabaseConfig.includes("[functions.instagram-oauth-start]\nverify_jwt = true"),
  "Instagram OAuth start must require a verified JWT.",
);
assert.ok(
  supabaseConfig.includes("[functions.instagram-oauth-callback]\nverify_jwt = false"),
  "Instagram OAuth callback must be reachable by Meta and validate the one-time state itself.",
);
assert.ok(
  !instagramCallback.includes('destination.searchParams.set("access_token"'),
  "An Instagram token must never be returned through the browser redirect.",
);

console.log("OrbitOS Instagram OAuth security contract tests passed.");
