import type { Language } from "@/lib/types";
import { loadWordPool } from "./sentence-picker";

export type WordItem = { text: string; sentenceId?: number };

/** 다이얼에 한 번에 보이는 칸 수. 가운데가 지금 칠 단어다. */
export const DIAL_SIZE = 7;
/** 가운데 기준 좌우 칸 수. */
export const DIAL_SIDE = (DIAL_SIZE - 1) / 2;
/** 큐 끝이 이만큼 남으면 다음 묶음을 이어 붙인다. */
const REFILL_THRESHOLD = DIAL_SIDE + 8;

function shuffle(items: WordItem[]) {
  const result = [...items];
  for (let index = result.length - 1; index > 0; index -= 1) {
    const swapIndex = Math.floor(Math.random() * (index + 1));
    [result[index], result[swapIndex]] = [result[swapIndex], result[index]];
  }
  return result;
}

/**
 * 끊기지 않는 단어 흐름.
 *
 * 목록을 통째로 섞어 이어 붙이는 방식이라 같은 단어가 한 바퀴 안에서
 * 반복되지 않는다. 큐가 짧아지면 새로 섞은 묶음을 뒤에 붙인다.
 * 앞부분은 버리지 않는다. 왼쪽으로 지나간 단어도 화면에 남아야 하기 때문이다.
 */
export async function createWordQueue(language: Language) {
  const pool = await loadWordPool(language);
  if (!pool.length) throw new Error("단어 목록이 비어 있습니다.");
  // 왼쪽 칸을 처음부터 채워두려고 앞에 여유분을 둔다.
  return [...shuffle(pool), ...shuffle(pool)];
}

export function refillIfNeeded(queue: WordItem[], index: number, pool: WordItem[]) {
  if (queue.length - index > REFILL_THRESHOLD) return queue;
  return [...queue, ...shuffle(pool)];
}

/** 다이얼에 그릴 칸들. 범위를 벗어난 자리는 null이다. */
export function dialSlots(queue: WordItem[], index: number) {
  const slots: { word: string | null; offset: number }[] = [];
  for (let offset = -DIAL_SIDE; offset <= DIAL_SIDE; offset += 1) {
    const position = index + offset;
    slots.push({ word: position >= 0 ? (queue[position]?.text ?? null) : null, offset });
  }
  return slots;
}
