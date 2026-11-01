import { FPS, MAX_BYTES, MAX_SECONDS, recorderFor, stopTracks, waitForMedia } from "./media";

/** Decode and re-record only [start, end]; Blob slicing cannot trim encoded media. */
export async function trimRecording(blob: Blob, start: number, end: number, signal: AbortSignal,
  onProgress: (fraction: number) => void): Promise<Blob> {
  if (!Number.isFinite(start) || !Number.isFinite(end) || start < 0 || end - start < 0.1 - 1e-6 || end > MAX_SECONDS + 1) {
    throw new Error("시작과 끝 사이에 최소 0.1초를 선택해 주세요.");
  }
  const video = document.createElement("video");
  video.playsInline = true;
  video.preload = "auto";
  const url = URL.createObjectURL(blob);
  let stream: MediaStream | undefined;
  let audio: AudioContext | undefined;
  let recorder: MediaRecorder | undefined;
  let timer: ReturnType<typeof setInterval> | undefined;
  let timeout: ReturnType<typeof setTimeout> | undefined;
  let abort: (() => void) | undefined;
  let visibility: (() => void) | undefined;
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
    signal.throwIfAborted();
    const canvas = document.createElement("canvas");
    canvas.width = video.videoWidth; canvas.height = video.videoHeight;
    const context = canvas.getContext("2d", { alpha: false });
    if (!context || !canvas.width || !canvas.height) throw new Error("영상을 디코딩할 수 없습니다.");
    context.drawImage(video, 0, 0);
    stream = canvas.captureStream(FPS);
    // Web Audio routes the decoded original audio into the new recorder without
    // requiring the less portable HTMLMediaElement.captureStream API or speakers.
    audio = new AudioContext();
    const source = audio.createMediaElementSource(video);
    const destination = audio.createMediaStreamDestination();
    source.connect(destination);
    destination.stream.getAudioTracks().forEach((track) => stream!.addTrack(track));
    await audio.resume();
    if (audio.state !== "running") throw new Error("오디오 인코더를 시작할 수 없습니다. 다시 시도해 주세요.");
    recorder = recorderFor(stream);
    const result = await new Promise<Blob>((resolve, reject) => {
      const chunks: Blob[] = [];
      let bytes = 0;
      let failed = false;
      const fail = (error: unknown) => {
        if (failed) return;
        failed = true;
        clearInterval(timer);
        video.pause();
        if (recorder!.state !== "inactive") recorder!.stop();
        reject(error);
      };
      const finish = () => {
        video.pause();
        clearInterval(timer);
        if (recorder!.state === "recording") recorder!.stop();
      };
      abort = () => fail(new DOMException("Cancelled", "AbortError"));
      visibility = () => { if (document.hidden) fail(new Error("내보내기 중에는 현재 탭을 열어 두세요. 다시 시도해 주세요.")); };
      document.addEventListener("visibilitychange", visibility);
      signal.addEventListener("abort", abort, { once: true });
      if (signal.aborted) { abort(); return; }
      recorder!.ondataavailable = ({ data }) => {
        bytes += data.size;
        if (bytes > MAX_BYTES) { fail(new Error("내보내기 파일이 100 MB를 초과합니다. 구간을 줄여 주세요.")); return; }
        if (data.size) chunks.push(data);
      };
      recorder!.onerror = () => fail(new Error("구간 내보내기에 실패했습니다."));
      recorder!.onstop = () => {
        if (failed) return;
        if (!chunks.length) { reject(new Error("선택 구간에 영상이 없습니다.")); return; }
        onProgress(1);
        resolve(new Blob(chunks, { type: recorder!.mimeType }));
      };
      video.onended = finish;
      video.onerror = () => fail(new Error("영상을 재생할 수 없습니다."));
      recorder!.start(250);
      void video.play().catch(fail);
      timer = setInterval(() => {
        try {
          if (video.currentTime >= end || video.ended) { finish(); return; }
          if (!video.paused && video.readyState >= 2) context.drawImage(video, 0, 0);
          onProgress(Math.min(1, (video.currentTime - start) / (end - start)));
        } catch (error) { fail(error); }
      }, 1000 / FPS);
      timeout = setTimeout(() => fail(new Error("내보내기 시간이 초과되었습니다. 다시 시도해 주세요.")), (end - start + 30) * 1000);
    });
    return result;
  } finally {
    clearInterval(timer); clearTimeout(timeout);
    if (abort) signal.removeEventListener("abort", abort);
    if (visibility) document.removeEventListener("visibilitychange", visibility);
    if (recorder && recorder.state !== "inactive") recorder.stop();
    stopTracks(stream);
    video.pause(); video.removeAttribute("src"); video.load();
    URL.revokeObjectURL(url);
    if (audio && audio.state !== "closed") await audio.close();
  }
}
