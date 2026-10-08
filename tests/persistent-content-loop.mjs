import assert from "node:assert/strict";
import { createOrbitRuntime } from "../src/core/runtime.mjs";
import { createSupabaseStateStore } from "../src/adapters/supabase-store.mjs";

const tables = new Map();

function query(table, filters = []) {
  return {
    select() {
      return this;
    },
    eq(column, value) {
      return query(table, [...filters, [column, value]]);
    },
    then(resolve, reject) {
      try {
        let rows = tables.get(table) ?? [];
        for (const [column, value] of filters) {
          rows = rows.filter((row) => row[column] === value);
        }
        resolve({
          data: structuredClone(rows),
          error: null,
        });
      } catch (error) {
        reject(error);
      }
    },
  };
}

const client = {
  from(table) {
    if (!tables.has(table)) tables.set(table, []);

    return {
      select() {
        return query(table);
      },
      upsert(rows) {
        const incoming = Array.isArray(rows) ? rows : [rows];
        const current = tables.get(table) ?? [];
        const byId = new Map(current.map((row) => [row.id, row]));

        for (const row of incoming) {
          byId.set(row.id, structuredClone(row));
        }

        tables.set(table, [...byId.values()]);
        return Promise.resolve({ data: incoming, error: null });
      },
      delete() {
        const filters = [];
        return {
          eq(column, value) {
            filters.push([column, value]);
            let rows = tables.get(table) ?? [];
            rows = rows.filter((row) =>
              !filters.every(([filterColumn, filterValue]) =>
                row[filterColumn] === filterValue,
              ),
            );
            tables.set(table, rows);
            return Promise.resolve({ data: [], error: null });
          },
        };
      },
    };
  },
};

const workspaceId = "workspace-loop";
const firstStore = createSupabaseStateStore({
  client,
  workspaceId,
});

await firstStore.set({
  workspace: {
    id: workspaceId,
    name: "Northstar Studio",
    slug: "northstar-loop",
    timezone: "UTC",
  },
  brands: [
    {
      id: "brand-a",
      name: "Brand A",
      voice: "Precise.",
      audience: "Builders.",
    },
    {
      id: "brand-b",
      name: "Brand B",
      voice: "Bold.",
      audience: "Creators.",
    },
  ],
  activeBrandId: "brand-b",
  brand: {
    id: "brand-b",
    name: "Brand B",
    voice: "Bold.",
    audience: "Creators.",
  },
});

const runtime = createOrbitRuntime({
  store: firstStore,
});

let state = await runtime.createDraft(
  {
    id: "idea-loop-1",
    title: "Persist the content loop",
    pillar: "Systems",
    audience: "Creators",
    goal: "Education",
    brief: "One idea should survive a browser refresh without losing brand context.",
  },
  {
    id: "brand-b",
    name: "Brand B",
    voice: "Bold.",
    audience: "Creators.",
  },
);

assert.equal(state.ideas[0].metadata.brandId, "brand-b");
assert.equal(state.contentItems[0].brandId, "brand-b");
assert.equal(state.contentVariants.length, 6);
assert.equal(state.research[0].brandId, "brand-b");
assert.equal(typeof state.ideas[0].strategy, "object");
assert.ok(state.ideas[0].strategy.angle);

state = await runtime.updateContentVariant({
  ideaId: "idea-loop-1",
  platform: "TikTok",
  changes: {
    hook: "A backend should survive refresh.",
  },
});

assert.equal(
  state.contentVariants.find((item) => item.platform === "TikTok")?.version,
  2,
);

state = await runtime.approveIdea("idea-loop-1");
assert.equal(state.ideas[0].stage, "approved");
assert.equal(
  state.ideas[0].variants.TikTok.approved,
  true,
);

state = await runtime.scheduleIdeaVariant({
  ideaId: "idea-loop-1",
  platform: "TikTok",
  scheduledAt: "2026-10-12T09:00:00Z",
});

assert.equal(state.schedules.length, 1);
assert.equal(state.schedules[0].brandId, "brand-b");

const reloadedStore = createSupabaseStateStore({
  client,
  workspaceId,
});
const reloaded = await reloadedStore.get();

assert.equal(reloaded.activeBrandId, "brand-b");
assert.equal(reloaded.brand.id, "brand-b");
assert.equal(reloaded.ideas[0].metadata.brandId, "brand-b");
assert.equal(reloaded.ideas[0].stage, "approved");
assert.equal(reloaded.ideas[0].variants.TikTok.approved, true);
assert.equal(reloaded.contentVariants.length, 6);
assert.equal(reloaded.contentVariants.find((item) => item.platform === "TikTok")?.version, 2);
assert.equal(typeof reloaded.ideas[0].strategy, "object");
assert.equal(reloaded.ideas[0].strategy.angle, state.ideas[0].strategy.angle);
assert.equal(reloaded.schedules[0].platform, "TikTok");
assert.equal(reloaded.schedules[0].brandId, "brand-b");

console.log("OrbitOS persistent content loop tests passed.");
