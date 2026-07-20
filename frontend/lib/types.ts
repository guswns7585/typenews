export type Language = "kor" | "eng";
export type TypingMode = "short" | "long" | "word" | "news";

export type TypingSettings = {
  ignorePunctuation: boolean;
  ignoreNumbers: boolean;
  ignoreEnglish: boolean;
  ignoreSymbols: boolean;
  ignoreStreaming: boolean;
  fontSize: number;
  overlayMode: boolean;
};

export type ContentItem = {
  id: string;
  text: string;
  title?: string;
  sourceUrl?: string;
  thumbnailUrl?: string;
};

export type TypingMetrics = {
  cpm: number;
  accuracy: number;
  typedCount: number;
  elapsedSeconds: number;
};

export type RankingEntry = {
  profileId: string;
  displayName: string;
  typingCount: number;
};
