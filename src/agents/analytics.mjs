import { assertAdapter } from "../contracts/adapters.mjs";

export function createAnalyticsAgent({ adapter }) {
  assertAdapter("metrics", adapter);

  return Object.freeze({
    name: "Analytics",
    run(input) {
      return adapter.normalize(input);
    },
  });
}
