import { createId } from "../domain/models.mjs";

export const AGENTS = Object.freeze([
  "Orchestrator",
  "Research",
  "Strategy",
  "Writing",
  "Creative",
  "Review",
  "Publishing",
  "Analytics",
  "Learning",
  "Human",
]);

export function createAgentRun({
  agent,
  task,
  status = "completed",
  input = {},
  output = {},
  brandId = null,
  now = Date.now(),
}) {
  const normalizedAgent = String(agent ?? "").trim();
  if (!AGENTS.includes(normalizedAgent)) {
    throw new Error("Unknown OrbitOS agent: " + normalizedAgent);
  }

  return {
    id: createId("run", now),
    brandId,
    agent: normalizedAgent,
    task: String(task ?? "").trim(),
    status: String(status),
    input,
    output,
    startedAt: new Date(now).toISOString(),
    finishedAt:
      status === "running" || status === "queued"
        ? null
        : new Date(now).toISOString(),
  };
}

export function createPipelineAudit({
  idea,
  research,
  strategy,
  review,
  workflowPlan = [],
  brandId = null,
  now = Date.now(),
}) {
  return [
    createAgentRun({
      agent: "Orchestrator",
      brandId,
      task: "Plan content operating workflow",
      input: { ideaId: idea.id },
      output: {
        steps: workflowPlan.map((step) => ({
          order: step.order,
          agent: step.agent,
          action: step.action,
        })),
      },
      now,
    }),
    createAgentRun({
      agent: "Research",
      brandId,
      task: "Synthesize research signals",
      input: { ideaId: idea.id },
      output: {
        signalCount: research.signals.length,
        opportunityScore: research.opportunityScore,
      },
      now: now + 1,
    }),
    createAgentRun({
      agent: "Strategy",
      brandId,
      task: "Build platform strategy and KPIs",
      input: { ideaId: idea.id },
      output: {
        platforms: strategy.platforms,
        kpis: strategy.kpis,
      },
      now: now + 2,
    }),
    createAgentRun({
      agent: "Writing",
      brandId,
      task: "Generate platform-native variants",
      input: { ideaId: idea.id },
      output: {
        variantCount: Object.keys(idea.variants ?? {}).length,
      },
      now: now + 3,
    }),
    createAgentRun({
      agent: "Creative",
      brandId,
      task: "Attach platform-native creative direction",
      input: { ideaId: idea.id },
      output: {
        platforms: Object.keys(idea.variants ?? {}),
      },
      now: now + 4,
    }),
    createAgentRun({
      agent: "Review",
      brandId,
      task: "Review generated variants against guardrails",
      input: { ideaId: idea.id },
      output: {
        pass: review.pass,
        reasons: review.reasons,
        humanApprovalRequired: review.humanApprovalRequired,
      },
      now: now + 5,
    }),
  ];
}
