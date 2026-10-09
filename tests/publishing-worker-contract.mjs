import assert from "node:assert/strict";
import { readFileSync } from "node:fs";

// This is a source-level safety contract for the Deno Edge Function. It deliberately
// does not invoke production endpoints, create publishing jobs, or call Instagram.
const worker = readFileSync(
  new URL("../supabase/functions/publishing-worker/index.ts", import.meta.url),
  "utf8",
);

function requireFragment(fragment, purpose) {
  assert.ok(worker.includes(fragment), "Missing publishing-worker safety contract: " + purpose);
}

// Authentication and fail-closed execution gates.
requireFragment('withSupabase({ auth: "secret" }, async (req, ctx) => {', "secret-key authentication");
requireFragment('if (req.method !== "POST")', "POST-only method boundary");
requireFragment('return json({ error: "METHOD_NOT_ALLOWED" }, 405);', "method rejection");
requireFragment('if (Deno.env.get("ORBITOS_PUBLISHING_ENABLED") !== "true")', "global publishing disabled by default");
requireFragment('return json({ error: "PUBLISHING_DISABLED" }, 503);', "disabled-mode response");
requireFragment('Deno.env.get("ORBITOS_INSTAGRAM_PUBLISHING_ADAPTER_ENABLED") === "true"', "independent Instagram adapter flag");
requireFragment('const validVersion = /^v\\d{1,2}\\.\\d{1,2}$/.test(apiVersion);', "supported Meta API version validation");

const globalGate = worker.indexOf('if (Deno.env.get("ORBITOS_PUBLISHING_ENABLED") !== "true")');
const registryCreation = worker.indexOf("const registry = createPublisherAdapters(ctx);");
const jobClaim = worker.indexOf('"claim_due_publishing_jobs"');
assert.ok(globalGate >= 0 && registryCreation > globalGate, "Global gate must run before adapter setup.");
assert.ok(jobClaim > registryCreation, "Jobs must not be claimed before adapter readiness is evaluated.");

requireFragment("adapter.enabled === true", "enabled adapter required");
requireFragment("adapter.official === true", "official adapter required");
requireFragment("adapter.credentialsReady === true", "credentials readiness required");
requireFragment("adapter.supportsIdempotency === true", "idempotency capability required");
requireFragment("adapter.rateLimitReady === true", "rate-limit readiness required");
requireFragment('return json({ error: "NO_OFFICIAL_ADAPTER_CONFIGURED" }, 503);', "no jobs claimed without a ready official adapter");

// Enforce content approval and fenced job state transitions.
requireFragment('content.status !== "approved"', "content approval is rechecked at execution time");
requireFragment('variant.status !== "approved"', "variant approval is rechecked at execution time");
requireFragment("variant.approved !== true", "explicit variant approval is required");
requireFragment('.eq("status", "processing")', "only a processing lease may transition");
requireFragment('.eq("lease_token", job.lease_token)', "all state writes are lease-token fenced");
requireFragment('"claim_due_publishing_jobs"', "atomic claim RPC");
requireFragment('"complete_publishing_job"', "completion RPC");
requireFragment('"retry_publishing_job"', "retry RPC");

// Bounded retries, sanitized failures, and duplicate-post protection.
requireFragment("Math.max(0, Math.min(7, attempts - 1))", "retry backoff exponent is bounded");
requireFragment("Math.min(3600, 30 * 2 ** exponent)", "automatic retry delay is capped");
requireFragment("class PublishOutcomeUnknownError extends Error", "ambiguous provider outcome has its own error type");
requireFragment('"PUBLISH_OUTCOME_UNKNOWN"', "ambiguous outcome is marked for manual reconciliation");
requireFragment('if (checkpoint?.phase === "publish_started") throw new PublishOutcomeUnknownError();', "a resumed publish_started checkpoint cannot blindly republish");

const publishStarted = worker.indexOf('phase: "publish_started"');
const publishRequest = worker.indexOf('String(account.external_account_id) + "/media_publish"');
assert.ok(publishStarted >= 0 && publishRequest > publishStarted, "Durable publish_started checkpoint must be written before media_publish.");
requireFragment('if (published.response.status >= 500) throw new PublishOutcomeUnknownError();', "ambiguous provider server errors must not auto-retry");
requireFragment('status: failed ? "manual_reconciliation_required" : "outcome_unconfirmed"', "unknown outcomes surface for operator review");
requireFragment('mediaUrl.protocol !== "https:"', "Reels media URL requires HTTPS");
assert.ok(/!\/\.(mp4\|mov)\$\/i\.test\(mediaUrl\.pathname\)/.test(worker), "Reels media must be an MP4 or MOV URL.");
assert.ok(!worker.includes("console.error(error)"), "Raw error objects must not be logged.");
assert.ok(!worker.includes("return json({ error: String(error"), "Raw errors must not be returned to clients.");

console.log("OrbitOS publishing-worker safety contract tests passed.");
