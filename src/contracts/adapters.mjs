export const ADAPTER_CONTRACTS = Object.freeze({
  store: ["get", "set", "update", "export", "import"],
  research: ["research"],
  contentGenerator: ["generate"],
  publisher: ["publish"],
  metrics: ["normalize"],
});

export function assertAdapter(kind, adapter) {
  const required = ADAPTER_CONTRACTS[kind];
  if (!required) throw new Error("Unknown OrbitOS adapter contract: " + kind);

  if (!adapter || typeof adapter !== "object") {
    throw new Error("OrbitOS " + kind + " adapter is required.");
  }

  for (const method of required) {
    if (typeof adapter[method] !== "function") {
      throw new Error(
        "OrbitOS " + kind + " adapter must implement " + method + "().",
      );
    }
  }

  return adapter;
}

export function assertNormalizedMetrics(snapshot) {
  const required = ["platform", "snapshotDate", "views", "reach", "engagements", "followerDelta"];
  for (const field of required) {
    if (!(field in snapshot)) {
      throw new Error("Normalized analytics snapshot is missing " + field + ".");
    }
  }
  return snapshot;
}
