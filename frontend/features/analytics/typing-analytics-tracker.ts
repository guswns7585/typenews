import type { Alignment } from "@/features/typing-engine/alignment";
import type { ContentItem, Language, NewsSector, TypingMetrics, TypingMode } from "@/lib/types";

const LONG_PAUSE_MS = 3_000;
const MAX_PAUSE_MS = 120_000;
const MAX_WEAKNESS_SNAPSHOT = 120;
const TRACKED_KEY_CODES = /^(Key[A-Z]|Digit[0-9]|Space|Backspace|Delete|Enter|Tab|CapsLock|ShiftLeft|ShiftRight|Comma|Period|Slash|Semicolon|Quote|BracketLeft|BracketRight|Backslash|Minus|Equal|Backquote)$/;

export type AnalyticsBucket = {
  day: string;
  mode: TypingMode;
  language: Language;
  category: string;
  deviceClass: "desktop" | "tablet" | "mobile";
  hour: number;
  starts: number;
  completions: number;
  passed: number;
  typedChars: number;
  activeMs: number;
  cpmSum: number;
  accuracySum: number;
  backspaces: number;
  mistakes: number;
  longPauses: number;
  newsCompleted: number;
};

export type WeaknessBucket = {
  day: string;
  sentenceId: number;
  charIndex: number;
  mistakeCount: number;
  correctionCount: number;
};

export type KeyUsageBucket = {
  day: string;
  counts: Record<string, number>;
};

type Context = {
  sentence: ContentItem;
  mode: TypingMode;
  language: Language;
  newsSectors: NewsSector[];
};

type ActiveContent = {
  id: string;
  started: boolean;
  lastInputAt: number | null;
  mistakes: Set<number>;
  corrected: Set<number>;
};

function seoulParts(now = new Date()) {
  const parts = new Intl.DateTimeFormat("en-CA", {
    timeZone: "Asia/Seoul",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    hourCycle: "h23",
  }).formatToParts(now);
  const get = (type: Intl.DateTimeFormatPartTypes) =>
    parts.find((part) => part.type === type)?.value ?? "";
  return {
    day: `${get("year")}-${get("month")}-${get("day")}`,
    hour: Number(get("hour")) || 0,
  };
}

function deviceClass(): AnalyticsBucket["deviceClass"] {
  if (typeof window === "undefined") return "desktop";
  const coarse = window.matchMedia?.("(pointer: coarse)").matches ?? false;
  if (window.innerWidth < 768) return "mobile";
  if (coarse || window.innerWidth < 1100) return "tablet";
  return "desktop";
}

function categoryFor(context: Context) {
  if (context.mode !== "news") return "";
  if (context.language === "eng") return "global";
  if (context.newsSectors.includes("all")) return "all";
  return [...context.newsSectors].sort().join("+").slice(0, 40);
}

function emptyBucket(context: Context, day: string, hour: number): AnalyticsBucket {
  return {
    day,
    mode: context.mode,
    language: context.language,
    category: categoryFor(context),
    deviceClass: deviceClass(),
    hour,
    starts: 0,
    completions: 0,
    passed: 0,
    typedChars: 0,
    activeMs: 0,
    cpmSum: 0,
    accuracySum: 0,
    backspaces: 0,
    mistakes: 0,
    longPauses: 0,
    newsCompleted: 0,
  };
}

function makeUuid() {
  if (typeof crypto !== "undefined" && "randomUUID" in crypto) return crypto.randomUUID();
  return "10000000-1000-4000-8000-100000000000".replace(/[018]/g, (character) =>
    (Number(character) ^ (Math.floor(Math.random() * 256) & (15 >> (Number(character) / 4)))).toString(16),
  );
}

class TypingAnalyticsTracker {
  private sessionKey: string | null = null;
  private buckets = new Map<string, AnalyticsBucket>();
  private weaknesses = new Map<string, WeaknessBucket>();
  private keyUsage = new Map<string, Map<string, number>>();
  private active: ActiveContent | null = null;
  private revisionValue = 0;

  resetSession() {
    this.sessionKey = null;
    this.buckets.clear();
    this.weaknesses.clear();
    this.keyUsage.clear();
    this.active = null;
    this.revisionValue = 0;
  }

  ensureSession() {
    if (this.sessionKey) return this.sessionKey;
    // 서버는 같은 세션 키의 누적 스냅샷 중 큰 값을 보존한다. 메모리 카운터가
    // 초기화되는 새로고침 때 키도 함께 바뀌어야 이후 기록이 누락되지 않는다.
    this.sessionKey = makeUuid();
    return this.sessionKey;
  }

  private bucket(context: Context) {
    const { day, hour } = seoulParts();
    const device = deviceClass();
    const category = categoryFor(context);
    const key = [day, context.mode, context.language, category, device, hour].join("|");
    let bucket = this.buckets.get(key);
    if (!bucket) {
      bucket = emptyBucket(context, day, hour);
      this.buckets.set(key, bucket);
    }
    return bucket;
  }

  private activeFor(context: Context) {
    if (this.active?.id !== context.sentence.id) {
      this.active = {
        id: context.sentence.id,
        started: false,
        lastInputAt: null,
        mistakes: new Set(),
        corrected: new Set(),
      };
    }
    return this.active;
  }

  noteInput(value: string, alignment: Alignment, context: Context) {
    if (!value) return;
    const active = this.activeFor(context);
    const bucket = this.bucket(context);
    const now = Date.now();

    if (!active.started) {
      active.started = true;
      bucket.starts += 1;
      this.revisionValue += 1;
    }
    if (active.lastInputAt !== null) {
      const pause = now - active.lastInputAt;
      if (pause >= LONG_PAUSE_MS && pause <= MAX_PAUSE_MS) {
        bucket.longPauses += 1;
        this.revisionValue += 1;
      }
    }
    active.lastInputAt = now;

    alignment.cells.forEach((cell, index) => {
      if (cell.state === "incorrect" && !active.mistakes.has(index)) {
        active.mistakes.add(index);
        bucket.mistakes += 1;
        this.revisionValue += 1;
      }
      if (
        cell.state === "correct" &&
        active.mistakes.has(index) &&
        !active.corrected.has(index)
      ) {
        active.corrected.add(index);
        this.revisionValue += 1;
      }
    });
  }

  noteBackspace(context: Context) {
    const active = this.activeFor(context);
    if (!active.started) return;
    this.bucket(context).backspaces += 1;
    this.revisionValue += 1;
  }

  noteKey(code: string, modified: boolean) {
    if (modified || !TRACKED_KEY_CODES.test(code)) return;
    const day = seoulParts().day;
    let counts = this.keyUsage.get(day);
    if (!counts) {
      counts = new Map();
      this.keyUsage.set(day, counts);
    }
    counts.set(code, (counts.get(code) ?? 0) + 1);
    this.revisionValue += 1;
  }

  noteComplete(metrics: TypingMetrics, passed: boolean, context: Context) {
    const active = this.activeFor(context);
    const bucket = this.bucket(context);
    if (!active.started) {
      active.started = true;
      bucket.starts += 1;
    }
    bucket.completions += 1;
    bucket.passed += passed ? 1 : 0;
    bucket.typedChars += Math.max(0, Math.round(metrics.typedCount));
    bucket.activeMs += Math.max(0, Math.round(metrics.elapsedSeconds * 1000));
    bucket.cpmSum += Math.max(0, Math.round(metrics.cpm));
    bucket.accuracySum += Math.max(0, Math.round(metrics.accuracy));
    bucket.newsCompleted += context.mode === "news" ? 1 : 0;

    if (context.sentence.sentenceId) {
      const day = seoulParts().day;
      for (const index of active.mistakes) {
        const key = `${day}|${context.sentence.sentenceId}|${index}`;
        let weakness = this.weaknesses.get(key);
        if (!weakness) {
          weakness = {
            day,
            sentenceId: context.sentence.sentenceId,
            charIndex: index,
            mistakeCount: 0,
            correctionCount: 0,
          };
          this.weaknesses.set(key, weakness);
        }
        weakness.mistakeCount += 1;
        weakness.correctionCount += active.corrected.has(index) ? 1 : 0;
      }
    }

    this.active = null;
    this.revisionValue += 1;
  }

  resetContent() {
    this.active = null;
  }

  get revision() {
    return this.revisionValue;
  }

  snapshot() {
    const weaknesses = [...this.weaknesses.values()]
      .sort((a, b) => b.mistakeCount - a.mistakeCount)
      .slice(0, MAX_WEAKNESS_SNAPSHOT);
    return {
      sessionKey: this.ensureSession(),
      buckets: [...this.buckets.values()],
      weaknesses,
      keyUsage: [...this.keyUsage.entries()]
        .sort(([dayA], [dayB]) => dayA.localeCompare(dayB))
        .slice(-3)
        .map(([day, counts]) => ({ day, counts: Object.fromEntries(counts) })),
      revision: this.revisionValue,
    };
  }
}

export const typingAnalyticsTracker = new TypingAnalyticsTracker();
