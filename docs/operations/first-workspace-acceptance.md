# First authenticated workspace acceptance runbook

**Purpose:** verify the first real OrbitOS account and persistent workspace without accidentally enabling social publishing.

**Latest read-only production preflight: 2026-10-13.** Supabase reports 26 applied migrations, matching the 26 migration versions tracked on `main`. The catalog audit confirms 24/24 application tables have RLS enabled; all 84 application indexes are valid and ready; and all 95 CHECK, foreign-key, primary-key, and unique constraints are validated. Public application functions executable by `anon` or `authenticated`: 0. The global and `public`-schema default function ACLs for role `postgres` grant no `PUBLIC`, `anon`, or `authenticated` execution. Important limitation: the managed `supabase_admin` role still has a `public` default ACL containing `anon`/`authenticated` function execution grants; this was not changed because it may serve managed Supabase operations. Default-ACL parity therefore remains open for non-`postgres` object-creation roles. The live inventory of 64 RLS policies matches tracked source by schema/table/name, permissive mode, command, and target roles. Manual review of all seven textual predicate differences confirms that they are PostgreSQL catalog-deparser rewrites only: scalar SELECT aliases (`AS uid` and `AS user_workspace_ids`), redundant parentheses/whitespace, omitted `public.` qualification on `workspace_members`, and role `IN (...)` lists rendered as `= ANY (ARRAY[...])`. The underlying source and live predicates are semantically equivalent in all seven cases; no production policy was changed for this audit. A separate definition comparison matched all 53 standalone source index definitions to all 53 live standalone indexes; all 84 live indexes are valid and ready, including 31 primary-key/unique-constraint backing indexes. Supabase Security Advisor still reports `pg_net` in `public` and leaked-password protection disabled; 35 unused-index notices are informational, so indexes have not been removed without workload evidence. The first workspace, owner membership, profile, and default brand are present, but ideas, content items, variants, schedules, social accounts, and publishing jobs remain at zero. Scheduler calls continue to fail closed with `PUBLISHING_DISABLED`. CI browser E2E tests use an isolated mocked Supabase client and are not a real production data-write test. Real signed-in idea creation → variant edit → reload persistence remains pending and must be verified through an authenticated production browser session. Email-signup/confirmation configuration should be reviewed separately before broader rollout; the earlier 401 was caused by Edge Function identity handling, not proof of an email-delivery failure.

**Auth profile bootstrap parity: 2026-10-12.** Migration `20261012030454_track_auth_profile_creation_trigger` records the existing `auth.on_auth_user_created` trigger and `private.handle_new_user()` function in production history and source. The live preflight shows one Auth user and one profile row, consistent with that trigger having run. Workspace bootstrap is a separate step. Authenticated post-fix invocations were subsequently verified with HTTP 200 responses, and the workspace/member/default-brand records are now present; the persistent content-loop acceptance remains a separate pending step.

**Deployed function source-parity audit: 2026-10-12.** The earlier audit confirmed ten key production Edge Functions matched the pre-hotfix `main` source. A follow-up fetch of the live `bootstrap-workspace` Edge Function now confirms version 4 is active, `verify_jwt=true`, and its deployed `index.ts` matches the current `main` source byte-for-byte. The source contains `ctx.userClaims?.id ?? ctx.jwtClaims?.sub` and no longer reads `ctx.userClaims?.sub`. Subsequent logs at 06:24:57 and 06:25:01 UTC showed authenticated HTTP 200 responses, and the database now contains the owner membership, workspace, and default brand. Bootstrap is verified; the authenticated content create/edit/reload workflow remains to be accepted.

**Workspace bootstrap 401 diagnosis and hotfix: 2026-10-12.** Live logs show repeated `POST | 401` responses from `/functions/v1/bootstrap-workspace` between 03:37 and 03:47 UTC, while Supabase Auth `GET /user` requests returned HTTP 200. Those errors came from function version 3, whose handler read `ctx.userClaims?.sub`. The current `@supabase/server` wrapper exposes normalized identity as `ctx.userClaims.id`; raw JWT claims expose the subject as `ctx.jwtClaims.sub`. The handler therefore treated a valid user as missing and returned `AUTH_REQUIRED` before creating the workspace.

The bootstrap hotfix is on `main` in commit `ae51bc4af7fbc3338513b1fdd0a1430fa127044e`. Both GitHub push workflows completed successfully: [OrbitOS validation](https://github.com/oside-dev/orbitoos/actions/runs/38203896515) and [learning-contract](https://github.com/oside-dev/orbitoos/actions/runs/38203896479). Its initial Vercel deployment `dpl_GjtbgWXoT237GMydbqLqNbXG1Etg` was `READY`. The Supabase `bootstrap-workspace` function is active at version 4, updated at 04:28:11 UTC, with `verify_jwt=true`; its deployed source matches `main` exactly and reads `ctx.userClaims?.id ?? ctx.jwtClaims?.sub`. The JWT/user-auth boundary remains enabled. Frontend hardening is now deployed in Vercel production commit `7fbe09a0b92c3a9e3ab7cf5707faa348c57663c5` (`dpl_36EV7saG7Y5ZeB73qyjnV9PRG9Me`, `READY`). This includes the original activity-history guard from `ba2846175f1a994a6f5005933ad39fef3146438d`, authenticated settings projection and safe `autoResearch` handling from `6ed8f06c28946b20a7dc999e12a5e803e94ce4d7`, and empty Brand guardrail normalization. Direct live probes on 2026-10-12 returned HTTP 200 for the production HTML and `src/runtime/ui-state.mjs`, with all three guards present. The last-hour Vercel runtime error summary was empty. The browser tests use an isolated mocked Supabase client and must not be described as a successful real-account DB write.

A log query after the function-v4 deployment subsequently observed authenticated `POST | 200` requests at 06:24:57 and 06:25:01 UTC. A production database preflight then confirmed the workspace, membership, and brand records were created. This resolves the bootstrap 401 incident. The broader first-workspace acceptance remains **in progress** until an operator verifies authenticated UI persistence by creating an idea, editing a content variant, and confirming it survives reload. Keep publishing and token-refresh gates disabled throughout this verification.

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
