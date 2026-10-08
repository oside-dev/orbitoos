import assert from "node:assert/strict";
import { createOrbitBrowserBridge } from "../src/runtime/browser-bridge.mjs";

function createMemoryStorage() {
  const data = new Map();
  return {
    getItem(key) {
      return data.has(key) ? data.get(key) : null;
    },
    setItem(key, value) {
      data.set(key, String(value));
    },
  };
}

const storage = createMemoryStorage();
storage.setItem(
  "orbit-v4",
  JSON.stringify({
    version: 4,
    workspace: { id: "workspace-local", name: "Northstar Studio" },
    activeBrandId: "brand-a",
    brand: { id: "brand-a", name: "Northstar Studio", voice: "clear", audience: "builders" },
    brands: [
      { id: "brand-a", name: "Northstar Studio", voice: "clear", audience: "builders" },
    ],
    ideas: [],
    research: [],
    contentItems: [],
    contentVariants: [],
    metrics: [],
    learningInsights: [],
    schedules: [],
    audit: [],
    settings: { ai: { provider: "local", model: "", baseUrl: "http://localhost:11434/api" } },
  }),
);

const bridge = createOrbitBrowserBridge({ storage, key: "orbit-v4" });

const imported = await bridge.importAnalyticsReport(
  `platform,snapshotDate,views,reach,engagements,followerDelta,provider,source,brandId\nTikTok,2026-10-08,1200,900,120,14,tiktok,export,brand-a\nInstagram Reels,2026-10-08,2400,2100,180,22,instagram,export,brand-a`,
  { source: "csv-import", provider: "manual-import" },
);

assert.equal(imported.metrics.length, 2);
assert.equal(imported.metrics[0].brandId, "brand-a");
assert.equal(imported.metrics[0].provider, "tiktok");
assert.equal(imported.metrics[0].source, "export");
assert.equal(imported.metrics[0].isDemo, false);
assert.equal(imported.metrics[0].views, 1200);
assert.equal(imported.metrics[0].followerDelta, 14);
assert.equal(imported.metrics[1].platform, "Instagram Reels");

const snapshot = await bridge.snapshot();
assert.equal(snapshot.metrics.length, 2);
assert.equal(snapshot.metrics[0].brandId, "brand-a");

const jsonImported = await bridge.importAnalyticsReport(
  JSON.stringify({
    records: [
      {
        channel: "YouTube Shorts",
        date: "2026-10-08",
        impressions: 4500,
        interactions: 270,
        growth: 31,
      },
    ],
  }),
  { source: "json-import", provider: "manual-import" },
);

assert.equal(jsonImported.metrics.length, 3);
assert.equal(jsonImported.metrics[2].platform, "YouTube Shorts");
assert.equal(jsonImported.metrics[2].reach, 4500);
assert.equal(jsonImported.metrics[2].followerDelta, 31);
assert.equal(jsonImported.metrics[2].provider, "manual-import");
assert.equal(jsonImported.metrics[2].source, "json-import");

console.log("OrbitOS analytics report import bridge tests passed.");
