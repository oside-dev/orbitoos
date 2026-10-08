import assert from "node:assert/strict";
import { createOrbitRuntime } from "../src/core/runtime.mjs";
import { MemoryStore } from "../src/adapters/local-store.mjs";
import { createInitialState } from "../src/domain/state.mjs";
import { PublishingGateError } from "../src/core/publishing-gateway.mjs";

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
assert.equal(state.audit.length, 6);
assert.deepEqual(
  state.audit.map((run) => run.agent),
  ["Orchestrator", "Research", "Strategy", "Writing", "Creative", "Review"],
);
assert.equal(state.contentItems.length, 1);

state = await runtime.updateBrand({
  name: "Updated OrbitOS",
  voice: "direct",
  audience: "Builders",
  rules: ["No invented facts"],
});
assert.equal(state.brand.name, "Updated OrbitOS");
assert.equal(state.brand.audience, "Builders");
assert.equal(state.contentVariants.length, 6);
assert.ok(
  state.contentVariants.every((variant) => variant.creativeBrief),
);

const initialVersion = state.contentVariants.find(
  (variant) => variant.platform === "TikTok",
).version;

state = await runtime.updateContentVariant({
  ideaId: state.ideas[0].id,
  platform: "TikTok",
  changes: {
    hook: "A sharper hook for the runtime test.",
  },
});
const edited = state.contentVariants.find(
  (variant) => variant.platform === "TikTok",
);
assert.equal(edited.hook, "A sharper hook for the runtime test.");
assert.equal(edited.approved, false);
assert.equal(edited.version, initialVersion + 1);

state = await runtime.approveIdea(state.ideas[0].id);
assert.equal(state.ideas[0].stage, "approved");
assert.equal(state.contentItems[0].status, "approved");
assert.equal(
  Object.values(state.ideas[0].variants).every((variant) => variant.approved),
  true,
);

const scheduledAt = "2026-10-09T09:00:00Z";
state = await runtime.scheduleIdeaVariant({
  ideaId: state.ideas[0].id,
  platform: "TikTok",
  scheduledAt,
});
assert.equal(state.ideas[0].stage, "approved");
assert.equal(state.schedules.length, 1);
assert.equal(state.schedules[0].platform, "TikTok");
assert.equal(state.schedules[0].scheduledAt, scheduledAt);
assert.equal(
  state.contentVariants.find((variant) => variant.platform === "TikTok").status,
  "scheduled",
);

const beforeDuplicate = state.schedules.length;
state = await runtime.scheduleIdeaVariant({
  ideaId: state.ideas[0].id,
  platform: "TikTok",
  scheduledAt,
});
assert.equal(state.schedules.length, beforeDuplicate);

await assert.rejects(
  () =>
    runtime.publishIdeaVariant({
      ideaId: state.ideas[0].id,
      platform: "TikTok",
    }),
  (error) =>
    error instanceof PublishingGateError &&
    error.code === "PUBLISHING_DISABLED",
);
state = await runtime.snapshot();
assert.equal(state.audit.at(-1).agent, "Publishing");
const publishingRuntime = createOrbitRuntime({
  store: new MemoryStore(createInitialState()),
  publisher: {
    provider: "test-publisher",
    enabled: true,
    official: true,
    credentialsReady: true,
    supportsIdempotency: true,
    rateLimitReady: true,
    async publish(input) {
      assert.equal(input.approval, true);
      assert.match(input.idempotencyKey, /^schedule-/);
      return { published: true, idempotencyKey: input.idempotencyKey };
    },
  },
});
let publishingState = await publishingRuntime.createDraft({
  title: "Publishing gateway test",
  audience: "Creators",
  goal: "Education",
});
publishingState = await publishingRuntime.approveIdea(publishingState.ideas[0].id);
publishingState = await publishingRuntime.scheduleIdeaVariant({
  ideaId: publishingState.ideas[0].id,
  platform: "TikTok",
  scheduledAt: "2026-10-09T09:00:00Z",
});
const publishResult = await publishingRuntime.publishIdeaVariant({
  ideaId: publishingState.ideas[0].id,
  platform: "TikTok",
});
assert.equal(publishResult.published, true);
const publishingSnapshot = await publishingRuntime.snapshot();
assert.equal(publishingSnapshot.audit.at(-1).agent, "Publishing");
assert.equal(publishingSnapshot.audit.at(-1).output.success, true);

const duePublishingRuntime = createOrbitRuntime({
  store: new MemoryStore(createInitialState()),
  publisher: {
    provider: "due-publisher",
    enabled: true,
    official: true,
    credentialsReady: true,
    supportsIdempotency: true,
    rateLimitReady: true,
    async publish(input) {
      return { published: true, idempotencyKey: input.idempotencyKey };
    },
  },
});
let dueState = await duePublishingRuntime.createDraft({
  title: "Due schedule runner",
  audience: "Creators",
  goal: "Education",
});
dueState = await duePublishingRuntime.approveIdea(dueState.ideas[0].id);
dueState = await duePublishingRuntime.scheduleIdeaVariant({
  ideaId: dueState.ideas[0].id,
  platform: "TikTok",
  scheduledAt: "2026-10-08T00:00:00Z",
});
const dueResult = await duePublishingRuntime.runDuePublishing(
  Date.parse("2026-10-08T01:00:00Z"),
);
assert.deepEqual(dueResult.results, [
  { scheduleId: dueState.schedules[0].id, status: "published" },
]);
const dueSnapshot = await duePublishingRuntime.snapshot();
assert.equal(dueSnapshot.schedules[0].status, "published");

state = await runtime.normalizeMetrics({
  platform: "TikTok",
  views: 1234,
  reach: 900,
  engagements: 100,
  followerDelta: 12,
});
assert.equal(state.metrics.length, 1);
assert.equal(state.audit.at(-1).agent, "Analytics");

state = await runtime.runLearning();
assert.equal(state.learning.insights.length, 3);
assert.equal(state.learningInsights.length, 3);
assert.equal(state.audit.at(-1).agent, "Learning");

const backup = await runtime.exportState();
const restoredRuntime = createOrbitRuntime({
  store: new MemoryStore(),
});
await restoredRuntime.importState(backup);
const restored = await restoredRuntime.snapshot();

assert.equal(restored.ideas[0].stage, "approved");
assert.equal(restored.schedules.length, 1);
assert.equal(restored.schedules[0].platform, "TikTok");
assert.equal(restored.contentVariants.length, 6);
assert.equal(restored.learningInsights.length, 3);

console.log("OrbitOS runtime integration tests passed.");
