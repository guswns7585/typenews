"use client";

import { FileJson, ImagePlus, LoaderCircle, Music2, X } from "lucide-react";
import { useEffect, useRef, useState } from "react";
import { inspectShowcaseAudio, prepareShowcaseImage, SHOWCASE_BUCKET } from "@/features/showcase/media";
import { parseKeyxifJson, type KeyxifPreset } from "@/features/showcase/keyxif";
import { SHOWCASE_BUILD_FIELDS, type MyShowcaseItem, type ShowcaseBuildInfo, type ShowcaseBuildKey } from "@/features/showcase/types";
import { getSupabaseClient } from "@/lib/supabase/client";
import { messageOf } from "@/lib/supabase/errors";
import { useUiLanguage } from "@/lib/ui-language";
import styles from "./showcase.module.css";

type CreatedRow = { item_id: string; profile_id: string };
type Props = { item?: MyShowcaseItem | null; onClose: () => void; onSaved: () => void };

export function ShowcaseEditor({ item, onClose, onSaved }: Props) {
  const { isEnglish, t } = useUiLanguage();
  const dialogRef = useRef<HTMLDialogElement>(null);
  const [title, setTitle] = useState(item?.title ?? "");
  const [description, setDescription] = useState(item?.description ?? "");
  const [keyxifUrl, setKeyxifUrl] = useState(item?.keyxif_url ?? "");
  const [build, setBuild] = useState<ShowcaseBuildInfo>(item?.build_info ?? {});
  const [image, setImage] = useState<File | null>(null);
  const [audio, setAudio] = useState<File | null>(null);
  const [keyxifPresets, setKeyxifPresets] = useState<KeyxifPreset[]>([]);
  const [keyxifSnapshot, setKeyxifSnapshot] = useState<Record<string, unknown> | null>(item?.keyxif_snapshot ?? null);
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState("");
  const editing = Boolean(item);

  useEffect(() => { dialogRef.current?.showModal(); }, []);
  const close = () => { if (!busy) onClose(); };
  const setBuildField = (key: ShowcaseBuildKey, value: string) => setBuild((current) => ({ ...current, [key]: value }));

  function applyKeyxifPreset(preset: KeyxifPreset) {
    setBuild((current) => ({ ...current, ...Object.fromEntries(Object.entries(preset.build).filter(([, value]) => value)) }));
    if (!title.trim()) setTitle(preset.name);
    setKeyxifSnapshot(preset.snapshot);
    setMessage(t("KeyXIF 빌드 정보를 가져왔습니다. 내용을 확인한 뒤 저장해 주세요.", "KeyXIF build imported. Review it before saving."));
  }

  async function importKeyxif(file: File | null) {
    if (!file) return;
    try {
      const presets = parseKeyxifJson(await file.text());
      setKeyxifPresets(presets);
      applyKeyxifPreset(presets[0]);
    } catch (error) { setMessage(messageOf(error, t("KeyXIF 파일을 가져오지 못했습니다", "Could not import the KeyXIF file"))); }
  }

  async function submit(event: React.FormEvent) {
    event.preventDefault();
    const supabase = getSupabaseClient();
    if (!supabase) return;
    if (!editing && !image) { setMessage(t("대표 사진을 선택해 주세요", "Choose a representative photo")); return; }

    setBusy(true);
    setMessage(t("아카이브 항목을 저장하는 중입니다", "Saving archive item"));
    let created: CreatedRow | null = null;
    const uploadedPaths: string[] = [];
    try {
      const [preparedImage, preparedAudio] = await Promise.all([
        image ? prepareShowcaseImage(image) : Promise.resolve(null),
        audio ? inspectShowcaseAudio(audio) : Promise.resolve(null),
      ]);
      const cleanBuild = Object.fromEntries(Object.entries(build).map(([key, value]) => [key, value?.trim()]).filter(([, value]) => value));
      let itemId = item?.id ?? null;
      let profileId = item?.profile_id ?? null;

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
      const imagePath = `${base}/image.webp`;
      const thumbnailPath = `${base}/thumbnail.webp`;
      const audioPath = preparedAudio ? `${base}/audio.${preparedAudio.extension}` : item?.audio_path ?? null;

      if (preparedImage) {
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

      if (preparedImage || preparedAudio) {
        const { error } = await supabase.rpc("save_my_showcase_media", {
          p_item_id: itemId, p_image_path: imagePath, p_thumbnail_path: thumbnailPath,
          p_image_width: preparedImage?.width ?? item?.image_width, p_image_height: preparedImage?.height ?? item?.image_height,
          p_image_bytes: preparedImage?.image.size ?? item?.image_bytes, p_thumbnail_bytes: preparedImage?.thumbnail.size ?? item?.thumbnail_bytes,
          p_audio_path: audioPath, p_audio_mime: preparedAudio?.mime ?? item?.audio_mime ?? null,
          p_audio_bytes: audio?.size ?? item?.audio_bytes ?? null, p_audio_duration_ms: preparedAudio?.durationMs ?? item?.audio_duration_ms ?? null,
        });
        if (error) throw error;
      }
      if (!editing) {
        const { error } = await supabase.rpc("publish_my_showcase_item", { p_item_id: itemId });
        if (error) throw error;
      }
      if (editing && preparedAudio && item?.audio_path && item.audio_path !== audioPath) await supabase.storage.from(SHOWCASE_BUCKET).remove([item.audio_path]);
      onSaved();
      onClose();
    } catch (error) {
      if (created) await supabase.rpc("delete_my_showcase_item", { p_item_id: created.item_id });
      // A failed edit may already have overwritten a fixed media path. Removing it
      // would remove the previously published object too, so only clean new rows.
      if (created && uploadedPaths.length) await supabase.storage.from(SHOWCASE_BUCKET).remove(uploadedPaths);
      setMessage(messageOf(error, t("키보드를 저장하지 못했습니다", "Could not save the keyboard")));
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
          <label className={styles.uploadCard}><span className={styles.uploadIcon}><ImagePlus size={22} /></span><strong>{image?.name ?? (editing ? t("대표 사진 유지 또는 교체", "Keep or replace photo") : t("대표 사진 선택", "Choose representative photo"))}</strong><small>{t("JPG·PNG·WebP, 원본 12MB 이하", "JPG, PNG or WebP, source up to 12MB")}</small><input type="file" accept="image/jpeg,image/png,image/webp" required={!editing} onChange={(event) => setImage(event.target.files?.[0] ?? null)} /></label>
          <label className={styles.uploadCard}><span className={styles.uploadIcon}><Music2 size={22} /></span><strong>{audio?.name ?? (item?.audio_path ? t("기존 타건음 유지 또는 교체", "Keep or replace typing sound") : t("타건음 선택 · 선택 사항", "Choose typing sound · optional"))}</strong><small>{t("WebM·OGG·MP3·M4A, 45초·1MB 이하", "WebM, OGG, MP3 or M4A, up to 45 sec / 1MB")}</small><input type="file" accept="audio/webm,audio/ogg,audio/mpeg,audio/mp4,.m4a" onChange={(event) => setAudio(event.target.files?.[0] ?? null)} /></label>
          <section className={styles.keyxifImport}>
            <div><FileJson size={20} /><span><strong>{t("KeyXIF에서 가져오기", "Import from KeyXIF")}</strong><small>{t("KeyXIF 웹 백업 JSON의 빌드 프리셋을 불러옵니다.", "Import build presets from a KeyXIF web backup JSON.")}</small></span></div>
            <label className={styles.secondaryButton}>{t("JSON 선택", "Choose JSON")}<input type="file" accept="application/json,.json" onChange={(event) => void importKeyxif(event.target.files?.[0] ?? null)} /></label>
            {keyxifPresets.length > 1 ? <select aria-label={t("KeyXIF 빌드 선택", "Choose KeyXIF build")} defaultValue="0" onChange={(event) => applyKeyxifPreset(keyxifPresets[Number(event.target.value)])}>{keyxifPresets.map((preset, index) => <option value={index} key={`${preset.name}-${index}`}>{preset.name}</option>)}</select> : null}
          </section>
          <section className={styles.buildSection}><div className={styles.sectionHeading}><h3>{t("빌드 정보", "Build information")}</h3><span>{t("아는 항목만 작성해도 됩니다", "Fill only what you know")}</span></div><div className={styles.buildGrid}>{SHOWCASE_BUILD_FIELDS.map(([key, label, labelEn]) => <label key={key}><span>{isEnglish ? labelEn : label}</span><input maxLength={240} value={build[key] ?? ""} onChange={(event) => setBuildField(key, event.target.value)} /></label>)}</div></section>
          <label className={styles.fieldWide}><span>KeyXIF URL</span><input type="url" maxLength={500} value={keyxifUrl} onChange={(event) => setKeyxifUrl(event.target.value)} placeholder="https://keyxif.com/..." /></label>
          <label className={styles.fieldWide}><span>{t("소개", "Description")}</span><textarea maxLength={3000} rows={5} value={description} onChange={(event) => setDescription(event.target.value)} /><small>{description.length} / 3000</small></label>
        </div>
        {message ? <p className={styles.formMessage} aria-live="polite">{message}</p> : null}
        <footer className={styles.editorActions}><button type="button" className={styles.secondaryButton} disabled={busy} onClick={close}>{t("취소", "Cancel")}</button><button type="submit" className={styles.primaryButton} disabled={busy || !title.trim() || (!editing && !image)}>{busy ? <LoaderCircle className={styles.spinning} size={16} /> : <ImagePlus size={16} />}{busy ? t("저장 중", "Saving") : editing ? t("수정 저장", "Save changes") : t("아카이브에 공개", "Publish to archive")}</button></footer>
      </form>
    </dialog>
  );
}
