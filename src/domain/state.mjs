export const STATE_VERSION = 1;

const DEFAULT_STATE = Object.freeze({
  version: STATE_VERSION,
  workspace: {},
  brand: {},
  brands: [],
  activeBrandId: null,
  ideas: [],
  research: [],
  contentItems: [],
  contentVariants: [],
  schedules: [],
  socialAccounts: [],
  publishingJobs: [],
  metrics: [],
  audit: [],
  learning: {
    generatedAt: null,
    insights: [],
  },
  learningInsights: [],
});

export function createInitialState(overrides = {}) {
  return normalizeState(overrides);
}

export function normalizeState(raw = {}) {
  const source = raw && typeof raw === "object" ? raw : {};

  const learning =
    source.learning &&
    typeof source.learning === "object" &&
    !Array.isArray(source.learning)
      ? structuredClone(source.learning)
      : {
          generatedAt: null,
          insights: [],
        };

  const legacyBrand =
    source.brand && typeof source.brand === "object"
      ? structuredClone(source.brand)
      : {};
  const sourceBrands = Array.isArray(source.brands)
    ? source.brands.filter((brand) => brand && typeof brand === "object")
    : [];

  const brands =
    sourceBrands.length > 0
      ? sourceBrands
      : legacyBrand.name
        ? [{ ...legacyBrand, id: legacyBrand.id ?? "brand-default" }]
        : [];

  const activeBrandId =
    source.activeBrandId ??
    brands[0]?.id ??
    null;

  const activeBrand =
    brands.find((brand) => brand.id === activeBrandId) ??
    legacyBrand ??
    {};

  const normalizedIdeas = Array.isArray(source.ideas)
    ? structuredClone(source.ideas).map((idea) => ({
        ...idea,
        metadata: {
          ...(idea.metadata ?? {}),
          brandId: idea.metadata?.brandId ?? activeBrandId ?? null,
        },
      }))
    : [];

  const ideaBrandById = new Map(
    normalizedIdeas.map((idea) => [idea.id, idea.metadata?.brandId ?? null]),
  );

  const normalizedContentItems = Array.isArray(source.contentItems)
    ? structuredClone(source.contentItems).map((item) => ({
        ...item,
        brandId:
          item.brandId ??
          ideaBrandById.get(item.ideaId) ??
          activeBrandId ??
          null,
      }))
    : [];

  const contentBrandById = new Map(
    normalizedContentItems.map((item) => [item.id, item.brandId ?? null]),
  );

  const normalizedContentVariants = Array.isArray(source.contentVariants)
    ? structuredClone(source.contentVariants).map((variant) => ({
        ...variant,
        brandId:
          variant.brandId ??
          contentBrandById.get(variant.contentItemId) ??
          activeBrandId ??
          null,
      }))
    : [];

  const normalizedSchedules = Array.isArray(source.schedules)
    ? structuredClone(source.schedules).map((schedule) => ({
        ...schedule,
        brandId:
          schedule.brandId ??
          contentBrandById.get(schedule.contentItemId) ??
          activeBrandId ??
          null,
      }))
    : [];

  const socialAccountBrandById = new Map(
    (Array.isArray(source.socialAccounts) ? source.socialAccounts : []).map(
      (account) => [account.id, account.brandId ?? null],
    ),
  );

  const normalizedSocialAccounts = Array.isArray(source.socialAccounts)
    ? structuredClone(source.socialAccounts).map((account) => ({
        ...account,
        workspaceId: account.workspaceId ?? source.workspace?.id ?? null,
        brandId: account.brandId ?? activeBrandId ?? null,
      }))
    : [];

  const normalizedPublishingJobs = Array.isArray(source.publishingJobs)
    ? structuredClone(source.publishingJobs).map((job) => ({
        ...job,
        workspaceId: job.workspaceId ?? source.workspace?.id ?? null,
        brandId:
          job.brandId ??
          socialAccountBrandById.get(job.socialAccountId) ??
          activeBrandId ??
          null,
      }))
    : [];

  const normalizedMetrics = Array.isArray(source.metrics)
    ? structuredClone(source.metrics).map((metric) => ({
        ...metric,
        brandId:
          metric.brandId ??
          contentBrandById.get(metric.contentItemId) ??
          activeBrandId ??
          null,
      }))
    : [];

  const normalizedAudit = Array.isArray(source.audit)
    ? structuredClone(source.audit).map((run) => ({
        ...run,
        brandId: run.brandId ?? activeBrandId ?? null,
      }))
    : [];

  const normalizedLearningInsights = Array.isArray(source.learningInsights)
    ? structuredClone(source.learningInsights).map((insight) => ({
        ...insight,
        brandId: insight.brandId ?? activeBrandId ?? null,
      }))
    : [];

  return {
    ...structuredClone(DEFAULT_STATE),
    ...structuredClone(source),
    version: STATE_VERSION,
    workspace:
      source.workspace && typeof source.workspace === "object"
        ? structuredClone(source.workspace)
        : {},
    brand: structuredClone(activeBrand),
    brands: structuredClone(brands),
    activeBrandId,
    ideas: normalizedIdeas,
    research: Array.isArray(source.research)
      ? structuredClone(source.research)
      : [],
    contentItems: normalizedContentItems,
    contentVariants: normalizedContentVariants,
    schedules: normalizedSchedules,
    socialAccounts: normalizedSocialAccounts,
    publishingJobs: normalizedPublishingJobs,
    metrics: normalizedMetrics,
    audit: normalizedAudit,
    learning,
    learningInsights: normalizedLearningInsights,
  };
}

export function serializeState(state) {
  return JSON.stringify(normalizeState(state), null, 2);
}

export function parseState(json) {
  const parsed = JSON.parse(json);
  if (!parsed || typeof parsed !== "object" || Array.isArray(parsed)) {
    throw new Error("Invalid OrbitOS state.");
  }
  return normalizeState(parsed.state ?? parsed);
}
