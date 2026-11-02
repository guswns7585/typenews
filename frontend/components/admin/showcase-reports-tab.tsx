"use client";

import { Eye, EyeOff, ExternalLink, RefreshCw, RotateCcw, X } from "lucide-react";
import Link from "next/link";
import { useEffect, useState } from "react";
import { formatDateTime } from "@/components/admin/labels";
import { signedShowcaseUrl } from "@/features/showcase/media";
import { getSupabaseClient } from "@/lib/supabase/client";
import { messageOf } from "@/lib/supabase/errors";

type ReportRow = {
  report_id: number;
  item_id: string;
  item_title: string;
  image_path: string;
  thumbnail_path: string;
  item_status: "draft" | "published" | "hidden";
  owner_name: string;
  reporter_name: string;
  reason: string;
  details: string;
  created_at: string;
  reviewed_at: string | null;
  thumbnailUrl?: string | null;
  imageUrl?: string | null;
};

const REASONS: Record<string, string> = {
  inappropriate: "부적절한 콘텐츠",
  copyright: "저작권",
  spam: "도배·광고",
  privacy: "개인정보",
  other: "기타",
};

export function ShowcaseReportsTab() {
  const [reviewed, setReviewed] = useState(false);
  const [rows, setRows] = useState<ReportRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [busyId, setBusyId] = useState<number | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const [preview, setPreview] = useState<ReportRow | null>(null);
  const [reloadToken, setReloadToken] = useState(0);

  useEffect(() => {
    let active = true;
    async function load() {
      const supabase = getSupabaseClient();
      if (!supabase) return;
      const { data, error: loadError } = await supabase.rpc("get_admin_showcase_reports", { p_reviewed: reviewed, p_limit: 200 });
      if (!active) return;
      if (loadError) { setError(messageOf(loadError, "아카이브 신고를 불러오지 못했습니다")); setLoading(false); return; }
      const source = (data ?? []) as ReportRow[];
      const resolved = await Promise.all(source.map(async (row) => {
        try {
          const [thumbnailUrl, imageUrl] = await Promise.all([signedShowcaseUrl(supabase, row.thumbnail_path), signedShowcaseUrl(supabase, row.image_path)]);
          return { ...row, thumbnailUrl, imageUrl };
        } catch { return { ...row, thumbnailUrl: null, imageUrl: null }; }
      }));
      if (!active) return;
      setRows(resolved);
      setError(null);
      setLoading(false);
    }
    void load();
    return () => { active = false; };
  }, [reviewed, reloadToken]);

  function reload(message?: string) {
    setNotice(message ?? null);
    setLoading(true);
    setReloadToken((value) => value + 1);
  }

  async function review(row: ReportRow, action: "dismiss" | "hide") {
    const supabase = getSupabaseClient();
    if (!supabase) return;
    setBusyId(row.report_id);
    const { error: actionError } = await supabase.rpc("admin_review_showcase_report", { p_report_id: row.report_id, p_action: action });
    setBusyId(null);
    if (actionError) { setError(messageOf(actionError, "신고를 처리하지 못했습니다")); return; }
    reload(action === "hide" ? "항목을 숨기고 신고를 처리했습니다" : "신고를 기각 처리했습니다");
  }

  async function restore(row: ReportRow) {
    const supabase = getSupabaseClient();
    if (!supabase) return;
    setBusyId(row.report_id);
    const { error: actionError } = await supabase.rpc("admin_set_showcase_hidden", { p_item_id: row.item_id, p_hidden: false });
    setBusyId(null);
    if (actionError) { setError(messageOf(actionError, "항목을 복구하지 못했습니다")); return; }
    reload("항목을 다시 공개했습니다");
  }

  return (
    <section className="admin-panel">
      <header className="admin-panel-head"><div><h2>아카이브 신고</h2><span>{loading ? "불러오는 중" : `${rows.length}건`}</span></div><button type="button" className="chip-pill" disabled={loading} onClick={() => reload()}><RefreshCw size={14} />새로고침</button></header>
      <div className="settings-row"><button type="button" className="chip-pill" data-selected={!reviewed} onClick={() => { setReviewed(false); setLoading(true); }}>검토 대기</button><button type="button" className="chip-pill" data-selected={reviewed} onClick={() => { setReviewed(true); setLoading(true); }}>처리 완료</button></div>
      {error ? <p className="settings-status is-error">{error}</p> : null}
      {notice ? <p className="settings-status is-done">{notice}</p> : null}
      {!loading && !rows.length ? <p className="settings-hint">해당하는 신고가 없습니다.</p> : null}
      <ul className="admin-list">{rows.map((row) => (
        <li className="admin-item card-style admin-showcase-report" key={row.report_id}>
          <button type="button" className="admin-showcase-thumb" disabled={!row.imageUrl} onClick={() => row.imageUrl && setPreview(row)}>{row.thumbnailUrl ? (
            // eslint-disable-next-line @next/next/no-img-element
            <img src={row.thumbnailUrl} alt="" />
          ) : <span>사진 없음</span>}</button>
          <div className="admin-showcase-report-body">
            <div className="admin-item-meta"><strong>{row.item_title}</strong><span>작성자 {row.owner_name}</span><span>신고자 {row.reporter_name}</span><span>{formatDateTime(row.created_at)}</span><span className={`admin-badge ${row.item_status === "hidden" ? "is-rejected" : "is-accepted"}`}>{row.item_status === "hidden" ? "숨김" : "공개"}</span></div>
            <p className="admin-item-text"><strong>{REASONS[row.reason] ?? row.reason}</strong>{row.details ? ` · ${row.details}` : ""}</p>
            <div className="admin-item-actions">{row.item_status === "published" ? <Link className="chip-pill" href={`/showcase/${row.item_id}`} target="_blank"><ExternalLink size={14} />상세 보기</Link> : null}{!reviewed ? <><button type="button" className="chip-pill" disabled={busyId === row.report_id} onClick={() => void review(row, "dismiss")}><Eye size={14} />문제없음</button><button type="button" className="chip-pill admin-danger" disabled={busyId === row.report_id || row.item_status === "hidden"} onClick={() => void review(row, "hide")}><EyeOff size={14} />숨기기</button></> : row.item_status === "hidden" ? <button type="button" className="chip-pill" disabled={busyId === row.report_id} onClick={() => void restore(row)}><RotateCcw size={14} />다시 공개</button> : null}</div>
          </div>
        </li>
      ))}</ul>
      {preview?.imageUrl ? (
        <div className="admin-photo-lightbox" role="presentation" onMouseDown={(event) => { if (event.target === event.currentTarget) setPreview(null); }}>
          <div className="admin-photo-lightbox-dialog" role="dialog" aria-modal="true" aria-label={`${preview.item_title} 사진 전체 보기`}>
            <div className="admin-photo-lightbox-head"><strong>{preview.item_title}</strong><button type="button" className="icon-btn-circular" onClick={() => setPreview(null)} aria-label="사진 닫기"><X size={18} /></button></div>
            <div className="admin-photo-lightbox-image">
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img src={preview.imageUrl} alt={preview.item_title} />
            </div>
          </div>
        </div>
      ) : null}
    </section>
  );
}
