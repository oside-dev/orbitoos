export const RUNTIME_MODES = Object.freeze([
  "local",
  "authenticated-persistent",
]);

export function createRuntimeEnvironment({
  mode = "local",
  provider = "local-store",
  workspaceId = null,
  userId = null,
} = {}) {
  if (!RUNTIME_MODES.includes(mode)) {
    throw new Error("Unknown OrbitOS runtime mode: " + mode);
  }

  return Object.freeze({
    mode,
    provider: String(provider ?? "local-store"),
    workspaceId: workspaceId ? String(workspaceId) : null,
    userId: userId ? String(userId) : null,
    persistent: mode === "authenticated-persistent",
    authenticated: mode === "authenticated-persistent",
  });
}
