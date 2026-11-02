"use client";

import { LoaderCircle, Palette, X } from "lucide-react";
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
  const [theme, setTheme] = useState(space.theme);
  const [accent, setAccent] = useState(space.accent);
  const [banner, setBanner] = useState(space.banner);
  const [layout, setLayout] = useState(space.layout);
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
      p_intro: intro, p_theme: theme, p_accent: accent, p_banner: banner,
      p_layout: layout, p_featured_item_id: featured || null,
    });
    setBusy(false);
    if (error) { setMessage(messageOf(error, t("개인 아카이브를 저장하지 못했습니다", "Could not save your archive space"))); return; }
    onSaved(); onClose();
  }

  return <dialog ref={dialog} className={`${styles.editor} ${styles.spaceEditor}`} onCancel={(event) => { event.preventDefault(); if (!busy) onClose(); }}>
    <form onSubmit={(event) => void save(event)}>
      <header className={styles.editorHeader}><div><span>MY ARCHIVE</span><h2>{t("개인 공간 꾸미기", "Customize my space")}</h2></div><button type="button" className={styles.iconButton} disabled={busy} onClick={onClose} aria-label={t("닫기", "Close")}><X size={19} /></button></header>
      <div className={styles.spaceFields}>
        <label><span>{t("공간 소개", "Introduction")}</span><textarea rows={4} maxLength={300} value={intro} onChange={(event) => setIntro(event.target.value)} placeholder={t("키보드 취향이나 공간을 소개해 보세요.", "Tell visitors about your collection.")} /><small>{intro.length} / 300</small></label>
        <fieldset><legend>{t("분위기", "Mood")}</legend><div className={styles.choiceGrid}>{(["paper", "studio", "night", "berry"] as const).map((value) => <button type="button" key={value} data-active={theme === value} data-theme-preview={value} onClick={() => setTheme(value)}>{t(({ paper: "종이", studio: "스튜디오", night: "밤", berry: "베리" })[value], value)}</button>)}</div></fieldset>
        <fieldset><legend>{t("강조색", "Accent")}</legend><div className={styles.colorChoices}>{(["rose", "blue", "green", "amber"] as const).map((value) => <button type="button" key={value} data-active={accent === value} data-color={value} onClick={() => setAccent(value)} aria-label={value} />)}</div></fieldset>
        <fieldset><legend>{t("배너 무늬", "Banner pattern")}</legend><div className={styles.choiceGrid}>{(["soft", "grid", "waves", "dots"] as const).map((value) => <button type="button" key={value} data-active={banner === value} onClick={() => setBanner(value)}>{t(({ soft: "은은하게", grid: "격자", waves: "물결", dots: "도트" })[value], value)}</button>)}</div></fieldset>
        <label><span>{t("진열 방식", "Display layout")}</span><select value={layout} onChange={(event) => setLayout(event.target.value as typeof layout)}><option value="gallery">{t("갤러리", "Gallery")}</option><option value="shelf">{t("선반", "Shelf")}</option></select></label>
        <label><span>{t("대표 키보드", "Featured keyboard")}</span><select value={featured} onChange={(event) => setFeatured(event.target.value)}><option value="">{t("선택 안 함", "None")}</option>{items.map((item) => <option key={item.item_id} value={item.item_id}>{item.title}</option>)}</select></label>
      </div>
      {message ? <p className={styles.formMessage}>{message}</p> : null}
      <footer className={styles.editorActions}><button type="button" className={styles.secondaryButton} disabled={busy} onClick={onClose}>{t("취소", "Cancel")}</button><button type="submit" className={styles.primaryButton} disabled={busy}>{busy ? <LoaderCircle className={styles.spinning} size={16} /> : <Palette size={16} />}{t("공간 저장", "Save space")}</button></footer>
    </form>
  </dialog>;
}
