# First authenticated workspace acceptance runbook

**Purpose:** verify the first real OrbitOS account and persistent workspace without accidentally enabling social publishing.

**State observed on 2026-10-10:** the Supabase project was healthy, email signup was enabled, email confirmation was required, and there were no Auth users, workspaces, workspace memberships, connected social accounts, schedules, or publishing jobs. The test suite and signed-out browser flow were green. Real email delivery, a real authenticated workspace, and Meta OAuth have not yet been exercised. Recheck this state before running the checklist; these observations can become stale.

## Safety rules

- Use an email address you control and a real operator account. Do not create a synthetic production user or use someone else's email.
- Keep `ORBITOS_PUBLISHING_ENABLED`, `ORBITOS_INSTAGRAM_PUBLISHING_ADAPTER_ENABLED`, and `ORBITOS_INSTAGRAM_REFRESH_ENABLED` off throughout workspace acceptance.
- Never paste app secrets, Supabase secret keys, access tokens, or passwords into GitHub, issue comments, browser state, or logs.
- A readiness check reports configuration presence; it is not proof that OAuth or publishing works.
- Do not disable email confirmation just to get around a delivery problem.

## 1. Check Auth URL and email configuration

In the Supabase Dashboard for project `orbitoos` (`lkcbtgqdvzmaihcnxxwk`), open **Authentication → URL Configuration**.

1. Set the production Site URL to `https://orbitoos.vercel.app`.
2. Add the exact production app URL to the allowed redirect list if it is not already present. Avoid broad wildcard rules for production. Supabase documents Site URL and redirect allow-list behavior here: [Auth Redirect URLs](https://supabase.com/docs/guides/auth/redirect-urls).
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
