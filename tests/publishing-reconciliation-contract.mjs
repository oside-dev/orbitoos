import assert from "node:assert/strict";
import { readFileSync } from "node:fs";

const sql = readFileSync(
  new URL("../docs/architecture/publishing-job-reconciliation.sql", import.meta.url),
  "utf8",
);
const endpoint = readFileSync(
  new URL("../supabase/functions/publishing-reconciliation/index.ts", import.meta.url),
  "utf8",
);
const config = readFileSync(new URL("../supabase/config.toml", import.meta.url), "utf8");

function mustContain(source, fragment, label) {
  assert.ok(source.includes(fragment), "Missing reconciliation contract: " + label);
}

// Database contract: immutable audit rows, limited resolutions, role boundary, and atomic updates.
mustContain(sql, "create table if not exists private.publishing_job_reconciliation_events", "private audit table");
mustContain(sql, "alter table private.publishing_job_reconciliation_events enable row level security", "audit table RLS");
mustContain(sql, "from public, anon, authenticated, service_role", "audit table direct writes revoked");
mustContain(sql, "grant select, insert on table private.publishing_job_reconciliation_events to service_role", "backend-only audit inserts");
mustContain(sql, "create policy publishing_job_reconciliation_service_role_read", "explicit service-role read policy");
mustContain(sql, "create policy publishing_job_reconciliation_service_role_insert", "explicit service-role insert policy");
mustContain(sql, "for select to service_role", "audit read policy is service-role only");
mustContain(sql, "for insert to service_role", "audit insert policy is service-role only");
mustContain(sql, "create or replace function public.reconcile_unknown_publishing_job(", "reconciliation RPC");
mustContain(sql, "security invoker", "RPC runs as caller");
mustContain(sql, "set search_path = ''", "pinned empty search path");
mustContain(sql, "if current_user <> 'service_role'", "service-role-only RPC");
mustContain(sql, "('confirmed_published', 'closed_without_retry')", "explicit resolution allowlist");
mustContain(sql, "v_job.last_error_code is distinct from 'PUBLISH_OUTCOME_UNKNOWN'", "only ambiguous failed jobs are eligible");
mustContain(sql, "v_operator_role not in ('owner', 'admin')", "workspace operator authorization");
mustContain(sql, "'publish_started'", "ambiguous checkpoint eligibility");
mustContain(sql, "insert into private.publishing_job_reconciliation_events", "durable audit insertion");
mustContain(sql, "grant execute on function public.reconcile_unknown_publishing_job", "RPC execute grant");
assert.ok(!/grant\s+(all|update|delete)\s+on\s+table\s+private\.publishing_job_reconciliation_events\s+to\s+service_role/i.test(sql), "Audit events must not be mutable by service_role through table grants.");
assert.ok(!/set\s+status\s*=\s*'queued'/i.test(sql), "Manual reconciliation must never requeue an ambiguous job.");
assert.ok(sql.indexOf("update public.publishing_jobs") < sql.indexOf("insert into private.publishing_job_reconciliation_events"), "The job transition and audit insert must be part of the same transaction/function.");

// Edge boundary: authenticate a real user, validate workspace role, and derive actor server-side.
mustContain(endpoint, 'withSupabase({ auth: "user" }', "signed-in user authentication");
mustContain(endpoint, "ctx.userClaims?.id ?? ctx.jwtClaims?.sub", "verified user identity");
mustContain(endpoint, '["owner", "admin"]', "workspace owner/admin only");
mustContain(endpoint, '"reconcile_unknown_publishing_job"', "RPC invocation");
mustContain(endpoint, "p_operator_id: operatorId", "actor derives from auth identity");
mustContain(endpoint, 'resolution === "closed_without_retry"', "closed outcomes must not accept provider post IDs");
assert.ok(!endpoint.includes("body.operatorId") && !endpoint.includes("body.operator_id"), "Clients must not choose the audited operator identity.");
mustContain(config, "[functions.publishing-reconciliation]", "function config");
mustContain(config, "verify_jwt = true", "platform JWT verification stays enabled");

console.log("OrbitOS publishing reconciliation contract tests passed.");
