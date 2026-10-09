# Instagram Reels publishing runbook

**Scope:** the M22 Instagram Login / Reels adapter in supabase/functions/publishing-worker/index.ts. This is an operator checklist, not a live-publishing enablement change.

## Default safety posture

The worker should remain disabled until a real, explicitly approved test publish is planned. A job is only eligible when the global worker switch is enabled, the Instagram adapter is enabled, a syntactically supported Meta Graph API version is configured, the adapter reports all readiness capabilities, the linked account is connected, and the content item and variant are approved.

The API-version check only validates the vX.Y format; it does **not** confirm that Meta still supports that version. Confirm current provider requirements before a controlled rollout.

## Preflight before any live publish

1. **Meta app and callback:** configure the Instagram Login app in Meta's developer settings. The default callback URI is https://lkcbtgqdvzmaihcnxxwk.supabase.co/functions/v1/instagram-oauth-callback. If the registered redirect URI differs, keep META_INSTAGRAM_REDIRECT_URI consistent with it.
2. **Server-side secrets:** add the app credentials and any required URL overrides through Supabase Edge Function secrets. Never commit app credentials, access tokens, secret API keys, or their values to GitHub, browser state, tickets, or logs.
3. **Connected account:** complete the OAuth flow and confirm the account is connected and has the instagram_business_content_publish permission. If the account needs reauthorization, reconnect it rather than bypassing the permission check.
4. **Approved content:** verify that both the content item and the exact Instagram Reels variant are approved. Use only content deliberately selected for the controlled test.
5. **Media URL:** the variant must point to a publicly fetchable HTTPS video URL ending in .mp4 or .mov. The worker checks the URL shape, but it cannot guarantee that Meta can fetch the file or that the media meets every current provider specification.
6. **Quota and timing:** ensure the connected account has publishing quota available and choose a time when an operator can review the result. The worker checks the provider quota but it does not replace a human review.
7. **Explicit activation:** set META_GRAPH_API_VERSION to a currently supported value and review both switches before enabling anything: ORBITOS_INSTAGRAM_PUBLISHING_ADAPTER_ENABLED=true and ORBITOS_PUBLISHING_ENABLED=true. The global switch is the final publishing gate. No schedule or publishing flag should be enabled merely as part of a code deployment.

There is currently no provider-backed dry-run mode. Do not treat a successful worker response, a container ID, or a CI test as proof that an Instagram post was published. Confirm the published media in the connected account.

## Failure triage

| Code / outcome | Interpretation | Safe action |
| --- | --- | --- |
| PUBLISHING_DISABLED | Global worker switch is off. | Expected while disabled; do not turn it on just to probe production. |
| NO_OFFICIAL_ADAPTER_CONFIGURED | No adapter satisfies all readiness gates. | Check flag names and API-version configuration without exposing secret values. |
| INSTAGRAM_REAUTH_REQUIRED or INSTAGRAM_PUBLISH_PERMISSION_MISSING | Token or publishing permission needs attention. | Reauthorize the account and confirm the requested scope; do not skip the check. |
| PUBLISH_QUOTA_CHECK_UNAVAILABLE or INSTAGRAM_PUBLISH_QUOTA_REACHED | Quota could not be confirmed or the quota is exhausted. | Do not retry immediately; inspect the account/provider status and retry only after it is safe. |
| MEDIA_URL_INVALID or INSTAGRAM_REEL_URL_UNSUPPORTED | The URL is malformed or fails the worker's safety checks. | Fix the approved variant's media URL and re-review it before rescheduling. |
| PUBLISH_OUTCOME_UNKNOWN | Meta may have accepted the post, but the worker cannot safely confirm the outcome. | Follow the manual reconciliation procedure below. Never blindly retry this job. |

## Manual reconciliation: PUBLISH_OUTCOME_UNKNOWN

This condition is deliberately different from an ordinary retryable error. The worker stores a durable checkpoint and moves the job to a failed/manual-review outcome rather than automatically issuing another publish request.

1. Turn the global worker switch off to block **future invocations from claiming new jobs**. This does not terminate a worker invocation already in progress.
2. Find the affected job using its job ID and inspect its sanitized error code and checkpoint metadata using authorized backend tooling. Do not reveal or copy tokens, Vault values, or API keys.
3. Review the connected Instagram account itself and determine whether the intended Reel was actually published. Use the account, media, caption, and timing to establish the outcome; an HTTP timeout alone is not evidence that publication failed.
4. Keep the job out of automatic retry while the outcome is uncertain. Record the evidence and the provider post ID if publication is confirmed.
5. Do not delete the checkpoint, reset the job status, or requeue it with ad hoc SQL. After the M23 database contract and Edge Function are deployed, use the signed-in `publishing-reconciliation` endpoint as a workspace owner/admin. Choose `confirmed_published` only when you can provide the actual provider post ID; choose `closed_without_retry` only after reviewing the connected account and confirming no post was created. Both outcomes require an evidence reference and are written to an append-only private audit table. The endpoint never re-queues an ambiguous job.
6. Re-enable the global switch only after the affected job is safely resolved and an operator has reviewed the remaining queue.

## Read-only operations panel

Workspace owners/admins can open Settings in OrbitOS and select **Load operations** or **Refresh operations**. The panel shows workspace-scoped status counts, up to 50 recent publishing jobs, attempts and timestamps, bounded error diagnostics, and up to 50 reconciliation audit events. It does not change a job or invoke Instagram.

Use this view to identify jobs requiring investigation. If a job shows `PUBLISH_OUTCOME_UNKNOWN`, follow the manual reconciliation section above; the read-only panel is not a retry or reconciliation control. If the view cannot be loaded, check the user's workspace role and the Supabase Edge Function logs without exposing secret values.

## Observability and escalation

Use Supabase's Edge Function invocation and function-log views to review request status, sanitized result codes, timestamps, and job IDs. Logs and CI are diagnostic aids; do not add credential values to logs to make troubleshooting easier. If an error code is unexpected, preserve the relevant non-secret evidence and add a regression test before changing retry behavior.

A successful CI run verifies source-level contracts only. It does not invoke the production worker, verify Meta credentials, or prove that a live post succeeds.
