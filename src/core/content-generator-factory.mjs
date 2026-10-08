import { localContentGeneratorAdapter } from "../adapters/local-content-generator.mjs";
import { createOllamaContentGenerator } from "../adapters/ollama-content-generator.mjs";
import { createOllamaTextModel } from "../adapters/ollama-text-model.mjs";

export const AI_PROVIDERS = Object.freeze(["local", "ollama"]);

export function createContentGenerator({
  provider = "local",
  model,
  baseUrl,
  fetchImpl = globalThis.fetch,
  keepAlive = "5m",
  timeoutMs = 60000,
} = {}) {
  const normalizedProvider = String(provider ?? "local").toLowerCase();

  if (normalizedProvider === "local") {
    return localContentGeneratorAdapter;
  }

  if (normalizedProvider === "ollama") {
    const textModel = createOllamaTextModel({
      model,
      baseUrl,
      fetchImpl,
      keepAlive,
      timeoutMs,
    });

    return createOllamaContentGenerator({ textModel });
  }

  throw new Error(
    "Unsupported OrbitOS AI provider: " + normalizedProvider + ".",
  );
}
