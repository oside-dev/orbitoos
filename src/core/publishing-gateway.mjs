export class PublishingGateError extends Error {
  constructor(code, message) {
    super(message);
    this.name = "PublishingGateError";
    this.code = code;
  }
}

const REQUIRED_CAPABILITIES = Object.freeze([
  "official",
  "credentialsReady",
  "supportsIdempotency",
  "rateLimitReady",
]);

function clone(value) {
  if (value === undefined) return undefined;
  return structuredClone(value);
}

export function createPublishingGateway({
  adapter,
  minIntervalMs = 0,
  clock = () => Date.now(),
} = {}) {
  if (!adapter || typeof adapter.publish !== "function") {
    throw new PublishingGateError(
      "PUBLISHER_INVALID",
      "OrbitOS publishing requires a publisher adapter.",
    );
  }

  const seen = new Map();
  let lastPublishAt = 0;

  function checkCapabilities() {
    if (adapter.enabled !== true) {
      throw new PublishingGateError(
        "PUBLISHING_DISABLED",
        "OrbitOS publishing is disabled for this adapter.",
      );
    }

    for (const capability of REQUIRED_CAPABILITIES) {
      if (adapter[capability] !== true) {
        throw new PublishingGateError(
          "PUBLISHING_GATE_" + capability.toUpperCase(),
          "Publisher capability '" + capability + "' is not ready.",
        );
      }
    }
  }

  async function publish(input = {}) {
    checkCapabilities();

    const approval = input.approval === true;
    if (!approval) {
      throw new PublishingGateError(
        "PUBLISHING_APPROVAL_REQUIRED",
        "Human approval is required before publishing.",
      );
    }

    const idempotencyKey = String(input.idempotencyKey ?? "").trim();
    if (!idempotencyKey) {
      throw new PublishingGateError(
        "PUBLISHING_IDEMPOTENCY_REQUIRED",
        "Publishing requires an idempotency key.",
      );
    }

    const scheduledAt = String(input.schedule ?? "").trim();
    if (!scheduledAt || Number.isNaN(Date.parse(scheduledAt))) {
      throw new PublishingGateError(
        "PUBLISHING_SCHEDULE_REQUIRED",
        "Publishing requires a valid schedule timestamp.",
      );
    }

    if (seen.has(idempotencyKey)) {
      return clone(seen.get(idempotencyKey));
    }

    const now = Number(clock());
    if (
      minIntervalMs > 0 &&
      lastPublishAt > 0 &&
      now - lastPublishAt < minIntervalMs
    ) {
      throw new PublishingGateError(
        "PUBLISHING_RATE_LIMIT",
        "Publishing is rate-limited by the gateway.",
      );
    }

    lastPublishAt = now;
    const result = await adapter.publish({
      ...input,
      idempotencyKey,
      approval: true,
    });

    seen.set(idempotencyKey, clone(result));
    return result;
  }

  return Object.freeze({
    provider: adapter.provider ?? "gateway",
    enabled: adapter.enabled === true,
    publish,
    clearIdempotencyCache() {
      seen.clear();
    },
  });
}
