import assert from "node:assert/strict";
import { readFileSync } from "node:fs";

const source = readFileSync(
  new URL("../supabase/functions/bootstrap-workspace/index.ts", import.meta.url),
  "utf8",
);
const normalized = source.replace(/\s+/g, " ").trim();

assert.ok(
  normalized.includes('withSupabase({ auth: "user" }'),
  "Workspace bootstrap must require a verified user JWT in the handler.",
);
assert.ok(
  normalized.includes("const userId = ctx.userClaims?.id ?? ctx.jwtClaims?.sub;"),
  "Workspace bootstrap must read the normalized userClaims.id and may fall back to the raw JWT sub.",
);
assert.ok(
  !/ctx\.userClaims\?\.sub/.test(source),
  "Do not read sub from the normalized userClaims object; that property is on jwtClaims.",
);
assert.ok(
  normalized.includes('if (!userId) { return Response.json( { error: "AUTH_REQUIRED" }, { status: 401, headers: corsHeaders }, ); }'),
  "Missing identity must fail closed with AUTH_REQUIRED.",
);

for (const fragment of [
  '.from("workspaces")',
  '.from("workspace_members")',
  '.from("brands")',
  'role: "owner"',
  "{ onConflict: \"id\", ignoreDuplicates: true }",
]) {
  assert.ok(normalized.includes(fragment), "Workspace bootstrap lost required behavior: " + fragment);
}

console.log("OrbitOS bootstrap workspace identity-claim contract tests passed.");
