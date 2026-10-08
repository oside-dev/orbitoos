import { PLATFORMS, createVariant } from "../domain/models.mjs";

const PLATFORM_HASHTAGS = Object.freeze({
  TikTok: ["#creator", "#contenttips", "#socialmedia"],
  "Instagram Reels": ["#contentstrategy", "#creatoreconomy", "#reels"],
  "YouTube Shorts": ["#shorts", "#contenttips", "#creators"],
  X: ["#contentstrategy", "#marketing", "#creators"],
  Facebook: ["#contentmarketing", "#socialmedia", "#creators"],
  LinkedIn: ["#contentstrategy", "#marketing", "#creatorbusiness"],
});

export function generateLocalVariants({ idea, brand = {} }) {
  const voice = String(brand.voice ?? "clear and useful");

  return Object.fromEntries(
    PLATFORMS.map((platform) => [
      platform,
      createVariant({
        platform,
        hook: "Why " + idea.title + " matters more than you think.",
        body:
          "Start with the audience problem, show one concrete example, " +
          "then explain the principle. Voice: " +
          voice,
        cta: "Save this and test it this week.",
        hashtags: PLATFORM_HASHTAGS[platform] ?? [],
      }),
    ]),
  );
}

export const localContentGeneratorAdapter = Object.freeze({
  generate: generateLocalVariants,
});
