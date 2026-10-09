import "jsr:@supabase/functions-js/edge-runtime.d.ts";
import { createClient } from "npm:@supabase/supabase-js@2";

const PROJECT_URL = Deno.env.get("SUPABASE_URL") ?? "";
const SERVICE_KEY =
  Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") ??
  Deno.env.get("SUPABASE_SECRET_KEY") ??
  "";

const admin =
  PROJECT_URL && SERVICE_KEY
    ? createClient(PROJECT_URL, SERVICE_KEY, {
        auth: {
          autoRefreshToken: false,
          persistSession: false,
          detectSessionInUrl: false,
        },
      })
    : null;

function json(body: Record<string, unknown>, status = 200): Response {
  return Response.json(body, {
    status,
    headers: {
      "Cache-Control": "no-store",
      "Content-Type": "application/json; charset=utf-8",
    },
  });
}

function bearerToken(req: Request): string | null {
  const value = req.headers.get("Authorization") ?? "";
  const match = /^Bearer\s+([^\s]+)$/i.exec(value);
  return match?.[1] ?? null;
}

async function safeJson(response: Response): Promise<Record<string, unknown> | null> {
  try {
    const value: unknown = await response.json();
    return value !== null && typeof value === "object" && !Array.isArray(value)
      ? value as Record<string, unknown>
      : null;
  } catch {
    return null;
  }
}

Deno.serve(async (req: Request): Promise<Response> => {
  if (req.method !== "POST") {
    return json({ error: "METHOD_NOT_ALLOWED" }, 405);
  }

  const token = bearerToken(req);
  if (!token || token.length < 32 || token.length > 256) {
    return json({ error: "AUTH_REQUIRED" }, 401);
  }

  if (!admin || !PROJECT_URL || !SERVICE_KEY) {
    return json({ error: "SCHEDULER_CONFIGURATION_UNAVAILABLE" }, 503);
  }

  // This endpoint is invoked by pg_cron. A random, Vault-held token is
  // verified server-side; the token is never logged or returned.
  const { data: authorized, error: authError } = await admin.rpc(
    "verify_orbitoos_publishing_scheduler_token",
    { p_candidate: token },
  );

  if (authError) {
    console.error("publishing-scheduler authorization check failed", {
      code: authError.code ?? "AUTH_CHECK_FAILED",
    });
    return json({ error: "SCHEDULER_AUTHORIZATION_UNAVAILABLE" }, 503);
  }
  if (authorized !== true) {
    return json({ error: "AUTH_REQUIRED" }, 401);
  }

  // Fail closed by default. Scheduling may run, but publishing stays off
  // unless an operator explicitly enables the worker after preflight.
  if (Deno.env.get("ORBITOS_PUBLISHING_ENABLED") !== "true") {
    return json({ ok: true, skipped: "PUBLISHING_DISABLED" });
  }

  const { data: leaseToken, error: leaseError } = await admin.rpc(
    "claim_orbitoos_publishing_scheduler_lease",
    { p_lease_seconds: 240 },
  );

  if (leaseError) {
    console.error("publishing-scheduler lease claim failed", {
      code: leaseError.code ?? "LEASE_CLAIM_FAILED",
    });
    return json({ error: "SCHEDULER_LEASE_UNAVAILABLE" }, 503);
  }
  if (typeof leaseToken !== "string" || leaseToken.length === 0) {
    return json({ ok: true, skipped: "ANOTHER_INVOCATION_ACTIVE" });
  }

  // A timeout leaves the lease to expire naturally. Releasing it immediately
  // after an ambiguous network timeout could allow overlapping worker calls.
  let releaseLease = true;
  try {
    const workerResponse = await fetch(
      PROJECT_URL.replace(/\/$/, "") + "/functions/v1/publishing-worker",
      {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "Authorization": "Bearer " + SERVICE_KEY,
          "apikey": SERVICE_KEY,
        },
        body: "{}",
        signal: AbortSignal.timeout(180_000),
      },
    );

    const workerBody = await safeJson(workerResponse);
    const workerError = typeof workerBody?.error === "string"
      ? workerBody.error
      : "";

    // These are expected fail-closed conditions while provider setup or the
    // global/adapter switches are not ready. Do not treat them as publishes.
    if (
      workerResponse.status === 503 &&
      ["PUBLISHING_DISABLED", "NO_OFFICIAL_ADAPTER_CONFIGURED"].includes(workerError)
    ) {
      return json({ ok: true, skipped: workerError });
    }

    if (!workerResponse.ok) {
      console.error("publishing-scheduler worker rejected dispatch", {
        status: workerResponse.status,
        code: /^[A-Z0-9_]{1,64}$/.test(workerError)
          ? workerError
          : "WORKER_REQUEST_FAILED",
      });
      return json({ error: "PUBLISHING_WORKER_UNAVAILABLE" }, 502);
    }

    const claimed = Number(workerBody?.claimed ?? 0);
    return json({
      ok: true,
      dispatched: true,
      claimed: Number.isSafeInteger(claimed) && claimed >= 0 ? claimed : 0,
    });
  } catch {
    releaseLease = false;
    console.error("publishing-scheduler worker request failed; lease retained until expiry");
    return json({ error: "PUBLISHING_WORKER_UNAVAILABLE" }, 502);
  } finally {
    if (releaseLease) {
      const { error } = await admin.rpc(
        "release_orbitoos_publishing_scheduler_lease",
        { p_lease_token: leaseToken },
      );
      if (error) {
        console.error("publishing-scheduler lease release failed", {
          code: error.code ?? "LEASE_RELEASE_FAILED",
        });
      }
    }
  }
});
