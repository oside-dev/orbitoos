export const TEXT_MODEL_CONTRACT = Object.freeze(["generate"]);

export function assertTextModel(adapter) {
  if (!adapter || typeof adapter !== "object") {
    throw new Error("OrbitOS text model adapter is required.");
  }

  for (const method of TEXT_MODEL_CONTRACT) {
    if (typeof adapter[method] !== "function") {
      throw new Error(
        "OrbitOS text model adapter must implement " + method + "().",
      );
    }
  }

  return adapter;
}
