import assert from "node:assert/strict";
import { createOrchestratorAgent } from "../src/agents/orchestrator.mjs";
import { createResearchAgent } from "../src/agents/research.mjs";
import { createStrategyAgent } from "../src/agents/strategy.mjs";
import { createWritingAgent } from "../src/agents/writing.mjs";
import { createCreativeAgent } from "../src/agents/creative.mjs";
import { createReviewAgent } from "../src/agents/review.mjs";
import { createAnalyticsAgent } from "../src/agents/analytics.mjs";
import { createLearningAgent } from "../src/agents/learning.mjs";
import { localResearchAdapter } from "../src/adapters/local-research.mjs";
import { localContentGeneratorAdapter } from "../src/adapters/local-content-generator.mjs";
import { localMetricsAdapter } from "../src/adapters/local-metrics.mjs";
import { createIdea, PLATFORMS } from "../src/domain/models.mjs";

const idea = createIdea({
  title: "Agent contract test",
  audience: "Creators",
  goal: "Education",
});

const orchestrator = createOrchestratorAgent();
const plan = orchestrator.plan({ idea });

assert.equal(plan[0].agent, "Research");
assert.equal(plan[0].status, "ready");
assert.ok(plan.some((step) => step.agent === "Creative"));
assert.ok(plan.some((step) => step.agent === "Learning"));

const researchAgent = createResearchAgent({ adapter: localResearchAdapter });
const research = researchAgent.run({ idea, brand: {} });
assert.equal(researchAgent.name, "Research");
assert.equal(research.signals.length, 3);

const strategyAgent = createStrategyAgent();
const strategy = strategyAgent.run({ idea, research });
assert.equal(strategyAgent.name, "Strategy");
assert.deepEqual(strategy.platforms, PLATFORMS);

const writingAgent = createWritingAgent({
  adapter: localContentGeneratorAdapter,
});
const variants = writingAgent.run({ idea, strategy, brand: {} });
assert.equal(writingAgent.name, "Writing");
assert.deepEqual(Object.keys(variants), PLATFORMS);

const creativeAgent = createCreativeAgent();
const creativeVariants = creativeAgent.run({
  variants,
  brand: { visualDirection: "clean" },
});
assert.equal(creativeAgent.name, "Creative");
assert.deepEqual(Object.keys(creativeVariants), PLATFORMS);
assert.ok(
  Object.values(creativeVariants).every((variant) => variant.creativeBrief),
);

const reviewAgent = createReviewAgent();
const review = reviewAgent.run({ variants: creativeVariants, brand: {} });
assert.equal(reviewAgent.name, "Review");
assert.equal(review.pass, true);
assert.equal(review.humanApprovalRequired, true);

const analyticsAgent = createAnalyticsAgent({ adapter: localMetricsAdapter });
const normalized = analyticsAgent.run({
  platform: "TikTok",
  views: 1000,
  reach: 700,
  engagements: 80,
  followerDelta: 10,
});
assert.equal(analyticsAgent.name, "Analytics");
assert.equal(normalized.views, 1000);

const learningAgent = createLearningAgent();
const learning = learningAgent.run({
  metrics: [normalized],
  contentItems: [{ id: "content-1" }],
});
assert.equal(learningAgent.name, "Learning");
assert.equal(learning.insights.length, 3);

console.log("OrbitOS agent tests passed.");
