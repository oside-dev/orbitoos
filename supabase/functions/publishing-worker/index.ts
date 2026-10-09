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

class SafeRetryPublishError extends Error {
  code: string;
  retrySeconds: number;
  constructor(code: string, retrySeconds = 60) {
    super(code);
    this.name = "SafeRetryPublishError";
    this.code = code;
    this.retrySeconds = Math.max(5, Math.min(86400, retrySeconds));
  }
}

class PermanentPublishError extends Error {
  code: string;
  constructor(code: string) {
    super(code);
    this.name = "PermanentPublishError";
    this.code = code;
  }
}

class PublishOutcomeUnknownError extends Error {
  constructor() {
    super("PUBLISH_OUTCOME_UNKNOWN");
    this.name = "PublishOutcomeUnknownError";
  }
}

type InstagramCheckpoint = {
  idempotencyKey: string;
  phase: "container_created" | "publish_started" | "published";
  containerId: string;
  providerPostId?: string;
  updatedAt: string;
};

type WorkerContext = { supabaseAdmin: any };

function getInstagramCheckpoint(job: PublishingJob): InstagramCheckpoint | null {
  const payload = job.payload ?? {};
  if (!Object.prototype.hasOwnProperty.call(payload, "_instagramPublishing")) return null;

  const value = payload._instagramPublishing;
  if (!value || typeof value !== "object") {
    throw new PermanentPublishError("PUBLISH_CHECKPOINT_INVALID");
  }
  const checkpoint = value as Partial<InstagramCheckpoint>;
  if (
    typeof checkpoint.idempotencyKey !== "string" ||
    typeof checkpoint.containerId !== "string" ||
    !["container_created", "publish_started", "published"].includes(String(checkpoint.phase))
  ) {
    // Never discard a malformed durable checkpoint and start a second publish flow.
    throw new PermanentPublishError("PUBLISH_CHECKPOINT_INVALID");
  }
  return checkpoint as InstagramCheckpoint;
}

async function saveInstagramCheckpoint(
  ctx: WorkerContext,
  job: PublishingJob,
  checkpoint: InstagramCheckpoint,
): Promise<void> {
  const nextPayload = { ...(job.payload ?? {}), _instagramPublishing: checkpoint };
  const { data, error } = await ctx.supabaseAdmin
    .from("publishing_jobs")
    .update({ payload: nextPayload })
    .eq("id", job.id)
    .eq("status", "processing")
    .eq("lease_token", job.lease_token)
    .select("id")
    .maybeSingle();

  if (error || !data) {
    throw new SafeRetryPublishError("PUBLISH_CHECKPOINT_WRITE_FAILED", 60);
  }
  job.payload = nextPayload;
}

async function finishClaimAsFailed(
  ctx: WorkerContext,
  job: PublishingJob,
  errorCode: string,
  errorMessage: string,
): Promise<boolean> {
  const { data, error } = await ctx.supabaseAdmin
    .from("publishing_jobs")
    .update({
      status: "failed",
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
    console.error("publishing-worker failure transition not accepted", {
      jobId: job.id,
      code: error.code ?? "FAILURE_TRANSITION_FAILED",
    });
    return false;
  }
  return Boolean(data);
}

type GraphBody = {
  id?: unknown;
  status_code?: unknown;
  status?: unknown;
  quota_usage?: unknown;
  config?: { quota_total?: unknown; quota_duration?: unknown } | null;
  data?: unknown;
  error?: { code?: unknown; type?: unknown; error_subcode?: unknown } | null;
};

function cleanProviderCode(value: unknown): string {
  return typeof value === "string" && /^[A-Z0-9_]{1,64}$/.test(value)
    ? value
    : typeof value === "number" && Number.isFinite(value)
      ? "META_" + String(value)
      : "INSTAGRAM_API_ERROR";
}

function assertPublicReelUrl(rawValue: unknown): string {
  let mediaUrl: URL;
  try {
    mediaUrl = new URL(String(rawValue ?? ""));
  } catch {
    throw new PermanentPublishError("MEDIA_URL_INVALID");
  }

  const host = mediaUrl.hostname.toLowerCase();
  const isIpv4 = /^\d{1,3}(?:\.\d{1,3}){3}$/.test(host);
  const isLocal = host === "localhost" ||
    host === "localhost.localdomain" ||
    !host.includes(".") ||
    [".localhost", ".local", ".internal", ".test", ".invalid", ".example"]
      .some((suffix) => host.endsWith(suffix));

  if (
    mediaUrl.protocol !== "https:" ||
    !host ||
    mediaUrl.username ||
    mediaUrl.password ||
    isIpv4 ||
    host.startsWith("[") ||
    host.includes(":") ||
    isLocal ||
    !/\.(mp4|mov)$/i.test(mediaUrl.pathname)
  ) {
    throw new PermanentPublishError("INSTAGRAM_REEL_URL_UNSUPPORTED");
  }

  mediaUrl.hash = "";
  return mediaUrl.toString();
}

function buildInstagramCaption(variant: Record<string, unknown>): string {
  const pieces = [
    variant.hook,
    variant.body,
    variant.cta,
    Array.isArray(variant.hashtags) ? variant.hashtags.join(" ") : "",
  ].map((piece) => String(piece ?? "").trim()).filter(Boolean);
  const caption = pieces.join("\n\n");

  if (!caption) throw new PermanentPublishError("INSTAGRAM_CAPTION_EMPTY");
  if (caption.length > 2200) throw new PermanentPublishError("INSTAGRAM_CAPTION_TOO_LONG");
  return caption;
}

function graphUrl(apiVersion: string, path: string, query: Record<string, string> = {}): URL {
  const safePath = path.split("/").map((part) => encodeURIComponent(part)).join("/");
  const url = new URL(apiVersion + "/" + safePath, "https://graph.instagram.com/");
  for (const [key, value] of Object.entries(query)) url.searchParams.set(key, value);
  return url;
}

async function graphRequest(
  url: URL,
  accessToken: string,
  method: "GET" | "POST",
  form?: URLSearchParams,
): Promise<{ response: Response; body: GraphBody | null }> {
  const response = await fetch(url, {
    method,
    headers: {
      "Authorization": "Bearer " + accessToken,
      ...(method === "POST" ? { "Content-Type": "application/x-www-form-urlencoded" } : {}),
    },
    ...(method === "POST" ? { body: form ?? new URLSearchParams() } : {}),
    signal: AbortSignal.timeout(10000),
  });
  let body: GraphBody | null = null;
  try {
    body = await response.json() as GraphBody;
  } catch {
    body = null;
  }
  return { response, body };
}

function graphErrorCode(body: GraphBody | null): string {
  return cleanProviderCode(body?.error?.code);
}

function isInvalidInstagramToken(response: Response, body: GraphBody | null): boolean {
  return (response.status === 401 || response.status === 400) &&
    Number(body?.error?.code) === 190;
}

async function markInstagramReauthRequired(
  ctx: WorkerContext,
  account: Record<string, unknown>,
): Promise<void> {
  await ctx.supabaseAdmin
    .from("social_accounts")
    .update({ status: "reauth_required", updated_at: new Date().toISOString() })
    .eq("id", String(account.id ?? ""))
    .eq("workspace_id", String(account.workspace_id ?? ""))
    .eq("status", "connected");
}

async function checkInstagramPublishingQuota(
  ctx: WorkerContext,
  account: Record<string, unknown>,
  apiVersion: string,
  accessToken: string,
): Promise<void> {
  const url = graphUrl(
    apiVersion,
    String(account.external_account_id) + "/content_publishing_limit",
    { fields: "quota_usage,config" },
  );

  let result: { response: Response; body: GraphBody | null };
  try {
    result = await graphRequest(url, accessToken, "GET");
  } catch {
    throw new SafeRetryPublishError("PUBLISH_QUOTA_CHECK_UNAVAILABLE", 300);
  }

  if (isInvalidInstagramToken(result.response, result.body)) {
    await markInstagramReauthRequired(ctx, account);
    throw new PermanentPublishError("INSTAGRAM_REAUTH_REQUIRED");
  }
  if (!result.response.ok || !result.body) {
    throw new SafeRetryPublishError("PUBLISH_QUOTA_CHECK_UNAVAILABLE", 300);
  }

  const first = Array.isArray(result.body.data)
    ? result.body.data[0] as GraphBody | undefined
    : result.body;
  const usage = Number(first?.quota_usage);
  const total = Number(first?.config?.quota_total);
  const duration = Number(first?.config?.quota_duration);

  if (
    !Number.isFinite(usage) ||
    !Number.isFinite(total) ||
    total < 1 ||
    !Number.isFinite(duration) ||
    duration < 60
  ) {
    throw new SafeRetryPublishError("PUBLISH_QUOTA_RESPONSE_INVALID", 300);
  }

  if (usage >= total) {
    throw new SafeRetryPublishError(
      "INSTAGRAM_PUBLISH_QUOTA_REACHED",
      Math.max(300, Math.min(86400, duration)),
    );
  }
}

/**
 * Reels-only official Instagram Login adapter.
 * Every publish phase checkpoints into publishing_jobs.payload using the lease token.
 * If media_publish has an ambiguous outcome, automatic retries stop to avoid duplicates.
 */
function createInstagramReelsAdapter(
  ctx: WorkerContext,
  apiVersion: string,
  enabled: boolean,
): PublisherAdapter {
  return {
    enabled,
    official: true,
    credentialsReady: Boolean(apiVersion),
    supportsIdempotency: Boolean(apiVersion),
    rateLimitReady: Boolean(apiVersion),
    async publish({ job, account, variant }) {
      if (String(variant.platform ?? "").trim().toLowerCase() !== "instagram reels") {
        throw new PermanentPublishError("INSTAGRAM_MEDIA_TYPE_UNSUPPORTED");
      }

      const scopes = Array.isArray(account.scopes) ? account.scopes.map(String) : [];
      if (!scopes.includes("instagram_business_content_publish")) {
        await markInstagramReauthRequired(ctx, account);
        throw new PermanentPublishError("INSTAGRAM_PUBLISH_PERMISSION_MISSING");
      }

      const checkpoint = getInstagramCheckpoint(job);
      if (checkpoint && checkpoint.idempotencyKey !== job.idempotency_key) {
        throw new PermanentPublishError("PUBLISH_CHECKPOINT_IDEMPOTENCY_MISMATCH");
      }
      if (checkpoint?.phase === "published" && checkpoint.providerPostId) {
        return { providerPostId: checkpoint.providerPostId };
      }
      if (checkpoint?.phase === "publish_started") {
        throw new PublishOutcomeUnknownError();
      }

      const mediaUrl = assertPublicReelUrl(variant.media_url);
      const caption = buildInstagramCaption(variant);
      const { data: token, error: tokenError } = await ctx.supabaseAdmin.rpc(
        "get_social_account_secret",
        {
          p_social_account_id: String(account.id),
          p_secret_kind: "access",
        },
      );

      if (tokenError || typeof token !== "string" || !token) {
        if (tokenError?.code === "P0002" || !token) {
          await markInstagramReauthRequired(ctx, account);
          throw new PermanentPublishError("INSTAGRAM_REAUTH_REQUIRED");
        }
        throw new SafeRetryPublishError("INSTAGRAM_TOKEN_LOOKUP_FAILED", 60);
      }

      await checkInstagramPublishingQuota(ctx, account, apiVersion, token);

      let activeCheckpoint = checkpoint;
      if (!activeCheckpoint) {
        let created: { response: Response; body: GraphBody | null };
        const url = graphUrl(apiVersion, String(account.external_account_id) + "/media");
        const form = new URLSearchParams({
          media_type: "REELS",
          video_url: mediaUrl,
          caption,
          share_to_feed: "true",
        });

        try {
          created = await graphRequest(url, token, "POST", form);
        } catch {
          // Container creation isn't publication; a retry may leave an unused container,
          // but doesn't itself create a live post.
          throw new SafeRetryPublishError("INSTAGRAM_CONTAINER_CREATE_UNAVAILABLE", 60);
        }

        if (isInvalidInstagramToken(created.response, created.body)) {
          await markInstagramReauthRequired(ctx, account);
          throw new PermanentPublishError("INSTAGRAM_REAUTH_REQUIRED");
        }
        if (!created.response.ok) {
          if (created.response.status === 429 || created.response.status >= 500) {
            throw new SafeRetryPublishError("INSTAGRAM_CONTAINER_CREATE_FAILED", 300);
          }
          throw new PermanentPublishError(graphErrorCode(created.body));
        }

        const containerId = String(created.body?.id ?? "").trim();
        if (!containerId) throw new SafeRetryPublishError("INSTAGRAM_CONTAINER_ID_MISSING", 60);

        activeCheckpoint = {
          idempotencyKey: job.idempotency_key,
          phase: "container_created",
          containerId,
          updatedAt: new Date().toISOString(),
        };
        await saveInstagramCheckpoint(ctx, job, activeCheckpoint);
      }

      let containerReady = false;
      for (let poll = 0; poll < 6; poll++) {
        let statusResult: { response: Response; body: GraphBody | null };
        try {
          statusResult = await graphRequest(
            graphUrl(apiVersion, activeCheckpoint.containerId, {
              fields: "status_code,status",
            }),
            token,
            "GET",
          );
        } catch {
          throw new SafeRetryPublishError("INSTAGRAM_CONTAINER_STATUS_UNAVAILABLE", 60);
        }

        if (isInvalidInstagramToken(statusResult.response, statusResult.body)) {
          await markInstagramReauthRequired(ctx, account);
          throw new PermanentPublishError("INSTAGRAM_REAUTH_REQUIRED");
        }
        if (!statusResult.response.ok || !statusResult.body) {
          throw new SafeRetryPublishError("INSTAGRAM_CONTAINER_STATUS_UNAVAILABLE", 60);
        }

        const status = String(statusResult.body.status_code ?? "").toUpperCase();
        if (status === "FINISHED") {
          containerReady = true;
          break;
        }
        if (status === "PUBLISHED") throw new PublishOutcomeUnknownError();
        if (status === "ERROR" || status === "EXPIRED") {
          throw new PermanentPublishError("INSTAGRAM_CONTAINER_NOT_PUBLISHABLE");
        }
        if (status !== "IN_PROGRESS") {
          throw new SafeRetryPublishError("INSTAGRAM_CONTAINER_STATUS_UNKNOWN", 60);
        }
        await new Promise((resolve) => setTimeout(resolve, 2000));
      }

      if (!containerReady) {
        throw new SafeRetryPublishError("INSTAGRAM_CONTAINER_STILL_PROCESSING", 60);
      }

      await saveInstagramCheckpoint(ctx, job, {
        ...activeCheckpoint,
        phase: "publish_started",
        updatedAt: new Date().toISOString(),
      });

      let published: { response: Response; body: GraphBody | null };
      try {
        published = await graphRequest(
          graphUrl(apiVersion, String(account.external_account_id) + "/media_publish"),
          token,
          "POST",
          new URLSearchParams({ creation_id: activeCheckpoint.containerId }),
        );
      } catch {
        // The request may have succeeded remotely even if this worker timed out.
        throw new PublishOutcomeUnknownError();
      }

      if (isInvalidInstagramToken(published.response, published.body)) {
        await markInstagramReauthRequired(ctx, account);
        throw new PermanentPublishError("INSTAGRAM_REAUTH_REQUIRED");
      }
      if (!published.response.ok) {
        if (published.response.status >= 500) throw new PublishOutcomeUnknownError();
        if (published.response.status === 429) {
          await saveInstagramCheckpoint(ctx, job, {
            ...activeCheckpoint,
            phase: "container_created",
            updatedAt: new Date().toISOString(),
          });
          throw new SafeRetryPublishError("INSTAGRAM_PUBLISH_RATE_LIMITED", 3600);
        }
        throw new PermanentPublishError(graphErrorCode(published.body));
      }

      const postId = String(published.body?.id ?? "").trim();
      if (!postId) throw new PublishOutcomeUnknownError();

      try {
        await saveInstagramCheckpoint(ctx, job, {
          ...activeCheckpoint,
          phase: "published",
          providerPostId: postId,
          updatedAt: new Date().toISOString(),
        });
      } catch {
        throw new PublishOutcomeUnknownError();
      }

      return { providerPostId: postId };
    },
  };
}

function createPublisherAdapters(ctx: WorkerContext): Partial<Record<SupportedPlatform, PublisherAdapter>> {
  const apiVersion = Deno.env.get("META_GRAPH_API_VERSION")?.trim() ?? "";
  const validVersion = /^v\d{1,2}\.\d{1,2}$/.test(apiVersion);
  const enabled = Deno.env.get("ORBITOS_INSTAGRAM_PUBLISHING_ADAPTER_ENABLED") === "true";
  return Object.freeze({
    instagram: createInstagramReelsAdapter(ctx, validVersion ? apiVersion : "", enabled && validVersion),
  });
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

    const registry = createPublisherAdapters(ctx);
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
        .select("id, workspace_id, brand_id, platform, status, external_account_id, handle, display_name, scopes")
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
            .select("id, workspace_id, content_item_id, status, approved, platform, hook, body, cta, hashtags, creative_brief, visual_direction, media_url, version")
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
      } catch (error) {
        if (error instanceof PublishOutcomeUnknownError) {
          const failed = await finishClaimAsFailed(
            ctx,
            job,
            "PUBLISH_OUTCOME_UNKNOWN",
            "Instagram may have accepted this post. Review the account before retrying.",
          );
          outcomes.push({
            jobId: job.id,
            status: failed ? "manual_reconciliation_required" : "outcome_unconfirmed",
          });
          continue;
        }

        if (error instanceof PermanentPublishError) {
          const failed = await finishClaimAsFailed(
            ctx,
            job,
            error.code,
            "The Instagram adapter rejected this job or the connected account needs attention.",
          );
          outcomes.push({
            jobId: job.id,
            status: failed ? "failed" : "failure_unconfirmed",
          });
          continue;
        }

        const retrySeconds = error instanceof SafeRetryPublishError
          ? error.retrySeconds
          : retryDelaySeconds(job.attempts);
        const safeErrorCode = error instanceof SafeRetryPublishError
          ? error.code
          : "PROVIDER_REQUEST_FAILED";

        await ctx.supabaseAdmin.rpc("retry_publishing_job", {
          p_job_id: job.id,
          p_lease_token: job.lease_token,
          p_error_code: safeErrorCode,
          p_error_message: "The official publishing adapter could not complete this attempt safely.",
          p_retry_seconds: retrySeconds,
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
