import assert from "node:assert/strict";
import { readFileSync } from "node:fs";

const read = (path) => readFileSync(new URL(path, import.meta.url), "utf8");
const scheduler = read("../supabase/functions/publishing-scheduler/index.ts");
const sql = read("../supabase/migrations/20261009074000_orbitoos_publishing_scheduler.sql");
const config = read("../supabase/config.toml");
const worker = read("../supabase/functions/publishing-worker/index.ts");
const runbook = read("../docs/operations/publishing-scheduler.md");

function mustContain(source, fragment, label) {
  assert.ok(source.includes(fragment), "Missing scheduler safety contract: " + label);
}

// Endpoint is not gateway-JWT protected only because it validates a high-entropy
// token with a service-role-only verifier before doing anything privileged.
mustContain(config, "[functions.publishing-scheduler]", "scheduler function config");
mustContain(config, "verify_jwt = false", "custom Vault-token authentication is documented");
mustContain(scheduler, "verify_orbitoos_publishing_scheduler_token", "server-side Vault-token verification");
mustContain(scheduler, "AUTH_REQUIRED", "unauthorized callers are rejected");
mustContain(scheduler, "SUPABASE_SERVICE_ROLE_KEY", "server-side administrative key is required");
mustContain(scheduler, "ORBITOS_PUBLISHING_ENABLED", "global publishing switch checked by dispatcher");
mustContain(scheduler, "claim_orbitoos_publishing_scheduler_lease", "single-flight lease claimed");
mustContain(scheduler, "release_orbitoos_publishing_scheduler_lease", "lease released on completed HTTP requests");
mustContain(scheduler, "AbortSignal.timeout(180_000)", "worker request is bounded");
mustContain(scheduler, "releaseLease = false", "ambiguous network failures retain lease until expiry");
mustContain(scheduler, '"/functions/v1/publishing-worker"', "scheduler dispatches existing worker");
mustContain(scheduler, '"apikey": SERVICE_KEY', "worker call carries API key");
assert.ok(!scheduler.includes("console.log(token"), "Scheduler token must never be logged.");
assert.ok(!scheduler.includes("console.log(SERVICE_KEY"), "Service key must never be logged.");
assert.ok(!scheduler.includes("Deno.env.get(\"ORBITOS_PUBLISHING_ENABLED\") === \"true\""), "Scheduler must never turn publishing on itself.");

// Database contract: random token remains inside Vault; only service_role can
// verify/lease/release; cron runs regularly and invokes the dispatcher.
mustContain(sql, "create extension if not exists pg_cron", "pg_cron enabled");
mustContain(sql, "create extension if not exists pg_net", "pg_net enabled");
mustContain(sql, "extensions.gen_random_bytes(32)", "random 256-bit scheduler token");
mustContain(sql, "vault.decrypted_secrets", "token is validated from Vault");
mustContain(sql, "grant execute on function public.verify_orbitoos_publishing_scheduler_token(text)", "token verifier is service-role-only");
mustContain(sql, "grant execute on function public.claim_orbitoos_publishing_scheduler_lease(integer)", "lease claim is service-role-only");
mustContain(sql, "grant execute on function public.release_orbitoos_publishing_scheduler_lease(uuid)", "lease release is service-role-only");
mustContain(sql, "'* * * * *'", "one-minute dispatch cadence");
mustContain(sql, "orbitoos-publishing-scheduler", "stable cron job name");
mustContain(sql, "net.http_post(", "cron invokes the Edge Function");
mustContain(sql, "orbitoos_publishing_scheduler_token", "cron token is stored in Vault");
assert.ok(!sql.includes("ORBITOS_PUBLISHING_ENABLED=true"), "Migration must never enable live publishing.");
mustContain(worker, 'if (Deno.env.get("ORBITOS_PUBLISHING_ENABLED") !== "true")', "worker retains final fail-closed publishing gate");
mustContain(runbook, "PUBLISHING_DISABLED", "operator docs explain the disabled state");
mustContain(runbook, "does not set or mutate publishing feature flags", "scheduler does not enable publishing");

console.log("OrbitOS publishing scheduler safety contract tests passed.");
