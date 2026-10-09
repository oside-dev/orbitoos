import assert from "node:assert/strict";
import { readFileSync } from "node:fs";

const read = (path) => readFileSync(new URL(path, import.meta.url), "utf8");
const migration = read("../supabase/migrations/20261009090000_orbitoos_backend_owned_records.sql").toLowerCase();
const store = read("../src/adapters/supabase-store.mjs");

for (const table of ["social_accounts", "publishing_jobs", "subscriptions"]) {
  assert.ok(
    migration.includes(`revoke all on table public.${table} from public, anon, authenticated;`),
    `Browser roles must not have DML grants on ${table}.`,
  );
  assert.ok(
    migration.includes(`grant select on table public.${table} to authenticated;`),
    `Authenticated workspace users should retain read access to ${table}.`,
  );
  assert.ok(
    migration.includes(`grant select, insert, update, delete on table public.${table} to service_role;`),
    `Backend service role must retain DML access to ${table}.`,
  );
}

for (const policy of [
  "social_accounts_member_insert",
  "social_accounts_member_update",
  "social_accounts_member_delete",
  "publishing_jobs_member_insert",
  "publishing_jobs_member_update",
  "publishing_jobs_member_delete",
  "subscriptions_member_insert",
  "subscriptions_member_update",
  "subscriptions_member_delete",
]) {
  assert.ok(migration.includes(`drop policy if exists ${policy}`), `Missing removal of broad policy ${policy}.`);
}

assert.ok(store.includes('"social_accounts"'), "The browser adapter should still read social account metadata.");
assert.ok(store.includes('"publishing_jobs"'), "The browser adapter should still read publishing job status.");
assert.ok(!/await upsert\(\s*"social_accounts"/.test(store), "The browser adapter must not upsert social account metadata.");
assert.ok(!/await upsert\(\s*"publishing_jobs"/.test(store), "The browser adapter must not upsert publishing state.");

console.log("OrbitOS server-owned records security contract tests passed.");
