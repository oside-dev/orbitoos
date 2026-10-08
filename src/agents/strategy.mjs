import { PLATFORMS } from "../domain/models.mjs";

export function createStrategyAgent() {
  return Object.freeze({
    name: "Strategy",
    run({ idea, research } = {}) {
      return {
        goal: idea.goal,
        audience: idea.audience,
        angle: research?.signals?.[0]?.topic ?? "Useful takeaway",
        platforms: [...PLATFORMS],
        kpis: ["reach", "engagement", "saves"],
      };
    },
  });
}

export const strategyAgent = createStrategyAgent();
