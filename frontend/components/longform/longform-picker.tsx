"use client";

import { useEffect, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { X } from "lucide-react";
import { LONGFORM_UPDATED_EVENT, loadLongformProgress, loadLongformTexts } from "@/features/longform/longform-library";
import { segmentLongform } from "@/features/longform/segmentation";
import type { LongformText } from "@/features/longform/content";
import { useTypingStore } from "@/stores/use-typing-store";
import styles from "./longform.module.css";

export type LongformPickerProps = { open: boolean; onClose: () => void; language: "kor" | "eng" };
export function LongformPicker({ open, onClose, language }: LongformPickerProps) {
  const [texts, setTexts] = useState<LongformText[]>([]);
  const dialogRef = useRef<HTMLDialogElement>(null);
  const currentId = useTypingStore((state) => state.scriptureId);
  const en = language === "eng";
  useEffect(() => {
    if (!open) return;
    const refresh = () => setTexts(loadLongformTexts().filter((text) => text.language === language));
    refresh();
    const previous = document.activeElement instanceof HTMLElement ? document.activeElement : null;
    const dialog = dialogRef.current;
    dialog?.showModal();
    window.addEventListener(LONGFORM_UPDATED_EVENT, refresh);
    window.addEventListener("storage", refresh);
    return () => { window.removeEventListener(LONGFORM_UPDATED_EVENT, refresh); window.removeEventListener("storage", refresh); dialog?.close(); previous?.focus(); };
  }, [open, language]);
  if (!open || typeof document === "undefined") return null;
  return createPortal(
    <dialog ref={dialogRef} className={styles.picker} aria-labelledby="longform-picker-title" onCancel={(event) => { event.preventDefault(); onClose(); }} onClick={(event) => { if (event.target === event.currentTarget) { const box = event.currentTarget.getBoundingClientRect(); if (event.clientX < box.left || event.clientX > box.right || event.clientY < box.top || event.clientY > box.bottom) onClose(); } }}>
      <header className={styles.header}><h2 id="longform-picker-title">{en ? "Long-form practice" : "긴 글 연습"}</h2><button type="button" onClick={onClose} aria-label={en ? "Close" : "닫기"}><X size={18} /></button></header>
      <p>{en ? "Built-in TypeNews essays · Progress saved locally" : "타입뉴스 기본 긴 글 · 진행 상황은 브라우저에 저장"}</p>
      <div className={styles.list}>{texts.map((text) => {
        const progress = loadLongformProgress(text);
        const count = segmentLongform(text.body, text.language).length;
        return <div key={text.id} className={styles.card}><button type="button" aria-current={currentId === text.id ? "true" : undefined} onClick={() => { useTypingStore.getState().setScripture(text.id, "long"); onClose(); }}><strong>{text.title}</strong><span>{Array.from(text.body).length.toLocaleString()} {en ? "characters" : "자"} · {progress.completed ? (en ? "Completed" : "완료") : `${progress.line + 1} / ${count}`}</span></button></div>;
      })}</div>
    </dialog>, document.body,
  );
}
