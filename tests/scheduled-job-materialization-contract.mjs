import assert from "node:assert/strict";
import { readFileSync } from "node:fs";

const sql = readFileSync(
  new URL("../docs/architecture/scheduled-job-materialization.sql", import.meta.url),
  "utf8",
);
const worker = readFileSync(
  new URL("../supabase/functions/publishing-worker/index.ts", import.meta.url),
  "utf8",
);

function mustContain(source, fragment, label) {
  assert.ok(source.includes(fragment), "Missing scheduled job materialization contract: " + label);
}

// SQL function remains backend-only and cannot publish or mutate schedule records.
mustContain(sql, "create or replace function public.materialize_scheduled_publishing_jobs(", "materializer RPC");
mustContain(sql, "security invoker", "RPC uses invoker security");
mustContain(sql, "set search_path = ''", "empty search path");
mustContain(sql, "if current_user <> 'service_role'", "service-role-only execution");
mustContain(sql, "p_limit < 1 or p_limit > 100", "bounded materialization batch");
mustContain(sql, "pg_catalog.cardinality(p_platforms) > 6", "bounded provider allowlist");
mustContain(sql, "revoke all on function public.materialize_scheduled_publishing_jobs(integer, text[])", "client execution revoked");
mustContain(sql, "grant execute on function public.materialize_scheduled_publishing_jobs(integer, text[])", "service role execution granted");
mustContain(sql, "s.status = 'scheduled'", "only still-scheduled records");
mustContain(sql, "ci.status = 'approved'", "content must be approved");
mustContain(sql, "select cv.id, cv.status, cv.approved", "latest variant carries approval state");
mustContain(sql, ") as variant on variant.status = 'approved' and variant.approved is true", "latest variant must still be approved");
assert.ok(!sql.includes("and cv.status = 'approved'"), "Do not filter out newer unapproved variants before choosing the latest version.");
mustContain(sql, "sa.status = 'connected'", "account must be connected");
mustContain(sql, "account.account_count = 1", "ambiguous multiple accounts are not silently fanned out");
mustContain(sql, "s.workspace_id", "workspace-scoped account and content joins");
mustContain(sql, "is not distinct from s.brand_id", "brand isolation");
mustContain(sql, "'instagram reels' then 'instagram'", "Instagram Reels platform normalization");
mustContain(sql, "'youtube shorts' then 'youtube'", "YouTube Shorts platform normalization");
mustContain(sql, "'schedule:' || s.id", "stable per-schedule idempotency key");
mustContain(sql, "on conflict do nothing", "duplicate materialization is safe");
mustContain(sql, "not exists (", "already materialized schedules are skipped before batch limit");
assert.ok(!/update\s+public\.schedules/i.test(sql), "Materialization must not mutate the calendar schedule state.");
assert.ok(!/http|net\.http|fetch\(/i.test(sql), "Materialization RPC must not invoke an external provider.");

// Worker flow: global and adapter readiness gates must execute before materialization;
// materialization must then occur before the atomic due-job claim.
const globalGate = worker.indexOf('if (Deno.env.get("ORBITOS_PUBLISHING_ENABLED") !== "true")');
const noAdapterGate = worker.indexOf('return json({ error: "NO_OFFICIAL_ADAPTER_CONFIGURED" }, 503);');
const materializeCall = worker.indexOf('"materialize_scheduled_publishing_jobs"');
const claimCall = worker.indexOf('"claim_due_publishing_jobs"');
assert.ok(globalGate >= 0 && noAdapterGate > globalGate, "Global gate must precede adapter readiness checks.");
assert.ok(materializeCall > noAdapterGate, "Schedules must not materialize before a ready official adapter exists.");
assert.ok(claimCall > materializeCall, "Durable jobs must be materialized before the due-job claim.");
mustContain(worker, "p_platforms: platforms", "materialization is restricted to enabled adapters");
mustContain(worker, 'return json({ error: "SCHEDULE_MATERIALIZATION_FAILED" }, 500);', "materialization errors fail closed");
mustContain(worker, "materialization,", "worker response reports materialization outcome");

console.log("OrbitOS scheduled job materialization contract tests passed.");
