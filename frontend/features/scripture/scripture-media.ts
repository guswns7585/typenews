/**
 * 필사에 붙는 음원과 영상.
 *
 * 음원 파일은 IndexedDB에, 나머지 메타데이터는 보관함(localStorage)에 둔다.
 * 파일을 나눠 두는 이유는 단순하다 — localStorage는 문자열만 담고 5MB 안팎이라
 * 음원 하나도 들어가지 않는다. IndexedDB는 Blob을 그대로 담는다.
 *
 * 음원도 영상 링크도 서버로 보내지 않는다. 보관함과 같은 이유다:
 * 저작권이 걸린 음원이 들어올 수 있고, 모으는 순간 우리가 배포자가 된다.
 */

const DB_NAME = "typenews-scripture-media";
const DB_VERSION = 1;
const STORE = "audio-files";

/**
 * 음원 파일 크기 상한.
 *
 * IndexedDB 자체에는 이만한 제한이 없지만, 브라우저는 출처별 저장 할당량을
 * 넘기면 조용히 지워버린다. 5분짜리 mp3가 대략 5MB라 40MB면 넉넉하다.
 */
export const AUDIO_MAX_BYTES = 40 * 1024 * 1024;

export type ScriptureMedia =
  | { type: "none" }
  | {
      type: "audio";
      /** IndexedDB의 키. 보관함에는 이 값만 남는다. */
      audioId: string;
      name: string;
      startSeconds: number;
      loop: boolean;
    }
  | {
      type: "youtube";
      url: string;
      videoId: string;
      startSeconds: number;
      loop: boolean;
    };

export const NO_MEDIA: ScriptureMedia = { type: "none" };

function openDatabase(): Promise<IDBDatabase> {
  return new Promise((resolve, reject) => {
    if (typeof indexedDB === "undefined") {
      reject(new Error("이 브라우저에서는 음원을 저장할 수 없습니다"));
      return;
    }
    const request = indexedDB.open(DB_NAME, DB_VERSION);
    request.onupgradeneeded = () => {
      const database = request.result;
      if (!database.objectStoreNames.contains(STORE)) {
        database.createObjectStore(STORE, { keyPath: "id" });
      }
    };
    request.onsuccess = () => resolve(request.result);
    request.onerror = () => reject(request.error);
  });
}

type AudioRecord = { id: string; blob: Blob; name: string; updatedAt: number };

export function newAudioId() {
  return `audio-${Date.now()}-${Math.random().toString(16).slice(2)}`;
}

export async function writeAudioFile(id: string, file: File): Promise<void> {
  if (file.size > AUDIO_MAX_BYTES) {
    throw new Error(`음원은 ${Math.floor(AUDIO_MAX_BYTES / 1024 / 1024)}MB까지 넣을 수 있습니다`);
  }
  const database = await openDatabase();
  await new Promise<void>((resolve, reject) => {
    const transaction = database.transaction(STORE, "readwrite");
    transaction.objectStore(STORE).put({
      id,
      blob: file,
      name: file.name,
      updatedAt: Date.now(),
    } satisfies AudioRecord);
    transaction.oncomplete = () => resolve();
    transaction.onerror = () => reject(transaction.error);
  });
  database.close();
}

export async function readAudioFile(id: string): Promise<AudioRecord | null> {
  if (!id) return null;
  const database = await openDatabase();
  const record = await new Promise<AudioRecord | null>((resolve, reject) => {
    const transaction = database.transaction(STORE, "readonly");
    const request = transaction.objectStore(STORE).get(id);
    request.onsuccess = () => resolve((request.result as AudioRecord) ?? null);
    request.onerror = () => reject(request.error);
  });
  database.close();
  return record;
}

export async function removeAudioFile(id: string): Promise<void> {
  if (!id) return;
  const database = await openDatabase();
  await new Promise<void>((resolve, reject) => {
    const transaction = database.transaction(STORE, "readwrite");
    transaction.objectStore(STORE).delete(id);
    transaction.oncomplete = () => resolve();
    transaction.onerror = () => reject(transaction.error);
  });
  database.close();
}

/** 하루를 넘는 시작 지점은 실수로 본다. */
export function sanitizeStartSeconds(value: unknown): number {
  return Math.min(Math.max(Math.floor(Number(value) || 0), 0), 86400);
}

/**
 * 링크에서 영상 번호만 뽑는다.
 *
 * watch·youtu.be·shorts·live·embed와 music.youtube를 모두 받는다.
 * 붙여 넣는 링크의 모양이 제각각이라 하나만 받으면 대부분 실패한다.
 */
export function extractYouTubeVideoId(value: string): string {
  const raw = value.trim();
  if (!raw) return "";

  try {
    const url = new URL(raw.includes("://") ? raw : `https://${raw}`);
    const hostname = url.hostname.replace(/^www\./, "");

    if (hostname === "youtu.be") return url.pathname.split("/").filter(Boolean)[0] ?? "";
    if (["youtube.com", "m.youtube.com", "music.youtube.com"].includes(hostname)) {
      if (url.pathname === "/watch") return url.searchParams.get("v") ?? "";
      const parts = url.pathname.split("/").filter(Boolean);
      if (["embed", "shorts", "live"].includes(parts[0] ?? "")) return parts[1] ?? "";
    }
  } catch {
    return "";
  }

  return "";
}

/** `?t=90`, `?t=1m30s`, `#t=90` 같은 시작 지점을 초로 바꾼다. */
export function extractYouTubeStartSeconds(value: string): number {
  const raw = value.trim();
  if (!raw) return 0;
  try {
    const url = new URL(raw.includes("://") ? raw : `https://${raw}`);
    const time =
      url.searchParams.get("t") ??
      url.searchParams.get("start") ??
      new URLSearchParams(url.hash.replace(/^#/, "")).get("t");
    if (!time) return 0;
    if (/^\d+$/.test(time)) return sanitizeStartSeconds(time);
    const match = time.toLowerCase().match(/^(?:(\d+)h)?(?:(\d+)m)?(?:(\d+)s)?$/);
    if (!match) return 0;
    return sanitizeStartSeconds(
      (Number(match[1]) || 0) * 3600 + (Number(match[2]) || 0) * 60 + (Number(match[3]) || 0),
    );
  } catch {
    return 0;
  }
}

/**
 * 임베드 주소.
 *
 * youtube-nocookie를 쓴다. 재생 전까지 추적 쿠키를 심지 않는 도메인이라
 * 우리 쪽에서 남의 쿠키를 굴리지 않아도 된다.
 * `enablejsapi`는 postMessage로 일시정지를 걸기 위해 필요하다.
 */
export function buildYouTubeEmbedUrl(
  media: Extract<ScriptureMedia, { type: "youtube" }>,
  autoplay = true,
): string {
  const params = new URLSearchParams({
    autoplay: autoplay ? "1" : "0",
    playsinline: "1",
    enablejsapi: "1",
    controls: "1",
    rel: "0",
    start: String(sanitizeStartSeconds(media.startSeconds)),
  });
  // 반복은 playlist에 자기 자신을 넣어야 동작한다. YouTube의 오래된 규칙이다.
  if (media.loop) {
    params.set("loop", "1");
    params.set("playlist", media.videoId);
  }
  if (typeof location !== "undefined" && location.protocol.startsWith("http")) {
    params.set("origin", location.origin);
  }
  return `https://www.youtube-nocookie.com/embed/${encodeURIComponent(media.videoId)}?${params}`;
}

/** 화면에 적을 이름. */
export function mediaLabel(media: ScriptureMedia): string {
  if (media.type === "audio") return media.name || "저장된 음원";
  if (media.type === "youtube") return "YouTube 영상";
  return "";
}
