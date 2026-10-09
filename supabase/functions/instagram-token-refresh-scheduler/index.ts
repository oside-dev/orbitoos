import "jsr:@supabase/functions-js/edge-runtime.d.ts";

const PROJECT_URL = Deno.env.get("SUPABASE_URL") ?? "";
const BASE_URL = PROJECT_URL.endsWith("/") ? PROJECT_URL.slice(0, -1) : PROJECT_URL;
const SERVICE_KEY =
  Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") ??
  Deno.env.get("SUPABASE_SECRET_KEY") ??
  "";

type RpcResult = { data: unknown; errorCode: string | null };

async function callRpc(name: string, args: Record<string, unknown>): Promise<RpcResult> {
  if (!PROJECT_URL || !SERVICE_KEY) {
    return { data: null, errorCode: "SCHEDULER_CONFIGURATION_UNAVAILABLE" };
  }

  try {
    const response = await fetch(
      BASE_URL + "/rest/v1/rpc/" + encodeURIComponent(name),
      {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "Authorization": "Bearer " + SERVICE_KEY,
          "apikey": SERVICE_KEY,
        },
        body: JSON.stringify(args),
        signal: AbortSignal.timeout(10_000),
      },
    );

    if (!response.ok) {
      let errorCode = "RPC_REQUEST_FAILED";
      try {
        const value: unknown = await response.json();
        if (
          value !== null &&
          typeof value === "object" &&
          "code" in value &&
          typeof value.code === "string" &&
          /^[A-Z0-9_]{1,64}$/.test(value.code)
        ) {
          errorCode = value.code;
        }
      } catch {
        // Keep the RPC failure sanitized if the response isn't JSON.
      }
      return { data: null, errorCode };
    }

    return { data: await response.json(), errorCode: null };
  } catch {
    return { data: null, errorCode: "RPC_REQUEST_FAILED" };
  }
}

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

function safeCount(value: unknown): number {
  const count = Number(value ?? 0);
  return Number.isSafeInteger(count) && count >= 0 ? count : 0;
}

Deno.serve(async (req: Request): Promise<Response> => {
  if (req.method !== "POST") {
    return json({ error: "METHOD_NOT_ALLOWED" }, 405);
  }

  const token = bearerToken(req);
  if (!token || token.length < 32 || token.length > 256) {
    return json({ error: "AUTH_REQUIRED" }, 401);
  }

  if (!PROJECT_URL || !SERVICE_KEY) {
    return json({ error: "SCHEDULER_CONFIGURATION_UNAVAILABLE" }, 503);
  }

  // The cron caller uses the same high-entropy token stored in Vault as the
  // publishing dispatcher. The token is checked server-side and never logged.
  const { data: authorized, errorCode: authError } = await callRpc(
    "verify_orbitoos_publishing_scheduler_token",
    { p_candidate: token },
  );

  if (authError) {
    console.error("instagram-token-refresh-scheduler authorization check failed", {
      code: authError,
    });
    return json({ error: "SCHEDULER_AUTHORIZATION_UNAVAILABLE" }, 503);
  }
  if (authorized !== true) {
    return json({ error: "AUTH_REQUIRED" }, 401);
  }

  // Installing a daily dispatcher does not enable credential rotation. The
  // endpoint and its caller independently fail closed until an operator opts in.
  if (Deno.env.get("ORBITOS_INSTAGRAM_REFRESH_ENABLED") !== "true") {
    return json({ ok: true, skipped: "TOKEN_REFRESH_DISABLED" });
  }

  const { data: leaseToken, errorCode: leaseError } = await callRpc(
    "claim_orbitoos_instagram_token_refresh_scheduler_lease",
    { p_lease_seconds: 180 },
  );

  if (leaseError) {
    console.error("instagram-token-refresh-scheduler lease claim failed", {
      code: leaseError,
    });
    return json({ error: "SCHEDULER_LEASE_UNAVAILABLE" }, 503);
  }
  if (typeof leaseToken !== "string" || leaseToken.length === 0) {
    return json({ ok: true, skipped: "ANOTHER_INVOCATION_ACTIVE" });
  }

  // If the network fails ambiguously, retain the lease to avoid racing token
  // rotation. The short lease expires automatically if release cannot be proven.
  let releaseLease = true;
  try {
    const response = await fetch(
      BASE_URL + "/functions/v1/instagram-token-refresh",
      {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "Authorization": "Bearer " + SERVICE_KEY,
          "apikey": SERVICE_KEY,
        },
        body: "{}",
        signal: AbortSignal.timeout(120_000),
      },
    );
    const body = await safeJson(response);
    const workerError = typeof body?.error === "string" ? body.error : "";

    if (
      response.status === 503 &&
      workerError === "TOKEN_REFRESH_DISABLED"
    ) {
      return json({ ok: true, skipped: "TOKEN_REFRESH_DISABLED" });
    }

    if (!response.ok || body?.ok !== true) {
      console.error("instagram-token-refresh-scheduler worker rejected dispatch", {
        status: response.status,
        code: /^[A-Z0-9_]{1,64}$/.test(workerError)
          ? workerError
          : "TOKEN_REFRESH_REQUEST_FAILED",
      });
      return json({ error: "TOKEN_REFRESH_UNAVAILABLE" }, 502);
    }

    return json({
      ok: true,
      dispatched: true,
      scanned: safeCount(body.scanned),
      refreshed: safeCount(body.refreshed),
      reauthRequired: safeCount(body.reauthRequired),
      failed: safeCount(body.failed),
    });
  } catch {
    releaseLease = false;
    console.error("instagram-token-refresh-scheduler request failed; lease retained until expiry");
    return json({ error: "TOKEN_REFRESH_UNAVAILABLE" }, 502);
  } finally {
    if (releaseLease) {
      const { errorCode } = await callRpc(
        "release_orbitoos_instagram_token_refresh_scheduler_lease",
        { p_lease_token: leaseToken },
      );
      if (errorCode) {
        console.error("instagram-token-refresh-scheduler lease release failed", {
          code: errorCode,
        });
      }
    }
  }
});
