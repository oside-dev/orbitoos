import { assertAnalyticsImportProvider } from "../contracts/analytics.mjs";
import { parseAnalyticsReport } from "./analytics-report-parser.mjs";

export function createImportedAnalyticsProvider({ text, options = {} } = {}) {
  const reportText = String(text ?? "");
  const reportOptions = { ...options };

  return assertAnalyticsImportProvider(
    Object.freeze({
      provider: "imported-report",
      format: String(reportOptions.format ?? "auto"),
      fetch: async () => parseAnalyticsReport(reportText, reportOptions),
    }),
  );
}
