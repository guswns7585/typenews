/**
 * 필사 보관함.
 *
 * 사용자가 직접 넣은 글을 브라우저에만 둔다. 서버로 보내지 않는다.
 *
 * 왜 로컬인가 — 필사는 점수와 무관한 개인 연습이고, 좋아하는 가사나 문단처럼
 * 저작권이 걸린 글이 들어올 수 있다. 서버에 모으면 그 순간 우리가 배포자가 된다.
 * 원본 필사타입(Scriptory)도 같은 이유로 브라우저 저장을 썼다.
 *
 * 음원 파일만 예외로 IndexedDB에 둔다(scripture-media.ts). localStorage는
 * 문자열만 담고 5MB 안팎이라 음원이 들어가지 않는다.
 */

import { NO_MEDIA, removeAudioFile, sanitizeStartSeconds, type ScriptureMedia } from "./scripture-media";

const STORAGE_KEY = "typenews.scripture.v1";

/** 원본 필사타입과 같은 상한. 브라우저 저장소를 채우지 않을 만큼만 둔다. */
export const SCRIPTURE_LIMIT = 30;
export const TITLE_MAX = 60;
export const SOURCE_MAX = 60;
export const BODY_MAX = 4000;

/**
 * 보관함 글의 종류.
 *
 * dock 드롭다운의 세 항목과 그대로 짝을 이룬다. 줄 수로 자동 판단하지 않고
 * 저장할 때 직접 고르게 한다 — 한 줄짜리 가사도 가사로 남아야 하고,
 * 여러 문단짜리 단문 묶음도 있을 수 있어서 줄 수는 의도를 알려주지 못한다.
 */
export type ScriptureKind = "short" | "long" | "song";

export const SCRIPTURE_KINDS: { id: ScriptureKind; label: string; note?: string }[] = [
  { id: "short", label: "단문" },
  { id: "long", label: "장문" },
  { id: "song", label: "가사", note: "음원·영상과 함께" },
];

export function kindLabel(kind: ScriptureKind) {
  return SCRIPTURE_KINDS.find((item) => item.id === kind)?.label ?? "단문";
}

export type ScriptureItem = {
  id: string;
  kind: ScriptureKind;
  title: string;
  /** 출처 메모. 비워도 된다. */
  source: string;
  body: string;
  /** 가사에만 붙는다. 나머지는 항상 `{ type: "none" }`. */
  media: ScriptureMedia;
  createdAt: number;
  updatedAt: number;
};

function newId() {
  if (typeof crypto !== "undefined" && "randomUUID" in crypto) return crypto.randomUUID();
  return `s-${Date.now()}-${Math.random().toString(16).slice(2)}`;
}

function isKind(value: unknown): value is ScriptureKind {
  return value === "short" || value === "long" || value === "song";
}

/** 저장된 미디어를 믿지 않고 다시 짠다. 손으로 고친 값이 그대로 재생에 쓰이면 곤란하다. */
function normalizeMedia(value: unknown): ScriptureMedia {
  if (!value || typeof value !== "object") return NO_MEDIA;
  const media = value as Record<string, unknown>;

  if (media.type === "audio" && typeof media.audioId === "string" && media.audioId) {
    return {
      type: "audio",
      audioId: media.audioId,
      name: String(media.name ?? ""),
      startSeconds: sanitizeStartSeconds(media.startSeconds),
      loop: media.loop !== false,
    };
  }

  if (media.type === "youtube" && typeof media.videoId === "string" && media.videoId) {
    return {
      type: "youtube",
      url: String(media.url ?? ""),
      videoId: media.videoId,
      startSeconds: sanitizeStartSeconds(media.startSeconds),
      loop: media.loop !== false,
    };
  }

  return NO_MEDIA;
}

function isStoredItem(value: unknown): value is { id: string; body: string } {
  if (!value || typeof value !== "object") return false;
  const item = value as Record<string, unknown>;
  return typeof item.id === "string" && typeof item.body === "string";
}

export function loadLibrary(): ScriptureItem[] {
  if (typeof window === "undefined") return [];
  try {
    const raw = window.localStorage.getItem(STORAGE_KEY);
    if (!raw) return [];
    const parsed: unknown = JSON.parse(raw);
    if (!Array.isArray(parsed)) return [];
    return parsed.filter(isStoredItem).map((stored) => {
      const item = stored as unknown as Record<string, unknown>;
      const body = String(item.body).slice(0, BODY_MAX);
      return {
        id: String(item.id),
        /* kind가 없던 시절에 저장한 글은 줄 수로 메운다. 그때는 종류라는 개념이
           없었으므로 무엇을 고르든 사용자의 뜻을 어기는 것이 아니다. */
        kind: isKind(item.kind) ? item.kind : toLines(body).length > 1 ? "long" : "short",
        title: String(item.title ?? "").slice(0, TITLE_MAX),
        source: String(item.source ?? "").slice(0, SOURCE_MAX),
        body,
        media: normalizeMedia(item.media),
        createdAt: Number(item.createdAt) || Date.now(),
        updatedAt: Number(item.updatedAt) || Date.now(),
      };
    });
  } catch (error) {
    console.error("필사 보관함을 읽지 못했습니다", error);
    return [];
  }
}

/**
 * 보관함이 바뀌었다는 알림.
 *
 * 지금 치고 있는 글을 고치면 화면도 따라와야 한다. 타이핑 영역은 글을 고른
 * 시점에 한 번만 읽으므로, 같은 글을 수정해도 id가 그대로여서 알아채지 못한다.
 * 계정 이름 변경(PROFILE_UPDATED_EVENT)과 같은 방식으로 알린다.
 */
export const SCRIPTURE_UPDATED_EVENT = "typenews:scripture-updated";

function persist(items: ScriptureItem[]) {
  if (typeof window === "undefined") return;
  try {
    window.localStorage.setItem(STORAGE_KEY, JSON.stringify(items));
  } catch (error) {
    // 저장소가 가득 찼거나 사생활 보호 모드일 수 있다. 연습 자체는 계속되어야 한다.
    console.error("필사 보관함을 저장하지 못했습니다", error);
    return;
  }
  window.dispatchEvent(new CustomEvent(SCRIPTURE_UPDATED_EVENT));
}

/**
 * 아무 글도 쓰지 않는 음원 파일을 IndexedDB에서 지운다.
 *
 * 음원은 수십 MB라 남겨두면 저장 할당량을 잡아먹고, 브라우저가 할당량을 넘기면
 * 보관함(localStorage)까지 통째로 날려버릴 수 있다.
 */
function dropUnusedAudio(previous: ScriptureItem[], next: ScriptureItem[]) {
  const stillUsed = new Set(
    next.map((item) => (item.media.type === "audio" ? item.media.audioId : "")).filter(Boolean),
  );
  for (const item of previous) {
    if (item.media.type !== "audio") continue;
    if (stillUsed.has(item.media.audioId)) continue;
    void removeAudioFile(item.media.audioId).catch((error: unknown) => {
      console.error("쓰지 않는 음원을 지우지 못했습니다", error);
    });
  }
}

export type ScriptureDraft = {
  kind: ScriptureKind;
  title: string;
  source: string;
  body: string;
  media: ScriptureMedia;
};

/** 저장하고 갱신된 목록을 돌려준다. id를 주면 수정, 없으면 추가. */
export function saveItem(draft: ScriptureDraft, id?: string): ScriptureItem[] {
  const title = draft.title.trim().slice(0, TITLE_MAX);
  const source = draft.source.trim().slice(0, SOURCE_MAX);
  const body = draft.body.replace(/\r\n?/g, "\n").trim().slice(0, BODY_MAX);
  if (!body) throw new Error("본문을 입력해 주세요");

  // 가사가 아닌 글에 붙은 미디어는 재생할 곳이 없다. 저장 단계에서 떼어낸다.
  const media = draft.kind === "song" ? normalizeMedia(draft.media) : NO_MEDIA;
  const items = loadLibrary();
  const now = Date.now();

  if (id) {
    const next = items.map((item) =>
      item.id === id
        ? { ...item, kind: draft.kind, title, source, body, media, updatedAt: now }
        : item,
    );
    persist(next);
    dropUnusedAudio(items, next);
    return next;
  }

  if (items.length >= SCRIPTURE_LIMIT) {
    throw new Error(`보관함은 ${SCRIPTURE_LIMIT}개까지입니다`);
  }

  // 새 글이 위로 오게 둔다. 방금 넣은 것을 바로 고르는 경우가 대부분이다.
  const next: ScriptureItem[] = [
    {
      id: newId(),
      kind: draft.kind,
      title: title || "제목 없음",
      source,
      body,
      media,
      createdAt: now,
      updatedAt: now,
    },
    ...items,
  ];
  persist(next);
  return next;
}

export function deleteItem(id: string): ScriptureItem[] {
  const items = loadLibrary();
  const next = items.filter((item) => item.id !== id);
  persist(next);
  dropUnusedAudio(items, next);
  return next;
}

/**
 * 본문을 연습할 줄로 나눈다.
 *
 * 줄바꿈을 그대로 살린다. 가사나 시는 줄 구분 자체가 원문의 일부여서
 * 문장부호로 다시 자르면 원래 모양이 무너진다. 원본 필사타입도 줄 단위였다.
 * 빈 줄은 칠 것이 없으므로 건너뛴다.
 */
export function toLines(body: string): string[] {
  return body
    .replace(/\r\n?/g, "\n")
    .split("\n")
    .map((line) => line.trim())
    .filter((line) => line.length > 0);
}
