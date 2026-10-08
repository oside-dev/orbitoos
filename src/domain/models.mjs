export const PLATFORMS = Object.freeze([
  "TikTok",
  "Instagram Reels",
  "YouTube Shorts",
  "X",
  "Facebook",
  "LinkedIn",
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
    metadata: input.metadata ?? {},
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
    name: String(brand.name ?? "").trim(),
    voice: String(brand.voice ?? "").trim(),
    audience: String(brand.audience ?? "").trim(),
    rules: Array.isArray(brand.rules) ? brand.rules.map(String) : [],
    visualDirection: String(
      brand.visualDirection ?? brand.visual_direction ?? "",
    ).trim(),
  };
}
