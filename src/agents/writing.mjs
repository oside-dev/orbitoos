import { assertAdapter } from "../contracts/adapters.mjs";

export function createWritingAgent({ adapter }) {
  assertAdapter("contentGenerator", adapter);

  return Object.freeze({
    name: "Writing",
    run(input) {
      return adapter.generate(input);
    },
  });
}
