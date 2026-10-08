export const WORKFLOW_STEPS = Object.freeze([
  { stage: "research", agent: "Research", action: "research" },
  { stage: "strategy", agent: "Strategy", action: "strategy" },
  { stage: "draft", agent: "Writing", action: "write" },
  { stage: "creative", agent: "Creative", action: "design" },
  { stage: "review", agent: "Review", action: "review" },
  { stage: "approved", agent: "Human", action: "approve" },
  { stage: "scheduled", agent: "Publishing", action: "schedule" },
  { stage: "analytics", agent: "Analytics", action: "measure" },
  { stage: "learning", agent: "Learning", action: "learn" },
]);

const STAGE_ORDER = Object.freeze([
  "idea",
  "research",
  "strategy",
  "draft",
  "review",
  "approved",
  "scheduled",
]);

export function createOrchestratorAgent() {
  function plan({ idea, includeFuture = true } = {}) {
    const currentStage = String(idea?.stage ?? "idea");
    const currentIndex = STAGE_ORDER.indexOf(currentStage);
    const startIndex = currentIndex < 0 ? 0 : currentIndex;

    const steps = WORKFLOW_STEPS.filter((step) => {
      if (step.stage === "analytics" || step.stage === "learning") {
        return includeFuture;
      }

      if (step.stage === "research") {
        return startIndex <= 1;
      }

      if (step.stage === "strategy") {
        return startIndex <= 2;
      }

      if (step.stage === "draft" || step.stage === "creative") {
        return startIndex <= 3;
      }

      if (step.stage === "review") {
        return startIndex <= 4;
      }

      if (step.stage === "approved") {
        return startIndex <= 5;
      }

      if (step.stage === "scheduled") {
        return includeFuture;
      }

      return true;
    });

    return steps.map((step, index) => ({
      ...step,
      order: index + 1,
      status: index === 0 ? "ready" : "pending",
    }));
  }

  return Object.freeze({
    name: "Orchestrator",
    plan,
  });
}

export const orchestratorAgent = createOrchestratorAgent();
