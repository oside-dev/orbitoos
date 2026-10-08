export const STATE_VERSION = 1;

const DEFAULT_STATE = Object.freeze({
  version: STATE_VERSION,
  workspace: {},
  brand: {},
  ideas: [],
  research: [],
  contentItems: [],
  contentVariants: [],
  schedules: [],
  metrics: [],
  audit: [],
  learning: [],
  learningInsights: [],
});

export function createInitialState(overrides = {}) {
  return normalizeState(overrides);
}

export function normalizeState(raw = {}) {
  const source = raw && typeof raw === "object" ? raw : {};

  return {
    ...structuredClone(DEFAULT_STATE),
    ...structuredClone(source),
    version: STATE_VERSION,
    workspace:
      source.workspace && typeof source.workspace === "object"
        ? structuredClone(source.workspace)
        : {},
    brand:
      source.brand && typeof source.brand === "object"
        ? structuredClone(source.brand)
        : {},
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
    metrics: Array.isArray(source.metrics)
      ? structuredClone(source.metrics)
      : [],
    audit: Array.isArray(source.audit) ? structuredClone(source.audit) : [],
    learning: Array.isArray(source.learning)
      ? structuredClone(source.learning)
      : [],
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
