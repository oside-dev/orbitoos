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
    ideas: Array.isArray(source.ideas) ? structuredClone(source.ideas) : [],
    research: Array.isArray(source.research)
      ? structuredClone(source.research)
      : [],
    contentItems: Array.isArray(source.contentItems)
      ? structuredClone(source.contentItems)
      : [],
    contentVariants: Array.isArray(source.contentVariants)
      ? structuredClone(source.contentVariants)
      : [],
    schedules: Array.isArray(source.schedules)
      ? structuredClone(source.schedules)
      : [],
    metrics: Array.isArray(source.metrics) ? structuredClone(source.metrics) : [],
    audit: Array.isArray(source.audit) ? structuredClone(source.audit) : [],
    learning,
    learningInsights: Array.isArray(source.learningInsights)
      ? structuredClone(source.learningInsights)
      : [],
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
