# First authenticated workspace acceptance runbook

**Purpose:** verify the first real OrbitOS account and persistent workspace without accidentally enabling social publishing.

**Latest database preflight: 2026-10-12 05:03 UTC.** Production has one confirmed Auth user and one profile row, but zero workspaces, workspace memberships, brands, connected social accounts, schedules, publishing jobs, ideas, and content items. The only recorded sign-in was at 03:37 UTC, before the bootstrap hotfix. The recorded `bootstrap-workspace` HTTP 401 responses came from function version 3. Version 4 is now deployed, but no signed-in bootstrap request has been observed after that deployment, so workspace acceptance remains pending. Email-signup/confirmation settings were last checked on 2026-10-10 and must be rechecked separately; the observed 401 was caused by Edge Function identity handling, not proof of an email-delivery failure.

**Auth profile bootstrap parity: 2026-10-12.** Migration `20261012030454_track_auth_profile_creation_trigger` records the existing `auth.on_auth_user_created` trigger and `private.handle_new_user()` function in production history and source. The live preflight shows one Auth user and one profile row, consistent with that trigger having run. Workspace bootstrap is a separate step; the version 3 defect is fixed in the deployed version 4, but an authenticated post-fix invocation still needs verification.

**Deployed function source-parity audit: 2026-10-12.** The earlier audit confirmed ten key production Edge Functions matched the pre-hotfix `main` source. A follow-up fetch of the live `bootstrap-workspace` Edge Function now confirms version 4 is active, `verify_jwt=true`, and its deployed `index.ts` matches the current `main` source byte-for-byte. The source contains `ctx.userClaims?.id ?? ctx.jwtClaims?.sub` and no longer reads `ctx.userClaims?.sub`. This proves deployment/source alignment, not a successful signed-in request; no post-deploy bootstrap call has been observed yet.

**Workspace bootstrap 401 diagnosis and hotfix: 2026-10-12.** Live logs show repeated `POST | 401` responses from `/functions/v1/bootstrap-workspace` between 03:37 and 03:47 UTC, while Supabase Auth `GET /user` requests returned HTTP 200. Those errors came from function version 3, whose handler read `ctx.userClaims?.sub`. The current `@supabase/server` wrapper exposes normalized identity as `ctx.userClaims.id`; raw JWT claims expose the subject as `ctx.jwtClaims.sub`. The handler therefore treated a valid user as missing and returned `AUTH_REQUIRED` before creating the workspace.

The hotfix is on `main` in commit `ae51bc4af7fbc3338513b1fdd0a1430fa127044e`. Both GitHub push workflows completed successfully: [OrbitOS validation](https://github.com/oside-dev/orbitoos/actions/runs/38203896515) and [learning-contract](https://github.com/oside-dev/orbitoos/actions/runs/38203896479). Vercel production deployment `dpl_GjtbgWXoT237GMydbqLqNbXG1Etg` is `READY` and serves `https://orbitoos.vercel.app`. The Supabase `bootstrap-workspace` function is active at version 4, updated at 04:28:11 UTC, with `verify_jwt=true`; its deployed source matches `main` exactly and reads `ctx.userClaims?.id ?? ctx.jwtClaims?.sub`. The JWT/user-auth boundary remains enabled.

A log query covering 04:28 UTC onward showed no further `bootstrap-workspace` requests. The hotfix is deployed but its recovery is **not yet acceptance-tested**. Do not mark acceptance PASS until a signed-in page reload invokes version 4 and the workspace, owner membership, and default brand appear. Keep publishing and token-refresh gates disabled throughout this verification.

**Live scheduler safety check: 2026-10-12.** The publishing dispatcher returned `PUBLISHING_DISABLED` 360 times in the preceding 24 hours, and the token-refresh dispatcher returned `TOKEN_REFRESH_DISABLED` at 02:17 UTC. All 361 observed dispatcher responses were HTTP 2xx with no timeout/error. This verifies the gates are currently failing closed; it does not complete the real-account acceptance.

## Safety rules

- Use an email address you control and a real operator account. Do not create a synthetic production user or use someone else's email.
- Keep `ORBITOS_PUBLISHING_ENABLED`, `ORBITOS_INSTAGRAM_PUBLISHING_ADAPTER_ENABLED`, and `ORBITOS_INSTAGRAM_REFRESH_ENABLED` off throughout workspace acceptance.
- Never paste app secrets, Supabase secret keys, access tokens, or passwords into GitHub, issue comments, browser state, or logs.
- A readiness check reports configuration presence; it is not proof that OAuth or publishing works.
- Do not disable email confirmation just to get around a delivery problem.

## 1. Check Auth URL and email configuration

In the Supabase Dashboard for project `orbitoos` (`lkcbtgqdvzmaihcnxxwk`), open **Authentication → URL Configuration**.

1. Set the production Site URL to `https://orbitoos.vercel.app`.
2. Add the exact production app URL to the allowed redirect list if it is not already present. If testing from a local development server, add only the exact local origin you use (for example, `http://localhost:3000`) as a separate redirect entry. Sign-up and resend flows explicitly return confirmation links to the current app origin, so that origin must be allow-listed. Avoid broad wildcard rules for production. Supabase documents Site URL and redirect allow-list behavior here: [Auth Redirect URLs](https://supabase.com/docs/guides/auth/redirect-urls).
3. Under email provider settings, verify that email signups and email confirmation are enabled.
4. Confirm transactional email delivery is configured before using an address outside the Supabase organization. Supabase's default SMTP service is intended for testing and has recipient restrictions and low rate limits; configure a custom SMTP provider for production delivery. See [Supabase custom SMTP](https://supabase.com/docs/guides/auth/auth-smtp).

## 2. Create the first real account and workspace

1. Open [OrbitOS production](https://orbitoos.vercel.app). The signed-out/local experience should work without creating an account.
2. Go to **Settings → Create account** and use the operator's own email address. Keep the password private.
3. Expect the **Confirm your email** message. Check the inbox and spam folder. If the link goes to the wrong domain, fix Supabase's Site URL/allowed redirects and email template configuration rather than disabling confirmation.
4. Follow the confirmation link, return to OrbitOS, and sign in.
5. In Settings, verify all of the following:
   - Runtime badge is **AUTHENTICATED**.
   - Persistence reads **Backend persistent**.
   - Role is **owner**.
   - Workspace ID is present.
   - The default OrbitOS brand is available.

After a verified session exists, the `bootstrap-workspace` Edge Function idempotently creates the user-owned workspace, owner membership, and default brand. The application deliberately does not bootstrap a workspace from an unconfirmed signup that returned no session.

## 3. Verify the persistent content loop without publishing

1. Create an idea with an unmistakable acceptance label and generate its platform variants.
2. Edit one variant, reload the page, and verify that the change persists in the same signed-in workspace.
3. Approve a draft only after reviewing it. If validating scheduling, schedule one approved variant for a future time that you can identify.
4. Verify the schedule appears in Calendar. With the global publishing switch off, it must not create a live social post; a schedule is not proof of publication.
5. Open Settings again. Authenticated workspace mode should offer **Export JSON**, but must not show demo restore or JSON import. Those destructive recovery actions are local-mode only.
6. Export a backup only to a location controlled by the operator. Avoid putting production content or personal data into public bug reports.
7. Sign out and verify the app returns to local mode. The local demo can be restored there without overwriting the persistent workspace.

Clean up acceptance-only content from the signed-in workspace after validation if it is no longer needed. Do not delete the workspace, owner membership, or Auth user as a shortcut for resetting the demo.

## 4. Check Instagram integration readiness

This stage requires a workspace owner/admin and an operator-controlled Instagram **professional** account. It cannot be completed with sample data alone.

1. In Meta's developer console, configure an app for **Instagram Login** and follow Meta's current setup, permission, and access-review requirements for the intended users.
2. Register this callback URI exactly unless the project is deliberately configured with a matching override:

   `https://lkcbtgqdvzmaihcnxxwk.supabase.co/functions/v1/instagram-oauth-callback`

3. Store `META_INSTAGRAM_APP_ID`, `META_INSTAGRAM_APP_SECRET`, and any needed `META_INSTAGRAM_REDIRECT_URI` / `ORBITOS_APP_URL` overrides as Supabase Edge Function secrets. Set `META_GRAPH_API_VERSION` only to a currently supported version when preparing a separate publishing test. Do not commit values to the repository.
4. In OrbitOS **Settings → Instagram → Check integration setup**, verify which configuration fields are present. The endpoint intentionally returns booleans only; it does not validate a secret against Meta and does not publish.
5. Complete OAuth only after configuration is ready. Verify the correct account is shown as connected and the required Instagram Login scopes are granted. The official Meta references are [Instagram API with Instagram Login](https://developers.facebook.com/docs/instagram-platform/instagram-api-with-instagram-login) and [Meta's Instagram API collection](https://www.postman.com/meta/workspace/instagram/documentation/23987686-9386f468-7714-490f-9bfc-9442db5c8f00).

OAuth connection, token refresh, and content publishing are separate gates. Do not enable the token-refresh or publishing switches as part of this acceptance run.

## Acceptance result

Record the outcome as **PASS**, **BLOCKED**, or **FAIL** with timestamp and non-secret evidence.

- **PASS:** real account confirms email and signs in; owner workspace/default brand are created; a content edit survives reload; the local recovery controls are unavailable while signed in; sign-out and local fallback still work.
- **BLOCKED:** the test cannot continue because an operator-controlled email/SMTP setup or Meta app/account configuration is unavailable. Record the missing prerequisites, not secret values.
- **FAIL:** an expected state transition is incorrect, cross-workspace data appears, authenticated state is shown without a verified session, or a disabled publishing path attempts an external post. Stop and add a regression test before retrying.

A successful CI run is not a substitute for this real-account check, and a successful readiness check is not proof of a published post.
