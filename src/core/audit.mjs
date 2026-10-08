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
]);

export function createAgentRun({
  agent,
  task,
  status = "completed",
  input = {},
  output = {},
  now = Date.now(),
}) {
  const normalizedAgent = String(agent ?? "").trim();
  if (!AGENTS.includes(normalizedAgent)) {
    throw new Error("Unknown OrbitOS agent: " + normalizedAgent);
  }

  return {
    id: createId("run", now),
    agent: normalizedAgent,
    task: String(task ?? "").trim(),
    status: String(status),
    input,
    output,
    startedAt: new Date(now).toISOString(),
    finishedAt: status === "running" || status === "queued"
      ? null
      : new Date(now).toISOString(),
  };
}

export function createPipelineAudit({ idea, research, strategy, review, now = Date.now() }) {
  return [
    createAgentRun({
      agent: "Research",
      task: "Synthesize local research signals",
      input: { ideaId: idea.id },
      output: {
        signalCount: research.signals.length,
        opportunityScore: research.opportunityScore,
      },
      now,
    }),
    createAgentRun({
      agent: "Strategy",
      task: "Build platform strategy and KPIs",
      input: { ideaId: idea.id },
      output: {
        platforms: strategy.platforms,
        kpis: strategy.kpis,
      },
      now: now + 1,
    }),
    createAgentRun({
      agent: "Writing",
      task: "Generate platform-native variants",
      input: { ideaId: idea.id },
      output: {
        variantCount: Object.keys(idea.variants ?? {}).length,
      },
      now: now + 2,
    }),
    createAgentRun({
      agent: "Review",
      task: "Review generated variants against guardrails",
      input: { ideaId: idea.id },
      output: {
        pass: review.pass,
        reasons: review.reasons,
        humanApprovalRequired: review.humanApprovalRequired,
      },
      now: now + 3,
    }),
  ];
}
