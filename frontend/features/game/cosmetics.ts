export type PublicGameCosmetic = {
  profile_id: string;
  ranking_banner_id: string | null;
  ranking_banner_style: string | null;
  archive_theme_id: string | null;
  archive_theme_style: string | null;
};

export async function loadGameCosmetics(
  supabase: { rpc: (name: string, args: Record<string, unknown>) => PromiseLike<{ data: unknown; error: unknown }> },
  profileIds: string[],
) {
  const ids = [...new Set(profileIds.filter(Boolean))];
  if (!ids.length) return new Map<string, PublicGameCosmetic>();
  const { data, error } = await supabase.rpc("get_typing_game_cosmetics", { p_profile_ids: ids });
  if (error) throw error;
  return new Map(((data ?? []) as PublicGameCosmetic[]).map((row) => [row.profile_id, row]));
}
