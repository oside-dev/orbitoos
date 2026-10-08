import { assertAdapter } from "../contracts/adapters.mjs";

export function createResearchAgent({ adapter }) {
  assertAdapter("research", adapter);

  return Object.freeze({
    name: "Research",
    run(input) {
      return adapter.research(input);
    },
  });
}
