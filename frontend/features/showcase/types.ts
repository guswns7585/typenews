export const SHOWCASE_BUILD_FIELDS = [
  ["buildDate", "빌드일", "Build date"],
  ["case", "하우징", "Case"],
  ["pcb", "기판", "PCB"],
  ["plate", "보강판", "Plate"],
  ["switches", "스위치", "Switches"],
  ["keycaps", "키캡", "Keycaps"],
  ["stabilizers", "스테빌라이저", "Stabilizers"],
  ["switchMods", "스위치 작업", "Switch tuning"],
  ["stabilizerMods", "스테빌 튜닝", "Stabilizer tuning"],
  ["mounting", "마운트", "Mounting"],
  ["foam", "흡음재", "Foam"],
  ["layout", "배열", "Layout"],
  ["weight", "무게추", "Weight"],
  ["firmware", "펌웨어·키맵", "Firmware / keymap"],
  ["mods", "기타 튜닝", "Other modifications"],
  ["typingFeel", "타건감", "Typing feel"],
  ["soundProfile", "소리 성향", "Sound profile"],
  ["cable", "케이블", "Cable"],
  ["other", "기타", "Other"],
] as const;

export type ShowcaseBuildKey = (typeof SHOWCASE_BUILD_FIELDS)[number][0];
export type ShowcaseBuildInfo = Partial<Record<ShowcaseBuildKey, string>>;

export const SHOWCASE_BUILD_SECTIONS: ReadonlyArray<{
  id: string;
  label: string;
  labelEn: string;
  fields: readonly ShowcaseBuildKey[];
}> = [
  { id: "record", label: "제작 정보", labelEn: "Build details", fields: ["buildDate"] },
  { id: "core", label: "주요 부품", labelEn: "Main components", fields: ["case", "pcb", "plate", "mounting", "layout", "weight"] },
  { id: "input", label: "스위치·키캡", labelEn: "Switches & keycaps", fields: ["switches", "switchMods", "keycaps", "stabilizers", "stabilizerMods"] },
  { id: "tuning", label: "세팅·튜닝", labelEn: "Setup & tuning", fields: ["foam", "mods", "firmware", "cable"] },
  { id: "impression", label: "타건감·소리", labelEn: "Feel & sound", fields: ["typingFeel", "soundProfile", "other"] },
];

export const SHOWCASE_BUILD_FIELD_MAP = Object.fromEntries(
  SHOWCASE_BUILD_FIELDS.map(([key, label, labelEn]) => [key, { label, labelEn }]),
) as Record<ShowcaseBuildKey, { label: string; labelEn: string }>;

export type ShowcaseItem = {
  item_id: string;
  profile_id: string;
  display_name: string;
  profile_thumbnail_path: string | null;
  profile_photo_updated_at: string | null;
  title: string;
  description: string;
  build_info: ShowcaseBuildInfo;
  keyxif_url: string | null;
  image_path: string;
  thumbnail_path: string;
  audio_path: string | null;
  audio_mime: string | null;
  audio_duration_ms: number | null;
  like_count: number;
  bookmark_count: number;
  liked_by_me: boolean;
  bookmarked_by_me: boolean;
  published_at: string;
  total_count?: number;
};

export type ShowcaseViewItem = ShowcaseItem & {
  imageUrl: string;
  thumbnailUrl: string;
  audioUrl: string | null;
  profilePhotoUrl: string | null;
};

export type MyShowcaseItem = {
  id: string;
  profile_id: string;
  title: string;
  description: string;
  build_info: ShowcaseBuildInfo;
  keyxif_url: string | null;
  keyxif_snapshot: Record<string, unknown> | null;
  image_path: string | null;
  thumbnail_path: string | null;
  image_width: number | null;
  image_height: number | null;
  image_bytes: number | null;
  thumbnail_bytes: number | null;
  audio_path: string | null;
  audio_mime: string | null;
  audio_bytes: number | null;
  audio_duration_ms: number | null;
  status: "draft" | "published" | "hidden";
  like_count: number;
  bookmark_count: number;
  published_at: string | null;
  created_at: string;
  updated_at: string;
};

export type MyShowcaseViewItem = MyShowcaseItem & {
  thumbnailUrl: string | null;
};

export type ShowcaseSpace = {
  profile_id: string;
  display_name: string;
  profile_thumbnail_path: string | null;
  profile_photo_updated_at: string | null;
  intro: string;
  theme: "paper" | "studio" | "night" | "berry";
  accent: "rose" | "blue" | "green" | "amber";
  banner: "soft" | "grid" | "waves" | "dots";
  layout: "gallery" | "shelf";
  featured_item_id: string | null;
  keyboard_count: number;
  total_likes: number;
  is_owner: boolean;
};

export type ShowcaseSpaceView = ShowcaseSpace & { profilePhotoUrl: string | null };

export type ShowcaseSpaceDirectoryItem = Omit<ShowcaseSpace, "layout" | "is_owner"> & {
  featured_title: string;
  featured_thumbnail_path: string;
  last_published_at: string;
  total_count?: number;
};

export type ShowcaseSpaceDirectoryView = ShowcaseSpaceDirectoryItem & {
  profilePhotoUrl: string | null;
  featuredThumbnailUrl: string | null;
};
