import assert from "node:assert/strict";
import { createOrbitRuntime } from "../src/core/runtime.mjs";
import { MemoryStore } from "../src/adapters/local-store.mjs";
import { createInitialState } from "../src/domain/state.mjs";
import { PublishingDisabledError } from "../src/adapters/null-publisher.mjs";

const runtime = createOrbitRuntime({
  store: new MemoryStore(
    createInitialState({
      brand: { name: "OrbitOS", voice: "clear" },
    }),
  ),
});

let state = await runtime.createDraft({
  title: "Runtime integration test",
  audience: "Creators",
  goal: "Education",
});

assert.equal(state.version, 1);
assert.equal(state.ideas.length, 1);
assert.equal(state.ideas[0].stage, "draft");
assert.equal(Object.keys(state.ideas[0].variants).length, 6);
assert.equal(state.research.length, 1);
assert.equal(state.audit.length, 5);
assert.equal(state.audit[0].agent, "Orchestrator");
assert.equal(state.contentItems.length, 1);
assert.equal(state.contentItems[0].ideaId, state.ideas[0].id);
assert.equal(state.contentItems[0].status, "draft");
assert.equal(state.contentVariants.length, 6);
assert.equal(
  state.contentVariants.every(
    (variant) => variant.contentItemId === state.contentItems[0].id,
  ),
  true,
);

state = await runtime.approveIdea(state.ideas[0].id);
assert.equal(state.ideas[0].stage, "approved");
assert.equal(state.contentItems[0].status, "approved");
assert.equal(state.audit.at(-1).agent, "Review");
assert.equal(
  Object.values(state.ideas[0].variants).every(
    (variant) => variant.approved,
  ),
  true,
);
assert.equal(
  state.contentVariants.every(
    (variant) => variant.status === "approved" && variant.approved,
  ),
  true,
);

state = await runtime.normalizeMetrics({
  platform: "TikTok",
  views: 1234,
  reach: 900,
  engagements: 100,
  followerDelta: 12,
});
assert.equal(state.metrics.length, 1);
assert.equal(state.metrics[0].views, 1234);
assert.equal(state.audit.at(-1).agent, "Analytics");

await assert.rejects(
  () =>
    runtime.publishIdeaVariant({
      ideaId: state.ideas[0].id,
      platform: "TikTok",
      schedule: "2026-10-09T09:00:00Z",
    }),
  (error) =>
    error instanceof PublishingDisabledError &&
    error.code === "PUBLISHING_DISABLED",
);

const backup = await runtime.exportState();
const restoredRuntime = createOrbitRuntime({
  store: new MemoryStore(),
});
await restoredRuntime.importState(backup);
const restored = await restoredRuntime.snapshot();

assert.equal(restored.version, 1);
assert.equal(restored.ideas[0].stage, "approved");
assert.equal(restored.metrics[0].platform, "TikTok");
assert.equal(restored.contentItems[0].status, "approved");
assert.equal(restored.contentVariants.length, 6);

console.log("OrbitOS runtime integration tests passed.");
