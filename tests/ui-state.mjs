import assert from "node:assert/strict";
import { createInitialState } from "../src/domain/state.mjs";
import { toUiState } from "../src/runtime/ui-state.mjs";

const coreState = createInitialState();
const projectedWithoutUiHistory = toUiState(coreState);
assert.deepEqual(
  projectedWithoutUiHistory.events,
  [],
  "authenticated/core state projection must supply an empty activity list when no UI history exists",
);
assert.deepEqual(
  projectedWithoutUiHistory.brand.rules,
  [],
  "UI projection must normalize an absent brand guardrail list to an empty array",
);
assert.deepEqual(
  projectedWithoutUiHistory.settings,
  {
    costGuard: true,
    autoResearch: true,
    publishing: false,
    ai: {
      provider: "local",
      model: "",
      baseUrl: "http://localhost:11434/api",
    },
  },
  "authenticated/core state projection must provide the legacy UI settings object",
);

const coreStateWithPersistedAi = createInitialState({
  workspace: {
    id: "workspace-ui-state",
    settings: {
      ai: {
        provider: "ollama",
        model: "qa-model",
        baseUrl: "http://localhost:11434/api",
      },
    },
  },
});
const projectedSettings = toUiState(coreStateWithPersistedAi);
assert.deepEqual(projectedSettings.settings.ai, {
  provider: "ollama",
  model: "qa-model",
  baseUrl: "http://localhost:11434/api",
});

const priorEvents = [["12:00", "Browser runtime initialized"]];
const projectedWithUiHistory = toUiState(coreState, { events: priorEvents });
assert.deepEqual(projectedWithUiHistory.events, priorEvents);
assert.notEqual(
  projectedWithUiHistory.events,
  priorEvents,
  "the UI projection must clone existing activity history",
);

const malformedHistory = toUiState(coreState, { events: null });
assert.deepEqual(
  malformedHistory.events,
  [],
  "malformed UI activity history should normalize to an empty list",
);

console.log("OrbitOS UI-state normalization tests passed.");
