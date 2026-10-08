import {
  PLATFORMS,
  PIPELINE_STAGES,
  createIdea,
  normalizeBrand,
} from "../domain/models.mjs";
import { assertAdapter } from "../contracts/adapters.mjs";
import { localResearchAdapter } from "../adapters/local-research.mjs";
import { localContentGeneratorAdapter } from "../adapters/local-content-generator.mjs";
import { nullPublisherAdapter } from "../adapters/null-publisher.mjs";
import { createPipelineAudit } from "./audit.mjs";

export const PIPELINE_VERSION = "core-0.2";

function buildStrategy(idea, research) {
  return {
    goal: idea.goal,
    audience: idea.audience,
    angle: research.signals[0]?.topic ?? "Useful takeaway",
    platforms: [...PLATFORMS],
    kpis: ["reach", "engagement", "saves"],
  };
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

export function runLocalPipeline(
  rawIdea,
  rawBrand = {},
  dependencies = {},
) {
  const idea = createIdea(rawIdea);
  const brand = normalizeBrand(rawBrand);

  const researchAdapter = dependencies.research ?? localResearchAdapter;
  const contentGenerator =
    dependencies.contentGenerator ?? localContentGeneratorAdapter;
  const publisher = dependencies.publisher ?? nullPublisherAdapter;

  assertAdapter("research", researchAdapter);
  assertAdapter("contentGenerator", contentGenerator);
  assertAdapter("publisher", publisher);

  const research = researchAdapter.research({ idea, brand });
  const strategy = buildStrategy(idea, research);
  const variants = contentGenerator.generate({ idea, strategy, brand });
  const review = reviewVariants(variants, brand);
  const draftIdea = {
    ...idea,
    stage: PIPELINE_STAGES[3],
    variants,
  };

  const audit = createPipelineAudit({
    idea: draftIdea,
    research,
    strategy,
    review,
  });

  return {
    version: PIPELINE_VERSION,
    idea: draftIdea,
    research,
    strategy,
    variants,
    review,
    audit,
    execution: {
      publishingEnabled: Boolean(publisher.enabled),
      requiresHumanApproval: review.humanApprovalRequired,
      publishingProvider: publisher.constructor?.name ?? "adapter",
    },
  };
}
