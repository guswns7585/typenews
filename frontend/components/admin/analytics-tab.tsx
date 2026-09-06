"use client";

import { Activity, Clock3, Download, Gauge, Keyboard, UsersRound } from "lucide-react";
import { useEffect, useMemo, useState } from "react";
import { getSupabaseClient } from "@/lib/supabase/client";

type AnalyticsRow = {
  day: string;
  active_users: number;
  starts: number;
  completions: number;
  completion_rate: number;
  typed_chars: number;
  active_ms: number;
  avg_cpm: number;
  avg_accuracy: number;
  mistakes: number;
  backspaces: number;
  news_completed: number;
};

type ModeRow = {
  language: string;
  mode: string;
  category: string;
  starts: number;
  completions: number;
  passed: number;
  completion_rate: number;
  pass_rate: number;
  typed_chars: number;
  active_ms: number;
  avg_duration_ms: number;
  avg_cpm: number;
  avg_accuracy: number;
  backspaces: number;
  mistakes: number;
  long_pauses: number;
  news_completed: number;
};

type Dimensions = {
  summary: {
    dau: number;
    wau: number;
    mau: number;
    newUsers: number;
    returningUsers: number;
    longPauses: number;
  };
  devices: { device: string; completions: number }[];
  hours: { hour: number; starts: number }[];
};

type Quality = {
  summary: {
    passed: number;
    activeMs: number;
    backspaces: number;
    mistakes: number;
    longPauses: number;
    activeUsers: number;
    activeUserDays: number;
    weaknessMistakes: number;
    weaknessCorrections: number;
    weaknessUsers: number;
  };
  weaknesses: {
    sentenceId: number;
    sentenceText: string;
    charIndex: number;
    targetCharacter: string;
    mistakeCount: number;
    correctionCount: number;
    affectedUsers: number;
    lastSeenAt: string;
  }[];
};

const number = new Intl.NumberFormat("ko-KR");
const decimal = new Intl.NumberFormat("ko-KR", { maximumFractionDigits: 1 });

const LANGUAGE_LABELS: Record<string, string> = { kor: "한국어", eng: "영어" };
const MODE_LABELS: Record<string, string> = {
  short: "단문",
  long: "장문",
  word: "단어",
  news: "뉴스",
};
const DEVICE_LABELS: Record<string, string> = {
  desktop: "PC",
  tablet: "태블릿",
  mobile: "모바일",
};

function csvCell(value: string | number) {
  return `"${String(value).replaceAll('"', '""')}"`;
}

function duration(milliseconds: number) {
  if (!Number.isFinite(milliseconds) || milliseconds <= 0) return "0초";
  const seconds = Math.round(milliseconds / 1000);
  if (seconds < 60) return `${seconds}초`;
  const minutes = Math.floor(seconds / 60);
  const remainder = seconds % 60;
  if (minutes < 60) return remainder ? `${minutes}분 ${remainder}초` : `${minutes}분`;
  const hours = Math.floor(minutes / 60);
  return `${hours}시간 ${minutes % 60}분`;
}

function ratio(part: number, total: number) {
  return total > 0 ? part * 100 / total : 0;
}

export function AnalyticsTab() {
  const [days, setDays] = useState(30);
  const [rows, setRows] = useState<AnalyticsRow[]>([]);
  const [modeRows, setModeRows] = useState<ModeRow[]>([]);
  const [dimensions, setDimensions] = useState<Dimensions | null>(null);
  const [quality, setQuality] = useState<Quality | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    const supabase = getSupabaseClient();
    if (!supabase) return;
    let active = true;
    void Promise.all([
      supabase.rpc("get_admin_typing_analytics", { p_days: days }),
      supabase.rpc("get_admin_typing_mode_details", { p_days: days }),
      supabase.rpc("get_admin_typing_dimensions", { p_days: days }),
      supabase.rpc("get_admin_typing_quality", { p_days: days, p_limit: 20 }),
    ]).then(([dailyResult, modeResult, dimensionResult, qualityResult]) => {
      if (!active) return;
      const rpcError = dailyResult.error ?? modeResult.error ?? dimensionResult.error ?? qualityResult.error;
      if (rpcError) {
        setError(rpcError.message);
      } else {
        setRows((dailyResult.data ?? []) as AnalyticsRow[]);
        setModeRows((modeResult.data ?? []) as ModeRow[]);
        setDimensions(dimensionResult.data as Dimensions | null);
        setQuality(qualityResult.data as Quality | null);
      }
      setLoading(false);
    });
    return () => { active = false; };
  }, [days]);

  const totals = useMemo(() => rows.reduce((sum, row) => ({
    starts: sum.starts + Number(row.starts),
    completions: sum.completions + Number(row.completions),
    chars: sum.chars + Number(row.typed_chars),
    activeMs: sum.activeMs + Number(row.active_ms),
    mistakes: sum.mistakes + Number(row.mistakes),
    backspaces: sum.backspaces + Number(row.backspaces),
    news: sum.news + Number(row.news_completed),
    cpmWeighted: sum.cpmWeighted + Number(row.avg_cpm) * Number(row.completions),
    accuracyWeighted: sum.accuracyWeighted + Number(row.avg_accuracy) * Number(row.completions),
  }), {
    starts: 0,
    completions: 0,
    chars: 0,
    activeMs: 0,
    mistakes: 0,
    backspaces: 0,
    news: 0,
    cpmWeighted: 0,
    accuracyWeighted: 0,
  }), [rows]);

  const averageCpm = totals.completions ? totals.cpmWeighted / totals.completions : 0;
  const averageAccuracy = totals.completions ? totals.accuracyWeighted / totals.completions : 0;
  const averageDuration = totals.completions ? totals.activeMs / totals.completions : 0;
  const passed = Number(quality?.summary.passed ?? 0);
  const activeAccounts = Number(dimensions?.summary.newUsers ?? 0) + Number(dimensions?.summary.returningUsers ?? 0);
  const returningRate = ratio(Number(dimensions?.summary.returningUsers ?? 0), activeAccounts);
  const chronological = [...rows].reverse();
  const maxDailyChars = Math.max(1, ...chronological.map((row) => Number(row.typed_chars)));
  const maxHourStarts = Math.max(1, ...(dimensions?.hours ?? []).map((row) => Number(row.starts)));
  const deviceTotal = (dimensions?.devices ?? []).reduce((sum, row) => sum + Number(row.completions), 0);

  function changePeriod(value: number) {
    setLoading(true);
    setError(null);
    setDays(value);
  }

  function downloadCsv() {
    const header = ["날짜", "활성 사용자", "시작", "완료", "완료율", "타건", "활동시간(ms)",
      "평균 소요시간(ms)", "평균 CPM", "평균 정확도", "오타", "백스페이스", "뉴스 완료"];
    const body = rows.map((row) => [row.day, row.active_users, row.starts, row.completions,
      row.completion_rate, row.typed_chars, row.active_ms,
      Number(row.completions) ? Math.round(Number(row.active_ms) / Number(row.completions)) : 0,
      row.avg_cpm, row.avg_accuracy, row.mistakes, row.backspaces, row.news_completed]);
    const csv = `\uFEFF${[header, ...body].map((line) => line.map(csvCell).join(",")).join("\r\n")}`;
    const url = URL.createObjectURL(new Blob([csv], { type: "text/csv;charset=utf-8" }));
    const anchor = document.createElement("a");
    anchor.href = url;
    anchor.download = `typenews-analytics-${days}d.csv`;
    anchor.click();
    URL.revokeObjectURL(url);
  }

  return (
    <section className="admin-panel admin-analytics-panel">
      <header className="admin-panel-head admin-analytics-titlebar">
        <div>
          <h2>이용 분석</h2>
          <span>로그인 사용자의 익명 집계 · 점수와 랭킹 로직에는 영향을 주지 않음</span>
        </div>
        <div className="admin-periods" aria-label="조회 기간">
          {[7, 30, 90].map((value) => (
            <button key={value} type="button" className="admin-control-button"
              data-selected={days === value} onClick={() => changePeriod(value)}>{value}일</button>
          ))}
          <button type="button" className="admin-control-button" onClick={downloadCsv}
            disabled={!rows.length} title="일별 집계 CSV 다운로드">
            <Download size={14} /> CSV
          </button>
        </div>
      </header>

      {error ? <p className="admin-error">분석 데이터를 불러오지 못했습니다: {error}</p> : null}
      {loading ? <p className="admin-loading">집계 데이터를 불러오는 중입니다.</p> : null}

      <section className="admin-analytics-section" aria-labelledby="admin-users-heading">
        <div className="admin-section-heading">
          <UsersRound size={17} />
          <div><h3 id="admin-users-heading">사용자 지표</h3><span>현재 활성 사용자와 선택 기간 구성</span></div>
        </div>
        <div className="admin-analytics-cards admin-analytics-cards-users">
          <Metric label="DAU" value={number.format(dimensions?.summary.dau ?? 0)} note="오늘" />
          <Metric label="WAU" value={number.format(dimensions?.summary.wau ?? 0)} note="최근 7일" />
          <Metric label="MAU" value={number.format(dimensions?.summary.mau ?? 0)} note="최근 30일" />
          <Metric label="신규 계정 활성" value={number.format(dimensions?.summary.newUsers ?? 0)} note={`${days}일`} />
          <Metric label="기존 계정 활성" value={number.format(dimensions?.summary.returningUsers ?? 0)} note={`${days}일`} />
          <Metric label="기존 사용자 비중" value={`${decimal.format(returningRate)}%`} note="활성 계정 중" />
          <Metric label="활성 사용자·일" value={number.format(quality?.summary.activeUserDays ?? 0)} note="중복 일수 포함" />
        </div>
      </section>

      <section className="admin-analytics-section" aria-labelledby="admin-typing-heading">
        <div className="admin-section-heading">
          <Keyboard size={17} />
          <div><h3 id="admin-typing-heading">타이핑 활동</h3><span>선택 기간의 전체 입력 품질</span></div>
        </div>
        <div className="admin-analytics-cards admin-analytics-cards-wide">
          <Metric label="시작" value={number.format(totals.starts)} />
          <Metric label="완주" value={number.format(totals.completions)} note={`${decimal.format(ratio(totals.completions, totals.starts))}%`} />
          <Metric label="점수 인정" value={number.format(passed)} note={`${decimal.format(ratio(passed, totals.completions))}%`} />
          <Metric label="총 타건" value={number.format(totals.chars)} />
          <Metric label="평균 CPM" value={decimal.format(averageCpm)} />
          <Metric label="평균 정확도" value={`${decimal.format(averageAccuracy)}%`} />
          <Metric label="평균 소요시간" value={duration(averageDuration)} />
          <Metric label="실제 입력시간" value={duration(totals.activeMs)} />
          <Metric label="오타" value={number.format(totals.mistakes)} note={`1천 타당 ${decimal.format(ratio(totals.mistakes, totals.chars) * 10)}`} />
          <Metric label="백스페이스" value={number.format(totals.backspaces)} />
          <Metric label="3초 이상 정지" value={number.format(quality?.summary.longPauses ?? 0)} />
          <Metric label="뉴스 완주" value={number.format(totals.news)} />
        </div>
      </section>

      <div className="admin-chart-grid">
        <section className="admin-chart-card">
          <div className="admin-chart-head"><strong>일별 타건 추이</strong><span>{days}일</span></div>
          <div className="admin-chart-bars">
            {chronological.map((row) => (
              <span key={row.day} title={`${row.day} · ${number.format(row.typed_chars)}타`}>
                <i style={{ height: `${Math.max(3, Number(row.typed_chars) / maxDailyChars * 100)}%` }} />
              </span>
            ))}
          </div>
        </section>
        <section className="admin-chart-card">
          <div className="admin-chart-head"><strong>기기별 완료</strong><span>{number.format(deviceTotal)}회</span></div>
          <div className="admin-distribution-list">
            {(dimensions?.devices ?? []).map((row) => (
              <div key={row.device}>
                <span>{DEVICE_LABELS[row.device] ?? row.device}</span>
                <i><b style={{ width: `${ratio(Number(row.completions), deviceTotal)}%` }} /></i>
                <small>{decimal.format(ratio(Number(row.completions), deviceTotal))}%</small>
              </div>
            ))}
          </div>
        </section>
      </div>

      <section className="admin-chart-card admin-hour-chart">
        <div className="admin-chart-head"><strong>시간대별 시작</strong><span>한국 표준시</span></div>
        <div>{Array.from({ length: 24 }, (_, hour) => {
          const starts = Number(dimensions?.hours.find((row) => row.hour === hour)?.starts ?? 0);
          return <span key={hour} title={`${hour}시 · ${number.format(starts)}회`}>
            <i style={{ height: `${Math.max(starts ? 4 : 0, starts / maxHourStarts * 100)}%` }} />
            <small>{hour % 3 === 0 ? hour : ""}</small>
          </span>;
        })}</div>
      </section>

      <section className="admin-data-section">
        <div className="admin-section-heading">
          <Activity size={17} />
          <div><h3>일별 상세</h3><span>모든 일별 수집 지표</span></div>
        </div>
        <div className="admin-table-scroll">
          <table className="admin-table admin-analytics-table">
            <thead><tr><th>날짜</th><th>활성</th><th>시작</th><th>완주</th><th>완주율</th><th>타건</th><th>입력시간</th><th>평균시간</th><th>CPM</th><th>정확도</th><th>오타</th><th>백스페이스</th><th>뉴스</th></tr></thead>
            <tbody>
              {rows.map((row) => (
                <tr key={row.day}>
                  <td>{row.day}</td><td>{number.format(row.active_users)}</td><td>{number.format(row.starts)}</td>
                  <td>{number.format(row.completions)}</td><td>{row.completion_rate}%</td><td>{number.format(row.typed_chars)}</td>
                  <td>{duration(Number(row.active_ms))}</td><td>{duration(Number(row.completions) ? Number(row.active_ms) / Number(row.completions) : 0)}</td>
                  <td>{row.avg_cpm}</td><td>{row.avg_accuracy}%</td><td>{number.format(row.mistakes)}</td>
                  <td>{number.format(row.backspaces)}</td><td>{number.format(row.news_completed)}</td>
                </tr>
              ))}
              {!loading && !rows.length ? <tr><td colSpan={13}>아직 수집된 분석 데이터가 없습니다.</td></tr> : null}
            </tbody>
          </table>
        </div>
      </section>

      <section className="admin-data-section">
        <div className="admin-section-heading">
          <Gauge size={17} />
          <div><h3>언어·모드·뉴스 분야</h3><span>수집되는 세부 품질 지표 전체</span></div>
        </div>
        <div className="admin-table-scroll">
          <table className="admin-table admin-analytics-table">
            <thead><tr><th>언어</th><th>모드</th><th>분야</th><th>시작</th><th>완주</th><th>완주율</th><th>인정</th><th>인정률</th><th>타건</th><th>입력시간</th><th>평균시간</th><th>CPM</th><th>정확도</th><th>오타</th><th>백스페이스</th><th>정지</th><th>뉴스</th></tr></thead>
            <tbody>{modeRows.map((row) => (
              <tr key={`${row.language}-${row.mode}-${row.category}`}>
                <td>{LANGUAGE_LABELS[row.language] ?? row.language}</td><td>{MODE_LABELS[row.mode] ?? row.mode}</td><td>{row.category || "—"}</td>
                <td>{number.format(row.starts)}</td><td>{number.format(row.completions)}</td><td>{row.completion_rate}%</td>
                <td>{number.format(row.passed)}</td><td>{row.pass_rate}%</td><td>{number.format(row.typed_chars)}</td>
                <td>{duration(Number(row.active_ms))}</td><td>{duration(Number(row.avg_duration_ms))}</td><td>{row.avg_cpm}</td><td>{row.avg_accuracy}%</td>
                <td>{number.format(row.mistakes)}</td><td>{number.format(row.backspaces)}</td>
                <td>{number.format(row.long_pauses)}</td><td>{number.format(row.news_completed)}</td>
              </tr>
            ))}</tbody>
          </table>
        </div>
      </section>

      <section className="admin-data-section">
        <div className="admin-section-heading">
          <Clock3 size={17} />
          <div><h3>누적 취약 위치 TOP 20</h3><span>개인 식별 정보 없이 문장과 글자 위치만 합산</span></div>
        </div>
        <div className="admin-weakness-summary">
          <span>영향 사용자 <strong>{number.format(quality?.summary.weaknessUsers ?? 0)}</strong></span>
          <span>누적 오타 <strong>{number.format(quality?.summary.weaknessMistakes ?? 0)}</strong></span>
          <span>수정 완료 <strong>{number.format(quality?.summary.weaknessCorrections ?? 0)}</strong></span>
        </div>
        <div className="admin-table-scroll">
          <table className="admin-table admin-analytics-table admin-weakness-table">
            <thead><tr><th>순위</th><th>글자</th><th>문장</th><th>위치</th><th>사용자</th><th>오타</th><th>수정</th><th>수정률</th><th>최근</th></tr></thead>
            <tbody>{(quality?.weaknesses ?? []).map((row, index) => (
              <tr key={`${row.sentenceId}-${row.charIndex}`}>
                <td>{index + 1}</td><td><strong className="admin-target-character">{row.targetCharacter || "공백"}</strong></td>
                <td className="admin-sentence-cell" title={row.sentenceText}>{row.sentenceText}</td><td>{row.charIndex + 1}</td>
                <td>{number.format(row.affectedUsers)}</td><td>{number.format(row.mistakeCount)}</td>
                <td>{number.format(row.correctionCount)}</td><td>{decimal.format(ratio(row.correctionCount, row.mistakeCount))}%</td>
                <td>{new Date(row.lastSeenAt).toLocaleDateString("ko-KR")}</td>
              </tr>
            ))}</tbody>
          </table>
        </div>
      </section>
    </section>
  );
}

function Metric({ label, value, note }: { label: string; value: string; note?: string }) {
  return <div><span>{label}</span><strong>{value}</strong>{note ? <small>{note}</small> : null}</div>;
}
