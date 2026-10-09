import "jsr:@supabase/functions-js/edge-runtime.d.ts";
import { withSupabase } from "npm:@supabase/server";

const REQUESTED_SCOPES = [
  "instagram_business_basic",
  "instagram_business_content_publish",
] as const;
const DEFAULT_APP_URL = "https://orbitoos.vercel.app";

type OAuthState = {
  user_id: string;
  workspace_id: string;
  brand_id: string;
};

type ShortTokenResponse = {
  access_token?: unknown;
  user_id?: unknown;
};

type LongTokenResponse = {
  access_token?: unknown;
  token_type?: unknown;
  expires_in?: unknown;
};

type InstagramProfile = {
  id?: unknown;
  user_id?: unknown;
  username?: unknown;
  account_type?: unknown;
};

function json(body: Record<string, unknown>, status = 400): Response {
  return Response.json(body, {
    status,
    headers: { "Cache-Control": "no-store" },
  });
}

function appResult(result: string): Response {
  const appUrl = new URL(Deno.env.get("ORBITOS_APP_URL") ?? DEFAULT_APP_URL);
  if (appUrl.protocol !== "https:" && appUrl.hostname !== "localhost") {
    return json({ error: "APP_REDIRECT_NOT_CONFIGURED" }, 503);
  }
  appUrl.pathname = "/";
  appUrl.search = "";
  appUrl.hash = "";
  appUrl.searchParams.set("social_connection", "instagram");
  appUrl.searchParams.set("result", result);
  return Response.redirect(appUrl.toString(), 303);
}

function config(): { appId: string; appSecret: string; redirectUri: string } | null {
  const appId = Deno.env.get("META_INSTAGRAM_APP_ID")?.trim();
  const appSecret = Deno.env.get("META_INSTAGRAM_APP_SECRET")?.trim();
  const supabaseUrl = Deno.env.get("SUPABASE_URL")?.trim();
  const configuredRedirect = Deno.env.get("META_INSTAGRAM_REDIRECT_URI")?.trim();
  if (!appId || !appSecret || !supabaseUrl) return null;

  const redirectUri = configuredRedirect ||
    new URL("/functions/v1/instagram-oauth-callback", supabaseUrl).toString();
  const parsed = new URL(redirectUri);
  if (parsed.protocol !== "https:" && parsed.hostname !== "localhost") return null;
  return { appId, appSecret, redirectUri: parsed.toString() };
}

function bytesToHex(bytes: Uint8Array): string {
  return Array.from(bytes, (byte) => byte.toString(16).padStart(2, "0")).join("");
}

async function sha256Hex(value: string): Promise<string> {
  const digest = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(value));
  return bytesToHex(new Uint8Array(digest));
}

async function readJson<T>(response: Response): Promise<T | null> {
  try {
    return await response.json() as T;
  } catch {
    return null;
  }
}

Deno.serve(
  // Instagram returns a browser redirect without a Supabase JWT. This endpoint
  // validates its own single-use OAuth state before it touches credentials.
  withSupabase({ auth: "none" }, async (req, ctx) => {
    if (req.method !== "GET") {
      return json({ error: "METHOD_NOT_ALLOWED" }, 405);
    }

    const meta = config();
    if (!meta) {
      return json({ error: "OAUTH_NOT_CONFIGURED" }, 503);
    }

    const callback = new URL(req.url);
    const state = callback.searchParams.get("state") ?? "";
    if (state.length < 32 || state.length > 256) {
      return json({ error: "INVALID_OAUTH_STATE" }, 400);
    }

    const stateHash = await sha256Hex(state);
    const { data: stateRows, error: stateError } = await ctx.supabaseAdmin.rpc(
      "consume_social_oauth_state",
      { p_state_hash: stateHash },
    );
    const storedState = (Array.isArray(stateRows) ? stateRows[0] : null) as OAuthState | null;

    if (stateError || !storedState) {
      console.warn("instagram-oauth-callback rejected state", {
        code: stateError?.code ?? "STATE_INVALID_OR_EXPIRED",
      });
      return appResult("invalid_state");
    }

    // Provider denial is handled only after consuming the state to prevent replay.
    if (callback.searchParams.has("error")) {
      return appResult("denied");
    }

    const rawCode = callback.searchParams.get("code") ?? "";
    const code = rawCode.replace(/#_$/, "");
    if (!code || code.length > 4096) {
      return appResult("missing_code");
    }

    let shortToken: string | null = null;
    try {
      const form = new FormData();
      form.set("client_id", meta.appId);
      form.set("client_secret", meta.appSecret);
      form.set("grant_type", "authorization_code");
      form.set("redirect_uri", meta.redirectUri);
      form.set("code", code);

      const shortResponse = await fetch("https://api.instagram.com/oauth/access_token", {
        method: "POST",
        body: form,
        signal: AbortSignal.timeout(10000),
      });
      const shortBody = await readJson<ShortTokenResponse>(shortResponse);
      if (!shortResponse.ok || typeof shortBody?.access_token !== "string" ||
          typeof shortBody.user_id !== "string" && typeof shortBody?.user_id !== "number") {
        return appResult("token_exchange_failed");
      }
      shortToken = shortBody.access_token;

      const longUrl = new URL("https://graph.instagram.com/access_token");
      longUrl.searchParams.set("grant_type", "ig_exchange_token");
      longUrl.searchParams.set("client_secret", meta.appSecret);
      longUrl.searchParams.set("access_token", shortToken);
      const longResponse = await fetch(longUrl, { signal: AbortSignal.timeout(10000) });
      const longBody = await readJson<LongTokenResponse>(longResponse);
      if (!longResponse.ok || typeof longBody?.access_token !== "string" ||
          typeof longBody.expires_in !== "number" || longBody.expires_in <= 0) {
        return appResult("long_lived_token_failed");
      }
      const accessToken = longBody.access_token;
      const tokenExpiresAt = new Date(Date.now() + longBody.expires_in * 1000).toISOString();

      // Query the official Instagram Login user endpoint. Tokens are passed to
      // Meta only; they are never added to logs, URLs on OrbitOS, or response bodies.
      const profileUrl = new URL("https://graph.instagram.com/me");
      profileUrl.searchParams.set("fields", "user_id,username,account_type");
      profileUrl.searchParams.set("access_token", accessToken);
      const profileResponse = await fetch(profileUrl, { signal: AbortSignal.timeout(10000) });
      const profileBody = await readJson<InstagramProfile>(profileResponse);
      if (!profileResponse.ok || !profileBody) {
        return appResult("profile_lookup_failed");
      }

      const externalAccountId = String(profileBody.user_id ?? profileBody.id ?? "").trim();
      if (!externalAccountId || externalAccountId.length > 256) {
        return appResult("profile_lookup_failed");
      }

      const now = new Date().toISOString();
      const { data: account, error: accountError } = await ctx.supabaseAdmin
        .from("social_accounts")
        .upsert(
          {
            id: "social-instagram-" + crypto.randomUUID(),
            workspace_id: storedState.workspace_id,
            brand_id: storedState.brand_id,
            platform: "instagram",
            account_type: "profile",
            external_account_id: externalAccountId,
            handle: typeof profileBody.username === "string" ? profileBody.username : "",
            display_name: typeof profileBody.username === "string" ? profileBody.username : "Instagram account",
            profile_url: typeof profileBody.username === "string" && profileBody.username
              ? "https://www.instagram.com/" + encodeURIComponent(profileBody.username) + "/"
              : "",
            status: "pending",
            scopes: [...REQUESTED_SCOPES],
            metadata: {
              provider: "instagram_login",
              accountType: typeof profileBody.account_type === "string" ? profileBody.account_type : null,
              tokenExpiresAt,
            },
            connected_at: now,
            updated_at: now,
          },
          { onConflict: "workspace_id,platform,external_account_id" },
        )
        .select("id")
        .single();

      if (accountError || !account?.id) {
        console.error("instagram-oauth-callback account upsert failed", {
          code: accountError?.code ?? "ACCOUNT_UPSERT_FAILED",
        });
        return appResult("account_save_failed");
      }

      const { data: secretSaved, error: secretError } = await ctx.supabaseAdmin.rpc(
        "store_social_account_secret",
        {
          p_social_account_id: account.id,
          p_secret_kind: "access",
          p_secret_value: accessToken,
        },
      );

      if (secretError || secretSaved !== true) {
        await ctx.supabaseAdmin
          .from("social_accounts")
          .update({ status: "reauth_required", updated_at: new Date().toISOString() })
          .eq("id", account.id);
        console.error("instagram-oauth-callback secure token storage failed", {
          code: secretError?.code ?? "TOKEN_STORAGE_FAILED",
        });
        return appResult("token_storage_failed");
      }

      const { error: connectedError } = await ctx.supabaseAdmin
        .from("social_accounts")
        .update({
          status: "connected",
          last_synced_at: new Date().toISOString(),
          updated_at: new Date().toISOString(),
        })
        .eq("id", account.id)
        .eq("workspace_id", storedState.workspace_id);

      if (connectedError) {
        await ctx.supabaseAdmin.rpc("delete_social_account_secrets", {
          p_social_account_id: account.id,
        });
        await ctx.supabaseAdmin
          .from("social_accounts")
          .update({ status: "reauth_required", updated_at: new Date().toISOString() })
          .eq("id", account.id);
        console.error("instagram-oauth-callback could not finalize connection", {
          code: connectedError.code ?? "CONNECTION_FINALIZE_FAILED",
        });
        return appResult("connection_finalize_failed");
      }

      return appResult("connected");
    } catch {
      // Never log raw provider exceptions or callback parameters; they can contain tokens.
      console.warn("instagram-oauth-callback provider exchange failed");
      return appResult("provider_request_failed");
    } finally {
      // Best effort only; JavaScript strings cannot be securely zeroed in memory.
      shortToken = null;
    }
  }),
);
