"use client";

import { LoaderCircle, X } from "lucide-react";
import { useEffect, useRef, useState } from "react";
import type { ShowcaseSpaceView, ShowcaseViewItem } from "@/features/showcase/types";
import { getSupabaseClient } from "@/lib/supabase/client";
import { messageOf } from "@/lib/supabase/errors";
import { useUiLanguage } from "@/lib/ui-language";
import styles from "./showcase.module.css";

type Props = { space: ShowcaseSpaceView; items: ShowcaseViewItem[]; onClose: () => void; onSaved: () => void };

export function ShowcaseSpaceEditor({ space, items, onClose, onSaved }: Props) {
  const { t } = useUiLanguage();
  const dialog = useRef<HTMLDialogElement>(null);
  const [intro, setIntro] = useState(space.intro);
  const [featured, setFeatured] = useState(space.featured_item_id ?? "");
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState("");

  useEffect(() => { dialog.current?.showModal(); }, []);

  async function save(event: React.FormEvent) {
    event.preventDefault();
    const supabase = getSupabaseClient();
    if (!supabase) return;
    setBusy(true); setMessage("");
    const { error } = await supabase.rpc("update_my_showcase_space", {
      p_intro: intro,
      // Appearance fields stay in the database for a future, more coherent
      // customization system. The current editor focuses on useful content.
      p_theme: space.theme,
      p_accent: space.accent,
      p_banner: space.banner,
      p_layout: space.layout,
      p_featured_item_id: featured || null,
    });
    setBusy(false);
    if (error) { setMessage(messageOf(error, t("개인 아카이브를 저장하지 못했습니다", "Could not save your archive space"))); return; }
    onSaved(); onClose();
  }

  return <dialog ref={dialog} className={`${styles.editor} ${styles.spaceEditor}`} onCancel={(event) => { event.preventDefault(); if (!busy) onClose(); }}>
    <form onSubmit={(event) => void save(event)}>
      <header className={styles.editorHeader}><div><h2>{t("공간 정보 편집", "Edit space details")}</h2></div><button type="button" className={styles.iconButton} disabled={busy} onClick={onClose} aria-label={t("닫기", "Close")}><X size={19} /></button></header>
      <div className={styles.spaceFields}>
        <label><span>{t("공간 소개", "Introduction")}</span><textarea rows={5} maxLength={300} value={intro} onChange={(event) => setIntro(event.target.value)} placeholder={t("키보드, 취향, 관심사", "Keyboards, preferences, interests")} /><small>{intro.length} / 300</small></label>
        <label><span>{t("대표 키보드", "Featured keyboard")}</span><select value={featured} onChange={(event) => setFeatured(event.target.value)}><option value="">{t("선택 안 함", "None")}</option>{items.map((item) => <option key={item.item_id} value={item.item_id}>{item.title}</option>)}</select></label>
      </div>
      {message ? <p className={styles.formMessage}>{message}</p> : null}
      <footer className={styles.editorActions}><button type="button" className={styles.secondaryButton} disabled={busy} onClick={onClose}>{t("취소", "Cancel")}</button><button type="submit" className={styles.primaryButton} disabled={busy}>{busy ? <LoaderCircle className={styles.spinning} size={16} /> : null}{t("저장", "Save")}</button></footer>
    </form>
  </dialog>;
}
