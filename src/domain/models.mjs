export const PLATFORMS = Object.freeze([
  "TikTok",
  "Instagram Reels",
  "YouTube Shorts",
  "X",
  "Facebook",
  "LinkedIn",
]);

export const SOCIAL_PLATFORMS = Object.freeze([
  "facebook",
  "instagram",
  "tiktok",
  "youtube",
  "x",
  "linkedin",
]);

export const PIPELINE_STAGES = Object.freeze([
  "idea",
  "research",
  "strategy",
  "draft",
  "review",
  "approved",
  "scheduled",
]);

export function createId(prefix = "id", now = Date.now()) {
  return prefix + "-" + now;
}

export function createBrand(input = {}, now = Date.now()) {
  const name = String(input.name ?? "").trim();
  if (!name) throw new Error("Brand name is required.");

  return {
    id: input.id ?? createId("brand", now),
    name,
    voice: String(input.voice ?? "").trim(),
    audience: String(input.audience ?? "").trim(),
    pillars: Array.isArray(input.pillars) ? input.pillars.map(String) : [],
    rules: Array.isArray(input.rules) ? input.rules.map(String) : [],
    visualDirection: String(
      input.visualDirection ?? input.visual_direction ?? "",
    ).trim(),
    postingGoals: input.postingGoals ?? input.posting_goals ?? {},
  };
}

export function createIdea(input, now = Date.now()) {
  const title = String(input?.title ?? "").trim();
  if (!title) throw new Error("Idea title is required.");

  return {
    id: input.id ?? createId("idea", now),
    title,
    pillar: String(input.pillar ?? "General").trim() || "General",
    audience:
      String(input.audience ?? "General audience").trim() || "General audience",
    goal: String(input.goal ?? "Education").trim() || "Education",
    brief: String(input.brief ?? "").trim(),
    stage: PIPELINE_STAGES.includes(input.stage) ? input.stage : "idea",
    score: Number.isFinite(input.score) ? input.score : null,
    variants: input.variants ?? {},
    metadata: {
      ...(input.metadata ?? {}),
      brandId: input.brandId ?? input.metadata?.brandId ?? null,
    },
  };
}

export function createVariant(input = {}) {
  return {
    platform: String(input.platform ?? ""),
    hook: String(input.hook ?? ""),
    body: String(input.body ?? ""),
    cta: String(input.cta ?? ""),
    hashtags: Array.isArray(input.hashtags) ? input.hashtags.map(String) : [],
    creativeBrief: String(input.creativeBrief ?? ""),
    visualDirection: String(input.visualDirection ?? ""),
    approved: Boolean(input.approved),
  };
}

export function createContentItem(input = {}, now = Date.now()) {
  const title = String(input.title ?? "").trim();
  if (!title) throw new Error("Content item title is required.");

  const createdAt = input.createdAt ?? new Date(now).toISOString();

  return {
    id: input.id ?? createId("content", now),
    ideaId: input.ideaId ?? null,
    title,
    brief: String(input.brief ?? "").trim(),
    status: String(input.status ?? "draft"),
    createdAt,
    updatedAt: input.updatedAt ?? createdAt,
  };
}

export function createContentVariant(input = {}, now = Date.now()) {
  const platform = String(input.platform ?? "").trim();
  if (!platform) throw new Error("Content variant platform is required.");

  return {
    id:
      input.id ??
      createId(
        "variant-" + platform.toLowerCase().replace(/[^a-z0-9]+/g, "-"),
        now,
      ),
    contentItemId: input.contentItemId ?? null,
    brandId: input.brandId ?? null,
    platform,
    hook: String(input.hook ?? ""),
    body: String(input.body ?? ""),
    cta: String(input.cta ?? ""),
    hashtags: Array.isArray(input.hashtags) ? input.hashtags.map(String) : [],
    creativeBrief: String(input.creativeBrief ?? ""),
    visualDirection: String(input.visualDirection ?? ""),
    status: String(input.status ?? "draft"),
    approved: Boolean(input.approved),
    version: Number.isInteger(input.version) ? input.version : 1,
    updatedAt: input.updatedAt ?? new Date(now).toISOString(),
  };
}

export function createSchedule(input = {}, now = Date.now()) {
  const contentItemId = String(input.contentItemId ?? "").trim();
  const platform = String(input.platform ?? "").trim();
  const scheduledAt = String(input.scheduledAt ?? "").trim();

  if (!contentItemId) throw new Error("Schedule content item is required.");
  if (!platform) throw new Error("Schedule platform is required.");
  if (!scheduledAt) throw new Error("Schedule time is required.");

  const timestamp = Date.parse(scheduledAt);
  if (Number.isNaN(timestamp)) {
    throw new Error("Schedule time must be a valid ISO date.");
  }

  return {
    id: input.id ?? createId("schedule", now),
    contentItemId,
    platform,
    scheduledAt,
    status: String(input.status ?? "scheduled"),
    createdAt: input.createdAt ?? new Date(now).toISOString(),
  };
}

export function isApproved(idea) {
  return idea?.stage === "approved";
}

export function normalizeBrand(brand = {}) {
  return {
    id: brand.id ?? null,
    name: String(brand.name ?? "").trim(),
    voice: String(brand.voice ?? "").trim(),
    audience: String(brand.audience ?? "").trim(),
    pillars: Array.isArray(brand.pillars) ? brand.pillars.map(String) : [],
    rules: Array.isArray(brand.rules) ? brand.rules.map(String) : [],
    visualDirection: String(
      brand.visualDirection ?? brand.visual_direction ?? "",
    ).trim(),
    postingGoals: brand.postingGoals ?? brand.posting_goals ?? {},
  };
}


export function createSocialAccount(input = {}, now = Date.now()) {
  const platform = String(input.platform ?? "").trim().toLowerCase();
  const workspaceId = String(input.workspaceId ?? input.workspace_id ?? "").trim();
  const externalAccountId = String(
    input.externalAccountId ?? input.external_account_id ?? "",
  ).trim();

  if (!workspaceId) throw new Error("Social account workspace is required.");
  if (!SOCIAL_PLATFORMS.includes(platform)) {
    throw new Error("Unsupported social account platform: " + platform);
  }
  if (!externalAccountId) {
    throw new Error("Social account external ID is required.");
  }

  return {
    id: input.id ?? createId("social-account", now),
    workspaceId,
    brandId: input.brandId ?? input.brand_id ?? null,
    platform,
    accountType: String(input.accountType ?? input.account_type ?? "profile"),
    externalAccountId,
    handle: String(input.handle ?? "").trim(),
    displayName: String(input.displayName ?? input.display_name ?? "").trim(),
    profileUrl: String(input.profileUrl ?? input.profile_url ?? "").trim(),
    avatarUrl: String(input.avatarUrl ?? input.avatar_url ?? "").trim(),
    status: String(input.status ?? "connected"),
    scopes: Array.isArray(input.scopes) ? input.scopes.map(String) : [],
    metadata: input.metadata ?? {},
    connectedAt:
      input.connectedAt ??
      input.connected_at ??
      new Date(now).toISOString(),
    lastSyncedAt: input.lastSyncedAt ?? input.last_synced_at ?? null,
    updatedAt: input.updatedAt ?? input.updated_at ?? new Date(now).toISOString(),
  };
}

export function createPublishingJob(input = {}, now = Date.now()) {
  const workspaceId = String(input.workspaceId ?? input.workspace_id ?? "").trim();
  const socialAccountId = String(
    input.socialAccountId ?? input.social_account_id ?? "",
  ).trim();
  const contentItemId = String(
    input.contentItemId ?? input.content_item_id ?? "",
  ).trim();
  const idempotencyKey = String(input.idempotencyKey ?? "").trim();
  const scheduledAt = String(input.scheduledAt ?? input.scheduled_at ?? "").trim();

  if (!workspaceId) throw new Error("Publishing job workspace is required.");
  if (!socialAccountId) throw new Error("Publishing job social account is required.");
  if (!contentItemId) throw new Error("Publishing job content item is required.");
  if (!idempotencyKey) throw new Error("Publishing job idempotency key is required.");
  if (!scheduledAt || Number.isNaN(Date.parse(scheduledAt))) {
    throw new Error("Publishing job schedule must be a valid ISO date.");
  }

  return {
    id: input.id ?? createId("publish-job", now),
    workspaceId,
    brandId: input.brandId ?? input.brand_id ?? null,
    socialAccountId,
    contentItemId,
    contentVariantId: input.contentVariantId ?? input.content_variant_id ?? null,
    idempotencyKey,
    scheduledAt,
    status: String(input.status ?? "queued"),
    attempts: Number.isInteger(input.attempts) ? input.attempts : 0,
    providerPostId: input.providerPostId ?? input.provider_post_id ?? null,
    lastErrorCode: input.lastErrorCode ?? input.last_error_code ?? null,
    lastErrorMessage: input.lastErrorMessage ?? input.last_error_message ?? null,
    payload: input.payload ?? {},
    createdAt: input.createdAt ?? input.created_at ?? new Date(now).toISOString(),
    startedAt: input.startedAt ?? input.started_at ?? null,
    finishedAt: input.finishedAt ?? input.finished_at ?? null,
  };
}
