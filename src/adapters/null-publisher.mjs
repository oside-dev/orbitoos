export class PublishingDisabledError extends Error {
  constructor(message = "OrbitOS publishing is disabled in the free/local runtime.") {
    super(message);
    this.name = "PublishingDisabledError";
    this.code = "PUBLISHING_DISABLED";
  }
}

export const nullPublisherAdapter = Object.freeze({
  enabled: false,

  async publish() {
    throw new PublishingDisabledError(
      "Publishing requires an official platform adapter, credentials, idempotency controls, audit logging, and recorded human approval.",
    );
  },
});
