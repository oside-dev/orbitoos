import assert from "node:assert/strict";
import { createPublishingGateway, PublishingGateError } from "../src/core/publishing-gateway.mjs";

let calls = 0;
const published = {
  id: "platform-post-1",
  status: "published",
};

const adapter = {
  provider: "test-platform",
  enabled: true,
  official: true,
  credentialsReady: true,
  supportsIdempotency: true,
  rateLimitReady: true,
  async publish(input) {
    calls += 1;
    assert.equal(input.approval, true);
    assert.equal(input.idempotencyKey, "schedule-1:1");
    return published;
  },
};

const gateway = createPublishingGateway({ adapter });

const first = await gateway.publish({
  variant: { platform: "TikTok" },
  schedule: "2026-10-09T09:00:00Z",
  approval: true,
  idempotencyKey: "schedule-1:1",
});
const second = await gateway.publish({
  variant: { platform: "TikTok" },
  schedule: "2026-10-09T09:00:00Z",
  approval: true,
  idempotencyKey: "schedule-1:1",
});

assert.equal(first.status, "published");
assert.deepEqual(second, first);
assert.equal(calls, 1);

await assert.rejects(
  () =>
    gateway.publish({
      schedule: "2026-10-09T09:00:00Z",
      approval: false,
      idempotencyKey: "schedule-2:1",
    }),
  (error) =>
    error instanceof PublishingGateError &&
    error.code === "PUBLISHING_APPROVAL_REQUIRED",
);

const missingIdempotency = createPublishingGateway({ adapter });
await assert.rejects(
  () =>
    missingIdempotency.publish({
      schedule: "2026-10-09T09:00:00Z",
      approval: true,
    }),
  (error) =>
    error instanceof PublishingGateError &&
    error.code === "PUBLISHING_IDEMPOTENCY_REQUIRED",
);

const unsafeAdapter = createPublishingGateway({
  adapter: {
    provider: "unsafe",
    enabled: true,
    official: true,
    credentialsReady: false,
    supportsIdempotency: true,
    rateLimitReady: true,
    async publish() {
      throw new Error("must not be called");
    },
  },
});

await assert.rejects(
  () =>
    unsafeAdapter.publish({
      schedule: "2026-10-09T09:00:00Z",
      approval: true,
      idempotencyKey: "schedule-3:1",
    }),
  (error) =>
    error instanceof PublishingGateError &&
    error.code === "PUBLISHING_GATE_CREDENTIALSREADY",
);

console.log("OrbitOS publishing gateway tests passed.");
