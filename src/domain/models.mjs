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
    audience: String(input.audience ?? "General audience").trim() || "General audience",
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
    approved: Boolean(input.approved),
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
  };
}
