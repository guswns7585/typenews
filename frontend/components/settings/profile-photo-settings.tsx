"use client";

import { ImagePlus, LoaderCircle, Trash2 } from "lucide-react";
import { useEffect, useRef, useState } from "react";
import {
  prepareProfilePhoto,
  PROFILE_PHOTO_BUCKET,
  PROFILE_PHOTO_UPDATED_EVENT,
  publicProfilePhotoUrl,
} from "@/features/profile/profile-photo";
import { getSupabaseClient } from "@/lib/supabase/client";
import { messageOf } from "@/lib/supabase/errors";
import { useUiLanguage } from "@/lib/ui-language";

type PhotoRow = {
  profile_id: string;
  photo_path: string | null;
  thumbnail_path: string | null;
  updated_at: string | null;
};

type Status = { kind: "idle" | "busy" | "done" | "error"; message?: string };

export function ProfilePhotoSettings() {
  const { t } = useUiLanguage();
  const inputRef = useRef<HTMLInputElement>(null);
  const [profileId, setProfileId] = useState<string | null>(null);
  const [photoUrl, setPhotoUrl] = useState<string | null>(null);
  const [status, setStatus] = useState<Status>({ kind: "idle" });

  useEffect(() => {
    const supabase = getSupabaseClient();
    if (!supabase) return;
    let active = true;

    void supabase.rpc("get_my_profile_photo").then(({ data, error }) => {
      if (!active) return;
      if (error) {
        setStatus({ kind: "error", message: t("사진 정보를 불러오지 못했습니다", "Could not load your profile photo") });
        return;
      }
      const row = ((data ?? []) as PhotoRow[])[0];
      if (!row) return;
      setProfileId(row.profile_id);
      setPhotoUrl(publicProfilePhotoUrl(supabase, row.photo_path, row.updated_at));
    });

    return () => {
      active = false;
    };
  }, [t]);

  async function upload(file: File) {
    const supabase = getSupabaseClient();
    if (!supabase || !profileId) return;
    setStatus({ kind: "busy", message: t("사진을 최적화하는 중입니다", "Optimizing photo") });

    try {
      const prepared = await prepareProfilePhoto(file);
      const photoPath = `${profileId}/photo.webp`;
      const thumbnailPath = `${profileId}/ranking.webp`;

      const [photoUpload, thumbnailUpload] = await Promise.all([
        supabase.storage.from(PROFILE_PHOTO_BUCKET).upload(photoPath, prepared.photo, {
          cacheControl: "31536000",
          contentType: "image/webp",
          upsert: true,
        }),
        supabase.storage.from(PROFILE_PHOTO_BUCKET).upload(thumbnailPath, prepared.thumbnail, {
          cacheControl: "31536000",
          contentType: "image/webp",
          upsert: true,
        }),
      ]);
      if (photoUpload.error) throw photoUpload.error;
      if (thumbnailUpload.error) throw thumbnailUpload.error;

      const { error } = await supabase.rpc("save_my_profile_photo", {
        p_photo_path: photoPath,
        p_thumbnail_path: thumbnailPath,
        p_photo_width: prepared.width,
        p_photo_height: prepared.height,
        p_photo_bytes: prepared.photo.size,
        p_thumbnail_bytes: prepared.thumbnail.size,
      });
      if (error) throw error;

      const updatedAt = new Date().toISOString();
      setPhotoUrl(publicProfilePhotoUrl(supabase, photoPath, updatedAt));
      setStatus({ kind: "done", message: t("프로필 사진을 저장했습니다", "Profile photo saved") });
      window.dispatchEvent(new CustomEvent(PROFILE_PHOTO_UPDATED_EVENT));
    } catch (error) {
      setStatus({
        kind: "error",
        message: messageOf(error, t("사진을 저장하지 못했습니다", "Could not save the photo")),
      });
    } finally {
      if (inputRef.current) inputRef.current.value = "";
    }
  }

  async function remove() {
    const supabase = getSupabaseClient();
    if (!supabase || !profileId) return;
    setStatus({ kind: "busy", message: t("사진을 삭제하는 중입니다", "Removing photo") });
    const paths = [`${profileId}/photo.webp`, `${profileId}/ranking.webp`];
    const storageResult = await supabase.storage.from(PROFILE_PHOTO_BUCKET).remove(paths);
    if (storageResult.error) {
      setStatus({ kind: "error", message: messageOf(storageResult.error, t("사진을 삭제하지 못했습니다", "Could not remove the photo")) });
      return;
    }
    const { error } = await supabase.rpc("remove_my_profile_photo");
    if (error) {
      setStatus({ kind: "error", message: messageOf(error, t("사진 정보를 삭제하지 못했습니다", "Could not remove photo information")) });
      return;
    }
    setPhotoUrl(null);
    setStatus({ kind: "done", message: t("프로필 사진을 삭제했습니다", "Profile photo removed") });
    window.dispatchEvent(new CustomEvent(PROFILE_PHOTO_UPDATED_EVENT));
  }

  return (
    <section className="settings-section profile-photo-settings">
      <h4>{t("프로필 사진", "Profile photo")}</h4>
      <div className="profile-photo-settings-row">
        <div className="profile-photo-preview" data-empty={!photoUrl}>
          {photoUrl ? (
            // Already optimized by prepareProfilePhoto; avoid another image proxy request.
            // eslint-disable-next-line @next/next/no-img-element
            <img src={photoUrl} alt="" />
          ) : <ImagePlus size={22} aria-hidden="true" />}
        </div>
        <div className="profile-photo-actions">
          <input
            ref={inputRef}
            className="visually-hidden"
            type="file"
            accept="image/jpeg,image/png,image/webp,.jpg,.jpeg,.png,.webp"
            aria-label={t("프로필 사진 선택", "Choose a profile photo")}
            onChange={(event) => {
              const file = event.target.files?.[0];
              if (file) void upload(file);
            }}
          />
          <div className="settings-row">
            <button
              type="button"
              className="chip-pill"
              disabled={!profileId || status.kind === "busy"}
              onClick={() => inputRef.current?.click()}
            >
              {status.kind === "busy" ? <LoaderCircle className="is-spinning" size={14} /> : <ImagePlus size={14} />}
              {photoUrl ? t("사진 변경", "Change") : t("사진 추가", "Add photo")}
            </button>
            {photoUrl ? (
              <button type="button" className="icon-btn-circular" disabled={status.kind === "busy"} title={t("사진 삭제", "Remove photo")} onClick={() => void remove()}>
                <Trash2 size={14} />
              </button>
            ) : null}
          </div>
          <p className="settings-hint">{t("JPG, PNG, WebP · 원본 8MB 이하", "JPG, PNG, WebP · source up to 8MB")}</p>
        </div>
      </div>
      {status.message ? <p className={`settings-status is-${status.kind}`}>{status.message}</p> : null}
    </section>
  );
}
