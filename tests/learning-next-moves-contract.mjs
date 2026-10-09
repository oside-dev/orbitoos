import assert from "node:assert/strict";
import { readFileSync } from "node:fs";

const read = (path) => readFileSync(new URL(path, import.meta.url), "utf8");

const playbook = read("../docs/operations/learning-next-moves-playbook.md");
const indexHtml = read("../index.html");
const bridge = read("../src/runtime/application-browser-bridge.mjs");
const runtime = read("../src/core/runtime.mjs");
const readme = read("../README.md");

assert.ok(playbook.includes("Learning next content moves playbook"), "Missing learning playbook title");
assert.ok(playbook.includes("Pick the platform with the strongest engagement rate"), "Missing engagement-rate rule");
assert.ok(playbook.includes("Repeat the strongest content angle, not the exact post"), "Missing angle-reuse rule");
assert.ok(playbook.includes("Keep the human approval gate"), "Missing human approval rule");
assert.ok(playbook.includes("Do not use this playbook to infer live publishing success"), "Missing safety reminder");

assert.ok(indexHtml.includes('function analytics(){'), "Analytics page missing");
assert.ok(indexHtml.includes('Learning recommendations'), "Analytics learning recommendations missing");
assert.ok(indexHtml.includes('learningEntries()'), "Learning loop helper missing from UI");
assert.ok(indexHtml.includes('runLearningNow()'), "Learning action missing from UI");
assert.ok(indexHtml.includes('Strategy changes remain human-reviewed'), "Learning contract copy missing");

assert.ok(bridge.includes('getPublishingOperations,'), "Bridge snapshot should already expose operations safely");
assert.ok(bridge.includes('runLearning,'), "Bridge should expose runLearning to the browser UI");
assert.ok(runtime.includes('async function runLearning()'), "Core runtime missing learning loop");
assert.ok(runtime.includes('learningInsights: [...state.learningInsights, ...brandedInsights]'), "Learning insights persistence missing");

assert.ok(readme.includes('M24 — Publishing operations overview'), "README missing publishing operations overview roadmap entry");
assert.ok(readme.includes('M25 — Scheduled job materialization'), "README missing scheduled-job roadmap entry");
assert.ok(readme.includes('## Publishing operations overview'), "README missing publishing operations overview section");
assert.ok(readme.includes('## Audited publishing reconciliation'), "README missing reconciliation docs");
assert.ok(readme.includes('## Instagram Reels publishing adapter'), "README missing Instagram adapter docs");

console.log('OrbitOS learning next-moves contract tests passed.');
