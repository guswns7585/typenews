"use client";

import { Eye, EyeOff, RefreshCw, ShieldOff, Trash2 } from "lucide-react";
import { useEffect, useState } from "react";
import { formatDateTime } from "@/components/admin/labels";
import {
  PROFILE_PHOTO_BUCKET,
  publicProfilePhotoUrl,
} from "@/features/profile/profile-photo";
import { getSupabaseClient } from "@/lib/supabase/client";
import { messageOf } from "@/lib/supabase/errors";

type PhotoRow = {
  profile_id: string;
  display_name: string;
  email: string | null;
  photo_path: string | null;
  thumbnail_path: string | null;
  is_visible: boolean;
  upload_blocked: boolean;
  updated_at: string | null;
};

type RemovedPaths = {
  photo_path: string | null;
  thumbnail_path: string | null;
};

export function ProfilePhotosTab() {
  const [rows, setRows] = useState<PhotoRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const [busyId, setBusyId] = useState<string | null>(null);
  const [reloadToken, setReloadToken] = useState(0);

  useEffect(() => {
    let active = true;

    async function load() {
      const supabase = getSupabaseClient();
      if (!supabase) return;
      const { data, error: loadError } = await supabase.rpc("get_admin_profile_photos", {
        p_limit: 300,
      });
      if (!active) return;
      setLoading(false);
      if (loadError) {
        setError(messageOf(loadError, "프로필 사진 목록을 불러오지 못했습니다"));
        return;
      }
      setError(null);
      setRows((data ?? []) as PhotoRow[]);
    }

    void load();
    return () => {
      active = false;
    };
  }, [reloadToken]);

  function reload(message?: string) {
    setLoading(true);
    setNotice(message ?? null);
    setReloadToken((value) => value + 1);
  }

  async function setVisibility(row: PhotoRow, visible: boolean) {
    const supabase = getSupabaseClient();
    if (!supabase) return;
    setBusyId(row.profile_id);
    setError(null);
    const { error: actionError } = await supabase.rpc("admin_set_profile_photo_visibility", {
      p_profile_id: row.profile_id,
      p_visible: visible,
    });
    setBusyId(null);
    if (actionError) {
      setError(messageOf(actionError, "사진 노출 상태를 바꾸지 못했습니다"));
      return;
    }
    reload(visible ? "사진을 다시 표시합니다" : "사진을 랭킹에서 숨겼습니다");
  }

  async function removeAndBlock(row: PhotoRow) {
    if (!window.confirm(`${row.display_name}님의 사진을 삭제하고 새 업로드를 차단할까요?`)) return;
    const supabase = getSupabaseClient();
    if (!supabase) return;
    setBusyId(row.profile_id);
    setError(null);

    const { data, error: actionError } = await supabase.rpc("admin_remove_profile_photo", {
      p_profile_id: row.profile_id,
      p_block_upload: true,
    });
    if (actionError) {
      setBusyId(null);
      setError(messageOf(actionError, "사진을 삭제하지 못했습니다"));
      return;
    }

    const removed = ((data ?? []) as RemovedPaths[])[0];
    const paths = [removed?.photo_path, removed?.thumbnail_path].filter(
      (path): path is string => Boolean(path),
    );
    if (paths.length) {
      const { error: storageError } = await supabase.storage
        .from(PROFILE_PHOTO_BUCKET)
        .remove(paths);
      if (storageError) {
        setBusyId(null);
        setError("랭킹 노출과 업로드는 차단했지만 Storage 원본 삭제에 실패했습니다");
        setRows((current) => current.map((item) => (
          item.profile_id === row.profile_id
            ? { ...item, is_visible: false, upload_blocked: true }
            : item
        )));
        return;
      }
    }

    const { error: finalizeError } = await supabase.rpc(
      "admin_finalize_profile_photo_removal",
      { p_profile_id: row.profile_id },
    );
    if (finalizeError) {
      setBusyId(null);
      setError("Storage 사진은 삭제했지만 관리 정보 정리에 실패했습니다. 삭제를 다시 눌러주세요");
      setRows((current) => current.map((item) => (
        item.profile_id === row.profile_id
          ? { ...item, is_visible: false, upload_blocked: true }
          : item
      )));
      return;
    }

    setBusyId(null);
    reload("사진을 삭제하고 새 업로드를 차단했습니다");
  }

  async function unblock(row: PhotoRow) {
    const supabase = getSupabaseClient();
    if (!supabase) return;
    setBusyId(row.profile_id);
    setError(null);
    const { error: actionError } = await supabase.rpc("admin_unblock_profile_photo", {
      p_profile_id: row.profile_id,
    });
    setBusyId(null);
    if (actionError) {
      setError(messageOf(actionError, "업로드 차단을 해제하지 못했습니다"));
      return;
    }
    reload("프로필 사진 업로드 차단을 해제했습니다");
  }

  const supabase = getSupabaseClient();

  return (
    <section className="admin-panel">
      <div className="admin-panel-head">
        <div>
          <h2>프로필 사진 관리</h2>
          <span>신규 업로드 순 · 사용자 신고 기능 없음</span>
        </div>
        <button type="button" className="chip-pill" onClick={() => reload()} disabled={loading}>
          <RefreshCw size={14} />
          새로고침
        </button>
      </div>

      {error ? <p className="settings-status is-error">{error}</p> : null}
      {notice ? <p className="settings-status is-done">{notice}</p> : null}
      {loading ? <p className="settings-hint">불러오는 중</p> : null}
      {!loading && rows.length === 0 ? (
        <p className="settings-hint">등록된 프로필 사진이 없습니다.</p>
      ) : null}

      <ul className="admin-photo-list">
        {rows.map((row) => {
          const imageUrl = supabase
            ? publicProfilePhotoUrl(supabase, row.thumbnail_path ?? row.photo_path, row.updated_at)
            : null;
          return (
            <li key={row.profile_id} className="admin-item card-style admin-photo-item">
              <div className="admin-photo-preview" data-empty={!imageUrl}>
                {imageUrl ? (
                  // Stored files are already resized WebP assets.
                  // eslint-disable-next-line @next/next/no-img-element
                  <img src={imageUrl} alt={`${row.display_name} 프로필 사진`} />
                ) : (
                  <span>{row.upload_blocked ? "삭제됨" : "사진 없음"}</span>
                )}
              </div>
              <div className="admin-item-meta">
                <strong>{row.display_name}</strong>
                <span>{row.email ?? "이메일 없음"}</span>
                <span>{formatDateTime(row.updated_at)}</span>
                {!row.is_visible && row.photo_path ? (
                  <span className="admin-badge is-rejected">숨김</span>
                ) : null}
                {row.upload_blocked ? (
                  <span className="admin-badge is-rejected">업로드 차단</span>
                ) : null}
              </div>
              <div className="admin-item-actions">
                {row.photo_path ? (
                  <button
                    type="button"
                    className="chip-pill"
                    disabled={busyId === row.profile_id}
                    onClick={() => void setVisibility(row, !row.is_visible)}
                  >
                    {row.is_visible ? <EyeOff size={14} /> : <Eye size={14} />}
                    {row.is_visible ? "숨기기" : "다시 표시"}
                  </button>
                ) : null}
                {row.photo_path ? (
                  <button
                    type="button"
                    className="chip-pill admin-danger"
                    disabled={busyId === row.profile_id}
                    onClick={() => void removeAndBlock(row)}
                  >
                    <Trash2 size={14} />
                    삭제 및 차단
                  </button>
                ) : null}
                {row.upload_blocked ? (
                  <button
                    type="button"
                    className="chip-pill"
                    disabled={busyId === row.profile_id}
                    onClick={() => void unblock(row)}
                  >
                    <ShieldOff size={14} />
                    차단 해제
                  </button>
                ) : null}
              </div>
            </li>
          );
        })}
      </ul>
    </section>
  );
}
