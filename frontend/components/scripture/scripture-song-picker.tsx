"use client";

import { Library, Music, Video, X } from "lucide-react";
import { useEffect, useState } from "react";
import { createPortal } from "react-dom";
import {
  SCRIPTURE_UPDATED_EVENT,
  loadLibrary,
  toLines,
  type ScriptureItem,
} from "@/features/scripture/scripture-library";
import { useUiLanguage } from "@/lib/ui-language";
import { useTypingStore } from "@/stores/use-typing-store";

type ScriptureSongPickerProps = {
  open: boolean;
  onClose: () => void;
  onManage: () => void;
};

export function ScriptureSongPicker({ open, onClose, onManage }: ScriptureSongPickerProps) {
  const { isEnglish, t } = useUiLanguage();
  const [songs, setSongs] = useState<ScriptureItem[]>([]);
  const scriptureId = useTypingStore((state) => state.scriptureId);
  const setScripture = useTypingStore((state) => state.setScripture);

  useEffect(() => {
    if (!open) return undefined;
    const refresh = () => setSongs(loadLibrary().filter((item) => item.kind === "song"));
    refresh();
    window.addEventListener(SCRIPTURE_UPDATED_EVENT, refresh);
    return () => window.removeEventListener(SCRIPTURE_UPDATED_EVENT, refresh);
  }, [open]);

  useEffect(() => {
    if (!open) return undefined;
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === "Escape") onClose();
    };
    document.addEventListener("keydown", onKeyDown);
    return () => document.removeEventListener("keydown", onKeyDown);
  }, [open, onClose]);

  if (!open || typeof document === "undefined") return null;

  return createPortal(
    <>
      <div className="settings-scrim" onClick={onClose} aria-hidden="true" />
      <section className="scripture-song-picker" role="dialog" aria-modal="true" aria-label={t("가사 선택", "Choose lyrics")}>
        <header className="scripture-song-picker-head">
          <div>
            <span className="scripture-song-picker-eyebrow">{t("필사 · 가사", "My Text · Lyrics")}</span>
            <h3>{t("연습할 가사를 선택하세요", "Choose lyrics to practice")}</h3>
          </div>
          <button type="button" className="icon-btn-circular" aria-label={t("가사 선택 닫기", "Close lyric picker")} onClick={onClose}>
            <X size={16} />
          </button>
        </header>

        <div className="scripture-song-grid">
          {songs.map((song) => {
            const current = scriptureId === song.id;
            return (
              <button
                key={song.id}
                type="button"
                className="scripture-song-card"
                data-current={current}
                aria-current={current ? "true" : undefined}
                onClick={() => {
                  setScripture(song.id, "song");
                  onClose();
                }}
              >
                <span className="scripture-song-card-icon" aria-hidden="true">
                  {song.media.type === "youtube" ? <Video size={17} /> : <Music size={17} />}
                </span>
                <span className="scripture-song-card-copy">
                  <strong>{song.title || t("제목 없음", "Untitled")}</strong>
                  <span>
                    {song.source ? `${song.source} · ` : ""}
                    {isEnglish ? `${toLines(song.body).length} lines` : `${toLines(song.body).length}줄`}
                  </span>
                </span>
                {current ? <span className="scripture-song-current">{t("연습 중", "Practicing")}</span> : null}
              </button>
            );
          })}
        </div>

        <footer className="scripture-song-picker-foot">
          <span>{isEnglish ? `${songs.length} saved lyrics` : `${songs.length}개의 가사`}</span>
          <button type="button" className="scripture-picker-manage" onClick={onManage}>
            <Library size={15} />
            {t("가사 관리", "Manage lyrics")}
          </button>
        </footer>
      </section>
    </>,
    document.body,
  );
}
