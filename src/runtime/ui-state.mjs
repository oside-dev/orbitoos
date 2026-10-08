import { PIPELINE_STAGES, createIdea } from "../domain/models.mjs";
import { normalizeState, STATE_VERSION } from "../domain/state.mjs";

export const UI_STATE_VERSION = 4;

const UI_TO_CORE_STAGE = Object.freeze({
  Idea: "idea",
  Research: "research",
  Strategy: "strategy",
  Draft: "draft",
  Review: "review",
  Approved: "approved",
  Scheduled: "scheduled",
});

const CORE_TO_UI_STAGE = Object.freeze(
  Object.fromEntries(
    Object.entries(UI_TO_CORE_STAGE).map(([ui, core]) => [core, ui]),
  ),
);

export function toCoreStage(stage) {
  const value = String(stage ?? "");
  return UI_TO_CORE_STAGE[value] ?? (PIPELINE_STAGES.includes(value) ? value : "idea");
}

export function toUiStage(stage) {
  const value = String(stage ?? "");
  return CORE_TO_UI_STAGE[value] ?? "Idea";
}

export function toCoreIdea(idea) {
  return createIdea({
    ...idea,
    stage: toCoreStage(idea?.stage),
  });
}

export function toUiIdea(idea) {
  return {
    ...structuredClone(idea),
    stage: toUiStage(idea?.stage),
  };
}

export function toCoreState(uiState = {}) {
  const source =
    uiState && typeof uiState === "object" ? structuredClone(uiState) : {};

  return normalizeState({
    version: STATE_VERSION,
    workspace: source.workspace ?? {},
    brand: source.brand ?? {},
    ideas: Array.isArray(source.ideas) ? source.ideas.map(toCoreIdea) : [],
    research: Array.isArray(source.research) ? source.research : [],
    contentItems: Array.isArray(source.contentItems)
      ? source.contentItems
      : [],
    contentVariants: Array.isArray(source.contentVariants)
      ? source.contentVariants
      : [],
    schedules: Array.isArray(source.schedules) ? source.schedules : [],
    metrics: Array.isArray(source.metrics) ? source.metrics : [],
    audit: Array.isArray(source.audit) ? source.audit : [],
    learning:
      source.learning &&
      typeof source.learning === "object" &&
      !Array.isArray(source.learning)
        ? source.learning
        : { generatedAt: null, insights: [] },
    learningInsights: Array.isArray(source.learningInsights)
      ? source.learningInsights
      : [],
  });
}

export function toUiState(coreState, previousUiState = {}) {
  const previous =
    previousUiState && typeof previousUiState === "object"
      ? structuredClone(previousUiState)
      : {};

  const latestResearch = coreState.research.at(-1);

  return {
    ...previous,
    version: UI_STATE_VERSION,
    workspace: structuredClone(coreState.workspace),
    brand: structuredClone(coreState.brand),
    ideas: coreState.ideas.map(toUiIdea),
    research: structuredClone(coreState.research),
    contentItems: structuredClone(coreState.contentItems),
    contentVariants: structuredClone(coreState.contentVariants),
    schedules: structuredClone(coreState.schedules),
    audit: structuredClone(coreState.audit),
    learning: structuredClone(coreState.learning),
    learningInsights: structuredClone(coreState.learningInsights),
    signals:
      latestResearch?.signals?.length > 0
        ? structuredClone(latestResearch.signals)
        : Array.isArray(previous.signals)
          ? previous.signals
          : [],
    metrics: structuredClone(coreState.metrics),
  };
}
