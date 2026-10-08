import { PLATFORMS, createVariant } from "../domain/models.mjs";

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
      }),
    ]),
  );
}
