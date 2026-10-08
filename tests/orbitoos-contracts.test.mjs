import test from "node:test";
import assert from "node:assert/strict";

import {
  createBrand,
  createContentVariant,
  createIdea,
  createSchedule,
} from "../src/domain/models.mjs";
import { toCoreStage, toUiStage } from "../src/runtime/ui-state.mjs";
import {
  normalizeAnalyticsReportRow,
  parseAnalyticsReport,
} from "../src/adapters/analytics-report-parser.mjs";
import {
  fromPersistentBrandRow,
  toPersistentBrandRow,
} from "../src/adapters/supabase-store.mjs";

test("domain models enforce the canonical pipeline contract", () => {
  const brand = createBrand({
    id: "brand-test",
    name: "Test Brand",
    voice: "Clear",
    audience: "Creators",
    pillars: ["Education", "Systems"],
    rules: ["No invented facts"],
  });

  const idea = createIdea({
    id: "idea-test",
    title: "A useful idea",
    brandId: brand.id,
    stage: "Draft",
  });

  const variant = createContentVariant({
    id: "variant-test",
    contentItemId: "content-test",
    brandId: brand.id,
    platform: "TikTok",
    hook: "A strong hook",
  });

  const schedule = createSchedule({
    id: "schedule-test",
    contentItemId: "content-test",
    platform: variant.platform,
    scheduledAt: "2030-01-01T12:00:00Z",
  });

  assert.equal(brand.id, "brand-test");
  assert.deepEqual(brand.pillars, ["Education", "Systems"]);
  assert.deepEqual(brand.rules, ["No invented facts"]);
  assert.equal(idea.stage, "idea");
  assert.equal(idea.metadata.brandId, "brand-test");
  assert.equal(variant.platform, "TikTok");
  assert.equal(schedule.status, "scheduled");
});

test("brand persistence preserves pillars and guardrails", () => {
  const row = toPersistentBrandRow(
    {
      id: "brand-test",
      name: "Test Brand",
      voice: "Clear",
      audience: "Creators",
      pillars: ["Education", "Systems"],
      rules: ["No invented facts", "No auto-publish"],
      visualDirection: "Clean",
      postingGoals: { cadence: "weekly" },
    },
    "workspace-test",
  );

  assert.equal(row.workspace_id, "workspace-test");
  assert.deepEqual(row.pillars, ["Education", "Systems"]);
  assert.deepEqual(row.prohibited, ["No invented facts", "No auto-publish"]);

  const restored = fromPersistentBrandRow(row);
  assert.deepEqual(restored.pillars, ["Education", "Systems"]);
  assert.deepEqual(restored.rules, ["No invented facts", "No auto-publish"]);
  assert.equal(restored.visualDirection, "Clean");
});

test("UI and core stages round-trip", () => {
  for (const stage of ["Idea", "Research", "Strategy", "Draft", "Review", "Approved", "Scheduled"]) {
    assert.equal(toUiStage(toCoreStage(stage)), stage);
  }
});

test("analytics parser normalizes CSV reports", () => {
  const input = [
    "platform,date,views,reach,engagements,follower_delta",
    "TikTok,2026-10-01,1000,900,90,12",
    "LinkedIn,2026-10-01,500,450,25,4",
  ].join("\n");

  const rows = parseAnalyticsReport(input, {
    source: "test.csv",
    provider: "fixture",
  });

  assert.equal(rows.length, 2);
  assert.equal(rows[0].platform, "TikTok");
  assert.equal(rows[0].views, 1000);
  assert.equal(rows[0].reach, 900);
  assert.equal(rows[0].engagements, 90);
  assert.equal(rows[0].followerDelta, 12);
  assert.equal(rows[0].isDemo, false);
});

test("analytics parser normalizes numeric strings", () => {
  const row = normalizeAnalyticsReportRow({
    platform: "Instagram Reels",
    views: "2,400",
    impressions: "2,100",
    likes: 120,
    followers: 17,
  });

  assert.deepEqual(
    {
      platform: row.platform,
      views: row.views,
      reach: row.reach,
      engagements: row.engagements,
      followerDelta: row.followerDelta,
    },
    {
      platform: "Instagram Reels",
      views: 2400,
      reach: 2100,
      engagements: 120,
      followerDelta: 17,
    },
  );
});
