export const AUTH_STATES = Object.freeze([
  "signed_out",
  "signed_in",
  "loading",
  "error",
]);

export function normalizeAuthUser(user) {
  if (!user || typeof user !== "object") return null;

  return {
    id: String(user.id ?? ""),
    email: user.email ? String(user.email) : null,
    role: user.role ? String(user.role) : null,
    createdAt: user.created_at ?? user.createdAt ?? null,
    lastSignInAt: user.last_sign_in_at ?? user.lastSignInAt ?? null,
  };
}

export function normalizeAuthSession(session) {
  if (!session || typeof session !== "object") return null;

  return {
    user: normalizeAuthUser(session.user),
    expiresAt: session.expires_at
      ? Number(session.expires_at)
      : session.expiresAt
        ? Number(session.expiresAt)
        : null,
    tokenType: session.token_type
      ? String(session.token_type)
      : session.tokenType
        ? String(session.tokenType)
        : "bearer",
  };
}

export function createAuthSnapshot({
  status = "signed_out",
  user = null,
  session = null,
  error = null,
} = {}) {
  if (!AUTH_STATES.includes(status)) {
    throw new Error("Unknown OrbitOS auth state: " + status);
  }

  return {
    status,
    user: normalizeAuthUser(user),
    session: normalizeAuthSession(session),
    error: error ? String(error) : null,
  };
}
