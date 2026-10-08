export const ANALYTICS_IMPORT_PROVIDER_CONTRACTS = Object.freeze([
  "fetch",
]);

export function assertAnalyticsImportProvider(adapter) {
  if (!adapter || typeof adapter !== "object") {
    throw new Error("OrbitOS analytics import provider is required.");
  }

  for (const method of ANALYTICS_IMPORT_PROVIDER_CONTRACTS) {
    if (typeof adapter[method] !== "function") {
      throw new Error(
        "OrbitOS analytics import provider must implement " + method + "().",
      );
    }
  }

  return adapter;
}
