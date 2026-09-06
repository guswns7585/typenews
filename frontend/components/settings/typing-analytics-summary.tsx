"use client";

import { Flame, Gauge, Keyboard, Target, TrendingDown, TrendingUp } from "lucide-react";
import { useEffect, useMemo, useState } from "react";
import { getSupabaseClient } from "@/lib/supabase/client";
import { useUiLanguage } from "@/lib/ui-language";

type Summary = { typedChars: number; avgCpm: number; avgAccuracy: number; completions: number; activeDays: number; mistakes: number; streak: number; longPauses: number; newsCompleted: number };
type Comparison = { typedChars: number | null; completions: number | null; avgCpm: number | null; avgAccuracy: number | null };
type Daily = { day: string; typedChars: number; completions: number; avgCpm: number; avgAccuracy: number };
type Mode = { language: string; mode: string; completions: number; typedChars: number; avgCpm: number; avgAccuracy: number };
type Weakness = { sentence_id: number; sentence_text: string; char_index: number; target_character: string; mistake_count: number; correction_count: number };
type KeyUsage = { recent: Record<string, number>; total: Record<string, number> };

const KEY_ROWS = [
  ["Backquote", "Digit1", "Digit2", "Digit3", "Digit4", "Digit5", "Digit6", "Digit7", "Digit8", "Digit9", "Digit0", "Minus", "Equal", "Backspace"],
  ["Tab", "KeyQ", "KeyW", "KeyE", "KeyR", "KeyT", "KeyY", "KeyU", "KeyI", "KeyO", "KeyP", "BracketLeft", "BracketRight", "Backslash"],
  ["CapsLock", "KeyA", "KeyS", "KeyD", "KeyF", "KeyG", "KeyH", "KeyJ", "KeyK", "KeyL", "Semicolon", "Quote", "Enter"],
  ["ShiftLeft", "KeyZ", "KeyX", "KeyC", "KeyV", "KeyB", "KeyN", "KeyM", "Comma", "Period", "Slash", "ShiftRight"],
  ["Space"],
] as const;

const KEY_LABELS: Record<string, string> = {
  Backquote: "`", Minus: "-", Equal: "=", Backspace: "Backspace", BracketLeft: "[",
  BracketRight: "]", Backslash: "\\", Semicolon: ";", Quote: "'", Comma: ",",
  Period: ".", Slash: "/", ShiftLeft: "Shift", ShiftRight: "Shift", Space: "Space",
  Tab: "Tab", CapsLock: "Caps", Enter: "Enter",
};

function keyLabel(code: string) { return KEY_LABELS[code] ?? code.replace(/^Key/, "").replace(/^Digit/, ""); }
function compact(value: number) { return new Intl.NumberFormat(undefined, { notation: "compact", maximumFractionDigits: 1 }).format(value); }

function KeyboardHeatmap({ counts }: { counts: Record<string, number> }) {
  const { t } = useUiLanguage();
  const values = Object.values(counts);
  const total = values.reduce((sum, value) => sum + value, 0);
  const max = Math.max(1, ...values);
  return (
    <div className="key-heatmap" aria-label={t("키별 사용량", "Key usage heatmap")}>
      {KEY_ROWS.map((row, rowIndex) => (
        <div className="key-heatmap-row" key={rowIndex}>
          {row.map((code) => {
            const count = counts[code] ?? 0;
            const ratio = total ? count / total * 100 : 0;
            const heat = count ? 0.14 + Math.sqrt(count / max) * 0.86 : 0;
            return (
              <span key={code} className={`key-heatmap-key is-${code.toLowerCase()}`} style={{ "--key-heat": `${Math.round(heat * 82)}%` } as React.CSSProperties} title={`${keyLabel(code)} · ${count.toLocaleString()} · ${ratio.toFixed(1)}%`}>
                <b>{keyLabel(code)}</b>
                {count > 0 ? (
                  <small>
                    <strong>{compact(count)}{t("회", "x")}</strong>
                    <em>{ratio >= 0.1 ? `${ratio.toFixed(1)}%` : "<0.1%"}</em>
                  </small>
                ) : null}
              </span>
            );
          })}
        </div>
      ))}
      <div className="key-heatmap-legend"><span>{t("적게", "Less")}</span><i /><i /><i /><i /><span>{t("많이", "More")}</span><strong>{t("총 입력", "Total")} {compact(total)}</strong></div>
    </div>
  );
}

export function TypingAnalyticsSummary({ signedIn }: { signedIn: boolean }) {
  const { t } = useUiLanguage();
  const [summary, setSummary] = useState<Summary | null>(null);
  const [comparison, setComparison] = useState<Comparison | null>(null);
  const [daily, setDaily] = useState<Daily[]>([]);
  const [modes, setModes] = useState<Mode[]>([]);
  const [weaknesses, setWeaknesses] = useState<Weakness[]>([]);
  const [keyUsage, setKeyUsage] = useState<KeyUsage>({ recent: {}, total: {} });
  const [keyRange, setKeyRange] = useState<"recent" | "total">("recent");
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    if (!signedIn) return;
    const supabase = getSupabaseClient();
    if (!supabase) return;
    let active = true;
    void Promise.all([
      supabase.rpc("get_my_typing_analytics", { p_days: 30 }),
      supabase.rpc("get_my_typing_weaknesses", { p_limit: 12 }),
      supabase.rpc("get_my_key_usage", { p_days: 30 }),
    ]).then(([analyticsResult, weaknessResult, keyResult]) => {
      if (!active) return;
      if (!analyticsResult.error) {
        const payload = analyticsResult.data as { summary?: Summary; comparison?: Comparison; daily?: Daily[]; modes?: Mode[] } | null;
        setSummary(payload?.summary ?? null); setComparison(payload?.comparison ?? null); setDaily(payload?.daily ?? []); setModes(payload?.modes ?? []);
      }
      if (!weaknessResult.error) setWeaknesses((weaknessResult.data ?? []) as Weakness[]);
      if (!keyResult.error && keyResult.data) setKeyUsage(keyResult.data as KeyUsage);
      setLoading(false);
    });
    return () => { active = false; };
  }, [signedIn]);

  const recentDaily = daily.slice(-14);
  const maxChars = Math.max(1, ...recentDaily.map((item) => item.typedChars));
  const totalModeChars = modes.reduce((sum, item) => sum + item.typedChars, 0);
  const correction = weaknesses.reduce((acc, item) => ({ mistakes: acc.mistakes + item.mistake_count, corrections: acc.corrections + item.correction_count }), { mistakes: 0, corrections: 0 });
  const correctionRate = correction.mistakes ? Math.round(correction.corrections / correction.mistakes * 100) : null;
  const insight = useMemo(() => {
    if (!summary || summary.completions === 0) return t("타이핑 기록이 쌓이면 나만의 분석이 시작됩니다.", "Your personal analysis will appear as you type.");
    if ((comparison?.avgCpm ?? 0) > 0 && (comparison?.avgAccuracy ?? 0) >= 0) return t("정확도를 지키면서 속도가 함께 좋아지고 있습니다. 지금의 리듬을 유지해 보세요.", "Your speed is improving without sacrificing accuracy. Keep this rhythm going.");
    if (summary.avgAccuracy >= 97) return t("정확도가 안정적입니다. 자주 막힌 글자만 짧게 반복하면 속도를 더 끌어올릴 수 있습니다.", "Your accuracy is stable. Short drills on troublesome keys can unlock more speed.");
    if (correctionRate !== null && correctionRate >= 75) return t("오타를 대부분 바로 교정하고 있습니다. 반복되는 구간을 먼저 익히면 흐름이 더 매끄러워집니다.", "You correct most mistakes quickly. Practicing repeated trouble spots will make your flow smoother.");
    return t("속도보다 정확도를 조금 먼저 챙겨 보세요. 반복 오타가 줄면 CPM은 자연스럽게 따라옵니다.", "Prioritize accuracy for now. CPM will follow as repeated mistakes decrease.");
  }, [comparison, correctionRate, summary, t]);

  const modeLabel = (item: Mode) => {
    const labels: Record<string, [string, string]> = { short: ["단문", "Short"], long: ["장문", "Long"], word: ["단어", "Words"], news: ["뉴스", "News"] };
    const label = labels[item.mode] ?? [item.mode, item.mode];
    return `${item.language === "kor" ? t("한국어", "Korean") : "English"} · ${t(label[0], label[1])}`;
  };
  const change = (value: number | null | undefined, suffix = "%") => {
    if (value === null || value === undefined) return <small>--</small>;
    const positive = value >= 0;
    return <small className={positive ? "is-positive" : "is-negative"}>{positive ? <TrendingUp size={11} /> : <TrendingDown size={11} />}{positive ? "+" : ""}{value}{suffix}</small>;
  };

  if (!signedIn) return <div className="analytics-empty"><Keyboard size={24} /><p>{t("로그인하면 타이핑 습관과 성장 기록을 확인할 수 있습니다.", "Sign in to see your typing habits and progress.")}</p></div>;
  if (loading) return <div className="analytics-empty"><span className="analytics-loader" /><p>{t("기록을 불러오는 중입니다.", "Loading your activity.")}</p></div>;

  return (
    <div className="typing-analytics-summary">
      <section className="analytics-overview">
        <div className="typing-analytics-grid">
          <div><Keyboard size={16} /><span>{t("최근 30일 타건", "30-day keystrokes")}</span><strong>{compact(summary?.typedChars ?? 0)}</strong></div>
          <div><Gauge size={16} /><span>{t("평균 CPM", "Average CPM")}</span><strong>{summary?.avgCpm ?? 0}</strong></div>
          <div><Target size={16} /><span>{t("평균 정확도", "Accuracy")}</span><strong>{summary?.avgAccuracy ?? 0}%</strong></div>
          <div><Flame size={16} /><span>{t("연속 이용일", "Current streak")}</span><strong>{summary?.streak ?? 0}{t("일", "d")}</strong></div>
        </div>
        <p className="analytics-insight">{insight}</p>
        <div className="typing-analytics-comparison"><span>{t("이전 30일 대비", "Versus previous 30 days")}</span><div>{t("타건", "Keys")}{change(comparison?.typedChars)}</div><div>CPM{change(comparison?.avgCpm, "")}</div><div>{t("정확도", "Accuracy")}{change(comparison?.avgAccuracy, t("%p", "pt"))}</div></div>
      </section>

      <section className="analytics-card analytics-activity-card">
        <header><div><strong>{t("활동 추이", "Activity")}</strong><small>{t("최근 14일 타건량", "Keystrokes over the last 14 days")}</small></div></header>
        <div className="typing-activity-chart">{recentDaily.map((item) => <span key={item.day} title={`${item.day} · ${compact(item.typedChars)}`}><i style={{ height: `${Math.max(4, item.typedChars / maxChars * 100)}%` }} /></span>)}</div>
      </section>

      <section className="analytics-card analytics-mode-card">
        <header><div><strong>{t("언어와 모드", "Language and modes")}</strong><small>{t("최근 30일 사용 비율", "Share of the last 30 days")}</small></div></header>
        <div className="typing-mode-summary">{modes.slice(0, 8).map((item) => { const ratio = totalModeChars ? item.typedChars / totalModeChars * 100 : 0; return <div key={`${item.language}-${item.mode}`}><span>{modeLabel(item)}</span><i><b style={{ width: `${ratio}%` }} /></i><small>{ratio.toFixed(1)}%</small><em>{compact(item.typedChars)}</em></div>; })}</div>
      </section>

      <section className="analytics-card analytics-weakness-card">
        <header><div><strong>{t("반복 오타", "Repeated mistakes")}</strong><small>{t("자주 틀리는 글자와 문장 구간", "Frequent characters and sentence positions")}</small></div><b>{t("교정률", "Correction")} {correctionRate ?? 0}%</b></header>
        {weaknesses.length ? <div className="typing-weakness-list">{weaknesses.slice(0, 8).map((item) => <div key={`${item.sentence_id}-${item.char_index}`}><mark>{item.target_character || "␠"}</mark><span>{item.sentence_text}</span><small>{item.mistake_count}{t("회", "x")}</small></div>)}</div> : <p className="analytics-muted">{t("아직 반복해서 나타난 오타가 없습니다.", "No repeated mistakes yet.")}</p>}
      </section>

      <section className="analytics-card analytics-key-card">
        <header><div><strong>{t("키보드 사용량", "Keyboard usage")}</strong><small>{t("타이핑 영역에서 집계된 물리 키 비율", "Physical key share recorded only in the typing area")}</small></div><div className="analytics-range-tabs"><button type="button" data-selected={keyRange === "recent"} onClick={() => setKeyRange("recent")}>{t("최근 30일", "30 days")}</button><button type="button" data-selected={keyRange === "total"} onClick={() => setKeyRange("total")}>{t("전체 누적", "Lifetime")}</button></div></header>
        <KeyboardHeatmap counts={keyUsage[keyRange] ?? {}} />
        {!Object.keys(keyUsage[keyRange] ?? {}).length ? <p className="analytics-muted">{t("새 버전에서 타이핑하면 키 사용량이 표시됩니다.", "Key usage will appear after typing with the new version.")}</p> : null}
      </section>
    </div>
  );
}
