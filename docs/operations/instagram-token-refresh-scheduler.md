# OrbitOS Instagram token-refresh scheduler

## What it does

Supabase Cron invokes `instagram-token-refresh-scheduler` daily at **02:17 UTC**. The dispatcher validates the same random bearer token stored in Supabase Vault for the publishing dispatcher, claims a dedicated database lease, and then calls the existing `instagram-token-refresh` Edge Function with a server-side Supabase key.

The scheduler does not read or return social tokens. The existing refresh endpoint reads credentials through the service-role-only Vault RPC, rotates only eligible Instagram Login access tokens, and updates expiry metadata only after the replacement token is stored successfully.

## Safety defaults

- `ORBITOS_INSTAGRAM_REFRESH_ENABLED` must be explicitly set to `true` before the dispatcher calls the refresh endpoint.
- The refresh endpoint checks the same flag independently and remains fail-closed.
- The cron migration does not create or modify any environment secrets.
- The scheduler token stays in Vault and is never logged or returned.
- The dedicated database lease prevents overlapping refresh runs; an ambiguous network timeout retains the lease until expiry.
- This token maintenance schedule does not enable live publishing and does not change `ORBITOS_PUBLISHING_ENABLED`.

## Validation

1. Confirm `orbitoos-instagram-token-refresh` exists in `cron.job` with schedule `17 2 * * *`.
2. While refresh remains disabled, verify that the dispatcher returns `{ ok: true, skipped: "TOKEN_REFRESH_DISABLED" }`.
3. Before enabling refresh, confirm the Meta app setup, connect a professional Instagram account, and verify its token metadata and scopes.
4. Enable `ORBITOS_INSTAGRAM_REFRESH_ENABLED` only after controlled testing and monitoring are ready. Verify the new expiry metadata and account status after one run.

A scheduled HTTP 200 only proves the dispatcher ran. It is not proof that a provider token was rotated.
