import { assertNormalizedMetrics } from "../contracts/adapters.mjs";

function integer(value) {
  const parsed = Number(value);
  return Number.isFinite(parsed) ? Math.max(0, Math.round(parsed)) : 0;
}

export const localMetricsAdapter = Object.freeze({
  normalize(raw = {}) {
    const snapshot = {
      platform: String(raw.platform ?? "Unknown"),
      snapshotDate: String(
        raw.snapshotDate ?? new Date().toISOString().slice(0, 10),
      ),
      views: integer(raw.views),
      reach: integer(raw.reach),
      engagements: integer(raw.engagements),
      followerDelta: Number.isFinite(Number(raw.followerDelta))
        ? Math.round(Number(raw.followerDelta))
        : 0,
      isDemo: raw.isDemo !== false,
      source: String(raw.source ?? "local-fixture"),
      provider: String(raw.provider ?? "local-metrics"),
    };

    return assertNormalizedMetrics(snapshot);
  },
});
