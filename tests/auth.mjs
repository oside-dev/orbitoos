import assert from "node:assert/strict";
import { createAuthSnapshot, normalizeAuthSession } from "../src/domain/auth.mjs";
import { createSupabaseAuthAdapter } from "../src/adapters/supabase-auth.mjs";
import { createSupabaseWorkspaceContextAdapter } from "../src/adapters/supabase-workspace-context.mjs";
import {
  createAuthenticatedPersistentRuntime,
  OrbitAuthBoundaryError,
} from "../src/runtime/authenticated-runtime.mjs";

let callbackState = null;
let resentConfirmation = null;

const rawUser = {
  id: "user-1",
  email: "boss@example.com",
  created_at: "2026-10-08T00:00:00Z",
  last_sign_in_at: "2026-10-08T01:00:00Z",
};

const rawSession = {
  user: rawUser,
  access_token: "secret-access-token",
  refresh_token: "secret-refresh-token",
  expires_at: 1900000000,
  token_type: "bearer",
};

const fakeAuth = {
  async getSession() {
    return { data: { session: rawSession }, error: null };
  },
  async getUser() {
    return { data: { user: rawUser }, error: null };
  },
  async signInWithPassword() {
    return { data: { user: rawUser, session: rawSession }, error: null };
  },
  async signUp() {
    return { data: { user: rawUser, session: null }, error: null };
  },
  async resend(input) {
    resentConfirmation = input;
    return { data: {}, error: null };
  },
  async signOut() {
    return { data: {}, error: null };
  },
  onAuthStateChange(callback) {
    callback("SIGNED_IN", rawSession);
    return {
      data: {
        subscription: {
          unsubscribe() {},
        },
      },
    };
  },
};

const auth = createSupabaseAuthAdapter({ auth: fakeAuth });
const sessionSnapshot = await auth.getSession();
assert.equal(sessionSnapshot.status, "signed_in");
assert.equal(sessionSnapshot.user.id, "user-1");
assert.equal(sessionSnapshot.session.expiresAt, 1900000000);
assert.equal("access_token" in sessionSnapshot.session, false);
assert.equal("refresh_token" in sessionSnapshot.session, false);
assert.deepEqual(await auth.getUser(), {
  id: "user-1",
  email: "boss@example.com",
  role: null,
  createdAt: "2026-10-08T00:00:00Z",
  lastSignInAt: "2026-10-08T01:00:00Z",
});

await auth.signInWithPassword({
  email: "boss@example.com",
  password: "not-persisted",
});
await auth.signUp({
  email: "boss@example.com",
  password: "not-persisted",
});
assert.deepEqual(
  await auth.resendSignupConfirmation({ email: " boss@example.com " }),
  { status: "requested" },
);
assert.deepEqual(resentConfirmation, {
  type: "signup",
  email: "boss@example.com",
});
await assert.rejects(
  () => auth.resendSignupConfirmation({ email: "   " }),
  /requires an email address/,
);
await auth.signOut();

const subscription = auth.onAuthStateChange((_event, snapshot) => {
  callbackState = snapshot;
});
assert.equal(callbackState.status, "signed_in");
assert.equal("access_token" in callbackState.session, false);
subscription.unsubscribe();

assert.deepEqual(
  normalizeAuthSession(rawSession),
  sessionSnapshot.session,
);

assert.deepEqual(
  createAuthSnapshot({ status: "signed_out" }),
  {
    status: "signed_out",
    user: null,
    session: null,
    error: null,
  },
);

const tables = new Map([
  [
    "workspace_members",
    [
      { workspace_id: "workspace-1", user_id: "user-1", role: "owner" },
      { workspace_id: "workspace-2", user_id: "user-1", role: "editor" },
    ],
  ],
]);

const fakeClient = {
  from(table) {
    const state = {
      table,
      filters: [],
    };

    return {
      select() {
        return this;
      },
      eq(column, value) {
        state.filters.push([column, value]);
        const rows = (tables.get(table) ?? []).filter((row) =>
          state.filters.every(([key, expected]) => row[key] === expected),
        );
        return Promise.resolve({ data: structuredClone(rows), error: null });
      },
    };
  },
};

const workspaceContext = createSupabaseWorkspaceContextAdapter({
  client: fakeClient,
});
assert.deepEqual(
  await workspaceContext.listForUser({ userId: "user-1" }),
  [
    { workspaceId: "workspace-1", role: "owner" },
    { workspaceId: "workspace-2", role: "editor" },
  ],
);

const secured = await createAuthenticatedPersistentRuntime({
  auth,
  workspaceContext,
  client: fakeClient,
  workspaceId: "workspace-2",
});

assert.equal(secured.user.id, "user-1");
assert.deepEqual(secured.membership, {
  workspaceId: "workspace-2",
  role: "editor",
});
assert.equal(typeof secured.runtime.snapshot, "function");

await assert.rejects(
  () =>
    createAuthenticatedPersistentRuntime({
      auth,
      workspaceContext,
      client: fakeClient,
      workspaceId: "workspace-missing",
    }),
  (error) =>
    error instanceof OrbitAuthBoundaryError &&
    error.code === "WORKSPACE_ACCESS_DENIED",
);

const signedOutAuth = {
  ...auth,
  async getUser() {
    return null;
  },
};

await assert.rejects(
  () =>
    createAuthenticatedPersistentRuntime({
      auth: signedOutAuth,
      workspaceContext,
      client: fakeClient,
    }),
  (error) =>
    error instanceof OrbitAuthBoundaryError &&
    error.code === "AUTH_REQUIRED",
);

console.log("OrbitOS auth boundary tests passed.");
