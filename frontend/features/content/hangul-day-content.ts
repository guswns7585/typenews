import type { TypingMode } from "@/lib/types";

export const HANGUL_DAY_OPENERS: Record<"short" | "long", string> = {
  short: "한글은 우리말을 소리대로 적을 수 있도록 세종대왕이 만든 문자다.",
  long: "세종대왕은 백성이 말하고자 하는 바가 있어도 글로 뜻을 펴지 못하는 일을 안타깝게 여겨 훈민정음을 만들었다. 배우기 쉬운 글자는 지식을 나누는 문턱을 낮췄고, 오늘날 한글은 누구나 자신의 생각을 또렷하게 기록하고 전하는 바탕이 되었다.",
};

export const HANGUL_DAY_WORDS = ["한글날", "세종대왕"] as const;

/** 평상시 문장·단어 풀에서 제외해야 하는 한글날 전용 항목인지 판별한다. */
export function isHangulDayExclusiveContent(mode: TypingMode, text: string) {
  if (mode === "short" || mode === "long") return HANGUL_DAY_OPENERS[mode] === text;
  if (mode === "word") return HANGUL_DAY_WORDS.some((word) => word === text);
  return false;
}

export function visibleSeasonalContent<T extends { text: string }>(
  items: T[],
  mode: TypingMode,
  hangulDay: boolean,
) {
  return hangulDay
    ? items
    : items.filter((item) => !isHangulDayExclusiveContent(mode, item.text));
}
