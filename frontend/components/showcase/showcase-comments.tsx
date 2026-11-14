"use client";

import { Flag, LoaderCircle, MessageCircle, Reply, RotateCcw, ShieldAlert, Trash2 } from "lucide-react";
import { useCallback, useEffect, useMemo, useState } from "react";
import { useAuthProfile } from "@/components/auth/auth-button";
import { publicProfilePhotoUrl } from "@/features/profile/profile-photo";
import { getSupabaseClient } from "@/lib/supabase/client";
import { messageOf } from "@/lib/supabase/errors";
import { useUiLanguage } from "@/lib/ui-language";
import styles from "./showcase.module.css";

type CommentRow = {
  comment_id: number;
  parent_id: number | null;
  profile_id: string;
  display_name: string;
  profile_thumbnail_path: string | null;
  profile_photo_updated_at: string | null;
  body: string;
  status: "active" | "hidden" | "deleted";
  is_mine: boolean;
  is_admin: boolean;
  report_count: number;
  created_at: string;
  updated_at: string;
};

function isMissingCommentsRpc(error: unknown) {
  const message = messageOf(error, "");
  return message.includes("get_showcase_comments") && message.includes("schema cache");
}

export function ShowcaseComments({ itemId, onCountChange }: { itemId: string; onCountChange?: (count: number) => void }) {
  const { t, locale } = useUiLanguage();
  const { signedIn, authReady } = useAuthProfile();
  const [comments, setComments] = useState<CommentRow[]>([]);
  const [body, setBody] = useState("");
  const [replyTo, setReplyTo] = useState<number | null>(null);
  const [replyBody, setReplyBody] = useState("");
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState("");

  const load = useCallback(async () => {
    const supabase = getSupabaseClient();
    if (!supabase) return;
    const { data, error } = await supabase.rpc("get_showcase_comments", { p_item_id: itemId });
    if (error) {
      setMessage(isMissingCommentsRpc(error)
        ? t("댓글 기능을 준비하고 있습니다", "Comments are being prepared")
        : messageOf(error, t("댓글을 불러오지 못했습니다", "Could not load comments")));
    }
    else setComments((data ?? []) as CommentRow[]);
    setLoading(false);
  }, [itemId, t]);

  useEffect(() => { void Promise.resolve().then(load); }, [load, signedIn]);

  const roots = useMemo(() => comments.filter((comment) => comment.parent_id === null), [comments]);
  const activeCount = useMemo(() => comments.filter((comment) => comment.status === "active").length, [comments]);
  const replies = useMemo(() => {
    const grouped = new Map<number, CommentRow[]>();
    comments.forEach((comment) => { if (comment.parent_id !== null) grouped.set(comment.parent_id, [...(grouped.get(comment.parent_id) ?? []), comment]); });
    return grouped;
  }, [comments]);

  useEffect(() => { onCountChange?.(activeCount); }, [activeCount, onCountChange]);

  async function submit(text: string, parentId: number | null) {
    const value = text.trim();
    if (!value) return;
    if (!signedIn) { setMessage(t("로그인 후 댓글을 남길 수 있습니다", "Sign in to comment")); return; }
    const supabase = getSupabaseClient();
    if (!supabase) return;
    setBusy(true);
    const { error } = await supabase.rpc("create_showcase_comment", { p_item_id: itemId, p_body: value, p_parent_id: parentId });
    setBusy(false);
    if (error) { setMessage(messageOf(error, t("댓글을 저장하지 못했습니다", "Could not save comment"))); return; }
    if (parentId === null) setBody(""); else { setReplyBody(""); setReplyTo(null); }
    setMessage("");
    await load();
  }

  async function remove(comment: CommentRow) {
    if (!window.confirm(t("댓글을 삭제할까요?", "Delete this comment?"))) return;
    const supabase = getSupabaseClient();
    if (!supabase) return;
    const { error } = await supabase.rpc("delete_my_showcase_comment", { p_comment_id: comment.comment_id });
    if (error) setMessage(messageOf(error, t("댓글을 삭제하지 못했습니다", "Could not delete comment")));
    else await load();
  }

  async function report(comment: CommentRow) {
    if (!window.confirm(t("이 댓글을 관리자에게 신고할까요?", "Report this comment to a moderator?"))) return;
    const supabase = getSupabaseClient();
    if (!supabase) return;
    const { error } = await supabase.rpc("report_showcase_comment", { p_comment_id: comment.comment_id, p_reason: "inappropriate", p_details: "" });
    setMessage(error ? messageOf(error, t("신고하지 못했습니다", "Could not report")) : t("관리자에게 검토를 요청했습니다", "Review requested"));
  }

  async function moderate(comment: CommentRow, action: "hide" | "restore" | "delete") {
    if (action === "delete" && !window.confirm(t("댓글을 영구 삭제 상태로 바꿀까요?", "Permanently remove this comment?"))) return;
    const supabase = getSupabaseClient();
    if (!supabase) return;
    const { error } = await supabase.rpc("admin_moderate_showcase_comment", { p_comment_id: comment.comment_id, p_action: action });
    if (error) setMessage(messageOf(error, t("관리 작업에 실패했습니다", "Moderation failed")));
    else await load();
  }

  function Comment({ comment, nested = false }: { comment: CommentRow; nested?: boolean }) {
    const supabase = getSupabaseClient();
    const photo = supabase ? publicProfilePhotoUrl(supabase, comment.profile_thumbnail_path, comment.profile_photo_updated_at) : null;
    const canInteract = comment.status === "active";
    return <article className={styles.comment} data-nested={nested} data-status={comment.status}>
      <span className={styles.commentAvatar} data-empty={!photo}>{photo ? <>
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img src={photo} alt="" />
      </> : comment.display_name.slice(0, 1)}</span>
      <div className={styles.commentBody}>
        <header><strong>{comment.display_name}</strong><time>{new Intl.DateTimeFormat(locale === "en" ? "en-US" : "ko-KR", { month: "short", day: "numeric", hour: "2-digit", minute: "2-digit" }).format(new Date(comment.created_at))}</time>{comment.report_count ? <span className={styles.reportCount}><ShieldAlert size={12} />{comment.report_count}</span> : null}</header>
        <p>{comment.body}</p>
        <footer>
          {!nested && canInteract && signedIn ? <button type="button" onClick={() => { setReplyTo(comment.comment_id); setReplyBody(""); }}><Reply size={13} />{t("답글", "Reply")}</button> : null}
          {comment.is_mine && canInteract ? <button type="button" onClick={() => void remove(comment)}><Trash2 size={13} />{t("삭제", "Delete")}</button> : null}
          {!comment.is_mine && signedIn && canInteract ? <button type="button" onClick={() => void report(comment)}><Flag size={13} />{t("신고", "Report")}</button> : null}
          {comment.is_admin ? <>
            {comment.status === "active" ? <button type="button" className={styles.moderatorAction} onClick={() => void moderate(comment, "hide")}><ShieldAlert size={13} />{t("숨김", "Hide")}</button> : comment.status === "hidden" ? <button type="button" className={styles.moderatorAction} onClick={() => void moderate(comment, "restore")}><RotateCcw size={13} />{t("복구", "Restore")}</button> : null}
            {comment.status !== "deleted" ? <button type="button" className={styles.moderatorAction} onClick={() => void moderate(comment, "delete")}><Trash2 size={13} />{t("관리자 삭제", "Remove")}</button> : null}
          </> : null}
        </footer>
        {replyTo === comment.comment_id ? <div className={styles.replyComposer}><textarea autoFocus maxLength={500} rows={2} value={replyBody} onChange={(event) => setReplyBody(event.target.value)} placeholder={t("답글 쓰기", "Write a reply")} /><div><button type="button" onClick={() => setReplyTo(null)}>{t("취소", "Cancel")}</button><button type="button" disabled={busy || !replyBody.trim()} onClick={() => void submit(replyBody, comment.comment_id)}>{t("등록", "Post")}</button></div></div> : null}
      </div>
    </article>;
  }

  return <section className={styles.commentsPanel} id={`showcase-comments-${itemId}`}>
    <header className={styles.commentsHeading}><div><MessageCircle size={18} /><h2>{t("댓글", "Comments")}</h2><span>{activeCount}</span></div></header>
    <div className={styles.commentComposer}><textarea id={`showcase-comment-input-${itemId}`} aria-label={t("댓글 입력", "Comment input")} maxLength={500} rows={3} value={body} onChange={(event) => setBody(event.target.value)} disabled={!authReady || busy} placeholder={signedIn ? t("이 키보드에 대해 이야기해 보세요", "Talk about this keyboard") : t("로그인 후 댓글을 남길 수 있습니다", "Sign in to comment")} /><div><span>{body.length} / 500</span><button type="button" disabled={!signedIn || busy || !body.trim()} onClick={() => void submit(body, null)}>{busy ? <LoaderCircle className={styles.spinning} size={14} /> : null}{t("댓글 등록", "Post comment")}</button></div></div>
    {message ? <p className={styles.pageMessage} role="status">{message}</p> : null}
    {loading ? <div className={styles.commentsLoading}><LoaderCircle className={styles.spinning} />{t("댓글 불러오는 중", "Loading comments")}</div> : roots.length ? <div className={styles.commentList}>{roots.map((comment) => <div key={comment.comment_id}><Comment comment={comment} />{(replies.get(comment.comment_id) ?? []).map((reply) => <Comment key={reply.comment_id} comment={reply} nested />)}</div>)}</div> : <p className={styles.commentsEmpty}>{t("첫 댓글을 남겨 보세요", "Start the conversation")}</p>}
  </section>;
}
