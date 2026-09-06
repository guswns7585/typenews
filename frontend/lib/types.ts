export type Language = "kor" | "eng";
/** 화면 문구 언어. 연습 자료 언어(Language)와 독립적으로 바뀐다. */
export type UiLocale = "ko" | "en";
export type TypingMode = "short" | "long" | "word" | "news";
export type NewsSector = "all" | "main" | "politics" | "economy" | "society" | "global" | "culture" | "entertainment" | "sports";
export type NewsTypingTarget = "title" | "body";
export type NewsBodyAmount = "small" | "medium" | "large";
/** classic·dark는 기본 모드, 문서 프로그램형 테마는 루팡 모드에 속한다. */
export type VisualTheme =
  | "classic"
  | "dark"
  | "spreadsheet"
  | "vscode"
  | "terminal"
  | "codex"
  | "claude"
  | "claude-code";
export type FontFamily =
  | "pretendard-jp"
  | "gowun-batang"
  | "noto-sans-kr"
  | "noto-serif-kr"
  | "nanum-gothic"
  | "nanum-myeongjo";

export type TypingSettings = {
  uiLocale: UiLocale;
  visualTheme: VisualTheme;
  ignorePunctuation: boolean;
  ignoreNumbers: boolean;
  ignoreEnglish: boolean;
  ignoreSymbols: boolean;
  ignoreStreaming: boolean;
  newsTypingTarget: NewsTypingTarget;
  newsBodyAmount: NewsBodyAmount;
  fontFamily: FontFamily;
  fontSize: number;
  overlayMode: boolean;
  highlightWeakWords: boolean;
};

export type ContentItem = {
  id: string;
  text: string;
  title?: string;
  sourceUrl?: string;
  thumbnailUrl?: string;
  /**
   * sentences 표의 번호. 서버가 점수를 다시 세어 대조하는 데 쓴다.
   * DB의 단문·장문·단어 원문에 붙는다. 뉴스는 scoreSourceId를 쓴다.
   */
  sentenceId?: number;
  /** 서버가 RSS에서 직접 정규화해 저장한 뉴스 원문의 번호. */
  scoreSourceId?: string;
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
  /** 이번 달 누적 타수 */
  score: number;
  photoPath?: string | null;
  thumbnailPath?: string | null;
  photoUpdatedAt?: string | null;
};
