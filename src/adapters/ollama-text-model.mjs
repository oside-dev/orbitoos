import { assertTextModel } from "../contracts/ai.mjs";

export function createOllamaTextModel({
  baseUrl = "http://localhost:11434/api",
  model,
  fetchImpl = globalThis.fetch,
  keepAlive = "5m",
  timeoutMs = 60000,
} = {}) {
  if (!model) throw new Error("An Ollama model name is required.");
  if (typeof fetchImpl !== "function") {
    throw new Error("A fetch implementation is required.");
  }

  const normalizedBaseUrl = String(baseUrl).replace(/\/$/, "");

  const adapter = {
    provider: "ollama",
    local: true,

    async generate({
      prompt,
      system = "",
      schema = null,
    } = {}) {
      const controller = new AbortController();
      const timeout = setTimeout(() => controller.abort(), timeoutMs);

      try {
        const response = await fetchImpl(
          normalizedBaseUrl + "/generate",
          {
            method: "POST",
            headers: {
              "content-type": "application/json",
            },
            body: JSON.stringify({
              model,
              prompt: String(prompt ?? ""),
              system: String(system ?? ""),
              format: schema ?? "json",
              stream: false,
              keep_alive: keepAlive,
            }),
            signal: controller.signal,
          },
        );

        if (!response.ok) {
          throw new Error(
            "Ollama request failed with HTTP " + response.status + ".",
          );
        }

        const payload = await response.json();

        if (typeof payload?.response !== "string") {
          throw new Error("Ollama response did not contain generated text.");
        }

        return {
          text: payload.response,
          model: payload.model ?? model,
          provider: "ollama",
          local: true,
          raw: payload,
        };
      } finally {
        clearTimeout(timeout);
      }
    },
  };

  return assertTextModel(adapter);
}
