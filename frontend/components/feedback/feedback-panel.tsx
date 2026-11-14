"use client";

import { LoaderCircle, MessageSquareText, Send, X } from "lucide-react";
import { useEffect, useState } from "react";
import { createPortal } from "react-dom";
import { useAuthProfile } from "@/components/auth/auth-button";
import { getSupabaseClient } from "@/lib/supabase/client";
import { useUiLanguage } from "@/lib/ui-language";

type FeedbackCategory = "bug" | "feature" | "content" | "other";

export function FeedbackPanel() {
  const { t } = useUiLanguage();
  const { signedIn } = useAuthProfile();
  const [open, setOpen] = useState(false);
  const [category, setCategory] = useState<FeedbackCategory>("bug");
  const [title, setTitle] = useState("");
  const [body, setBody] = useState("");
  const [contactEmail, setContactEmail] = useState("");
  const [website, setWebsite] = useState("");
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState("");
  const [done, setDone] = useState(false);

  useEffect(() => {
    if (!open) return undefined;
    const close = (event: KeyboardEvent) => { if (event.key === "Escape") setOpen(false); };
    document.addEventListener("keydown", close);
    return () => document.removeEventListener("keydown", close);
  }, [open]);

  async function submit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setBusy(true);
    setMessage("");
    try {
      const supabase = getSupabaseClient();
      const token = supabase ? (await supabase.auth.getSession()).data.session?.access_token : null;
      const response = await fetch("/api/feedback", {
        method: "POST",
        headers: {
          "content-type": "application/json",
          ...(token ? { authorization: `Bearer ${token}` } : {}),
        },
        body: JSON.stringify({
          category, title, body, contactEmail, website,
          pagePath: `${window.location.pathname}${window.location.search}`,
        }),
      });
      const payload = await response.json().catch(() => null) as { error?: string; id?: number } | null;
      if (!response.ok) throw new Error(payload?.error || t("보내지 못했습니다", "Could not send feedback"));
      setDone(true);
      setMessage(t(`접수했습니다${payload?.id ? ` · #${payload.id}` : ""}`, `Received${payload?.id ? ` · #${payload.id}` : ""}`));
      setTitle("");
      setBody("");
      setContactEmail("");
    } catch (error) {
      setMessage(error instanceof Error ? error.message : t("보내지 못했습니다", "Could not send feedback"));
    } finally {
      setBusy(false);
    }
  }

  const categories: Array<[FeedbackCategory, string]> = [
    ["bug", t("버그", "Bug")],
    ["feature", t("기능 제안", "Feature")],
    ["content", t("문장·콘텐츠", "Content")],
    ["other", t("기타", "Other")],
  ];

  return <div className="feedback-menu">
    <button type="button" className="chip-pill feedback-trigger" data-selected={open} aria-expanded={open} aria-haspopup="dialog" onClick={() => { setOpen((value) => !value); setDone(false); setMessage(""); }}>
      <MessageSquareText size={14} />{t("건의함", "Feedback")}
    </button>
    {open ? createPortal(<>
      <div className="settings-scrim" onClick={() => setOpen(false)} aria-hidden="true" />
      <aside className="settings-panel feedback-panel" role="dialog" aria-modal="true" aria-label={t("건의함", "Feedback")}>
        <header className="settings-panel-head"><h3>{t("건의함", "Feedback")}</h3><button type="button" className="icon-btn-circular settings-close" aria-label={t("닫기", "Close")} onClick={() => setOpen(false)}><X size={16} /></button></header>
        <form className="feedback-form" onSubmit={(event) => void submit(event)}>
          <div className="feedback-categories" role="group" aria-label={t("건의 유형", "Feedback type")}>{categories.map(([value, label]) => <button key={value} type="button" data-selected={category === value} onClick={() => setCategory(value)}>{label}</button>)}</div>
          <label><span>{t("제목", "Title")}</span><input className="settings-input" required maxLength={120} value={title} onChange={(event) => setTitle(event.target.value)} placeholder={t("무슨 내용인가요?", "What is this about?")} /></label>
          <label><span>{t("내용", "Details")}</span><textarea className="settings-textarea" required maxLength={3000} rows={8} value={body} onChange={(event) => setBody(event.target.value)} placeholder={t("문제가 생긴 상황이나 원하는 기능을 적어주세요.", "Describe the problem or feature you want.")} onKeyDown={(event) => { if ((event.ctrlKey || event.metaKey) && event.key === "Enter") event.currentTarget.form?.requestSubmit(); }} /></label>
          {!signedIn ? <label><span>{t("답변받을 이메일 (선택)", "Contact email (optional)")}</span><input className="settings-input" type="email" maxLength={254} value={contactEmail} onChange={(event) => setContactEmail(event.target.value)} /></label> : null}
          <label className="feedback-honeypot" aria-hidden="true">Website<input tabIndex={-1} autoComplete="off" value={website} onChange={(event) => setWebsite(event.target.value)} /></label>
          <p className="feedback-context">{t("현재 페이지와 브라우저 정보가 함께 전달됩니다.", "The current page and browser information are included.")}</p>
          {message ? <p className={`settings-status ${done ? "is-done" : "is-error"}`} role="status">{message}</p> : null}
          <button type="submit" className="chip-pill feedback-submit" disabled={busy || !title.trim() || !body.trim()}>{busy ? <LoaderCircle className="spinning" size={14} /> : <Send size={14} />}{t("보내기", "Send")}</button>
        </form>
      </aside>
    </>, document.body) : null}
  </div>;
}
