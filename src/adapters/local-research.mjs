const DEFAULT_SIGNALS = Object.freeze([
  {
    topic: "Hook specificity",
    signal: "Specific audience plus a clear tension usually creates a sharper opening.",
    score: 92,
    source: "local-heuristic",
  },
  {
    topic: "Native formatting",
    signal: "Platform-native pacing is preferable to blind cross-posting.",
    score: 86,
    source: "local-heuristic",
  },
  {
    topic: "Concrete proof",
    signal: "Specific examples are more useful than broad claims.",
    score: 79,
    source: "local-heuristic",
  },
]);

export const localResearchAdapter = Object.freeze({
  async research({ idea }) {
    const signals = DEFAULT_SIGNALS.map((signal) => ({ ...signal }));

    return {
      topic: idea.title,
      summary: "Local research synthesis for " + idea.title,
      signals,
      opportunityScore: Math.round(
        signals.reduce((sum, signal) => sum + signal.score, 0) / signals.length,
      ),
      sources: signals.map((signal) => ({
        label: signal.source,
        type: "heuristic",
      })),
      generatedBy: "local-research",
    };
  },
});
