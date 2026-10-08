function numeric(value) {
  const n = Number(value);
  return Number.isFinite(n) ? n : 0;
}

function engagementRate(row) {
  const engagements = numeric(row.engagements ?? row.engagement);
  const denominator = numeric(row.reach ?? row.views);

  if (denominator <= 0) return 0;
  return (engagements / denominator) * 100;
}

function confidence(sampleCount, isDemo) {
  const base = Math.min(0.92, 0.55 + Math.min(sampleCount, 10) * 0.035);
  return isDemo ? Math.min(base, 0.7) : base;
}

export function createLearningAgent() {
  return Object.freeze({
    name: "Learning",
    run({
      metrics = [],
      contentItems = [],
      contentVariants = [],
      ideas = [],
    } = {}) {
      const rows = Array.isArray(metrics) ? metrics : [];
      const items = Array.isArray(contentItems) ? contentItems : [];
      const variants = Array.isArray(contentVariants) ? contentVariants : [];
      const ideaRows = Array.isArray(ideas) ? ideas : [];
      const insights = [];

      if (rows.length === 0) {
        return {
          generatedAt: new Date().toISOString(),
          insights: [],
        };
      }

      const strongestEngagementRate = [...rows].sort(
        (a, b) => engagementRate(b) - engagementRate(a),
      )[0];

      const strongestReach = [...rows].sort(
        (a, b) =>
          numeric(b.reach ?? b.views) -
          numeric(a.reach ?? a.views),
      )[0];

      const strongestEngagement = [...rows].sort(
        (a, b) =>
          numeric(b.engagements ?? b.engagement) -
          numeric(a.engagements ?? a.engagement),
      )[0];

      const titleFor = (row) => {
        const content = items.find((item) => item.id === row.contentItemId);
        return content?.title ?? String(row.platform ?? "Platform");
      };

      const variantFor = (row) => {
        return variants.find(
          (variant) =>
            variant.contentItemId === row.contentItemId &&
            variant.platform === row.platform,
        );
      };

      if (strongestEngagementRate) {
        const rate = engagementRate(strongestEngagementRate);
        const variant = variantFor(strongestEngagementRate);
        const title = titleFor(strongestEngagementRate);

        insights.push({
          title: "Study the strongest engagement rate",
          detail:
            title +
            " on " +
            String(strongestEngagementRate.platform ?? "one platform") +
            " is producing an estimated " +
            rate.toFixed(1) +
            "% engagement rate from " +
            numeric(strongestEngagementRate.reach ?? strongestEngagementRate.views).toLocaleString() +
            " reached/views. Preserve the winning structure" +
            (variant?.hook ? " and inspect its hook pattern." : "."),
          category: "content-performance",
          confidence: confidence(rows.length, Boolean(strongestEngagementRate.isDemo)),
          impact: "high",
          status: "new",
        });
      }

      const strategyScores = new Map();

      for (const row of rows) {
        const content = items.find((item) => item.id === row.contentItemId);
        const idea = ideaRows.find((item) => item.id === content?.ideaId);
        const angle = String(idea?.strategy?.angle ?? "").trim();
        if (!angle) continue;

        const bucket = strategyScores.get(angle) ?? {
          angle,
          count: 0,
          engagementTotal: 0,
          reachTotal: 0,
        };

        bucket.count += 1;
        bucket.engagementTotal += engagementRate(row);
        bucket.reachTotal += numeric(row.reach ?? row.views);
        strategyScores.set(angle, bucket);
      }

      const strongestStrategy = [...strategyScores.values()]
        .sort((a, b) =>
          (b.engagementTotal / Math.max(b.count, 1)) -
          (a.engagementTotal / Math.max(a.count, 1))
        )[0];

      if (strongestStrategy) {
        const averageRate =
          strongestStrategy.engagementTotal /
          Math.max(strongestStrategy.count, 1);

        insights.push({
          title: "Reuse the strongest strategy angle",
          detail:
            "The strategy angle '" +
            strongestStrategy.angle +
            "' has the strongest observed engagement rate at an average of " +
            averageRate.toFixed(1) +
            "% across " +
            strongestStrategy.count +
            " metric record" +
            (strongestStrategy.count === 1 ? "" : "s") +
            ". Treat it as a candidate pattern for the next content cycle.",
          category: "strategy-performance",
          confidence: confidence(
            strongestStrategy.count,
            rows.every((row) => row.isDemo !== false),
          ),
          impact: "high",
          status: "new",
        });
      }

      if (strongestReach) {
        const reach = numeric(strongestReach.reach ?? strongestReach.views);
        const title = titleFor(strongestReach);

        insights.push({
          title: "Study the highest-reach format",
          detail:
            title +
            " currently has the strongest distribution signal at " +
            reach.toLocaleString() +
            " reach/views on " +
            String(strongestReach.platform ?? "one platform") +
            ". Reframe the winning format for other platforms instead of blindly copying it.",
          category: "distribution",
          confidence: confidence(rows.length, Boolean(strongestReach.isDemo)),
          impact: "medium",
          status: "new",
        });
      }

      const allDemo = rows.every((row) => row.isDemo !== false);
      const providerNames = [
        ...new Set(
          rows
            .map((row) => row.provider ?? row.source)
            .filter(Boolean)
            .map(String),
        ),
      ];

      insights.push({
        title: allDemo
          ? "Keep learning advisory while data is simulated"
          : "Use real analytics as the learning source",
        detail:
          (allDemo
            ? "Current metrics are demo/local data. "
            : "At least one non-demo analytics record is present. ") +
          rows.length +
          " metric record" +
          (rows.length === 1 ? "" : "s") +
          " and " +
          items.length +
          " content item" +
          (items.length === 1 ? "" : "s") +
          " are available for learning." +
          (providerNames.length
            ? " Providers: " + providerNames.join(", ") + "."
            : ""),
        category: "governance",
        confidence: allDemo ? 0.95 : 0.9,
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
