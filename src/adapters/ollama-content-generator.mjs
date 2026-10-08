import { PLATFORMS, createVariant } from "../domain/models.mjs";
import { assertTextModel } from "../contracts/ai.mjs";

const VARIANT_SCHEMA = {
  type: "object",
  properties: Object.fromEntries(
    PLATFORMS.map((platform) => [
      platform,
      {
        type: "object",
        properties: {
          hook: { type: "string" },
          body: { type: "string" },
          cta: { type: "string" },
          hashtags: {
            type: "array",
            items: { type: "string" },
          },
        },
        required: ["hook", "body", "cta", "hashtags"],
      },
    ]),
  ),
  required: [...PLATFORMS],
};

function parseGeneratedJson(text) {
  try {
    const parsed = JSON.parse(text);
    if (!parsed || typeof parsed !== "object" || Array.isArray(parsed)) {
      throw new Error("Generated content must be a JSON object.");
    }
    return parsed;
  } catch {
    throw new Error("Local AI returned invalid structured content JSON.");
  }
}

export function createOllamaContentGenerator({ textModel }) {
  assertTextModel(textModel);

  return Object.freeze({
    provider: "ollama",
    local: true,

    async generate({ idea, strategy, brand = {} } = {}) {
      const result = await textModel.generate({
        system:
          "You are OrbitOS Writing Agent. Return only the requested JSON object. " +
          "Write useful, platform-native social content. Never invent evidence.",
        prompt: JSON.stringify({
          task: "Generate one platform-native social variant for every platform.",
          idea: {
            title: idea?.title,
            audience: idea?.audience,
            goal: idea?.goal,
            brief: idea?.brief,
          },
          strategy: {
            angle: strategy?.angle,
            kpis: strategy?.kpis,
          },
          brand: {
            name: brand.name,
            voice: brand.voice,
            rules: brand.rules,
          },
          platforms: PLATFORMS,
        }),
        schema: VARIANT_SCHEMA,
      });

      const generated = parseGeneratedJson(result.text);

      return Object.fromEntries(
        PLATFORMS.map((platform) => {
          const variant = generated[platform];

          if (!variant || typeof variant !== "object") {
            throw new Error(
              "Local AI response is missing the " + platform + " variant.",
            );
          }

          return [
            platform,
            createVariant({
              platform,
              hook: variant.hook,
              body: variant.body,
              cta: variant.cta,
              hashtags: variant.hashtags,
            }),
          ];
        }),
      );
    },
  });
}
