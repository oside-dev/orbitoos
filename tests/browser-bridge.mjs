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
  {
    ...state.ideas[0],
    stage: "Draft",
  },
  state.brand,
);

assert.equal(state.ideas.length, 1);
assert.equal(state.ideas[0].stage, "Draft");
assert.equal(Object.keys(state.ideas[0].variants).length, 6);
assert.equal(state.research.length, 1);

state = await bridge.approveIdea(state.ideas[0].id);
assert.equal(state.ideas[0].stage, "Approved");
assert.equal(
  Object.values(state.ideas[0].variants).every((variant) => variant.approved),
  true,
);

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

console.log("OrbitOS browser bridge tests passed.");
