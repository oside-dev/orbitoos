import assert from "node:assert/strict";
import { readFileSync } from "node:fs";

const source = readFileSync(new URL("../index.html", import.meta.url), "utf8");
const workflow = readFileSync(new URL("../.github/workflows/validate.yml", import.meta.url), "utf8");

for (const [fragment, message] of [
  ["function canManageEditorialActions()", "A shared UI authorization helper is required."],
  ['return ["owner","admin","editor"].includes(String(state.auth?.membership?.role||"").toLowerCase());', "Only trusted editorial roles may approve/schedule in the persistent UI."],
  ["canManageEditorialActions()&&[\"Draft\",\"Review\"].includes(i.stage)", "Approve control must be role-gated."],
  ["Only workspace owners, admins, or editors can approve content.", "Approval handler must fail closed in the UI."],
  ["Only workspace owners, admins, or editors can schedule content.", "Schedule handlers must fail closed in the UI."],
  ["EDITOR ROLE REQUIRED", "Calendar should explain why a lower role cannot schedule."],
  ['(canManageEditorialActions()?btn("Approve first draft"', "Calendar's quick approval control must be role-gated."],
]) {
  assert.ok(source.includes(fragment), message);
}

assert.ok(
  workflow.includes("tests/workspace-role-ui-contract.mjs") &&
    workflow.includes("node tests/workspace-role-ui-contract.mjs"),
  "UI role contract must be part of CI.",
);

console.log("OrbitOS workspace role UI contract tests passed.");
