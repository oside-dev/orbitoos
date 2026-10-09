import "jsr:@supabase/functions-js/edge-runtime.d.ts";
import { withSupabase } from "npm:@supabase/server";

const DEFAULT_APP_URL = "https://orbitoos.vercel.app";
const REQUESTED_SCOPES = [
  "instagram_business_basic",
  "instagram_business_content_publish",
] as const;

function allowedOrigin(): string {
  const raw = Deno.env.get("ORBITOS_APP_URL") ?? DEFAULT_APP_URL;
  return new URL(raw).origin;
}

function responseHeaders(req: Request): Headers {
  const headers = new Headers({
    "Cache-Control": "no-store",
    "Vary": "Origin",
  });
  const origin = req.headers.get("Origin");
  if (origin && origin === allowedOrigin()) {
    headers.set("Access-Control-Allow-Origin", origin);
    headers.set("Access-Control-Allow-Headers", "authorization, x-client-info, apikey, content-type");
    headers.set("Access-Control-Allow-Methods", "POST, OPTIONS");
  }
  return headers;
}

function json(req: Request, body: Record<string, unknown>, status = 200): Response {
  return Response.json(body, { status, headers: responseHeaders(req) });
}

function bytesToHex(bytes: Uint8Array): string {
  return Array.from(bytes, (byte) => byte.toString(16).padStart(2, "0")).join("");
}

async function sha256Hex(value: string): Promise<string> {
  const digest = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(value));
  return bytesToHex(new Uint8Array(digest));
}

function createState(): string {
  const bytes = new Uint8Array(32);
  crypto.getRandomValues(bytes);
  // 32 bytes of cryptographic randomness, hex-encoded; the DB stores only its hash.
  return bytesToHex(bytes);
}

function config(): { appId: string; redirectUri: string } | null {
  const appId = Deno.env.get("META_INSTAGRAM_APP_ID")?.trim();
  const appSecret = Deno.env.get("META_INSTAGRAM_APP_SECRET")?.trim();
  const supabaseUrl = Deno.env.get("SUPABASE_URL")?.trim();
  const configuredRedirect = Deno.env.get("META_INSTAGRAM_REDIRECT_URI")?.trim();
  if (!appId || !appSecret || !supabaseUrl) return null;

  const redirectUri = configuredRedirect ||
    new URL("/functions/v1/instagram-oauth-callback", supabaseUrl).toString();
  const parsed = new URL(redirectUri);
  if (parsed.protocol !== "https:" && parsed.hostname !== "localhost") return null;
  return { appId, redirectUri: parsed.toString() };
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

    const userId = ctx.userClaims?.sub;
    if (!userId) {
      return json(req, { error: "AUTH_REQUIRED" }, 401);
    }

    // Fail closed until the operator has configured the Meta app server-side.
    const meta = config();
    if (!meta) {
      return json(req, { error: "OAUTH_NOT_CONFIGURED" }, 503);
    }

    let body: { workspaceId?: unknown; brandId?: unknown };
    try {
      body = await req.json();
    } catch {
      return json(req, { error: "INVALID_REQUEST" }, 400);
    }

    const workspaceId = typeof body.workspaceId === "string" ? body.workspaceId.trim() : "";
    const brandId = typeof body.brandId === "string" ? body.brandId.trim() : "";
    if (!workspaceId || !brandId || workspaceId.length > 256 || brandId.length > 256) {
      return json(req, { error: "WORKSPACE_AND_BRAND_REQUIRED" }, 400);
    }

    const { data: membership, error: membershipError } = await ctx.supabaseAdmin
      .from("workspace_members")
      .select("role")
      .eq("workspace_id", workspaceId)
      .eq("user_id", userId)
      .maybeSingle();

    if (membershipError) {
      console.error("instagram-oauth-start membership check failed", {
        code: membershipError.code ?? "MEMBERSHIP_CHECK_FAILED",
      });
      return json(req, { error: "WORKSPACE_CHECK_FAILED" }, 500);
    }
    if (!membership || !["owner", "admin"].includes(String(membership.role))) {
      return json(req, { error: "WORKSPACE_ADMIN_REQUIRED" }, 403);
    }

    const { data: brand, error: brandError } = await ctx.supabaseAdmin
      .from("brands")
      .select("id")
      .eq("id", brandId)
      .eq("workspace_id", workspaceId)
      .maybeSingle();

    if (brandError) {
      console.error("instagram-oauth-start brand check failed", {
        code: brandError.code ?? "BRAND_CHECK_FAILED",
      });
      return json(req, { error: "BRAND_CHECK_FAILED" }, 500);
    }
    if (!brand) {
      return json(req, { error: "BRAND_NOT_IN_WORKSPACE" }, 403);
    }

    const state = createState();
    const stateHash = await sha256Hex(state);
    const expiresAt = new Date(Date.now() + 10 * 60 * 1000).toISOString();
    const { data: created, error: stateError } = await ctx.supabaseAdmin.rpc(
      "create_social_oauth_state",
      {
        p_state_hash: stateHash,
        p_user_id: userId,
        p_workspace_id: workspaceId,
        p_brand_id: brandId,
        p_expires_at: expiresAt,
      },
    );

    if (stateError || created !== true) {
      console.error("instagram-oauth-start state creation failed", {
        code: stateError?.code ?? "STATE_CREATE_FAILED",
      });
      return json(req, { error: "OAUTH_STATE_CREATE_FAILED" }, 500);
    }

    const authorizationUrl = new URL("https://www.instagram.com/oauth/authorize");
    authorizationUrl.searchParams.set("client_id", meta.appId);
    authorizationUrl.searchParams.set("redirect_uri", meta.redirectUri);
    authorizationUrl.searchParams.set("response_type", "code");
    authorizationUrl.searchParams.set("scope", REQUESTED_SCOPES.join(","));
    authorizationUrl.searchParams.set("state", state);

    return json(req, {
      authorizationUrl: authorizationUrl.toString(),
      expiresAt,
    });
  }),
);
