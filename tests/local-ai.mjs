import assert from "node:assert/strict";
import { assertTextModel } from "../src/contracts/ai.mjs";
import { createOllamaTextModel } from "../src/adapters/ollama-text-model.mjs";
import { createOllamaContentGenerator } from "../src/adapters/ollama-content-generator.mjs";
import { createContentGenerator } from "../src/core/content-generator-factory.mjs";
import { createOrbitRuntime } from "../src/core/runtime.mjs";
import { MemoryStore } from "../src/adapters/local-store.mjs";
import { createIdea, PLATFORMS } from "../src/domain/models.mjs";

let receivedRequest;

const fakeFetch = async (url, options) => {
  receivedRequest = { url, options };

  return {
    ok: true,
    status: 200,
    async json() {
      const response = Object.fromEntries(
        PLATFORMS.map((platform) => [
          platform,
          {
            hook: "Hook for " + platform,
            body: "Body for " + platform,
            cta: "Try it.",
            hashtags: ["#orbitoos"],
          },
        ]),
      );

      return {
        model: "test-local-model",
        response: JSON.stringify(response),
        done: true,
      };
    },
  };
};

const model = createOllamaTextModel({
  model: "test-local-model",
  fetchImpl: fakeFetch,
});

assertTextModel(model);

const result = await model.generate({
  prompt: "Generate test content.",
  system: "OrbitOS test.",
});

assert.equal(result.provider, "ollama");
assert.equal(result.local, true);
assert.equal(receivedRequest.url, "http://localhost:11434/api/generate");

const requestBody = JSON.parse(receivedRequest.options.body);
assert.equal(requestBody.model, "test-local-model");
assert.equal(requestBody.stream, false);
assert.equal(requestBody.format, "json");

const generator = createOllamaContentGenerator({
  textModel: model,
});
assert.equal(createContentGenerator({ provider: "local" }).provider, undefined);
const factoryGenerator = createContentGenerator({
  provider: "ollama",
  model: "test-local-model",
  fetchImpl: fakeFetch,
});
assert.equal(factoryGenerator.provider, "ollama");

const variants = await generator.generate({
  idea: createIdea({
    title: "Local AI adapter",
    audience: "Creators",
    goal: "Education",
    brief: "Explain the adapter boundary.",
  }),
  strategy: {
    angle: "Provider independence",
    kpis: ["reach"],
  },
  brand: {
    name: "OrbitOS",
    voice: "clear",
    rules: ["No invented facts"],
  },
});

assert.deepEqual(Object.keys(variants), PLATFORMS);
assert.equal(variants.TikTok.hook, "Hook for TikTok");
assert.deepEqual(variants.TikTok.hashtags, ["#orbitoos"]);


const runtime = createOrbitRuntime({
  store: new MemoryStore(),
  contentGenerator: generator,
});
const runtimeState = await runtime.createDraft({
  title: "Async local AI runtime",
  audience: "Creators",
  goal: "Education",
});
assert.equal(runtimeState.ideas.length, 1);
assert.equal(Object.keys(runtimeState.ideas[0].variants).length, PLATFORMS.length);
assert.equal(runtimeState.ideas[0].variants.TikTok.hook, "Hook for TikTok");


console.log("OrbitOS local AI adapter tests passed.");
