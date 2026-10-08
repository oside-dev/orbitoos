import assert from "node:assert/strict";
import { createImportedAnalyticsProvider } from "../src/adapters/imported-analytics-provider.mjs";

const csv = `platform,date,views,reach,engagements,followerDelta,source,provider,brandId
TikTok,2026-10-08,1200,1100,90,12,creator-report,platform-export,brand-a
Instagram Reels,2026-10-08,800,760,61,8,creator-report,platform-export,brand-a`;

const provider = createImportedAnalyticsProvider({
  text: csv,
  options: {
    source: "creator-report",
    provider: "platform-export",
    brandId: "brand-a",
    format: "csv",
  },
});

assert.equal(provider.provider, "imported-report");
assert.equal(provider.format, "csv");

const rows = await provider.fetch();
assert.equal(rows.length, 2);
assert.equal(rows[0].platform, "TikTok");
assert.equal(rows[0].source, "creator-report");
assert.equal(rows[0].provider, "platform-export");
assert.equal(rows[0].brandId, "brand-a");
assert.equal(rows[0].isDemo, false);
assert.equal(rows[1].platform, "Instagram Reels");
assert.equal(rows[1].views, 800);

console.log("OrbitOS imported analytics provider tests passed.");
