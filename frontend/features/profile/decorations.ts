export type ProfileBadge = {
  id: string;
  nameKo: string;
  nameEn: string;
  mark: string;
};

export type ProfileDecoration = {
  profile_id: string;
  title_id: string | null;
  title_ko: string | null;
  title_en: string | null;
  badges: ProfileBadge[];
};

export type MyAchievement = ProfileBadge & {
  kind: "title" | "badge";
  descriptionKo: string;
  descriptionEn: string;
  unlockedAt: string;
};

export type MyAchievementState = {
  equippedTitleId: string | null;
  equippedBadgeIds: string[];
  achievements: MyAchievement[];
};

export async function loadProfileDecorations(
  supabase: { rpc: (name: string, args: Record<string, unknown>) => PromiseLike<{ data: unknown; error: unknown }> },
  profileIds: string[],
) {
  const uniqueIds = [...new Set(profileIds.filter(Boolean))];
  if (!uniqueIds.length) return new Map<string, ProfileDecoration>();
  const { data, error } = await supabase.rpc("get_profile_decorations", { p_profile_ids: uniqueIds });
  if (error) throw error;
  return new Map(((data ?? []) as ProfileDecoration[]).map((row) => [row.profile_id, row]));
}
