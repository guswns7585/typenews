import { SHOWCASE_MEDIA_LIMITS } from "@/features/showcase/media";
import fixWebmDuration from "fix-webm-duration";
import { stopTracks, waitForMedia } from "./media";

function audioRecorder(stream: MediaStream) {
  const candidates = [
    { mime: "audio/webm;codecs=opus", fileType: "audio/webm", extension: "webm" },
    { mime: "audio/webm", fileType: "audio/webm", extension: "webm" },
    { mime: "audio/ogg;codecs=opus", fileType: "audio/ogg", extension: "ogg" },
    { mime: "audio/mp4", fileType: "audio/mp4", extension: "m4a" },
  ];
  const type = candidates.find((candidate) => MediaRecorder.isTypeSupported(candidate.mime));
  if (!type) throw new Error("이 브라우저에서는 타건음 파일을 만들 수 없습니다.");
  return {
    recorder: new MediaRecorder(stream, { mimeType: type.mime, audioBitsPerSecond: 128_000 }),
    ...type,
  };
}

/** Replays the selected part through Web Audio and records only its audio track. */
export async function extractRecordingAudio(
  blob: Blob,
  start: number,
  end: number,
  signal: AbortSignal,
  onProgress: (fraction: number) => void,
) {
  const length = end - start;
  if (!Number.isFinite(start) || !Number.isFinite(end) || start < 0 || length < 0.1 || length > SHOWCASE_MEDIA_LIMITS.audioDurationSeconds + 0.001) {
    throw new Error(`타건음 구간은 0.1초 이상 ${SHOWCASE_MEDIA_LIMITS.audioDurationSeconds}초 이하로 선택해 주세요.`);
  }
  const video = document.createElement("video");
  video.playsInline = true;
  video.preload = "auto";
  const url = URL.createObjectURL(blob);
  let context: AudioContext | undefined;
  let output: MediaStream | undefined;
  let recorder: MediaRecorder | undefined;
  let timer: ReturnType<typeof setInterval> | undefined;
  let timeout: ReturnType<typeof setTimeout> | undefined;
  try {
    signal.throwIfAborted();
    const loaded = waitForMedia(video, "loadeddata", signal);
    video.src = url;
    await loaded;
    if (start > 0) {
      const seeked = waitForMedia(video, "seeked", signal);
      video.currentTime = start;
      await seeked;
    }
    context = new AudioContext();
    const source = context.createMediaElementSource(video);
    const destination = context.createMediaStreamDestination();
    source.connect(destination);
    output = destination.stream;
    await context.resume();
    if (context.state !== "running") throw new Error("오디오 변환을 시작할 수 없습니다.");
    const selected = audioRecorder(output);
    recorder = selected.recorder;
    const result = await new Promise<File>((resolve, reject) => {
      const chunks: Blob[] = [];
      let bytes = 0;
      let settled = false;
      const cleanup = () => {
        clearInterval(timer);
        clearTimeout(timeout);
        signal.removeEventListener("abort", abort);
        document.removeEventListener("visibilitychange", hidden);
      };
      const fail = (error: unknown) => {
        if (settled) return;
        settled = true;
        cleanup();
        video.pause();
        if (recorder?.state !== "inactive") recorder?.stop();
        reject(error);
      };
      const finish = () => {
        if (settled) return;
        video.pause();
        if (recorder?.state === "recording") recorder.stop();
      };
      const abort = () => fail(new DOMException("Cancelled", "AbortError"));
      const hidden = () => { if (document.hidden) fail(new Error("타건음을 만드는 동안 현재 탭을 열어 두세요.")); };
      signal.addEventListener("abort", abort, { once: true });
      document.addEventListener("visibilitychange", hidden);
      recorder!.ondataavailable = ({ data }) => {
        bytes += data.size;
        if (bytes > SHOWCASE_MEDIA_LIMITS.audioBytes) { fail(new Error("선택한 타건음이 1MB를 넘습니다. 구간을 줄여 주세요.")); return; }
        if (data.size) chunks.push(data);
      };
      recorder!.onerror = () => fail(new Error("타건음 변환에 실패했습니다."));
      recorder!.onstop = () => {
        if (settled) return;
        settled = true;
        cleanup();
        if (!chunks.length) { reject(new Error("선택 구간에서 소리를 찾지 못했습니다.")); return; }
        void (async () => {
          const raw = new Blob(chunks, { type: selected.fileType });
          // Chromium MediaRecorder WebM files often omit Duration metadata.
          // Without it, a 10-second clip can appear to be over a minute after upload.
          const fixed = selected.fileType === "audio/webm"
            ? await fixWebmDuration(raw, length * 1000, { logger: false })
            : raw;
          if (fixed.size > SHOWCASE_MEDIA_LIMITS.audioBytes) throw new Error("선택한 타건음이 1MB를 넘습니다. 구간을 줄여 주세요.");
          onProgress(1);
          resolve(new File([fixed], `typing-sound-${Date.now()}.${selected.extension}`, { type: selected.fileType }));
        })().catch(reject);
      };
      video.onerror = () => fail(new Error("녹화 영상을 읽을 수 없습니다."));
      video.onended = finish;
      // The clip is capped at 45 seconds and 1 MB, so chunking is unnecessary.
      // A single chunk also gives Chromium a better chance to write valid timing data.
      recorder!.start();
      void video.play().catch(fail);
      timer = setInterval(() => {
        if (video.currentTime >= end || video.ended) { finish(); return; }
        onProgress(Math.min(1, Math.max(0, (video.currentTime - start) / length)));
      }, 100);
      timeout = setTimeout(() => fail(new Error("타건음 변환 시간이 초과되었습니다.")), (length + 20) * 1000);
    });
    return result;
  } finally {
    clearInterval(timer);
    clearTimeout(timeout);
    if (recorder && recorder.state !== "inactive") recorder.stop();
    stopTracks(output);
    video.pause();
    video.removeAttribute("src");
    video.load();
    URL.revokeObjectURL(url);
    if (context && context.state !== "closed") await context.close();
  }
}
