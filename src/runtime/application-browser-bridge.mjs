import { createOrbitBrowserBridge } from "./browser-bridge.mjs";
import { createApplicationRuntime } from "./application-runtime.mjs";
import { toUiState } from "./ui-state.mjs";
import { createSupabaseBrowserClient } from "../adapters/supabase-browser-client.mjs";
import { createSupabaseAuthAdapter } from "../adapters/supabase-auth.mjs";
import { createSupabaseWorkspaceContextAdapter } from "../adapters/supabase-workspace-context.mjs";

export async function createOrbitApplicationBrowserBridge({
  storage = globalThis.localStorage,
  key = "orbit-v4",
} = {}) {
  const localBridge = createOrbitBrowserBridge({ storage, key });
  const client = await createSupabaseBrowserClient();
  const auth = createSupabaseAuthAdapter({ auth: client.auth });
  const workspaceContext = createSupabaseWorkspaceContextAdapter({ client });

  let remote = null;

  async function bootstrapWorkspace() {
    const { data, error } = await client.functions.invoke(
      "bootstrap-workspace",
      { body: {} },
    );

    if (error) {
      throw new Error(
        "OrbitOS workspace bootstrap failed: " +
          String(error.message ?? error),
      );
    }

    return data;
  }

  async function initializeRemote() {
    const user = await auth.getUser();
    if (!user?.id) {
      remote = null;
      return null;
    }

    const bootstrap = await bootstrapWorkspace();
    const secured = await createApplicationRuntime({
      mode: "authenticated-persistent",
      auth,
      workspaceContext,
      client,
      workspaceId: bootstrap?.workspaceId ?? null,
    });

    remote = secured;
    return secured;
  }

  async function refresh() {
    await initializeRemote();
    return snapshot();
  }

  function environment() {
    return remote?.environment ?? {
      mode: "local",
      provider: "local-store",
      workspaceId: null,
      userId: null,
      persistent: false,
      authenticated: false,
    };
  }

  async function snapshot() {
    if (!remote) return localBridge.snapshot();

    const coreState = await remote.runtime.snapshot();
    const uiState = toUiState(coreState, {
      runtime: remote.environment,
    });

    return {
      ...uiState,
      runtime: remote.environment,
      auth: {
        status: "signed_in",
        user: remote.user,
        membership: remote.membership,
      },
    };
  }

  async function transactRemote(work) {
    if (!remote) return null;
    const nextCoreState = await work(remote.runtime);
    return toUiState(nextCoreState, {
      runtime: remote.environment,
      auth: {
        status: "signed_in",
        user: remote.user,
        membership: remote.membership,
      },
    });
  }

  async function getEnvironment() {
    return remote?.environment ?? localBridge.getEnvironment();
  }

  async function getAuthSnapshot() {
    return auth.getSession();
  }

  async function signInWithPassword(input) {
    const result = await auth.signInWithPassword(input);
    await initializeRemote();
    return result;
  }

  async function signUp(input) {
    const result = await auth.signUp(input);
    if (result?.user?.id) await initializeRemote();
    return result;
  }

  async function signOut() {
    const result = await auth.signOut();
    remote = null;
    return result;
  }

  function onAuthStateChange(callback) {
    return auth.onAuthStateChange((event, authSnapshot) => {
      void (async () => {
        if (event === "SIGNED_IN" || event === "TOKEN_REFRESHED") {
          try {
            await initializeRemote();
          } catch {
            remote = null;
          }
        }

        if (event === "SIGNED_OUT") {
          remote = null;
        }

        await callback(event, authSnapshot);
      })();
    });
  }

  async function invoke(name, localFn, remoteFn) {
    if (!remote) return localFn();
    return remoteFn(remote.runtime);
  }

  await initializeRemote();

  return Object.freeze({
    snapshot,
    refresh,
    getEnvironment,
    getAuthSnapshot,
    signInWithPassword,
    signUp,
    signOut,
    onAuthStateChange,
    bootstrapWorkspace,

    createDraft: (rawIdea, brand) =>
      invoke(
        "createDraft",
        () => localBridge.createDraft(rawIdea, brand),
        (runtime) =>
          transactRemote((activeRuntime) =>
            activeRuntime.createDraft(rawIdea, brand),
          ),
      ),

    createBrand: (brand) =>
      invoke(
        "createBrand",
        () => localBridge.createBrand(brand),
        (runtime) =>
          transactRemote((activeRuntime) =>
            activeRuntime.createBrandProfile(brand),
          ),
      ),

    listBrands: () =>
      remote
        ? remote.runtime.listBrands()
        : localBridge.listBrands(),

    setActiveBrand: (brandId) =>
      invoke(
        "setActiveBrand",
        () => localBridge.setActiveBrand(brandId),
        () =>
          transactRemote((activeRuntime) =>
            activeRuntime.setActiveBrand(brandId),
          ),
      ),

    updateBrand: (brand) =>
      invoke(
        "updateBrand",
        () => localBridge.updateBrand(brand),
        () =>
          transactRemote((activeRuntime) =>
            activeRuntime.updateBrand(brand),
          ),
      ),

    updateContentVariant: (input) =>
      invoke(
        "updateContentVariant",
        () => localBridge.updateContentVariant(input),
        () =>
          transactRemote((activeRuntime) =>
            activeRuntime.updateContentVariant(input),
          ),
      ),

    approveIdea: (ideaId) =>
      invoke(
        "approveIdea",
        () => localBridge.approveIdea(ideaId),
        () =>
          transactRemote((activeRuntime) =>
            activeRuntime.approveIdea(ideaId),
          ),
      ),

    scheduleIdeaVariant: (input) =>
      invoke(
        "scheduleIdeaVariant",
        () => localBridge.scheduleIdeaVariant(input),
        () =>
          transactRemote((activeRuntime) =>
            activeRuntime.scheduleIdeaVariant(input),
          ),
      ),

    getAiConfig: () => localBridge.getAiConfig(),
    setAiConfig: (config) =>
      invoke(
        "setAiConfig",
        () => localBridge.setAiConfig(config),
        () => localBridge.setAiConfig(config),
      ),

    runLearning: () =>
      invoke(
        "runLearning",
        () => localBridge.runLearning(),
        () =>
          transactRemote((activeRuntime) =>
            activeRuntime.runLearning(),
          ),
      ),

    publishIdeaVariant: (input) =>
      invoke(
        "publishIdeaVariant",
        () => localBridge.publishIdeaVariant(input),
        () =>
          transactRemote((activeRuntime) =>
            activeRuntime.publishIdeaVariant(input),
          ),
      ),

    exportState: () =>
      remote ? remote.runtime.exportState() : localBridge.exportState(),

    importState: (json) =>
      invoke(
        "importState",
        () => localBridge.importState(json),
        () =>
          transactRemote((activeRuntime) =>
            activeRuntime.importState(json),
          ),
      ),
  });
}
