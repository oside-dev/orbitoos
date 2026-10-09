import "jsr:@supabase/functions-js/edge-runtime.d.ts";
import { withSupabase } from "npm:@supabase/server";

const REQUIRED_SCOPES = [
  "instagram_business_basic",
  "instagram_business_content_publish",
] as const;

function jsonResponse(
  body: Record<string, unknown>,
  status: number,
  origin: string,
): Response {
  return Response.json(body, {
    status,
    headers: {
      "Access-Control-Allow-Origin": origin,
      "Access-Control-Allow-Methods": "POST, OPTIONS",
      "Access-Control-Allow-Headers": "authorization, apikey, content-type, x-client-info",
      "Vary": "Origin",
      "Cache-Control": "no-store",
      "X-Content-Type-Options": "nosniff",
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

function randomState(): string {
  const bytes = crypto.getRandomValues(new Uint8Array(32));
  let binary = "";
  for (const byte of bytes) binary += String.fromCharCode(byte);
  return btoa(binary).replaceAll("+", "-").replaceAll("/", "_").replaceAll("=", "");
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

Deno.serve(
  withSupabase({ auth: "user" }, async (req, ctx) => {
    const appUrl = Deno.env.get("ORBITOOS_APP_URL")?.trim() ?? "";
    const appId = Deno.env.get("INSTAGRAM_APP_ID")?.trim() ?? "";
    const appSecret = Deno.env.get("INSTAGRAM_APP_SECRET")?.trim() ?? "";
    const redirectUri = Deno.env.get("INSTAGRAM_REDIRECT_URI")?.trim() ?? "";

    let appOrigin = "https://orbitoos.vercel.app";
    if (isHttpsUrl(appUrl)) appOrigin = new URL(appUrl).origin;

    const origin = req.headers.get("origin") ?? "";
    if (origin && origin !== appOrigin) {
      return jsonResponse({ error: "ORIGIN_NOT_ALLOWED" }, 403, appOrigin);
    }

    if (req.method === "OPTIONS") {
      return new Response(null, {
        status: 204,
        headers: {
          "Access-Control-Allow-Origin": appOrigin,
          "Access-Control-Allow-Methods": "POST, OPTIONS",
          "Access-Control-Allow-Headers": "authorization, apikey, content-type, x-client-info",
          "Vary": "Origin",
          "Cache-Control": "no-store",
        },
      });
    }

    if (req.method !== "POST") {
      return jsonResponse({ error: "METHOD_NOT_ALLOWED" }, 405, appOrigin);
    }

    if (
      !appId ||
      !appSecret ||
      !isHttpsUrl(appUrl) ||
      !isHttpsUrl(redirectUri) ||
      !new URL(redirectUri).pathname.endsWith("/functions/v1/instagram-oauth-callback")
    ) {
      return jsonResponse({ error: "INSTAGRAM_OAUTH_NOT_CONFIGURED" }, 503, appOrigin);
    }

    const userId = String(ctx.userClaims?.sub ?? "");
    if (!userId) {
      return jsonResponse({ error: "AUTH_REQUIRED" }, 401, appOrigin);
    }

    let body: Record<string, unknown>;
    try {
      const parsed = await req.json();
      if (!parsed || typeof parsed !== "object" || Array.isArray(parsed)) {
        return jsonResponse({ error: "INVALID_REQUEST" }, 400, appOrigin);
      }
      body = parsed as Record<string, unknown>;
    } catch {
      return jsonResponse({ error: "INVALID_JSON" }, 400, appOrigin);
    }

    const workspaceId = typeof body.workspaceId === "string"
      ? body.workspaceId.trim()
      : "";
    const brandId = typeof body.brandId === "string" && body.brandId.trim()
      ? body.brandId.trim()
      : null;

    if (!workspaceId || workspaceId.length > 128 || (brandId && brandId.length > 128)) {
      return jsonResponse({ error: "WORKSPACE_REQUIRED" }, 400, appOrigin);
    }

    const state = randomState();
    const stateHash = await sha256Hex(state);
    const expiresAt = new Date(Date.now() + 10 * 60 * 1000).toISOString();

    const { error: stateError } = await ctx.supabaseAdmin.rpc(
      "create_social_oauth_state",
      {
        p_state_hash: stateHash,
        p_user_id: userId,
        p_workspace_id: workspaceId,
        p_brand_id: brandId,
        p_redirect_uri: redirectUri,
        p_app_return_url: appUrl,
        p_expires_at: expiresAt,
      },
    );

    if (stateError) {
      // Don't return SQL or provider details to the browser.
      return jsonResponse({ error: "OAUTH_STATE_CREATION_FAILED" }, 400, appOrigin);
    }

    const authorizeUrl = new URL("https://www.instagram.com/oauth/authorize");
    authorizeUrl.searchParams.set("client_id", appId);
    authorizeUrl.searchParams.set("redirect_uri", redirectUri);
    authorizeUrl.searchParams.set("response_type", "code");
    authorizeUrl.searchParams.set("scope", REQUIRED_SCOPES.join(","));
    authorizeUrl.searchParams.set("state", state);
    authorizeUrl.searchParams.set("enable_fb_login", "0");
    authorizeUrl.searchParams.set("force_authentication", "1");

    return jsonResponse(
      {
        authorizationUrl: authorizeUrl.toString(),
        expiresInSeconds: 600,
        provider: "instagram",
      },
      200,
      appOrigin,
    );
  }),
);
