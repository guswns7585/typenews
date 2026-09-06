import type { TypingMetrics } from "@/lib/types";
import type { Alignment } from "./alignment";

/** 한글 한 글자는 2타, 나머지는 1타로 센다. */
export function getTypingCount(text: string) {
  let count = 0;
  for (const character of text) {
    count += character >= "가" && character <= "힣" ? 2 : 1;
  }
  return count;
}

export function calculateMetrics(
  input: string,
  startedAt: number | null,
  alignment: Alignment,
  now = Date.now(),
): TypingMetrics {
  const typedCount = getTypingCount(input);
  const elapsedSeconds = startedAt ? Math.max((now - startedAt) / 1000, 0) : 0;
  const elapsedMinutes = elapsedSeconds / 60;

  // 정확도 분모는 무시 문자를 걸러내지 않은 실제 입력 길이다. (원본과 동일)
  const inputLength = [...input].length;
  const accuracy = inputLength ? Math.round((alignment.correctCount / inputLength) * 100) : 0;
  const cpm = elapsedMinutes > 0 && inputLength ? Math.round(typedCount / elapsedMinutes) : 0;

  return { cpm, accuracy, typedCount, elapsedSeconds };
}
