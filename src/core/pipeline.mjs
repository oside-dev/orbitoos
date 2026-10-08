import {
  PLATFORMS,
  PIPELINE_STAGES,
  createIdea,
  createVariant,
  normalizeBrand,
} from "../domain/models.mjs";

export const PIPELINE_VERSION = "core-0.1";

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

function researchIdea(idea) {
  return {
    signals: DEFAULT_SIGNALS.map((signal) => ({ ...signal })),
    summary: "Local research synthesis for " + idea.title,
  };
}

function buildStrategy(idea, research) {
  return {
    goal: idea.goal,
    audience: idea.audience,
    angle: research.signals[0]?.topic ?? "Useful takeaway",
    platforms: [...PLATFORMS],
    kpis: ["reach", "engagement", "saves"],
  };
}

function buildVariants(idea, strategy, brand) {
  const voice = brand.voice || "clear and useful";
  return Object.fromEntries(
    strategy.platforms.map((platform) => [
      platform,
      createVariant({
        platform,
        hook: "Why " + idea.title + " matters more than you think.",
        body:
          "Teach one concrete example, one principle, and one next step. " +
          "Voice: " +
          voice,
        cta: "Save this and test it this week.",
      }),
    ]),
  );
}

function reviewVariants(variants, brand) {
  const blocked = new Set(
    brand.rules.filter((rule) => /never|no /i.test(rule)),
  );

  const reasons = [];
  if (!variants || Object.keys(variants).length !== PLATFORMS.length) {
    reasons.push("Every required platform needs a variant.");
  }
  if (blocked.size > 0 && reasons.length === 0) {
    reasons.push("Guardrails require a final human review.");
  }

  return {
    pass: reasons.length === 0,
    reasons,
    humanApprovalRequired: true,
  };
}

export function runLocalPipeline(rawIdea, rawBrand = {}) {
  const idea = createIdea(rawIdea);
  const brand = normalizeBrand(rawBrand);

  const research = researchIdea(idea);
  const strategy = buildStrategy(idea, research);
  const variants = buildVariants(idea, strategy, brand);
  const review = reviewVariants(variants, brand);

  return {
    version: PIPELINE_VERSION,
    idea: { ...idea, stage: PIPELINE_STAGES[3] },
    research,
    strategy,
    variants,
    review,
    execution: {
      publishingEnabled: false,
      requiresHumanApproval: review.humanApprovalRequired,
    },
  };
}
