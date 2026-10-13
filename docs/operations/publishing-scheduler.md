# OrbitOS publishing scheduler

## What it does

Supabase Cron invokes `publishing-scheduler` every minute. The dispatcher authenticates the request with a random token held in Supabase Vault, verifies it through a service-role-only RPC, acquires a short-lived database lease, and then invokes the existing `publishing-worker`. It does not duplicate publishing logic.

The database lease prevents overlapping dispatches. A completed worker HTTP response releases the lease. If the HTTP request times out or its outcome is ambiguous, the lease is retained until expiry so a second dispatcher does not immediately overlap a possibly active worker.

## Safety defaults

- The scheduler does not set or mutate publishing feature flags.
- `ORBITOS_PUBLISHING_ENABLED` must be explicitly set to `true` before the dispatcher calls the worker.
- The worker independently checks the global flag and requires a ready official adapter.
- Jobs still require a uniquely matching connected account, approved content, and an approved latest variant.
- Unknown provider outcomes remain in manual reconciliation; the scheduler never retries an ambiguous provider publish by itself.
- The cron bearer token and service-role credentials are never logged, returned, or committed to source.
- An unavailable secret/configuration or database RPC causes a fail-closed response.

## Deployment and validation

1. Deploy the `publishing-scheduler` Edge Function with gateway JWT verification disabled only because the handler validates its own random Vault-backed bearer token.
2. Apply the scheduler migration. It enables `pg_cron` / `pg_net`, creates the lease and verification RPCs, stores the random token and project routing data in Vault, and registers one named cron job.
3. Confirm that the `orbitoos-publishing-scheduler` entry exists in `cron.job` and that scheduler Edge Function invocations return either `PUBLISHING_DISABLED`/a safe skipped response or a worker result.
4. Keep `ORBITOS_PUBLISHING_ENABLED` unset or false until the Instagram app credentials, redirect URI, current supported Meta API version, connected professional account, publishing permission, approved content, public HTTPS media URL, quota, and operator-controlled test plan have been verified.
5. For a first live publish, follow the Instagram Reels runbook. Verify the Reel directly in the connected account; a successful cron call or worker response is not proof of publication.

## Production verification snapshot — 2026-10-13

Read-only inspection of `net._http_response` found **360** retained responses from **2026-10-12 19:51 UTC through 2026-10-13 01:50 UTC**. All 360 had HTTP 200, no timeout, and no transport error; every body reported `PUBLISHING_DISABLED`. The current `net.http_request_queue` contained zero queued requests. This confirms that the publishing scheduler has been reaching the endpoint successfully during the retained response window and that the worker dispatch gate remains closed. It is not evidence that a social post was published.

A separate read-only review of Supabase function-edge logs for **2026-10-12 01:45 UTC through 2026-10-13 01:45 UTC** found 1,176 HTTP 200 responses from `publishing-scheduler` with user-agent `pg_net/0.20.4`, plus 14 HTTP 401 responses with user-agent `pg_net/0.20.0`; the last observed 401 was at **2026-10-12 12:50 UTC**. The log evidence does not establish the cause of those earlier 401 responses. They did not appear in the latest six-hour `net._http_response` window, but they should remain a historical anomaly to monitor rather than be declared resolved by assumption. If 401s recur, inspect the deployment/version and Vault-backed authorization verification without logging or exposing tokens.

The publishing cron is active and continues to run every minute. Keep the worker and official-adapter gates disabled until the separate real-account acceptance and controlled publishing prerequisites are complete. Do not enable the worker as a diagnostic probe.
