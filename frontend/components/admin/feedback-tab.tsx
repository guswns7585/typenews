"use client";

import { LoaderCircle, Save } from "lucide-react";
import { useCallback, useEffect, useState } from "react";
import { getSupabaseClient } from "@/lib/supabase/client";
import { messageOf } from "@/lib/supabase/errors";

type FeedbackStatus = "received" | "reviewing" | "planned" | "completed" | "declined";
type FeedbackRow = {
  feedback_id: number;
  profile_id: string | null;
  display_name: string;
  account_email: string | null;
  category: "bug" | "feature" | "content" | "other";
  title: string;
  body: string;
  page_path: string;
  user_agent: string;
  contact_email: string | null;
  status: FeedbackStatus;
  admin_reply: string;
  created_at: string;
  updated_at: string;
};

const STATUS_LABEL: Record<FeedbackStatus, string> = { received: "접수", reviewing: "확인 중", planned: "반영 예정", completed: "완료", declined: "보류" };
const CATEGORY_LABEL = { bug: "버그", feature: "기능 제안", content: "문장·콘텐츠", other: "기타" } as const;

export function FeedbackTab() {
  const [rows, setRows] = useState<FeedbackRow[]>([]);
  const [filter, setFilter] = useState<FeedbackStatus | "all">("all");
  const [loading, setLoading] = useState(true);
  const [busyId, setBusyId] = useState<number | null>(null);
  const [message, setMessage] = useState("");

  const load = useCallback(async () => {
    const supabase = getSupabaseClient();
    if (!supabase) return;
    setLoading(true);
    setMessage("");
    const { data, error } = await supabase.rpc("get_admin_feedback", { p_status: filter === "all" ? null : filter, p_limit: 300 });
    if (error) setMessage(messageOf(error, "건의사항을 불러오지 못했습니다"));
    else setRows((data ?? []) as FeedbackRow[]);
    setLoading(false);
  }, [filter]);

  useEffect(() => { void Promise.resolve().then(load); }, [load]);

  async function save(row: FeedbackRow) {
    const supabase = getSupabaseClient();
    if (!supabase) return;
    setBusyId(row.feedback_id);
    const { error } = await supabase.rpc("admin_update_feedback", { p_feedback_id: row.feedback_id, p_status: row.status, p_admin_reply: row.admin_reply });
    setBusyId(null);
    if (error) setMessage(messageOf(error, "저장하지 못했습니다"));
    else { setMessage(`#${row.feedback_id} 저장 완료`); await load(); }
  }

  function update(id: number, patch: Partial<FeedbackRow>) {
    setRows((current) => current.map((row) => row.feedback_id === id ? { ...row, ...patch } : row));
  }

  return <section className="admin-section feedback-admin">
    <header className="admin-section-head"><div><h2>건의함</h2><p>버그 제보와 기능 제안을 확인합니다.</p></div><div className="admin-filter-row"><select value={filter} onChange={(event) => setFilter(event.target.value as FeedbackStatus | "all")}><option value="all">전체</option>{Object.entries(STATUS_LABEL).map(([value, label]) => <option key={value} value={value}>{label}</option>)}</select><button type="button" className="admin-control-button" onClick={() => void load()}>새로고침</button></div></header>
    {message ? <p className="settings-status" role="status">{message}</p> : null}
    {loading ? <div className="admin-empty"><LoaderCircle className="spinning" />불러오는 중</div> : rows.length ? <div className="feedback-admin-list">{rows.map((row) => <article key={row.feedback_id} className="feedback-admin-card">
      <header><div><span>#{row.feedback_id}</span><b>{CATEGORY_LABEL[row.category]}</b><time>{new Intl.DateTimeFormat("ko-KR", { dateStyle: "medium", timeStyle: "short" }).format(new Date(row.created_at))}</time></div><select value={row.status} onChange={(event) => update(row.feedback_id, { status: event.target.value as FeedbackStatus })}>{Object.entries(STATUS_LABEL).map(([value, label]) => <option key={value} value={value}>{label}</option>)}</select></header>
      <h3>{row.title}</h3><p className="feedback-admin-body">{row.body}</p>
      <dl><div><dt>작성자</dt><dd>{row.display_name}{row.account_email ? ` · ${row.account_email}` : ""}</dd></div>{row.contact_email ? <div><dt>연락처</dt><dd>{row.contact_email}</dd></div> : null}<div><dt>페이지</dt><dd>{row.page_path || "-"}</dd></div><div><dt>환경</dt><dd>{row.user_agent || "-"}</dd></div></dl>
      <label><span>관리 메모·답변</span><textarea className="settings-textarea" rows={3} maxLength={3000} value={row.admin_reply} onChange={(event) => update(row.feedback_id, { admin_reply: event.target.value })} /></label>
      <footer><button type="button" className="admin-control-button" disabled={busyId === row.feedback_id} onClick={() => void save(row)}>{busyId === row.feedback_id ? <LoaderCircle className="spinning" size={14} /> : <Save size={14} />}저장</button></footer>
    </article>)}</div> : <div className="admin-empty">접수된 내용이 없습니다.</div>}
  </section>;
}
