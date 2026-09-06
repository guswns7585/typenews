/**
 * 부정행위 탐지용 행동 집계기.
 *
 * 원시 이벤트는 어디에도 남기지 않는다. 키를 언제 눌렀는지, 어떤 문장을 쳤는지는
 * 저장하지 않고 합계·제곱합·카운터만 들고 있다가 서버로 올린다.
 * 제곱합을 같이 보내는 이유는 서버가 평균과 표준편차를 복원하기 위해서다.
 */

/** 이보다 긴 간격은 잠시 손을 뗀 것으로 보고 리듬 통계에서 제외한다. */
const MAX_TRACKED_INTERVAL_MS = 3000;
/** 물리적으로 불가능한 간격. 키 반복이나 주입으로 본다. */
const MIN_TRACKED_INTERVAL_MS = 5;

const HANGUL = /[가-힣ㄱ-ㅎㅏ-ㅣ]/;

type DeviceClass = "desktop" | "tablet" | "mobile";

export type SessionMetrics = {
  sentenceCount: number;
  typedChars: number;
  activeMs: number;
  cpmSum: number;
  cpmSqSum: number;
  cpmMax: number;
  accuracySum: number;
  backspaceCount: number;
  pasteAttempts: number;
  blurredInputCount: number;
  hangulSentenceCount: number;
  composedSentenceCount: number;
  keystrokeCount: number;
  intervalSum: number;
  intervalSqSum: number;
  userAgent: string;
  deviceClass: DeviceClass;
};

export type SentenceOutcome = {
  text: string;
  cpm: number;
  accuracy: number;
  typedChars: number;
  elapsedMs: number;
};

function emptyMetrics(): SessionMetrics {
  return {
    sentenceCount: 0,
    typedChars: 0,
    activeMs: 0,
    cpmSum: 0,
    cpmSqSum: 0,
    cpmMax: 0,
    accuracySum: 0,
    backspaceCount: 0,
    pasteAttempts: 0,
    blurredInputCount: 0,
    hangulSentenceCount: 0,
    composedSentenceCount: 0,
    keystrokeCount: 0,
    intervalSum: 0,
    intervalSqSum: 0,
    userAgent: "",
    deviceClass: "desktop",
  };
}

function createSessionKey() {
  if (typeof crypto !== "undefined" && "randomUUID" in crypto) return crypto.randomUUID();
  // randomUUID가 없는 환경용 대체값. 형식만 uuid를 맞춘다.
  return "10000000-1000-4000-8000-100000000000".replace(/[018]/g, (character) => {
    const digit = Number(character);
    return (digit ^ (Math.floor(Math.random() * 256) & (15 >> (digit / 4)))).toString(16);
  });
}

function detectDeviceClass(): DeviceClass {
  if (typeof window === "undefined") return "desktop";
  const coarse = window.matchMedia?.("(pointer: coarse)").matches ?? false;
  if (window.innerWidth < 768) return "mobile";
  if (coarse || window.innerWidth < 1100) return "tablet";
  return "desktop";
}

class BehaviorTracker {
  private sessionKey = "";
  private startedAt = Date.now();
  private lastKeystrokeAt: number | null = null;
  /** 현재 문장에서 IME 조합이 한 번이라도 일어났는지. */
  private composedCurrentSentence = false;
  private windowFocused = true;

  private metrics: SessionMetrics = emptyMetrics();

  resetSession() {
    this.sessionKey = "";
    this.startedAt = Date.now();
    this.lastKeystrokeAt = null;
    this.composedCurrentSentence = false;
    this.metrics = emptyMetrics();
  }

  /** 메모리 집계 수명과 같은 키를 쓴다. 새로고침하면 집계와 키가 함께 새로 시작한다. */
  ensureSession() {
    if (this.sessionKey) return this.sessionKey;
    if (typeof window === "undefined") return "";

    this.sessionKey = createSessionKey();
    this.metrics.userAgent = window.navigator.userAgent.slice(0, 300);
    this.metrics.deviceClass = detectDeviceClass();
    return this.sessionKey;
  }

  noteKeystroke(now = Date.now()) {
    this.metrics.keystrokeCount += 1;

    const previous = this.lastKeystrokeAt;
    this.lastKeystrokeAt = now;
    if (previous === null) return;

    const interval = now - previous;
    if (interval < MIN_TRACKED_INTERVAL_MS || interval > MAX_TRACKED_INTERVAL_MS) return;

    this.metrics.intervalSum += interval;
    this.metrics.intervalSqSum += interval * interval;
  }

  noteBackspace() {
    this.metrics.backspaceCount += 1;
  }

  notePasteAttempt() {
    this.metrics.pasteAttempts += 1;
  }

  noteComposition() {
    this.composedCurrentSentence = true;
  }

  noteWindowFocus(focused: boolean) {
    this.windowFocused = focused;
  }

  /** 입력이 들어온 시점에 창이 포커스를 잃고 있었다면 기록한다. */
  noteInput() {
    if (!this.windowFocused) this.metrics.blurredInputCount += 1;
  }

  noteSentenceComplete(outcome: SentenceOutcome) {
    const cpm = Math.max(0, Math.round(outcome.cpm));

    this.metrics.sentenceCount += 1;
    this.metrics.typedChars += Math.max(0, outcome.typedChars);
    this.metrics.activeMs += Math.max(0, Math.round(outcome.elapsedMs));
    this.metrics.cpmSum += cpm;
    this.metrics.cpmSqSum += cpm * cpm;
    this.metrics.cpmMax = Math.max(this.metrics.cpmMax, cpm);
    this.metrics.accuracySum += Math.max(0, Math.round(outcome.accuracy));

    if (HANGUL.test(outcome.text)) {
      this.metrics.hangulSentenceCount += 1;
      if (this.composedCurrentSentence) this.metrics.composedSentenceCount += 1;
    }

    this.composedCurrentSentence = false;
  }

  /** 문장을 건너뛰면 조합 여부만 초기화한다. 완료가 아니므로 집계는 하지 않는다. */
  resetSentence() {
    this.composedCurrentSentence = false;
  }

  get sentenceCount() {
    return this.metrics.sentenceCount;
  }

  snapshot() {
    const sessionKey = this.ensureSession();
    this.metrics.deviceClass = detectDeviceClass();

    return {
      sessionKey,
      startedAt: new Date(this.startedAt).toISOString(),
      metrics: { ...this.metrics },
    };
  }
}

export const behaviorTracker = new BehaviorTracker();
