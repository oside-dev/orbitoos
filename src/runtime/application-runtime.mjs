import { createOrbitRuntime } from "../core/runtime.mjs";
import { createInitialState } from "../domain/state.mjs";
import { MemoryStore } from "../adapters/local-store.mjs";
import { createAuthenticatedPersistentRuntime } from "./authenticated-runtime.mjs";
import { createRuntimeEnvironment } from "./environment.mjs";

export const APPLICATION_RUNTIME_MODES = Object.freeze([
  "local",
  "authenticated-persistent",
]);

function createLocalApplicationRuntime({
  state = {},
  ai,
  research,
  metrics,
  contentGenerator,
  publisher,
  analyticsGateway,
} = {}) {
  const initialState = createInitialState(state);
  const runtime = createOrbitRuntime({
    store: new MemoryStore(initialState),
    ai,
    research,
    metrics,
    contentGenerator,
    publisher,
    analyticsGateway,
  });

  return Object.freeze({
    runtime,
    environment: createRuntimeEnvironment({
      mode: "local",
      provider: "local-store",
      workspaceId: initialState.workspace?.id ?? null,
      userId: null,
    }),
    user: null,
    membership: null,
  });
}

export async function createApplicationRuntime({
  mode = "local",
  ...options
} = {}) {
  if (!APPLICATION_RUNTIME_MODES.includes(mode)) {
    throw new Error("Unknown OrbitOS application runtime mode: " + mode);
  }

  if (mode === "local") {
    return createLocalApplicationRuntime(options);
  }

  const secured = await createAuthenticatedPersistentRuntime(options);

  return Object.freeze({
    runtime: secured.runtime,
    user: secured.user,
    membership: secured.membership,
    environment: createRuntimeEnvironment({
      mode: "authenticated-persistent",
      provider: "supabase",
      workspaceId: secured.membership.workspaceId,
      userId: secured.user.id,
    }),
  });
}
