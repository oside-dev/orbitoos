import { assertAuthAdapter } from "../contracts/auth.mjs";
import { createAuthSnapshot, normalizeAuthUser, normalizeAuthSession } from "../domain/auth.mjs";

export function createSupabaseAuthAdapter({ auth } = {}) {
  if (!auth || typeof auth !== "object") {
    throw new Error("OrbitOS Supabase auth adapter requires an auth client.");
  }

  async function getSession() {
    const result = await auth.getSession();
    if (result?.error) {
      throw new Error(
        "OrbitOS Supabase Auth getSession failed: " + result.error.message,
      );
    }

    return createAuthSnapshot({
      status: result?.data?.session ? "signed_in" : "signed_out",
      user: result?.data?.session?.user ?? null,
      session: result?.data?.session ?? null,
    });
  }

  async function getUser() {
    const result = await auth.getUser();
    if (result?.error) {
      throw new Error(
        "OrbitOS Supabase Auth getUser failed: " + result.error.message,
      );
    }

    return normalizeAuthUser(result?.data?.user ?? null);
  }

  async function signInWithPassword({ email, password } = {}) {
    const result = await auth.signInWithPassword({
      email: String(email ?? ""),
      password: String(password ?? ""),
    });

    if (result?.error) {
      throw new Error(
        "OrbitOS Supabase Auth sign-in failed: " + result.error.message,
      );
    }

    return createAuthSnapshot({
      status: "signed_in",
      user: result?.data?.user ?? null,
      session: result?.data?.session ?? null,
    });
  }

  async function signUp({ email, password, options = {} } = {}) {
    const result = await auth.signUp({
      email: String(email ?? ""),
      password: String(password ?? ""),
      options,
    });

    if (result?.error) {
      throw new Error(
        "OrbitOS Supabase Auth sign-up failed: " + result.error.message,
      );
    }

    return createAuthSnapshot({
      status: result?.data?.session ? "signed_in" : "signed_out",
      user: result?.data?.user ?? null,
      session: result?.data?.session ?? null,
    });
  }

  async function signOut() {
    const result = await auth.signOut();
    if (result?.error) {
      throw new Error(
        "OrbitOS Supabase Auth sign-out failed: " + result.error.message,
      );
    }

    return createAuthSnapshot({
      status: "signed_out",
    });
  }

  function onAuthStateChange(callback) {
    if (typeof callback !== "function") {
      throw new Error("OrbitOS auth state callback is required.");
    }

    const result = auth.onAuthStateChange((event, session) => {
      callback(
        event,
        createAuthSnapshot({
          status: session ? "signed_in" : "signed_out",
          user: session?.user ?? null,
          session,
        }),
      );
    });

    return result?.data?.subscription ?? result?.subscription ?? result;
  }

  return assertAuthAdapter(
    Object.freeze({
      provider: "supabase",
      getSession,
      getUser,
      signInWithPassword,
      signUp,
      signOut,
      onAuthStateChange,
    }),
  );
}
