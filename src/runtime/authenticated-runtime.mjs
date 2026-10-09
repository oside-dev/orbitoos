import {
  assertAuthAdapter,
  assertWorkspaceContextAdapter,
} from "../contracts/auth.mjs";
import { createPersistentOrbitRuntime } from "./persistent-runtime.mjs";

export class OrbitAuthBoundaryError extends Error {
  constructor(code, message) {
    super(message);
    this.name = "OrbitAuthBoundaryError";
    this.code = code;
  }
}

export async function createAuthenticatedPersistentRuntime({
  auth,
  workspaceContext,
  client,
  workspaceId,
  authenticatedUser = null,
  ...runtimeOptions
} = {}) {
  assertAuthAdapter(auth);
  assertWorkspaceContextAdapter(workspaceContext);

  // The browser bridge may pass a user it has just verified with auth.getUser().
  // Reusing that verified identity avoids a redundant network call during startup.
  const user = authenticatedUser ?? await auth.getUser();
  if (!user?.id) {
    throw new OrbitAuthBoundaryError(
      "AUTH_REQUIRED",
      "OrbitOS requires an authenticated user.",
    );
  }

  const memberships = await workspaceContext.listForUser({
    userId: user.id,
  });

  const membership = workspaceId
    ? memberships.find((item) => item.workspaceId === workspaceId)
    : memberships[0];

  if (!membership) {
    throw new OrbitAuthBoundaryError(
      "WORKSPACE_ACCESS_DENIED",
      "The authenticated user has no access to the requested OrbitOS workspace.",
    );
  }

  const runtime = createPersistentOrbitRuntime({
    client,
    workspaceId: membership.workspaceId,
    ...runtimeOptions,
  });

  return Object.freeze({
    user,
    membership,
    runtime,
  });
}
