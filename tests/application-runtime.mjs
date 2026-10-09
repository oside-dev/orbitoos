import assert from "node:assert/strict";
import {
  APPLICATION_RUNTIME_MODES,
  createApplicationRuntime,
} from "../src/runtime/application-runtime.mjs";

assert.deepEqual(APPLICATION_RUNTIME_MODES, [
  "local",
  "authenticated-persistent",
]);

const local = await createApplicationRuntime({
  mode: "local",
  state: {
    workspace: {
      id: "workspace-local",
      name: "Local Workspace",
    },
  },
});

assert.equal(local.environment.mode, "local");
assert.equal(local.environment.provider, "local-store");
assert.equal(local.environment.persistent, false);
assert.equal(local.environment.authenticated, false);
assert.equal(local.environment.workspaceId, "workspace-local");
assert.equal(local.user, null);
assert.equal(local.membership, null);
assert.equal(typeof local.runtime.snapshot, "function");

const fakeUser = {
  id: "user-1",
  email: "boss@example.com",
};

const fakeAuth = {
  async getSession() {
    return null;
  },
  async getUser() {
    return fakeUser;
  },
  async signInWithPassword() {},
  async signUp() {},
  async resendSignupConfirmation() {},
  async signOut() {},
  onAuthStateChange() {
    return { unsubscribe() {} };
  },
};

const fakeWorkspaceContext = {
  async listForUser({ userId }) {
    assert.equal(userId, "user-1");
    return [{ workspaceId: "workspace-remote", role: "owner" }];
  },
};

const fakeClient = {
  from() {
    throw new Error("The persistent runtime test should not need database I/O.");
  },
};

const authenticated = await createApplicationRuntime({
  mode: "authenticated-persistent",
  auth: fakeAuth,
  workspaceContext: fakeWorkspaceContext,
  client: fakeClient,
});

assert.equal(authenticated.environment.mode, "authenticated-persistent");
assert.equal(authenticated.environment.provider, "supabase");
assert.equal(authenticated.environment.persistent, true);
assert.equal(authenticated.environment.authenticated, true);
assert.equal(authenticated.environment.workspaceId, "workspace-remote");
assert.equal(authenticated.environment.userId, "user-1");
assert.equal(authenticated.user.id, "user-1");
assert.deepEqual(authenticated.membership, {
  workspaceId: "workspace-remote",
  role: "owner",
});
assert.equal(typeof authenticated.runtime.snapshot, "function");

console.log("OrbitOS application runtime tests passed.");
