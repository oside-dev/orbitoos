import assert from "node:assert/strict";
import { createIdea, PLATFORMS } from "../src/domain/models.mjs";
import { runLocalPipeline } from "../src/core/pipeline.mjs";
import { MemoryStore } from "../src/adapters/local-store.mjs";

const idea = createIdea({
  title: "Build one idea into six platform-native posts",
  audience: "Solo marketers",
  goal: "Education",
});

const result = runLocalPipeline(idea, {
  name: "OrbitOS",
  voice: "clear, direct, useful",
  audience: "creators",
  rules: ["No invented facts"],
});

assert.equal(result.idea.stage, "draft");
assert.equal(Object.keys(result.variants).length, PLATFORMS.length);
assert.equal(Object.keys(result.idea.variants).length, PLATFORMS.length);
assert.equal(result.execution.publishingEnabled, false);
assert.equal(result.execution.requiresHumanApproval, true);
assert.equal(result.research.generatedBy, "local-research");
assert.equal(result.audit.length, 6);
assert.deepEqual(
  result.audit.map((run) => run.agent),
  ["Orchestrator", "Research", "Strategy", "Writing", "Creative", "Review"],
);
assert.ok(result.workflowPlan.length > 0);
assert.ok(
  Object.values(result.variants).every((variant) => variant.creativeBrief),
);

const store = new MemoryStore({ ideas: [] });
await store.update((state) => {
  state.ideas.push(idea);
  return state;
});
const stored = await store.get();

assert.equal(stored.ideas.length, 1);
assert.equal(stored.ideas[0].title, idea.title);

console.log("OrbitOS smoke tests passed.");
