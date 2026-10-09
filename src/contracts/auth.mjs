export const AUTH_CONTRACTS = Object.freeze([
  "getSession",
  "getUser",
  "signInWithPassword",
  "signUp",
  "resendSignupConfirmation",
  "signOut",
  "onAuthStateChange",
]);

export const WORKSPACE_CONTEXT_CONTRACTS = Object.freeze([
  "listForUser",
]);

export function assertAuthAdapter(adapter) {
  if (!adapter || typeof adapter !== "object") {
    throw new Error("OrbitOS auth adapter is required.");
  }

  for (const method of AUTH_CONTRACTS) {
    if (typeof adapter[method] !== "function") {
      throw new Error(
        "OrbitOS auth adapter must implement " + method + "().",
      );
    }
  }

  return adapter;
}

export function assertWorkspaceContextAdapter(adapter) {
  if (!adapter || typeof adapter !== "object") {
    throw new Error("OrbitOS workspace context adapter is required.");
  }

  for (const method of WORKSPACE_CONTEXT_CONTRACTS) {
    if (typeof adapter[method] !== "function") {
      throw new Error(
        "OrbitOS workspace context adapter must implement " + method + "().",
      );
    }
  }

  return adapter;
}
