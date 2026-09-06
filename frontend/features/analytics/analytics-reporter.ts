import { getSupabaseClient } from "@/lib/supabase/client";
import { typingAnalyticsTracker } from "./typing-analytics-tracker";

const FLUSH_INTERVAL_MS = 60_000;
const COMPLETION_STEP = 10;

let lastFlushAt = 0;
let lastFlushedRevision = 0;
let lastFlushedCompletions = 0;
let inFlight = false;
let trackedUserId: string | null | undefined;
let reporterGeneration = 0;

function resetReporterSession() {
  reporterGeneration += 1;
  typingAnalyticsTracker.resetSession();
  lastFlushAt = 0;
  lastFlushedRevision = 0;
  lastFlushedCompletions = 0;
}

function syncTrackedUser(userId: string | null) {
  if (trackedUserId !== undefined && trackedUserId !== userId) resetReporterSession();
  trackedUserId = userId;
}

export async function flushTypingAnalytics(force = false) {
  if (inFlight) return;
  const snapshot = typingAnalyticsTracker.snapshot();
  if (!snapshot.buckets.length || snapshot.revision === lastFlushedRevision) return;

  const completions = snapshot.buckets.reduce((sum, bucket) => sum + bucket.completions, 0);
  const now = Date.now();
  if (
    !force &&
    completions - lastFlushedCompletions < COMPLETION_STEP &&
    now - lastFlushAt < FLUSH_INTERVAL_MS
  ) return;

  const supabase = getSupabaseClient();
  if (!supabase) return;
  const generation = reporterGeneration;
  inFlight = true;
  try {
    const { data } = await supabase.auth.getSession();
    if (!data.session) return;
    const payload = {
      p_session_key: snapshot.sessionKey,
      p_buckets: snapshot.buckets,
      p_weaknesses: snapshot.weaknesses,
      p_key_usage: snapshot.keyUsage,
    };
    let { error } = await supabase.rpc("report_typing_analytics_v2", payload);
    // SQL 배포 전에도 기존 분석 수집은 멈추지 않는다.
    if (error && /report_typing_analytics_v2|schema cache/i.test(error.message)) {
      ({ error } = await supabase.rpc("report_typing_analytics", {
        p_session_key: snapshot.sessionKey,
        p_buckets: snapshot.buckets,
        p_weaknesses: snapshot.weaknesses,
      }));
    }
    if (error) {
      console.error("타이핑 분석 전송 실패", error);
      return;
    }
    if (generation === reporterGeneration) {
      lastFlushAt = now;
      lastFlushedRevision = snapshot.revision;
      lastFlushedCompletions = completions;
    }
  } catch {
    // 분석 전송은 타이핑 UX와 점수 적립을 절대 막지 않는다.
  } finally {
    inFlight = false;
  }
}

export function registerTypingAnalyticsHandlers() {
  if (typeof window === "undefined") return () => {};
  typingAnalyticsTracker.ensureSession();
  const supabase = getSupabaseClient();
  void supabase?.auth.getSession().then(({ data }) => {
    syncTrackedUser(data.session?.user.id ?? null);
  });
  const authSubscription = supabase?.auth.onAuthStateChange((_event, session) => {
    syncTrackedUser(session?.user.id ?? null);
  });

  const onOnline = () => void flushTypingAnalytics(true);
  const onVisibility = () => {
    if (document.visibilityState === "hidden") void flushTypingAnalytics(true);
  };
  const timer = window.setInterval(() => void flushTypingAnalytics(), FLUSH_INTERVAL_MS);
  window.addEventListener("online", onOnline);
  document.addEventListener("visibilitychange", onVisibility);
  return () => {
    window.clearInterval(timer);
    window.removeEventListener("online", onOnline);
    document.removeEventListener("visibilitychange", onVisibility);
    authSubscription?.data.subscription.unsubscribe();
    void flushTypingAnalytics(true);
  };
}
