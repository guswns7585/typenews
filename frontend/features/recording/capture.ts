import { FPS, MAX_BYTES, MAX_SECONDS, recorderFor, stopTracks, waitForMedia } from "./media";
import { enhanceTypingAudio } from "./audio";

let activeHandle: string | undefined;
const RECORDING_LAYOUT_EVENT = "typenews:recording-layout-lock";

function lockRecordingLayout(active: boolean) {
  if (typeof window.dispatchEvent === "function" && typeof CustomEvent !== "undefined") {
    window.dispatchEvent(new CustomEvent(RECORDING_LAYOUT_EVENT, { detail: active }));
  }
}

type CaptureDevices = MediaDevices & {
  setCaptureHandleConfig?: (config: { handle?: string; permittedOrigins?: string[] }) => void;
};
type CaptureTrack = MediaStreamTrack & { getCaptureHandle?: () => { handle?: string } | null };
export type RecordingResult = { blob: Blob; duration: number; notice?: string };

/** Sharing UI and closing the setup dialog can briefly change the layout. */
async function stableTarget(target: () => HTMLElement | null, signal: AbortSignal) {
  const deadline = performance.now() + 4000;
  let previous = "";
  let stableSince = performance.now();
  while (performance.now() < deadline) {
    signal.throwIfAborted();
    const rect = target()?.getBoundingClientRect();
    if (!rect?.width || !rect.height) throw new Error("녹화할 타이핑 영역이 없습니다.");
    const key = [innerWidth, innerHeight, rect.left, rect.top, rect.width, rect.height]
      .map((value) => Math.round(value * 2)).join(":");
    if (key !== previous) { previous = key; stableSince = performance.now(); }
    else if (performance.now() - stableSince >= 250) return rect;
    await new Promise<void>((resolve, reject) => {
      const aborted = () => { clearTimeout(timer); reject(new DOMException("Cancelled", "AbortError")); };
      const timer = setTimeout(() => { signal.removeEventListener("abort", aborted); resolve(); }, 50);
      signal.addEventListener("abort", aborted, { once: true });
    });
  }
  throw new Error("타이핑 영역이 이동 중입니다. 움직임이 멈춘 후 다시 녹화해 주세요.");
}

/** Owns a user-approved display connection across individual recordings. */
export class CaptureSharing {
  private stream?: MediaStream;
  private handle?: string;
  private detach?: () => void;
  constructor(private readonly onChange: (active: boolean) => void = () => {}) {}

  get active() {
    const track = this.stream?.getVideoTracks()[0] as CaptureTrack | undefined;
    return !!track && track.readyState === "live" && track.getCaptureHandle?.()?.handle === this.handle;
  }

  async connect(signal: AbortSignal) {
    if (this.active) return { display: this.stream!, handle: this.handle! };
    this.close();
    signal.throwIfAborted();
    const devices = navigator.mediaDevices as CaptureDevices;
    const handle = crypto.randomUUID();
    devices.setCaptureHandleConfig!({ handle, permittedOrigins: [location.origin] });
    activeHandle = handle;
    let display: MediaStream | undefined;
    try {
      display = await devices.getDisplayMedia({
        video: { displaySurface: "browser", frameRate: FPS }, audio: false,
        preferCurrentTab: true, selfBrowserSurface: "include", surfaceSwitching: "exclude",
        monitorTypeSurfaces: "exclude",
      } as DisplayMediaStreamOptions);
      signal.throwIfAborted();
      const track = display.getVideoTracks()[0] as CaptureTrack | undefined;
      if (!track || track.readyState !== "live" || track.getSettings().displaySurface !== "browser" || track.getCaptureHandle?.()?.handle !== handle) {
        throw new Error("공유 선택 창에서 현재 TypeNews 브라우저 탭을 선택해 주세요. 화면·창·다른 탭은 녹화할 수 없습니다.");
      }
      this.stream = display;
      this.handle = handle;
      const ended = () => this.close();
      track.addEventListener("ended", ended);
      track.addEventListener("capturehandlechange", ended);
      this.detach = () => {
        track.removeEventListener("ended", ended);
        track.removeEventListener("capturehandlechange", ended);
      };
      this.onChange(true);
      return { display, handle };
    } catch (error) {
      stopTracks(display);
      if (activeHandle === handle) { devices.setCaptureHandleConfig?.({}); activeHandle = undefined; }
      throw error;
    }
  }

  close(expectedHandle?: string) {
    if (expectedHandle && this.handle !== expectedHandle) return;
    this.detach?.(); this.detach = undefined;
    stopTracks(this.stream); this.stream = undefined;
    if (this.handle && activeHandle === this.handle) {
      (navigator.mediaDevices as CaptureDevices).setCaptureHandleConfig?.({});
      activeHandle = undefined;
    }
    this.handle = undefined;
    this.onChange(false);
  }
}

/** Capture only a verified self tab: a different tab has unrelated DOM coordinates. */
export async function startCapture(options: {
  target: () => HTMLElement | null;
  microphone: boolean;
  signal: AbortSignal;
  sharing?: CaptureSharing;
  onComplete: (result: RecordingResult) => void;
  onError: (error: unknown) => void;
}): Promise<{ stop: () => void }> {
  const { signal } = options;
  const devices = navigator.mediaDevices as CaptureDevices | undefined;
  if (!window.isSecureContext || !devices?.getDisplayMedia || !devices.setCaptureHandleConfig ||
      typeof MediaRecorder === "undefined" || !HTMLCanvasElement.prototype.captureStream) {
    throw new Error("탭 녹화는 HTTPS의 데스크톱 Chrome 또는 Edge에서 사용해 주세요.");
  }
  let display: MediaStream | undefined;
  let mic: MediaStream | undefined;
  let output: MediaStream | undefined;
  let enhancedMic: Awaited<ReturnType<typeof enhanceTypingAudio>> | undefined;
  let recorder: MediaRecorder | undefined;
  let frame: ReturnType<typeof setInterval> | undefined;
  let deadline: ReturnType<typeof setTimeout> | undefined;
  let started = 0;
  let ended = 0;
  let notice: string | undefined;
  let failed = false;
  let layoutLocked = true;
  lockRecordingLayout(true);
  const preparing = new AbortController();
  const video = document.createElement("video");
  video.muted = true;
  video.playsInline = true;
  let handle = crypto.randomUUID();
  let retainSharing = false;
  const removeListeners: (() => void)[] = [];
  const cleanup = () => {
    if (layoutLocked) { layoutLocked = false; lockRecordingLayout(false); }
    preparing.abort();
    clearInterval(frame);
    clearTimeout(deadline);
    signal.removeEventListener("abort", cancel);
    document.removeEventListener("visibilitychange", visibility);
    removeListeners.splice(0).forEach((remove) => remove());
    stopTracks(output); stopTracks(mic);
    enhancedMic?.close(); enhancedMic = undefined;
    if (!retainSharing) {
      if (options.sharing) options.sharing.close(handle);
      stopTracks(display);
    }
    video.pause(); video.srcObject = null;
    video.remove?.();
    if (!retainSharing && activeHandle === handle) {
      devices.setCaptureHandleConfig?.({});
      activeHandle = undefined;
    }
  };
  const stop = (message?: string, retain = false) => {
    if (ended) return;
    ended = performance.now();
    notice = message;
    retainSharing = retain && !!options.sharing?.active && !signal.aborted && !failed;
    clearInterval(frame);
    clearTimeout(deadline);
    if (recorder?.state === "recording") recorder.stop();
    else cleanup();
  };
  const cancel = () => stop();
  const visibility = () => { if (document.hidden) stop("탭이 숨겨져 녹화를 종료했습니다."); };
  signal.addEventListener("abort", cancel, { once: true });
  try {
    signal.throwIfAborted();
    // Hints do not constrain the chooser; validate the actual returned track below.
    const constraints = {
      video: { displaySurface: "browser", frameRate: FPS }, audio: false,
      preferCurrentTab: true, selfBrowserSurface: "include", surfaceSwitching: "exclude",
      monitorTypeSurfaces: "exclude",
    };
    if (options.sharing) {
      ({ display, handle } = await options.sharing.connect(signal));
    } else {
      devices.setCaptureHandleConfig({ handle, permittedOrigins: [location.origin] });
      activeHandle = handle;
      display = await devices.getDisplayMedia(constraints);
    }
    signal.throwIfAborted();
    const track = display.getVideoTracks()[0] as CaptureTrack | undefined;
    if (!track || track.getSettings().displaySurface !== "browser" || track.getCaptureHandle?.()?.handle !== handle) {
      throw new Error("공유 선택 창에서 현재 TypeNews 브라우저 탭을 선택해 주세요. 화면·창·다른 탭은 녹화할 수 없습니다.");
    }
    const sourceEnded = () => stop("브라우저에서 공유가 종료되었습니다.");
    track.addEventListener("ended", sourceEnded, { once: true });
    const sourceChanged = () => stop("공유 탭이 변경되어 종료했습니다.");
    track.addEventListener("capturehandlechange", sourceChanged);
    removeListeners.push(() => {
      track.removeEventListener("ended", sourceEnded);
      track.removeEventListener("capturehandlechange", sourceChanged);
    });
    if (options.microphone) {
      mic = await devices.getUserMedia({ audio: { noiseSuppression: false, echoCancellation: false, autoGainControl: false }, video: false });
      signal.throwIfAborted();
      if (ended) throw new Error("마이크 권한 확인 중 탭 공유가 종료되었습니다.");
      if (!mic.getAudioTracks().length || mic.getAudioTracks().some((audio) => audio.readyState !== "live")) throw new Error("마이크 연결이 종료되었습니다.");
      mic.getAudioTracks().forEach((audio) => audio.addEventListener("ended", () => stop("마이크 연결이 종료되었습니다."), { once: true }));
      enhancedMic = await enhanceTypingAudio(mic);
    }
    video.srcObject = display;
    const loaded = waitForMedia(video, "loadeddata", preparing.signal);
    await Promise.all([video.play(), loaded]);
    signal.throwIfAborted();
    if (ended || track.readyState !== "live") throw new Error("공유가 시작되기 전에 종료되었습니다.");
    const canvas = document.createElement("canvas");
    const context = canvas.getContext("2d", { alpha: false });
    if (!context) throw new Error("영상 캔버스를 만들 수 없습니다.");
    const initial = await stableTarget(options.target, preparing.signal);
    signal.throwIfAborted();
    if (ended) throw new Error(notice || "공유가 시작되기 전에 종료되었습니다.");
    // Keep the source uncropped. Native crop reconfiguration can stall on a
    // static tab or report dimensions different from a fractional DOM rectangle.
    // loadeddata already provides a drawable frame; drawImage crops the output.
    const scale = Math.min(devicePixelRatio || 1, 1920 / initial.width, 1080 / initial.height);
    canvas.width = Math.max(2, Math.round(initial.width * scale / 2) * 2);
    canvas.height = Math.max(2, Math.round(initial.height * scale / 2) * 2);
    const viewportWidth = innerWidth;
    const viewportHeight = innerHeight;
    const draw = () => {
      if (track.readyState !== "live" || track.getCaptureHandle?.()?.handle !== handle) throw new Error("공유 탭이 변경되거나 종료되었습니다.");
      if (mic?.getAudioTracks().some((audio) => audio.readyState !== "live")) throw new Error("마이크 연결이 종료되었습니다.");
      const element = options.target();
      const rect = element?.getBoundingClientRect();
      if (!element?.isConnected || !rect?.width || !rect.height) throw new Error("타이핑 영역이 사라져 녹화를 종료했습니다.");
      // Prompt length may naturally change the card height. The output canvas
      // stays fixed while each frame follows the current verified target rect.
      // Direct layout manipulation is locked by TypingLayoutStage during capture.
      if (innerWidth !== viewportWidth || innerHeight !== viewportHeight) {
        throw new Error("브라우저 창 크기가 변경되었습니다. 새 크기에서 다시 녹화해 주세요.");
      }
      // Browser tab frames are CSS viewport pixels scaled to capture resolution,
      // not screen coordinates. Recompute after scrolling, resizing and browser zoom.
      if ((window.visualViewport?.scale ?? 1) !== 1) throw new Error("화면 확대를 해제한 후 다시 녹화해 주세요.");
      const sx = video.videoWidth / innerWidth;
      const sy = video.videoHeight / innerHeight;
      if (!sx || !sy || Math.abs(sx / sy - 1) > 0.04) throw new Error("탭 크기가 변경되었습니다. 새 크기에서 다시 녹화해 주세요.");
      if (rect.left < 0 || rect.top < 0 || rect.right > innerWidth + 1 || rect.bottom > innerHeight + 1) {
        throw new Error("타이핑 영역이 화면 밖으로 이동해 녹화를 종료했습니다.");
      }
      context.fillStyle = "#000";
      context.fillRect(0, 0, canvas.width, canvas.height);
      const sourceWidth = rect.width;
      const sourceHeight = rect.height;
      const fit = Math.min(canvas.width / sourceWidth, canvas.height / sourceHeight);
      const width = sourceWidth * fit; const height = sourceHeight * fit;
      context.drawImage(video, rect.left * sx, rect.top * sy,
        rect.width * sx, rect.height * sy,
        (canvas.width - width) / 2, (canvas.height - height) / 2, width, height);
      (output?.getVideoTracks()[0] as CanvasCaptureMediaStreamTrack | undefined)?.requestFrame?.();
    };
    draw();
    output = canvas.captureStream(FPS);
    enhancedMic?.stream.getAudioTracks().forEach((audio) => output!.addTrack(audio));
    recorder = recorderFor(output);
    const chunks: Blob[] = [];
    let bytes = 0;
    recorder.ondataavailable = ({ data }) => {
      if (!data.size || signal.aborted || failed) return;
      if (bytes + data.size > MAX_BYTES) {
        failed = true; stop();
        options.onError(new Error("파일이 100 MB를 초과했습니다. 더 짧게 녹화해 주세요."));
        return;
      }
      chunks.push(data); bytes += data.size;
      // Reserve room for the encoder's final data; never discard encoded chunks.
      if (bytes >= MAX_BYTES - 2 * 1024 * 1024) stop("100 MB 제한에 근접해 녹화를 종료했습니다.");
    };
    recorder.onerror = () => { failed = true; stop(); if (!signal.aborted) options.onError(new Error("영상 인코딩에 실패했습니다.")); };
    recorder.onstop = () => {
      cleanup();
      if (failed || signal.aborted) return;
      if (chunks.length) options.onComplete({
        blob: new Blob(chunks, { type: recorder!.mimeType }),
        duration: Math.min(MAX_SECONDS, ((ended || performance.now()) - started) / 1000), notice,
      });
      else if (!signal.aborted) options.onError(new Error(notice || "영상 프레임이 저장되지 않았습니다. 탭을 화면에 표시한 상태에서 다시 녹화해 주세요."));
    };
    recorder.start(250);
    started = performance.now();
    draw();
    frame = setInterval(() => { try { draw(); } catch (error) { stop(error instanceof Error ? error.message : "캡처 오류"); } }, 1000 / FPS);
    deadline = setTimeout(() => stop("5분 제한에 도달했습니다."), MAX_SECONDS * 1000);
    document.addEventListener("visibilitychange", visibility);
    return { stop: () => stop(undefined, true) };
  } catch (error) {
    cleanup();
    if (ended && !signal.aborted) throw new Error(notice || "공유가 시작되기 전에 종료되었습니다.");
    throw error;
  }
}
