import assert from "node:assert/strict";
import {
  normalizeAnalyticsReportRow,
  parseAnalyticsReport,
} from "../src/adapters/analytics-report-parser.mjs";

const csv = `platform,snapshotDate,views,reach,engagements,followerDelta,provider,source,brandId
TikTok,2026-10-08,1200,900,120,14,tiktok,export,brand-a
Instagram Reels,2026-10-08,2400,2100,180,22,instagram,export,brand-a`;

const csvRows = parseAnalyticsReport(csv, {
  source: "csv-import",
  provider: "manual-import",
});

assert.equal(csvRows.length, 2);
assert.deepEqual(csvRows[0], {
  platform: "TikTok",
  snapshotDate: "2026-10-08",
  views: 1200,
  reach: 900,
  engagements: 120,
  followerDelta: 14,
  isDemo: false,
  source: "export",
  provider: "tiktok",
  brandId: "brand-a",
  contentItemId: null,
});

const jsonRows = parseAnalyticsReport(
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
  {
    source: "json-import",
    provider: "manual-import",
  },
);

assert.equal(jsonRows.length, 1);
assert.deepEqual(jsonRows[0], {
  platform: "YouTube Shorts",
  snapshotDate: "2026-10-08",
  views: 4500,
  reach: 4500,
  engagements: 270,
  followerDelta: 31,
  isDemo: false,
  source: "json-import",
  provider: "manual-import",
  brandId: null,
  contentItemId: null,
});

assert.deepEqual(
  normalizeAnalyticsReportRow(
    {
      platform: "X",
      snapshot_date: "2026-10-08",
      play_count: "77",
      uniqueReach: "66",
      likes: "5",
      netFollowers: "2",
    },
    { provider: "manual-import" },
  ),
  {
    platform: "X",
    snapshotDate: "2026-10-08",
    views: 77,
    reach: 66,
    engagements: 5,
    followerDelta: 2,
    isDemo: false,
    source: "analytics-report",
    provider: "manual-import",
    brandId: null,
    contentItemId: null,
  },
);

assert.throws(() => parseAnalyticsReport("", {}), /empty/i);

console.log("OrbitOS analytics report parser tests passed.");
