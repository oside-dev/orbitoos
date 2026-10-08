function numeric(value) {
  const n = Number(value);
  return Number.isFinite(n) ? n : 0;
}

export function createLearningAgent() {
  return Object.freeze({
    name: "Learning",
    run({ metrics = [], contentItems = [] } = {}) {
      const rows = Array.isArray(metrics) ? metrics : [];
      const insights = [];

      if (rows.length === 0) {
        return {
          generatedAt: new Date().toISOString(),
          insights: [],
        };
      }

      const strongestEngagement = [...rows].sort(
        (a, b) =>
          numeric(b.engagements ?? b.engagement) -
          numeric(a.engagements ?? a.engagement),
      )[0];

      const strongestReach = [...rows].sort(
        (a, b) =>
          numeric(b.reach ?? b.views) - numeric(a.reach ?? a.views),
      )[0];

      if (strongestEngagement) {
        const engagement = numeric(
          strongestEngagement.engagements ?? strongestEngagement.engagement,
        );

        insights.push({
          title: "Prioritize the strongest engagement signal",
          detail:
            String(strongestEngagement.platform ?? "One platform") +
            " currently has the strongest engagement signal at " +
            engagement +
            ". Reframe winning topics for that audience before expanding.",
          category: "content-performance",
          confidence: 0.78,
          impact: "medium",
          status: "new",
        });
      }

      if (strongestReach) {
        const reach = numeric(strongestReach.reach ?? strongestReach.views);

        insights.push({
          title: "Study the highest-reach format",
          detail:
            String(strongestReach.platform ?? "One platform") +
            " has the strongest reach signal at " +
            reach +
            ". Capture its hook and pacing patterns without blindly copying it.",
          category: "distribution",
          confidence: 0.72,
          impact: "medium",
          status: "new",
        });
      }

      insights.push({
        title: "Keep learning advisory",
        detail:
          contentItems.length +
          " content items are in the local history. Strategy changes remain human-reviewed until real analytics are connected.",
        category: "governance",
        confidence: 0.95,
        impact: "high",
        status: "new",
      });

      return {
        generatedAt: new Date().toISOString(),
        insights,
      };
    },
  });
}

export const learningAgent = createLearningAgent();
