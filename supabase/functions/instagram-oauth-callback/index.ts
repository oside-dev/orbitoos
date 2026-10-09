import "jsr:@supabase/functions-js/edge-runtime.d.ts";
import { withSupabase } from "npm:@supabase/server";

type OAuthState = {
  user_id: string;
  workspace_id: string;
  brand_id: string | null;
  redirect_uri: string;
  app_return_url: string;
};

function textError(message: string, status: number): Response {
  return new Response(message, {
    status,
    headers: {
      "Content-Type": "text/plain; charset=utf-8",
      "Cache-Control": "no-store",
      "Referrer-Policy": "no-referrer",
      "X-Content-Type-Options": "nosniff",
    },
  });
}

function redirectToApp(
  state: OAuthState,
  outcome: "success" | "failed",
  reason: string,
  socialAccountId?: string,
): Response {
  const destination = new URL(state.app_return_url);
  destination.searchParams.set("social_connection", outcome);
  destination.searchParams.set("platform", "instagram");
  destination.searchParams.set("reason", reason);
  destination.searchParams.set("workspace_id", state.workspace_id);
  if (state.brand_id) destination.searchParams.set("brand_id", state.brand_id);
  if (socialAccountId) destination.searchParams.set("social_account_id", socialAccountId);

  return new Response(null, {
    status: 302,
    headers: {
      "Location": destination.toString(),
      "Cache-Control": "no-store",
      "Referrer-Policy": "no-referrer",
    },
  });
}

function isHttpsUrl(value: string): boolean {
  try {
    const url = new URL(value);
    return url.protocol === "https:" && url.username === "" && url.password === "";
  } catch {
    return false;
  }
}

async function sha256Hex(value: string): Promise<string> {
  const digest = await crypto.subtle.digest(
    "SHA-256",
    new TextEncoder().encode(value),
  );
  return Array.from(new Uint8Array(digest))
    .map((byte) => byte.toString(16).padStart(2, "0"))
    .join("");
}

async function readJson(response: Response): Promise<Record<string, unknown>> {
  try {
    const value = await response.json();
    return value && typeof value === "object" && !Array.isArray(value)
      ? value as Record<string, unknown>
      : {};
  } catch {
    return {};
  }
}

function grantedScopes(payload: Record<string, unknown>): string[] {
  const permissions = payload.permissions;
  let values: string[] = [];

  if (Array.isArray(permissions)) {
    values = permissions.flatMap((permission) => {
      if (typeof permission === "string") return [permission];
      if (!permission || typeof permission !== "object") return [];
      const item = permission as Record<string, unknown>;
      const name = typeof item.permission === "string" ? item.permission : "";
      const status = typeof item.status === "string" ? item.status.toLowerCase() : "granted";
      return name && status !== "declined" && status !== "expired" ? [name] : [];
    });
  } else if (typeof payload.scope === "string") {
    values = payload.scope.split(/[\s,]+/);
  }

  return [...new Set(values.map((item) => item.trim()).filter(Boolean))];
}

function hasRequiredScopes(scopes: string[]): boolean {
  return scopes.includes("instagram_business_basic") &&
    scopes.includes("instagram_business_content_publish");
}

async function exchangeCode(
  code: string,
  appId: string,
  appSecret: string,
  redirectUri: string,
): Promise<Record<string, unknown> | null> {
  const body = new URLSearchParams({
    client_id: appId,
    client_secret: appSecret,
    grant_type: "authorization_code",
    redirect_uri: redirectUri,
    code,
  });

  const response = await fetch("https://api.instagram.com/oauth/access_token", {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body,
    signal: AbortSignal.timeout(10_000),
  });

  const result = await readJson(response);
  return response.ok && typeof result.access_token === "string" ? result : null;
}

async function exchangeLongLivedToken(
  shortLivedToken: string,
  appSecret: string,
): Promise<Record<string, unknown> | null> {
  const url = new URL("https://graph.instagram.com/access_token");
  url.searchParams.set("grant_type", "ig_exchange_token");
  url.searchParams.set("client_secret", appSecret);
  url.searchParams.set("access_token", shortLivedToken);

  const response = await fetch(url, { signal: AbortSignal.timeout(10_000) });
  const result = await readJson(response);
  return response.ok &&
      typeof result.access_token === "string" &&
      Number(result.expires_in) > 0
    ? result
    : null;
}

async function getInstagramProfile(
  accessToken: string,
): Promise<{ id: string; username: string } | null> {
  const url = new URL("https://graph.instagram.com/me");
  url.searchParams.set("fields", "id,username");

  const response = await fetch(url, {
    headers: { Authorization: `Bearer ${accessToken}` },
    signal: AbortSignal.timeout(10_000),
  });
  const result = await readJson(response);
  const id = typeof result.id === "string" || typeof result.id === "number"
    ? String(result.id)
    : typeof result.user_id === "string" || typeof result.user_id === "number"
    ? String(result.user_id)
    : "";
  const username = typeof result.username === "string" ? result.username : "";

  if (!response.ok || !/^[0-9]{1,64}$/.test(id) ||
      !/^[A-Za-z0-9._]{1,30}$/.test(username)) {
    return null;
  }

  return { id, username };
}

Deno.serve(
  withSupabase({ auth: "none" }, async (req, ctx) => {
    if (req.method !== "GET") return textError("Method not allowed.", 405);

    const requestUrl = new URL(req.url);
    const state = requestUrl.searchParams.get("state") ?? "";
    if (!/^[A-Za-z0-9_-]{40,64}$/.test(state)) {
      return textError("The Instagram connection request is invalid or expired.", 400);
    }

    const appId = Deno.env.get("INSTAGRAM_APP_ID")?.trim() ?? "";
    const appSecret = Deno.env.get("INSTAGRAM_APP_SECRET")?.trim() ?? "";
    const configuredRedirectUri = Deno.env.get("INSTAGRAM_REDIRECT_URI")?.trim() ?? "";
    const appUrl = Deno.env.get("ORBITOOS_APP_URL")?.trim() ?? "";
    if (
      !appId ||
      !appSecret ||
      !isHttpsUrl(configuredRedirectUri) ||
      !isHttpsUrl(appUrl)
    ) {
      return textError("Instagram connection is not configured.", 503);
    }

    const { data: stateRows, error: stateError } = await ctx.supabaseAdmin.rpc(
      "consume_social_oauth_state",
      { p_state_hash: await sha256Hex(state) },
    );

    const savedState = Array.isArray(stateRows) ? stateRows[0] : null;
    if (stateError || !savedState) {
      return textError("The Instagram connection request is invalid or expired.", 400);
    }

    const oauthState = savedState as OAuthState;
    // The redirect URI is fixed by server configuration, not supplied by the caller.
    if (
      oauthState.redirect_uri !== configuredRedirectUri ||
      new URL(oauthState.app_return_url).origin !== new URL(appUrl).origin
    ) {
      return redirectToApp(oauthState, "failed", "invalid_configuration");
    }

    if (requestUrl.searchParams.has("error")) {
      return redirectToApp(oauthState, "failed", "authorization_denied");
    }

    const rawCode = requestUrl.searchParams.get("code") ?? "";
    const code = rawCode.endsWith("#_") ? rawCode.slice(0, -2) : rawCode;
    if (!code || code.length > 4096) {
      return redirectToApp(oauthState, "failed", "invalid_callback");
    }

    try {
      const shortToken = await exchangeCode(
        code,
        appId,
        appSecret,
        oauthState.redirect_uri,
      );
      if (!shortToken || typeof shortToken.access_token !== "string") {
        return redirectToApp(oauthState, "failed", "token_exchange_failed");
      }

      const scopes = grantedScopes(shortToken);
      if (!hasRequiredScopes(scopes)) {
        return redirectToApp(oauthState, "failed", "required_permissions_missing");
      }

      const longToken = await exchangeLongLivedToken(shortToken.access_token, appSecret);
      if (!longToken || typeof longToken.access_token !== "string") {
        return redirectToApp(oauthState, "failed", "long_lived_token_exchange_failed");
      }

      const profile = await getInstagramProfile(longToken.access_token);
      if (!profile) {
        return redirectToApp(oauthState, "failed", "profile_lookup_failed");
      }

      const expiresIn = Number(longToken.expires_in);
      if (!Number.isFinite(expiresIn) || expiresIn < 3600 || expiresIn > 90 * 24 * 3600) {
        return redirectToApp(oauthState, "failed", "invalid_token_expiry");
      }
      const tokenExpiresAt = new Date(Date.now() + expiresIn * 1000).toISOString();

      const { data: account, error: saveError } = await ctx.supabaseAdmin.rpc(
        "persist_instagram_connection",
        {
          p_user_id: oauthState.user_id,
          p_workspace_id: oauthState.workspace_id,
          p_brand_id: oauthState.brand_id,
          p_instagram_user_id: profile.id,
          p_username: profile.username,
          p_scopes: scopes,
          p_access_token: longToken.access_token,
          p_token_expires_at: tokenExpiresAt,
        },
      );

      if (saveError || !account || typeof account.socialAccountId !== "string") {
        // Never log database errors that could contain sensitive arguments.
        return redirectToApp(oauthState, "failed", "secure_token_storage_failed");
      }

      return redirectToApp(
        oauthState,
        "success",
        "connected",
        account.socialAccountId,
      );
    } catch {
      // Do not log provider payloads, error bodies, or token-bearing URLs.
      return redirectToApp(oauthState, "failed", "connection_failed");
    }
  }),
);
