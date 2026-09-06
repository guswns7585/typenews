"use client";

import { useEffect, useState } from "react";
import { formatDateTime, languageLabel, modeLabel } from "@/components/admin/labels";
import { getSupabaseClient } from "@/lib/supabase/client";
import { messageOf } from "@/lib/supabase/errors";

type RequestRow = {
  id: number;
  display_name: string;
  language: string;
  mode: string;
  text: string;
  status: string;
  created_at: string;
};

const STATUSES = [
  { id: "pending", label: "대기" },
  { id: "accepted", label: "승인" },
  { id: "rejected", label: "거절" },
  { id: "all", label: "전체" },
] as const;

type StatusFilter = (typeof STATUSES)[number]["id"];

/** 심사 중인 한 건의 편집 상태. 승인할 때 문장을 다듬을 수 있다. */
type Draft = { text: string; note: string; isMeme: boolean };

export function SentenceRequestsTab() {
  const [filter, setFilter] = useState<StatusFilter>("pending");
  const [rows, setRows] = useState<RequestRow[]>([]);
  const [drafts, setDrafts] = useState<Record<number, Draft>>({});
  const [loading, setLoading] = useState(true);
  const [busyId, setBusyId] = useState<number | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);

  /* 목록 읽기는 effect 안에 둔다. 밖에서 만든 함수를 effect가 부르면
     react-hooks/set-state-in-effect가 잡는다. 심사 후 다시 읽는 것은
     reloadToken을 올려 이 effect를 다시 돌리는 방식으로 처리한다. */
  const [reloadToken, setReloadToken] = useState(0);

  useEffect(() => {
    let active = true;

    async function fetchRequests() {
      const supabase = getSupabaseClient();
      if (!supabase) return;

      const { data, error: rpcError } = await supabase.rpc("get_sentence_requests", {
        p_status: filter === "all" ? null : filter,
        p_limit: 200,
      });
      // 필터를 빠르게 여러 번 누르면 먼저 보낸 응답이 늦게 올 수 있다.
      if (!active) return;
      setLoading(false);

      if (rpcError) {
        console.error("문장 요청 목록 실패", rpcError);
        setError(messageOf(rpcError, "목록을 불러오지 못했습니다"));
        return;
      }
      setError(null);
      const list = (data ?? []) as RequestRow[];
      setRows(list);
      setDrafts(
        Object.fromEntries(
          list.map((row) => [row.id, { text: row.text, note: "", isMeme: false }]),
        ),
      );
    }

    void fetchRequests();
    return () => {
      active = false;
    };
  }, [filter, reloadToken]);

  async function review(row: RequestRow, accept: boolean) {
    const supabase = getSupabaseClient();
    if (!supabase) return;
    const draft = drafts[row.id] ?? { text: row.text, note: "", isMeme: false };
    setBusyId(row.id);

    const { error: rpcError } = await supabase.rpc("review_sentence_request", {
      p_request_id: row.id,
      p_accept: accept,
      p_text: accept ? draft.text : null,
      p_note: draft.note.trim() || null,
      p_is_meme: draft.isMeme,
    });
    setBusyId(null);

    if (rpcError) {
      console.error("문장 요청 심사 실패", rpcError);
      setError(messageOf(rpcError, "처리하지 못했습니다"));
      return;
    }
    setError(null);
    setNotice(accept ? "승인했습니다. 문장에 추가되었습니다" : "거절했습니다");
    setLoading(true);
    setReloadToken((value) => value + 1);
  }

  function patch(id: number, next: Partial<Draft>) {
    setDrafts((current) => ({
      ...current,
      [id]: { ...(current[id] ?? { text: "", note: "", isMeme: false }), ...next },
    }));
  }

  return (
    <section className="admin-panel">
      <header className="admin-panel-head">
        <h2>문장 요청 심사</h2>
        <span>{loading ? "불러오는 중" : `${rows.length}건`}</span>
      </header>

      <div className="settings-row">
        {STATUSES.map((item) => (
          <button
            key={item.id}
            type="button"
            className="chip-pill"
            data-selected={filter === item.id}
            onClick={() => {
              setFilter(item.id);
              setLoading(true);
              setNotice(null);
            }}
          >
            {item.label}
          </button>
        ))}
      </div>

      {error ? <p className="settings-status is-error">{error}</p> : null}
      {notice ? <p className="settings-status is-done">{notice}</p> : null}

      {!loading && rows.length === 0 ? <p className="settings-hint">해당하는 요청이 없습니다.</p> : null}

      <ul className="admin-list">
        {rows.map((row) => {
          const draft = drafts[row.id] ?? { text: row.text, note: "", isMeme: false };
          const pending = row.status === "pending";
          return (
            <li key={row.id} className="admin-item card-style">
              <div className="admin-item-meta">
                <strong>{row.display_name}</strong>
                <span>{languageLabel(row.language)}</span>
                <span>{modeLabel(row.mode)}</span>
                <span>{formatDateTime(row.created_at)}</span>
                <span className={`admin-badge is-${row.status}`}>
                  {STATUSES.find((item) => item.id === row.status)?.label ?? row.status}
                </span>
              </div>

              {pending ? (
                <>
                  <textarea
                    className="settings-input settings-textarea"
                    value={draft.text}
                    maxLength={400}
                    rows={2}
                    aria-label={`요청 ${row.id} 문장`}
                    onChange={(event) => patch(row.id, { text: event.target.value })}
                  />
                  <div className="admin-item-actions">
                    <label className="admin-check">
                      <input
                        type="checkbox"
                        checked={draft.isMeme}
                        onChange={(event) => patch(row.id, { isMeme: event.target.checked })}
                      />
                      밈
                    </label>
                    <input
                      type="text"
                      className="settings-input"
                      value={draft.note}
                      maxLength={200}
                      placeholder="메모 (선택)"
                      aria-label={`요청 ${row.id} 메모`}
                      onChange={(event) => patch(row.id, { note: event.target.value })}
                    />
                    <button
                      type="button"
                      className="chip-pill"
                      disabled={busyId === row.id || draft.text.trim().length < 2}
                      onClick={() => void review(row, true)}
                    >
                      승인
                    </button>
                    <button
                      type="button"
                      className="chip-pill"
                      disabled={busyId === row.id}
                      onClick={() => void review(row, false)}
                    >
                      거절
                    </button>
                  </div>
                </>
              ) : (
                <p className="admin-item-text">{row.text}</p>
              )}
            </li>
          );
        })}
      </ul>
    </section>
  );
}
