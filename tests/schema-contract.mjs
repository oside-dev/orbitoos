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
