import "jsr:@supabase/functions-js/edge-runtime.d.ts";
import { withSupabase } from "npm:@supabase/server";

const DEFAULT_APP_URL = "https://orbitoos.vercel.app";

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

function safeCode(value: unknown): string {
  return typeof value === "string" && /^[A-Z0-9_]{1,64}$/.test(value)
    ? value
    : "PUBLISHING_OPERATIONS_FAILED";
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

    const workspaceId = typeof body.workspaceId === "string"
      ? body.workspaceId.trim()
      : "";
    if (!workspaceId || workspaceId.length > 256) {
      return json(req, { error: "WORKSPACE_ID_REQUIRED" }, 400);
    }

    // Check the workspace role before calling the privileged, read-only RPC.
    const { data: membership, error: membershipError } = await ctx.supabaseAdmin
      .from("workspace_members")
      .select("role")
      .eq("workspace_id", workspaceId)
      .eq("user_id", operatorId)
      .maybeSingle();

    if (membershipError) {
      console.error("publishing-operations membership check failed", {
        code: safeCode(membershipError.code),
      });
      return json(req, { error: "PUBLISHING_OPERATIONS_AUTHORIZATION_FAILED" }, 500);
    }
    if (!membership || !["owner", "admin"].includes(String(membership.role))) {
      return json(req, { error: "WORKSPACE_ADMIN_REQUIRED" }, 403);
    }

    const { data: operations, error: operationsError } = await ctx.supabaseAdmin.rpc(
      "get_publishing_operations_overview",
      {
        p_workspace_id: workspaceId,
        p_operator_id: operatorId,
      },
    );

    if (operationsError) {
      const code = safeCode(operationsError.code);
      if (code === "42501") return json(req, { error: "WORKSPACE_ADMIN_REQUIRED" }, 403);
      if (code === "22023") return json(req, { error: "INVALID_REQUEST" }, 400);
      console.error("publishing-operations RPC failed", { code });
      return json(req, { error: "PUBLISHING_OPERATIONS_FAILED" }, 500);
    }

    return json(req, { ok: true, operations });
  }),
);
