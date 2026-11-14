"use client";

import { Bookmark, EyeOff, Flag, Heart, LoaderCircle, MessageCircle, Share2, ShieldAlert, Trash2, X } from "lucide-react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useEffect, useRef, useState } from "react";
import { useAuthProfile } from "@/components/auth/auth-button";
import { ShowcaseAudioPlayer } from "@/components/showcase/showcase-audio-player";
import { ShowcaseComments } from "@/components/showcase/showcase-comments";
import { ProfileDecorationLine } from "@/components/profile/profile-decoration-line";
import { loadProfileDecorations, type ProfileDecoration } from "@/features/profile/decorations";
import { signedShowcaseUrl } from "@/features/showcase/media";
import { SHOWCASE_BUILD_FIELD_MAP, SHOWCASE_BUILD_SECTIONS, type ShowcaseItem, type ShowcaseViewItem } from "@/features/showcase/types";
import { publicProfilePhotoUrl } from "@/features/profile/profile-photo";
import { useAdminStatus } from "@/features/admin/use-admin-status";
import { getSupabaseClient } from "@/lib/supabase/client";
import { messageOf } from "@/lib/supabase/errors";
import { useUiLanguage } from "@/lib/ui-language";
import styles from "./showcase.module.css";

export function ShowcaseDetail({ itemId }: { itemId: string }) {
  const router = useRouter();
  const { isEnglish, t } = useUiLanguage();
  const { signedIn, authReady } = useAuthProfile();
  const { isAdmin } = useAdminStatus();
  const [item, setItem] = useState<ShowcaseViewItem | null>(null);
  const [message, setMessage] = useState("");
  const [loading, setLoading] = useState(true);
  const [reportOpen, setReportOpen] = useState(false);
  const [decoration, setDecoration] = useState<ProfileDecoration | null>(null);
  const [commentCount, setCommentCount] = useState(0);

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
        try {
          const loaded = await loadProfileDecorations(supabase, [row.profile_id]);
          if (active) setDecoration(loaded.get(row.profile_id) ?? null);
        } catch { /* The item does not depend on profile decorations. */ }
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
          (detail.includes("get_showcase_item") && detail.includes("schema cache")) || detail.includes("permission denied for function current_profile_id")
            ? t("데이터베이스 준비 중", "Database setup in progress")
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
      setMessage(t("로그인 필요", "Sign-in required"));
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

  async function moderateItem(action: "hide" | "delete") {
    if (!item) return;
    const prompt = action === "delete"
      ? t("사진과 타건음을 포함해 이 항목을 영구 삭제할까요?", "Permanently delete this item and its media?")
      : t("이 항목을 즉시 아카이브에서 숨길까요?", "Hide this item from the archive now?");
    if (!window.confirm(prompt)) return;
    const supabase = getSupabaseClient();
    if (!supabase) return;
    const { error } = action === "delete"
      ? await supabase.rpc("admin_delete_showcase_item", { p_item_id: item.item_id })
      : await supabase.rpc("admin_set_showcase_hidden", { p_item_id: item.item_id, p_hidden: true });
    if (error) { setMessage(messageOf(error, t("관리 작업에 실패했습니다", "Moderation failed"))); return; }
    router.push("/showcase");
    router.refresh();
  }

  function goToComments() {
    const section = document.getElementById(`showcase-comments-${itemId}`);
    const input = document.getElementById(`showcase-comment-input-${itemId}`) as HTMLTextAreaElement | null;
    const reduceMotion = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
    section?.scrollIntoView({ behavior: reduceMotion ? "auto" : "smooth", block: "start" });
    window.setTimeout(() => input?.focus({ preventScroll: true }), reduceMotion ? 0 : 420);
  }

  if (loading) return <div className={styles.loading}><LoaderCircle className={styles.spinning} />{t("불러오는 중", "Loading")}</div>;
  if (!item) return <div className={styles.empty}><strong>{message || t("아카이브 항목이 없습니다", "Archive item unavailable")}</strong><Link href="/showcase">{t("아카이브로 돌아가기", "Back to archive")}</Link></div>;
  const buildSections = SHOWCASE_BUILD_SECTIONS.map((section) => ({
    ...section,
    fields: section.fields.filter((key) => item.build_info[key]),
  })).filter((section) => section.fields.length);

  return (
    <article className={styles.detail}>
      <Link className={styles.backLink} href="/showcase">← {t("아카이브", "Archive")}</Link>
      {isAdmin ? <aside className={styles.inlineModeration}><div><ShieldAlert size={17} /><span>{t("관리자 도구", "Moderator tools")}</span></div><button type="button" onClick={() => void moderateItem("hide")}><EyeOff size={15} />{t("즉시 숨김", "Hide")}</button><button type="button" data-danger="true" onClick={() => void moderateItem("delete")}><Trash2 size={15} />{t("영구 삭제", "Delete")}</button></aside> : null}
      <div className={styles.detailGrid}>
        <div className={styles.detailMedia}>
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img src={item.imageUrl} alt={item.title} />
          {item.audioUrl ? <ShowcaseAudioPlayer src={item.audioUrl} label={t("타건음", "Typing sound")} durationHint={item.audio_duration_ms ? item.audio_duration_ms / 1000 : undefined} /> : <span className={styles.noAudio}>{t("타건음 없음", "No typing sound")}</span>}
        </div>
        <div className={styles.detailCopy}>
          <div className={styles.detailAuthor}>
            <span className={styles.avatar} data-empty={!item.profilePhotoUrl}>
              {item.profilePhotoUrl ? (
                // eslint-disable-next-line @next/next/no-img-element
                <img src={item.profilePhotoUrl} alt="" />
              ) : item.display_name.slice(0, 1)}
            </span>
              <Link href={`/showcase?profile=${item.profile_id}`}>{item.display_name}</Link><ProfileDecorationLine decoration={decoration} />
          </div>
          <h1>{item.title}</h1>
          {item.description ? <section className={styles.buildNotes}><h2>{t("빌드 노트", "Build notes")}</h2><p className={styles.description}>{item.description}</p></section> : null}
          <div className={styles.detailActions}>
            <button type="button" disabled={!authReady} data-active={item.liked_by_me} onClick={() => void toggle("like")}><Heart size={17} fill={item.liked_by_me ? "currentColor" : "none"} />{item.like_count}</button>
            <button type="button" disabled={!authReady} data-active={item.bookmarked_by_me} onClick={() => void toggle("bookmark")}><Bookmark size={17} fill={item.bookmarked_by_me ? "currentColor" : "none"} />{item.bookmark_count}</button>
            <button type="button" onClick={() => void shareItem()}><Share2 size={16} />{t("공유", "Share")}</button>
            <button type="button" disabled={!authReady} onClick={() => { if (!signedIn) setMessage(t("로그인 필요", "Sign-in required")); else setReportOpen(true); }}><Flag size={16} />{t("신고", "Report")}</button>
          </div>
          <button type="button" className={styles.commentJumpButton} onClick={goToComments}>
            <span><MessageCircle size={17} /><strong>{commentCount ? t(`댓글 ${commentCount}개`, `${commentCount} comments`) : t("첫 댓글 남기기", "Leave the first comment")}</strong></span>
            <small>{t("댓글 남기기", "Write a comment")}</small>
          </button>
          {message ? <p className={styles.pageMessage}>{message}</p> : null}
        </div>
      </div>
      {buildSections.length ? <section className={styles.detailBuildPanel}>
        <h2>{t("빌드 정보", "Build information")}</h2>
        <div className={styles.buildDocument}>{buildSections.map((section) => (
          <section key={section.id}><h3>{isEnglish ? section.labelEn : section.label}</h3><dl className={styles.buildList}>{section.fields.map((key) => {
            const field = SHOWCASE_BUILD_FIELD_MAP[key];
            return <div key={key}><dt>{isEnglish ? field.labelEn : field.label}</dt><dd>{item.build_info[key]}</dd></div>;
          })}</dl></section>
        ))}</div>
      </section> : null}
      <ShowcaseComments itemId={item.item_id} onCountChange={setCommentCount} />
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
          <label><span>{t("상세 내용 · 선택", "Details · optional")}</span><textarea rows={5} maxLength={1000} value={details} onChange={(event) => setDetails(event.target.value)} placeholder={t("확인이 필요한 내용", "What should be reviewed")} /><small>{details.length} / 1000</small></label>
        </div>
        {error ? <p className={styles.formMessage}>{error}</p> : null}
        <footer className={styles.editorActions}><button type="button" className={styles.secondaryButton} disabled={busy} onClick={onClose}>{t("취소", "Cancel")}</button><button type="submit" className={styles.primaryButton} disabled={busy}>{busy ? <LoaderCircle className={styles.spinning} size={16} /> : <Flag size={16} />}{t("신고 보내기", "Submit report")}</button></footer>
      </form>
    </dialog>
  );
}
