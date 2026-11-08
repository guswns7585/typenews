import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";

const migration = await readFile(
  new URL("../../supabase/migrations/0082_typing_workshop_game.sql", import.meta.url),
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

console.log("Typing workshop economy, draw, idle and cosmetic guards passed.");
