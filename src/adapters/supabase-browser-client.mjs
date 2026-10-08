const SUPABASE_BROWSER_CONFIG = Object.freeze({
  url: "https://lkcbtgqdvzmaihcnxxwk.supabase.co",
  publishableKey: "sb_publishable_9HzSqSyHCuPDjsX-g43hMA_XBvbVRht",
  sdkUrl: "https://cdn.jsdelivr.net/npm/@supabase/supabase-js@2.117.3/+esm",
});

let sdkPromise = null;

async function loadSdk() {
  if (!sdkPromise) {
    sdkPromise = import(SUPABASE_BROWSER_CONFIG.sdkUrl);
  }
  return sdkPromise;
}

export function getSupabaseBrowserConfig() {
  return structuredClone(SUPABASE_BROWSER_CONFIG);
}

export async function createSupabaseBrowserClient() {
  const { createClient } = await loadSdk();

  return createClient(
    SUPABASE_BROWSER_CONFIG.url,
    SUPABASE_BROWSER_CONFIG.publishableKey,
    {
      auth: {
        autoRefreshToken: true,
        persistSession: true,
        detectSessionInUrl: true,
      },
    },
  );
}
