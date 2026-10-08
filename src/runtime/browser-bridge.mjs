import { createOrbitRuntime } from "../core/runtime.mjs";
import { MemoryStore } from "../adapters/local-store.mjs";
import { createInitialState } from "../domain/state.mjs";
import { toCoreState, toUiState } from "./ui-state.mjs";
import { createRuntimeEnvironment } from "./environment.mjs";
import { parseAnalyticsReport } from "../adapters/analytics-report-parser.mjs";

const DEFAULT_UI_KEY = "orbit-v4";
const DEFAULT_AI_CONFIG = Object.freeze({
  provider: "local",
  model: "",
  baseUrl: "http://localhost:11434/api",
});

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

function readAiConfig(uiState, override = {}) {
  const stored = uiState?.settings?.ai ?? {};
  return {
    ...DEFAULT_AI_CONFIG,
    ...stored,
    ...override,
  };
}

function validateAiConfig(config) {
  const provider = String(config.provider ?? "local").toLowerCase();
  if (!["local", "ollama"].includes(provider)) {
    throw new Error("OrbitOS AI provider must be local or ollama.");
  }

  const model = String(config.model ?? "").trim();
  const baseUrl = String(
    config.baseUrl ?? DEFAULT_AI_CONFIG.baseUrl,
  ).trim();

  if (provider === "ollama" && !model) {
    throw new Error("An Ollama model name is required.");
  }

  if (provider === "ollama") {
    let url;
    try {
      url = new URL(baseUrl);
    } catch {
      throw new Error("Ollama base URL must be a valid URL.");
    }

    if (
      !["http:", "https:"].includes(url.protocol) ||
      !["localhost", "127.0.0.1"].includes(url.hostname)
    ) {
      throw new Error("OrbitOS only permits a local Ollama base URL.");
    }
  }

  return { provider, model, baseUrl };
}

function normalizeImportedMetric(row, state, options = {}) {
  const brandId = row.brandId ?? row.brandid ?? row.brand_id ?? options.brandId ?? state.activeBrandId ?? null;
  const source = row.source ?? row.reportSource ?? row.origin ?? options.source ?? "analytics-report";
  const provider = row.provider ?? row.network ?? row.platformProvider ?? options.provider ?? "imported-report";

  return {
    ...row,
    brandId,
    source,
    provider,
    isDemo: false,
  };
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
      ai: readAiConfig(previous),
    });

    const nextCoreState = await work(runtime);
    const nextUiState = toUiState(nextCoreState, previous);

    return writeStoredState(storage, key, nextUiState);
  }

  async function getEnvironment() {
    const previous = readStoredState(storage, key);
    return createRuntimeEnvironment({
      mode: "local",
      provider: "local-store",
      workspaceId: previous.workspace?.id ?? null,
      userId: null,
    });
  }

  async function snapshot() {
    const previous = readStoredState(storage, key);
    const runtime = createOrbitRuntime({
      store: new MemoryStore(toCoreState(previous)),
      ai: readAiConfig(previous),
    });

    return toUiState(await runtime.snapshot(), previous);
  }

  async function createDraft(rawIdea, brand = {}) {
    return transact((runtime) => runtime.createDraft(rawIdea, brand));
  }

  async function createBrand(brand) {
    return transact((runtime) => runtime.createBrandProfile(brand));
  }

  async function listBrands() {
    const previous = readStoredState(storage, key);
    const runtime = createOrbitRuntime({
      store: new MemoryStore(toCoreState(previous)),
      ai: readAiConfig(previous),
    });
    return runtime.listBrands();
  }

  async function setActiveBrand(brandId) {
    return transact((runtime) => runtime.setActiveBrand(brandId));
  }

  async function updateBrand(brand) {
    return transact((runtime) => runtime.updateBrand(brand));
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

  async function getAiConfig() {
    const previous = readStoredState(storage, key);
    return clone(readAiConfig(previous));
  }

  async function setAiConfig(nextConfig = {}) {
    const previous = readStoredState(storage, key);
    const config = validateAiConfig({
      ...readAiConfig(previous),
      ...nextConfig,
    });

    return writeStoredState(storage, key, {
      ...previous,
      settings: {
        ...(previous.settings ?? {}),
        ai: config,
      },
    });
  }

  async function importAnalyticsReport(text, options = {}) {
    const parsedRows = parseAnalyticsReport(text, options);
    const previous = readStoredState(storage, key);
    const next = {
      ...previous,
      metrics: [
        ...(previous.metrics ?? []),
        ...parsedRows.map((row) => normalizeImportedMetric(row, previous, options)),
      ],
    };

    return writeStoredState(storage, key, next);
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
    getEnvironment,
    createDraft,
    createBrand,
    listBrands,
    setActiveBrand,
    updateBrand,
    updateContentVariant,
    approveIdea,
    scheduleIdeaVariant,
    getAiConfig,
    setAiConfig,
    importAnalyticsReport,
    runLearning,
    publishIdeaVariant,
    exportState,
    importState,
  });
}
