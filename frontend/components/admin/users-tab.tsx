"use client";

import { useEffect, useMemo, useState } from "react";
import { History, Pencil } from "lucide-react";
import { formatDateTime } from "@/components/admin/labels";
import { getSupabaseClient } from "@/lib/supabase/client";
import { messageOf } from "@/lib/supabase/errors";

type UserRow = {
  profile_id: string;
  display_name: string;
  email: string | null;
  role: string;
  nickname_set: boolean;
  max_cpm: number;
  monthly_score: number;
  request_count: number;
  open_signal_count: number;
  display_name_changed_at: string | null;
  last_active_at: string | null;
  created_at: string;
  /** 필터 적용 후 전체 건수. 0015 적용 전에는 서버가 돌려주지 않는다. */
  total_count?: number | null;
};

type WatchRow = {
  profile_id: string;
  display_name: string;
  email: string | null;
  risk_score: number;
  max_severity: number;
  signal_count: number;
  rule_codes: string[];
  last_seen_at: string;
  monthly_score: number;
};

type NameHistoryRow = {
  history_id: number;
  profile_id: string;
  current_display_name: string;
  email: string | null;
  old_display_name: string | null;
  new_display_name: string;
  changed_by_profile_id: string | null;
  changed_by_display_name: string | null;
  source: string;
  reason: string | null;
  changed_at: string;
};

const WINDOWS = [
  { days: 7, label: "7일" },
  { days: 30, label: "30일" },
  { days: 90, label: "90일" },
] as const;

/* 0015에서 서버 상한을 2,000으로 올렸다. 현재 프로필이 866명이라 한 번에 다 받는다.
   표 안에서 스크롤하므로 행이 많아도 화면은 문제없다. */
const PAGE = 1000;

type SortKey = "score" | "name" | "cpm" | "created" | "signals";
type SortDir = "asc" | "desc";

const SORTS: { key: SortKey; label: string }[] = [
  { key: "score", label: "이달 타수" },
  { key: "name", label: "닉네임" },
  { key: "cpm", label: "최고 타수" },
  { key: "signals", label: "미검토 신호" },
  { key: "created", label: "가입" },
];

function seoulMonthId() {
  const parts = new Intl.DateTimeFormat("en-US", {
    timeZone: "Asia/Seoul",
    year: "numeric",
    month: "2-digit",
  }).formatToParts();
  return `${parts.find((p) => p.type === "year")?.value}${parts.find((p) => p.type === "month")?.value}`;
}

function sourceLabel(source: string) {
  switch (source) {
    case "admin":
      return "관리자 변경";
    case "backfill":
      return "기존 기록";
    default:
      return "사용자 변경";
  }
}

function isMissingRpc(error: unknown, functionName: string) {
  if (!error || typeof error !== "object") return false;
  const candidate = error as { code?: unknown; message?: unknown };
  const code = String(candidate.code ?? "");
  const message = String(candidate.message ?? "");
  return code === "PGRST202" || message.includes(functionName) || /find the function/i.test(message);
}

export function UsersTab() {
  const [search, setSearch] = useState("");
  const [appliedSearch, setAppliedSearch] = useState("");
  const [users, setUsers] = useState<UserRow[]>([]);
  const [usersLoading, setUsersLoading] = useState(true);
  const [usersError, setUsersError] = useState<string | null>(null);
  const [sortKey, setSortKey] = useState<SortKey>("score");
  const [sortDir, setSortDir] = useState<SortDir>("desc");
  const [historyDays, setHistoryDays] = useState<number>(30);
  const [historyScope, setHistoryScope] = useState<{ profileId: string; displayName: string } | null>(
    null,
  );
  const [nameHistory, setNameHistory] = useState<NameHistoryRow[]>([]);
  const [historyLoading, setHistoryLoading] = useState(true);
  const [historyError, setHistoryError] = useState<string | null>(null);

  const [days, setDays] = useState<number>(30);
  const [watchlist, setWatchlist] = useState<WatchRow[]>([]);
  const [watchLoading, setWatchLoading] = useState(true);
  const [watchError, setWatchError] = useState<string | null>(null);
  const [notes, setNotes] = useState<Record<string, string>>({});
  const [busyId, setBusyId] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);

  const [reloadToken, setReloadToken] = useState(0);

  /* 목록 읽기는 effect 안에 둔다. 밖에서 만든 함수를 effect가 부르면
     react-hooks/set-state-in-effect가 잡는다. */
  useEffect(() => {
    let active = true;

    async function fetchUsers() {
      const supabase = getSupabaseClient();
      if (!supabase) return;

      /* p_offset은 넘기지 않는다. PostgREST는 인자 이름으로 함수를 찾으므로
         0015 적용 전에 보내면 목록이 통째로 실패한다. 서버 기본값이 0이다. */
      const { data, error } = await supabase.rpc("get_admin_users", {
        p_search: appliedSearch || null,
        p_limit: PAGE,
      });
      if (!active) return;
      setUsersLoading(false);

      if (error) {
        console.error("유저 목록 실패", error);
        setUsersError(messageOf(error, "목록을 불러오지 못했습니다"));
        return;
      }
      setUsersError(null);
      setUsers((data ?? []) as UserRow[]);
    }

    void fetchUsers();
    return () => {
      active = false;
    };
  }, [appliedSearch, reloadToken]);

  const historyProfileId = historyScope?.profileId ?? null;

  useEffect(() => {
    let active = true;

    async function fetchNameHistory() {
      const supabase = getSupabaseClient();
      if (!supabase) return;

      const { data, error } = await supabase.rpc("get_admin_display_name_history", {
        p_profile_id: historyProfileId,
        p_search: historyProfileId ? null : appliedSearch || null,
        p_since_days: historyDays,
        p_limit: 120,
      });
      if (!active) return;
      setHistoryLoading(false);

      if (error) {
        console.error("닉네임 변경 기록 실패", error);
        setHistoryError(
          isMissingRpc(error, "get_admin_display_name_history")
            ? "0065_user_management_nickname_history.sql을 먼저 적용해야 합니다"
            : messageOf(error, "닉네임 변경 기록을 불러오지 못했습니다"),
        );
        return;
      }
      setHistoryError(null);
      setNameHistory((data ?? []) as NameHistoryRow[]);
    }

    void fetchNameHistory();
    return () => {
      active = false;
    };
  }, [appliedSearch, historyDays, historyProfileId, reloadToken]);

  useEffect(() => {
    let active = true;

    async function fetchWatchlist() {
      const supabase = getSupabaseClient();
      if (!supabase) return;

      const { data, error } = await supabase.rpc("get_abuse_watchlist", {
        p_since_days: days,
        p_limit: 100,
      });
      if (!active) return;
      setWatchLoading(false);

      if (error) {
        console.error("워치리스트 실패", error);
        setWatchError(messageOf(error, "워치리스트를 불러오지 못했습니다"));
        return;
      }
      setWatchError(null);
      setWatchlist((data ?? []) as WatchRow[]);
    }

    void fetchWatchlist();
    return () => {
      active = false;
    };
  }, [days, reloadToken]);

  /* 정렬은 서버가 아니라 여기서 한다. 받아온 목록을 다시 요청하지 않고 바꿀 수 있고,
     서버 함수에 정렬 인자를 더하면 마이그레이션이 또 필요하다. */
  const sortedUsers = useMemo(() => {
    const factor = sortDir === "asc" ? 1 : -1;
    return [...users].sort((a, b) => {
      switch (sortKey) {
        case "name":
          // 한글 정렬은 사전순으로 맞춘다. 기본 비교는 코드포인트 순이라 어긋난다.
          return a.display_name.localeCompare(b.display_name, "ko") * factor;
        case "cpm":
          return (a.max_cpm - b.max_cpm) * factor;
        case "signals":
          return (a.open_signal_count - b.open_signal_count) * factor;
        case "created":
          return (Date.parse(a.created_at) - Date.parse(b.created_at)) * factor;
        default:
          return (a.monthly_score - b.monthly_score) * factor;
      }
    });
  }, [users, sortKey, sortDir]);

  // 서버가 필터 적용 후 전체 건수를 각 행에 실어 보낸다. 0015 전에는 없다.
  const total = users[0]?.total_count ?? users.length;

  function reload() {
    setWatchLoading(true);
    setUsersLoading(true);
    setHistoryLoading(true);
    setReloadToken((value) => value + 1);
  }

  async function renameUser(profileId: string, name: string) {
    const supabase = getSupabaseClient();
    if (!supabase) return;

    const raw = window.prompt(
      `${name}의 닉네임을 관리자 권한으로 변경합니다.\n1~12자로 입력하세요.`,
      name,
    );
    if (raw === null) return;
    const next = raw.trim();
    if (next.length < 1 || next.length > 12) {
      setUsersError("닉네임은 1~12자여야 합니다");
      return;
    }
    if (next === name) return;

    const reason = window.prompt(
      `변경 사유를 남겨주세요. 닉네임 변경 기록에 저장됩니다.\n\n${name} → ${next}`,
      "",
    );
    if (reason === null) return;
    if (reason.trim().length < 2) {
      setUsersError("사유를 2자 이상 남겨야 합니다");
      return;
    }

    setBusyId(profileId);
    const { data, error } = await supabase.rpc("admin_update_user_display_name", {
      p_profile_id: profileId,
      p_display_name: next,
      p_reason: reason.trim(),
    });
    setBusyId(null);

    if (error) {
      console.error("관리자 닉네임 변경 실패", error);
      setUsersError(
        isMissingRpc(error, "admin_update_user_display_name")
          ? "0065_user_management_nickname_history.sql을 먼저 적용해야 합니다"
          : messageOf(error, "닉네임을 변경하지 못했습니다"),
      );
      return;
    }

    const changedName = String(data ?? next);
    setUsersError(null);
    setNotice(`${name} → ${changedName}로 변경했습니다`);
    setHistoryScope({ profileId, displayName: changedName });
    reload();
  }

  async function markReviewed(row: WatchRow) {
    const supabase = getSupabaseClient();
    if (!supabase) return;
    setBusyId(row.profile_id);

    const { data, error } = await supabase.rpc("review_abuse_signals", {
      p_profile_id: row.profile_id,
      p_note: (notes[row.profile_id] ?? "").trim() || null,
    });
    setBusyId(null);

    if (error) {
      console.error("어뷰징 신호 검토 실패", error);
      setWatchError(messageOf(error, "처리하지 못했습니다"));
      return;
    }
    setWatchError(null);
    setNotice(`${row.display_name}의 신호 ${data ?? 0}건을 검토 처리했습니다`);
    reload();
  }

  /** 이번 달 점수를 조정한다. 되돌릴 수 있도록 이력이 남는다. */
  async function adjustScore(profileId: string, name: string, current: number) {
    const supabase = getSupabaseClient();
    if (!supabase) return;

    const raw = window.prompt(
      `${name}의 이번 달 점수를 바꿉니다.\n현재 ${current.toLocaleString("ko-KR")}점\n\n새 점수를 입력하세요 (0 = 영점 처리)`,
      "0",
    );
    if (raw === null) return;
    const next = Number.parseInt(raw.replace(/[^\d]/g, ""), 10);
    if (!Number.isFinite(next) || next < 0) {
      setWatchError("숫자를 입력해야 합니다");
      return;
    }

    const reason = window.prompt(
      `사유를 남겨주세요. 조정 이력에 그대로 저장됩니다.\n\n${name}: ${current.toLocaleString("ko-KR")} → ${next.toLocaleString("ko-KR")}`,
      "",
    );
    if (reason === null) return;
    if (reason.trim().length < 2) {
      setWatchError("사유를 2자 이상 남겨야 합니다");
      return;
    }

    setBusyId(profileId);
    const { data, error } = await supabase.rpc("adjust_monthly_score", {
      p_profile_id: profileId,
      p_month_id: seoulMonthId(),
      p_new_score: next,
      p_reason: reason.trim(),
    });
    setBusyId(null);

    if (error) {
      console.error("점수 조정 실패", error);
      // 함수가 없으면 원인이 하나뿐이라 그대로 알려준다.
      const missing = error.code === "PGRST202" || /find the function/i.test(error.message ?? "");
      setWatchError(
        missing
          ? "0013_score_adjustments.sql을 먼저 적용해야 합니다"
          : messageOf(error, "조정하지 못했습니다"),
      );
      return;
    }
    const row = Array.isArray(data) ? data[0] : null;
    setWatchError(null);
    setNotice(
      `${name}: ${(row?.score_before ?? current).toLocaleString("ko-KR")} → ${(row?.score_after ?? next).toLocaleString("ko-KR")}점으로 조정했습니다`,
    );
    reload();
  }

  return (
    <>
      <section className="admin-panel">
        <header className="admin-panel-head">
          <h2>유저</h2>
          <span>
            {usersLoading
              ? "불러오는 중"
              : total > users.length
                ? `${users.length} / ${total}명`
                : `${users.length}명`}
          </span>
        </header>

        <form
          className="settings-row"
          onSubmit={(event) => {
            event.preventDefault();
            setAppliedSearch(search.trim());
            setUsersLoading(true);
            setHistoryLoading(true);
          }}
        >
          <input
            type="search"
            className="settings-input"
            value={search}
            placeholder="닉네임 또는 이메일"
            aria-label="유저 검색"
            onChange={(event) => setSearch(event.target.value)}
          />
          <button type="submit" className="chip-pill">
            찾기
          </button>
          {appliedSearch ? (
            <button
              type="button"
              className="chip-pill"
              onClick={() => {
                setSearch("");
                setAppliedSearch("");
                setUsersLoading(true);
                setHistoryLoading(true);
              }}
            >
              전체 보기
            </button>
          ) : null}
        </form>

        <div className="settings-row">
          <span className="settings-hint">정렬</span>
          {SORTS.map((item) => (
            <button
              key={item.key}
              type="button"
              className="chip-pill"
              data-selected={sortKey === item.key}
              title={sortKey === item.key ? "다시 누르면 순서가 바뀝니다" : undefined}
              onClick={() => {
                if (sortKey === item.key) {
                  setSortDir((d) => (d === "asc" ? "desc" : "asc"));
                } else {
                  setSortKey(item.key);
                  // 이름은 가나다순이 자연스럽고, 숫자는 큰 값이 먼저가 자연스럽다.
                  setSortDir(item.key === "name" ? "asc" : "desc");
                }
              }}
            >
              {item.label}
              {sortKey === item.key ? (sortDir === "asc" ? " ↑" : " ↓") : null}
            </button>
          ))}
        </div>

        {usersError ? <p className="settings-status is-error">{usersError}</p> : null}
        {notice ? <p className="settings-status is-done">{notice}</p> : null}

        {/* 866명이 들어가므로 표 안에서 스크롤한다. 머리행은 붙여둔다. */}
        <div className="admin-table-scroll is-tall">
          <table className="admin-table">
            <thead>
              <tr>
                <th scope="col">닉네임</th>
                <th scope="col">이메일</th>
                <th scope="col">이달 타수</th>
                <th scope="col">최고 타수</th>
                <th scope="col">요청</th>
                <th scope="col">신호</th>
                <th scope="col">가입</th>
                <th scope="col">최근 활동</th>
                <th scope="col">관리</th>
              </tr>
            </thead>
            <tbody>
              {sortedUsers.map((row) => (
                <tr key={row.profile_id}>
                  <td>
                    {row.display_name}
                    {row.role === "admin" ? <span className="admin-badge is-admin">관리자</span> : null}
                    {/* 구글 계정 이름이 그대로 들어 있는 상태. 본인이 정한 이름이 아니다. */}
                    {!row.nickname_set ? <span className="admin-badge">미설정</span> : null}
                    {row.display_name_changed_at ? (
                      <span className="admin-badge">변경 {formatDateTime(row.display_name_changed_at)}</span>
                    ) : null}
                  </td>
                  <td className="admin-cell-dim">{row.email ?? "—"}</td>
                  <td>{row.monthly_score.toLocaleString("ko-KR")}</td>
                  <td>{row.max_cpm.toLocaleString("ko-KR")}</td>
                  <td>{row.request_count}</td>
                  <td>
                    {row.open_signal_count > 0 ? (
                      <span className="admin-badge is-rejected">{row.open_signal_count}</span>
                    ) : (
                      "—"
                    )}
                  </td>
                  <td className="admin-cell-dim">{formatDateTime(row.created_at)}</td>
                  <td className="admin-cell-dim">
                    {row.last_active_at ? formatDateTime(row.last_active_at) : "—"}
                  </td>
                  <td>
                    <div className="admin-inline-actions">
                      <button
                        type="button"
                        className="chip-pill"
                        title="이 유저의 닉네임 변경 기록만 봅니다"
                        onClick={() => {
                          setHistoryLoading(true);
                          setHistoryScope({
                            profileId: row.profile_id,
                            displayName: row.display_name,
                          });
                        }}
                      >
                        <History aria-hidden="true" size={14} />
                        기록
                      </button>
                      <button
                        type="button"
                        className="chip-pill"
                        disabled={busyId === row.profile_id}
                        title="관리자 권한으로 닉네임을 변경합니다"
                        onClick={() => void renameUser(row.profile_id, row.display_name)}
                      >
                        <Pencil aria-hidden="true" size={14} />
                        닉네임
                      </button>
                      <button
                        type="button"
                        className="chip-pill admin-danger"
                        disabled={busyId === row.profile_id || row.monthly_score === 0}
                        title={
                          row.monthly_score === 0
                            ? "이번 달 기록이 없습니다"
                            : "이번 달 점수를 감점하거나 영점 처리합니다"
                        }
                        onClick={() =>
                          void adjustScore(row.profile_id, row.display_name, row.monthly_score)
                        }
                      >
                        점수
                      </button>
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>

        {!usersLoading && users.length === 0 ? (
          <p className="settings-hint">해당하는 유저가 없습니다.</p>
        ) : null}
        {total > users.length ? (
          <p className="settings-hint">
            전체 {total.toLocaleString("ko-KR")}명 중 {users.length.toLocaleString("ko-KR")}명만
            받았습니다. 검색으로 좁혀주세요.
          </p>
        ) : null}
      </section>

      <section className="admin-panel">
        <header className="admin-panel-head">
          <h2>닉네임 변경 기록</h2>
          <span>{historyLoading ? "불러오는 중" : `${nameHistory.length}건`}</span>
        </header>

        <div className="settings-row">
          {WINDOWS.map((item) => (
            <button
              key={item.days}
              type="button"
              className="chip-pill"
              data-selected={historyDays === item.days}
              onClick={() => {
                setHistoryDays(item.days);
                setHistoryLoading(true);
              }}
            >
              {item.label}
            </button>
          ))}
          {historyScope ? (
            <button
              type="button"
              className="chip-pill"
              onClick={() => {
                setHistoryScope(null);
                setHistoryLoading(true);
              }}
            >
              전체 기록
            </button>
          ) : null}
        </div>

        <p className="settings-hint">
          {historyScope
            ? `${historyScope.displayName}의 변경 기록만 보는 중입니다.`
            : appliedSearch
              ? `검색어 "${appliedSearch}"와 기간에 맞는 변경 기록입니다.`
              : "최근 닉네임 변경 기록입니다."}
        </p>

        {historyError ? <p className="settings-status is-error">{historyError}</p> : null}

        {!historyLoading && nameHistory.length === 0 ? (
          <p className="settings-hint">해당 기간의 닉네임 변경 기록이 없습니다.</p>
        ) : null}

        <ul className="admin-list">
          {nameHistory.map((row) => (
            <li key={row.history_id} className="admin-item card-style">
              <div className="admin-change-line">
                <strong>{row.current_display_name}</strong>
                <span className="admin-cell-dim">{row.email ?? "—"}</span>
                <span className="admin-badge">{sourceLabel(row.source)}</span>
                <span>{formatDateTime(row.changed_at)}</span>
              </div>
              <div className="admin-change-line">
                <span>{row.old_display_name ?? "이전 이름 없음"}</span>
                <span className="admin-change-arrow">→</span>
                <strong>{row.new_display_name}</strong>
              </div>
              <p className="admin-history-reason">
                {row.reason ??
                  (row.source === "admin"
                    ? `${row.changed_by_display_name ?? "관리자"}가 변경했습니다.`
                    : "사용자가 직접 변경했습니다.")}
              </p>
            </li>
          ))}
        </ul>
      </section>

      <section className="admin-panel">
        <header className="admin-panel-head">
          <h2>어뷰징 워치리스트</h2>
          <span>{watchLoading ? "불러오는 중" : `${watchlist.length}명`}</span>
        </header>

        <div className="settings-row">
          {WINDOWS.map((item) => (
            <button
              key={item.days}
              type="button"
              className="chip-pill"
              data-selected={days === item.days}
              onClick={() => {
                setDays(item.days);
                setWatchLoading(true);
                setNotice(null);
              }}
            >
              {item.label}
            </button>
          ))}
        </div>

        {watchError ? <p className="settings-status is-error">{watchError}</p> : null}

        {!watchLoading && watchlist.length === 0 ? (
          <p className="settings-hint">미검토 신호가 없습니다.</p>
        ) : null}

        <ul className="admin-list">
          {watchlist.map((row) => (
            <li key={row.profile_id} className="admin-item card-style">
              <div className="admin-item-meta">
                <strong>{row.display_name}</strong>
                <span className="admin-cell-dim">{row.email ?? "—"}</span>
                <span>위험도 {row.risk_score}</span>
                <span>최고 심각도 {row.max_severity}</span>
                <span>신호 {row.signal_count}건</span>
                <span>이달 타수 {row.monthly_score.toLocaleString("ko-KR")}</span>
                <span>{formatDateTime(row.last_seen_at)}</span>
              </div>

              <p className="admin-item-text">{row.rule_codes.join(", ")}</p>

              <div className="admin-item-actions">
                <input
                  type="text"
                  className="settings-input"
                  value={notes[row.profile_id] ?? ""}
                  maxLength={200}
                  placeholder="검토 메모 (선택)"
                  aria-label={`${row.display_name} 검토 메모`}
                  onChange={(event) =>
                    setNotes((current) => ({ ...current, [row.profile_id]: event.target.value }))
                  }
                />
                <button
                  type="button"
                  className="chip-pill"
                  disabled={busyId === row.profile_id}
                  onClick={() => void markReviewed(row)}
                >
                  검토 처리
                </button>
                <button
                  type="button"
                  className="chip-pill admin-danger"
                  disabled={busyId === row.profile_id || row.monthly_score === 0}
                  title="이번 달 점수를 감점하거나 영점 처리합니다"
                  onClick={() =>
                    void adjustScore(row.profile_id, row.display_name, row.monthly_score)
                  }
                >
                  점수 조정
                </button>
              </div>
            </li>
          ))}
        </ul>
      </section>
    </>
  );
}
