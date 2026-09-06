"use client";

import { ChevronLeft, ChevronRight } from "lucide-react";
import {
  useCallback,
  useEffect,
  useLayoutEffect,
  useMemo,
  useRef,
  useState,
} from "react";
import { SiteLogo } from "@/components/brand/site-logo";
import { useAuthProfile } from "@/components/auth/auth-button";
import { ScriptureMediaView } from "@/components/scripture/scripture-media-view";
import { TypingLayoutStage } from "@/components/typing/typing-layout-stage";
import { imageForSentence } from "@/features/content/sentence-images";
import { loadWordPool, pickSentence, prefetchBundles } from "@/features/content/sentence-picker";
import { DIAL_SIDE, createWordQueue, dialSlots, refillIfNeeded } from "@/features/content/word-stream";
import { behaviorTracker } from "@/features/integrity/behavior-tracker";
import { flushSession, registerIntegrityHandlers } from "@/features/integrity/session-reporter";
import {
  flushTypingAnalytics,
  registerTypingAnalyticsHandlers,
} from "@/features/analytics/analytics-reporter";
import { typingAnalyticsTracker } from "@/features/analytics/typing-analytics-tracker";
import {
  enqueue as enqueueScore,
  flush as flushOutbox,
  makeSubmissionKey,
  remove as removeScore,
  type PendingScore,
  type ScoreVerificationOptions,
} from "@/features/scoring/score-outbox";
import {
  SCRIPTURE_UPDATED_EVENT,
  loadLibrary,
  toLines,
  type ScriptureItem,
} from "@/features/scripture/scripture-library";
import { alignInput, isIgnoredCharacter } from "@/features/typing-engine/alignment";
import { keystrokesForCharacter } from "@/features/typing-engine/keystrokes";
import { playKeyboardSound, preloadKeyboardSound } from "@/features/typing-engine/keyboard-sound";
import { calculateMetrics } from "@/features/typing-engine/metrics";
import { MILESTONE_VISIBLE_MS, milestoneFor } from "@/features/typing-engine/milestones";
import { shouldSubmitTypingKey } from "@/features/typing-engine/submission-key";
import { seoulMonthId } from "@/lib/month";
import { useUiLanguage } from "@/lib/ui-language";
import type { ContentItem, TypingMode, TypingSettings } from "@/lib/types";
import type { WordItem } from "@/features/content/word-stream";
import { getSupabaseClient } from "@/lib/supabase/client";
import { useSettingsStore } from "@/stores/use-settings-store";
import { useTypingStore } from "@/stores/use-typing-store";
import { useUiStore } from "@/stores/use-ui-store";

/** 단어 모드에서 이만큼 모아 한 번에 서버로 보낸다. */
const WORD_BATCH_SIZE = 10;
/** 단어 하나의 짧은 시간으로 최고 CPM이 튀지 않게 하는 최소 측정 구간. */
const WORD_CPM_WINDOW_SIZE = 5;

type WeaknessWordRow = {
  sentence_text: string;
  char_index: number;
  mistake_count: number;
};

function wordAtCharacter(text: string, characterIndex: number) {
  const characters = [...text];
  const isWordCharacter = (character: string) => /[A-Za-z가-힣]/u.test(character);
  if (!isWordCharacter(characters[characterIndex] ?? "")) return null;
  let start = characterIndex;
  let end = characterIndex + 1;
  while (start > 0 && isWordCharacter(characters[start - 1])) start -= 1;
  while (end < characters.length && isWordCharacter(characters[end])) end += 1;
  const word = characters.slice(start, end).join("").toLocaleLowerCase();
  return word.length >= (/[A-Za-z]/.test(word) ? 3 : 2) ? word : null;
}

function highlightedWordIndexes(text: string, weakWords: Set<string>) {
  const indexes = new Set<number>();
  const characters = [...text];
  const isWordCharacter = (character: string) => /[A-Za-z가-힣]/u.test(character);
  let start = 0;
  while (start < characters.length) {
    if (!isWordCharacter(characters[start])) { start += 1; continue; }
    let end = start + 1;
    while (end < characters.length && isWordCharacter(characters[end])) end += 1;
    const word = characters.slice(start, end).join("").toLocaleLowerCase();
    if (weakWords.has(word)) for (let index = start; index < end; index += 1) indexes.add(index);
    start = end;
  }
  return indexes;
}

/**
 * 서버의 record_typing_result가 어디까지 받는지.
 *
 * PostgREST는 인자 **이름**으로 함수를 찾는다. 마이그레이션을 적용하기 전에
 * 새 인자를 보내면 함수를 찾지 못해 제출이 통째로 실패한다.
 * SQL 적용과 프론트엔드 배포 사이에 점수가 사라지지 않도록, 한 번 실패하면
 * 한 단계씩 내려가 그 뒤로는 그 인자만 보낸다.
 *
 *   key    — 0028 적용됨. 제출 키까지 (중복 적립 방지 + 재전송의 전제)
 *   verify — 0024까지. 문장 번호와 무시 옵션까지 (서버 검산)
 *   items  — 0014까지. 모드별 카운터까지
 *   base   — 0014 이전. 여섯 인자만
 */
type ServerArgLevel = "key" | "verify" | "items" | "base";
const NEXT_LEVEL: Record<ServerArgLevel, ServerArgLevel | null> = {
  key: "verify",
  verify: "items",
  items: "base",
  base: null,
};
let serverArgLevel: ServerArgLevel = "key";

/** 인자가 맞는 함수를 못 찾았을 때의 PostgREST 응답인지. */
function isMissingFunction(error: { code?: string; message?: string } | null) {
  if (!error) return false;
  return error.code === "PGRST202" || /find the function/i.test(error.message ?? "");
}

/**
 * 로그인하지 않은 상태로 보낸 것인지.
 *
 * 이건 다시 보내도 소용이 없다. 예전에도 로그인 없이 친 점수는 적립되지 않았고,
 * 대기열에 남겨두면 나중에 로그인했을 때 갑자기 적립되어 버린다.
 * JWT 만료(PGRST301)는 여기 해당하지 않는다 — 그건 토큰이 갱신되면 성공한다.
 */
function isNotAuthenticated(error: { code?: string; message?: string } | null) {
  return Boolean(error) && /not authenticated/i.test(error?.message ?? "");
}

/** record_typing_result 인자. 단계에 따라 뒤쪽을 잘라 보낸다. */
function argsFor(item: PendingScore, level: ServerArgLevel) {
  const base = {
    // 서버가 무시한다. 하위 호환으로 남아 있는 인자다.
    p_month_id: item.monthId,
    p_mode: item.mode,
    p_accuracy: item.accuracy,
    p_cpm: item.cpm,
    p_score: item.score,
    p_elapsed_ms: item.elapsedMs,
  };
  if (level === "base") return base;
  if (level === "items") return { ...base, p_items: item.items };

  const withVerify = {
    ...base,
    p_items: item.items,
    // 구 서버와의 인자 호환을 위해 값이 없을 때는 null을 보낸다.
    p_sentence_id: item.sentenceId ?? null,
    p_options: item.options ?? null,
  };
  if (level === "verify") return withVerify;
  return { ...withVerify, p_submission_key: item.key };
}

/**
 * 한 건을 실제로 보낸다. 처음 보낼 때와 재전송이 같은 경로를 쓴다.
 *
 * 돌려주는 값은 대기열이 무엇을 할지 정한다.
 *   done  — 적립됐거나 서버가 정당하게 거절했다(정확도 미달 등). 지운다
 *   drop  — 다시 보낼 이유가 없다. 지운다
 *   retry — 일시적 실패. 남겨두고 다음 기회에 다시 보낸다
 */
async function sendPending(item: PendingScore): Promise<"done" | "retry" | "drop"> {
  const supabase = getSupabaseClient();
  if (!supabase) return "retry";

  const { data: sessionData } = await supabase.auth.getSession();
  if (!sessionData.session) return "drop";

  // rpc는 예외를 던지지 않고 error를 돌려준다. 버리면 점수가 조용히 사라진다.
  let { error } = await supabase.rpc("record_typing_result", argsFor(item, serverArgLevel));

  // 인자가 맞는 함수가 없으면 한 단계씩 내려가며 다시 보낸다.
  while (error && isMissingFunction(error)) {
    const next = NEXT_LEVEL[serverArgLevel];
    if (!next) break;
    console.warn(
      `record_typing_result가 ${serverArgLevel} 인자를 받지 않는다. ${next}(으)로 내려간다.`,
    );
    serverArgLevel = next;
    ({ error } = await supabase.rpc("record_typing_result", argsFor(item, next)));
  }

  if (!error) return "done";
  if (isNotAuthenticated(error)) return "drop";

  console.error("점수 기록 실패", error);
  return "retry";
}

/** 대기 중인 점수를 다시 보낸다. */
function flushScoreOutbox() {
  void flushOutbox(sendPending, seoulMonthId());
}

type SubmitScoreArgs = {
  accuracy: number;
  cpm: number;
  score: number;
  elapsedMs: number;
  /** 이 제출에 들어 있는 항목 수. 단어 모드는 묶음 크기, 나머지는 1. */
  items: number;
  /** 남은 묶음을 뒤늦게 보낼 때는 모드가 이미 바뀌어 있을 수 있다. */
  submitMode?: TypingMode;
  /** 친 문장의 sentences 번호. 서버가 이것으로 점수를 다시 센다. */
  sentenceId?: number;
  /** 점수를 계산할 때 켜져 있던 무시 옵션. 서버가 같은 조건으로 세야 한다. */
  ignoreOptions?: TypingSettings;
  /** 단어 묶음의 원문 ID 또는 서버가 발급한 뉴스 원문 ID. */
  verificationOptions?: ScoreVerificationOptions;
};

/** 서버 검산에 넘기는 무시 옵션. 이름은 SQL 쪽 p_options 키와 맞춘다. */
function ignorePayload(settings: TypingSettings) {
  return {
    punctuation: settings.ignorePunctuation,
    numbers: settings.ignoreNumbers,
    english: settings.ignoreEnglish,
    symbols: settings.ignoreSymbols,
  };
}

type WordBatch = {
  count: number;
  score: number;
  accuracy: number;
  typedCount: number;
  elapsed: number;
  entries: NonNullable<ScoreVerificationOptions["wordEntries"]>;
};

function emptyWordBatch(): WordBatch {
  return { count: 0, score: 0, accuracy: 0, typedCount: 0, elapsed: 0, entries: [] };
}

/** 단어별 CPM 평균이 아니라 여러 단어의 총 입력량을 총 시간으로 나눈다. */
function cpmForWordBatch(batch: WordBatch) {
  if (batch.count < WORD_CPM_WINDOW_SIZE || batch.elapsed <= 0) return 0;
  return Math.round((batch.typedCount * 60_000) / batch.elapsed);
}


/**
 * 클립보드를 열어 줄 곳인가.
 *
 * 붙여넣기로 **점수를 만들 수 있는 곳은 타이핑 입력창 하나뿐이다.** 모든 문장은
 * `#input`을 지나고, 점수는 그 값으로만 계산된다. 그래서 그 하나만 잠그고,
 * 나머지 입력 요소에서는 복사·붙여넣기를 허용한다 — 필사 보관함에 가사를
 * 붙여 넣거나, 닉네임·문장 요청을 적는 자리다.
 *
 * ⚠️ 이 예외로 우회로가 생기지 않는 이유: 다른 칸에 붙여 넣은 글은 `#input`에
 *    들어갈 수 없다. 거기서 다시 복사해 와도 `#input`의 붙여넣기는 막혀 있다.
 *    필사에 붙여 넣은 글로는 애초에 점수가 쌓이지 않는다.
 *
 * 판정은 "타이핑 카드(#typing-tab) 밖의 input·textarea"로 둔다. `#input`만
 * 지목하지 않는 이유는 나중에 카드 안에 입력 요소가 더 생겨도 자동으로 막히게
 * 하기 위해서다.
 */
function isClipboardAllowed(target: EventTarget | null) {
  if (!(target instanceof HTMLElement)) return false;
  const field = target.closest("input, textarea");
  if (!field) return false;
  if (field.id === "input") return false;
  return !field.closest("#typing-tab");
}

function preventClipboard(event: Event) {
  if (isClipboardAllowed(event.target)) return;
  event.preventDefault();
}

function onClipboardPaste(event: Event) {
  if (isClipboardAllowed(event.target)) return;
  // 막힌 시도만 센다. 보관함 입력칸에 붙여 넣는 것은 어뷰징 신호가 아니다.
  behaviorTracker.notePasteAttempt();
  event.preventDefault();
}

/**
 * 이 문장을 끝냈을 때 받는 점수.
 *
 * 문장의 타수가 곧 점수다. 무시 옵션으로 치지 않아도 되는 글자는 빼고,
 * 공백은 세지 않는다. 같은 문장은 언제 쳐도 같은 점수가 나온다.
 */
function scoreForSentence(target: string, settings: TypingSettings) {
  let total = 0;
  for (const character of target) {
    if (isIgnoredCharacter(character, settings)) continue;
    total += keystrokesForCharacter(character);
  }
  return total;
}

export function TypingWorkspace() {
  const { signedIn } = useAuthProfile();
  const sentence = useTypingStore((state) => state.sentence);
  const input = useTypingStore((state) => state.input);
  const startedAt = useTypingStore((state) => state.startedAt);
  const language = useTypingStore((state) => state.language);
  const mode = useTypingStore((state) => state.mode);
  const newsSectors = useTypingStore((state) => state.newsSectors);
  const memeOnly = useTypingStore((state) => state.memeOnly);
  const scriptureId = useTypingStore((state) => state.scriptureId);
  const scriptureKind = useTypingStore((state) => state.scriptureKind);
  const scriptureLine = useTypingStore((state) => state.scriptureLine);
  const setScripture = useTypingStore((state) => state.setScripture);
  const setScriptureLine = useTypingStore((state) => state.setScriptureLine);
  const sessionCount = useTypingStore((state) => state.sessionCount);
  const sessionCounts = useTypingStore((state) => state.sessionCounts);
  const setInput = useTypingStore((state) => state.setInput);
  const setSentence = useTypingStore((state) => state.setSentence);
  const completeSentence = useTypingStore((state) => state.completeSentence);
  const settings = useSettingsStore();
  const { isEnglish, t } = useUiLanguage();
  const lastRecord = useUiStore((state) => state.lastRecord);
  const recordResult = useUiStore((state) => state.recordResult);
  const bumpLogoClick = useUiStore((state) => state.bumpLogoClick);
  const soundMode = useUiStore((state) => state.soundMode);
  const [logoClicked, setLogoClicked] = useState(false);
  const [milestone, setMilestone] = useState<{ text: string; active: boolean } | null>(null);
  const milestoneTimerRef = useRef<number | null>(null);
  const [history, setHistory] = useState<ContentItem[]>([]);
  const [isLoading, setIsLoading] = useState(false);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [frequentWeakWords, setFrequentWeakWords] = useState<Set<string>>(new Set());
  const [isComposing, setIsComposing] = useState(false);
  const inputRef = useRef<HTMLTextAreaElement>(null);
  const inputRevealRef = useRef<HTMLDivElement>(null);
  const surfaceRef = useRef<HTMLDivElement>(null);
  const requestRef = useRef(0);
  const newsPreferenceRef = useRef(
    `${settings.newsTypingTarget}:${settings.newsBodyAmount}`,
  );

  /**
   * 필사 중인가.
   *
   * 필사는 사용자가 브라우저에 직접 넣은 글을 줄 단위로 따라 치는 연습이다.
   * 원문이 서버에 없어서 점수를 검산할 방법이 아예 없다 — 같은 글자를 잔뜩
   * 채워 넣으면 그대로 타수가 되어버린다. 그래서 **어떤 경로로도 점수를 만들지
   * 않는다.** 아래 세 곳이 그 방어선이다.
   *
   *   1) 문장 공급 — 필사 줄은 sentenceId 없이 흘려보낸다(서버 검산 대상 없음).
   *   2) finishCurrentSentence — recordResult·submitScore를 부르지 않는다.
   *   3) 행동 기록 — behaviorTracker에도 넣지 않는다. 검증 불가능한 글로
   *      세션 통계를 흔들면 어뷰징 판정 자체가 무뎌진다.
   */
  const isScripture = scriptureId !== null;

  /* 단어 모드는 문장처럼 한 덩어리로 끝나지 않고 다이얼처럼 계속 흐른다.
     큐와 위치를 직접 들고, 현재 위치의 단어를 sentence로 흘려보내
     아래의 판정·점수 로직을 그대로 재사용한다.
     필사가 켜져 있으면 mode가 word로 남아 있어도 다이얼을 돌리지 않는다.
     setScripture는 mode를 건드리지 않으므로 여기서 걸러야 둘이 겹치지 않는다. */
  const isWordMode = mode === "word" && !isScripture;

  useEffect(() => {
    if (!signedIn || !settings.highlightWeakWords) return;
    const supabase = getSupabaseClient();
    if (!supabase) return;
    let active = true;
    void supabase.rpc("get_my_typing_weaknesses", { p_limit: 30 }).then(({ data, error }) => {
      if (!active || error) return;
      const counts = new Map<string, number>();
      for (const row of (data ?? []) as WeaknessWordRow[]) {
        const word = wordAtCharacter(row.sentence_text, row.char_index);
        if (word) counts.set(word, (counts.get(word) ?? 0) + row.mistake_count);
      }
      setFrequentWeakWords(new Set(
        [...counts.entries()].filter(([, count]) => count >= 2).sort((a, b) => b[1] - a[1]).slice(0, 16).map(([word]) => word),
      ));
    });
    return () => { active = false; };
  }, [settings.highlightWeakWords, signedIn]);
  const [wordPool, setWordPool] = useState<WordItem[]>([]);
  const [wordQueue, setWordQueue] = useState<WordItem[]>([]);
  const [wordIndex, setWordIndex] = useState(0);
  /* 단어 하나마다 서버에 보내면 초당 한 번꼴이 되어 과하다.
     원본이 단어 모드를 5문장 단위로 묶었던 것처럼 여기서도 모아서 보낸다. */
  const wordBatchRef = useRef<WordBatch>(emptyWordBatch());
  const wordMeasuredCpmRef = useRef(0);
  const [wordMeasuredCpm, setWordMeasuredCpm] = useState(0);
  /* flushWordBatch는 모드 전환 cleanup에서 불리므로 그 시점의 최신 submitScore가
     필요하다. submitScore는 렌더마다 새로 만들어지니 ref로 들고 있는다. */
  const submitScoreRef = useRef<((args: SubmitScoreArgs) => void) | null>(null);

  /**
   * 지금 종류의 보관함 글 전체. localStorage에만 있어서 서버 렌더에서는 읽을 수 없다.
   *
   * 하나만 들고 있지 않은 이유: 단문·장문은 한국어 단문·장문처럼 저장된 글을
   * **이어서** 친다. 한 글의 마지막 줄을 끝내면 다음 글로 넘어가야 하므로
   * 목록 전체와 그 안에서의 위치를 알아야 한다.
   */
  const [scriptureItems, setScriptureItems] = useState<ScriptureItem[]>([]);
  /* 보관함이 바뀔 때마다 오른다. 같은 글을 고쳐도 id는 그대로라 이 값이 없으면
     다시 읽을 계기가 없다. */
  const [libraryVersion, setLibraryVersion] = useState(0);
  const scripture = useMemo(
    () => scriptureItems.find((item) => item.id === scriptureId) ?? null,
    [scriptureItems, scriptureId],
  );
  const scriptureIndex = scripture ? scriptureItems.indexOf(scripture) : -1;
  const scriptureLines = useMemo(
    () => (scripture ? toLines(scripture.body) : []),
    [scripture],
  );
  /* 가사는 영상·음원과 함께 한 곡을 끝까지 치는 모드다. 줄 다이얼과 재생 화면이
     여기만 붙고, 곡이 끝나면 다음 글로 넘어가지 않는다. */
  const isScriptureSong = isScripture && scriptureKind === "song";

  const focusInput = useCallback(() => {
    inputRef.current?.focus({ preventScroll: true });
  }, []);

  const loadNext = useCallback(
    async (rememberCurrent = true) => {
      const requestId = requestRef.current + 1;
      requestRef.current = requestId;
      behaviorTracker.resetSentence();
      typingAnalyticsTracker.resetContent();
      setIsLoading(true);
      setLoadError(null);

      try {
        const nextSentence = await pickSentence({
          language,
          mode,
          newsSectors,
          useStreaming: settings.ignoreStreaming,
          memeOnly,
          newsTypingTarget: settings.newsTypingTarget,
          newsBodyAmount: settings.newsBodyAmount,
        });

        if (requestRef.current !== requestId) return;
        if (rememberCurrent && sentence) {
          setHistory((items) => [...items.slice(-39), sentence]);
        }
        setSentence(nextSentence);
      } catch (error) {
        if (requestRef.current !== requestId) return;
        setLoadError(error instanceof Error ? error.message : "문장을 불러오지 못했습니다.");
      } finally {
        if (requestRef.current === requestId) setIsLoading(false);
      }
    },
    [
      language,
      mode,
      newsSectors,
      memeOnly,
      sentence,
      setSentence,
      settings.ignoreStreaming,
      settings.newsTypingTarget,
      settings.newsBodyAmount,
    ],
  );

  const loadPrevious = useCallback(() => {
    const previous = history.at(-1);
    if (!previous) return;
    requestRef.current += 1;
    behaviorTracker.resetSentence();
    typingAnalyticsTracker.resetContent();
    setHistory((items) => items.slice(0, -1));
    setLoadError(null);
    setIsLoading(false);
    setSentence(previous);
    window.requestAnimationFrame(focusInput);
  }, [focusInput, history, setSentence]);

  useEffect(() => {
    const timer = window.setTimeout(() => {
      requestRef.current += 1;
      setHistory([]);
    }, 0);
    return () => window.clearTimeout(timer);
  }, [
    language,
    mode,
    newsSectors,
    memeOnly,
    settings.ignoreStreaming,
    settings.newsTypingTarget,
    settings.newsBodyAmount,
  ]);

  useEffect(() => {
    const nextPreference = `${settings.newsTypingTarget}:${settings.newsBodyAmount}`;
    if (nextPreference === newsPreferenceRef.current) return;
    newsPreferenceRef.current = nextPreference;
    if (mode !== "news") return;

    const timer = window.setTimeout(() => {
      requestRef.current += 1;
      setHistory([]);
      useTypingStore.setState({ sentence: null, input: "", startedAt: null });
    }, 0);
    return () => window.clearTimeout(timer);
  }, [mode, settings.newsTypingTarget, settings.newsBodyAmount]);

  useEffect(() => {
    if (sentence || isWordMode || isScripture) return undefined;
    const timer = window.setTimeout(() => {
      void loadNext(false);
    }, 0);
    return () => window.clearTimeout(timer);
  }, [loadNext, sentence, isWordMode, isScripture]);

  // 보관함에서 저장·삭제가 일어나면 다시 읽는다.
  useEffect(() => {
    function onUpdated() {
      setLibraryVersion((version) => version + 1);
    }
    window.addEventListener(SCRIPTURE_UPDATED_EVENT, onUpdated);
    return () => window.removeEventListener(SCRIPTURE_UPDATED_EVENT, onUpdated);
  }, []);

  /* 지금 종류의 글을 보관함에서 읽어 온다. 고른 글이 목록에 없으면(지웠거나
     종류를 바꿨다) 칠 것이 없으므로 필사에서 빠져나온다. */
  useEffect(() => {
    // effect 본문에서 곧바로 setState를 부르면 렌더가 연쇄된다. 한 틱 미룬다.
    const timer = window.setTimeout(() => {
      if (!scriptureId || !scriptureKind) {
        setScriptureItems([]);
        return;
      }
      const items = loadLibrary().filter((item) => item.kind === scriptureKind);
      setScriptureItems(items);
      if (!items.some((item) => item.id === scriptureId)) {
        useTypingStore.getState().setScripture(null);
      }
    }, 0);
    return () => window.clearTimeout(timer);
  }, [scriptureId, scriptureKind, libraryVersion]);

  /* 지금 줄을 타이핑 대상으로 넘긴다.
     sentenceId를 붙이지 않는다 — 서버에 없는 글이라 검산할 원문이 없고,
     혹시라도 제출 경로에 들어가면 대조 없이 점수가 될 수 있다. */
  useEffect(() => {
    if (!isScripture || !scriptureLines.length) return undefined;
    const timer = window.setTimeout(() => {
      /* 글을 줄여서 저장하면 지금 줄이 원문 밖으로 나간다. 그러면 칠 문장이
         사라져 화면이 빈 채로 멈추므로 마지막 줄로 당겨온다. */
      if (scriptureLine >= scriptureLines.length) {
        setScriptureLine(scriptureLines.length - 1);
        return;
      }
      setSentence({
        id: `scripture-${scriptureId}-${scriptureLine}`,
        text: scriptureLines[scriptureLine],
      });
    }, 0);
    return () => window.clearTimeout(timer);
  }, [isScripture, scriptureId, scriptureLines, scriptureLine, setSentence, setScriptureLine]);

  /* 다른 모드의 문장 묶음을 한가할 때 하나씩 미리 받아둔다. 모드를 바꿀 때의
     대기를 없앤다. 지금 쓰는 모드는 제외해서 첫 문장 로드와 경쟁하지 않게 한다.
     setState를 하지 않으므로 effect 안에서 불러도 문제없다. */
  useEffect(() => {
    prefetchBundles(language, settings.ignoreStreaming, mode);
  }, [language, settings.ignoreStreaming, mode]);

  // 단어 모드로 들어오거나 언어가 바뀌면 큐를 새로 만든다.
  useEffect(() => {
    if (!isWordMode) return undefined;
    let active = true;

    void (async () => {
      // effect 본문에서 곧바로 setState를 부르면 렌더가 연쇄된다. 한 틱 미룬다.
      await Promise.resolve();
      if (!active) return;
      setIsLoading(true);
      setLoadError(null);

      try {
        const [pool, queue] = await Promise.all([loadWordPool(language), createWordQueue(language)]);
        if (!active) return;
        setWordPool(pool);
        setWordQueue(queue);
        // 왼쪽 칸이 비어 보이지 않도록 다이얼 중앙부터 시작한다.
        setWordIndex(DIAL_SIDE);
        wordBatchRef.current = emptyWordBatch();
        wordMeasuredCpmRef.current = 0;
        setWordMeasuredCpm(0);
      } catch (error) {
        if (active) setLoadError(error instanceof Error ? error.message : "단어를 불러오지 못했습니다.");
      } finally {
        if (active) setIsLoading(false);
      }
    })();

    return () => {
      active = false;
    };
  }, [isWordMode, language]);

  // 현재 위치의 단어를 타이핑 대상으로 넘긴다.
  useEffect(() => {
    if (!isWordMode) return;
    const word = wordQueue[wordIndex];
    if (word) {
      setSentence({ id: `word-${wordIndex}`, text: word.text, sentenceId: word.sentenceId });
    }
  }, [isWordMode, wordQueue, wordIndex, setSentence]);

  /* 다이얼을 한 칸 돌린다.
     큐 끝이 가까워지면 여기서 바로 이어 붙인다. 별도 effect로 빼면
     인덱스가 바뀔 때마다 렌더가 한 번 더 도는 데다 한 프레임 늦게 채워진다. */
  const moveWord = useCallback(
    (delta: number) => {
      const next = Math.max(0, wordIndex + delta);
      setWordIndex(next);
      if (wordPool.length) setWordQueue((queue) => refillIfNeeded(queue, next, wordPool));
    },
    [wordIndex, wordPool],
  );

  /**
   * 필사에서 한 칸 옮긴다.
   *
   * 글 안에 다음 줄이 남아 있으면 그 줄로 간다. 원문의 끝에 닿으면 종류에 따라 갈린다.
   *
   *   가사   — 한 곡을 끝까지 치는 모드다. 곡 밖으로 나가지 않는다.
   *   단문·장문 — 한국어 단문·장문처럼 저장된 글을 **이어서** 친다. 다음 글의
   *              첫 줄로 넘어가고, 마지막 글을 끝내면 처음으로 돌아온다.
   *              글이 하나뿐이면 그 글 안에서 순환한다.
   */
  const moveScriptureLine = useCallback(
    (delta: number) => {
      if (!scriptureLines.length) return;
      const next = scriptureLine + delta;
      if (next >= 0 && next < scriptureLines.length) {
        setScriptureLine(next);
        return;
      }
      if (isScriptureSong || !scriptureKind || scriptureIndex < 0) return;

      const step = next < 0 ? -1 : 1;
      if (scriptureItems.length <= 1) {
        // 이어 붙일 다른 글이 없다. 같은 글의 반대쪽 끝으로 돌아간다.
        setScriptureLine(step > 0 ? 0 : scriptureLines.length - 1);
        return;
      }

      const count = scriptureItems.length;
      const nextItem = scriptureItems[(scriptureIndex + step + count) % count];
      setScripture(nextItem.id, nextItem.kind);
      // 뒤로 갔으면 그 글의 마지막 줄에서 이어진다. setScripture가 0으로 맞춰 둔다.
      if (step < 0) {
        const lines = toLines(nextItem.body);
        if (lines.length > 1) setScriptureLine(lines.length - 1);
      }
    },
    [
      scriptureLines,
      scriptureLine,
      setScriptureLine,
      isScriptureSong,
      scriptureKind,
      scriptureIndex,
      scriptureItems,
      setScripture,
    ],
  );

  /* 다음/이전 이동은 모드에 따라 갈린다. 필사는 줄을, 단어 모드는 다이얼을
     한 칸 옮기고, 나머지는 문장을 새로 불러온다. 호출부는 이 두 함수만 쓴다. */
  const goNext = useCallback(() => {
    if (isScripture) {
      moveScriptureLine(1);
      return;
    }
    if (isWordMode) {
      moveWord(1);
      return;
    }
    void loadNext(Boolean(sentence));
  }, [isScripture, moveScriptureLine, isWordMode, moveWord, loadNext, sentence]);

  const goPrevious = useCallback(() => {
    if (isScripture) {
      moveScriptureLine(-1);
      return;
    }
    if (isWordMode) {
      moveWord(-1);
      return;
    }
    loadPrevious();
  }, [isScripture, moveScriptureLine, isWordMode, moveWord, loadPrevious]);

  useEffect(() => {
    focusInput();
  }, [sentence?.id, focusInput]);

  useEffect(() => {
    document.documentElement.style.setProperty("--font-size-body", `${settings.fontSize}px`);
  }, [settings.fontSize]);

  useEffect(() => {
    if (soundMode) preloadKeyboardSound();
  }, [soundMode]);

  useEffect(() => registerIntegrityHandlers(), []);
  useEffect(() => registerTypingAnalyticsHandlers(), []);

  /* 가상 커서.
     원본 타입뉴스처럼 글자 사이를 미끄러지듯 옮겨 다닌다.
     인라인 요소로 끼워 넣으면 위치를 애니메이션할 수 없어서, 하나만 만들어
     절대 배치해두고 목표 글자의 좌표로 옮긴다. */
  const cursorRef = useRef<HTMLSpanElement>(null);

  /* 브라우저가 캐럿을 보이게 하려고 카드를 스크롤해버리는 경우가 있다.
     overflow:hidden이라 스크롤바는 없지만 scrollTop은 올라가고, 그만큼
     문장이 위로 밀려 잘린다. 올라갔으면 즉시 되돌린다. */
  useEffect(() => {
    const surface = surfaceRef.current;
    if (!surface) return undefined;

    function resetScroll() {
      if (surface && (surface.scrollTop !== 0 || surface.scrollLeft !== 0)) {
        surface.scrollTop = 0;
        surface.scrollLeft = 0;
      }
    }

    surface.addEventListener("scroll", resetScroll);
    return () => surface.removeEventListener("scroll", resetScroll);
  }, []);

  /* 지금 칠 단어의 중심이 항상 창의 정중앙에 오도록 트랙을 민다.
     단어 길이가 제각각이라 이동 거리를 CSS로는 알 수 없어 직접 잰다.
     움직이는 것은 트랙 하나뿐이라 슬롯의 scale이 흐트러지지 않는다. */
  const dialTrackRef = useRef<HTMLDivElement>(null);
  const dialIndexRef = useRef(-1);

  useLayoutEffect(() => {
    const track = dialTrackRef.current;
    if (!track) {
      dialIndexRef.current = -1;
      return;
    }

    const current = track.querySelector<HTMLElement>(".word-slot.is-current");
    if (!current) return;

    const centerOf = (slot: HTMLElement) => -(slot.offsetLeft + slot.offsetWidth / 2);
    const transformFor = (value: number) => `translate(${value}px, -50%)`;

    const shift = centerOf(current);
    const previousIndex = dialIndexRef.current;

    track.style.transform = transformFor(shift);
    dialIndexRef.current = wordIndex;

    if (previousIndex < 0 || previousIndex === wordIndex) return;

    /* 되감을 시작점은 "이전에 가운데 있던 단어"가 지금 레이아웃에서 놓인 자리다.
       예전에는 이전 렌더에서 잰 숫자를 그대로 썼는데, 그 사이 칸이 한 칸 밀려서
       기준이 어긋났다. 그래서 두 칸을 건너뛰거나 반대로 가는 것처럼 보였다. */
    const previousSlot = track.querySelector<HTMLElement>(`[data-slot-key="${previousIndex}"]`);
    if (!previousSlot) return;

    const from = centerOf(previousSlot);
    if (from === shift) return;

    track.animate([{ transform: transformFor(from) }, { transform: transformFor(shift) }], {
      duration: 260,
      easing: "cubic-bezier(0.22, 1, 0.36, 1)",
    });
    /* input은 일부러 넣지 않는다. 칸 폭이 입력과 무관하게 고정되어 있으므로
       타이핑 중에는 다시 잴 이유가 없고, 중간에 기준점이 갱신되면 정작 단어가
       넘어갈 때 되감을 거리가 사라져 애니메이션이 보이지 않는다. */
  }, [wordIndex, wordQueue, isWordMode, settings.fontFamily, settings.fontSize]);

  /* 가사의 줄 다이얼. 단어 다이얼을 세로로 세운 것이다.
     지금 칠 줄의 중심이 항상 칸의 정중앙에 오도록 트랙을 올린다. 줄 길이가
     제각각이라(접히기도 한다) 이동 거리를 CSS로는 알 수 없어 직접 잰다. */
  const lineTrackRef = useRef<HTMLDivElement>(null);
  const lineIndexRef = useRef(-1);
  const lineAnimationRef = useRef<Animation | null>(null);
  const [cursorMeasureTick, setCursorMeasureTick] = useState(0);

  useLayoutEffect(() => {
    const track = lineTrackRef.current;
    if (!track) {
      lineIndexRef.current = -1;
      return;
    }

    const current = track.querySelector<HTMLElement>(".line-slot.is-current");
    if (!current) return;

    const centerOf = (slot: HTMLElement) => -(slot.offsetTop + slot.offsetHeight / 2);
    const transformFor = (value: number) => `translate(-50%, ${value}px)`;

    const shift = centerOf(current);
    const previousIndex = lineIndexRef.current;

    track.style.transform = transformFor(shift);
    lineIndexRef.current = scriptureLine;

    if (previousIndex < 0 || previousIndex === scriptureLine) return;

    /* 되감을 시작점은 "이전에 가운데 있던 줄"이 지금 배치에서 놓인 자리다.
       한 칸 움직였으면 그 줄이 위쪽 칸으로 남아 있어 잴 수 있다.
       여러 칸을 건너뛰면 그 줄이 화면에 없으므로 애니메이션 없이 바로 옮긴다. */
    const previousSlot = track.querySelector<HTMLElement>(`[data-slot-key="${previousIndex}"]`);
    if (!previousSlot) return;

    const from = centerOf(previousSlot);
    if (from === shift) return;

    lineAnimationRef.current?.cancel();
    const animation = track.animate([{ transform: transformFor(from) }, { transform: transformFor(shift) }], {
      duration: 260,
      easing: "cubic-bezier(0.22, 1, 0.36, 1)",
    });
    lineAnimationRef.current = animation;
    void animation.finished
      .then(() => {
        if (lineAnimationRef.current !== animation) return;
        lineAnimationRef.current = null;
        setCursorMeasureTick((tick) => tick + 1);
      })
      .catch(() => {
        /* 새 줄 이동이 시작되어 이전 애니메이션이 취소된 경우다. */
      });
    /* 단어 다이얼과 같은 이유로 input은 넣지 않는다. 타이핑 중에 기준점이
       갱신되면 정작 줄이 넘어갈 때 되감을 거리가 사라진다.

       ⚠️ sentence?.id는 반드시 있어야 한다. 다이얼은 sentence가 채워진 뒤에야
          그려지는데, 그 렌더에서는 scriptureLine·scriptureLines가 그대로여서
          이 값이 없으면 effect가 다시 돌지 않는다. 그러면 트랙이 한 번도
          측정되지 않아 첫 줄이 가운데로 오지 않는다. */
  }, [
    scriptureLine,
    scriptureLines,
    isScriptureSong,
    sentence?.id,
    settings.fontFamily,
    settings.fontSize,
  ]);

  // 입력창 모드에서 입력 영역을 내용에 맞춰 늘린다. 문장과 같은 글자·여백을 쓰므로
  // 끝까지 다 치면 위아래 블록의 높이가 정확히 같아진다.
  useLayoutEffect(() => {
    const element = inputRef.current;
    const sentenceElement = surfaceRef.current?.querySelector<HTMLElement>("#sentence");
    if (!element || !sentenceElement) return undefined;

    const syncInputHeight = () => {
      const height = sentenceElement.getBoundingClientRect().height;
      /**
       * 테두리 두께만큼 더한다.
       *
       * #input은 box-sizing: border-box라 height에 테두리가 포함된다. 그런데
       * 여기서 넣는 값은 **문장의 바깥 상자 높이**다. 문장에는 테두리가 없고
       * 입력창에는 있으면(스프레드시트 테마가 위아래 1px씩 준다), 같은 숫자를
       * 넣어도 입력창 안쪽은 그만큼 좁아진다.
       *
       * 그러면 한 줄(line-height 31px)이 29px짜리 칸에 들어가지 못해 넘치고,
       * 브라우저가 커서를 보이려고 textarea를 2px 밀어 올린다. 그 결과 입력 글자만
       * 문장보다 위로 떠서 어긋나 보이고, 심하면 윗부분이 잘린다.
       * 넘치는 양이 테두리 두께에 달려 있어 테마·환경마다 정도가 달랐다.
       */
      const style = window.getComputedStyle(element);
      const borders =
        (Number.parseFloat(style.borderTopWidth) || 0) +
        (Number.parseFloat(style.borderBottomWidth) || 0);

      element.style.height = `${height + borders}px`;
      inputRevealRef.current?.style.setProperty(
        "--input-expanded-height",
        `${height + borders}px`,
      );
    };

    syncInputHeight();
    const observer = new ResizeObserver(syncInputHeight);
    observer.observe(sentenceElement);
    return () => observer.disconnect();
    /* visualTheme이 있어야 한다. 위에서 읽는 테두리 두께가 테마마다 다르기 때문이다
       (스프레드시트는 1px, 나머지는 0). 지금까지는 테마를 바꾸면 #sentence 크기도
       함께 변해 ResizeObserver가 대신 불러줬지만, 그건 우연이지 보장이 아니다. */
  }, [settings.fontFamily, settings.fontSize, settings.visualTheme, sentence?.id]);

  useEffect(() => {
    return () => {
      if (milestoneTimerRef.current !== null) window.clearTimeout(milestoneTimerRef.current);
    };
  }, []);

  const showMilestone = useCallback((text: string) => {
    if (milestoneTimerRef.current !== null) window.clearTimeout(milestoneTimerRef.current);
    setMilestone({ text, active: true });
    milestoneTimerRef.current = window.setTimeout(() => {
      milestoneTimerRef.current = null;
      // 문구는 남겨둔 채 클래스만 떼서 CSS transition으로 사라지게 한다.
      setMilestone((current) => (current ? { ...current, active: false } : null));
    }, MILESTONE_VISIBLE_MS);
  }, []);

  useEffect(() => {
    function onKeyDown(event: KeyboardEvent) {
      /* 보관함·설정 같은 일반 입력칸에서는 단축키를 가로채지 않는다.
         Ctrl+V를 여기서 막으면 paste 이벤트가 오기도 전에 끝나고,
         Ctrl+A·Ctrl+C까지 잠기면 긴 가사를 손볼 수 없다. */
      if (isClipboardAllowed(event.target)) return;

      const hasModifier = event.ctrlKey || event.metaKey;
      if ((event.shiftKey && event.key === "Insert") || event.key === "Insert") {
        event.preventDefault();
        return;
      }
      if (hasModifier && [",", ".", "c", "v", "x", "a"].includes(event.key.toLowerCase())) {
        event.preventDefault();
        if (event.key === ",") goPrevious();
        if (event.key === ".") goNext();
        return;
      }
      if (event.key === "Tab") {
        event.preventDefault();
        goNext();
      }
    }

    function onMouseDown(event: MouseEvent) {
      const target = event.target as HTMLElement | null;
      if (!target) return;
      if (
        target.closest(
          "button, a, input, textarea, select, audio, .settings-panel, .scripture-pip, .dropdown-content, .mode-dropdown-content, .sub-nav-frosted, .global-nav",
        )
      ) {
        return;
      }
      window.requestAnimationFrame(focusInput);
    }

    document.addEventListener("keydown", onKeyDown);
    document.addEventListener("mousedown", onMouseDown);
    document.addEventListener("copy", preventClipboard);
    document.addEventListener("paste", onClipboardPaste);
    document.addEventListener("cut", preventClipboard);
    document.addEventListener("contextmenu", preventClipboard);
    return () => {
      document.removeEventListener("keydown", onKeyDown);
      document.removeEventListener("mousedown", onMouseDown);
      document.removeEventListener("copy", preventClipboard);
      document.removeEventListener("paste", onClipboardPaste);
      document.removeEventListener("cut", preventClipboard);
      document.removeEventListener("contextmenu", preventClipboard);
    };
  }, [focusInput, goNext, goPrevious]);

  const targetText = sentence?.text ?? "";
  const [sentenceLineCount, setSentenceLineCount] = useState(1);

  useLayoutEffect(() => {
    let frame = 0;

    function measureSentenceWidth() {
      const element = document.getElementById("sentence");
      if (!element || !targetText) {
        setSentenceLineCount(1);
        return;
      }

      const style = window.getComputedStyle(element);
      const lineHeight = settings.visualTheme === "spreadsheet" ? 24 : 22;
      const probe = document.createElement("div");
      probe.textContent = element.innerText || targetText;
      Object.assign(probe.style, {
        position: "fixed",
        left: "-10000px",
        top: "0",
        visibility: "hidden",
        /* 여러 줄일 때의 #sentence 좌우 여백과 같아야 한다.
           CSS는 `padding: 3px 28px 3px 10px` = 38px인데 여기가 36으로 어긋나 있어,
           경계에 걸린 문장에서 줄 수를 한 줄 적게 세는 경우가 있었다. */
        width: `${Math.max(1, element.clientWidth - 38)}px`,
        height: "auto",
        minHeight: "0",
        maxHeight: "none",
        padding: "0",
        border: "0",
        boxSizing: "border-box",
        fontFamily: style.fontFamily,
        fontSize: style.fontSize,
        fontWeight: style.fontWeight,
        letterSpacing: style.letterSpacing,
        lineHeight: `${lineHeight}px`,
        overflow: "visible",
        overflowWrap: "anywhere",
        wordBreak: "break-word",
        whiteSpace: "pre-wrap",
        pointerEvents: "none",
      });
      document.body.appendChild(probe);
      // innerText includes the news title and body, but not the vertical space
      // occupied by their separator. Reserve one line for that gap so the
      // formula area does not become internally scrollable in body mode.
      const newsSeparatorLines =
        mode === "news" && !isScripture && settings.newsTypingTarget !== "title" && sentence?.title
          ? 1
          : 0;
      const next = Math.min(
        5,
        Math.max(1, Math.ceil(probe.scrollHeight / lineHeight) + newsSeparatorLines),
      );
      probe.remove();
      setSentenceLineCount((current) => current === next ? current : next);
    }

    function scheduleMeasure() {
      window.cancelAnimationFrame(frame);
      frame = window.requestAnimationFrame(measureSentenceWidth);
    }

    scheduleMeasure();
    window.addEventListener("resize", scheduleMeasure);
    return () => {
      window.cancelAnimationFrame(frame);
      window.removeEventListener("resize", scheduleMeasure);
    };
  }, [
    targetText,
    sentence?.title,
    mode,
    isScripture,
    settings.newsTypingTarget,
    settings.fontFamily,
    settings.fontSize,
    settings.visualTheme,
  ]);

  /**
   * 문장 영역을 입력창의 스크롤에 맞춘다.
   *
   * 스프레드시트 테마는 수식 입력줄 높이가 제한돼 있어서 #sentence와 #input이
   * 각각 `overflow-y: auto`로 스크롤된다. 그런데 스크롤을 움직이는 것은 입력창뿐이다
   * — 브라우저가 캐럿을 따라 textarea를 내린다. 문장은 맨 위에 그대로 남는다.
   * 그래서 긴 문장(특히 영어 뉴스 본문)에서는 둘이 점점 어긋나고, 결국 지금 치는
   * 부분이 화면 밖으로 나가 무엇을 치고 있는지 보이지 않는다.
   * 몇 줄에서 어긋나기 시작하는지는 글꼴 실측폭에 달려 있어 환경마다 달랐다.
   *
   * 다른 테마에서는 둘 다 스크롤되지 않으므로 이 동기화가 하는 일이 없다.
   */
  useEffect(() => {
    const input = inputRef.current;
    const sentenceElement = surfaceRef.current?.querySelector<HTMLElement>("#sentence");
    if (!input || !sentenceElement) return undefined;

    const sync = () => {
      if (sentenceElement.scrollTop !== input.scrollTop) {
        sentenceElement.scrollTop = input.scrollTop;
      }
    };

    sync();
    input.addEventListener("scroll", sync);
    return () => input.removeEventListener("scroll", sync);
  }, [sentence?.id, settings.visualTheme, settings.fontFamily, settings.fontSize]);

  /* 무시 옵션 중에는 현재 모드에서 성립하지 않는 것이 있다.
     영어 문장에서 영어를 무시하면 칠 글자가 남지 않아 문장이 즉시 완료되어버린다.
     버튼을 잠그는 것만으로는 이전에 켜둔 값이 그대로 남으므로 여기서 무력화한다.

     필사는 원문을 그대로 옮겨 적는 연습이라 애초에 글자를 빼지 않는다.
     사용자가 넣은 글이라 언어를 알 수 없어서, 켜둔 채로 두면 영문 한 줄이
     통째로 무시되어 아무것도 치지 않았는데 완료되는 일이 생긴다. */
  const effectiveSettings = useMemo(() => {
    if (isScripture) {
      return {
        ...settings,
        ignorePunctuation: false,
        ignoreNumbers: false,
        ignoreEnglish: false,
        ignoreSymbols: false,
      };
    }
    return language === "eng" ? { ...settings, ignoreEnglish: false } : settings;
  }, [settings, language, isScripture]);

  const alignment = useMemo(
    () => alignInput(targetText, input, effectiveSettings),
    [targetText, input, effectiveSettings],
  );

  /* 입력이 멈춰 있어도 CPM이 내려가도록 시계를 돌린다. 100ms는 긴 뉴스에서 수백 개
     글자 노드를 포함한 작업 공간 전체를 초당 10번 다시 렌더링했다. 최종 점수는 제출
     순간 별도로 다시 계산하므로, 표시에 충분한 250ms로 낮춰 타건 프레임을 비운다. */
  const [clock, setClock] = useState(0);
  useEffect(() => {
    if (!startedAt) return undefined;
    const timer = window.setInterval(() => setClock((tick) => tick + 1), 250);
    return () => window.clearInterval(timer);
  }, [startedAt]);

  const metrics = useMemo(
    () => calculateMetrics(input, startedAt, alignment),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [input, startedAt, alignment, clock],
  );

  const progress = useMemo(() => {
    if (!targetText.length) return 0;
    return Math.min(100, Math.round((input.length / targetText.length) * 100));
  }, [input.length, targetText]);

  const canComplete = Boolean(sentence) && alignment.isComplete;

  /* 브라우저의 자동 줄바꿈은 줄 끝 공백을 보이지 않게 접는다. 원문 공백 앞뒤의
     글자 좌표를 비교해 실제로 줄이 바뀐 곳만 찾고, 윗줄 마지막 글자에 슬롯을 붙인다.
     DOM 속성만 바꾸므로 원문·입력·정확도 계산에는 전혀 관여하지 않는다. */
  useLayoutEffect(() => {
    const sentenceElement = surfaceRef.current?.querySelector<HTMLElement>("#sentence");
    if (!sentenceElement || !sentence || isWordMode) return undefined;
    const characters = [...targetText];
    let animationFrame = 0;

    const measure = () => {
      sentenceElement.querySelectorAll<HTMLElement>("[data-line-end-space]").forEach((cell) => {
        delete cell.dataset.lineEndSpace;
      });

      const cellAt = (index: number) =>
        sentenceElement.querySelector<HTMLElement>(`[data-char-index="${index}"]`);
      const fontSize = Number.parseFloat(getComputedStyle(sentenceElement).fontSize) || 16;
      const lineThreshold = Math.max(3, fontSize * 0.3);

      for (let index = 0; index < characters.length; index += 1) {
        if (characters[index] !== " ") continue;

        const spaceStart = index;
        while (index + 1 < characters.length && characters[index + 1] === " ") index += 1;
        const nextIndex = index + 1;
        const previousIndex = spaceStart - 1;
        if (
          previousIndex < 0 ||
          nextIndex >= characters.length ||
          characters[previousIndex] === "\n" ||
          characters[nextIndex] === "\n"
        ) {
          continue;
        }

        const previousCell = cellAt(previousIndex);
        const nextCell = cellAt(nextIndex);
        if (!previousCell || !nextCell) continue;
        const previousRect = previousCell.getBoundingClientRect();
        const nextRect = nextCell.getBoundingClientRect();
        if (nextRect.top - previousRect.top < lineThreshold) continue;

        previousCell.dataset.lineEndSpace = String(spaceStart);
      }
    };

    const scheduleMeasure = () => {
      window.cancelAnimationFrame(animationFrame);
      animationFrame = window.requestAnimationFrame(measure);
    };

    measure();
    const observer = new ResizeObserver(scheduleMeasure);
    observer.observe(sentenceElement);
    window.addEventListener("resize", scheduleMeasure);
    return () => {
      window.cancelAnimationFrame(animationFrame);
      observer.disconnect();
      window.removeEventListener("resize", scheduleMeasure);
    };
    /* alignment는 더 이상 보지 않는다. 예전에는 커서 위치에 따라 표시를 강조하느라
       글자 하나 칠 때마다 이 effect가 다시 돌면서 문장 전체를 훑었다.
       줄바꿈 위치는 입력과 무관하므로 문장·글꼴·크기가 바뀔 때만 재면 된다.
       (크기 변화는 아래 ResizeObserver가 잡는다) */
  }, [isWordMode, sentence, settings.fontFamily, targetText]);

  // 커서를 목표 글자 옆으로 옮긴다. 위치만 바꾸므로 CSS transition이 이어받는다.
  useLayoutEffect(() => {
    const cursor = cursorRef.current;
    // 단어 모드에서는 아예 렌더하지 않으므로 ref가 비어 있다.
    if (!cursor) return;
    if (!settings.overlayMode || !sentence || isWordMode) {
      cursor.style.opacity = "0";
      return;
    }
    /* 가사 줄이 움직이는 동안 글자 좌표도 함께 이동한다. 중간 좌표에서 커서를
       재면 첨부 화면처럼 이전 시작점에 남으므로, 이동이 끝난 뒤 다시 잰다. */
    if (isScriptureSong && lineAnimationRef.current?.playState === "running") {
      cursor.style.opacity = "0";
      return;
    }

    const parent = cursor.parentElement;
    if (!parent) return;
    const cellAt = (i: number) =>
      parent.querySelector<HTMLElement>(`[data-char-index="${i}"]`) ?? null;

    const index = alignment.cursorAfterIndex;

    /* 커서는 "다음에 칠 글자가 놓일 자리"에 서야 한다.
       예전에는 직전 글자의 오른쪽 끝(offsetLeft + offsetWidth)을 썼는데, 같은 줄
       안에서는 그 자리가 곧 다음 글자의 자리라 맞아떨어진다. 어긋나는 경우가 둘 있다.

         1) 줄바꿈 — 직전 글자의 오른쪽 끝은 윗줄 오른쪽 끝이고, 다음 글자는
            아랫줄 왼쪽에서 시작한다. 그래서 커서만 저 앞에 남는다.
         2) offsetWidth가 정수로 반올림된다(실측 24.7px → 25px). 글자마다
            0.3px씩 어긋나 쌓인다.

       그래서 다음 글자가 있으면 그 글자의 왼쪽에 세운다. 문장 맨 끝일 때만
       직전 글자의 오른쪽 끝으로 떨어진다. */
    const nextCell = cellAt(index + 1);
    const anchor = nextCell ?? cellAt(index < 0 ? 0 : index);
    if (!anchor) {
      cursor.style.opacity = "0";
      return;
    }

    /* getBoundingClientRect는 소수점을 유지한다. offsetLeft/offsetWidth는 반올림된다.
       cursor는 #sentence 패딩 박스를 기준으로 절대 배치되므로 그 좌표로 환산한다. */
    const parentRect = parent.getBoundingClientRect();
    const rect = anchor.getBoundingClientRect();
    const x = rect.left - parentRect.left - parent.clientLeft + (nextCell ? 0 : rect.width);
    const y = rect.top - parentRect.top - parent.clientTop;

    /* 커서 높이를 잰 글자에서 그대로 가져온다.
       예전에는 CSS에 `height: 1.1em; margin-top: 0.28em`으로 못 박아 뒀는데,
       이 값은 특정 글꼴에 맞춰 눈으로 맞춘 숫자였다. 인라인 요소의 rect 높이는
       글꼴의 ascent+descent라 글꼴마다 다르고, 웹폰트가 늦게 로드되는 동안에는
       대체 글꼴 값이 잡힌다. 그래서 환경에 따라 커서가 글자보다 내려가 보였다.
       실측값을 쓰면 어떤 글꼴에서도 글자 상자와 정확히 겹친다. */
    cursor.style.height = `${rect.height}px`;
    cursor.style.opacity = "1";
    cursor.style.transform = `translate(${x}px, ${y}px)`;
  }, [alignment, settings.overlayMode, settings.fontFamily, settings.fontSize, sentence, isWordMode, isScriptureSong, cursorMeasureTick]);

  /**
   * 점수를 대기열에 담고 바로 보낸다.
   *
   * ⚠️ **담는 것이 먼저다.** 보내고 실패하면 담는 방식은, 다 치고 바로 탭을 닫는
   *    흔한 경우에 그 코드가 아예 돌지 않아 점수를 잃는다. localStorage는 동기라
   *    enqueue에서 돌아온 시점에는 이미 저장돼 있다.
   */
  function submitScore({
    accuracy,
    cpm,
    score,
    elapsedMs,
    items,
    submitMode = mode,
    sentenceId,
    ignoreOptions,
    verificationOptions,
  }: SubmitScoreArgs) {
    const item: PendingScore = {
      key: makeSubmissionKey(),
      monthId: seoulMonthId(),
      mode: submitMode,
      accuracy,
      cpm,
      score,
      elapsedMs,
      items,
      sentenceId,
      options: verificationOptions ?? (ignoreOptions ? ignorePayload(ignoreOptions) : undefined),
      createdAt: Date.now(),
    };

    enqueueScore(item);

    void (async () => {
      try {
        const result = await sendPending(item);
        // retry면 대기열에 남겨둔다. 다음 flush가 다시 보낸다.
        if (result !== "retry") removeScore(item.key);
      } catch (error) {
        // 점수 전송이 실패해도 타이핑은 계속되어야 한다. 대기열에는 남아 있다.
        console.error("점수 기록 실패", error);
      }
    })();
  }

  // 렌더마다 최신 submitScore를 ref에 담아둔다. 의존성 배열 없이 매번 돈다.
  useEffect(() => {
    submitScoreRef.current = submitScore;
  });

  /* 지난번에 못 보낸 점수를 다시 보낸다.
     끊겼다 돌아오는 순간(online), 탭으로 돌아오는 순간(visible), 그리고 1분마다.
     대기열이 비어 있으면 아무 일도 하지 않으므로 부담이 없다. */
  useEffect(() => {
    flushScoreOutbox();

    const onOnline = () => flushScoreOutbox();
    const onVisible = () => {
      if (document.visibilityState === "visible") flushScoreOutbox();
    };
    const timer = window.setInterval(flushScoreOutbox, 60_000);

    window.addEventListener("online", onOnline);
    document.addEventListener("visibilitychange", onVisible);
    return () => {
      window.clearInterval(timer);
      window.removeEventListener("online", onOnline);
      document.removeEventListener("visibilitychange", onVisible);
    };
  }, []);

  /**
   * 모아둔 단어 묶음을 지금 보낸다.
   *
   * 10개를 채우기 전에 모드를 바꾸거나 탭을 떠나면 그동안 친 단어의 점수가
   * 그냥 사라지고 있었다. 이벤트에서는 그게 곧 당첨 확률이라 흘려보낼 수 없다.
   * 모드가 이미 바뀌었을 수 있으므로 'word'를 명시해서 보낸다.
   */
  const flushWordBatch = useCallback(() => {
    const batch = wordBatchRef.current;
    if (batch.count === 0) return;
    wordBatchRef.current = emptyWordBatch();
    if (batch.score <= 0) return;

    submitScoreRef.current?.({
      accuracy: Math.round(batch.accuracy / batch.count),
      // 5단어 미만은 점수만 저장하고 최고 CPM 후보로 쓰지 않는다.
      cpm: cpmForWordBatch(batch),
      score: batch.score,
      elapsedMs: batch.elapsed,
      items: batch.count,
      submitMode: "word",
      verificationOptions: {
        punctuation: false,
        numbers: false,
        english: false,
        symbols: false,
        wordEntries: batch.entries,
      },
    });
  }, []);

  /* 단어 모드를 벗어날 때(cleanup)와 탭이 숨을 때 남은 묶음을 보낸다.
     pagehide는 전송이 끊길 수 있어 visibilitychange를 먼저 쓴다.
     session-reporter의 flushSession도 같은 이유로 이 이벤트를 쓴다. */
  useEffect(() => {
    if (!isWordMode) return undefined;

    const onHidden = () => {
      if (document.visibilityState === "hidden") flushWordBatch();
    };
    document.addEventListener("visibilitychange", onHidden);

    return () => {
      document.removeEventListener("visibilitychange", onHidden);
      flushWordBatch();
    };
  }, [isWordMode, flushWordBatch]);

  function finishCurrentSentence() {
    if (!sentence || !canComplete) return;

    /**
     * 필사는 점수 경로에 아예 들어가지 않는다.
     *
     * recordResult(최고 CPM·이번 달 점수)도, submitScore(서버 적립)도 부르지
     * 않는다. 세션 CNT도 올리지 않는다 — 필사는 단문·장문·뉴스·단어 어디에도
     * 속하지 않아서 어느 칸에 더하든 거짓이 된다(밈은 실제로 단문이라 셌다).
     * behaviorTracker에도 넣지 않는다: 원문이 서버에 없어 검산할 수 없는 입력으로
     * 세션 통계를 흔들면 어뷰징 판정이 오히려 무뎌진다.
     *
     * ⚠️ 여기서 곧바로 return한다. 아래 공통 경로를 한 줄도 지나가지 않는 것이
     *    "필사로는 점수를 만들 수 없다"를 보장하는 가장 확실한 방법이다.
     */
    if (isScripture) {
      // 카운트는 올리지 않되 입력은 비워 다음 줄을 받을 준비를 한다.
      completeSentence(false);
      /* 가사는 곡의 마지막 줄에서 멈춘다. 단문·장문은 다음 글로 이어지므로
         멈추는 곳이 없다(moveScriptureLine이 순환시킨다). */
      if (isScriptureSong && scriptureLine >= scriptureLines.length - 1) {
        showMilestone(t("필사를 마쳤습니다", "Practice complete"));
        focusInput();
        return;
      }
      window.setTimeout(() => {
        moveScriptureLine(1);
        focusInput();
      }, 180);
      return;
    }

    const finalMetrics = calculateMetrics(input, startedAt, alignment);
    const recordSentence = sentence.title ?? sentence.text;
    const passedAccuracy = finalMetrics.accuracy >= 80;
    const earnedScore = passedAccuracy ? scoreForSentence(sentence.text, effectiveSettings) : 0;

    if (passedAccuracy) {
      // 정확도를 통과한 문장만 세션 카운트에 들어가므로 마일스톤도 여기서 본다.
      const milestoneText = milestoneFor(sessionCount + 1);
      if (milestoneText) showMilestone(milestoneText);

      const elapsedMs = Math.round(finalMetrics.elapsedSeconds * 1000);

      if (isWordMode) {
        // 단어는 짧아서 하나마다 보내면 초당 한 번꼴이 된다. 모아서 한 번에 보낸다.
        const batch = wordBatchRef.current;
        batch.count += 1;
        batch.score += earnedScore;
        batch.accuracy += finalMetrics.accuracy;
        batch.typedCount += finalMetrics.typedCount;
        batch.elapsed += elapsedMs;
        batch.entries.push({
          sentenceId: sentence.sentenceId,
          options: ignorePayload(effectiveSettings),
        });

        /* 5번째와 10번째 단어에서만 CPM을 새로 확정한다. 그 사이에는 직전
           측정값을 유지해서 짧은 한 단어의 시작 오차가 최고 기록이 되지 않는다. */
        if (batch.count === WORD_CPM_WINDOW_SIZE || batch.count === WORD_BATCH_SIZE) {
          const measured = cpmForWordBatch(batch);
          wordMeasuredCpmRef.current = measured;
          setWordMeasuredCpm(measured);
        }

        recordResult(
          {
            sentence: recordSentence.slice(0, 40),
            cpm: wordMeasuredCpmRef.current,
            accuracy: finalMetrics.accuracy,
          },
          earnedScore,
        );

        if (batch.count >= WORD_BATCH_SIZE) {
          submitScore({
            accuracy: Math.round(batch.accuracy / batch.count),
            cpm: cpmForWordBatch(batch),
            score: batch.score,
            elapsedMs: batch.elapsed,
            // 묶음에 실제로 들어간 단어 수. 누적 카운트를 단어 단위로 세게 한다.
            items: batch.count,
            verificationOptions: {
              punctuation: false,
              numbers: false,
              english: false,
              symbols: false,
              wordEntries: batch.entries,
            },
          });
          wordBatchRef.current = emptyWordBatch();
        }
      } else if (memeOnly) {
        /* 밈 모드는 연습이다. 점수도, 최고 CPM도, 서버 기록도 남기지 않는다.
         *
         * 왜 아무것도 안 남기나 — 밈은 25문장뿐이라 몇 분이면 다 외워진다.
         * 외운 짧은 문장을 반복해 치면 분당 획득량이 크게 벌어져서, 다른 모드로
         * 정직하게 친 사람과 같은 줄에 세울 수 없다. 최고 CPM도 같은 이유로
         * 올리지 않는다 — 여기만 올리면 화면과 서버 값이 어긋나 보인다.
         *
         * 세션 CNT와 마일스톤은 그대로 둔다. 새로고침하면 사라지는 값이라
         * 순위나 기록에 영향이 없고, 치는 재미는 남겨두는 편이 낫다. */
      } else {
        recordResult(
          {
            sentence: recordSentence.slice(0, 40),
            cpm: finalMetrics.cpm,
            accuracy: finalMetrics.accuracy,
          },
          earnedScore,
        );

        submitScore({
          accuracy: finalMetrics.accuracy,
          cpm: finalMetrics.cpm,
          score: earnedScore,
          elapsedMs,
          items: 1,
          /* 서버가 DB 문장 ID 또는 신뢰된 뉴스 원문 ID로 점수를 다시 센다. */
          sentenceId: sentence.sentenceId,
          ignoreOptions: effectiveSettings,
          verificationOptions:
            mode === "news" && sentence.scoreSourceId
              ? { ...ignorePayload(effectiveSettings), newsSourceId: sentence.scoreSourceId }
              : undefined,
        });
      }
    }

    behaviorTracker.noteSentenceComplete({
      text: sentence.text,
      cpm: isWordMode ? wordMeasuredCpmRef.current : finalMetrics.cpm,
      accuracy: finalMetrics.accuracy,
      typedChars: finalMetrics.typedCount,
      elapsedMs: finalMetrics.elapsedSeconds * 1000,
    });
    void flushSession();
    typingAnalyticsTracker.noteComplete(finalMetrics, passedAccuracy, {
      sentence,
      mode,
      language,
      newsSectors,
    });
    void flushTypingAnalytics();

    completeSentence(passedAccuracy);
    // 단어 모드는 다이얼이 바로 돌아야 흐름이 끊기지 않는다. 문장 모드만 잠깐 쉰다.
    if (isWordMode) {
      moveWord(1);
      focusInput();
    } else {
      window.setTimeout(() => {
        void loadNext(true);
        focusInput();
      }, 180);
    }
  }

  function onChange(value: string) {
    if (soundMode) playKeyboardSound();
    // 필사 입력은 어뷰징 판정 자료가 되지 않는다. 위 finishCurrentSentence 참고.
    if (!isScripture) {
      behaviorTracker.noteInput();
      if (sentence) {
        typingAnalyticsTracker.noteInput(
          value,
          alignInput(targetText, value, effectiveSettings),
          { sentence, mode, language, newsSectors },
        );
      }
    }
    setInput(value);
  }

  const weakWordIndexes = useMemo(
    () => settings.highlightWeakWords && signedIn && !isWordMode && !isScripture
      ? highlightedWordIndexes(targetText, frequentWeakWords)
      : new Set<number>(),
    [frequentWeakWords, isScripture, isWordMode, settings.highlightWeakWords, signedIn, targetText],
  );

  const characterSpans = useMemo(
    () =>
      alignment.cells.map((cell, index) => (
        <span
          key={`char-${index}`}
          data-char-index={index}
          className={[cell.state, weakWordIndexes.has(index) ? "frequent-mistake-word" : null].filter(Boolean).join(" ") || undefined}
        >
          {cell.display}
        </span>
      )),
    [alignment, weakWordIndexes],
  );

  /* 마우스를 올렸을 때 보여줄 모드별 내역. 0인 모드는 빼서 짧게 유지한다. */
  const sessionCountBreakdown =
    [
      { mode: "short" as const, label: t("단문", "Short"), unit: t("문장", "prompts") },
      { mode: "long" as const, label: t("장문", "Long"), unit: t("문장", "prompts") },
      { mode: "news" as const, label: t("뉴스", "News"), unit: t("문장", "prompts") },
      { mode: "word" as const, label: t("단어", "Words"), unit: t("단어", "words") },
    ]
      .filter((item) => sessionCounts[item.mode] > 0)
      .map((item) => `${item.label} ${sessionCounts[item.mode]}${item.unit}`)
      .join("\n") || t("이번 세션 기록이 없습니다", "No activity in this session");

  const displayedCpm = isWordMode ? wordMeasuredCpm : metrics.cpm;
  const displayedWpm = Math.round(displayedCpm / 5);
  const isInputDisabled = isLoading || Boolean(loadError) || !sentence;
  /* 필사 중에는 mode가 news로 남아 있어도 뉴스 화면이 아니다. */
  const isNewsMode = mode === "news" && !isScripture;
  const isNewsTitleMode = isNewsMode && settings.newsTypingTarget === "title";

  /* 문장에 딸린 그림(야광공룡 등). 뉴스 모드는 자기 썸네일이 있으므로 제외한다.
     필사는 사용자가 넣은 글이라 우리 그림을 붙일 근거가 없다. */
  const sentenceImage = isNewsMode || isScripture ? null : imageForSentence(sentence?.text);
  /* 가사의 영상·음원은 뉴스 썸네일 자리에 그대로 들어간다. 그 칸은 이미 16:9이고
     로고와의 정렬이 잡혀 있어서, 따로 자리를 만들면 그 정렬이 어긋난다. */
  const scriptureMedia =
    isScriptureSong && scripture && scripture.media.type !== "none" ? scripture.media : null;
  const showsThumbnail = isNewsMode || Boolean(sentenceImage) || Boolean(scriptureMedia);
  const [mediaControlsHost, setMediaControlsHost] = useState<HTMLDivElement | null>(null);
  const mediaControlsRef = useCallback((node: HTMLDivElement | null) => {
    setMediaControlsHost(node);
  }, []);

  /* 다이얼에 올릴 세 줄. 위가 방금 친 줄, 가운데가 지금 칠 줄, 아래가 다음 줄이다.
     없는 줄(첫 줄의 위, 마지막 줄의 아래)은 칸을 만들지 않는다 — 트랙이 지금 칠
     줄을 가운데로 맞추므로 빈 칸을 넣지 않아도 자리가 흔들리지 않는다. */
  const lineSlots = isScriptureSong
    ? [-1, 0, 1]
        .map((offset) => ({ offset, index: scriptureLine + offset }))
        .filter(({ index }) => index >= 0 && index < scriptureLines.length)
    : [];
  return (
    <TypingLayoutStage>
      <div
        id="typing-tab"
        className="product-tile-light"
        data-typing-mode={mode}
        data-multiline={sentenceLineCount > 1 || undefined}
        data-line-count={sentenceLineCount}
        onClick={focusInput}
      >
      <div className={`logo-news-stage${showsThumbnail ? " has-thumbnail" : ""}${scriptureMedia ? " has-scripture-media" : ""}`}>
        <SiteLogo
          clicked={logoClicked}
          onClick={() => {
            setLogoClicked(true);
            bumpLogoClick();
            window.setTimeout(() => setLogoClicked(false), 120);
          }}
        />

        {/* 뉴스 모드에서 로고와 썸네일을 양끝으로 밀어내는 빈 칸.
            justify-content는 애니메이션되지 않지만 flex-grow는 되기 때문에
            이 방식이라야 전환이 부드럽다. */}
        <span className="logo-stage-spacer" aria-hidden="true" />

        <div className="thumbnail-wrapper" aria-hidden={!showsThumbnail}>
          <div id="thumbnail-container" className="thumbnail-container">
            {/* 가사의 영상·음원. key를 글 id로 둬서 다른 곡으로 옮기면 새로 만들어진다. */}
            {scriptureMedia && scripture ? (
              <ScriptureMediaView
                key={`${scripture.id}-${scripture.updatedAt}`}
                media={scriptureMedia}
                title={scripture.title || t("필사", "Practice")}
                controlsHost={mediaControlsHost}
              />
            ) : sentence?.thumbnailUrl ? (
              <a href={sentence.sourceUrl ?? "#"} target="_blank" rel="noreferrer" onClick={(event) => event.stopPropagation()}>
                {/* eslint-disable-next-line @next/next/no-img-element */}
                <img src={sentence.thumbnailUrl} alt={sentence.title ? `${sentence.title} ${t("썸네일", "thumbnail")}` : t("뉴스 썸네일", "News thumbnail")} />
              </a>
            ) : sentenceImage ? (
              /* 문장에 딸린 그림. 링크가 아니므로 a로 감싸지 않는다. */
              /* eslint-disable-next-line @next/next/no-img-element */
              <img src={sentenceImage.src} alt={sentenceImage.alt} />
            ) : null}
          </div>
        </div>
      </div>

      <div
        ref={mediaControlsRef}
        className="scripture-player-controls-host"
        aria-hidden={!scriptureMedia}
      />

      <div className="sentence-wrapper">
        <span id="milestone-text" className={milestone?.active ? "active" : undefined} aria-live="polite">
          {milestone?.text}
        </span>

        <button
          id="prev-sentence"
          className="side-button icon-btn-circular"
          type="button"
          title={isScripture ? t("이전 줄", "Previous line") : t("이전 문장", "Previous prompt")}
          /* 가사는 곡 안에서만 오간다. 단문·장문은 앞 글로 이어지므로 항상 열려 있다. */
          disabled={isScripture ? isScriptureSong && scriptureLine === 0 : !history.length}
          onClick={(event) => {
            event.stopPropagation();
            goPrevious();
          }}
        >
          <ChevronLeft size={18} />
        </button>

        {/* 문장과 입력창을 한 장의 유리 위에 올린다. 입력창 모드에서는 둘 사이를
            선 하나로만 나누고, 각자 테두리를 갖지 않는다. */}
        <div
          ref={surfaceRef}
          className={`typing-surface${settings.overlayMode ? "" : " is-split"}${isWordMode ? " is-word" : ""}${isScriptureSong ? " is-line-dial" : ""}`}
        >
          {/* key를 문장 id로 두면 문장이 바뀔 때마다 등장 애니메이션이 다시 재생된다.
              옆의 textarea는 형제라 리마운트되지 않아 포커스가 유지된다. */}
          <div
            id="sentence"
            /* 다이얼(단어·가사)은 스스로 움직이므로 통째로 다시 마운트하면
               오히려 깜빡이고, 트랙이 새로 생겨 올라가는 애니메이션도 사라진다.
               문장 모드에서만 등장 애니메이션을 다시 태운다. */
            key={isWordMode ? "word-dial" : isScriptureSong ? "line-dial" : (sentence?.id ?? "empty")}
            /* 그림이 딸린 문장은 테두리가 한 번 반짝인다.
               key가 문장마다 바뀌어 이 요소가 다시 마운트되므로, 클래스만 붙여도
               CSS 애니메이션이 그때마다 처음부터 재생된다. */
            className={sentenceImage ? "has-sentence-image" : undefined}
            style={{ fontSize: `${settings.fontSize}px`, lineHeight: 1.8, cursor: "text" }}
            onClick={focusInput}
          >
            <span className="vscode-live-prefix" aria-hidden="true">const prompt = &quot;</span>
            <span className="terminal-live-prefix" aria-hidden="true">PROMPT&gt; </span>
            {/* 보여줄 문장이 아예 없을 때만 안내를 띄운다.
                다음 문장을 받는 200ms 동안 화면을 비우면 글자가 깜빡인다.
                그동안은 방금 친 문장을 그대로 두고 입력만 막는다
                (isInputDisabled가 isLoading을 이미 본다). */}
            {isLoading && !sentence ? (
              <span className="completed-message">{t("문장을 불러오는 중...", "Loading a prompt...")}</span>
            ) : null}
            {!isLoading && loadError ? <span className="completed-message">{loadError}</span> : null}
            {/* 빈 줄만 있는 글을 고르면 칠 것이 없다. 화면이 비어 멈춘 것처럼
                보이지 않도록 이유를 적어 둔다. */}
            {isScripture && !sentence && !loadError ? (
              <span className="completed-message">
                {scripture && scriptureLines.length === 0
                  ? t("이 글에는 칠 내용이 없습니다", "This text has no content to type")
                  : t("필사할 글을 준비하는 중...", "Preparing your text...")}
              </span>
            ) : null}
            {!loadError && sentence?.title && !isNewsTitleMode ? (
              <div className="news-container">
                <div className="news-text">
                  <div className="news-title">{sentence.title}</div>
                  <hr />
                  <div className="news-body">{characterSpans}</div>
                </div>
              </div>
            ) : null}
            {/* 단어 모드는 다이얼로 그린다. 가운데가 지금 칠 단어,
                왼쪽은 지나간 단어, 오른쪽은 앞으로 칠 단어다. */}
            {!loadError && isWordMode ? (
              <div className="word-dial" aria-label={t("단어 목록", "Word list")}>
                <div className="word-dial-track" ref={dialTrackRef}>
                  {dialSlots(wordQueue, wordIndex).map(({ word, offset }) => (
                    <span
                      /* 큐 안의 절대 위치를 key로 쓴다. offset 기준으로 잡으면 한 칸
                         돌 때마다 7칸이 전부 새 노드가 되어 화면이 깜빡인다. */
                      key={wordIndex + offset}
                      data-slot-key={wordIndex + offset}
                      className={`word-slot${offset === 0 ? " is-current" : offset < 0 ? " is-done" : " is-upcoming"}`}
                      style={{ opacity: 1 - Math.abs(offset) / (DIAL_SIDE + 1.4) }}
                      aria-current={offset === 0 ? "true" : undefined}
                    >
                      {offset === 0 ? (
                        /* 칸의 폭은 원래 단어가 정한다. 조합 중인 글자(ㅎ→하→학)나
                           오타는 폭이 제각각이라, 그대로 두면 칸이 늘었다 줄었다 하며
                           중앙 정렬이 계속 흔들린다. 보이지 않는 원본으로 폭을 잡고
                           실제 글자는 그 위에 얹는다. */
                        <>
                          <span className="word-sizer" aria-hidden="true">
                            {word}
                          </span>
                          <span className="word-typed">{characterSpans}</span>
                        </>
                      ) : (
                        word
                      )}
                    </span>
                  ))}
                </div>
              </div>
            ) : null}
            {/* 가사는 세 줄을 세워 보여준다. 가운데가 지금 칠 줄, 위가 방금 친 줄,
                아래가 다음 줄이다. 줄이 넘어가면 트랙이 위로 올라간다.

                ⚠️ 조건에 sentence를 넣지 않는다. setScriptureLine이 sentence를
                   비우고 다음 틱에 새 줄을 넣으므로, sentence를 보면 그 한 틱 동안
                   다이얼이 사라진다. 그러면 트랙 노드가 새로 생겨 "이전에 가운데
                   있던 줄"의 기준을 잃고 올라가는 애니메이션이 재생되지 않는다. */}
            {!loadError && isScriptureSong && scriptureLines.length > 0 ? (
              <div className="line-dial" aria-label={t("가사 줄", "Lyrics lines")}>
                <div className="line-dial-track" ref={lineTrackRef}>
                  {lineSlots.map(({ offset, index }) => (
                    <span
                      /* 원문 안의 절대 줄 번호를 key로 쓴다. offset을 쓰면 한 줄
                         넘어갈 때마다 세 칸이 전부 새 노드가 되어 깜빡인다. */
                      key={index}
                      data-slot-key={index}
                      className={`line-slot${offset === 0 ? " is-current" : offset < 0 ? " is-done" : " is-upcoming"}`}
                      aria-current={offset === 0 ? "true" : undefined}
                    >
                      {/* 문장이 아직 안 들어온 한 틱 동안은 원문을 그대로 둔다.
                          아무것도 치지 않은 상태의 글자와 모양이 같아 티가 나지 않는다. */}
                      {offset === 0 && sentence ? characterSpans : scriptureLines[index]}
                    </span>
                  ))}
                </div>
              </div>
            ) : null}
            {!loadError && !isWordMode && !isScriptureSong && sentence && (!sentence.title || isNewsTitleMode)
              ? characterSpans
              : null}
            <span className="vscode-live-suffix" aria-hidden="true">&quot;;</span>

            {/* 글자들과 같은 좌표계에 두어야 offsetLeft/Top으로 자리를 잡을 수 있다.
                단어 모드는 다이얼 가운데 칸이 곧 커서 역할을 하므로 두지 않는다. */}
            {!isWordMode ? (
              <span className="virtual-cursor" ref={cursorRef} aria-hidden="true" />
            ) : null}
          </div>

          <div
            ref={inputRevealRef}
            className={`input-reveal${settings.overlayMode ? "" : " is-visible"}`}
          >
            <div className="input-reveal-inner">
              <textarea
            ref={inputRef}
            id="input"
            aria-label={t("타이핑 문장 입력", "Typing input")}
            value={input}
            disabled={isInputDisabled}
            onChange={(event) => onChange(event.target.value)}
            /* 클립보드를 막아도 선택한 글자를 끌어다 놓으면 그대로 들어온다.
               붙여넣기와 똑같은 우회로라 같이 막고 같은 신호로 센다. */
            onDrop={(event) => {
              event.preventDefault();
              if (!isScripture) behaviorTracker.notePasteAttempt();
            }}
            onCompositionStart={() => {
              if (!isScripture) behaviorTracker.noteComposition();
              setIsComposing(true);
            }}
            onCompositionEnd={(event) => {
              setIsComposing(false);
              onChange(event.currentTarget.value);
            }}
            onKeyDown={(event) => {
              const nativeEvent = event.nativeEvent as KeyboardEvent;
              const isImeComposing = isComposing || nativeEvent.isComposing;
              typingAnalyticsTracker.noteKey(
                nativeEvent.code,
                nativeEvent.ctrlKey || nativeEvent.altKey || nativeEvent.metaKey,
              );
              // 실제 키 입력의 리듬을 본다. 값이 주입되면 이 카운터가 오르지 않는다.
              if (!isScripture) {
                behaviorTracker.noteKeystroke();
                if (event.key === "Backspace" || event.key === "Delete") {
                  behaviorTracker.noteBackspace();
                  if (sentence) {
                    typingAnalyticsTracker.noteBackspace({ sentence, mode, language, newsSectors });
                  }
                }
              }
              if (shouldSubmitTypingKey(event.key, canComplete, isImeComposing)) {
                event.preventDefault();
                finishCurrentSentence();
                return;
              }
              if (event.key === "Enter") {
                event.preventDefault();
                return;
              }
              if (event.key === "Escape") {
                if (input) setInput("");
                else goNext();
              }
            }}
            spellCheck={false}
            autoFocus
            // 기본값(rows=2)이면 한 줄짜리 문장에도 두 줄 높이를 차지해 위아래가 어긋난다.
            rows={1}
            // 다 치고 나면 위아래가 같은 글자로 보여야 하므로 문장과 같은 값을 쓴다.
            style={{ fontSize: `${settings.fontSize}px`, lineHeight: 1.8 }}
            className={settings.overlayMode ? "overlay-mode" : "visible-mode"}
                placeholder=""
              />
            </div>
          </div>
        </div>

        <button
          id="skip-sentence"
          className="side-button icon-btn-circular"
          type="button"
          title={isScripture ? t("다음 줄", "Next line") : t("다음 문장", "Next prompt")}
          onClick={(event) => {
            event.stopPropagation();
            goNext();
            focusInput();
          }}
        >
          <ChevronRight size={18} />
        </button>
      </div>

      <div id="news-link" style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }} />

      <div id="progress-bar" style={{ width: `${progress}%` }} />

      <div className="stats">
        <div>
          SPD:{" "}
          <span id="speed">{displayedCpm} CPM</span>
          <span className="speed-wpm"> / {displayedWpm} WPM</span>
        </div>
        <div>
          ACC: <span id="accuracy">{metrics.accuracy}</span>
        </div>
        {/* 필사는 세션 카운트에 들어가지 않으므로(점수 경로 밖) 그 자리에
            지금 몇 번째 줄인지를 보여준다. 진행도가 CNT보다 쓸모 있다.
            단문·장문은 글을 이어서 치므로 몇 번째 글인지도 함께 알려준다. */}
        {isScripture ? (
          <div
            title={
              [
                scripture?.title || t("필사", "Practice"),
                !isScriptureSong && scriptureItems.length > 1
                  ? (isEnglish ? `Text ${scriptureIndex + 1} / ${scriptureItems.length}` : `${scriptureIndex + 1} / ${scriptureItems.length}번째 글`)
                  : null,
              ]
                .filter(Boolean)
                .join("\n")
            }
          >
            LINE:{" "}
            <span id="count">
              {scriptureLines.length ? scriptureLine + 1 : 0} / {scriptureLines.length}
            </span>
            <span className="stats-unit">{t("줄", "line")}</span>
          </div>
        ) : (
          /* 모드별로 따로 센다. 단문 44타와 장문 205타를 한 숫자로 합치면
             CNT가 무엇을 뜻하는지 알 수 없다. 지금 모드의 값을 보여주고
             나머지는 마우스를 올렸을 때 보인다. */
          <div title={sessionCountBreakdown}>
            CNT: <span id="count">{sessionCounts[mode]}</span>
            <span className="stats-unit">{isWordMode ? t("단어", "word") : t("문장", "prompt")}</span>
          </div>
        )}
      </div>

      <div className="record-box" id="last-record">
        <div>
          <span id="record-sentence">
            {lastRecord ? `${t("직전", "Last")}: ${lastRecord.sentence}${lastRecord.sentence.length >= 40 ? "..." : ""}` : ""}
          </span>
        </div>
        <div>
          <span id="record-cpm">{lastRecord ? `${lastRecord.cpm} CPM` : ""}</span>
        </div>
        <div>
          <span id="record-accuracy">{lastRecord ? `ACC ${lastRecord.accuracy}%` : ""}</span>
        </div>
      </div>
      </div>
    </TypingLayoutStage>
  );
}
