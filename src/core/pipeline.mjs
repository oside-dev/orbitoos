import {
  PIPELINE_STAGES,
  createIdea,
  normalizeBrand,
} from "../domain/models.mjs";
import { assertAdapter } from "../contracts/adapters.mjs";
import { localResearchAdapter } from "../adapters/local-research.mjs";
import { localContentGeneratorAdapter } from "../adapters/local-content-generator.mjs";
import { nullPublisherAdapter } from "../adapters/null-publisher.mjs";
import {
  orchestratorAgent,
  createResearchAgent,
  strategyAgent,
  createWritingAgent,
  creativeAgent,
  reviewAgent,
} from "../agents/index.mjs";
import { createPipelineAudit } from "./audit.mjs";

export const PIPELINE_VERSION = "core-0.5";

export async function runLocalPipeline(
  rawIdea,
  rawBrand = {},
  dependencies = {},
) {
  const idea = createIdea(rawIdea);
  const brand = normalizeBrand(rawBrand);
  const brandId = brand.id ?? rawIdea?.brandId ?? null;

  const researchAdapter = dependencies.research ?? localResearchAdapter;
  const contentGenerator =
    dependencies.contentGenerator ?? localContentGeneratorAdapter;
  const publisher = dependencies.publisher ?? nullPublisherAdapter;

  assertAdapter("research", researchAdapter);
  assertAdapter("contentGenerator", contentGenerator);
  assertAdapter("publisher", publisher);

  const workflowPlan = orchestratorAgent.plan({ idea });

  const researchAgent = createResearchAgent({ adapter: researchAdapter });
  const rawResearch = await researchAgent.run({ idea, brand });
  const research = {
    ...rawResearch,
    brandId: rawResearch?.brandId ?? brandId,
  };

  const strategy = strategyAgent.run({ idea, research });

  const writingAgent = createWritingAgent({
    adapter: contentGenerator,
  });
  const writtenVariants = await writingAgent.run({ idea, strategy, brand });

  const variants = creativeAgent.run({
    variants: writtenVariants,
    brand,
  });

  const review = reviewAgent.run({ variants, brand });

  const draftIdea = {
    ...idea,
    stage: PIPELINE_STAGES[3],
    variants,
    metadata: {
      ...(idea.metadata ?? {}),
      brandId,
    },
  };

  const audit = createPipelineAudit({
    idea: draftIdea,
    research: {
      ...research,
      brandId,
    },
    strategy,
    review,
    workflowPlan,
    brandId,
  });

  return {
    version: PIPELINE_VERSION,
    idea: draftIdea,
    workflowPlan,
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
