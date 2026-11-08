export type GameRarity = "common" | "rare" | "epic" | "legendary";
export type GameCategory = "tool" | "companion" | "banner" | "archive_theme";

export type GameItem = {
  id: string;
  nameKo: string;
  nameEn: string;
  descriptionKo: string;
  descriptionEn: string;
  category: GameCategory;
  rarity: GameRarity;
  quantity?: number;
  activeBonusBps: number;
  passiveInkPerHour: number;
  cosmeticData?: { style?: string };
};

export type GameWallet = {
  ink: number;
  lifetimeInk: number;
  pityCount: number;
  passivePerHour: number;
  claimableInk: number;
  passiveClaimedAt: string;
};

export type TypingGameState = {
  wallet: GameWallet;
  inventory: GameItem[];
  catalog: GameItem[];
  equipment: {
    rankingBannerId: string | null;
    archiveThemeId: string | null;
  };
};

export type GameDrawResult = {
  draw_index: number;
  item_id: string;
  name_ko: string;
  name_en: string;
  rarity: GameRarity;
  quantity_owned: number;
};

export type WorkshopContract = {
  id: string;
  nameKo: string;
  nameEn: string;
  descriptionKo: string;
  descriptionEn: string;
  targetCopies: number;
  minQuality: number;
  rewardCoins: number;
  rewardReputation: number;
  delivered?: number;
  completedAt?: string | null;
};

export type TypingWorkshopState = {
  progress: {
    manuscripts: number;
    plates: number;
    editions: number;
    coins: number;
    reputation: number;
    regionTier: number;
    quality: number;
    lastProcessedAt: string;
  };
  stations: {
    typeset: number;
    proof: number;
    press: number;
  };
  activeContract: WorkshopContract | null;
  offers: WorkshopContract[];
};

export const RARITY_LABELS: Record<GameRarity, { ko: string; en: string }> = {
  common: { ko: "일반", en: "Common" },
  rare: { ko: "희귀", en: "Rare" },
  epic: { ko: "특별", en: "Epic" },
  legendary: { ko: "전설", en: "Legendary" },
};
