import { createOrbitRuntime } from "../core/runtime.mjs";
import { createSupabaseStateStore } from "../adapters/supabase-store.mjs";

export function createPersistentOrbitRuntime({
  client,
  workspaceId,
  ...runtimeOptions
} = {}) {
  const store = createSupabaseStateStore({
    client,
    workspaceId,
  });

  return createOrbitRuntime({
    ...runtimeOptions,
    store,
  });
}
