import {
  createContentItem,
  createContentVariant,
  createIdea,
} from "../domain/models.mjs";
import { assertAdapter } from "../contracts/adapters.mjs";
import { createInitialState, normalizeState } from "../domain/state.mjs";
import { runLocalPipeline } from "./pipeline.mjs";
import { createAgentRun } from "./audit.mjs";
import { MemoryStore } from "../adapters/local-store.mjs";
import { localResearchAdapter } from "../adapters/local-research.mjs";
import { localContentGeneratorAdapter } from "../adapters/local-content-generator.mjs";
import { localMetricsAdapter } from "../adapters/local-metrics.mjs";
import { nullPublisherAdapter } from "../adapters/null-publisher.mjs";

function materializeContent(state, idea, now = Date.now()) {
  const current = state.contentItems.find((item) => item.ideaId === idea.id);

  const contentItem = createContentItem(
    {
      id: current?.id,
      ideaId: idea.id,
      title: idea.title,
      brief: idea.brief,
      status: idea.stage === "approved" ? "approved" : "draft",
      createdAt: current?.createdAt,
      updatedAt: new Date(now).toISOString(),
    },
    now,
  );

  const existingByPlatform = new Map(
    state.contentVariants
      .filter((variant) => variant.contentItemId === contentItem.id)
      .map((variant) => [variant.platform, variant]),
  );

  const contentVariants = Object.entries(idea.variants ?? {}).map(
    ([platform, variant]) => {
      const existing = existingByPlatform.get(platform);

      return createContentVariant(
        {
          id: existing?.id,
          contentItemId: contentItem.id,
          platform,
          hook: variant.hook,
          body: variant.body,
          cta: variant.cta,
          hashtags: variant.hashtags,
          creativeBrief: variant.creativeBrief,
          status: idea.stage === "approved" ? "approved" : "draft",
          approved: Boolean(variant.approved),
          version: existing?.version ?? 1,
          updatedAt: new Date(now).toISOString(),
        },
        now,
      );
    },
  );

  return {
    contentItem,
    contentVariants,
  };
}

export function createOrbitRuntime({
  store = new MemoryStore(createInitialState()),
  research = localResearchAdapter,
  contentGenerator = localContentGeneratorAdapter,
  metrics = localMetricsAdapter,
  publisher = nullPublisherAdapter,
} = {}) {
  assertAdapter("store", store);
  assertAdapter("research", research);
  assertAdapter("contentGenerator", contentGenerator);
  assertAdapter("metrics", metrics);
  assertAdapter("publisher", publisher);

  async function snapshot() {
    return normalizeState(await store.get());
  }

  async function save(next) {
    return store.set(normalizeState(next));
  }

  async function createDraft(rawIdea, brand = {}) {
    const idea = createIdea(rawIdea);
    const result = runLocalPipeline(idea, brand, {
      research,
      contentGenerator,
      publisher,
    });

    const state = await snapshot();
    const nextIdeas = state.ideas.filter((item) => item.id !== result.idea.id);
    nextIdeas.push(result.idea);

    const materialized = materializeContent(
      state,
      result.idea,
      Date.now(),
    );
    const nextContentItems = state.contentItems.filter(
      (item) => item.id !== materialized.contentItem.id,
    );
    nextContentItems.push(materialized.contentItem);

    const nextVariants = state.contentVariants.filter(
      (variant) =>
        variant.contentItemId !== materialized.contentItem.id,
    );
    nextVariants.push(...materialized.contentVariants);

    return save({
      ...state,
      ideas: nextIdeas,
      research: [...state.research, result.research],
      contentItems: nextContentItems,
      contentVariants: nextVariants,
      audit: [...state.audit, ...result.audit],
    });
  }

  async function approveIdea(ideaId, now = Date.now()) {
    const state = await snapshot();
    const idea = state.ideas.find((item) => item.id === ideaId);
    if (!idea) throw new Error("OrbitOS idea not found: " + ideaId);

    if (!idea.variants || Object.keys(idea.variants).length === 0) {
      throw new Error("An idea needs platform variants before approval.");
    }

    const approvedIdea = {
      ...idea,
      stage: "approved",
      variants: Object.fromEntries(
        Object.entries(idea.variants).map(([platform, variant]) => [
          platform,
          { ...variant, approved: true },
        ]),
      ),
    };

    const materialized = materializeContent(state, approvedIdea, now);
    const run = createAgentRun({
      agent: "Review",
      task: "Record human approval",
      input: { ideaId },
      output: {
        stage: "approved",
        variantCount: Object.keys(approvedIdea.variants).length,
      },
      now,
    });

    return save({
      ...state,
      ideas: state.ideas.map((item) =>
        item.id === idea.id ? approvedIdea : item,
      ),
      contentItems: state.contentItems
        .filter((item) => item.id !== materialized.contentItem.id)
        .concat(materialized.contentItem),
      contentVariants: state.contentVariants
        .filter(
          (variant) =>
            variant.contentItemId !== materialized.contentItem.id,
        )
        .concat(materialized.contentVariants),
      audit: [...state.audit, run],
    });
  }

  async function normalizeMetrics(raw) {
    const snapshotValue = metrics.normalize(raw);
    const state = await snapshot();

    return save({
      ...state,
      metrics: [...state.metrics, snapshotValue],
      audit: [
        ...state.audit,
        createAgentRun({
          agent: "Analytics",
          task: "Normalize platform metrics",
          input: { platform: snapshotValue.platform },
          output: { snapshotDate: snapshotValue.snapshotDate },
        }),
      ],
    });
  }

  async function publishIdeaVariant({ ideaId, platform, schedule }) {
    const state = await snapshot();
    const idea = state.ideas.find((item) => item.id === ideaId);
    if (!idea) throw new Error("OrbitOS idea not found: " + ideaId);

    const variant = idea.variants?.[platform];
    if (!variant?.approved || idea.stage !== "approved") {
      throw new Error("Publishing requires an approved idea and variant.");
    }

    return publisher.publish({
      variant,
      schedule,
      approval: true,
    });
  }

  async function exportState() {
    return store.export();
  }

  async function importState(json) {
    const parsed = JSON.parse(json);
    const next = normalizeState(parsed.state ?? parsed);
    return store.set(next);
  }

  return Object.freeze({
    snapshot,
    createDraft,
    approveIdea,
    normalizeMetrics,
    publishIdeaVariant,
    exportState,
    importState,
  });
}
