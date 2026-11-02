import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";

const migration = await readFile(
  new URL("../../supabase/migrations/0070_keyboard_showcase.sql", import.meta.url),
  "utf8",
);

assert.match(migration, /pg_advisory_xact_lock/, "quota creation must be serialized");
assert.match(migration, />= 10/, "account limit must be enforced by Postgres");
assert.match(migration, /'keyboard-showcase',[\s\S]*?false,[\s\S]*?1572864/, "media bucket must be private and size-limited");
assert.match(migration, /i\.status = 'published'/, "public feed must only return published items");
assert.match(migration, /create or replace function public\.set_my_showcase_published/i, "owners need a publish toggle RPC");
assert.match(migration, /p_profile_id uuid default null/, "public archive needs an optional author filter");
assert.match(migration, /create or replace function public\.get_admin_showcase_reports/i, "admins need a report queue RPC");
assert.match(migration, /create or replace function public\.admin_review_showcase_report/i, "admins need an atomic report review RPC");
assert.match(migration, /audio_bytes between 1 and 1048576/, "audio metadata must enforce 1MB");
assert.match(migration, /audio_duration_ms between 250 and 45000/, "audio metadata must enforce 45 seconds");
assert.doesNotMatch(
  migration,
  /grant\s+(?:insert|update|delete)[\s\S]{0,100}keyboard_showcase_items/i,
  "item writes must stay behind RPC functions",
);

console.log("Showcase quota, publication, storage and write-boundary guards passed.");
