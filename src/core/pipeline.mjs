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
  reviewAgent,
} from "../agents/index.mjs";
import { createPipelineAudit } from "./audit.mjs";

export const PIPELINE_VERSION = "core-0.3";

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

  const workflowPlan = orchestratorAgent.plan({ idea });

  const researchAgent = createResearchAgent({
    adapter: researchAdapter,
  });
  const research = researchAgent.run({ idea, brand });

  const strategy = strategyAgent.run({ idea, research });

  const writingAgent = createWritingAgent({
    adapter: contentGenerator,
  });
  const variants = writingAgent.run({ idea, strategy, brand });

  const review = reviewAgent.run({ variants, brand });

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
    workflowPlan,
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
