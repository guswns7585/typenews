/**
 * 아직 서버에 닿지 못한 점수를 들고 있다가 다시 보낸다.
 *
 * 무엇이 문제였나
 *   점수 전송은 결과를 기다리지 않는 비동기였고, 실패하면 콘솔에 로그 한 줄이
 *   전부였다. 지하철에서 잠깐 끊기거나, 다 치고 바로 탭을 닫거나, Supabase가
 *   순간 흔들리면 그 점수는 그냥 사라졌다. 경품이 걸린 이벤트에서 사용자는
 *   "분명히 쳤는데 점수가 안 올랐다"고만 느낀다.
 *
 * 왜 이제 만들 수 있나
 *   `0028`이 제출마다 고유 키를 받는다. 서버가 "이건 아까 그거다"를 알아야
 *   재전송이 중복 적립이 되지 않는다. 키가 없으면 재시도 자체를 만들 수 없다.
 *
 * 담는 곳
 *   localStorage. IndexedDB가 더 정석이지만 여기 담기는 것은 한 건에 200바이트
 *   남짓이고 수십 건을 넘지 않는다. 동기 API라 **탭이 닫히기 전에 확실히 써진다**는
 *   점이 오히려 중요하다.
 */

import type { TypingMode } from "@/lib/types";

const STORAGE_KEY = "typenews.score-outbox.v1";

/** 이보다 많이 쌓이면 오래된 것부터 버린다. 정상 경로에서는 0~2건이다. */
const MAX_ENTRIES = 200;

/** 이보다 오래된 것은 버린다. 계정 없이 친 점수가 영영 남아 있지 않게. */
const MAX_AGE_MS = 7 * 24 * 60 * 60 * 1000;

export type PendingScore = {
  /** 서버가 중복을 알아보는 키 */
  key: string;
  /** 점수를 얻은 달(KST). 달이 바뀌면 버린다 — 아래 설명 참고 */
  monthId: string;
  mode: TypingMode;
  accuracy: number;
  cpm: number;
  score: number;
  elapsedMs: number;
  items: number;
  sentenceId?: number;
  options?: ScoreVerificationOptions;
  createdAt: number;
};

export type IgnoreOptions = {
  punctuation: boolean;
  numbers: boolean;
  english: boolean;
  symbols: boolean;
};

export type ScoreVerificationOptions = IgnoreOptions & {
  wordEntries?: { sentenceId?: number; options: IgnoreOptions }[];
  newsSourceId?: string;
};

function canUseStorage() {
  try {
    return typeof window !== "undefined" && Boolean(window.localStorage);
  } catch {
    // 사파리 프라이빗 모드 등에서 접근 자체가 예외를 던진다.
    return false;
  }
}

function read(): PendingScore[] {
  if (!canUseStorage()) return [];
  try {
    const raw = window.localStorage.getItem(STORAGE_KEY);
    if (!raw) return [];
    const parsed: unknown = JSON.parse(raw);
    if (!Array.isArray(parsed)) return [];
    // 형식이 안 맞는 항목은 버린다. 예전 버전이 남아 있을 수 있다.
    return parsed.filter(
      (item): item is PendingScore =>
        Boolean(item) &&
        typeof item === "object" &&
        typeof (item as PendingScore).key === "string" &&
        typeof (item as PendingScore).score === "number",
    );
  } catch (error) {
    console.error("점수 대기열을 읽지 못했습니다", error);
    return [];
  }
}

function write(items: PendingScore[]) {
  if (!canUseStorage()) return;
  try {
    window.localStorage.setItem(STORAGE_KEY, JSON.stringify(items));
  } catch (error) {
    // 용량이 찼을 때. 절반을 버리고 한 번 더 시도한다.
    console.error("점수 대기열을 저장하지 못했습니다", error);
    try {
      window.localStorage.setItem(
        STORAGE_KEY,
        JSON.stringify(items.slice(-Math.floor(MAX_ENTRIES / 2))),
      );
    } catch {
      // 그래도 안 되면 포기한다. 점수 하나 때문에 타이핑을 막을 수는 없다.
    }
  }
}

export function makeSubmissionKey() {
  if (typeof crypto !== "undefined" && "randomUUID" in crypto) return crypto.randomUUID();
  // 아주 오래된 브라우저용. 서버는 uuid 형식만 받으므로 모양을 맞춘다.
  const hex = (n: number) =>
    Array.from({ length: n }, () => Math.floor(Math.random() * 16).toString(16)).join("");
  return `${hex(8)}-${hex(4)}-4${hex(3)}-a${hex(3)}-${hex(12)}`;
}

/**
 * 보내기 **전에** 담는다.
 *
 * 순서가 중요하다. 보내고 나서 실패하면 담는 방식은, 탭이 닫히는 순간
 * 그 코드가 아예 돌지 않아서 점수를 잃는다. localStorage는 동기라
 * 여기서 돌아온 시점에는 이미 디스크에 있다.
 */
export function enqueue(item: PendingScore) {
  const items = read();
  items.push(item);
  write(items.length > MAX_ENTRIES ? items.slice(-MAX_ENTRIES) : items);
}

export function remove(key: string) {
  const items = read();
  const left = items.filter((item) => item.key !== key);
  if (left.length !== items.length) write(left);
}

export function size() {
  return read().length;
}

/**
 * 대기 중인 것을 하나씩 다시 보낸다.
 *
 * @param send 한 건을 보낸다. 적립됐거나 서버가 정상적으로 거절했으면 "done",
 *             일시적 실패라 다시 시도해야 하면 "retry", 다시 보낼 이유가 없으면 "drop".
 * @param currentMonthId 지금 달(KST). 다른 달의 점수는 버린다.
 *
 * ⚠️ 달이 바뀐 대기 항목은 **버린다.** 서버는 적립 시점의 달로 점수를 넣기 때문에,
 *    7월에 친 점수를 8월에 보내면 8월 랭킹에 들어간다. 경품이 달마다 걸리는
 *    구조에서 그것은 점수를 잃는 것보다 나쁘다.
 */
export async function flush(
  send: (item: PendingScore) => Promise<"done" | "retry" | "drop">,
  currentMonthId: string,
) {
  const items = read();
  if (items.length === 0) return { sent: 0, dropped: 0, left: 0 };

  const now = Date.now();
  let sent = 0;
  let dropped = 0;

  for (const item of items) {
    if (item.monthId !== currentMonthId) {
      console.warn("달이 지난 점수라 보내지 않고 버립니다", item.monthId, item.score);
      remove(item.key);
      dropped += 1;
      continue;
    }
    if (now - item.createdAt > MAX_AGE_MS) {
      console.warn("너무 오래된 점수라 버립니다", item.score);
      remove(item.key);
      dropped += 1;
      continue;
    }

    let result: "done" | "retry" | "drop";
    try {
      result = await send(item);
    } catch (error) {
      console.error("점수 재전송 실패", error);
      result = "retry";
    }

    if (result === "retry") {
      // 한 건이 막히면 뒤도 막힐 가능성이 높다. 다음 기회에 다시 온다.
      break;
    }
    remove(item.key);
    if (result === "done") sent += 1;
    else dropped += 1;
  }

  return { sent, dropped, left: read().length };
}
