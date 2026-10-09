import assert from "node:assert/strict";
import { createSupabaseStateStore } from "../src/adapters/supabase-store.mjs";
import { createPersistentOrbitRuntime } from "../src/runtime/persistent-runtime.mjs";

const tables = new Map();

function createQuery(table, operation = "read") {
  const state = {
    table,
    filters: [],
    operation,
    selected: false,
  };

  return {
    select() {
      state.selected = true;
      return this;
    },
    eq(column, value) {
      state.filters.push([column, value]);
      return this;
    },
    limit() {
      return this;
    },
    then(resolve, reject) {
      try {
        let rows = tables.get(state.table) ?? [];
        for (const [column, value] of state.filters) {
          rows = rows.filter((row) => row[column] === value);
        }
        resolve({ data: rows.map((row) => structuredClone(row)), error: null });
      } catch (error) {
        reject(error);
      }
    },
  };
}

const fakeClient = {
  from(table) {
    if (!tables.has(table)) tables.set(table, []);

    return {
      select() {
        return createQuery(table, "read").select("*");
      },
      eq(column, value) {
        return createQuery(table, "read").eq(column, value);
      },
      upsert(rows) {
        const current = tables.get(table) ?? [];
        const byId = new Map(current.map((row) => [row.id, row]));

        for (const row of rows) {
          byId.set(row.id, structuredClone(row));
        }

        tables.set(table, [...byId.values()]);
        return Promise.resolve({ data: rows, error: null });
      },
      delete() {
        const query = createQuery(table, "delete");
        const originalEq = query.eq;
        query.eq = (column, value) => {
          originalEq.call(query, column, value);
          const current = tables.get(table) ?? [];
          tables.set(
            table,
            current.filter((row) => row[column] !== value),
          );
          return Promise.resolve({ data: [], error: null });
        };
        return query;
      },
    };
  },
};

const store = createSupabaseStateStore({
  client: fakeClient,
  workspaceId: "workspace-1",
});

tables.set("ideas", [
  {
    id: "stale-idea",
    workspace_id: "workspace-1",
    title: "Stale",
    objective: "Education",
    audience: "Creators",
    status: "idea",
  },
]);

await store.set({
  workspace: {
    id: "workspace-1",
    name: "Northstar Studio",
    slug: "northstar",
    timezone: "UTC",
  },
  brand: {
    id: "brand-2",
    name: "Second Brand",
    voice: "bold",
    audience: "Creators 2",
  },
  brands: [
    {
      id: "brand-1",
      name: "Northstar Studio",
      voice: "clear",
      audience: "Creators",
    },
    {
      id: "brand-2",
      name: "Second Brand",
      voice: "bold",
      audience: "Creators 2",
    },
  ],
  activeBrandId: "brand-2",
  ideas: [
    {
      id: "idea-1",
      title: "Persistent OrbitOS",
      pillar: "Systems",
      audience: "Creators",
      goal: "Education",
      brief: "Persist the content lifecycle.",
      stage: "approved",
      score: 91,
      metadata: { brandId: "brand-2" },
      variants: {
        TikTok: {
          platform: "TikTok",
          hook: "Persist this.",
          body: "Backend storage should not change the agent contracts.",
          cta: "Save it.",
          hashtags: ["#orbitoos"],
          creativeBrief: "Vertical proof.",
          visualDirection: "Clean.",
          approved: true,
        },
      },
    },
  ],
  research: [
    {
      id: "research-1",
      ideaId: "idea-1",
      topic: "Persistence",
      summary: "Backend-ready state.",
      signals: [],
      opportunityScore: 88,
      sources: [],
      generatedBy: "test",
    },
  ],
  contentItems: [
    {
      id: "content-1",
      ideaId: "idea-1",
      brandId: "brand-2",
      title: "Persistent OrbitOS",
      brief: "Persist the lifecycle.",
      status: "approved",
      createdAt: "2026-10-08T00:00:00.000Z",
      updatedAt: "2026-10-08T00:00:00.000Z",
    },
  ],
  contentVariants: [
    {
      id: "variant-1",
      brandId: "brand-2",
      contentItemId: "content-1",
      platform: "TikTok",
      hook: "Persist this.",
      body: "Backend storage should not change the agent contracts.",
      cta: "Save it.",
      hashtags: ["#orbitoos"],
      creativeBrief: "Vertical proof.",
      visualDirection: "Clean.",
      status: "approved",
      approved: true,
      version: 1,
      updatedAt: "2026-10-08T00:00:00.000Z",
    },
  ],
  schedules: [],
  metrics: [],
  audit: [],
  learning: { generatedAt: null, insights: [] },
  learningInsights: [],
});

// Snapshot writes do not infer deletions; this protects rows created by concurrent sessions.
assert.equal((tables.get("ideas") ?? []).some((row) => row.id === "stale-idea"), true);

const persistentRuntime = createPersistentOrbitRuntime({
  client: fakeClient,
  workspaceId: "workspace-1",
});
const persistentSnapshot = await persistentRuntime.snapshot();
assert.equal(persistentSnapshot.ideas.some((idea) => idea.id === "idea-1"), true);

const restored = await store.get();
assert.equal(restored.workspace.name, "Northstar Studio");
assert.equal(restored.brand.name, "Second Brand");
assert.equal(restored.activeBrandId, "brand-2");
assert.equal(restored.brands.length, 2);
const restoredIdea = restored.ideas.find((idea) => idea.id === "idea-1");
assert.ok(restoredIdea);
assert.equal(restoredIdea.metadata.brandId, "brand-2");
assert.equal(restored.contentItems[0].brandId, "brand-2");
assert.equal(restored.contentVariants[0].brandId, "brand-2");
assert.equal(restoredIdea.stage, "approved");
assert.equal(restoredIdea.variants.TikTok.approved, true);
assert.equal(restored.research[0].generatedBy, "test");

const exported = await store.export();
const imported = await store.import(exported);
assert.equal(imported.ideas.some((idea) => idea.id === "idea-1"), true);
assert.equal(imported.ideas.some((idea) => idea.id === "stale-idea"), true);
assert.equal(imported.contentVariants.length, 1);

console.log("OrbitOS Supabase adapter tests passed.");
