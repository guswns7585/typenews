export const MAX_SECONDS = 300;
export const MAX_BYTES = 100 * 1024 * 1024;
export const FPS = 30;

export function recorderFor(stream: MediaStream): MediaRecorder {
  const types = ["video/webm;codecs=vp9,opus", "video/webm;codecs=vp8,opus", "video/webm", "video/mp4"];
  const mimeType = types.find((type) => MediaRecorder.isTypeSupported(type));
  return new MediaRecorder(stream, {
    ...(mimeType ? { mimeType } : {}),
    videoBitsPerSecond: 4_000_000,
    audioBitsPerSecond: 192_000,
  });
}

export function stopTracks(stream?: MediaStream) {
  stream?.getTracks().forEach((track) => track.stop());
}

export function waitForMedia(video: HTMLVideoElement, event: "loadeddata" | "seeked", signal: AbortSignal) {
  return new Promise<void>((resolve, reject) => {
    const cleanup = () => {
      clearTimeout(timer);
      video.removeEventListener(event, done);
      video.removeEventListener("error", failed);
      signal.removeEventListener("abort", aborted);
    };
    const done = () => { cleanup(); resolve(); };
    const failed = () => { cleanup(); reject(new Error("영상을 읽을 수 없습니다.")); };
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
    if (error.name === "AbortError") return "녹화 작업이 취소되었습니다.";
  }
  return error instanceof Error ? error.message : "녹화 중 오류가 발생했습니다.";
}
