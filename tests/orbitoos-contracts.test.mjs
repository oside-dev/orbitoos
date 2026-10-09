import test from "node:test";
import assert from "node:assert/strict";

import {
  createBrand,
  createContentVariant,
  createIdea,
  normalizePublicMediaUrl,
  createSchedule,
  createSocialAccount,
  createPublishingJob,
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
import { createOrbitRuntime } from "../src/core/runtime.mjs";
import { MemoryStore } from "../src/adapters/local-store.mjs";
import { createInitialState } from "../src/domain/state.mjs";

test("media URLs require public HTTPS hosts and reject unsafe URLs", () => {
  assert.equal(normalizePublicMediaUrl(""), "");
  assert.equal(
    normalizePublicMediaUrl("https://cdn.orbitoos.com/assets/reel.mp4#preview"),
    "https://cdn.orbitoos.com/assets/reel.mp4",
  );
  assert.throws(
    () => normalizePublicMediaUrl("http://cdn.orbitoos.com/assets/image.jpg"),
    /HTTPS/,
  );
  assert.throws(
    () => normalizePublicMediaUrl("https://user:pass@cdn.orbitoos.com/image.jpg"),
    /credentials/,
  );
  assert.throws(
    () => normalizePublicMediaUrl("https://localhost/private.jpg"),
    /public hostname/,
  );
  assert.throws(
    () => normalizePublicMediaUrl("https://192.168.1.20/private.jpg"),
    /public hostname/,
  );
  assert.throws(
    () => normalizePublicMediaUrl("javascript:alert(1)"),
    /HTTPS/,
  );

  const variant = createContentVariant({
    id: "variant-media-url",
    platform: "Instagram Reels",
    mediaUrl: "https://cdn.orbitoos.com/assets/reel.mp4",
  });
  assert.equal(variant.mediaUrl, "https://cdn.orbitoos.com/assets/reel.mp4");
});

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


test("social account and publishing job models enforce provider boundaries", () => {
  const account = createSocialAccount({
    id: "social-test",
    workspaceId: "workspace-test",
    brandId: "brand-test",
    platform: "instagram",
    accountType: "business",
    externalAccountId: "ig-123",
    status: "connected",
    scopes: ["instagram_basic"],
  });

  const job = createPublishingJob({
    id: "job-test",
    workspaceId: "workspace-test",
    brandId: "brand-test",
    socialAccountId: account.id,
    contentItemId: "content-test",
    contentVariantId: "variant-test",
    idempotencyKey: "schedule-1:1",
    scheduledAt: "2030-01-01T12:00:00Z",
  });

  assert.equal(account.platform, "instagram");
  assert.equal(account.status, "connected");
  assert.equal(job.socialAccountId, "social-test");
  assert.equal(job.status, "queued");
  assert.equal(job.idempotencyKey, "schedule-1:1");
});


test("media URL edits round-trip through the content runtime and reject unsafe values", async () => {
  const state = createInitialState({
    workspace: { id: "workspace-media-test", name: "Media Test", slug: "media-test" },
    brand: { id: "brand-media-test", name: "Media Test Brand", voice: "", audience: "" },
    brands: [
      { id: "brand-media-test", name: "Media Test Brand", voice: "", audience: "" },
    ],
    activeBrandId: "brand-media-test",
    ideas: [
      {
        id: "idea-media-test",
        title: "Media URL test",
        stage: "draft",
        variants: {
          "Instagram Reels": {
            hook: "Hook",
            body: "Body",
            cta: "CTA",
            hashtags: [],
            mediaUrl: "",
            approved: false,
          },
        },
        metadata: { brandId: "brand-media-test" },
      },
    ],
    contentItems: [],
    contentVariants: [],
    schedules: [],
    socialAccounts: [],
    publishingJobs: [],
  });

  const runtime = createOrbitRuntime({ store: new MemoryStore(state) });
  const mediaUrl = "https://cdn.orbitoos.com/assets/reel.mp4";
  const updated = await runtime.updateContentVariant({
    ideaId: "idea-media-test",
    platform: "Instagram Reels",
    changes: { mediaUrl },
  });

  assert.equal(updated.ideas[0].variants["Instagram Reels"].mediaUrl, mediaUrl);
  assert.equal(updated.contentVariants[0].mediaUrl, mediaUrl);

  await assert.rejects(
    runtime.updateContentVariant({
      ideaId: "idea-media-test",
      platform: "Instagram Reels",
      changes: { mediaUrl: "http://cdn.orbitoos.com/assets/reel.mp4" },
    }),
    /HTTPS/,
  );

  const afterRejectedEdit = await runtime.snapshot();
  assert.equal(afterRejectedEdit.ideas[0].variants["Instagram Reels"].mediaUrl, mediaUrl);
});

test("approved schedules create a durable publishing job when a matching account is connected", async () => {
  const state = createInitialState({
    workspace: {
      id: "workspace-test",
      name: "OrbitoOS Workspace",
      slug: "orbitoos-test",
      timezone: "UTC",
    },
    brand: {
      id: "brand-test",
      name: "Test Brand",
      voice: "Clear",
      audience: "Creators",
      pillars: ["Education"],
      rules: ["No auto-publish"],
    },
    brands: [
      {
        id: "brand-test",
        name: "Test Brand",
        voice: "Clear",
        audience: "Creators",
        pillars: ["Education"],
        rules: ["No auto-publish"],
      },
    ],
    activeBrandId: "brand-test",
    ideas: [
      {
        id: "idea-test",
        title: "Publishable idea",
        pillar: "Education",
        audience: "Creators",
        goal: "Reach",
        brief: "A test brief",
        stage: "approved",
        score: 90,
        variants: {
          "Instagram Reels": {
            hook: "A hook",
            body: "A body",
            cta: "A CTA",
            hashtags: ["#orbit"],
            creativeBrief: "",
            visualDirection: "",
            approved: true,
          },
        },
        metadata: { brandId: "brand-test" },
      },
    ],
    contentItems: [
      {
        id: "content-test",
        ideaId: "idea-test",
        brandId: "brand-test",
        title: "Publishable idea",
        brief: "A test brief",
        status: "approved",
        createdAt: "2030-01-01T10:00:00.000Z",
        updatedAt: "2030-01-01T10:00:00.000Z",
      },
    ],
    contentVariants: [
      {
        id: "variant-test",
        contentItemId: "content-test",
        brandId: "brand-test",
        platform: "Instagram Reels",
        hook: "A hook",
        body: "A body",
        cta: "A CTA",
        hashtags: ["#orbit"],
        creativeBrief: "",
        visualDirection: "",
        status: "approved",
        approved: true,
        version: 1,
        updatedAt: "2030-01-01T10:00:00.000Z",
      },
    ],
    socialAccounts: [
      {
        id: "social-test",
        workspaceId: "workspace-test",
        brandId: "brand-test",
        platform: "instagram",
        accountType: "business",
        externalAccountId: "ig-123",
        status: "connected",
        scopes: ["instagram_basic"],
        metadata: {},
        connectedAt: "2030-01-01T10:00:00.000Z",
        lastSyncedAt: null,
        updatedAt: "2030-01-01T10:00:00.000Z",
      },
    ],
    schedules: [],
    publishingJobs: [],
  });

  const runtime = createOrbitRuntime({
    store: new MemoryStore(state),
  });

  const next = await runtime.scheduleIdeaVariant({
    ideaId: "idea-test",
    platform: "Instagram Reels",
    scheduledAt: "2030-01-01T12:00:00Z",
  });

  assert.equal(next.schedules.length, 1);
  assert.equal(next.publishingJobs.length, 1);
  assert.equal(next.publishingJobs[0].socialAccountId, "social-test");
  assert.equal(next.publishingJobs[0].status, "queued");
  assert.equal(next.publishingJobs[0].idempotencyKey, next.schedules[0].id + ":1");
});

test("scheduling without a connected account remains a schedule-only operation", async () => {
  const state = createInitialState({
    workspace: { id: "workspace-test" },
    brand: {
      id: "brand-test",
      name: "Test Brand",
      voice: "",
      audience: "",
    },
    brands: [
      {
        id: "brand-test",
        name: "Test Brand",
        voice: "",
        audience: "",
      },
    ],
    activeBrandId: "brand-test",
    ideas: [
      {
        id: "idea-test-2",
        title: "Schedule only",
        stage: "approved",
        variants: {
          TikTok: {
            hook: "Hook",
            body: "Body",
            cta: "CTA",
            hashtags: [],
            approved: true,
          },
        },
        metadata: { brandId: "brand-test" },
      },
    ],
    contentItems: [
      {
        id: "content-test-2",
        ideaId: "idea-test-2",
        brandId: "brand-test",
        title: "Schedule only",
        brief: "",
      },
    ],
    contentVariants: [
      {
        id: "variant-test-2",
        contentItemId: "content-test-2",
        brandId: "brand-test",
        platform: "TikTok",
        hook: "Hook",
        body: "Body",
        cta: "CTA",
        approved: true,
        version: 1,
      },
    ],
    socialAccounts: [],
    schedules: [],
    publishingJobs: [],
  });

  const runtime = createOrbitRuntime({
    store: new MemoryStore(state),
  });

  const next = await runtime.scheduleIdeaVariant({
    ideaId: "idea-test-2",
    platform: "TikTok",
    scheduledAt: "2030-01-01T12:00:00Z",
  });

  assert.equal(next.schedules.length, 1);
  assert.equal(next.publishingJobs.length, 0);
});
