import { PLATFORMS } from "../domain/models.mjs";

export function createReviewAgent() {
  return Object.freeze({
    name: "Review",
    run({ variants, brand = {} } = {}) {
      const blocked = new Set(
        (brand.rules ?? []).filter((rule) => /never|no /i.test(rule)),
      );

      const reasons = [];

      if (!variants || Object.keys(variants).length !== PLATFORMS.length) {
        reasons.push("Every required platform needs a variant.");
      }

      if (blocked.size > 0 && reasons.length === 0) {
        reasons.push("Guardrails require a final human review.");
      }

      return {
        pass: reasons.length === 0,
        reasons,
        humanApprovalRequired: true,
      };
    },
  });
}

export const reviewAgent = createReviewAgent();
