"use client";

import { Bookmark, ExternalLink, Flag, Heart, LoaderCircle, Music2, Share2, X } from "lucide-react";
import Link from "next/link";
import { useEffect, useRef, useState } from "react";
import { useAuthProfile } from "@/components/auth/auth-button";
import { signedShowcaseUrl } from "@/features/showcase/media";
import { SHOWCASE_BUILD_FIELDS, type ShowcaseItem, type ShowcaseViewItem } from "@/features/showcase/types";
import { publicProfilePhotoUrl } from "@/features/profile/profile-photo";
import { getSupabaseClient } from "@/lib/supabase/client";
import { messageOf } from "@/lib/supabase/errors";
import { useUiLanguage } from "@/lib/ui-language";
import styles from "./showcase.module.css";

export function ShowcaseDetail({ itemId }: { itemId: string }) {
  const { isEnglish, t } = useUiLanguage();
  const { signedIn, authReady } = useAuthProfile();
  const [item, setItem] = useState<ShowcaseViewItem | null>(null);
  const [message, setMessage] = useState("");
  const [loading, setLoading] = useState(true);
  const [reportOpen, setReportOpen] = useState(false);

  useEffect(() => {
    const supabase = getSupabaseClient();
    if (!supabase) return;
    let active = true;
    void (async () => {
      try {
        const result = await supabase.rpc("get_showcase_item", { p_item_id: itemId });
        if (!active) return;
        if (result.error) throw result.error;
        const row = ((result.data ?? []) as ShowcaseItem[])[0];
        if (!row) throw new Error(t("아카이브 항목을 찾을 수 없습니다", "Archive item not found"));
        const [imageUrl, thumbnailUrl, audioUrl] = await Promise.all([
          signedShowcaseUrl(supabase, row.image_path),
          signedShowcaseUrl(supabase, row.thumbnail_path),
          signedShowcaseUrl(supabase, row.audio_path),
        ]);
        if (!imageUrl || !thumbnailUrl) throw new Error(t("사진을 불러오지 못했습니다", "Could not load the photo"));
        if (!active) return;
        setItem({
          ...row,
          imageUrl,
          thumbnailUrl,
          audioUrl,
          profilePhotoUrl: publicProfilePhotoUrl(supabase, row.profile_thumbnail_path, row.profile_photo_updated_at),
        });
      } catch (error) {
        if (!active) return;
        const detail = messageOf(error, t("아카이브 항목을 불러오지 못했습니다", "Could not load the archive item"));
        setMessage(
          detail.includes("get_showcase_item") && detail.includes("schema cache")
            ? t("아카이브 데이터베이스를 준비하는 중입니다", "The archive database is being prepared")
            : detail,
        );
      } finally { if (active) setLoading(false); }
    })();
    return () => { active = false; };
  }, [itemId, signedIn, t]);

  async function toggle(kind: "like" | "bookmark") {
    const supabase = getSupabaseClient();
    if (!supabase || !item) return;
    if (!signedIn) {
      setMessage(t("로그인 후 사용할 수 있습니다", "Sign in to continue"));
      return;
    }
    const { data, error } = await supabase.rpc(kind === "like" ? "toggle_showcase_like" : "toggle_showcase_bookmark", { p_item_id: item.item_id });
    if (error) { setMessage(messageOf(error, t("반응을 저장하지 못했습니다", "Could not save your reaction"))); return; }
    const result = ((data ?? []) as { active: boolean; count: number }[])[0];
    if (!result) return;
    setItem((current) => current ? {
      ...current,
      ...(kind === "like"
        ? { liked_by_me: result.active, like_count: result.count }
        : { bookmarked_by_me: result.active, bookmark_count: result.count }),
    } : current);
  }

  async function shareItem() {
    if (!item) return;
    const share = { title: `${item.title} · TypeNews Archive`, text: item.description.slice(0, 120), url: window.location.href };
    try {
      if (navigator.share) {
        await navigator.share(share);
        setMessage(t("공유했습니다", "Shared"));
      } else {
        await navigator.clipboard.writeText(share.url);
        setMessage(t("아카이브 주소를 복사했습니다", "Archive link copied"));
      }
    } catch (error) {
      if (error instanceof DOMException && error.name === "AbortError") return;
      setMessage(t("주소를 복사하지 못했습니다", "Could not copy the archive link"));
    }
  }

  if (loading) return <div className={styles.loading}><LoaderCircle className={styles.spinning} />{t("아카이브 항목을 여는 중입니다", "Opening archive item")}</div>;
  if (!item) return <div className={styles.empty}><strong>{message || t("아카이브 항목이 없습니다", "Archive item unavailable")}</strong><Link href="/showcase">{t("아카이브로 돌아가기", "Back to archive")}</Link></div>;

  return (
    <article className={styles.detail}>
      <Link className={styles.backLink} href="/showcase">← {t("아카이브", "Archive")}</Link>
      <div className={styles.detailGrid}>
        <div className={styles.detailMedia}>
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img src={item.imageUrl} alt={item.title} />
          {item.audioUrl ? <audio controls preload="metadata" src={item.audioUrl} /> : <span className={styles.noAudio}><Music2 size={14} />{t("등록된 타건음이 없습니다", "No typing sound uploaded")}</span>}
        </div>
        <div className={styles.detailCopy}>
          <div className={styles.detailAuthor}>
            <span className={styles.avatar} data-empty={!item.profilePhotoUrl}>
              {item.profilePhotoUrl ? (
                // eslint-disable-next-line @next/next/no-img-element
                <img src={item.profilePhotoUrl} alt="" />
              ) : item.display_name.slice(0, 1)}
            </span>
              <Link href={`/showcase?profile=${item.profile_id}`}>{item.display_name}</Link>
          </div>
          <h1>{item.title}</h1>
          {item.description ? <p className={styles.description}>{item.description}</p> : null}
          <dl className={styles.buildList}>
            {SHOWCASE_BUILD_FIELDS.map(([key, label, labelEn]) => item.build_info[key] ? (
              <div key={key}><dt>{isEnglish ? labelEn : label}</dt><dd>{item.build_info[key]}</dd></div>
            ) : null)}
          </dl>
          {item.keyxif_url ? <a className={styles.keyxifLink} href={item.keyxif_url} target="_blank" rel="noreferrer">KeyXIF <ExternalLink size={14} /></a> : null}
          <div className={styles.detailActions}>
            <button type="button" disabled={!authReady} data-active={item.liked_by_me} onClick={() => void toggle("like")}><Heart size={17} fill={item.liked_by_me ? "currentColor" : "none"} />{item.like_count}</button>
            <button type="button" disabled={!authReady} data-active={item.bookmarked_by_me} onClick={() => void toggle("bookmark")}><Bookmark size={17} fill={item.bookmarked_by_me ? "currentColor" : "none"} />{item.bookmark_count}</button>
            <button type="button" onClick={() => void shareItem()}><Share2 size={16} />{t("공유", "Share")}</button>
            <button type="button" disabled={!authReady} onClick={() => { if (!signedIn) setMessage(t("신고는 로그인 후 사용할 수 있습니다", "Sign in to report")); else setReportOpen(true); }}><Flag size={16} />{t("신고", "Report")}</button>
          </div>
          {message ? <p className={styles.pageMessage}>{message}</p> : null}
        </div>
      </div>
      {reportOpen ? <ShowcaseReportDialog itemId={item.item_id} onClose={() => setReportOpen(false)} onReported={() => { setReportOpen(false); setMessage(t("관리자에게 검토를 요청했습니다", "Review requested")); }} /> : null}
    </article>
  );
}

function ShowcaseReportDialog({ itemId, onClose, onReported }: { itemId: string; onClose: () => void; onReported: () => void }) {
  const { t } = useUiLanguage();
  const dialogRef = useRef<HTMLDialogElement>(null);
  const [reason, setReason] = useState("inappropriate");
  const [details, setDetails] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  useEffect(() => { dialogRef.current?.showModal(); }, []);

  async function submit(event: React.FormEvent) {
    event.preventDefault();
    const supabase = getSupabaseClient();
    if (!supabase) return;
    setBusy(true);
    const { error: reportError } = await supabase.rpc("report_showcase_item", { p_item_id: itemId, p_reason: reason, p_details: details.trim() });
    setBusy(false);
    if (reportError) { setError(messageOf(reportError, t("신고하지 못했습니다", "Could not report"))); return; }
    onReported();
  }

  return (
    <dialog ref={dialogRef} className={`${styles.editor} ${styles.reportDialog}`} onCancel={(event) => { event.preventDefault(); if (!busy) onClose(); }}>
      <form onSubmit={(event) => void submit(event)}>
        <header className={styles.editorHeader}><div><span>{t("REPORT", "REPORT")}</span><h2>{t("아카이브 신고", "Report archive item")}</h2></div><button type="button" className={styles.iconButton} disabled={busy} onClick={onClose} aria-label={t("닫기", "Close")}><X size={18} /></button></header>
        <div className={styles.reportFields}>
          <label><span>{t("신고 사유", "Reason")}</span><select value={reason} onChange={(event) => setReason(event.target.value)}><option value="inappropriate">{t("부적절한 콘텐츠", "Inappropriate content")}</option><option value="copyright">{t("저작권 침해", "Copyright")}</option><option value="spam">{t("도배·광고", "Spam or advertising")}</option><option value="privacy">{t("개인정보 노출", "Privacy")}</option><option value="other">{t("기타", "Other")}</option></select></label>
          <label><span>{t("상세 내용 · 선택 사항", "Details · optional")}</span><textarea rows={5} maxLength={1000} value={details} onChange={(event) => setDetails(event.target.value)} placeholder={t("관리자가 확인할 내용을 적어 주세요.", "Tell the moderator what to review.")} /><small>{details.length} / 1000</small></label>
        </div>
        {error ? <p className={styles.formMessage}>{error}</p> : null}
        <footer className={styles.editorActions}><button type="button" className={styles.secondaryButton} disabled={busy} onClick={onClose}>{t("취소", "Cancel")}</button><button type="submit" className={styles.primaryButton} disabled={busy}>{busy ? <LoaderCircle className={styles.spinning} size={16} /> : <Flag size={16} />}{t("신고 보내기", "Submit report")}</button></footer>
      </form>
    </dialog>
  );
}
