"use client";

import { Trash2 } from "lucide-react";
import { useEffect, useState } from "react";
import {
  LANGUAGES,
  SENTENCE_MODES,
  type SentenceMode,
  formatDateTime,
} from "@/components/admin/labels";
import { getSupabaseClient } from "@/lib/supabase/client";
import { messageOf } from "@/lib/supabase/errors";
import type { Language } from "@/lib/types";

type SentenceRow = {
  id: number;
  language: string;
  mode: string;
  text: string;
  is_meme: boolean;
  enabled: boolean;
  created_at: string;
};

const PAGE_SIZE = 50;
const COLUMNS = "id, language, mode, text, is_meme, enabled, created_at";

type Tri = "all" | "yes" | "no";

const ENABLED_FILTERS: { id: Tri; label: string }[] = [
  { id: "all", label: "전체" },
  { id: "yes", label: "사용" },
  { id: "no", label: "중지" },
];

const MEME_FILTERS: { id: Tri; label: string }[] = [
  { id: "all", label: "전체" },
  { id: "yes", label: "밈만" },
  { id: "no", label: "밈 제외" },
];

/**
 * 문장 관리.
 *
 * RPC 없이 sentences 테이블을 직접 고친다. 쓰기는 RLS의 sentences_admin_write가
 * is_admin()으로 막고 있어 관리자만 통과한다.
 */
export function SentencesTab() {
  const [language, setLanguage] = useState<Language | "all">("all");
  const [mode, setMode] = useState<SentenceMode | "all">("all");
  const [enabledFilter, setEnabledFilter] = useState<Tri>("all");
  const [memeFilter, setMemeFilter] = useState<Tri>("all");
  const [search, setSearch] = useState("");
  const [appliedSearch, setAppliedSearch] = useState("");
  const [page, setPage] = useState(0);

  const [rows, setRows] = useState<SentenceRow[]>([]);
  const [total, setTotal] = useState(0);
  const [edits, setEdits] = useState<Record<number, string>>({});
  const [loading, setLoading] = useState(true);
  const [busyId, setBusyId] = useState<number | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);

  const [draftLanguage, setDraftLanguage] = useState<Language>("kor");
  const [draftMode, setDraftMode] = useState<SentenceMode>("short");
  const [draftText, setDraftText] = useState("");
  const [draftMeme, setDraftMeme] = useState(false);
  const [adding, setAdding] = useState(false);

  /* 목록 읽기는 effect 안에 둔다. 밖에서 만든 함수를 effect가 부르면
     react-hooks/set-state-in-effect가 잡는다. 수정·삭제 후 다시 읽는 것은
     reloadToken을 올려 이 effect를 다시 돌리는 방식으로 처리한다. */
  const [reloadToken, setReloadToken] = useState(0);

  useEffect(() => {
    let active = true;

    async function fetchSentences() {
      const supabase = getSupabaseClient();
      if (!supabase) return;

      let query = supabase
        .from("sentences")
        .select(COLUMNS, { count: "exact" })
        .order("id", { ascending: false })
        .range(page * PAGE_SIZE, page * PAGE_SIZE + PAGE_SIZE - 1);

      if (language !== "all") query = query.eq("language", language);
      if (mode !== "all") query = query.eq("mode", mode);
      if (enabledFilter !== "all") query = query.eq("enabled", enabledFilter === "yes");
      if (memeFilter !== "all") query = query.eq("is_meme", memeFilter === "yes");
      if (appliedSearch) query = query.ilike("text", `%${appliedSearch}%`);

      const { data, error: queryError, count } = await query;
      // 필터를 빠르게 여러 번 누르면 먼저 보낸 응답이 늦게 올 수 있다.
      if (!active) return;
      setLoading(false);

      if (queryError) {
        console.error("문장 목록 실패", queryError);
        setError(messageOf(queryError, "목록을 불러오지 못했습니다"));
        return;
      }
      setError(null);
      const list = (data ?? []) as SentenceRow[];
      setRows(list);
      setTotal(count ?? 0);
      setEdits(Object.fromEntries(list.map((row) => [row.id, row.text])));
    }

    void fetchSentences();
    return () => {
      active = false;
    };
  }, [language, mode, enabledFilter, memeFilter, appliedSearch, page, reloadToken]);

  function reload() {
    setLoading(true);
    setReloadToken((value) => value + 1);
  }

  /** 필터를 바꾸면 첫 장으로 돌아간다. 3페이지에서 필터를 좁히면 빈 화면이 된다. */
  function resetPage() {
    setPage(0);
    setLoading(true);
    setNotice(null);
  }

  async function saveText(row: SentenceRow) {
    const supabase = getSupabaseClient();
    if (!supabase) return;
    const next = (edits[row.id] ?? "").trim();
    if (!next || next === row.text) return;
    setBusyId(row.id);

    const { error: updateError } = await supabase
      .from("sentences")
      .update({ text: next })
      .eq("id", row.id);
    setBusyId(null);

    if (updateError) {
      console.error("문장 수정 실패", updateError);
      setError(messageOf(updateError, "수정하지 못했습니다"));
      return;
    }
    setError(null);
    setNotice(`#${row.id} 수정했습니다`);
    setRows((current) =>
      current.map((item) => (item.id === row.id ? { ...item, text: next } : item)),
    );
  }

  async function toggle(row: SentenceRow, patch: Partial<Pick<SentenceRow, "enabled" | "is_meme">>) {
    const supabase = getSupabaseClient();
    if (!supabase) return;
    setBusyId(row.id);

    const { error: updateError } = await supabase
      .from("sentences")
      .update(patch)
      .eq("id", row.id);
    setBusyId(null);

    if (updateError) {
      console.error("문장 상태 변경 실패", updateError);
      setError(messageOf(updateError, "변경하지 못했습니다"));
      return;
    }
    setError(null);
    setRows((current) =>
      current.map((item) => (item.id === row.id ? { ...item, ...patch } : item)),
    );
  }

  async function remove(row: SentenceRow) {
    const supabase = getSupabaseClient();
    if (!supabase) return;
    if (!window.confirm(`#${row.id} 문장을 삭제합니다. 되돌릴 수 없습니다.\n\n${row.text}`)) return;
    setBusyId(row.id);

    const { error: deleteError } = await supabase.from("sentences").delete().eq("id", row.id);
    setBusyId(null);

    if (deleteError) {
      console.error("문장 삭제 실패", deleteError);
      setError(messageOf(deleteError, "삭제하지 못했습니다"));
      return;
    }
    setError(null);
    setNotice(`#${row.id} 삭제했습니다`);
    reload();
  }

  async function add() {
    const supabase = getSupabaseClient();
    if (!supabase) return;
    setAdding(true);

    const { error: insertError } = await supabase.from("sentences").insert({
      language: draftLanguage,
      mode: draftMode,
      text: draftText.trim(),
      is_meme: draftMeme,
    });
    setAdding(false);

    if (insertError) {
      console.error("문장 추가 실패", insertError);
      setError(messageOf(insertError, "추가하지 못했습니다"));
      return;
    }
    setError(null);
    setNotice("추가했습니다");
    setDraftText("");
    setPage(0);
    reload();
  }

  const lastPage = Math.max(0, Math.ceil(total / PAGE_SIZE) - 1);

  return (
    <section className="admin-panel">
      <header className="admin-panel-head">
        <h2>문장 관리</h2>
        <span>{loading ? "불러오는 중" : `${total.toLocaleString("ko-KR")}개`}</span>
      </header>

      {/* 목록이 주된 내용이라 추가 폼은 접어둔다. 펼치면 그대로 쓸 수 있다. */}
      <details className="admin-add-details">
        <summary>문장 추가</summary>
        <div className="admin-add card-style">
        <div className="settings-row">
          {LANGUAGES.map((item) => (
            <button
              key={item.id}
              type="button"
              className="chip-pill"
              data-selected={draftLanguage === item.id}
              onClick={() => setDraftLanguage(item.id)}
            >
              {item.label}
            </button>
          ))}
          {SENTENCE_MODES.map((item) => (
            <button
              key={item.id}
              type="button"
              className="chip-pill"
              data-selected={draftMode === item.id}
              onClick={() => setDraftMode(item.id)}
            >
              {item.label}
            </button>
          ))}
          <label className="admin-check" title="밈이 섞인 묶음에만 나옵니다">
            <input
              type="checkbox"
              checked={draftMeme}
              onChange={(event) => setDraftMeme(event.target.checked)}
            />
            밈
          </label>
        </div>
        <div className="settings-row">
          <textarea
            className="settings-input settings-textarea"
            value={draftText}
            maxLength={400}
            rows={2}
            placeholder="추가할 문장"
            aria-label="추가할 문장"
            onChange={(event) => setDraftText(event.target.value)}
          />
        </div>
        <div className="settings-row settings-row-end">
          <span className="settings-hint">{draftText.trim().length} / 400</span>
          <button
            type="button"
            className="chip-pill"
            disabled={adding || draftText.trim().length < 1}
            onClick={() => void add()}
          >
            추가
          </button>
        </div>
        </div>
      </details>

      <div className="admin-filters">
        <div className="settings-row">
          <span className="settings-hint">언어</span>
          <button
            type="button"
            className="chip-pill"
            data-selected={language === "all"}
            onClick={() => {
              setLanguage("all");
              resetPage();
            }}
          >
            전체
          </button>
          {LANGUAGES.map((item) => (
            <button
              key={item.id}
              type="button"
              className="chip-pill"
              data-selected={language === item.id}
              onClick={() => {
                setLanguage(item.id);
                resetPage();
              }}
            >
              {item.label}
            </button>
          ))}
        </div>

        <div className="settings-row">
          <span className="settings-hint">모드</span>
          <button
            type="button"
            className="chip-pill"
            data-selected={mode === "all"}
            onClick={() => {
              setMode("all");
              resetPage();
            }}
          >
            전체
          </button>
          {SENTENCE_MODES.map((item) => (
            <button
              key={item.id}
              type="button"
              className="chip-pill"
              data-selected={mode === item.id}
              onClick={() => {
                setMode(item.id);
                resetPage();
              }}
            >
              {item.label}
            </button>
          ))}
        </div>

        <div className="settings-row">
          <span className="settings-hint">사용</span>
          {ENABLED_FILTERS.map((item) => (
            <button
              key={item.id}
              type="button"
              className="chip-pill"
              data-selected={enabledFilter === item.id}
              onClick={() => {
                setEnabledFilter(item.id);
                resetPage();
              }}
            >
              {item.label}
            </button>
          ))}
          <span className="settings-hint">밈</span>
          {MEME_FILTERS.map((item) => (
            <button
              key={item.id}
              type="button"
              className="chip-pill"
              data-selected={memeFilter === item.id}
              onClick={() => {
                setMemeFilter(item.id);
                resetPage();
              }}
            >
              {item.label}
            </button>
          ))}
        </div>

        <form
          className="settings-row"
          onSubmit={(event) => {
            event.preventDefault();
            setAppliedSearch(search.trim());
            resetPage();
          }}
        >
          <input
            type="search"
            className="settings-input"
            value={search}
            placeholder="문장 검색"
            aria-label="문장 검색"
            onChange={(event) => setSearch(event.target.value)}
          />
          <button type="submit" className="chip-pill">
            찾기
          </button>
        </form>
      </div>

      {error ? <p className="settings-status is-error">{error}</p> : null}
      {notice ? <p className="settings-status is-done">{notice}</p> : null}

      {!loading && rows.length === 0 && total === 0 && !appliedSearch ? (
        <p className="settings-hint">
          아직 DB에 문장이 없습니다. 지금 타이핑에 쓰이는 약 1,900문장은
          <code> public/*.json</code>에 있고, DB 이관은 남은 작업입니다. 여기서 추가한
          문장과 승인된 요청 문장만 이 목록에 나옵니다.
        </p>
      ) : null}
      {!loading && rows.length === 0 && (total > 0 || appliedSearch) ? (
        <p className="settings-hint">조건에 맞는 문장이 없습니다.</p>
      ) : null}

      {/* 이관이 끝나면 1,900행이 들어온다. 페이지 안에서 스크롤한다. */}
      <ul className="admin-list is-tall">
        {rows.map((row) => (
          <li key={row.id} className="admin-item card-style">
            <div className="admin-item-meta">
              <strong>#{row.id}</strong>
              <span>{LANGUAGES.find((item) => item.id === row.language)?.label ?? row.language}</span>
              <span>
                {SENTENCE_MODES.find((item) => item.id === row.mode)?.label ?? row.mode}
              </span>
              <span>{formatDateTime(row.created_at)}</span>
              {!row.enabled ? <span className="admin-badge is-rejected">중지</span> : null}
              {row.is_meme ? <span className="admin-badge is-meme">밈</span> : null}
            </div>

            <textarea
              className="settings-input settings-textarea"
              value={edits[row.id] ?? row.text}
              maxLength={400}
              rows={2}
              aria-label={`문장 ${row.id}`}
              onChange={(event) =>
                setEdits((current) => ({ ...current, [row.id]: event.target.value }))
              }
            />

            <div className="admin-item-actions">
              <button
                type="button"
                className="chip-pill"
                disabled={busyId === row.id || (edits[row.id] ?? row.text).trim() === row.text}
                onClick={() => void saveText(row)}
              >
                저장
              </button>
              <button
                type="button"
                className="chip-pill"
                data-selected={row.enabled}
                disabled={busyId === row.id}
                onClick={() => void toggle(row, { enabled: !row.enabled })}
              >
                {row.enabled ? "사용 중" : "중지됨"}
              </button>
              <button
                type="button"
                className="chip-pill"
                data-selected={row.is_meme}
                disabled={busyId === row.id}
                title="밈이 섞인 묶음에만 나옵니다"
                onClick={() => void toggle(row, { is_meme: !row.is_meme })}
              >
                밈
              </button>
              <button
                type="button"
                className="chip-pill admin-danger"
                disabled={busyId === row.id}
                aria-label={`문장 ${row.id} 삭제`}
                onClick={() => void remove(row)}
              >
                <Trash2 size={14} />
                삭제
              </button>
            </div>
          </li>
        ))}
      </ul>

      {total > PAGE_SIZE ? (
        <div className="admin-pager">
          <button
            type="button"
            className="chip-pill"
            disabled={page === 0}
            onClick={() => setPage((value) => Math.max(0, value - 1))}
          >
            이전
          </button>
          <span className="settings-hint">
            {page + 1} / {lastPage + 1}
          </span>
          <button
            type="button"
            className="chip-pill"
            disabled={page >= lastPage}
            onClick={() => setPage((value) => Math.min(lastPage, value + 1))}
          >
            다음
          </button>
        </div>
      ) : null}
    </section>
  );
}
