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

console.log("OrbitOS application browser bridge auth integration tests passed.");
