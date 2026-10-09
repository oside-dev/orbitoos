import "jsr:@supabase/functions-js/edge-runtime.d.ts";
import { withSupabase } from "npm:@supabase/server";

const DEFAULT_APP_URL = "https://orbitoos.vercel.app";

function appUrlStatus(): { origin: string; valid: boolean } {
  const raw = Deno.env.get("ORBITOS_APP_URL")?.trim() || DEFAULT_APP_URL;
  try {
    const parsed = new URL(raw);
    return {
      origin: parsed.origin,
      valid: (parsed.protocol === "https:" || parsed.hostname === "localhost") &&
        !parsed.username && !parsed.password,
    };
  } catch {
    return { origin: new URL(DEFAULT_APP_URL).origin, valid: false };
  }
}

function responseHeaders(req: Request): Headers {
  const headers = new Headers({ "Cache-Control": "no-store", "Vary": "Origin" });
  const origin = req.headers.get("Origin");
  if (origin && origin === appUrlStatus().origin) {
    headers.set("Access-Control-Allow-Origin", origin);
    headers.set("Access-Control-Allow-Headers", "authorization, x-client-info, apikey, content-type");
    headers.set("Access-Control-Allow-Methods", "POST, OPTIONS");
  }
  return headers;
}

function json(req: Request, body: Record<string, unknown>, status = 200): Response {
  return Response.json(body, { status, headers: responseHeaders(req) });
}

function configured(name: string): boolean {
  return Boolean(Deno.env.get(name)?.trim());
}

function exactTrue(name: string): boolean {
  return Deno.env.get(name)?.trim().toLowerCase() === "true";
}

function redirectUriStatus(): { explicitlyConfigured: boolean; valid: boolean } {
  const supabaseUrl = Deno.env.get("SUPABASE_URL")?.trim();
  if (!supabaseUrl) {
    return { explicitlyConfigured: configured("META_INSTAGRAM_REDIRECT_URI"), valid: false };
  }
  try {
    const raw = Deno.env.get("META_INSTAGRAM_REDIRECT_URI")?.trim();
    const redirectUri = raw || new URL("/functions/v1/instagram-oauth-callback", supabaseUrl).toString();
    const parsed = new URL(redirectUri);
    return {
      explicitlyConfigured: Boolean(raw),
      valid: (parsed.protocol === "https:" || parsed.hostname === "localhost") &&
        !parsed.username && !parsed.password,
    };
  } catch {
    return { explicitlyConfigured: configured("META_INSTAGRAM_REDIRECT_URI"), valid: false };
  }
}

Deno.serve(
  withSupabase({ auth: "user" }, async (req, ctx) => {
    if (req.method === "OPTIONS") {
      const headers = responseHeaders(req);
      if (!headers.has("Access-Control-Allow-Origin")) {
        return new Response("Forbidden origin", { status: 403, headers });
      }
      return new Response("ok", { headers });
    }
    if (req.method !== "POST") {
      return json(req, { error: "METHOD_NOT_ALLOWED" }, 405);
    }

    const operatorId = ctx.userClaims?.id ?? ctx.jwtClaims?.sub;
    if (!operatorId) return json(req, { error: "AUTH_REQUIRED" }, 401);

    let body: Record<string, unknown>;
    try {
      const value = await req.json();
      if (!value || typeof value !== "object" || Array.isArray(value)) {
        return json(req, { error: "INVALID_REQUEST" }, 400);
      }
      body = value as Record<string, unknown>;
    } catch {
      return json(req, { error: "INVALID_REQUEST" }, 400);
    }

    const workspaceId = typeof body.workspaceId === "string" ? body.workspaceId.trim() : "";
    if (!workspaceId || workspaceId.length > 256) {
      return json(req, { error: "WORKSPACE_ID_REQUIRED" }, 400);
    }

    const { data: membership, error: membershipError } = await ctx.supabaseAdmin
      .from("workspace_members")
      .select("role")
      .eq("workspace_id", workspaceId)
      .eq("user_id", operatorId)
      .maybeSingle();

    if (membershipError) {
      console.error("instagram-integration-readiness membership check failed", {
        code: typeof membershipError.code === "string" && /^[A-Z0-9_]{1,64}$/.test(membershipError.code)
          ? membershipError.code
          : "MEMBERSHIP_CHECK_FAILED",
      });
      return json(req, { error: "WORKSPACE_CHECK_FAILED" }, 500);
    }
    if (!membership || !["owner", "admin"].includes(String(membership.role))) {
      return json(req, { error: "WORKSPACE_ADMIN_REQUIRED" }, 403);
    }

    const appIdConfigured = configured("META_INSTAGRAM_APP_ID");
    const appSecretConfigured = configured("META_INSTAGRAM_APP_SECRET");
    const supabaseUrlConfigured = configured("SUPABASE_URL");
    const redirect = redirectUriStatus();
    const appUrl = appUrlStatus();
    const oauthConfigured = appIdConfigured && appSecretConfigured &&
      supabaseUrlConfigured && redirect.valid && appUrl.valid;

    return json(req, {
      ok: true,
      readiness: {
        oauth: {
          configured: oauthConfigured,
          appIdConfigured,
          appSecretConfigured,
          supabaseUrlConfigured,
          redirectUriExplicitlyConfigured: redirect.explicitlyConfigured,
          redirectUriValid: redirect.valid,
          appUrlValid: appUrl.valid,
        },
        tokenRefresh: {
          enabled: exactTrue("ORBITOS_INSTAGRAM_REFRESH_ENABLED"),
          appSecretConfigured,
        },
        publishing: {
          globalEnabled: exactTrue("ORBITOS_PUBLISHING_ENABLED"),
          instagramAdapterEnabled: exactTrue("ORBITOS_INSTAGRAM_PUBLISHING_ADAPTER_ENABLED"),
          graphApiVersionConfigured: configured("META_GRAPH_API_VERSION"),
        },
      },
    });
  }),
);
