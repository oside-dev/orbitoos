import assert from "node:assert/strict";
import { createOrbitApplicationBrowserBridge } from "../src/runtime/application-browser-bridge.mjs";

function createMemoryStorage() {
  const data = new Map();
  return {
    getItem(key) {
      return data.has(key) ? data.get(key) : null;
    },
    setItem(key, value) {
      data.set(key, String(value));
    },
  };
}

const calls = {
  getSession: 0,
  getUser: 0,
  signUp: [],
  resend: [],
  bootstrap: 0,
  from: [],
};

const mockClient = {
  auth: {
    async getSession() {
      calls.getSession += 1;
      return { data: { session: null }, error: null };
    },
    async getUser() {
      calls.getUser += 1;
      return {
        data: { user: null },
        error: { message: "Auth session missing" },
      };
    },
    async signUp(input) {
      calls.signUp.push({
        email: input.email,
        passwordReceived: Boolean(input.password),
      });
      return {
        data: {
          user: {
            id: "user-confirmation-test",
            email: input.email,
            app_metadata: { provider: "email", providers: ["email"] },
            user_metadata: {},
            identities: [],
          },
          session: null,
        },
        error: null,
      };
    },
    async resend(input) {
      calls.resend.push(input);
      return { data: {}, error: null };
    },
    async signInWithPassword() {
      throw new Error("Sign-in is not part of this signed-out integration test.");
    },
    async signOut() {
      return { data: {}, error: null };
    },
    onAuthStateChange() {
      return { data: { subscription: { unsubscribe() {} } } };
    },
  },
  functions: {
    async invoke(name) {
      if (name === "bootstrap-workspace") calls.bootstrap += 1;
      throw new Error("Workspace bootstrap must not run without a session.");
    },
  },
  from(table) {
    calls.from.push(table);
    throw new Error("Database access must not run without a session.");
  },
};

const bridge = await createOrbitApplicationBrowserBridge({
  storage: createMemoryStorage(),
  supabaseClient: mockClient,
});

assert.equal((await bridge.getEnvironment()).mode, "local");
assert.equal((await bridge.getAuthSnapshot()).status, "signed_out");
assert.equal(calls.getUser, 0, "signed-out startup must not call getUser()");
assert.equal(calls.bootstrap, 0, "signed-out startup must not bootstrap a workspace");
assert.deepEqual(calls.from, [], "signed-out startup must not query workspace tables");

const signup = await bridge.signUp({
  email: "qa-confirmation@example.invalid",
  password: "test-only-password",
});

assert.equal(signup.status, "signed_out");
assert.equal(signup.user.email, "qa-confirmation@example.invalid");
assert.equal(calls.signUp.length, 1);
assert.equal(calls.getUser, 0, "a signup without a session must not reinitialize remote state");
assert.equal(calls.bootstrap, 0, "email confirmation must precede workspace bootstrap");

assert.deepEqual(
  await bridge.resendSignupConfirmation({ email: "  qa-confirmation@example.invalid  " }),
  { status: "requested" },
);
assert.deepEqual(calls.resend, [
  { type: "signup", email: "qa-confirmation@example.invalid" },
]);


const authenticatedCalls = {
  getSession: 0,
  getUser: 0,
  bootstrap: 0,
  from: [],
};
const authenticatedUser = {
  id: "11111111-1111-4111-8111-111111111111",
  email: "owner@example.invalid",
  app_metadata: { provider: "email", providers: ["email"] },
  user_metadata: {},
  identities: [],
};
const authenticatedWorkspaceId = "workspace-" + authenticatedUser.id;
const authenticatedBrandId = "brand-default-" + authenticatedUser.id;
const authenticatedSession = {
  user: authenticatedUser,
  access_token: "mock-access-token",
  refresh_token: "mock-refresh-token",
  expires_at: 1900000000,
  token_type: "bearer",
};
const authenticatedRows = new Map([
  ["workspace_members", [{
    id: "membership-test",
    user_id: authenticatedUser.id,
    workspace_id: authenticatedWorkspaceId,
    role: "owner",
  }]],
  ["workspaces", [{
    id: authenticatedWorkspaceId,
    name: "Authenticated QA Workspace",
    slug: "orbitoos-auth-qa",
    timezone: "UTC",
    settings: { activeBrandId: authenticatedBrandId },
  }]],
  ["brands", [{
    id: authenticatedBrandId,
    workspace_id: authenticatedWorkspaceId,
    name: "OrbitoOS",
    voice: "Clear and useful.",
    audience: "QA users.",
    pillars: ["Education"],
    prohibited: ["No fake claims"],
    visual_direction: "Simple.",
    posting_goals: {},
  }]],
  ["ideas", []],
  ["research_items", []],
  ["content_items", []],
  ["content_variants", []],
  ["schedules", []],
  ["social_accounts", []],
  ["publishing_jobs", []],
  ["analytics_snapshots", []],
  ["agent_runs", []],
  ["learning_insights", []],
]);
function mockQuery(table) {
  const filters = [];
  return {
    select() { return this; },
    eq(column, value) {
      filters.push([column, value]);
      return this;
    },
    then(resolve, reject) {
      try {
        let rows = authenticatedRows.get(table) ?? [];
        for (const [column, value] of filters) {
          rows = rows.filter((row) => row[column] === value);
        }
        return Promise.resolve({
          data: structuredClone(rows),
          error: null,
        }).then(resolve, reject);
      } catch (error) {
        return Promise.reject(error).then(resolve, reject);
      }
    },
  };
}
const authenticatedClient = {
  auth: {
    async getSession() {
      authenticatedCalls.getSession += 1;
      return { data: { session: authenticatedSession }, error: null };
    },
    async getUser() {
      authenticatedCalls.getUser += 1;
      return { data: { user: authenticatedUser }, error: null };
    },
    async signUp() {
      throw new Error("Unexpected signup in authenticated bootstrap test.");
    },
    async resend() {
      throw new Error("Unexpected resend in authenticated bootstrap test.");
    },
    async signInWithPassword() {
      throw new Error("Startup must restore the existing session.");
    },
    async signOut() {
      return { data: {}, error: null };
    },
    onAuthStateChange() {
      return { data: { subscription: { unsubscribe() {} } } };
    },
  },
  functions: {
    async invoke(name, input) {
      if (name !== "bootstrap-workspace") {
        throw new Error("Unexpected Edge Function call: " + name);
      }
      authenticatedCalls.bootstrap += 1;
      assert.deepEqual(input, { body: {} });
      return {
        data: {
          workspaceId: authenticatedWorkspaceId,
          role: "owner",
          brandId: authenticatedBrandId,
          bootstrapped: true,
        },
        error: null,
      };
    },
  },
  from(table) {
    authenticatedCalls.from.push(table);
    return mockQuery(table);
  },
};
const authenticatedBridge = await createOrbitApplicationBrowserBridge({
  storage: createMemoryStorage(),
  supabaseClient: authenticatedClient,
});
const authenticatedEnvironment = await authenticatedBridge.getEnvironment();
assert.deepEqual(authenticatedEnvironment, {
  mode: "authenticated-persistent",
  provider: "supabase",
  workspaceId: authenticatedWorkspaceId,
  userId: authenticatedUser.id,
  persistent: true,
  authenticated: true,
});
assert.equal(authenticatedCalls.getSession, 1);
assert.equal(
  authenticatedCalls.getUser,
  1,
  "A freshly verified user should be reused instead of triggering a duplicate getUser request.",
);
assert.equal(authenticatedCalls.bootstrap, 1, "A signed-in startup should bootstrap exactly once.");
assert.equal(
  authenticatedCalls.from.filter((table) => table === "workspace_members").length,
  1,
  "Workspace access must be established from the membership query.",
);
const authenticatedSnapshot = await authenticatedBridge.snapshot();
assert.equal(authenticatedSnapshot.workspace.name, "Authenticated QA Workspace");
assert.equal(authenticatedSnapshot.brand.id, authenticatedBrandId);
assert.equal(authenticatedSnapshot.auth.user.id, authenticatedUser.id);
assert.equal(authenticatedSnapshot.auth.membership.role, "owner");
await authenticatedBridge.signOut();
assert.equal(
  (await authenticatedBridge.getEnvironment()).mode,
  "local",
  "Signing out must return the bridge to the local runtime.",
);

console.log("OrbitOS application browser bridge auth integration tests passed.");
