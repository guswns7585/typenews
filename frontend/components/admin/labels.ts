import type { Language, TypingMode } from "@/lib/types";

/** 문장이 가질 수 있는 모드. news는 RSS에서 오므로 표에 없다. */
export type SentenceMode = Exclude<TypingMode, "news">;

export const LANGUAGES: { id: Language; label: string }[] = [
  { id: "kor", label: "한국어" },
  { id: "eng", label: "English" },
];

export const SENTENCE_MODES: { id: SentenceMode; label: string }[] = [
  { id: "short", label: "단문" },
  { id: "long", label: "장문" },
  { id: "word", label: "단어" },
];

export function languageLabel(value: string) {
  return LANGUAGES.find((item) => item.id === value)?.label ?? value;
}

export function modeLabel(value: string) {
  return SENTENCE_MODES.find((item) => item.id === value)?.label ?? value;
}

/** 목록에 곁들이는 시각. 초까지는 필요 없다. */
export function formatDateTime(value: string | null | undefined) {
  if (!value) return "—";
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return "—";
  return date.toLocaleString("ko-KR", {
    timeZone: "Asia/Seoul",
    year: "2-digit",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
  });
}
