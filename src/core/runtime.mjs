import {
  createContentItem,
  createBrand,
  createContentVariant,
  createIdea,
  createSchedule,
  normalizeBrand,
} from "../domain/models.mjs";
import { assertAdapter } from "../contracts/adapters.mjs";
import { createInitialState, normalizeState } from "../domain/state.mjs";
import { runLocalPipeline } from "./pipeline.mjs";
import { createAgentRun } from "./audit.mjs";
import { MemoryStore } from "../adapters/local-store.mjs";
import { localResearchAdapter } from "../adapters/local-research.mjs";
import { localMetricsAdapter } from "../adapters/local-metrics.mjs";
import { nullPublisherAdapter } from "../adapters/null-publisher.mjs";
import { createContentGenerator } from "./content-generator-factory.mjs";
import { createPublishingGateway } from "./publishing-gateway.mjs";
import { createAnalyticsGateway } from "./analytics-gateway.mjs";
import { createAnalyticsAgent, learningAgent } from "../agents/index.mjs";

function materializeContent(state, idea, now = Date.now()) {
  const current = state.contentItems.find((item) => item.ideaId === idea.id);

  const contentItem = createContentItem(
    {
      id: current?.id,
      ideaId: idea.id,
      brandId: idea.metadata?.brandId ?? null,
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
      const status = variant.approved ? "approved" : "draft";

      return createContentVariant(
        {
          id: existing?.id,
          contentItemId: contentItem.id,
          brandId: idea.metadata?.brandId ?? null,
          platform,
          hook: variant.hook,
          body: variant.body,
          cta: variant.cta,
          hashtags: variant.hashtags,
          creativeBrief: variant.creativeBrief,
          visualDirection: variant.visualDirection,
          status,
          approved: Boolean(variant.approved),
          version: existing?.version ?? 1,
          updatedAt: new Date(now).toISOString(),
        },
        now,
      );
    },
  );

  return { contentItem, contentVariants };
}

export function createOrbitRuntime({
  store = new MemoryStore(createInitialState()),
  research = localResearchAdapter,
  contentGenerator,
  ai = {},
  metrics = localMetricsAdapter,
  analyticsProvider = null,
  publisher = nullPublisherAdapter,
  analytics = createAnalyticsAgent({ adapter: metrics }),
  learning = learningAgent,
} = {}) {
  assertAdapter("store", store);
  assertAdapter("research", research);
  const selectedContentGenerator =
    contentGenerator ?? createContentGenerator(ai);
  assertAdapter("contentGenerator", selectedContentGenerator);
  assertAdapter("metrics", metrics);
  assertAdapter("publisher", publisher);
  const publishingGateway = createPublishingGateway({ adapter: publisher });
  const analyticsGateway = analyticsProvider
    ? createAnalyticsGateway({ adapter: analyticsProvider })
    : null;

  async function snapshot() {
    return normalizeState(await store.get());
  }

  async function save(next) {
    return store.set(normalizeState(next));
  }

  async function createDraft(rawIdea, brand) {
    const state = await snapshot();
    let workingState = state;
    let activeBrand =
      brand && Object.keys(brand).length > 0
        ? normalizeBrand(brand)
        : normalizeBrand(state.brand);

    if (!activeBrand.name) {
      const created = createBrand(
        {
          id: state.activeBrandId ?? "brand-default",
          name: "OrbitOS Default",
          voice: "Clear, direct, useful.",
          audience: "General audience",
        },
        Date.now(),
      );
      activeBrand = created;
      workingState = {
        ...state,
        brands: state.brands.some((item) => item.id === created.id)
          ? state.brands.map((item) =>
              item.id === created.id ? created : item,
            )
          : [...state.brands, created],
        activeBrandId: created.id,
        brand: created,
      };
    }

    const idea = createIdea({
      ...rawIdea,
      brandId: activeBrand.id ?? workingState.activeBrandId,
    });
    const result = await runLocalPipeline(idea, activeBrand, {
      research,
      contentGenerator: selectedContentGenerator,
      publisher,
    });

    const currentState = workingState;
    const nextIdeas = currentState.ideas.filter((item) => item.id !== result.idea.id);
    nextIdeas.push(result.idea);

    const materialized = materializeContent(currentState, result.idea, Date.now());
    const nextContentItems = currentState.contentItems.filter(
      (item) => item.id !== materialized.contentItem.id,
    );
    nextContentItems.push(materialized.contentItem);

    const nextVariants = currentState.contentVariants.filter(
      (variant) => variant.contentItemId !== materialized.contentItem.id,
    );
    nextVariants.push(...materialized.contentVariants);

    return save({
      ...currentState,
      ideas: nextIdeas,
      research: [...currentState.research, result.research],
      contentItems: nextContentItems,
      contentVariants: nextVariants,
      audit: [...currentState.audit, ...result.audit],
    });
  }

  async function createBrandProfile(brand = {}, now = Date.now()) {
    const state = await snapshot();
    const created = createBrand(brand, now);
    const brands = [...state.brands, created];
    const shouldActivate = !state.activeBrandId;

    return save({
      ...state,
      brands,
      activeBrandId: shouldActivate ? created.id : state.activeBrandId,
      brand: shouldActivate ? created : state.brand,
    });
  }

  async function listBrands() {
    const state = await snapshot();
    return state.brands;
  }

  async function setActiveBrand(brandId) {
    const state = await snapshot();
    const active = state.brands.find((brand) => brand.id === brandId);
    if (!active) throw new Error("OrbitOS brand not found: " + brandId);

    return save({
      ...state,
      activeBrandId: active.id,
      brand: active,
    });
  }

  async function updateBrand(brand = {}) {
    const state = await snapshot();
    const normalized = normalizeBrand({
      ...state.brand,
      ...brand,
      id: brand.id ?? state.activeBrandId ?? state.brand.id ?? null,
    });

    if (!normalized.id) {
      const created = createBrand(normalized);
      return save({
        ...state,
        brand: created,
        brands: [...state.brands, created],
        activeBrandId: created.id,
      });
    }

    const brands = state.brands.some((item) => item.id === normalized.id)
      ? state.brands.map((item) =>
          item.id === normalized.id ? normalized : item,
        )
      : [...state.brands, normalized];

    return save({
      ...state,
      brands,
      activeBrandId: normalized.id,
      brand: normalized,
    });
  }

  async function updateContentVariant(
    { ideaId, platform, changes = {} },
    now = Date.now(),
  ) {
    const state = await snapshot();
    const idea = state.ideas.find((item) => item.id === ideaId);
    if (!idea) throw new Error("OrbitOS idea not found: " + ideaId);

    const current = idea.variants?.[platform];
    if (!current) {
      throw new Error("OrbitOS content variant not found: " + platform);
    }

    if (idea.stage === "approved" || idea.stage === "scheduled") {
      throw new Error("Approved content must be revised into a new draft.");
    }

    const existingContentVariant = state.contentVariants.find(
      (variant) =>
        variant.contentItemId ===
          state.contentItems.find((item) => item.ideaId === idea.id)?.id &&
        variant.platform === platform,
    );

    const updatedVariant = {
      ...current,
      ...changes,
      platform,
      approved: false,
    };

    const nextIdea = {
      ...idea,
      stage: "draft",
      variants: {
        ...idea.variants,
        [platform]: updatedVariant,
      },
    };

    const materialized = materializeContent(state, nextIdea, now);
    const nextContentVariants = materialized.contentVariants.map((variant) =>
      variant.platform === platform
        ? {
            ...variant,
            version: (existingContentVariant?.version ?? 0) + 1,
          }
        : variant,
    );

    return save({
      ...state,
      ideas: state.ideas.map((item) =>
        item.id === idea.id ? nextIdea : item,
      ),
      contentItems: state.contentItems
        .filter((item) => item.id !== materialized.contentItem.id)
        .concat(materialized.contentItem),
      contentVariants: state.contentVariants
        .filter(
          (variant) =>
            variant.contentItemId !== materialized.contentItem.id,
        )
        .concat(nextContentVariants),
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

  async function scheduleIdeaVariant(
    { ideaId, platform, scheduledAt },
    now = Date.now(),
  ) {
    const state = await snapshot();
    const idea = state.ideas.find((item) => item.id === ideaId);
    if (!idea) throw new Error("OrbitOS idea not found: " + ideaId);

    const variant = idea.variants?.[platform];
    if (!variant?.approved || idea.stage !== "approved") {
      throw new Error("Scheduling requires an approved idea and variant.");
    }

    const contentItem = state.contentItems.find(
      (item) => item.ideaId === ideaId,
    );
    if (!contentItem) throw new Error("Content item not found for idea.");

    const existing = state.schedules.find(
      (schedule) =>
        schedule.contentItemId === contentItem.id &&
        schedule.platform === platform &&
        schedule.status === "scheduled",
    );

    if (existing) return state;

    const schedule = createSchedule(
      {
        contentItemId: contentItem.id,
        brandId: idea.metadata?.brandId ?? state.activeBrandId ?? null,
        platform,
        scheduledAt,
        status: "scheduled",
      },
      now,
    );

    const nextContentVariants = state.contentVariants.map((item) =>
      item.contentItemId === contentItem.id && item.platform === platform
        ? { ...item, status: "scheduled", approved: true }
        : item,
    );

    return save({
      ...state,
      schedules: [...state.schedules, schedule],
      contentItems: state.contentItems,
      contentVariants: nextContentVariants,
      audit: [
        ...state.audit,
        createAgentRun({
          agent: "Publishing",
          task: "Prepare approved content schedule",
          brandId: idea.metadata?.brandId ?? state.activeBrandId ?? null,
          input: { ideaId, platform, scheduledAt },
          output: { scheduleId: schedule.id, publishingEnabled: false },
          now,
        }),
      ],
    });
  }

  async function normalizeMetrics(raw) {
    const snapshotValue = analytics.run(raw);
    const state = await snapshot();
    const brandedSnapshot = {
      ...snapshotValue,
      brandId: raw?.brandId ?? state.activeBrandId ?? null,
    };

    return save({
      ...state,
      metrics: [...state.metrics, brandedSnapshot],
      audit: [
        ...state.audit,
        createAgentRun({
          agent: "Analytics",
          task: "Normalize platform metrics",
          brandId: brandedSnapshot.brandId,
          input: { platform: brandedSnapshot.platform },
          output: { snapshotDate: brandedSnapshot.snapshotDate },
        }),
      ],
    });
  }

  async function ingestExternalMetrics(input = {}) {
    if (!analyticsGateway) {
      throw new Error("OrbitOS external analytics provider is not configured.");
    }

    const rawRecords = await analyticsGateway.fetch(input);
    const state = await snapshot();
    const normalizedRecords = rawRecords.map((raw) => ({
      ...analytics.run(raw),
      brandId: raw?.brandId ?? input?.brandId ?? state.activeBrandId ?? null,
    }));

    return save({
      ...state,
      metrics: [...state.metrics, ...normalizedRecords],
      audit: [
        ...state.audit,
        createAgentRun({
          agent: "Analytics",
          brandId: input?.brandId ?? state.activeBrandId ?? null,
          task: "Ingest external platform metrics",
          input: {
            provider: analyticsGateway.provider,
            recordCount: normalizedRecords.length,
          },
          output: {
            recordCount: normalizedRecords.length,
            isDemo: false,
          },
        }),
      ],
    });
  }

  async function runLearning() {
    const state = await snapshot();
    const result = learning.run({
      ideas: state.ideas.filter(
        (idea) =>
          !state.activeBrandId ||
          !idea.metadata?.brandId ||
          idea.metadata.brandId === state.activeBrandId,
      ),
      metrics: state.metrics.filter(
        (row) =>
          !state.activeBrandId ||
          !row.brandId ||
          row.brandId === state.activeBrandId,
      ),
      contentItems: state.contentItems.filter(
        (item) =>
          !state.activeBrandId ||
          !item.brandId ||
          item.brandId === state.activeBrandId,
      ),
      contentVariants: state.contentVariants.filter(
        (variant) => {
          const item = state.contentItems.find(
            (contentItem) => contentItem.id === variant.contentItemId,
          );
          return (
            !state.activeBrandId ||
            !item?.brandId ||
            item.brandId === state.activeBrandId
          );
        },
      ),
    });
    const brandedInsights = result.insights.map((insight) => ({
      ...insight,
      brandId: state.activeBrandId ?? null,
    }));

    return save({
      ...state,
      learning: {
        ...result,
        insights: brandedInsights,
      },
      learningInsights: [...state.learningInsights, ...brandedInsights],
      audit: [
        ...state.audit,
        createAgentRun({
          agent: "Learning",
          brandId: state.activeBrandId ?? null,
          task: "Generate advisory learning insights",
          input: {
            metricCount: state.metrics.length,
            contentItemCount: state.contentItems.length,
          },
          output: {
            insightCount: result.insights.length,
          },
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
      throw new Error(
        "Publishing requires an approved idea and scheduled variant.",
      );
    }

    const contentItem = state.contentItems.find(
      (item) => item.ideaId === ideaId,
    );
    const scheduledItem = state.schedules.find(
      (item) =>
        item.contentItemId === contentItem?.id &&
        item.platform === platform &&
        item.status === "scheduled",
    );

    if (!scheduledItem) {
      throw new Error("Publishing requires an existing schedule.");
    }

    const publishingInput = {
      variant,
      schedule: schedule ?? scheduledItem.scheduledAt,
      approval: true,
      idempotencyKey: scheduledItem.id + ":" + String(
        state.contentVariants.find(
          (item) =>
            item.contentItemId === contentItem?.id &&
            item.platform === platform,
        )?.version ?? 1,
      ),
    };

    try {
      const result = await publishingGateway.publish(publishingInput);
      const latest = await snapshot();
      await save({
        ...latest,
        audit: [
          ...latest.audit,
          createAgentRun({
            agent: "Publishing",
            task: "Publish scheduled content variant",
            brandId: idea.metadata?.brandId ?? state.activeBrandId ?? null,
            input: { ideaId, platform, scheduleId: scheduledItem.id },
            output: { success: true, provider: publishingGateway.provider },
          }),
        ],
      });
      return result;
    } catch (error) {
      const latest = await snapshot();
      await save({
        ...latest,
        audit: [
          ...latest.audit,
          createAgentRun({
            agent: "Publishing",
            task: "Publish scheduled content variant",
            status: "failed",
            input: { ideaId, platform, scheduleId: scheduledItem.id },
            output: {
              success: false,
              code: error?.code ?? "PUBLISH_FAILED",
              message: String(error?.message ?? error),
            },
          }),
        ],
      });
      throw error;
    }
  }

  async function runDuePublishing(now = Date.now()) {
    if (publisher.enabled !== true) {
      return {
        processed: 0,
        blocked: true,
        code: "PUBLISHING_DISABLED",
        results: [],
      };
    }

    const state = await snapshot();
    const due = state.schedules.filter(
      (schedule) =>
        schedule.status === "scheduled" &&
        Date.parse(schedule.scheduledAt) <= Number(now),
    );

    const results = [];

    for (const schedule of due) {
      const contentItem = state.contentItems.find(
        (item) => item.id === schedule.contentItemId,
      );
      const idea = state.ideas.find(
        (item) => item.id === contentItem?.ideaId,
      );

      if (!idea) {
        const latest = await snapshot();
        await save({
          ...latest,
          schedules: latest.schedules.map((item) =>
            item.id === schedule.id ? { ...item, status: "failed" } : item,
          ),
        });
        results.push({
          scheduleId: schedule.id,
          status: "failed",
          code: "CONTENT_NOT_FOUND",
        });
        continue;
      }

      try {
        await publishIdeaVariant({
          ideaId: idea.id,
          platform: schedule.platform,
          schedule: schedule.scheduledAt,
        });

        const latest = await snapshot();
        const nextSchedules = latest.schedules.map((item) =>
          item.id === schedule.id ? { ...item, status: "published" } : item,
        );
        await save({
          ...latest,
          schedules: nextSchedules,
        });

        results.push({
          scheduleId: schedule.id,
          status: "published",
        });
      } catch (error) {
        const latest = await snapshot();
        const nextSchedules = latest.schedules.map((item) =>
          item.id === schedule.id ? { ...item, status: "failed" } : item,
        );
        await save({
          ...latest,
          schedules: nextSchedules,
        });

        results.push({
          scheduleId: schedule.id,
          status: "failed",
          code: error?.code ?? "PUBLISH_FAILED",
        });
      }
    }

    return {
      processed: due.length,
      results,
    };
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
    createBrandProfile,
    listBrands,
    setActiveBrand,
    updateBrand,
    updateContentVariant,
    approveIdea,
    scheduleIdeaVariant,
    normalizeMetrics,
    ingestExternalMetrics,
    runLearning,
    publishIdeaVariant,
    runDuePublishing,
    exportState,
    importState,
  });
}
