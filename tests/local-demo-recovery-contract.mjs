import assert from "node:assert/strict";
import { readFileSync } from "node:fs";

const ui = readFileSync(new URL("../index.html", import.meta.url), "utf8");

assert.ok(
  ui.includes('(runtime.authenticated') &&
    ui.includes("Workspace data") &&
    ui.includes("demo restore and JSON import are disabled") &&
    ui.includes("Restore demo workspace"),
  "Settings must separate authenticated workspace data from local demo recovery.",
);

const restoreStart = ui.indexOf("async function restoreDemoWorkspace(){");
const importStart = ui.indexOf('document.getElementById("fileInput").addEventListener("change"');
assert.ok(restoreStart >= 0, "Local demo restore action must exist.");
assert.ok(importStart > restoreStart, "Backup import handler must remain after the demo restore handler.");

const restoreHandler = ui.slice(restoreStart, importStart);
assert.ok(
  restoreHandler.includes("getEnvironment()") &&
    restoreHandler.includes("runtime?.authenticated") &&
    restoreHandler.includes("Demo restore is disabled for signed-in workspaces."),
  "Demo restore must fail closed when an authenticated workspace is active.",
);

const importHandler = ui.slice(importStart, importStart + 900);
assert.ok(
  importHandler.includes("getEnvironment()") &&
    importHandler.includes("runtime?.authenticated") &&
    importHandler.includes("JSON import is disabled for signed-in workspaces."),
  "Backup import must fail closed when an authenticated workspace is active.",
);

console.log("OrbitOS local demo recovery safety contract tests passed.");
