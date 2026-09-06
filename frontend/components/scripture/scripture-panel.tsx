"use client";

import { Music, Pencil, Plus, Trash2, Video, X } from "lucide-react";
import { useEffect, useRef, useState } from "react";
import { createPortal } from "react-dom";
import {
  BODY_MAX,
  SCRIPTURE_KINDS,
  SCRIPTURE_LIMIT,
  SOURCE_MAX,
  TITLE_MAX,
  deleteItem,
  loadLibrary,
  saveItem,
  toLines,
  type ScriptureItem,
  type ScriptureKind,
} from "@/features/scripture/scripture-library";
import {
  AUDIO_MAX_BYTES,
  NO_MEDIA,
  extractYouTubeStartSeconds,
  extractYouTubeVideoId,
  newAudioId,
  sanitizeStartSeconds,
  writeAudioFile,
  type ScriptureMedia,
} from "@/features/scripture/scripture-media";
import { useUiLanguage } from "@/lib/ui-language";
import { useTypingStore } from "@/stores/use-typing-store";

type MediaKind = "none" | "audio" | "youtube";

type Draft = {
  id?: string;
  kind: ScriptureKind;
  title: string;
  source: string;
  body: string;
  mediaKind: MediaKind;
  /** 새로 고른 음원. 저장할 때 IndexedDB로 넘어간다. */
  audioFile: File | null;
  /** 수정 중인 글에 이미 붙어 있던 음원. 파일을 다시 고르지 않으면 그대로 쓴다. */
  keptAudio: { audioId: string; name: string } | null;
  youtubeUrl: string;
  startSeconds: number;
  loop: boolean;
};

function emptyDraft(kind: ScriptureKind): Draft {
  return {
    kind,
    title: "",
    source: "",
    body: "",
    mediaKind: kind === "song" ? "youtube" : "none",
    audioFile: null,
    keptAudio: null,
    youtubeUrl: "",
    startSeconds: 0,
    loop: true,
  };
}

function draftFrom(item: ScriptureItem): Draft {
  return {
    id: item.id,
    kind: item.kind,
    title: item.title,
    source: item.source,
    body: item.body,
    mediaKind: item.media.type,
    audioFile: null,
    keptAudio:
      item.media.type === "audio"
        ? { audioId: item.media.audioId, name: item.media.name }
        : null,
    youtubeUrl: item.media.type === "youtube" ? item.media.url : "",
    startSeconds: item.media.type === "none" ? 0 : item.media.startSeconds,
    loop: item.media.type === "none" ? true : item.media.loop,
  };
}

/** 시작 지점을 `1:30` 꼴로 적는다. 초 단위 숫자는 길어지면 읽기 어렵다. */
function formatSeconds(total: number) {
  const seconds = sanitizeStartSeconds(total);
  const minutes = Math.floor(seconds / 60);
  return `${minutes}:${String(seconds % 60).padStart(2, "0")}`;
}

type ScripturePanelProps = {
  open: boolean;
  /** dock 드롭다운에서 고른 종류. 목록을 이걸로 거르고 새 글의 기본값이 된다. */
  kind: ScriptureKind;
  onKindChange: (kind: ScriptureKind) => void;
  onClose: () => void;
};

/**
 * 필사 보관함 패널.
 *
 * ⚠️ 헤더·dock에 backdrop-filter가 걸려 있어서 그 안에 두면 position:fixed의
 *    기준이 뷰포트가 아니라 그 요소가 된다. 설정 패널과 같은 이유로 body에 뺀다.
 */
export function ScripturePanel({ open, kind, onKindChange, onClose }: ScripturePanelProps) {
  const { isEnglish, t } = useUiLanguage();
  const [items, setItems] = useState<ScriptureItem[]>([]);
  const [draft, setDraft] = useState<Draft | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const scriptureId = useTypingStore((s) => s.scriptureId);
  const setScripture = useTypingStore((s) => s.setScripture);
  const kindText = (value: ScriptureKind) =>
    isEnglish ? ({ short: "Short", long: "Long", song: "Lyrics" } as const)[value] : ({ short: "단문", long: "장문", song: "가사" } as const)[value];

  /* 목록은 localStorage에 있어서 서버 렌더에서는 읽을 수 없다.
     열릴 때마다 다시 읽어 다른 탭에서 바꾼 내용도 반영한다.
     effect 본문에서 곧바로 setState를 부르면 렌더가 연쇄된다. 한 틱 미룬다. */
  useEffect(() => {
    if (!open) return undefined;
    const timer = window.setTimeout(() => {
      setItems(loadLibrary());
      setError(null);
      setDraft(null);
    }, 0);
    return () => window.clearTimeout(timer);
  }, [open, kind]);

  useEffect(() => {
    if (!open) return undefined;
    function onKeyDown(event: KeyboardEvent) {
      if (event.key === "Escape") onClose();
    }
    document.addEventListener("keydown", onKeyDown);
    return () => document.removeEventListener("keydown", onKeyDown);
  }, [open, onClose]);

  if (!open || typeof document === "undefined") return null;

  /** 초안의 미디어 설정을 저장할 형태로 옮긴다. 음원은 여기서 IndexedDB에 쓴다. */
  async function mediaFrom(current: Draft): Promise<ScriptureMedia> {
    if (current.kind !== "song" || current.mediaKind === "none") return NO_MEDIA;

    if (current.mediaKind === "youtube") {
      const videoId = extractYouTubeVideoId(current.youtubeUrl);
      if (!videoId) throw new Error(t("YouTube 링크를 확인해 주세요", "Check the YouTube link"));
      return {
        type: "youtube",
        url: current.youtubeUrl.trim(),
        videoId,
        startSeconds: sanitizeStartSeconds(current.startSeconds),
        loop: current.loop,
      };
    }

    if (current.audioFile) {
      /* 바꿔 넣을 때도 기존 키를 다시 쓴다. 새 키를 만들면 옛 파일이 아무도
         참조하지 않은 채 IndexedDB에 남는다. */
      const audioId = current.keptAudio?.audioId ?? newAudioId();
      await writeAudioFile(audioId, current.audioFile);
      return {
        type: "audio",
        audioId,
        name: current.audioFile.name,
        startSeconds: sanitizeStartSeconds(current.startSeconds),
        loop: current.loop,
      };
    }

    if (current.keptAudio) {
      return {
        type: "audio",
        audioId: current.keptAudio.audioId,
        name: current.keptAudio.name,
        startSeconds: sanitizeStartSeconds(current.startSeconds),
        loop: current.loop,
      };
    }

    throw new Error(t("음원 파일을 골라 주세요", "Choose an audio file"));
  }

  async function save() {
    if (!draft || busy) return;
    setBusy(true);
    try {
      const media = await mediaFrom(draft);
      setItems(
        saveItem(
          {
            kind: draft.kind,
            title: draft.title,
            source: draft.source,
            body: draft.body,
            media,
          },
          draft.id,
        ),
      );
      setDraft(null);
      setError(null);
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : t("저장하지 못했습니다", "Could not save"));
    } finally {
      setBusy(false);
    }
  }

  function remove(item: ScriptureItem) {
    /* 이 브라우저에만 있는 글이라 지우면 어디서도 되살릴 수 없다. */
    if (!window.confirm(isEnglish
      ? `Delete "${item.title || "Untitled"}"? This cannot be undone.`
      : `"${item.title || "제목 없음"}"을 삭제합니다. 되돌릴 수 없습니다.`)) return;
    setItems(deleteItem(item.id));
    // 지금 치고 있던 글을 지웠으면 필사에서 빠져나온다. 남겨두면 빈 문장이 된다.
    if (scriptureId === item.id) setScripture(null);
  }

  function practice(item: ScriptureItem) {
    setScripture(item.id, item.kind);
    onClose();
  }

  function pickAudio(file: File | null) {
    if (!file) return;
    if (file.size > AUDIO_MAX_BYTES) {
      setError(isEnglish
        ? `Audio files can be up to ${Math.floor(AUDIO_MAX_BYTES / 1024 / 1024)}MB`
        : `음원은 ${Math.floor(AUDIO_MAX_BYTES / 1024 / 1024)}MB까지 넣을 수 있습니다`);
      return;
    }
    setError(null);
    setDraft((current) => (current ? { ...current, audioFile: file } : current));
  }

  const visible = items.filter((item) => item.kind === kind);
  const isFull = items.length >= SCRIPTURE_LIMIT;
  const isSong = draft?.kind === "song";
  const audioName = draft?.audioFile?.name ?? draft?.keptAudio?.name ?? "";

  return createPortal(
    <>
      <div className="settings-scrim" onClick={onClose} aria-hidden="true" />
      <aside className="settings-panel scripture-panel" role="dialog" aria-label={t("필사 보관함", "My Text library")}>
        <header className="settings-panel-head">
          <h3>{t("필사", "My Text")} · {kindText(kind)}</h3>
          <button
            type="button"
            className="icon-btn-circular settings-close"
            aria-label={t("필사 보관함 닫기", "Close My Text library")}
            onClick={onClose}
          >
            <X size={16} />
          </button>
        </header>

        {/* 점수가 붙지 않는다는 것과 글이 이 브라우저에만 남는다는 것은
            글을 넣기 전에 알아야 한다. */}
        <p className="scripture-notice">
          {t("내가 넣은 글을 줄 단위로 따라 칩니다.", "Practice your own text one line at a time.")} <b>{t("점수와 순위에는 반영되지 않습니다.", "This does not affect scores or ranking.")}</b>
          <br />
          {t("글과 음원은 서버로 보내지 않고 이 브라우저에만 남습니다.", "Text and audio stay in this browser and are not sent to the server.")}
        </p>

        <div className="settings-segmented scripture-kind-tabs" role="tablist" aria-label={t("필사 종류", "Text type")}>
          {SCRIPTURE_KINDS.map((option) => (
            <button
              key={option.id}
              type="button"
              role="tab"
              data-selected={kind === option.id}
              aria-selected={kind === option.id}
              onClick={() => onKindChange(option.id)}
            >
              {kindText(option.id)}
            </button>
          ))}
        </div>

        {draft ? (
          <section className="settings-section">
            <h4>
              {draft.id ? t("글 수정", "Edit text") : t("새 글", "New text")}
              <span className="settings-value">
                {[...draft.body].length} / {BODY_MAX}
              </span>
            </h4>

            <div className="settings-choice-row">
              <span className="settings-choice-label">{t("종류", "Type")}</span>
              <div className="settings-segmented" role="group" aria-label={t("글 종류", "Text type")}>
                {SCRIPTURE_KINDS.map((option) => (
                  <button
                    key={option.id}
                    type="button"
                    data-selected={draft.kind === option.id}
                    aria-pressed={draft.kind === option.id}
                    onClick={() =>
                      setDraft({
                        ...draft,
                        kind: option.id,
                        /* 가사에서 빠져나오면 붙일 곳이 없는 미디어를 끈다.
                           가사로 들어오면 가장 흔한 YouTube를 기본으로 연다. */
                        mediaKind:
                          option.id === "song"
                            ? draft.mediaKind === "none"
                              ? "youtube"
                              : draft.mediaKind
                            : "none",
                      })
                    }
                  >
                    {kindText(option.id)}
                  </button>
                ))}
              </div>
            </div>

            <input
              type="text"
              className="settings-input"
              value={draft.title}
              maxLength={TITLE_MAX}
              placeholder={t("제목", "Title")}
              aria-label={t("필사 글 제목", "Text title")}
              onChange={(event) => setDraft({ ...draft, title: event.target.value })}
            />
            <input
              type="text"
              className="settings-input"
              value={draft.source}
              maxLength={SOURCE_MAX}
              placeholder={draft.kind === "song" ? t("가수 / 앨범 (선택)", "Artist / album (optional)") : t("출처 (선택)", "Source (optional)")}
              aria-label={t("필사 글 출처", "Text source")}
              onChange={(event) => setDraft({ ...draft, source: event.target.value })}
            />
            <textarea
              className="settings-input settings-textarea scripture-body-input"
              value={draft.body}
              maxLength={BODY_MAX}
              rows={8}
              placeholder={
                draft.kind === "song"
                  ? t("가사를 붙여 넣으세요.\n줄바꿈이 그대로 연습 단위가 됩니다.", "Paste lyrics here.\nEach line becomes one practice unit.")
                  : t("본문을 붙여 넣으세요.\n줄바꿈이 그대로 연습 단위가 됩니다.", "Paste text here.\nEach line becomes one practice unit.")
              }
              aria-label={t("필사 글 본문", "Text body")}
              onChange={(event) => setDraft({ ...draft, body: event.target.value })}
            />

            {/* 음원·영상은 가사에만 붙는다. 단문·장문에는 재생할 자리가 없다. */}
            {isSong ? (
              <>
                <div className="settings-choice-row">
                  <span className="settings-choice-label">{t("함께 재생", "Play with")}</span>
                  <div className="settings-segmented" role="group" aria-label={t("함께 재생할 매체", "Media to play")}>
                    {(
                      [
                        ["youtube", "YouTube"],
                        ["audio", t("음원 파일", "Audio file")],
                        ["none", t("없음", "None")],
                      ] as const
                    ).map(([value, label]) => (
                      <button
                        key={value}
                        type="button"
                        data-selected={draft.mediaKind === value}
                        aria-pressed={draft.mediaKind === value}
                        onClick={() => setDraft({ ...draft, mediaKind: value })}
                      >
                        {label}
                      </button>
                    ))}
                  </div>
                </div>

                {draft.mediaKind === "youtube" ? (
                  <input
                    type="url"
                    className="settings-input"
                    value={draft.youtubeUrl}
                    placeholder="https://youtu.be/..."
                    aria-label={t("YouTube 링크", "YouTube link")}
                    onChange={(event) => {
                      const url = event.target.value;
                      /* 링크에 ?t=90 이 붙어 있으면 시작 지점을 채운다.
                         이미 직접 손댄 값이 있으면 덮어쓰지 않는다. */
                      const fromUrl = extractYouTubeStartSeconds(url);
                      setDraft({
                        ...draft,
                        youtubeUrl: url,
                        startSeconds: fromUrl || draft.startSeconds,
                      });
                    }}
                  />
                ) : null}

                {draft.mediaKind === "audio" ? (
                  <div className="settings-row">
                    <span className="scripture-file-name" title={audioName}>
                      {audioName || t("고른 파일 없음", "No file selected")}
                    </span>
                    <button
                      type="button"
                      className="chip-pill"
                      onClick={() => fileInputRef.current?.click()}
                    >
                      {t("파일 고르기", "Choose file")}
                    </button>
                    <input
                      ref={fileInputRef}
                      type="file"
                      accept="audio/*"
                      hidden
                      onChange={(event) => {
                        pickAudio(event.target.files?.[0] ?? null);
                        // 같은 파일을 다시 골라도 change가 오도록 비운다.
                        event.target.value = "";
                      }}
                    />
                  </div>
                ) : null}

                {draft.mediaKind !== "none" ? (
                  <div className="settings-choice-row">
                    <span className="settings-choice-label">{t("시작", "Start")} {formatSeconds(draft.startSeconds)}</span>
                    <div className="settings-row">
                      <input
                        type="number"
                        className="settings-input scripture-seconds-input"
                        value={draft.startSeconds}
                        min={0}
                        max={86400}
                        aria-label={t("시작 지점(초)", "Start time in seconds")}
                        onChange={(event) =>
                          setDraft({
                            ...draft,
                            startSeconds: sanitizeStartSeconds(event.target.value),
                          })
                        }
                      />
                      <label className="scripture-check">
                        <input
                          type="checkbox"
                          checked={draft.loop}
                          onChange={(event) => setDraft({ ...draft, loop: event.target.checked })}
                        />
                        {t("반복", "Loop")}
                      </label>
                    </div>
                  </div>
                ) : null}
              </>
            ) : null}

            <div className="settings-row settings-row-end">
              <span className="settings-hint">{isEnglish ? `${toLines(draft.body).length} lines` : `${toLines(draft.body).length}줄`}</span>
              <button type="button" className="chip-pill" onClick={() => setDraft(null)}>
                {t("취소", "Cancel")}
              </button>
              <button
                type="button"
                className="btn-primary-pill scripture-save-button"
                disabled={busy || !draft.body.trim()}
                onClick={() => void save()}
              >
                {busy ? t("저장 중", "Saving") : t("저장", "Save")}
              </button>
            </div>
          </section>
        ) : (
          <div className="settings-row settings-row-end">
            <span className="settings-hint">
              {t("전체", "Total")} {items.length} / {SCRIPTURE_LIMIT}
            </span>
            <button
              type="button"
              className="chip-pill"
              disabled={isFull}
              title={isFull ? (isEnglish ? `The library holds up to ${SCRIPTURE_LIMIT} items` : `보관함은 ${SCRIPTURE_LIMIT}개까지입니다`) : undefined}
              onClick={() => {
                setDraft(emptyDraft(kind));
                setError(null);
              }}
            >
              <Plus size={14} />
              {isEnglish ? `Add ${kindText(kind).toLowerCase()}` : `${kindText(kind)} 추가`}
            </button>
          </div>
        )}

        {error ? <p className="settings-status is-error">{error}</p> : null}

        <section className="settings-section">
          <h4>{isEnglish ? `${kindText(kind)} library` : `${kindText(kind)} 보관함`}</h4>
          {visible.length === 0 ? (
            /* 종류 이름을 문장에 넣으면 조사가 어긋난다("가사이(가) 없습니다").
               종류는 이미 위 제목에 있으니 여기서는 빼고 짧게 적는다. */
            <p className="settings-hint">{t("아직 넣은 글이 없습니다.", "Nothing saved yet.")}</p>
          ) : (
            <ul className="scripture-list">
              {visible.map((item) => {
                const lines = toLines(item.body).length;
                const isCurrent = scriptureId === item.id;
                return (
                  <li key={item.id} className="scripture-item" data-current={isCurrent}>
                    <button
                      type="button"
                      className="scripture-item-main"
                      aria-current={isCurrent ? "true" : undefined}
                      onClick={() => practice(item)}
                    >
                      <span className="scripture-item-title">
                        {item.media.type === "youtube" ? (
                          <Video size={12} aria-label={t("YouTube와 함께", "With YouTube")} />
                        ) : null}
                        {item.media.type === "audio" ? (
                          <Music size={12} aria-label={t("음원과 함께", "With audio")} />
                        ) : null}
                        {item.title || t("제목 없음", "Untitled")}
                      </span>
                      <span className="scripture-item-meta">
                        {item.source ? `${item.source} · ` : ""}
                        {isEnglish ? `${lines} lines` : `${lines}줄`}
                      </span>
                    </button>
                    <div className="scripture-item-actions">
                      <button
                        type="button"
                        className="icon-btn-circular"
                        aria-label={isEnglish ? `Edit ${item.title || "Untitled"}` : `${item.title || "제목 없음"} 수정`}
                        onClick={() => {
                          setDraft(draftFrom(item));
                          setError(null);
                        }}
                      >
                        <Pencil size={14} />
                      </button>
                      <button
                        type="button"
                        className="icon-btn-circular"
                        aria-label={isEnglish ? `Delete ${item.title || "Untitled"}` : `${item.title || "제목 없음"} 삭제`}
                        onClick={() => remove(item)}
                      >
                        <Trash2 size={14} />
                      </button>
                    </div>
                  </li>
                );
              })}
            </ul>
          )}
        </section>

        {scriptureId ? (
          <div className="settings-row settings-row-end">
            <button
              type="button"
              className="chip-pill"
              onClick={() => {
                setScripture(null);
                onClose();
              }}
            >
              {t("필사 끝내기", "End practice")}
            </button>
          </div>
        ) : null}
      </aside>
    </>,
    document.body,
  );
}
