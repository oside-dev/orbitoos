import "jsr:@supabase/functions-js/edge-runtime.d.ts";
import { withSupabase } from "npm:@supabase/server";

type SupportedPlatform =
  | "facebook"
  | "instagram"
  | "tiktok"
  | "youtube"
  | "x"
  | "linkedin";

type PublishingJob = {
  id: string;
  workspace_id: string;
  brand_id: string | null;
  social_account_id: string;
  content_item_id: string;
  content_variant_id: string | null;
  idempotency_key: string;
  scheduled_at: string;
  attempts: number;
  lease_token: string;
  payload: Record<string, unknown>;
};

type PublisherAdapter = {
  enabled: boolean;
  official: boolean;
  credentialsReady: boolean;
  supportsIdempotency: boolean;
  rateLimitReady: boolean;
  publish(input: {
    job: PublishingJob;
    account: Record<string, unknown>;
    content: Record<string, unknown>;
    variant: Record<string, unknown>;
  }): Promise<{ providerPostId: string }>;
};

/**
 * Add only official provider adapters that have been reviewed and tested.
 * An empty registry is intentional: this function must not claim any jobs
 * until a real provider adapter, credential resolver, and idempotency support
 * have been implemented together.
 */
function createPublisherAdapters(): Partial<Record<SupportedPlatform, PublisherAdapter>> {
  // No adapter is installed yet. Adding a provider here requires a separate
  // official-provider implementation and a passing readiness/idempotency review.
  return Object.freeze({});
}

function json(body: Record<string, unknown>, status = 200): Response {
  return Response.json(body, {
    status,
    headers: { "Cache-Control": "no-store" },
  });
}

function retryDelaySeconds(attempts: number): number {
  const exponent = Math.max(0, Math.min(7, attempts - 1));
  return Math.min(3600, 30 * 2 ** exponent);
}

async function cancelClaim(
  ctx: { supabaseAdmin: any },
  job: PublishingJob,
  errorCode: string,
  errorMessage: string,
): Promise<boolean> {
  const { data, error } = await ctx.supabaseAdmin
    .from("publishing_jobs")
    .update({
      status: "canceled",
      finished_at: new Date().toISOString(),
      lease_expires_at: null,
      lease_token: null,
      last_error_code: errorCode,
      last_error_message: errorMessage,
    })
    .eq("id", job.id)
    .eq("status", "processing")
    .eq("lease_token", job.lease_token)
    .select("id")
    .maybeSingle();

  if (error) {
    console.error("publishing-worker cancellation not accepted", {
      jobId: job.id,
      code: error.code ?? "CANCEL_FAILED",
    });
    return false;
  }
  return Boolean(data);
}

Deno.serve(
  // The platform gateway's JWT verification is disabled for this function
  // because this wrapper validates a Supabase secret API key itself.
  withSupabase({ auth: "secret" }, async (req, ctx) => {
    if (req.method !== "POST") {
      return json({ error: "METHOD_NOT_ALLOWED" }, 405);
    }

    // Fail closed unless an operator explicitly enables the publishing worker.
    if (Deno.env.get("ORBITOS_PUBLISHING_ENABLED") !== "true") {
      return json({ error: "PUBLISHING_DISABLED" }, 503);
    }

    const registry = createPublisherAdapters();
    const platforms = (Object.keys(registry) as SupportedPlatform[]).filter((platform) => {
      const adapter = registry[platform];
      return Boolean(
        adapter &&
        adapter.enabled === true &&
        adapter.official === true &&
        adapter.credentialsReady === true &&
        adapter.supportsIdempotency === true &&
        adapter.rateLimitReady === true
      );
    });
    const adapters = registry;

    // Never claim/lease jobs without a registered official adapter. This is
    // currently the normal outcome until a provider integration is shipped.
    if (platforms.length === 0) {
      return json({ error: "NO_OFFICIAL_ADAPTER_CONFIGURED" }, 503);
    }

    const { data: claimedJobs, error: claimError } = await ctx.supabaseAdmin.rpc(
      "claim_due_publishing_jobs",
      {
        p_limit: 5,
        p_lease_seconds: 120,
        p_platforms: platforms,
      },
    );

    if (claimError) {
      // Do not return raw database/provider messages that might include secrets.
      console.error("publishing-worker claim failed", {
        code: claimError.code ?? "CLAIM_FAILED",
      });
      return json({ error: "CLAIM_FAILED" }, 500);
    }

    const jobs = (claimedJobs ?? []) as PublishingJob[];
    const outcomes: Array<{ jobId: string; status: string }> = [];

    for (const job of jobs) {
      // The claim RPC returns the job row; resolve platform through its account.
      const { data: account, error: accountError } = await ctx.supabaseAdmin
        .from("social_accounts")
        .select("id, workspace_id, brand_id, platform, status, external_account_id, handle, display_name")
        .eq("id", job.social_account_id)
        .eq("workspace_id", job.workspace_id)
        .maybeSingle();

      if (accountError || !account || account.status !== "connected") {
        await cancelClaim(
          ctx,
          job,
          "ACCOUNT_NOT_READY",
          "The linked social account is unavailable or disconnected.",
        );
        outcomes.push({ jobId: job.id, status: "canceled" });
        continue;
      }

      const platform = account.platform as SupportedPlatform;
      const provider = adapters[platform];
      if (!provider || !platforms.includes(platform)) {
        // Defensive fallback: a job should never be claimed for an unregistered
        // provider, but requeue safely if a registry/account mismatch is found.
        await cancelClaim(
          ctx,
          job,
          "ADAPTER_NOT_AVAILABLE",
          "No official adapter is available for this account.",
        );
        outcomes.push({ jobId: job.id, status: "canceled" });
        continue;
      }

      const [{ data: content, error: contentError }, { data: variant, error: variantError }] =
        await Promise.all([
          ctx.supabaseAdmin
            .from("content_items")
            .select("id, workspace_id, status, title, brief")
            .eq("id", job.content_item_id)
            .eq("workspace_id", job.workspace_id)
            .maybeSingle(),
          ctx.supabaseAdmin
            .from("content_variants")
            .select("id, workspace_id, content_item_id, status, approved, platform, hook, body, cta, hashtags, creative_brief, visual_direction, version")
            .eq("id", job.content_variant_id ?? "")
            .eq("workspace_id", job.workspace_id)
            .eq("content_item_id", job.content_item_id)
            .maybeSingle(),
        ]);

      if (
        contentError ||
        variantError ||
        !content ||
        !variant ||
        content.status !== "approved" ||
        variant.status !== "approved" ||
        variant.approved !== true
      ) {
        await cancelClaim(
          ctx,
          job,
          "CONTENT_NOT_APPROVED",
          "The linked content or platform variant is no longer approved.",
        );
        outcomes.push({ jobId: job.id, status: "canceled" });
        continue;
      }

      try {
        const published = await provider.publish({ job, account, content, variant });
        const { data: completed, error: completeError } = await ctx.supabaseAdmin.rpc(
          "complete_publishing_job",
          {
            p_job_id: job.id,
            p_lease_token: job.lease_token,
            p_provider_post_id: published.providerPostId,
          },
        );

        if (completeError || completed !== true) {
          console.error("publishing-worker completion not accepted", {
            jobId: job.id,
            code: completeError?.code ?? "STALE_LEASE",
          });
          outcomes.push({ jobId: job.id, status: "completion_unconfirmed" });
          continue;
        }

        outcomes.push({ jobId: job.id, status: "published" });
      } catch {
        // Persist only a fixed, sanitized message. Never persist provider bodies,
        // authorization headers, access tokens, refresh tokens, or raw errors.
        await ctx.supabaseAdmin.rpc("retry_publishing_job", {
          p_job_id: job.id,
          p_lease_token: job.lease_token,
          p_error_code: "PROVIDER_REQUEST_FAILED",
          p_error_message: "The official publishing adapter reported a failure.",
          p_retry_seconds: retryDelaySeconds(job.attempts),
        });
        outcomes.push({ jobId: job.id, status: "retry_scheduled" });
      }
    }

    return json({
      ok: true,
      claimed: jobs.length,
      outcomes,
    });
  }),
);
