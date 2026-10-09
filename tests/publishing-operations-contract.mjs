import assert from "node:assert/strict";
import { readFileSync } from "node:fs";

const sql = readFileSync(
  new URL("../docs/architecture/publishing-operations-overview.sql", import.meta.url),
  "utf8",
);
const endpoint = readFileSync(
  new URL("../supabase/functions/publishing-operations/index.ts", import.meta.url),
  "utf8",
);
const bridge = readFileSync(
  new URL("../src/runtime/application-browser-bridge.mjs", import.meta.url),
  "utf8",
);
const ui = readFileSync(new URL("../index.html", import.meta.url), "utf8");
const config = readFileSync(new URL("../supabase/config.toml", import.meta.url), "utf8");

function mustContain(source, fragment, label) {
  assert.ok(source.includes(fragment), "Missing publishing operations contract: " + label);
}

// SQL: privileged read access is workspace-scoped, role-checked, bounded, and read-only.
mustContain(sql, "create or replace function public.get_publishing_operations_overview(", "overview RPC");
mustContain(sql, "security invoker", "RPC uses invoker security");
mustContain(sql, "set search_path = ''", "empty search path");
mustContain(sql, "if current_user <> 'service_role'", "service-role-only RPC");
mustContain(sql, "wm.workspace_id = p_workspace_id", "workspace membership check");
mustContain(sql, "wm.user_id = p_operator_id", "operator identity check");
mustContain(sql, "v_operator_role not in ('owner', 'admin')", "owner/admin restriction");
mustContain(sql, "limit 50", "bounded output");
mustContain(sql, "'unknownOutcome'", "unknown provider outcome metric");
mustContain("last_error_code = 'PUBLISH_OUTCOME_UNKNOWN'", "unknown outcome query");
mustContain(sql, "private.publishing_job_reconciliation_events", "private audit data is read only through backend RPC");
mustContain(sql, "revoke all on function public.get_publishing_operations_overview(text, uuid)", "default function privileges revoked");
mustContain(sql, "grant execute on function public.get_publishing_operations_overview(text, uuid)", "only service_role is granted RPC execution");
assert.ok(!/insert\s+into\s+public\.publishing_jobs|update\s+public\.publishing_jobs|delete\s+from\s+public\.publishing_jobs/i.test(sql), "Operations overview must not mutate publishing jobs.");

// Edge Function: verified session plus owner/admin checks before returning operational data.
mustContain(endpoint, 'withSupabase({ auth: "user" }', "signed-in user authentication");
mustContain(endpoint, 'if (req.method !== "POST")', "POST-only endpoint");
mustContain(endpoint, "ctx.userClaims?.id ?? ctx.jwtClaims?.sub", "verified actor");
mustContain(endpoint, "WORKSPACE_ADMIN_REQUIRED", "owner/admin denial response");
mustContain(endpoint, '"get_publishing_operations_overview"', "backend overview RPC");
mustContain(endpoint, "p_workspace_id: workspaceId", "workspace scope passed to RPC");
mustContain(endpoint, "p_operator_id: operatorId", "verified actor passed to RPC");
assert.ok(!endpoint.includes("publishing_jobs").replace("publishing_jobs", "publishing_jobs"), "Expected query design is RPC-based.");

// Browser bridge and Settings UI: load only via the signed-in runtime; UI is view-only.
mustContain(bridge, "async function getPublishingOperations()", "bridge method");
mustContain(bridge, 'client.functions.invoke("publishing-operations"', "Edge Function invocation");
mustContain(bridge, "getPublishingOperations,", "public bridge method export");
mustContain(ui, "function renderPublishingOperationsPanel(workspaceId)", "read-only operations panel");
mustContain(ui, "window.orbitCore.getPublishingOperations()", "bridge-backed dashboard load");
mustContain(ui, "READ ONLY", "read-only status badge");
mustContain(ui, "Never sends a social post", "no publishing side effects described");
mustContain(ui, "reconciliation audit", "reconciliation history section");
assert.ok(!/btn\(["'](?:Retry|Publish now|Requeue)["']/i.test(ui), "Operations panel must not add retry/requeue/publish controls.");
mustContain(config, "[functions.publishing-operations]\nverify_jwt = true", "platform JWT verification stays enabled");

console.log("OrbitOS publishing operations contract tests passed.");
