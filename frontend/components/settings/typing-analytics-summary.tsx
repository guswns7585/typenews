"use client";

import { Archive, ArchiveRestore, Flame, Gauge, Keyboard, Pencil, Plus, RotateCcw, Target, TrendingDown, TrendingUp, X } from "lucide-react";
import { useEffect, useMemo, useState } from "react";
import { flushTypingAnalytics, switchTypingPracticeProfile } from "@/features/analytics/analytics-reporter";
import {
  ensureActivePracticeProfile,
  loadPracticeProfiles,
  setActivePracticeProfile,
  subscribePracticeProfile,
  type TypingPracticeProfile,
} from "@/features/analytics/practice-profile";
import { getSupabaseClient } from "@/lib/supabase/client";
import { useUiLanguage } from "@/lib/ui-language";

type Summary = { typedChars: number; avgCpm: number; avgAccuracy: number; completions: number; activeDays: number; mistakes: number; streak: number; longPauses: number; newsCompleted: number };
type Comparison = { typedChars: number | null; completions: number | null; avgCpm: number | null; avgAccuracy: number | null };
type Daily = { day: string; typedChars: number; completions: number; avgCpm: number; avgAccuracy: number };
type Mode = { language: string; mode: string; completions: number; typedChars: number; avgCpm: number; avgAccuracy: number };
type Weakness = { sentence_id: number; sentence_text: string; char_index: number; target_character: string; mistake_count: number; correction_count: number };
type KeyUsage = { recent: Record<string, number>; total: Record<string, number> };
type SpeedPosition = { avg_cpm: number; speed_rank: number; participant_count: number; top_percent: number; completions: number };

const PRACTICE_PROFILE_LIMIT = 20;

function isPracticeProfileUnavailable(error: unknown) {
  return typeof error === "object" && error !== null && "code" in error
    && (error.code === "PGRST202" || error.code === "42883");
}

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
  const [speedPosition, setSpeedPosition] = useState<SpeedPosition | null>(null);
  const [keyRange, setKeyRange] = useState<"recent" | "total">("recent");
  const [loading, setLoading] = useState(true);
  const [profiles, setProfiles] = useState<TypingPracticeProfile[]>([]);
  const [activeProfile, setActiveProfile] = useState<TypingPracticeProfile | null>(null);
  const [profileManagerOpen, setProfileManagerOpen] = useState(false);
  const [newProfileName, setNewProfileName] = useState("");
  const [profileBusy, setProfileBusy] = useState(false);
  const [profileStatus, setProfileStatus] = useState("");
  const [profileLoadError, setProfileLoadError] = useState<"setup" | "load" | null>(null);
  const [profileReload, setProfileReload] = useState(0);

  function profileWriteError(error: { code?: string; message: string }, fallback: string) {
    if (isPracticeProfileUnavailable(error)) return t("연습 프로필 DB 설정이 아직 적용되지 않았습니다.", "Practice profiles have not been set up in the database yet.");
    if (error.code === "23505") return t("이미 사용 중인 프로필 이름입니다.", "This profile name is already in use.");
    if (error.message === "practice profile limit reached") return t("활성 프로필 한도에 도달했습니다. 기존 프로필을 보관한 뒤 다시 시도해 주세요.", "You reached the active profile limit. Archive a profile and try again.");
    if (error.message === "authentication required" || error.code === "42501") return t("로그인 상태를 확인한 뒤 다시 시도해 주세요.", "Check that you are signed in and try again.");
    return fallback;
  }

  async function refreshProfiles(preferredId?: string) {
    const nextProfiles = await loadPracticeProfiles();
    setProfiles(nextProfiles);
    const cached = await ensureActivePracticeProfile();
    const selected = nextProfiles.find((profile) => profile.id === preferredId && !profile.archived)
      ?? nextProfiles.find((profile) => profile.id === activeProfile?.id && !profile.archived)
      ?? nextProfiles.find((profile) => profile.id === cached?.id && !profile.archived)
      ?? nextProfiles.find((profile) => profile.is_default && !profile.archived)
      ?? null;
    if (selected) {
      setActivePracticeProfile(selected);
      setActiveProfile(selected);
    }
    return nextProfiles;
  }

  useEffect(() => {
    if (!signedIn) return;
    let active = true;
    void ensureActivePracticeProfile().then(async (selected) => {
      try {
        const nextProfiles = await loadPracticeProfiles();
        if (!active) return;
        setProfiles(nextProfiles);
        setProfileLoadError(nextProfiles.length ? null : "load");
        const resolved = nextProfiles.find((profile) => profile.id === selected?.id) ?? selected;
        setActiveProfile(resolved);
      } catch (error) {
        if (active) {
          setActiveProfile(null);
          setProfiles([]);
          setProfileLoadError(isPracticeProfileUnavailable(error) ? "setup" : "load");
        }
      }
    });
    const unsubscribe = subscribePracticeProfile((profile) => { if (active) setActiveProfile(profile); });
    return () => { active = false; unsubscribe(); };
  }, [signedIn, profileReload]);

  useEffect(() => {
    if (!signedIn) return;
    const supabase = getSupabaseClient();
    if (!supabase) return;
    let active = true;
    const profileArgs = activeProfile ? { p_practice_profile_id: activeProfile.id, p_generation: activeProfile.generation } : null;
    void Promise.all([
      profileArgs ? supabase.rpc("get_my_practice_typing_analytics", { ...profileArgs, p_days: 30 }) : supabase.rpc("get_my_typing_analytics", { p_days: 30 }),
      profileArgs ? supabase.rpc("get_my_practice_weaknesses", { ...profileArgs, p_limit: 12 }) : supabase.rpc("get_my_typing_weaknesses", { p_limit: 12 }),
      profileArgs ? supabase.rpc("get_my_practice_key_usage", { ...profileArgs, p_days: 30 }) : supabase.rpc("get_my_key_usage", { p_days: 30 }),
      supabase.rpc("get_my_typing_speed_position", { p_days: 30, p_min_completions: 20 }),
    ]).then(([analyticsResult, weaknessResult, keyResult, speedResult]) => {
      if (!active) return;
      if (!analyticsResult.error) {
        const payload = analyticsResult.data as { summary?: Summary; comparison?: Comparison; daily?: Daily[]; modes?: Mode[] } | null;
        setSummary(payload?.summary ?? null); setComparison(payload?.comparison ?? null); setDaily(payload?.daily ?? []); setModes(payload?.modes ?? []);
      }
      if (!weaknessResult.error) setWeaknesses((weaknessResult.data ?? []) as Weakness[]);
      if (!keyResult.error && keyResult.data) setKeyUsage(keyResult.data as KeyUsage);
      if (!speedResult.error) setSpeedPosition(((speedResult.data ?? []) as SpeedPosition[])[0] ?? null);
      setLoading(false);
    });
    return () => { active = false; };
  }, [activeProfile, signedIn]);

  async function chooseProfile(profileId: string) {
    const profile = profiles.find((item) => item.id === profileId);
    if (!profile || profile.id === activeProfile?.id) return;
    setProfileBusy(true); setProfileStatus("");
    try { await switchTypingPracticeProfile(profile); setActiveProfile(profile); }
    catch { setProfileStatus(t("프로필을 바꾸지 못했습니다.", "Could not switch profile.")); }
    finally { setProfileBusy(false); }
  }

  async function createProfile() {
    const name = newProfileName.trim();
    const supabase = getSupabaseClient();
    if (!supabase || !name) return;
    setProfileBusy(true); setProfileStatus("");
    let createdOnServer = false;
    try {
      const { data, error } = await supabase.rpc("create_my_typing_practice_profile", { p_name: name });
      if (error) {
        setProfileStatus(profileWriteError(error, t("프로필을 만들지 못했습니다. 잠시 후 다시 시도해 주세요.", "Could not create the profile. Try again shortly.")));
        return;
      }
      createdOnServer = true;
      setNewProfileName("");
      const next = await loadPracticeProfiles();
      setProfiles(next);
      const created = next.find((profile) => profile.id === String(data));
      if (!created) throw new Error("Created profile missing from list");
      await switchTypingPracticeProfile(created);
      setActiveProfile(created);
    } catch {
      setProfileStatus(createdOnServer
        ? t("프로필은 만들어졌습니다. 통계 창을 다시 열어 선택해 주세요.", "Your profile was created. Reopen analytics to select it.")
        : t("프로필을 만들지 못했습니다. 잠시 후 다시 시도해 주세요.", "Could not create the profile. Try again shortly."));
    } finally {
      setProfileBusy(false);
    }
  }

  async function renameProfile(profile: TypingPracticeProfile) {
    const name = window.prompt(t("새 프로필 이름", "New profile name"), profile.name)?.trim();
    if (!name || name === profile.name) return;
    const supabase = getSupabaseClient(); if (!supabase) return;
    setProfileBusy(true); setProfileStatus("");
    const { error } = await supabase.rpc("rename_my_typing_practice_profile", { p_profile_id: profile.id, p_name: name });
    if (error) setProfileStatus(t("이름을 바꾸지 못했습니다.", "Could not rename the profile."));
    else await refreshProfiles();
    setProfileBusy(false);
  }

  async function resetProfile(profile: TypingPracticeProfile) {
    if (!window.confirm(t(`'${profile.name}' 통계를 새로 시작할까요? 이전 기록은 보관됩니다.`, `Start fresh statistics for '${profile.name}'? Previous records will be kept.`))) return;
    const supabase = getSupabaseClient(); if (!supabase) return;
    setProfileBusy(true); setProfileStatus("");
    await flushTypingAnalytics(true);
    const { data, error } = await supabase.rpc("reset_my_typing_practice_profile", { p_profile_id: profile.id });
    if (error) setProfileStatus(t("통계를 초기화하지 못했습니다.", "Could not reset the statistics."));
    else {
      const reset = { ...profile, generation: Number(data) };
      await switchTypingPracticeProfile(reset);
      await refreshProfiles(profile.id);
      setProfileStatus(t("새 기록을 시작했습니다. 이전 통계는 삭제되지 않았습니다.", "A new record has started. Previous statistics were not deleted."));
    }
    setProfileBusy(false);
  }

  async function archiveProfile(profile: TypingPracticeProfile) {
    if (profile.is_default || !window.confirm(t(`'${profile.name}' 프로필을 보관할까요?`, `Archive '${profile.name}'?`))) return;
    const supabase = getSupabaseClient(); if (!supabase) return;
    setProfileBusy(true); setProfileStatus("");
    await flushTypingAnalytics(true);
    const { error } = await supabase.rpc("archive_my_typing_practice_profile", { p_profile_id: profile.id });
    if (error) setProfileStatus(t("프로필을 보관하지 못했습니다.", "Could not archive the profile."));
    else {
      const next = await refreshProfiles();
      if (activeProfile?.id === profile.id) {
        const fallback = next.find((item) => item.is_default && !item.archived);
        if (fallback) await switchTypingPracticeProfile(fallback);
      }
    }
    setProfileBusy(false);
  }

  async function restoreProfile(profile: TypingPracticeProfile) {
    const supabase = getSupabaseClient(); if (!supabase) return;
    setProfileBusy(true); setProfileStatus("");
    try {
      const { error } = await supabase.rpc("restore_my_typing_practice_profile", { p_profile_id: profile.id });
      if (error) setProfileStatus(profileWriteError(error, t("프로필을 복원하지 못했습니다.", "Could not restore the profile.")));
      else await refreshProfiles();
    } catch {
      setProfileStatus(t("프로필 목록을 갱신하지 못했습니다. 통계 창을 다시 열어 주세요.", "Could not refresh profiles. Reopen analytics."));
    } finally {
      setProfileBusy(false);
    }
  }

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
      <section className="practice-profile-panel">
        <div className="practice-profile-current">
          <div><span>{t("연습 프로필", "Practice profile")}</span><strong>{activeProfile?.name ?? t("기본", "Default")}</strong></div>
          <select aria-label={t("연습 프로필 선택", "Choose practice profile")} disabled={profileBusy || !profiles.length} value={activeProfile?.id ?? ""} onChange={(event) => void chooseProfile(event.target.value)}>
            {profiles.filter((profile) => !profile.archived).map((profile) => <option key={profile.id} value={profile.id}>{profile.name}</option>)}
          </select>
          <button type="button" disabled={!profiles.length} onClick={() => setProfileManagerOpen((open) => !open)}>{profileManagerOpen ? <X size={14} /> : <Pencil size={14} />}{t(profileManagerOpen ? "닫기" : "관리", profileManagerOpen ? "Close" : "Manage")}</button>
        </div>
        {profileLoadError ? <p role="status">
          {profileLoadError === "setup"
            ? t("연습 프로필 DB 설정이 아직 적용되지 않았습니다. 현재는 계정 전체 통계를 표시합니다.", "Practice profiles are not set up yet. Showing account-wide analytics.")
            : t("연습 프로필 목록을 불러오지 못했습니다.", "Could not load practice profiles.")}
          {" "}<button type="button" onClick={() => setProfileReload((value) => value + 1)}>{t("다시 확인", "Retry")}</button>
        </p> : <p>{t("이 프로필에서 친 기록만 개인 통계에 표시됩니다. 점수와 랭킹은 계정 전체로 합산됩니다.", "Only activity from this profile appears here. Scores and ranking remain account-wide.")}</p>}
        {profileManagerOpen && profiles.length > 0 ? <div className="practice-profile-manager">
          <form onSubmit={(event) => { event.preventDefault(); void createProfile(); }}><input value={newProfileName} maxLength={20} onChange={(event) => setNewProfileName(event.target.value)} placeholder={t("예: 세벌식", "e.g. Dvorak")} /><button type="submit" disabled={profileBusy || !newProfileName.trim() || profiles.filter((profile) => !profile.archived).length >= PRACTICE_PROFILE_LIMIT}><Plus size={14} />{t("추가", "Add")}</button></form>
          {profiles.filter((profile) => !profile.archived).length >= PRACTICE_PROFILE_LIMIT ? <p>{t("활성 프로필이 20개입니다. 기존 프로필을 보관하면 새 프로필을 만들 수 있습니다.", "You have 20 active profiles. Archive one to add another.")}</p> : null}
          <div>{profiles.filter((profile) => !profile.archived).map((profile) => <article key={profile.id} data-active={profile.id === activeProfile?.id}><span><strong>{profile.name}</strong><small>{profile.is_default ? t("기본", "Default") : t(`${profile.generation}번째 기록`, `Record ${profile.generation}`)}</small></span><button type="button" title={t("이름 변경", "Rename")} onClick={() => void renameProfile(profile)}><Pencil size={13} /></button><button type="button" title={t("통계 새로 시작", "Start fresh")} onClick={() => void resetProfile(profile)}><RotateCcw size={13} /></button>{!profile.is_default ? <button type="button" title={t("보관", "Archive")} onClick={() => void archiveProfile(profile)}><Archive size={13} /></button> : null}</article>)}{profiles.filter((profile) => profile.archived).map((profile) => <article key={profile.id} data-archived="true"><span><strong>{profile.name}</strong><small>{t("보관됨", "Archived")}</small></span><button type="button" title={t("복원", "Restore")} onClick={() => void restoreProfile(profile)}><ArchiveRestore size={13} /></button></article>)}</div>
        </div> : null}
        {profileStatus ? <p className="practice-profile-status" role="status">{profileStatus}</p> : null}
      </section>
      <section className="analytics-overview">
        <div className="typing-analytics-grid">
          <div><Keyboard size={16} /><span>{t("최근 30일 타건", "30-day keystrokes")}</span><strong>{compact(summary?.typedChars ?? 0)}</strong></div>
          <div><Gauge size={16} /><span>{t("평균 CPM", "Average CPM")}</span><strong>{summary?.avgCpm ?? 0}</strong></div>
          <div><Target size={16} /><span>{t("평균 정확도", "Accuracy")}</span><strong>{summary?.avgAccuracy ?? 0}%</strong></div>
          <div><Flame size={16} /><span>{t("연속 이용일", "Current streak")}</span><strong>{summary?.streak ?? 0}{t("일", "d")}</strong></div>
        </div>
        <p className="analytics-insight">{insight}</p>
        <div className="typing-speed-position">
          <div><span>{t("계정 전체 타속 위치", "Account-wide speed position")}</span><strong>{speedPosition ? t(`상위 ${speedPosition.top_percent}%`, `Top ${speedPosition.top_percent}%`) : "--"}</strong></div>
          {speedPosition ? <p><b>{t(`${speedPosition.participant_count.toLocaleString()}명 중 ${speedPosition.speed_rank.toLocaleString()}위`, `${speedPosition.speed_rank.toLocaleString()} of ${speedPosition.participant_count.toLocaleString()} users`)}</b><span>{t(`평균 ${speedPosition.avg_cpm} CPM · ${speedPosition.completions.toLocaleString()}회 완주`, `Average ${speedPosition.avg_cpm} CPM · ${speedPosition.completions.toLocaleString()} completions`)}</span></p> : <p><span>{t("최근 30일 20회 이상 완주하면 위치가 표시됩니다.", "Complete at least 20 runs in 30 days to see your position.")}</span></p>}
        </div>
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
