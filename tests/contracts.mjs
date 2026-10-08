import assert from "node:assert/strict";
import { PLATFORMS, createIdea } from "../src/domain/models.mjs";
import { assertAdapter, assertNormalizedMetrics } from "../src/contracts/adapters.mjs";
import { localResearchAdapter } from "../src/adapters/local-research.mjs";
import { localMetricsAdapter } from "../src/adapters/local-metrics.mjs";
import {
  nullPublisherAdapter,
  PublishingDisabledError,
} from "../src/adapters/null-publisher.mjs";
import { generateLocalVariants } from "../src/adapters/local-content-generator.mjs";

const idea = createIdea({ title: "Contract test idea" });

assertAdapter("research", localResearchAdapter);
assertAdapter("metrics", localMetricsAdapter);
assertAdapter("publisher", nullPublisherAdapter);
assertAdapter("contentGenerator", { generate: generateLocalVariants });

const research = await localResearchAdapter.research({ idea, brand: {} });
assert.equal(research.signals.length, 3);
assert.ok(research.opportunityScore > 0);
assert.equal(research.generatedBy, "local-research");

const metrics = localMetricsAdapter.normalize({
  platform: "X",
  snapshotDate: "2026-10-08",
  views: "12.4",
  reach: 9,
  engagements: 3,
  followerDelta: -1,
});
assertNormalizedMetrics(metrics);
assert.equal(metrics.views, 12);
assert.equal(metrics.followerDelta, -1);
assert.equal(metrics.isDemo, true);

await assert.rejects(
  () => nullPublisherAdapter.publish({
    variant: { platform: "X" },
    schedule: null,
    approval: false,
  }),
  (error) => error instanceof PublishingDisabledError &&
    error.code === "PUBLISHING_DISABLED",
);

const variants = generateLocalVariants({ idea, brand: { voice: "direct" } });
assert.deepEqual(Object.keys(variants), PLATFORMS);
console.log("OrbitOS adapter contract tests passed.");
