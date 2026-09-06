"use client";

import { Trash2 } from "lucide-react";
import { useEffect, useState } from "react";
import { getSupabaseClient } from "@/lib/supabase/client";
import { messageOf } from "@/lib/supabase/errors";

type PrizeRow = {
  id: number;
  name: string;
  full_name: string | null;
  sponsor: string | null;
  image_url: string | null;
  link_url: string | null;
  sort_order: number;
  enabled: boolean;
};

type PrizeDraft = {
  name: string;
  full_name: string;
  sponsor: string;
  image_url: string;
  link_url: string;
  sort_order: string;
};

const COLUMNS = "id, name, full_name, sponsor, image_url, link_url, sort_order, enabled";

const EMPTY: PrizeDraft = {
  name: "",
  full_name: "",
  sponsor: "",
  image_url: "",
  link_url: "",
  sort_order: "0",
};

function draftOf(row: PrizeRow): PrizeDraft {
  return {
    name: row.name,
    full_name: row.full_name ?? "",
    sponsor: row.sponsor ?? "",
    image_url: row.image_url ?? "",
    link_url: row.link_url ?? "",
    sort_order: String(row.sort_order),
  };
}

/** 빈 문자열은 null로 넣는다. ''와 null이 섞이면 화면에서 분기가 두 번 필요해진다. */
function payloadOf(draft: PrizeDraft) {
  return {
    name: draft.name.trim(),
    full_name: draft.full_name.trim() || null,
    sponsor: draft.sponsor.trim() || null,
    image_url: draft.image_url.trim() || null,
    link_url: draft.link_url.trim() || null,
    sort_order: Number.parseInt(draft.sort_order, 10) || 0,
  };
}

/**
 * 경품 관리.
 *
 * 지금 /event 화면의 경품은 event-content.tsx에 하드코딩되어 있다.
 * 이 표를 채운 뒤 그 화면이 event_prizes를 읽도록 바꾸는 것이 남은 작업이다.
 */
export function PrizesTab() {
  const [rows, setRows] = useState<PrizeRow[]>([]);
  const [drafts, setDrafts] = useState<Record<number, PrizeDraft>>({});
  const [newPrize, setNewPrize] = useState<PrizeDraft>(EMPTY);
  const [loading, setLoading] = useState(true);
  const [busyId, setBusyId] = useState<number | null>(null);
  const [adding, setAdding] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);

  /* 목록 읽기는 effect 안에 둔다. 밖에서 만든 함수를 effect가 부르면
     react-hooks/set-state-in-effect가 잡는다. 편집 후 다시 읽는 것은
     reloadToken을 올려 이 effect를 다시 돌리는 방식으로 처리한다. */
  const [reloadToken, setReloadToken] = useState(0);

  useEffect(() => {
    let active = true;

    async function fetchPrizes() {
      const supabase = getSupabaseClient();
      if (!supabase) return;

      const { data, error: queryError } = await supabase
        .from("event_prizes")
        .select(COLUMNS)
        .order("sort_order", { ascending: true })
        .order("id", { ascending: true });
      if (!active) return;
      setLoading(false);

      if (queryError) {
        console.error("경품 목록 실패", queryError);
        setError(messageOf(queryError, "목록을 불러오지 못했습니다"));
        return;
      }
      setError(null);
      const list = (data ?? []) as PrizeRow[];
      setRows(list);
      setDrafts(Object.fromEntries(list.map((row) => [row.id, draftOf(row)])));
    }

    void fetchPrizes();
    return () => {
      active = false;
    };
  }, [reloadToken]);

  function reload() {
    setLoading(true);
    setReloadToken((value) => value + 1);
  }

  async function save(row: PrizeRow) {
    const supabase = getSupabaseClient();
    if (!supabase) return;
    const draft = drafts[row.id];
    if (!draft?.name.trim()) return;
    setBusyId(row.id);

    const { error: updateError } = await supabase
      .from("event_prizes")
      .update(payloadOf(draft))
      .eq("id", row.id);
    setBusyId(null);

    if (updateError) {
      console.error("경품 수정 실패", updateError);
      setError(messageOf(updateError, "수정하지 못했습니다"));
      return;
    }
    setError(null);
    setNotice(`${draft.name.trim()} 저장했습니다`);
    reload();
  }

  async function toggleEnabled(row: PrizeRow) {
    const supabase = getSupabaseClient();
    if (!supabase) return;
    setBusyId(row.id);

    const { error: updateError } = await supabase
      .from("event_prizes")
      .update({ enabled: !row.enabled })
      .eq("id", row.id);
    setBusyId(null);

    if (updateError) {
      console.error("경품 상태 변경 실패", updateError);
      setError(messageOf(updateError, "변경하지 못했습니다"));
      return;
    }
    setError(null);
    setRows((current) =>
      current.map((item) => (item.id === row.id ? { ...item, enabled: !item.enabled } : item)),
    );
  }

  async function remove(row: PrizeRow) {
    const supabase = getSupabaseClient();
    if (!supabase) return;
    if (!window.confirm(`"${row.name}"을 삭제합니다. 되돌릴 수 없습니다.`)) return;
    setBusyId(row.id);

    const { error: deleteError } = await supabase.from("event_prizes").delete().eq("id", row.id);
    setBusyId(null);

    if (deleteError) {
      console.error("경품 삭제 실패", deleteError);
      setError(messageOf(deleteError, "삭제하지 못했습니다"));
      return;
    }
    setError(null);
    setNotice(`${row.name} 삭제했습니다`);
    reload();
  }

  async function add() {
    const supabase = getSupabaseClient();
    if (!supabase) return;
    setAdding(true);

    const { error: insertError } = await supabase.from("event_prizes").insert(payloadOf(newPrize));
    setAdding(false);

    if (insertError) {
      console.error("경품 추가 실패", insertError);
      setError(messageOf(insertError, "추가하지 못했습니다"));
      return;
    }
    setError(null);
    setNotice("추가했습니다");
    setNewPrize(EMPTY);
    reload();
  }

  return (
    <section className="admin-panel">
      <header className="admin-panel-head">
        <h2>경품 관리</h2>
        <span>{loading ? "불러오는 중" : `${rows.length}개`}</span>
      </header>

      <div className="admin-add card-style">
        <PrizeFields
          idPrefix="new"
          draft={newPrize}
          onChange={(next) => setNewPrize((current) => ({ ...current, ...next }))}
        />
        <div className="settings-row settings-row-end">
          <span className="settings-hint">
            이미지는 public/에 올린 뒤 /pride.jpg처럼 경로만 적습니다.
          </span>
          <button
            type="button"
            className="chip-pill"
            disabled={adding || !newPrize.name.trim()}
            onClick={() => void add()}
          >
            추가
          </button>
        </div>
      </div>

      {error ? <p className="settings-status is-error">{error}</p> : null}
      {notice ? <p className="settings-status is-done">{notice}</p> : null}

      {!loading && rows.length === 0 ? (
        <p className="settings-hint">
          등록된 경품이 없습니다. /event 화면은 아직 코드에 박힌 목록을 보여줍니다.
        </p>
      ) : null}

      <ul className="admin-list">
        {rows.map((row) => {
          const draft = drafts[row.id] ?? draftOf(row);
          return (
            <li key={row.id} className="admin-item card-style">
              <div className="admin-item-meta">
                <strong>#{row.id}</strong>
                {!row.enabled ? <span className="admin-badge is-rejected">숨김</span> : null}
              </div>

              <PrizeFields
                idPrefix={String(row.id)}
                draft={draft}
                onChange={(next) =>
                  setDrafts((current) => ({
                    ...current,
                    [row.id]: { ...(current[row.id] ?? draftOf(row)), ...next },
                  }))
                }
              />

              <div className="admin-item-actions">
                <button
                  type="button"
                  className="chip-pill"
                  disabled={busyId === row.id || !draft.name.trim()}
                  onClick={() => void save(row)}
                >
                  저장
                </button>
                <button
                  type="button"
                  className="chip-pill"
                  data-selected={row.enabled}
                  disabled={busyId === row.id}
                  onClick={() => void toggleEnabled(row)}
                >
                  {row.enabled ? "노출 중" : "숨김"}
                </button>
                <button
                  type="button"
                  className="chip-pill admin-danger"
                  disabled={busyId === row.id}
                  aria-label={`${row.name} 삭제`}
                  onClick={() => void remove(row)}
                >
                  <Trash2 size={14} />
                  삭제
                </button>
              </div>
            </li>
          );
        })}
      </ul>
    </section>
  );
}

type PrizeFieldsProps = {
  idPrefix: string;
  draft: PrizeDraft;
  onChange: (next: Partial<PrizeDraft>) => void;
};

function PrizeFields({ idPrefix, draft, onChange }: PrizeFieldsProps) {
  return (
    <div className="admin-field-grid">
      <label htmlFor={`${idPrefix}-name`}>
        이름
        <input
          id={`${idPrefix}-name`}
          type="text"
          className="settings-input"
          value={draft.name}
          maxLength={60}
          placeholder="카드에 표시되는 이름"
          onChange={(event) => onChange({ name: event.target.value })}
        />
      </label>
      <label htmlFor={`${idPrefix}-full-name`}>
        전체 이름
        <input
          id={`${idPrefix}-full-name`}
          type="text"
          className="settings-input"
          value={draft.full_name}
          maxLength={200}
          placeholder="줄인 이름의 원래 표기 (선택)"
          onChange={(event) => onChange({ full_name: event.target.value })}
        />
      </label>
      <label htmlFor={`${idPrefix}-sponsor`}>
        협찬사
        <input
          id={`${idPrefix}-sponsor`}
          type="text"
          className="settings-input"
          value={draft.sponsor}
          maxLength={80}
          placeholder="당첨 안내에 표시됩니다"
          onChange={(event) => onChange({ sponsor: event.target.value })}
        />
      </label>
      <label htmlFor={`${idPrefix}-image`}>
        이미지 경로
        <input
          id={`${idPrefix}-image`}
          type="text"
          className="settings-input"
          value={draft.image_url}
          maxLength={300}
          placeholder="/prize.jpg"
          onChange={(event) => onChange({ image_url: event.target.value })}
        />
      </label>
      <label htmlFor={`${idPrefix}-link`}>
        링크
        <input
          id={`${idPrefix}-link`}
          type="url"
          className="settings-input"
          value={draft.link_url}
          maxLength={300}
          placeholder="https://"
          onChange={(event) => onChange({ link_url: event.target.value })}
        />
      </label>
      <label htmlFor={`${idPrefix}-sort`}>
        순서
        <input
          id={`${idPrefix}-sort`}
          type="number"
          className="settings-input"
          value={draft.sort_order}
          onChange={(event) => onChange({ sort_order: event.target.value })}
        />
      </label>
    </div>
  );
}
