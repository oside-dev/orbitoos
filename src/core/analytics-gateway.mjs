import { assertAdapter } from "../contracts/adapters.mjs";

const REQUIRED_CAPABILITIES = Object.freeze([
  "official",
  "credentialsReady",
  "rateLimitReady",
]);

export class AnalyticsGatewayError extends Error {
  constructor(code, message) {
    super(message);
    this.name = "AnalyticsGatewayError";
    this.code = code;
  }
}

export function createAnalyticsGateway({ adapter } = {}) {
  if (!adapter || typeof adapter.fetch !== "function") {
    throw new AnalyticsGatewayError(
      "ANALYTICS_PROVIDER_INVALID",
      "OrbitOS analytics ingestion requires a provider adapter.",
    );
  }

  assertAdapter("analyticsProvider", adapter);

  function checkCapabilities() {
    if (adapter.enabled !== true) {
      throw new AnalyticsGatewayError(
        "ANALYTICS_DISABLED",
        "Analytics ingestion is disabled for this provider.",
      );
    }

    for (const capability of REQUIRED_CAPABILITIES) {
      if (adapter[capability] !== true) {
        throw new AnalyticsGatewayError(
          "ANALYTICS_GATE_" + capability.toUpperCase(),
          "Analytics provider capability '" + capability + "' is not ready.",
        );
      }
    }
  }

  async function fetch(input = {}) {
    checkCapabilities();
    const result = await adapter.fetch(input);

    if (!Array.isArray(result)) {
      throw new AnalyticsGatewayError(
        "ANALYTICS_INVALID_RESPONSE",
        "Analytics provider must return an array of raw metric records.",
      );
    }

    return result.map((row) => ({
      ...row,
      provider: String(row?.provider ?? adapter.provider ?? "analytics-provider"),
      isDemo: false,
      source: String(row?.source ?? adapter.provider ?? "external"),
    }));
  }

  return Object.freeze({
    provider: adapter.provider ?? "analytics-provider",
    fetch,
  });
}
