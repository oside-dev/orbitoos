import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";

const [adapter, authContract, bridge, html, workflow] = await Promise.all([
  readFile(new URL("../src/adapters/supabase-auth.mjs", import.meta.url), "utf8"),
  readFile(new URL("../src/contracts/auth.mjs", import.meta.url), "utf8"),
  readFile(new URL("../src/runtime/application-browser-bridge.mjs", import.meta.url), "utf8"),
  readFile(new URL("../index.html", import.meta.url), "utf8"),
  readFile(new URL("../.github/workflows/validate.yml", import.meta.url), "utf8"),
]);

assert.match(authContract, /"resendSignupConfirmation"/);
assert.match(
  adapter,
  /auth\.resend\(\{\s*type: "signup",\s*email: normalizedEmail,\s*\}\)/,
  "resend must request the signup confirmation flow, not another auth flow",
);
assert.match(adapter, /if \(!normalizedEmail\)/);
assert.match(adapter, /status: "requested"/);
assert.match(
  bridge,
  /async function resendSignupConfirmation\(input\)\s*\{\s*return auth\.resendSignupConfirmation\(input\);/,
);
assert.match(bridge, /    resendSignupConfirmation,/);
assert.match(html, /function authModal\(mode="signin", email=""\)/);
assert.match(html, /authModal\("confirm-email",email\)/);
assert.match(html, /Resend confirmation email/);
assert.match(html, /If an eligible account exists, a confirmation email has been sent/);
assert.match(html, /function resendSignupConfirmation\(\)/);
assert.match(workflow, /node tests\/auth\.mjs/);
assert.match(workflow, /node tests\/signup-confirmation-recovery-contract\.mjs/);

console.log("OrbitOS signup confirmation recovery contract tests passed.");
