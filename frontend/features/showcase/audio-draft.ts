import type { MyShowcaseItem, ShowcaseBuildInfo } from "./types";

const DATABASE = "typenews-showcase-drafts";
const STORE = "drafts";
const VERSION = 1;

export type ShowcaseEditorDraft = {
  id: string;
  createdAt: number;
  returnUrl: string;
  item: (MyShowcaseItem & { thumbnailUrl?: string | null }) | null;
  title: string;
  description: string;
  keyxifUrl: string;
  build: ShowcaseBuildInfo;
  image: File | null;
  audio: File | null;
  audioDurationMs: number | null;
  removeAudio: boolean;
  keyxifSnapshot: Record<string, unknown> | null;
};

function openDatabase() {
  return new Promise<IDBDatabase>((resolve, reject) => {
    const request = indexedDB.open(DATABASE, VERSION);
    request.onupgradeneeded = () => {
      if (!request.result.objectStoreNames.contains(STORE)) request.result.createObjectStore(STORE, { keyPath: "id" });
    };
    request.onsuccess = () => resolve(request.result);
    request.onerror = () => reject(request.error ?? new Error("임시 저장소를 열 수 없습니다."));
  });
}

function requestResult<T>(request: IDBRequest<T>) {
  return new Promise<T>((resolve, reject) => {
    request.onsuccess = () => resolve(request.result);
    request.onerror = () => reject(request.error ?? new Error("임시 저장소 작업에 실패했습니다."));
  });
}

export async function saveShowcaseDraft(draft: ShowcaseEditorDraft) {
  const database = await openDatabase();
  try {
    await requestResult(database.transaction(STORE, "readwrite").objectStore(STORE).put(draft));
  } finally {
    database.close();
  }
}

export async function readShowcaseDraft(id: string) {
  const database = await openDatabase();
  try {
    return (await requestResult(database.transaction(STORE).objectStore(STORE).get(id))) as ShowcaseEditorDraft | undefined;
  } finally {
    database.close();
  }
}

export async function removeShowcaseDraft(id: string) {
  const database = await openDatabase();
  try {
    await requestResult(database.transaction(STORE, "readwrite").objectStore(STORE).delete(id));
  } finally {
    database.close();
  }
}

export async function attachAudioToShowcaseDraft(id: string, audio: File, audioDurationMs: number) {
  const draft = await readShowcaseDraft(id);
  if (!draft) throw new Error("돌아갈 아카이브 편집 내용을 찾지 못했습니다.");
  await saveShowcaseDraft({ ...draft, audio, audioDurationMs, removeAudio: false });
  return draft.returnUrl;
}
