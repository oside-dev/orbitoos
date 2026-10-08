import assert from "node:assert/strict";
import { createInitialState, normalizeState } from "../src/domain/state.mjs";
import { createOrbitRuntime } from "../src/core/runtime.mjs";
import { MemoryStore } from "../src/adapters/local-store.mjs";

const migrated = normalizeState({
  brand: {
    name: "Legacy Brand",
    voice: "clear",
    audience: "Creators",
  },
  ideas: [
    {
      id: "legacy-idea",
      title: "Legacy content",
      stage: "idea",
    },
  ],
});

assert.equal(migrated.brands.length, 1);
assert.equal(migrated.activeBrandId, "brand-default");
assert.equal(migrated.ideas[0].metadata.brandId, "brand-default");

const runtime = createOrbitRuntime({
  store: new MemoryStore(
    createInitialState({
      brand: {
        id: "brand-a",
        name: "Brand A",
        voice: "clear",
        audience: "Creators A",
      },
    }),
  ),
});

let state = await runtime.createBrandProfile({
  id: "brand-b",
  name: "Brand B",
  voice: "bold",
  audience: "Creators B",
});

assert.equal(state.brands.length, 2);
assert.equal(state.activeBrandId, "brand-a");

state = await runtime.setActiveBrand("brand-b");
assert.equal(state.brand.id, "brand-b");
assert.equal(state.activeBrandId, "brand-b");

state = await runtime.createDraft({
  title: "Brand B content",
  audience: "Creators B",
  goal: "Education",
});

const brandBIdea = state.ideas.find((idea) => idea.title === "Brand B content");
assert.equal(brandBIdea.metadata.brandId, "brand-b");
assert.equal(
  state.contentItems.find((item) => item.ideaId === brandBIdea.id).brandId,
  "brand-b",
);
assert.equal(
  state.contentVariants.every((variant) => variant.brandId === "brand-b"),
  true,
);

state = await runtime.setActiveBrand("brand-a");
state = await runtime.createDraft({
  title: "Brand A content",
  audience: "Creators A",
  goal: "Reach",
});

const brandAIdea = state.ideas.find((idea) => idea.title === "Brand A content");
assert.equal(brandAIdea.metadata.brandId, "brand-a");

state = await runtime.normalizeMetrics({
  brandId: "brand-a",
  platform: "TikTok",
  views: 1000,
  reach: 900,
  engagements: 80,
  followerDelta: 7,
});
state = await runtime.normalizeMetrics({
  brandId: "brand-b",
  platform: "TikTok",
  views: 3000,
  reach: 2500,
  engagements: 450,
  followerDelta: 21,
});

state = await runtime.setActiveBrand("brand-a");
state = await runtime.runLearning();

assert.equal(
  state.learning.insights.some((insight) => insight.brandId === "brand-a"),
  true,
);
assert.equal(
  state.learningInsights.at(-1).brandId,
  "brand-a",
);

console.log("OrbitOS multi-brand tests passed.");
