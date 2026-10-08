import assert from "node:assert/strict";
import { createAnalyticsGateway, AnalyticsGatewayError } from "../src/core/analytics-gateway.mjs";

let calls = 0;
const gateway = createAnalyticsGateway({
  adapter: {
    provider: "test-analytics",
    enabled: true,
    official: true,
    credentialsReady: true,
    rateLimitReady: true,
    async fetch() {
      calls += 1;
      return [
        {
          platform: "TikTok",
          snapshotDate: "2026-10-08",
          views: 100,
        },
      ];
    },
  },
});

const rows = await gateway.fetch();
assert.equal(calls, 1);
assert.equal(rows.length, 1);
assert.equal(rows[0].provider, "test-analytics");
assert.equal(rows[0].isDemo, false);
assert.equal(rows[0].source, "test-analytics");

const blocked = createAnalyticsGateway({
  adapter: {
    provider: "blocked",
    enabled: true,
    official: true,
    credentialsReady: false,
    rateLimitReady: true,
    async fetch() {
      throw new Error("must not be called");
    },
  },
});

await assert.rejects(
  () => blocked.fetch(),
  (error) =>
    error instanceof AnalyticsGatewayError &&
    error.code === "ANALYTICS_GATE_CREDENTIALSREADY",
);

console.log("OrbitOS analytics gateway tests passed.");
