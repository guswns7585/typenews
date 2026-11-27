import fixWebmDuration from "fix-webm-duration";

export const MAX_SECONDS = 300;
// DCInside accepts files up to 50 MB. Keep a little headroom for differences
// between decimal and binary size calculation and final encoder metadata.
export const MAX_BYTES = 47 * 1024 * 1024;
export const FPS = 30;

export function recorderFor(stream: MediaStream): MediaRecorder {
  const types = [
    "video/mp4;codecs=avc1.42E01E,mp4a.40.2",
    "video/mp4",
    "video/webm;codecs=vp8,opus",
    "video/webm;codecs=vp9,opus",
    "video/webm",
  ];
  const options = {
    videoBitsPerSecond: 4_000_000,
    audioBitsPerSecond: 192_000,
  };
  for (const mimeType of types) {
    if (!MediaRecorder.isTypeSupported(mimeType)) continue;
    try {
      return new MediaRecorder(stream, { ...options, mimeType });
    } catch (error) {
      if (!(error instanceof DOMException) || error.name !== "NotSupportedError") throw error;
    }
  }
  return new MediaRecorder(stream, options);
}

/** Chromium WebM recordings can omit Duration, which some uploaders reject. */
export async function finalizeRecordingBlob(blob: Blob, durationSeconds: number) {
  if (!blob.type.toLowerCase().includes("webm")) return blob;
  return fixWebmDuration(blob, Math.max(100, durationSeconds * 1000), { logger: false });
}

export function stopTracks(stream?: MediaStream) {
  stream?.getTracks().forEach((track) => track.stop());
}

export async function waitForRecordingStep<T>(
  task: Promise<T>, timeoutMs: number, message: string, signal?: AbortSignal,
): Promise<T> {
  let timer: ReturnType<typeof setTimeout> | undefined;
  let abort: (() => void) | undefined;
  try {
    return await Promise.race([
      task,
      new Promise<never>((_, reject) => {
        timer = setTimeout(() => reject(new Error(message)), timeoutMs);
        abort = () => reject(signal?.reason);
        signal?.addEventListener("abort", abort, { once: true });
        if (signal?.aborted) abort();
      }),
    ]);
  } finally {
    clearTimeout(timer);
    if (abort) signal?.removeEventListener("abort", abort);
  }
}

export async function resumeRecordingAudio(
  context: AudioContext, signal: AbortSignal | undefined, timeoutMs: number, message: string,
) {
  signal?.throwIfAborted();
  await waitForRecordingStep(context.resume(), timeoutMs, message, signal);
  if (context.state !== "running") throw new Error(message);
}

export function waitForMedia(video: HTMLVideoElement, event: "loadeddata" | "seeked", signal: AbortSignal,
  message = "영상을 읽을 수 없습니다.",
) {
  return new Promise<void>((resolve, reject) => {
    const cleanup = () => {
      clearTimeout(timer);
      video.removeEventListener(event, done);
      video.removeEventListener("error", failed);
      signal.removeEventListener("abort", aborted);
    };
    const done = () => { cleanup(); resolve(); };
    const failed = () => { cleanup(); reject(new Error(message)); };
    const aborted = () => { cleanup(); reject(new DOMException("Cancelled", "AbortError")); };
    const timer = setTimeout(failed, 15_000);
    video.addEventListener(event, done, { once: true });
    video.addEventListener("error", failed, { once: true });
    signal.addEventListener("abort", aborted, { once: true });
    if (signal.aborted) aborted();
  });
}

export function downloadRecording(blob: Blob, trimmed = false) {
  const url = URL.createObjectURL(blob);
  const link = document.createElement("a");
  link.href = url;
  link.download = `typenews-${trimmed ? "trimmed-" : ""}${new Date().toISOString().replace(/[:.]/g, "-")}.${blob.type.includes("mp4") ? "mp4" : "webm"}`;
  link.click();
  // Keep the object alive long enough for the browser's download handoff.
  setTimeout(() => URL.revokeObjectURL(url), 60_000);
}

export function recordingError(error: unknown) {
  if (error instanceof DOMException) {
    if (error.name === "NotAllowedError") return "공유가 취소되었거나 권한이 거부되었습니다. 마이크 사용 시 브라우저 권한도 확인해 주세요.";
    if (error.name === "NotReadableError") return "탭 또는 마이크를 사용할 수 없습니다. 다른 앱의 사용 여부를 확인해 주세요.";
    if (error.name === "NotSupportedError") return "사용 가능한 녹화 형식이 없습니다. Chrome 또는 Edge를 업데이트하고 다시 시도해 주세요.";
    if (error.name === "AbortError") return "녹화 작업이 취소되었습니다.";
  }
  return error instanceof Error ? error.message : "녹화 중 오류가 발생했습니다.";
}
