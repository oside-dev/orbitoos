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
    : "RECONCILIATION_FAILED";
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
    if (!operatorId) {
      return json(req, { error: "AUTH_REQUIRED" }, 401);
    }

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

    // The operator identity is always derived from the verified user session,
    // never accepted from a request field.
    const jobId = typeof body.jobId === "string" ? body.jobId.trim() : "";
    const resolution = typeof body.resolution === "string" ? body.resolution.trim() : "";
    const providerPostId = typeof body.providerPostId === "string" ? body.providerPostId.trim() : "";
    const evidenceReference = typeof body.evidenceReference === "string"
      ? body.evidenceReference.trim()
      : "";
    const notes = typeof body.notes === "string" ? body.notes : "";

    if (!jobId || jobId.length > 256) {
      return json(req, { error: "JOB_ID_REQUIRED" }, 400);
    }
    if (!["confirmed_published", "closed_without_retry"].includes(resolution)) {
      return json(req, { error: "INVALID_RESOLUTION" }, 400);
    }
    if (
      evidenceReference.length < 3 ||
      evidenceReference.length > 500 ||
      notes.length > 1000 ||
      providerPostId.length > 512
    ) {
      return json(req, { error: "RECONCILIATION_INPUT_INVALID" }, 400);
    }
    if (resolution === "confirmed_published" && !providerPostId) {
      return json(req, { error: "PROVIDER_POST_ID_REQUIRED" }, 400);
    }
    if (resolution === "closed_without_retry" && providerPostId) {
      return json(req, { error: "PROVIDER_POST_ID_NOT_ALLOWED" }, 400);
    }

    const { data: job, error: jobError } = await ctx.supabaseAdmin
      .from("publishing_jobs")
      .select("id, workspace_id")
      .eq("id", jobId)
      .maybeSingle();

    if (jobError) {
      console.error("publishing-reconciliation job lookup failed", {
        code: safeCode(jobError.code),
      });
      return json(req, { error: "RECONCILIATION_LOOKUP_FAILED" }, 500);
    }
    if (!job) {
      return json(req, { error: "JOB_NOT_FOUND_OR_NOT_AUTHORIZED" }, 404);
    }

    const { data: membership, error: membershipError } = await ctx.supabaseAdmin
      .from("workspace_members")
      .select("role")
      .eq("workspace_id", job.workspace_id)
      .eq("user_id", operatorId)
      .maybeSingle();

    if (membershipError) {
      console.error("publishing-reconciliation membership check failed", {
        code: safeCode(membershipError.code),
      });
      return json(req, { error: "RECONCILIATION_AUTHORIZATION_FAILED" }, 500);
    }
    if (!membership || !["owner", "admin"].includes(String(membership.role))) {
      return json(req, { error: "JOB_NOT_FOUND_OR_NOT_AUTHORIZED" }, 404);
    }

    const { data: result, error: reconcileError } = await ctx.supabaseAdmin.rpc(
      "reconcile_unknown_publishing_job",
      {
        p_job_id: jobId,
        p_operator_id: operatorId,
        p_resolution: resolution,
        p_provider_post_id: providerPostId || null,
        p_evidence_reference: evidenceReference,
        p_notes: notes,
      },
    );

    if (reconcileError) {
      const code = safeCode(reconcileError.code);
      if (code === "P0002") return json(req, { error: "JOB_NOT_FOUND" }, 404);
      if (code === "42501") return json(req, { error: "RECONCILIATION_FORBIDDEN" }, 403);
      if (code === "55000") return json(req, { error: "JOB_NOT_RECONCILABLE" }, 409);
      if (code === "22023") return json(req, { error: "RECONCILIATION_INPUT_INVALID" }, 400);
      console.error("publishing-reconciliation RPC failed", { jobId, code });
      return json(req, { error: "RECONCILIATION_FAILED" }, 500);
    }

    return json(req, { ok: true, result });
  }),
);
