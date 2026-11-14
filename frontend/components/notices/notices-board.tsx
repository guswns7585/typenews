"use client";

import { LoaderCircle, Pencil, Pin, Plus, Trash2, X } from "lucide-react";
import { useCallback, useEffect, useState } from "react";
import { markNoticesSeen } from "@/components/notices/notice-unread-dot";
import { getSupabaseClient } from "@/lib/supabase/client";
import { messageOf } from "@/lib/supabase/errors";
import { useUiLanguage } from "@/lib/ui-language";
import styles from "./notices.module.css";

type Notice = {
  notice_id: number;
  title: string;
  body: string;
  category: "update" | "event" | "maintenance";
  is_pinned: boolean;
  is_published: boolean;
  published_at: string;
  updated_at: string;
};

const emptyDraft = { title: "", body: "", category: "update" as Notice["category"], is_pinned: false, is_published: true };

function isMissingNoticesRpc(error: unknown) {
  const message = messageOf(error, "");
  return message.includes("get_public_notices") && message.includes("schema cache");
}

export function NoticesBoard() {
  const { locale, t } = useUiLanguage();
  const [notices, setNotices] = useState<Notice[]>([]);
  const [loading, setLoading] = useState(true);
  const [isAdmin, setIsAdmin] = useState(false);
  const [editingId, setEditingId] = useState<number | null>(null);
  const [draft, setDraft] = useState(emptyDraft);
  const [editorOpen, setEditorOpen] = useState(false);
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState("");

  const load = useCallback(async () => {
    const supabase = getSupabaseClient();
    if (!supabase) { setLoading(false); return; }
    setLoading(true);
    const [{ data, error }, admin] = await Promise.all([
      supabase.rpc("get_public_notices", { p_limit: 50 }),
      supabase.rpc("is_admin"),
    ]);
    if (error) {
      setMessage(isMissingNoticesRpc(error)
        ? t("새소식 기능을 준비하고 있습니다", "Updates are being prepared")
        : messageOf(error, t("새소식을 불러오지 못했습니다", "Could not load updates")));
    }
    else {
      const rows = (data ?? []) as Notice[];
      setNotices(rows);
      const latest = rows.filter((row) => row.is_published).map((row) => row.updated_at).sort().at(-1);
      if (latest) markNoticesSeen(latest);
    }
    setIsAdmin(admin.data === true && !admin.error);
    setLoading(false);
  }, [t]);

  useEffect(() => { void Promise.resolve().then(load); }, [load]);

  function startNew() {
    setEditingId(null);
    setDraft(emptyDraft);
    setEditorOpen(true);
    setMessage("");
  }

  function startEdit(notice: Notice) {
    setEditingId(notice.notice_id);
    setDraft({ title: notice.title, body: notice.body, category: notice.category, is_pinned: notice.is_pinned, is_published: notice.is_published });
    setEditorOpen(true);
    setMessage("");
  }

  async function save(event: React.FormEvent) {
    event.preventDefault();
    const supabase = getSupabaseClient();
    if (!supabase) return;
    setBusy(true);
    const { error } = await supabase.rpc("admin_save_notice", {
      p_notice_id: editingId,
      p_title: draft.title.trim(),
      p_body: draft.body.trim(),
      p_category: draft.category,
      p_is_pinned: draft.is_pinned,
      p_is_published: draft.is_published,
    });
    setBusy(false);
    if (error) { setMessage(messageOf(error, t("새소식을 저장하지 못했습니다", "Could not save update"))); return; }
    setEditorOpen(false);
    setMessage(t("저장했습니다", "Saved"));
    await load();
  }

  async function remove(notice: Notice) {
    if (!window.confirm(t(`“${notice.title}”을 삭제할까요?`, `Delete “${notice.title}”?`))) return;
    const supabase = getSupabaseClient();
    if (!supabase) return;
    const { error } = await supabase.rpc("admin_delete_notice", { p_notice_id: notice.notice_id });
    if (error) { setMessage(messageOf(error, t("삭제하지 못했습니다", "Could not delete"))); return; }
    await load();
  }

  const categoryLabel = (category: Notice["category"]) => category === "event"
    ? t("이벤트", "Event")
    : category === "maintenance" ? t("점검", "Maintenance") : t("업데이트", "Update");

  return (
    <section className={styles.page}>
      <header className={styles.hero}>
        <div><span>TYPE NEWS</span><h1>{t("새소식", "Updates")}</h1></div>
        {isAdmin ? <button type="button" className={styles.primaryButton} onClick={startNew}><Plus size={16} />{t("새 글", "New post")}</button> : null}
      </header>
      {message ? <p className={styles.message} role="status">{message}</p> : null}
      {editorOpen ? <form className={styles.editor} onSubmit={(event) => void save(event)}>
        <header><h2>{editingId ? t("새소식 수정", "Edit update") : t("새소식 작성", "Write update")}</h2><button type="button" onClick={() => setEditorOpen(false)} aria-label={t("닫기", "Close")}><X size={18} /></button></header>
        <label><span>{t("제목", "Title")}</span><input autoFocus maxLength={120} required value={draft.title} onChange={(event) => setDraft((current) => ({ ...current, title: event.target.value }))} /></label>
        <label><span>{t("내용", "Body")}</span><textarea rows={8} maxLength={5000} required value={draft.body} onChange={(event) => setDraft((current) => ({ ...current, body: event.target.value }))} /></label>
        <div className={styles.editorRow}>
          <label><span>{t("분류", "Category")}</span><select value={draft.category} onChange={(event) => setDraft((current) => ({ ...current, category: event.target.value as Notice["category"] }))}><option value="update">{t("업데이트", "Update")}</option><option value="event">{t("이벤트", "Event")}</option><option value="maintenance">{t("점검", "Maintenance")}</option></select></label>
          <label className={styles.check}><input type="checkbox" checked={draft.is_pinned} onChange={(event) => setDraft((current) => ({ ...current, is_pinned: event.target.checked }))} />{t("상단 고정", "Pin")}</label>
          <label className={styles.check}><input type="checkbox" checked={draft.is_published} onChange={(event) => setDraft((current) => ({ ...current, is_published: event.target.checked }))} />{t("공개", "Published")}</label>
        </div>
        <footer><button type="button" onClick={() => setEditorOpen(false)}>{t("취소", "Cancel")}</button><button type="submit" className={styles.primaryButton} disabled={busy || !draft.title.trim() || !draft.body.trim()}>{busy ? <LoaderCircle className={styles.spinning} size={16} /> : null}{t("저장", "Save")}</button></footer>
      </form> : null}
      {loading ? <div className={styles.loading}><LoaderCircle className={styles.spinning} />{t("불러오는 중", "Loading")}</div> : notices.length ? <div className={styles.list}>{notices.map((notice) => (
        <article className={styles.notice} key={notice.notice_id} data-unpublished={!notice.is_published}>
          <header><div className={styles.meta}>{notice.is_pinned ? <Pin size={13} /> : null}<span>{categoryLabel(notice.category)}</span>{!notice.is_published ? <b>{t("비공개", "Draft")}</b> : null}<time>{new Intl.DateTimeFormat(locale === "en" ? "en-US" : "ko-KR", { year: "numeric", month: "short", day: "numeric" }).format(new Date(notice.published_at))}</time></div>{isAdmin ? <div className={styles.actions}><button type="button" onClick={() => startEdit(notice)} aria-label={t("수정", "Edit")}><Pencil size={15} /></button><button type="button" onClick={() => void remove(notice)} aria-label={t("삭제", "Delete")}><Trash2 size={15} /></button></div> : null}</header>
          <h2>{notice.title}</h2><p>{notice.body}</p>
        </article>
      ))}</div> : <div className={styles.empty}>{t("아직 새소식이 없습니다", "No updates yet")}</div>}
    </section>
  );
}
