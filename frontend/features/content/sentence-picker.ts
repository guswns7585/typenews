import type { ContentItem, Language, TypingMode } from "@/lib/types";

const samples: Record<Language, Record<Exclude<TypingMode, "news">, string[]>> = {
  kor: {
    short: ["오늘의 문장을 천천히 정확하게 입력해 보세요.", "작은 반복이 더 빠른 손끝을 만듭니다."],
    long: ["뉴스를 읽고 타이핑하는 순간, 정보는 손끝의 기억으로 남습니다. 정확도를 먼저 지키고 속도는 자연스럽게 따라오게 하세요."],
    word: ["타이핑", "집중", "뉴스", "기록", "성장"],
  },
  eng: {
    short: ["Practice turns attention into fluency.", "Accuracy builds speed over time."],
    long: ["Every sentence is a small opportunity to focus, improve your rhythm, and build a more confident typing habit."],
    word: ["focus", "signal", "typing", "practice", "momentum"],
  },
};

export function pickSentence(language: Language, mode: TypingMode): ContentItem {
  const items = mode === "news" ? samples[language].short : samples[language][mode];
  const text = items[Math.floor(Math.random() * items.length)];
  return { id: crypto.randomUUID(), text };
}
