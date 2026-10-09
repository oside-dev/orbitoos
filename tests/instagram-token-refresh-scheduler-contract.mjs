import assert from "node:assert/strict";
import { readFileSync } from "node:fs";

const read = (path) => readFileSync(new URL(path, import.meta.url), "utf8");
const scheduler = read("../supabase/functions/instagram-token-refresh-scheduler/index.ts");
const sql = read("../supabase/migrations/20261009082359_orbitoos_instagram_token_refresh_scheduler.sql");
const config = read("../supabase/config.toml");
const refresh = read("../supabase/functions/instagram-token-refresh/index.ts");
const runbook = read("../docs/operations/instagram-token-refresh-scheduler.md");

function mustContain(source, fragment, label) {
  assert.ok(source.includes(fragment), "Missing token-refresh scheduler contract: " + label);
}

mustContain(config, "[functions.instagram-token-refresh-scheduler]", "scheduler function config");
mustContain(scheduler, "verify_orbitoos_publishing_scheduler_token", "Vault-backed bearer verification");
mustContain(scheduler, "SUPABASE_SERVICE_ROLE_KEY", "server-side service key only");
mustContain(scheduler, "const BASE_URL = PROJECT_URL.endsWith(\"/\")", "syntax-safe base URL normalization");
mustContain(scheduler, "ORBITOS_INSTAGRAM_REFRESH_ENABLED", "refresh gate is checked before dispatch");
mustContain(scheduler, "claim_orbitoos_instagram_token_refresh_scheduler_lease", "single-flight lease claimed");
mustContain(scheduler, "release_orbitoos_instagram_token_refresh_scheduler_lease", "lease release is attempted");
mustContain(scheduler, "AbortSignal.timeout(120_000)", "refresh request is bounded");
mustContain(scheduler, "releaseLease = false", "ambiguous network failures retain lease until expiry");
assert.ok(!scheduler.includes("console.log(token"), "Never log the scheduler token.");
assert.ok(!scheduler.includes("console.log(SERVICE_KEY"), "Never log the service key.");

mustContain(sql, "create table if not exists private.instagram_token_refresh_scheduler_leases", "private lease storage");
mustContain(sql, "alter table private.instagram_token_refresh_scheduler_leases enable row level security", "lease table RLS");
mustContain(sql, "grant execute on function public.claim_orbitoos_instagram_token_refresh_scheduler_lease(integer)", "lease claim is service-role-only");
mustContain(sql, "grant execute on function public.release_orbitoos_instagram_token_refresh_scheduler_lease(uuid)", "lease release is service-role-only");
mustContain(sql, "'17 2 * * *'", "daily UTC dispatch cadence");
mustContain(sql, "orbitoos-instagram-token-refresh", "stable cron job name");
mustContain(sql, "vault.decrypted_secrets", "cron token is read from Vault");
mustContain(sql, "/functions/v1/instagram-token-refresh-scheduler", "cron invokes the new dispatcher");
assert.ok(!sql.includes("ORBITOS_INSTAGRAM_REFRESH_ENABLED=true"), "Migration must never enable token refresh.");
assert.ok(!sql.includes("ORBITOS_PUBLISHING_ENABLED=true"), "Migration must never enable live publishing.");

mustContain(refresh, 'if (Deno.env.get("ORBITOS_INSTAGRAM_REFRESH_ENABLED") !== "true")', "refresh endpoint keeps its own fail-closed gate");
mustContain(runbook, "TOKEN_REFRESH_DISABLED", "runbook documents the safe disabled result");
mustContain(runbook, "02:17 UTC", "runbook documents the daily schedule");
mustContain(runbook, "does not enable live publishing", "runbook separates refresh from publishing");

console.log("OrbitOS Instagram token-refresh scheduler contract tests passed.");
