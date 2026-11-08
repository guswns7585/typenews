"use client";

import { LoaderCircle, Mic, X } from "lucide-react";
import { useRouter } from "next/navigation";
import { useEffect, useMemo, useRef, useState } from "react";
import { ShowcaseAudioPlayer } from "@/components/showcase/showcase-audio-player";
import { removeShowcaseDraft, saveShowcaseDraft, type ShowcaseEditorDraft } from "@/features/showcase/audio-draft";
import { inspectShowcaseAudio, prepareShowcaseImage, SHOWCASE_BUCKET } from "@/features/showcase/media";
import { SHOWCASE_BUILD_FIELD_MAP, SHOWCASE_BUILD_SECTIONS, type MyShowcaseItem, type ShowcaseBuildInfo, type ShowcaseBuildKey } from "@/features/showcase/types";
import { getSupabaseClient } from "@/lib/supabase/client";
import { messageOf } from "@/lib/supabase/errors";
import { useUiLanguage } from "@/lib/ui-language";
import styles from "./showcase.module.css";

type CreatedRow = { item_id: string; profile_id: string };
type EditableItem = MyShowcaseItem & { thumbnailUrl?: string | null };
type Props = { item?: EditableItem | null; restoredDraft?: ShowcaseEditorDraft | null; onClose: () => void; onSaved: () => void };

export function ShowcaseEditor({ item, restoredDraft, onClose, onSaved }: Props) {
  const { isEnglish, t } = useUiLanguage();
  const router = useRouter();
  const sourceItem = restoredDraft?.item ?? item;
  const dialogRef = useRef<HTMLDialogElement>(null);
  const [title, setTitle] = useState(restoredDraft?.title ?? sourceItem?.title ?? "");
  const [description, setDescription] = useState(restoredDraft?.description ?? sourceItem?.description ?? "");
  const keyxifUrl = restoredDraft?.keyxifUrl ?? sourceItem?.keyxif_url ?? "";
  const [build, setBuild] = useState<ShowcaseBuildInfo>(restoredDraft?.build ?? sourceItem?.build_info ?? {});
  const [image, setImage] = useState<File | null>(restoredDraft?.image ?? null);
  const [audio, setAudio] = useState<File | null>(restoredDraft?.audio ?? null);
  const [audioDurationMs, setAudioDurationMs] = useState<number | null>(restoredDraft?.audioDurationMs ?? sourceItem?.audio_duration_ms ?? null);
  const [removeAudio, setRemoveAudio] = useState(restoredDraft?.removeAudio ?? false);
  const keyxifSnapshot = restoredDraft?.keyxifSnapshot ?? sourceItem?.keyxif_snapshot ?? null;
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState("");
  const editing = Boolean(sourceItem);
  const localImageUrl = useMemo(() => image ? URL.createObjectURL(image) : null, [image]);
  const audioPreview = useMemo(() => audio ? URL.createObjectURL(audio) : null, [audio]);
  const imagePreview = localImageUrl ?? sourceItem?.thumbnailUrl ?? null;

  useEffect(() => { dialogRef.current?.showModal(); }, []);
  useEffect(() => () => { if (localImageUrl) URL.revokeObjectURL(localImageUrl); }, [localImageUrl]);
  useEffect(() => () => { if (audioPreview) URL.revokeObjectURL(audioPreview); }, [audioPreview]);
  const close = () => {
    if (busy) return;
    if (restoredDraft) void removeShowcaseDraft(restoredDraft.id);
    onClose();
  };
  const setBuildField = (key: ShowcaseBuildKey, value: string) => setBuild((current) => ({ ...current, [key]: value }));

  async function recordTypingSound() {
    if (busy) return;
    setMessage(t("타이핑 화면으로 이동 중", "Opening typing"));
    try {
      const id = restoredDraft?.id ?? crypto.randomUUID();
      const returnUrl = restoredDraft?.returnUrl ?? `${window.location.pathname}${window.location.search}`;
      await saveShowcaseDraft({
        id,
        createdAt: restoredDraft?.createdAt ?? Date.now(),
        returnUrl,
        item: sourceItem ?? null,
        title,
        description,
        keyxifUrl,
        build,
        image,
        audio,
        audioDurationMs,
        removeAudio,
        keyxifSnapshot,
      });
      router.push(`/?showcaseAudioDraft=${encodeURIComponent(id)}`);
    } catch (error) {
      setMessage(messageOf(error, t("입력 내용을 임시 저장하지 못했습니다", "Could not save the draft")));
    }
  }

  async function selectAudioFile(file: File | null) {
    if (!file) return;
    setMessage(t("파일 확인 중", "Checking file"));
    try {
      const inspected = await inspectShowcaseAudio(file);
      setAudio(file);
      setAudioDurationMs(inspected.durationMs);
      setRemoveAudio(false);
      setMessage("");
    } catch (error) {
      setMessage(messageOf(error, t("타건음 파일을 사용할 수 없습니다", "This typing sound file cannot be used")));
    }
  }

  async function submit(event: React.FormEvent) {
    event.preventDefault();
    const supabase = getSupabaseClient();
    if (!supabase) return;
    if (!editing && !image) { setMessage(t("대표 사진을 선택해 주세요", "Choose a representative photo")); return; }

    setBusy(true);
    setMessage(t("저장 중", "Saving"));
    let created: CreatedRow | null = null;
    const uploadedPaths: string[] = [];
    try {
      const [preparedImage, preparedAudio] = await Promise.all([
        image ? prepareShowcaseImage(image) : Promise.resolve(null),
        audio ? inspectShowcaseAudio(audio) : Promise.resolve(null),
      ]);
      const cleanBuild = Object.fromEntries(Object.entries(build).map(([key, value]) => [key, value?.trim()]).filter(([, value]) => value));
      let itemId = sourceItem?.id ?? null;
      let profileId = sourceItem?.profile_id ?? null;

      if (editing && itemId) {
        const { error } = await supabase.rpc("update_my_showcase_item", { p_item_id: itemId, p_title: title, p_description: description, p_build_info: cleanBuild, p_keyxif_url: keyxifUrl || null, p_keyxif_snapshot: keyxifSnapshot });
        if (error) throw error;
      } else {
        const { data, error } = await supabase.rpc("create_my_showcase_item", { p_title: title, p_description: description, p_build_info: cleanBuild, p_keyxif_url: keyxifUrl || null, p_keyxif_snapshot: keyxifSnapshot });
        if (error) throw error;
        created = ((data ?? []) as CreatedRow[])[0] ?? null;
        if (!created) throw new Error(t("아카이브 항목을 만들지 못했습니다", "Could not create the archive item"));
        itemId = created.item_id;
        profileId = created.profile_id;
      }
      if (!itemId || !profileId) throw new Error(t("항목 정보를 확인할 수 없습니다", "Archive item is unavailable"));

      const base = `${profileId}/${itemId}`;
      /* 수정 업로드는 기존 파일을 덮어쓰지 않는다. DB 저장이 끝나기 전에
         브라우저가 닫히거나 RPC가 실패해도 공개 중인 사진/소리가 보존되고,
         이번 시도에서 만든 경로만 안전하게 정리할 수 있다. */
      const uploadVersion = crypto.randomUUID();
      const imagePath = preparedImage ? `${base}/image-${uploadVersion}.webp` : sourceItem?.image_path ?? null;
      const thumbnailPath = preparedImage ? `${base}/thumbnail-${uploadVersion}.webp` : sourceItem?.thumbnail_path ?? null;
      const audioPath = removeAudio ? null : preparedAudio ? `${base}/audio-${uploadVersion}.${preparedAudio.extension}` : sourceItem?.audio_path ?? null;

      if (preparedImage) {
        if (!imagePath || !thumbnailPath) throw new Error(t("사진 경로를 만들지 못했습니다", "Could not create image paths"));
        for (const upload of [{ path: imagePath, file: preparedImage.image }, { path: thumbnailPath, file: preparedImage.thumbnail }]) {
          const { error } = await supabase.storage.from(SHOWCASE_BUCKET).upload(upload.path, upload.file, { cacheControl: "31536000", contentType: "image/webp", upsert: editing });
          if (error) throw error;
          uploadedPaths.push(upload.path);
        }
      }
      if (audio && preparedAudio && audioPath) {
        const { error } = await supabase.storage.from(SHOWCASE_BUCKET).upload(audioPath, audio, { cacheControl: "31536000", contentType: preparedAudio.mime, upsert: editing });
        if (error) throw error;
        uploadedPaths.push(audioPath);
      }

      if (preparedImage || preparedAudio || removeAudio) {
        const { error } = await supabase.rpc("save_my_showcase_media", {
          p_item_id: itemId, p_image_path: imagePath, p_thumbnail_path: thumbnailPath,
          p_image_width: preparedImage?.width ?? sourceItem?.image_width, p_image_height: preparedImage?.height ?? sourceItem?.image_height,
          p_image_bytes: preparedImage?.image.size ?? sourceItem?.image_bytes, p_thumbnail_bytes: preparedImage?.thumbnail.size ?? sourceItem?.thumbnail_bytes,
          p_audio_path: audioPath, p_audio_mime: removeAudio ? null : preparedAudio?.mime ?? sourceItem?.audio_mime ?? null,
          p_audio_bytes: removeAudio ? null : audio?.size ?? sourceItem?.audio_bytes ?? null,
          p_audio_duration_ms: removeAudio ? null : preparedAudio?.durationMs ?? sourceItem?.audio_duration_ms ?? null,
        });
        if (error) throw error;
      }
      if (!editing) {
        const { error } = await supabase.rpc("publish_my_showcase_item", { p_item_id: itemId });
        if (error) throw error;
      }
      if (editing) {
        const replacedPaths = [
          preparedImage ? sourceItem?.image_path : null,
          preparedImage ? sourceItem?.thumbnail_path : null,
          preparedAudio || removeAudio ? sourceItem?.audio_path : null,
        ].filter((path): path is string => Boolean(path) && !uploadedPaths.includes(path!));
        if (replacedPaths.length) await supabase.storage.from(SHOWCASE_BUCKET).remove(replacedPaths);
      }
      if (restoredDraft) await removeShowcaseDraft(restoredDraft.id);
      onSaved();
      onClose();
    } catch (error) {
      // Storage RLS verifies that the owning item still exists, so uploaded files
      // must be removed before a newly-created draft row is deleted.
      if (uploadedPaths.length) await supabase.storage.from(SHOWCASE_BUCKET).remove(uploadedPaths);
      if (created) await supabase.rpc("delete_my_showcase_item", { p_item_id: created.item_id });
      const detail = messageOf(error, t("키보드를 저장하지 못했습니다", "Could not save the keyboard"));
      setMessage(/row-level security|violates.*policy/i.test(detail)
        ? t("미디어 업로드 권한 정책이 최신 상태가 아닙니다. 관리자에게 알려 주세요.", "The media upload policy needs to be updated. Please contact the administrator.")
        : detail);
    } finally { setBusy(false); }
  }

  return (
    <dialog ref={dialogRef} className={styles.editor} onCancel={(event) => { event.preventDefault(); close(); }}>
      <form onSubmit={(event) => void submit(event)}>
        <header className={styles.editorHeader}>
          <div><span>{t("내 아카이브", "My archive")}</span><h2>{editing ? t("키보드 정보 수정", "Edit keyboard") : t("키보드 한 대 등록", "Add a keyboard")}</h2></div>
          <button type="button" className={styles.iconButton} aria-label={t("닫기", "Close")} disabled={busy} onClick={close}><X size={19} /></button>
        </header>
        <div className={styles.editorGrid}>
          <label className={styles.fieldWide}><span>{t("키보드 이름", "Keyboard name")} *</span><input required maxLength={80} value={title} onChange={(event) => setTitle(event.target.value)} /></label>
          <label className={styles.uploadCard} data-preview={Boolean(imagePreview)}>{imagePreview ? (
            // Selected local files and private signed URLs cannot use the static Next image loader.
            // eslint-disable-next-line @next/next/no-img-element
            <img className={styles.uploadPreview} src={imagePreview} alt="" />
          ) : null}<strong>{image?.name ?? (editing ? t("대표 사진 유지 또는 교체", "Keep or replace photo") : t("대표 사진 선택", "Choose representative photo"))}</strong><small>{t("JPG·PNG·WebP, 원본 12MB 이하", "JPG, PNG or WebP, source up to 12MB")}</small><input type="file" accept="image/jpeg,image/png,image/webp" required={!editing} onChange={(event) => setImage(event.target.files?.[0] ?? null)} /></label>
          <div className={styles.uploadGroup}>
            <label className={styles.audioFileButton}><span><strong>{audio ? audio.name : t("타건음 파일 업로드", "Upload typing sound")}</strong><small>{t("WebM·OGG·MP3·M4A, 45초·1MB 이하", "WebM, OGG, MP3 or M4A, up to 45 sec / 1MB")}</small></span><em>{t("파일 선택", "Choose file")}</em><input type="file" accept="audio/webm,audio/ogg,audio/mpeg,audio/mp4,.m4a" onChange={(event) => void selectAudioFile(event.target.files?.[0] ?? null)} /></label>
            <button type="button" className={styles.recordSoundButton} disabled={busy} onClick={() => void recordTypingSound()}><Mic size={17} aria-hidden="true" /><span><strong>{audio ? t("타건음 다시 녹음", "Record typing sound again") : t("타건음 녹음", "Record typing sound")}</strong><small>{t("녹화 후 최대 45초 선택", "Choose up to 45 seconds after recording")}</small></span></button>
            {audioPreview ? <ShowcaseAudioPlayer src={audioPreview} label={t("선택한 타건음", "Selected typing sound")} durationHint={audioDurationMs ? audioDurationMs / 1000 : undefined} compact /> : null}
            {sourceItem?.audio_path && !audio ? <button type="button" className={styles.removeMediaButton} data-active={removeAudio} onClick={() => setRemoveAudio((current) => !current)}>{removeAudio ? t("삭제 취소", "Keep existing sound") : t("기존 타건음 삭제", "Remove existing sound")}</button> : null}
          </div>
          <section className={styles.buildSection}>
            <div className={styles.sectionHeading}><h3>{t("빌드 내역", "Build record")}</h3><span>{t("아는 항목만 작성해도 됩니다", "Fill only what you know")}</span></div>
            <div className={styles.buildRecordSections}>{SHOWCASE_BUILD_SECTIONS.map((section) => (
              <section key={section.id}>
                <h4>{isEnglish ? section.labelEn : section.label}</h4>
                <div className={styles.buildGrid}>{section.fields.map((key) => {
                  const field = SHOWCASE_BUILD_FIELD_MAP[key];
                  return <label key={key}><span>{isEnglish ? field.labelEn : field.label}</span><input maxLength={240} value={build[key] ?? ""} onChange={(event) => setBuildField(key, event.target.value)} /></label>;
                })}</div>
              </section>
            ))}</div>
          </section>
          <label className={styles.fieldWide}><span>{t("빌드 노트", "Build notes")}</span><textarea maxLength={3000} rows={7} value={description} onChange={(event) => setDescription(event.target.value)} placeholder={t("조립 기록, 변경 내역, 사용 후기", "Build notes, changes, impressions")} /><small>{description.length} / 3000</small></label>
        </div>
        {message ? <p className={styles.formMessage} aria-live="polite">{message}</p> : null}
        <footer className={styles.editorActions}><button type="button" className={styles.secondaryButton} disabled={busy} onClick={close}>{t("취소", "Cancel")}</button><button type="submit" className={styles.primaryButton} disabled={busy || !title.trim() || (!editing && !image)}>{busy ? <LoaderCircle className={styles.spinning} size={16} /> : null}{busy ? t("저장 중", "Saving") : editing ? t("수정 저장", "Save changes") : t("아카이브에 공개", "Publish to archive")}</button></footer>
      </form>
    </dialog>
  );
}
