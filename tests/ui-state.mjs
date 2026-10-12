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
