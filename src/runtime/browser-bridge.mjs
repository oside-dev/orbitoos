import { createOrbitRuntime } from "../core/runtime.mjs";
import { MemoryStore } from "../adapters/local-store.mjs";
import { createInitialState } from "../domain/state.mjs";
import { toCoreState, toUiState } from "./ui-state.mjs";

const DEFAULT_UI_KEY = "orbit-v4";

function clone(value) {
  return structuredClone(value);
}

function readStoredState(storage, key) {
  try {
    const raw = storage.getItem(key);
    if (!raw) return { ...createInitialState(), version: 4 };

    const parsed = JSON.parse(raw);
    return parsed && typeof parsed === "object" ? parsed : { ...createInitialState(), version: 4 };
  } catch {
    return { ...createInitialState(), version: 4 };
  }
}

function writeStoredState(storage, key, state) {
  storage.setItem(key, JSON.stringify(state));
  return clone(state);
}

export function createOrbitBrowserBridge({
  storage = globalThis.localStorage,
  key = DEFAULT_UI_KEY,
} = {}) {
  if (!storage) {
    throw new Error("OrbitOS browser bridge requires a storage implementation.");
  }

  async function transact(work) {
    const previous = readStoredState(storage, key);
    const runtime = createOrbitRuntime({
      store: new MemoryStore(toCoreState(previous)),
    });

    const nextCoreState = await work(runtime);
    const nextUiState = toUiState(nextCoreState, previous);

    return writeStoredState(storage, key, nextUiState);
  }

  async function snapshot() {
    const previous = readStoredState(storage, key);
    const runtime = createOrbitRuntime({
      store: new MemoryStore(toCoreState(previous)),
    });

    return toUiState(await runtime.snapshot(), previous);
  }

  async function createDraft(rawIdea, brand = {}) {
    return transact((runtime) => runtime.createDraft(rawIdea, brand));
  }

  async function updateContentVariant(input) {
    return transact((runtime) => runtime.updateContentVariant(input));
  }

  async function approveIdea(ideaId) {
    return transact((runtime) => runtime.approveIdea(ideaId));
  }

  async function scheduleIdeaVariant(input) {
    return transact((runtime) => runtime.scheduleIdeaVariant(input));
  }

  async function runLearning() {
    return transact((runtime) => runtime.runLearning());
  }

  async function publishIdeaVariant(input) {
    return transact((runtime) => runtime.publishIdeaVariant(input));
  }

  async function exportState() {
    return JSON.stringify(readStoredState(storage, key), null, 2);
  }

  async function importState(json) {
    const parsed = JSON.parse(json);
    const source = parsed?.state ?? parsed;

    if (!source || typeof source !== "object" || Array.isArray(source)) {
      throw new Error("Invalid OrbitOS browser state.");
    }

    const coreState = toCoreState(source);
    const normalized = toUiState(coreState, source);

    return writeStoredState(storage, key, normalized);
  }

  return Object.freeze({
    snapshot,
    createDraft,
    updateContentVariant,
    approveIdea,
    scheduleIdeaVariant,
    runLearning,
    publishIdeaVariant,
    exportState,
    importState,
  });
}
