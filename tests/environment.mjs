import assert from "node:assert/strict";
import {
  createRuntimeEnvironment,
  RUNTIME_MODES,
} from "../src/runtime/environment.mjs";

assert.deepEqual(RUNTIME_MODES, [
  "local",
  "authenticated-persistent",
]);

const local = createRuntimeEnvironment();
assert.equal(local.mode, "local");
assert.equal(local.provider, "local-store");
assert.equal(local.persistent, false);
assert.equal(local.authenticated, false);

const remote = createRuntimeEnvironment({
  mode: "authenticated-persistent",
  provider: "supabase",
  workspaceId: "workspace-1",
  userId: "user-1",
});
assert.equal(remote.mode, "authenticated-persistent");
assert.equal(remote.provider, "supabase");
assert.equal(remote.persistent, true);
assert.equal(remote.authenticated, true);
assert.equal(remote.workspaceId, "workspace-1");
assert.equal(remote.userId, "user-1");

console.log("OrbitOS runtime environment tests passed.");
