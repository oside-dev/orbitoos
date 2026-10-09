import "jsr:@supabase/functions-js/edge-runtime.d.ts";
import { withSupabase } from "npm:@supabase/server";

const REFRESH_DAYS = 7;
const BATCH_SIZE = 10;

type RefreshAccount = {
  id: string;
  workspace_id: string;
  status: string;
  updated_at: string;
  metadata: Record<string, unknown> | null;
};

type RefreshResponse = {
  access_token?: unknown;
  token_type?: unknown;
  expires_in?: unknown;
  error?: {
    type?: unknown;
    code?: unknown;
    error_subcode?: unknown;
  };
};

function json(body: Record<string, unknown>, status = 200): Response {
  return Response.json(body, {
    status,
    headers: { "Cache-Control": "no-store" },
  });
}

function errorCode(value: unknown): string {
  return typeof value === "string" && /^[A-Z0-9_]{1,48}$/.test(value)
    ? value
    : "TOKEN_REFRESH_FAILED";
}

async function readJson(response: Response): Promise<RefreshResponse | null> {
  try {
    return await response.json() as RefreshResponse;
  } catch {
    return null;
  }
}

function isInvalidToken(response: Response, body: RefreshResponse | null): boolean {
  return response.status === 400 &&
    body?.error?.type === "OAuthException" &&
    Number(body.error.code) === 190;
}

Deno.serve(
  // The gateway checks the Supabase secret API key. This is backend-only and
  // does not accept a regular signed-in user's JWT as authorization.
  withSupabase({ auth: "secret" }, async (req, ctx) => {
    if (req.method !== "POST") {
      return json({ error: "METHOD_NOT_ALLOWED" }, 405);
    }

    // Deploy safely first. An operator must explicitly enable refresh only after
    // checking the Meta app configuration and testing with a real connection.
    if (Deno.env.get("ORBITOS_INSTAGRAM_REFRESH_ENABLED") !== "true") {
      return json({ error: "TOKEN_REFRESH_DISABLED" }, 503);
    }

    const now = Date.now();
    const dueBefore = new Date(now + REFRESH_DAYS * 24 * 60 * 60 * 1000).toISOString();
    const { data: accounts, error: scanError } = await ctx.supabaseAdmin
      .from("social_accounts")
      .select("id, workspace_id, status, updated_at, metadata")
      .eq("platform", "instagram")
      .eq("status", "connected")
      .eq("metadata->>provider", "instagram_login")
      .lt("metadata->>tokenExpiresAt", dueBefore)
      .order("updated_at", { ascending: true })
      .limit(BATCH_SIZE);

    if (scanError) {
      console.error("instagram-token-refresh account scan failed", {
        code: errorCode(scanError.code),
      });
      return json({ error: "ACCOUNT_SCAN_FAILED" }, 500);
    }

    const summary = {
      scanned: (accounts ?? []).length,
      refreshed: 0,
      reauthRequired: 0,
      failed: 0,
    };

    for (const account of (accounts ?? []) as RefreshAccount[]) {
      const expiresAtMs = Date.parse(String(account.metadata?.tokenExpiresAt ?? ""));
      if (!Number.isFinite(expiresAtMs)) {
        summary.failed++;
        console.warn("instagram-token-refresh missing expiry metadata", {
          accountId: account.id,
        });
        continue;
      }

      // Instagram long-lived tokens must be refreshed before they expire.
      // If already expired, do not keep retrying a provider refresh that cannot work.
      if (expiresAtMs <= now) {
        const { error } = await ctx.supabaseAdmin
          .from("social_accounts")
          .update({
            status: "reauth_required",
            metadata: {
              ...(account.metadata ?? {}),
              tokenRefreshStatus: "expired",
            },
            updated_at: new Date().toISOString(),
          })
          .eq("id", account.id)
          .eq("workspace_id", account.workspace_id)
          .eq("status", "connected");
        if (error) {
          summary.failed++;
        } else {
          summary.reauthRequired++;
        }
        continue;
      }

      const { data: currentToken, error: tokenError } = await ctx.supabaseAdmin.rpc(
        "get_social_account_secret",
        {
          p_social_account_id: account.id,
          p_secret_kind: "access",
        },
      );

      if (tokenError || typeof currentToken !== "string" || !currentToken) {
        console.error("instagram-token-refresh could not read account credential", {
          accountId: account.id,
          code: errorCode(tokenError?.code),
        });
        summary.failed++;
        continue;
      }

      let response: Response;
      let body: RefreshResponse | null;
      try {
        const url = new URL("https://graph.instagram.com/refresh_access_token");
        url.searchParams.set("grant_type", "ig_refresh_token");
        url.searchParams.set("access_token", currentToken);
        response = await fetch(url, { signal: AbortSignal.timeout(8000) });
        body = await readJson(response);
      } catch {
        // Never log the URL, token, or a raw exception.
        console.warn("instagram-token-refresh provider request failed", {
          accountId: account.id,
          reason: "NETWORK_OR_TIMEOUT",
        });
        summary.failed++;
        continue;
      }

      if (isInvalidToken(response, body)) {
        const { error } = await ctx.supabaseAdmin
          .from("social_accounts")
          .update({
            status: "reauth_required",
            metadata: {
              ...(account.metadata ?? {}),
              tokenRefreshStatus: "invalid_token",
            },
            updated_at: new Date().toISOString(),
          })
          .eq("id", account.id)
          .eq("workspace_id", account.workspace_id)
          .eq("status", "connected");
        if (error) summary.failed++;
        else summary.reauthRequired++;
        continue;
      }

      if (
        !response.ok ||
        typeof body?.access_token !== "string" ||
        body.access_token.length === 0 ||
        typeof body.expires_in !== "number" ||
        !Number.isFinite(body.expires_in) ||
        body.expires_in < 60 ||
        body.expires_in > 90 * 24 * 60 * 60
      ) {
        console.warn("instagram-token-refresh provider response rejected", {
          accountId: account.id,
          status: response.status,
          providerCode: errorCode(body?.error?.code),
        });
        summary.failed++;
        continue;
      }

      const nextExpiresAt = new Date(Date.now() + body.expires_in * 1000).toISOString();
      const { data: stored, error: storeError } = await ctx.supabaseAdmin.rpc(
        "store_social_account_secret",
        {
          p_social_account_id: account.id,
          p_secret_kind: "access",
          p_secret_value: body.access_token,
        },
      );

      if (storeError || stored !== true) {
        console.error("instagram-token-refresh Vault rotation failed", {
          accountId: account.id,
          code: errorCode(storeError?.code),
        });
        summary.failed++;
        continue;
      }

      // Update expiry only after the new token has been stored in Vault.
      const { error: metadataError } = await ctx.supabaseAdmin
        .from("social_accounts")
        .update({
          metadata: {
            ...(account.metadata ?? {}),
            tokenExpiresAt: nextExpiresAt,
            tokenRefreshedAt: new Date().toISOString(),
            tokenRefreshStatus: "ok",
          },
          last_synced_at: new Date().toISOString(),
          updated_at: new Date().toISOString(),
        })
        .eq("id", account.id)
        .eq("workspace_id", account.workspace_id)
        .eq("status", "connected");

      if (metadataError) {
        // Keep the encrypted token, report the persistence fault, and don't log it.
        console.error("instagram-token-refresh expiry metadata update failed", {
          accountId: account.id,
          code: errorCode(metadataError.code),
        });
        summary.failed++;
        continue;
      }

      summary.refreshed++;
    }

    return json({
      ok: true,
      ...summary,
      nextStep: "No schedule is configured; invoke this backend endpoint on a controlled schedule after verification.",
    });
  }),
);
