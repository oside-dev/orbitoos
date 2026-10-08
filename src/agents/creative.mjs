const PLATFORM_CREATIVE_RULES = Object.freeze({
  TikTok: "Vertical short-form. Lead with a visible action in the first beat and use fast visual proof.",
  "Instagram Reels": "Vertical short-form. Prioritize clean framing, strong text overlays, and a save-worthy takeaway.",
  "YouTube Shorts": "Vertical short-form. Make the opening self-contained, then use clear visual progression and payoff.",
  X: "Text-first visual support. Use one strong visual or diagram that reinforces the core claim.",
  Facebook: "Accessible visual storytelling. Use a clear opening frame, readable text, and a concrete takeaway.",
  LinkedIn: "Professional visual explainer. Use a clean diagram, process visual, or proof point with minimal decoration.",
});

export function createCreativeAgent() {
  return Object.freeze({
    name: "Creative",
    run({ variants = {}, brand = {} } = {}) {
      return Object.fromEntries(
        Object.entries(variants).map(([platform, variant]) => [
          platform,
          {
            ...variant,
            creativeBrief:
              PLATFORM_CREATIVE_RULES[platform] ??
              "Use platform-native visuals with one clear focal point.",
            visualDirection: String(
              brand.visualDirection ??
                brand.visual_direction ??
                "clean, useful, evidence-led",
            ),
          },
        ]),
      );
    },
  });
}

export const creativeAgent = createCreativeAgent();
