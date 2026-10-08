import { assertAdapter } from "../contracts/adapters.mjs";
import { normalizeState } from "../domain/state.mjs";

export function createSupabaseStateStore({ client, workspaceId } = {}) {
  if (!client || typeof client.from !== "function") {
    throw new Error("OrbitOS Supabase adapter requires a compatible client.");
  }

  const id = String(workspaceId ?? "").trim();
  if (!id) throw new Error("OrbitOS Supabase workspaceId is required.");

  async function rows(table, query) {
    const result = await query;
    if (result?.error) {
      throw new Error(
        "OrbitOS Supabase " + table + " operation failed: " + result.error.message,
      );
    }
    return result?.data ?? [];
  }

  async function get() {
    const tables = [
      "workspaces",
      "brands",
      "ideas",
      "research_items",
      "content_items",
      "content_variants",
      "schedules",
      "analytics_snapshots",
      "agent_runs",
      "learning_insights",
    ];

    const results = await Promise.all(
      tables.map((table) =>
        rows(
          table,
          table === "workspaces"
            ? client.from(table).select("*").eq("id", id)
            : client.from(table).select("*").eq("workspace_id", id),
        ),
      ),
    );

    const [
      workspaces,
      brands,
      ideas,
      researchItems,
      contentItems,
      contentVariants,
      schedules,
      analytics,
      audit,
      learningRows,
    ] = results;

    const mappedBrands = brands.map((row) => ({
      id: row.id,
      name: row.name,
      voice: row.voice,
      audience: row.audience,
      pillars: row.pillars ?? [],
      prohibited: row.prohibited ?? [],
      visualDirection: row.visual_direction ?? "",
      postingGoals: row.posting_goals ?? {},
    }));

    const itemMap = new Map(contentItems.map((item) => [item.id, item]));
    const variantsByItem = new Map();
    for (const variant of contentVariants) {
      const list = variantsByItem.get(variant.content_item_id) ?? [];
      list.push(variant);
      variantsByItem.set(variant.content_item_id, list);
    }

    const mappedIdeas = ideas.map((row) => {
      const item = [...itemMap.values()].find((candidate) => candidate.idea_id === row.id);
      const variants = Object.fromEntries(
        (variantsByItem.get(item?.id) ?? []).map((variant) => [
          variant.platform,
          {
            platform: variant.platform,
            hook: variant.hook,
            body: variant.body,
            cta: variant.cta,
            hashtags: variant.hashtags ?? [],
            creativeBrief: variant.creative_brief ?? "",
            visualDirection: variant.visual_direction ?? "",
            approved: Boolean(variant.approved),
          },
        ]),
      );

      return {
        id: row.id,
        brandId: row.brand_id ?? null,
        title: row.title,
        pillar: row.pillar ?? "General",
        audience: row.audience ?? "General audience",
        goal: row.objective ?? "Education",
        brief: item?.brief ?? "",
        stage: row.status ?? "idea",
        score: Number.isFinite(row.score) ? row.score : null,
        strategy: row.strategy ?? {},
        variants,
        metadata: {
          brandId: row.brand_id ?? null,
        },
      };
    });

    const learning = learningRows.map((row) => ({
      id: row.id,
      title: row.title,
      detail: row.detail,
      category: row.category,
      confidence: row.confidence,
      impact: row.impact,
      status: row.status,
      brandId: row.brand_id ?? null,
    }));

    const activeBrandId =
      workspaces[0]?.settings?.activeBrandId ??
      mappedBrands[0]?.id ??
      null;
    const activeBrand =
      mappedBrands.find((brand) => brand.id === activeBrandId) ??
      mappedBrands[0] ??
      {};

    return normalizeState({
      workspace: workspaces[0] ?? { id },
      brand: activeBrand,
      brands: mappedBrands,
      activeBrandId,
      ideas: mappedIdeas,
      research: researchItems.map((row) => ({
        id: row.id,
        ideaId: row.idea_id ?? null,
        brandId: row.brand_id ?? null,
        topic: row.topic,
        summary: row.summary,
        signals: row.signals ?? [],
        opportunityScore: row.opportunity_score ?? 0,
        sources: row.sources ?? [],
        generatedBy: row.generated_by ?? "backend",
      })),
      contentItems: contentItems.map((row) => ({
        id: row.id,
        ideaId: row.idea_id,
        brandId: row.brand_id ?? null,
        title: row.title,
        brief: row.brief,
        status: row.status,
        createdAt: row.created_at,
        updatedAt: row.updated_at,
      })),
      contentVariants: contentVariants.map((row) => ({
        id: row.id,
        brandId: row.brand_id ?? null,
        contentItemId: row.content_item_id,
        platform: row.platform,
        hook: row.hook,
        body: row.body,
        cta: row.cta,
        hashtags: row.hashtags ?? [],
        creativeBrief: row.creative_brief ?? "",
        visualDirection: row.visual_direction ?? "",
        status: row.status,
        approved: Boolean(row.approved),
        version: row.version ?? 1,
        updatedAt: row.updated_at,
      })),
      schedules: schedules.map((row) => ({
        id: row.id,
        brandId: row.brand_id ?? null,
        contentItemId: row.content_item_id,
        platform: row.platform,
        scheduledAt: row.scheduled_at,
        status: row.status,
        createdAt: row.created_at,
      })),
      metrics: analytics.map((row) => ({
        id: row.id,
        brandId: row.brand_id ?? null,
        contentItemId: row.content_item_id,
        platform: row.platform,
        snapshotDate: row.snapshot_date,
        views: row.views,
        reach: row.reach,
        engagements: row.engagements,
        followerDelta: row.follower_delta,
        isDemo: Boolean(row.is_demo),
        source: row.source ?? "unknown",
        provider: row.provider ?? "unknown",
      })),
      audit: audit.map((row) => ({
        id: row.id,
        brandId: row.brand_id ?? null,
        agent: row.agent,
        task: row.task,
        status: row.status,
        input: row.input ?? {},
        output: row.output ?? {},
        startedAt: row.started_at,
        finishedAt: row.finished_at,
      })),
      learning: {
        generatedAt: learningRows[0]?.generated_at ?? null,
        insights: learning,
      },
      learningInsights: learning,
    });
  }

  async function upsert(table, records) {
    if (!records.length) return;
    const result = await client.from(table).upsert(records, { onConflict: "id" });
    if (result?.error) {
      throw new Error(
        "OrbitOS Supabase " + table + " write failed: " + result.error.message,
      );
    }
  }

  async function removeStale(table, desiredIds) {
    const keep = new Set(desiredIds);
    const existing = await rows(
      table,
      client.from(table).select("id").eq("workspace_id", id),
    );

    for (const row of existing) {
      if (keep.has(row.id)) continue;

      const result = await client.from(table).delete().eq("id", row.id);
      if (result?.error) {
        throw new Error(
          "OrbitOS Supabase " + table + " cleanup failed: " + result.error.message,
        );
      }
    }
  }

  async function set(nextState) {
    const state = normalizeState(nextState);
    await upsert("workspaces", [
      {
        id,
        name: state.workspace.name ?? "OrbitOS",
        slug: state.workspace.slug ?? id,
        timezone: state.workspace.timezone ?? "UTC",
        settings: {
          ...(state.workspace.settings ?? {}),
          activeBrandId: state.activeBrandId ?? null,
        },
      },
    ]);

    const persistedBrands =
      state.brands.length > 0
        ? state.brands
        : state.brand.name
          ? [{ ...state.brand, id: state.brand.id ?? id + ":brand" }]
          : [];

    await upsert(
      "brands",
      persistedBrands.map((brand) => ({
        id: brand.id,
        workspace_id: id,
        name: brand.name,
        voice: brand.voice ?? "",
        audience: brand.audience ?? "",
        pillars: brand.pillars ?? [],
        prohibited: brand.prohibited ?? [],
        visual_direction: brand.visualDirection ?? "",
        posting_goals: brand.postingGoals ?? {},
      })),
    );

    await upsert(
      "ideas",
      state.ideas.map((idea) => ({
        id: idea.id,
        workspace_id: id,
        brand_id: idea.metadata?.brandId ?? state.activeBrandId ?? null,
        title: idea.title,
        objective: idea.goal,
        audience: idea.audience,
        platforms: Object.keys(idea.variants ?? {}),
        pillar: idea.pillar,
        tone: state.brand.voice ?? "",
        status: idea.stage,
        score: Number.isFinite(idea.score) ? idea.score : 50,
        strategy: idea.strategy ?? {},
      })),
    );

    await upsert(
      "research_items",
      state.research.map((item, index) => ({
        id: item.id ?? id + ":research:" + index,
        workspace_id: id,
        brand_id: item.brandId ?? state.activeBrandId ?? null,
        idea_id: item.ideaId ?? null,
        topic: item.topic ?? "",
        summary: item.summary ?? "",
        signals: item.signals ?? [],
        opportunity_score: item.opportunityScore ?? 0,
        sources: item.sources ?? [],
        generated_by: item.generatedBy ?? "backend",
      })),
    );

    await upsert(
      "content_items",
      state.contentItems.map((item) => ({
        id: item.id,
        idea_id: item.ideaId,
        brand_id: item.brandId ?? state.activeBrandId ?? null,
        workspace_id: id,
        title: item.title,
        brief: item.brief,
        status: item.status,
        created_at: item.createdAt,
        updated_at: item.updatedAt,
      })),
    );

    await upsert(
      "content_variants",
      state.contentVariants.map((item) => ({
        id: item.id,
        workspace_id: id,
        brand_id: item.brandId ?? state.activeBrandId ?? null,
        content_item_id: item.contentItemId,
        platform: item.platform,
        hook: item.hook,
        body: item.body,
        cta: item.cta,
        hashtags: item.hashtags ?? [],
        creative_brief: item.creativeBrief ?? "",
        visual_direction: item.visualDirection ?? "",
        status: item.status,
        approved: Boolean(item.approved),
        version: item.version ?? 1,
        updated_at: item.updatedAt,
      })),
    );

    await upsert(
      "schedules",
      state.schedules.map((item) => ({
        id: item.id,
        workspace_id: id,
        brand_id: item.brandId ?? state.activeBrandId ?? null,
        content_item_id: item.contentItemId,
        platform: item.platform,
        scheduled_at: item.scheduledAt,
        status: item.status,
        created_at: item.createdAt,
      })),
    );

    await upsert(
      "analytics_snapshots",
      state.metrics.map((item, index) => ({
        id: item.id ?? id + ":metric:" + index,
        workspace_id: id,
        brand_id: item.brandId ?? state.activeBrandId ?? null,
        content_item_id: item.contentItemId ?? null,
        platform: item.platform,
        snapshot_date: item.snapshotDate,
        views: item.views ?? 0,
        reach: item.reach ?? 0,
        engagements: item.engagements ?? 0,
        follower_delta: item.followerDelta ?? 0,
        is_demo: item.isDemo !== false,
        source: item.source ?? "unknown",
        provider: item.provider ?? "unknown",
      })),
    );

    await upsert(
      "agent_runs",
      state.audit.map((item) => ({
        id: item.id,
        workspace_id: id,
        brand_id: item.brandId ?? state.activeBrandId ?? null,
        agent: item.agent,
        task: item.task,
        status: item.status,
        input: item.input ?? {},
        output: item.output ?? {},
        started_at: item.startedAt,
        finished_at: item.finishedAt,
      })),
    );

    await upsert(
      "learning_insights",
      state.learningInsights.map((item, index) => ({
        id: item.id ?? id + ":learning:" + index,
        workspace_id: id,
        brand_id: item.brandId ?? state.activeBrandId ?? null,
        title: item.title,
        detail: item.detail,
        category: item.category ?? "general",
        confidence: item.confidence ?? 0.5,
        impact: item.impact ?? "medium",
        status: item.status ?? "new",
        generated_at: state.learning?.generatedAt ?? new Date().toISOString(),
      })),
    );

    const cleanupTargets = [
      ["brands", persistedBrands.map((item) => item.id)],
      ["ideas", state.ideas.map((item) => item.id)],
      [
        "research_items",
        state.research.map((item, index) => item.id ?? id + ":research:" + index),
      ],
      ["content_items", state.contentItems.map((item) => item.id)],
      ["content_variants", state.contentVariants.map((item) => item.id)],
      ["schedules", state.schedules.map((item) => item.id)],
      ["analytics_snapshots", state.metrics.map((item, index) => item.id ?? id + ":metric:" + index)],
      ["agent_runs", state.audit.map((item) => item.id)],
      ["learning_insights", state.learningInsights.map((item, index) => item.id ?? id + ":learning:" + index)],
    ];

    for (const [table, desiredIds] of cleanupTargets) {
      await removeStale(table, desiredIds);
    }

    return state;
  }

  async function update(mutator) {
    const current = await get();
    const next = await mutator(structuredClone(current));
    return set(next ?? current);
  }

  return assertAdapter("store", {
    provider: "supabase",
    persistent: true,
    get,
    set,
    update,
    async export() {
      return JSON.stringify(await get(), null, 2);
    },
    async import(json) {
      const parsed = JSON.parse(json);
      return set(parsed?.state ?? parsed);
    },
  });
}
