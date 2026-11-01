import assert from "node:assert/strict";
import { afterEach, test } from "node:test";
import { startCapture } from "./capture";
import { recorderFor } from "./media";
import { trimRecording } from "./trim";

const originals = new Map<string, PropertyDescriptor | undefined>();
function globalValue(name: string, value: unknown) {
  if (!originals.has(name)) originals.set(name, Object.getOwnPropertyDescriptor(globalThis, name));
  Object.defineProperty(globalThis, name, { configurable: true, writable: true, value });
}
afterEach(() => {
  for (const [name, descriptor] of originals) {
    if (descriptor) Object.defineProperty(globalThis, name, descriptor);
    else Reflect.deleteProperty(globalThis, name);
  }
  originals.clear();
});

function setup(surface = "browser", matching = false) {
  let handle: string | undefined;
  let stopped = 0;
  const track = Object.assign(new EventTarget(), {
    readyState: "live",
    getSettings: () => ({ displaySurface: surface }),
    getCaptureHandle: () => ({ handle: matching ? handle : "another-tab" }),
    stop: () => { stopped++; },
  });
  const stream = { getTracks: () => [track], getVideoTracks: () => [track] } as unknown as MediaStream;
  const devices = {
    setCaptureHandleConfig: (config: { handle?: string }) => { handle = config.handle; },
    getDisplayMedia: async () => stream,
    getUserMedia: async (): Promise<MediaStream> => { throw new DOMException("Denied", "NotAllowedError"); },
  };
  globalValue("window", { isSecureContext: true });
  globalValue("location", { origin: "https://typenews.test" });
  globalValue("navigator", { mediaDevices: devices });
  const video = Object.assign(new EventTarget(), { pause() {}, async play() {}, srcObject: null });
  globalValue("document", { createElement: () => video, removeEventListener() {} });
  globalValue("HTMLCanvasElement", { prototype: { captureStream() {} } });
  globalValue("MediaRecorder", class {});
  return { stream, track, video, devices, stopped: () => stopped, handle: () => handle };
}
function options(signal = new AbortController().signal) {
  return { target: () => null, microphone: false, signal,
    onComplete: () => assert.fail("Must not complete"), onError: () => assert.fail("Must not callback on setup failure") };
}

test("rejects monitor and window even with a matching capture handle, stopping all tracks", async () => {
  for (const surface of ["monitor", "window", undefined]) {
    const mock = setup(surface ?? "unknown", true);
    await assert.rejects(startCapture(options()), /TypeNews/);
    assert.equal(mock.stopped(), 1);
    assert.equal(mock.handle(), undefined);
  }
});

test("rejects another browser tab and stops its stream", async () => {
  const mock = setup();
  await assert.rejects(startCapture(options()), /TypeNews/);
  assert.equal(mock.stopped(), 1);
});

test("cancellation during chooser stops the late-arriving stream", async () => {
  const mock = setup("browser", true);
  let resolve!: (value: MediaStream) => void;
  mock.devices.getDisplayMedia = () => new Promise((done) => { resolve = done; });
  const controller = new AbortController();
  const result = startCapture(options(controller.signal));
  controller.abort();
  resolve(mock.stream);
  await assert.rejects(result, { name: "AbortError" });
  assert.ok(mock.stopped() >= 1);
  assert.equal(mock.handle(), undefined);
});

test("mic denial closes the verified display stream", async () => {
  const mock = setup("browser", true);
  await assert.rejects(startCapture({ ...options(), microphone: true }), { name: "NotAllowedError" });
  assert.equal(mock.stopped(), 1);
});

test("capture navigation while waiting for video immediately rejects and closes streams", async () => {
  const mock = setup("browser", true);
  const result = startCapture(options());
  await Promise.resolve();
  mock.track.dispatchEvent(new Event("capturehandlechange"));
  await assert.rejects(result, /공유 탭이 변경/);
  assert.ok(mock.stopped() >= 1);
});

test("mic removal while waiting for video immediately rejects and closes both streams", async () => {
  const mock = setup("browser", true);
  let stopped = false;
  const micTrack = Object.assign(new EventTarget(), { readyState: "live", stop: () => { stopped = true; } });
  mock.devices.getUserMedia = async () => ({ getTracks: () => [micTrack], getAudioTracks: () => [micTrack] }) as unknown as MediaStream;
  const result = startCapture({ ...options(), microphone: true });
  await Promise.resolve(); await Promise.resolve();
  micTrack.dispatchEvent(new Event("ended"));
  await assert.rejects(result, /마이크 연결이 종료/);
  assert.equal(stopped, true);
  assert.ok(mock.stopped() >= 1);
});

test("MIME negotiation chooses a supported codec, then browser default", () => {
  let supported = "video/webm;codecs=vp8,opus";
  globalValue("MediaRecorder", class {
    static isTypeSupported(type: string) { return type === supported; }
    constructor(public stream: MediaStream, public options: MediaRecorderOptions) {}
  });
  const stream = {} as MediaStream;
  assert.equal((recorderFor(stream) as unknown as { options: MediaRecorderOptions }).options.mimeType, supported);
  supported = "";
  assert.equal((recorderFor(stream) as unknown as { options: MediaRecorderOptions }).options.mimeType, undefined);
});

test("a cancelled chooser's late cleanup preserves the next chooser handle", async () => {
  const mock = setup();
  const pending: ((stream: MediaStream) => void)[] = [];
  mock.devices.getDisplayMedia = () => new Promise((resolve) => { pending.push(resolve); });
  const controller = new AbortController();
  const first = startCapture(options(controller.signal));
  controller.abort();
  const second = startCapture(options());
  const currentHandle = mock.handle();
  pending[0](mock.stream);
  await assert.rejects(first, { name: "AbortError" });
  assert.equal(mock.handle(), currentHandle);
  pending[1](mock.stream);
  await assert.rejects(second, /TypeNews/);
  assert.equal(mock.handle(), undefined);
});

test("invalid trim intervals are rejected before allocating browser resources", async () => {
  for (const [start, end] of [[-1, 1], [2, 1], [0, NaN], [0, 0.01], [0, 302]]) {
    await assert.rejects(trimRecording(new Blob(), start, end, new AbortController().signal, () => {}), /0.1/);
  }
});
