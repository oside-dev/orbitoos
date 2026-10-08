import assert from "node:assert/strict";
import { createOrbitBrowserBridge } from "../src/runtime/browser-bridge.mjs";

function createMemoryStorage() {
  const data = new Map();

  return {
    getItem(key) {
      return data.has(key) ? data.get(key) : null;
    },
    setItem(key, value) {
      data.set(key, String(value));
    },
  };
}

const storage = createMemoryStorage();

storage.setItem(
  "orbit-v4",
  JSON.stringify({
    version: 4,
    workspace: { name: "Northstar Studio" },
    brand: { name: "Northstar Studio", voice: "clear" },
    ideas: [
      {
        id: "i1",
        title: "Bridge integration",
        pillar: "Systems",
        audience: "Creators",
        goal: "Education",
        brief: "Connect the real runtime.",
        stage: "Draft",
        score: 90,
        variants: {},
      },
    ],
    signals: [],
    metrics: [],
    events: [],
    settings: { publishing: false },
  }),
);

const bridge = createOrbitBrowserBridge({ storage, key: "orbit-v4" });

let state = await bridge.snapshot();
assert.equal(state.ideas[0].stage, "Draft");

state = await bridge.createDraft(
  state.ideas[0],
  state.brand,
);

assert.equal(state.ideas.length, 1);
assert.equal(state.ideas[0].stage, "Draft");
assert.equal(Object.keys(state.ideas[0].variants).length, 6);

state = await bridge.updateContentVariant({
  ideaId: state.ideas[0].id,
  platform: "TikTok",
  changes: { hook: "Bridge-edited hook" },
});
assert.equal(
  state.contentVariants.find((variant) => variant.platform === "TikTok").hook,
  "Bridge-edited hook",
);

state = await bridge.approveIdea(state.ideas[0].id);
assert.equal(state.ideas[0].stage, "Approved");

state = await bridge.scheduleIdeaVariant({
  ideaId: state.ideas[0].id,
  platform: "TikTok",
  scheduledAt: "2026-10-09T09:00:00Z",
});
assert.equal(state.schedules.length, 1);
assert.equal(state.schedules[0].platform, "TikTok");

await bridge.setAiConfig({ provider: "ollama", model: "test-local-model" });
const aiConfig = await bridge.getAiConfig();
assert.equal(aiConfig.provider, "ollama");
assert.equal(aiConfig.model, "test-local-model");

const exported = await bridge.exportState();
const restoredStorage = createMemoryStorage();
const restoredBridge = createOrbitBrowserBridge({
  storage: restoredStorage,
  key: "orbit-v4",
});
await restoredBridge.importState(exported);

const restored = await restoredBridge.snapshot();
assert.equal(restored.version, 4);
assert.equal(restored.ideas[0].stage, "Approved");
assert.equal(restored.schedules.length, 1);

console.log("OrbitOS browser bridge tests passed.");
