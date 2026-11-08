import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";

const migration = await readFile(
  new URL("../../supabase/migrations/0070_keyboard_showcase.sql", import.meta.url),
  "utf8",
);
const discoveryMigration = await readFile(
  new URL("../../supabase/migrations/0071_showcase_discovery.sql", import.meta.url),
  "utf8",
);
const spacesMigration = await readFile(
  new URL("../../supabase/migrations/0072_showcase_spaces.sql", import.meta.url),
  "utf8",
);
const storageFixMigration = await readFile(
  new URL("../../supabase/migrations/0073_fix_showcase_storage_rls.sql", import.meta.url),
  "utf8",
);
const directoryMigration = await readFile(
  new URL("../../supabase/migrations/0074_showcase_space_directory.sql", import.meta.url),
  "utf8",
);
const anonymousMediaFixMigration = await readFile(
  new URL("../../supabase/migrations/0079_fix_anonymous_showcase_media_read.sql", import.meta.url),
  "utf8",
);
const anonymousMediaFixSql = anonymousMediaFixMigration.replace(/^\s*--.*$/gm, "");

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
assert.match(discoveryMigration, /p_query text default null/, "archive discovery needs a search query");
assert.match(discoveryMigration, /p_sort text default 'newest'/, "archive discovery needs sorting");
assert.match(discoveryMigration, /p_bookmarked_only boolean default false/, "users need a bookmarked archive view");
assert.match(discoveryMigration, /mine\.profile_id = public\.current_profile_id\(\)/, "bookmark filtering must use the authenticated profile");
assert.match(spacesMigration, /create table if not exists public\.keyboard_showcase_spaces/, "personal archive spaces need persisted appearance settings");
assert.match(spacesMigration, /p\.id = public\.current_profile_id\(\)/, "space ownership must be derived server-side");
assert.match(spacesMigration, /featured_item_id is not null and not exists/, "featured keyboards must belong to the owner");
assert.match(spacesMigration, /revoke all on table public\.keyboard_showcase_spaces/, "space settings must stay behind RPC functions");
assert.doesNotMatch(storageFixMigration, /metadata\s*->>\s*'size'/, "storage INSERT policies cannot rely on metadata populated after insertion");
assert.match(storageFixMigration, /i\.id::text = \(storage\.foldername\(name\)\)\[2\]/, "uploads must map to a real archive item");
assert.match(storageFixMigration, /storage\.filename\(name\) in \('image\.webp', 'thumbnail\.webp'\)/, "uploads must use fixed image filenames");
assert.match(directoryMigration, /create or replace function public\.get_showcase_spaces/i, "the archive needs a personal-space directory");
assert.match(directoryMigration, /i\.status = 'published'/, "the space directory must only count published keyboards");
assert.match(directoryMigration, /left join lateral/i, "each space needs a representative keyboard preview");
assert.match(directoryMigration, /count\(\*\) over \(\)/, "the space directory needs pagination totals");
assert.match(anonymousMediaFixMigration, /policyname like 'keyboard_showcase%'/, "legacy archive read policies must be removed");
assert.match(anonymousMediaFixMigration, /create or replace function public\.can_read_showcase_media/i, "media reads need an anon-safe authorization helper");
assert.doesNotMatch(anonymousMediaFixSql, /current_profile_id\(\)/, "anonymous media reads must not execute current_profile_id");
assert.match(anonymousMediaFixMigration, /grant execute on function public\.can_read_showcase_media\(text\) to anon, authenticated/i, "the safe media helper must be callable by archive readers");

console.log("Showcase quota, publication, storage and write-boundary guards passed.");
