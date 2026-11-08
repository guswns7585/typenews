import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";

const migration = await readFile(
  new URL("../../supabase/migrations/0082_typing_workshop_game.sql", import.meta.url),
  "utf8",
);
const productionMigration = await readFile(
  new URL("../../supabase/migrations/0083_typing_workshop_production.sql", import.meta.url),
  "utf8",
);

assert.match(migration, /ink bigint not null default 600/, "new players need one welcome draw");
assert.match(migration, /after insert on public\.typing_results/, "ink must come from server-verified typing results");
assert.match(migration, /v_bonus_bps := least\(v_bonus_bps, 5000\)/, "typing ink bonuses must be capped");
assert.match(migration, /least\(extract\(epoch from \(now\(\) - v_wallet\.passive_claimed_at\)\), 28800\)/, "idle production must stop after eight hours");
assert.match(migration, /if p_count is null or p_count not in \(1, 10\)/, "draw counts must be constrained server-side");
assert.match(migration, /c_draw_cost constant integer := 600/, "draw cost must be server-owned");
assert.match(migration, /v_pity_before < 19 or rarity in \('rare', 'epic', 'legendary'\)/, "the twentieth draw must exclude common items");
assert.match(migration, /create or replace function public\.equip_my_typing_game_cosmetic/i, "owned cosmetics need an equip RPC");
assert.match(migration, /and inv\.item_id = p_item_id[\s\S]*and item\.category = v_expected_category/, "cosmetics must be owned and match their slot");
assert.match(migration, /create or replace function public\.get_typing_game_cosmetics/i, "public profile surfaces need equipped cosmetics");
assert.doesNotMatch(
  migration,
  /grant\s+(?:insert|update|delete)[\s\S]{0,120}typing_game_/i,
  "game writes must stay behind trusted triggers and RPC functions",
);

assert.match(productionMigration, /create table if not exists public\.typing_workshop_progress/, "production resources need durable state");
assert.match(productionMigration, /station in \('typeset', 'proof', 'press'\)/, "the production line needs constrained stations");
assert.match(productionMigration, /least\(extract\(epoch from \(now\(\) - v_progress\.last_processed_at\)\), 28800\)/, "offline production must stop after eight hours");
assert.match(productionMigration, /v_new_plates := least\(v_progress\.manuscripts/, "typesetting cannot create plates without manuscripts");
assert.match(productionMigration, /v_new_editions := least\(v_progress\.plates \+ v_new_plates/, "printing cannot create editions without plates");
assert.match(productionMigration, /if v_progress\.quality < v_contract\.min_quality/, "delivery must enforce contract quality");
assert.match(productionMigration, /where profile_id = v_profile_id and coins >= v_cost/, "station upgrades must be paid server-side");
assert.match(productionMigration, /v_manuscripts := greatest\(1, floor\(new\.score::numeric \/ 25\)/, "verified typing results must create manuscripts");
assert.doesNotMatch(
  productionMigration,
  /grant\s+(?:insert|update|delete)[\s\S]{0,160}typing_workshop_/i,
  "workshop writes must stay behind server RPC functions",
);

console.log("Typing workshop economy, draw, idle and cosmetic guards passed.");
