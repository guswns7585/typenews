import { getSupabaseClient } from "@/lib/supabase/client";
import { behaviorTracker } from "./behavior-tracker";

/** 이 문장 수마다 한 번 올린다. */
const SENTENCE_FLUSH_STEP = 10;
/** 문장이 적어도 이 간격이면 올린다. */
const TIME_FLUSH_INTERVAL_MS = 60_000;

let lastFlushAt = 0;
let lastFlushedSentenceCount = 0;
let inFlight = false;
let trackedUserId: string | null | undefined;
let reporterGeneration = 0;

function resetReporterSession() {
  reporterGeneration += 1;
  behaviorTracker.resetSession();
  lastFlushAt = 0;
  lastFlushedSentenceCount = 0;
}

function syncTrackedUser(userId: string | null) {
  if (trackedUserId !== undefined && trackedUserId !== userId) resetReporterSession();
  trackedUserId = userId;
}

/**
 * 세션 집계를 서버로 올린다.
 *
 * 누적 스냅샷을 통째로 보내고 서버가 덮어쓰기 때문에, 전송이 실패하거나
 * 중복되어도 집계가 어긋나지 않는다. 그래서 재시도 로직을 두지 않는다.
 */
export async function flushSession(force = false) {
  if (inFlight) return;

  const sentenceCount = behaviorTracker.sentenceCount;
  if (sentenceCount === 0 || sentenceCount === lastFlushedSentenceCount) return;

  const now = Date.now();
  const bySentence = sentenceCount - lastFlushedSentenceCount >= SENTENCE_FLUSH_STEP;
  const byTime = now - lastFlushAt >= TIME_FLUSH_INTERVAL_MS;
  if (!force && !bySentence && !byTime) return;

  const supabase = getSupabaseClient();
  if (!supabase) return;

  const generation = reporterGeneration;
  inFlight = true;
  try {
    // 비로그인 사용자는 점수가 쌓이지 않으므로 탐지 대상이 아니다.
    const { data } = await supabase.auth.getSession();
    if (!data.session) return;

    const { sessionKey, startedAt, metrics } = behaviorTracker.snapshot();
    if (!sessionKey) return;

    const { error } = await supabase.rpc("report_typing_session", {
      p_session_key: sessionKey,
      p_started_at: startedAt,
      p_metrics: metrics,
    });
    if (error) {
      console.error("세션 집계 전송 실패", error);
      return;
    }

    if (generation === reporterGeneration) {
      lastFlushAt = now;
      lastFlushedSentenceCount = sentenceCount;
    }
  } catch {
    // 탐지용 텔레메트리가 타이핑을 방해해서는 안 된다. 다음 주기에 다시 올라간다.
  } finally {
    inFlight = false;
  }
}

/**
 * 창 상태 변화를 추적하고, 탭을 떠날 때 마지막으로 한 번 올린다.
 * 정리 함수를 돌려주므로 컴포넌트 언마운트 시 호출한다.
 */
export function registerIntegrityHandlers() {
  if (typeof window === "undefined") return () => {};

  behaviorTracker.ensureSession();
  behaviorTracker.noteWindowFocus(document.hasFocus());
  const supabase = getSupabaseClient();
  void supabase?.auth.getSession().then(({ data }) => {
    syncTrackedUser(data.session?.user.id ?? null);
  });
  const authSubscription = supabase?.auth.onAuthStateChange((_event, session) => {
    syncTrackedUser(session?.user.id ?? null);
  });

  const onFocus = () => behaviorTracker.noteWindowFocus(true);
  const onBlur = () => behaviorTracker.noteWindowFocus(false);
  const onVisibility = () => {
    const hidden = document.visibilityState === "hidden";
    behaviorTracker.noteWindowFocus(!hidden);
    // pagehide보다 먼저 오고 전송이 완료될 여지가 있어 여기서 마지막 flush를 건다.
    if (hidden) void flushSession(true);
  };

  window.addEventListener("focus", onFocus);
  window.addEventListener("blur", onBlur);
  document.addEventListener("visibilitychange", onVisibility);

  const timer = window.setInterval(() => void flushSession(), TIME_FLUSH_INTERVAL_MS);

  return () => {
    window.removeEventListener("focus", onFocus);
    window.removeEventListener("blur", onBlur);
    document.removeEventListener("visibilitychange", onVisibility);
    window.clearInterval(timer);
    authSubscription?.data.subscription.unsubscribe();
  };
}
