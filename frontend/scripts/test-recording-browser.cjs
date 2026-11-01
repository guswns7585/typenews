/* Uses synthetic screen/microphone sources; never captures the user's desktop. */
/* eslint-disable @typescript-eslint/no-require-imports -- Standalone Node harness uses NODE_PATH for optional Playwright tooling. */
const assert = require("node:assert/strict");
const fs = require("node:fs/promises");
const path = require("node:path");
const { chromium } = require("playwright");
const { buildSync } = require("esbuild");

async function main() {
  for (const [entry, name] of [["capture", "RecordingCapture"], ["trim", "RecordingTrim"]]) {
    buildSync({ entryPoints: [`features/recording/${entry}.ts`], bundle: true, format: "iife", globalName: name, outfile: `test-results/${entry}-test.js` });
  }
  const browser = await chromium.launch({ channel: "chrome", headless: true, args: ["--autoplay-policy=no-user-gesture-required"] });
  try {
    const page = await browser.newPage({ viewport: { width: 1000, height: 800 } });
    await page.route("http://localhost:3000/__recording-test", (route) => route.fulfill({
      contentType: "text/html", body: '<div id="target" style="position:absolute;left:100px;top:100px;width:400px;height:200px"></div>',
    }));
    await page.goto("http://localhost:3000/__recording-test");
    await page.addScriptTag({ path: path.resolve("test-results/capture-test.js") });
    await page.addScriptTag({ path: path.resolve("test-results/trim-test.js") });
    const result = await page.evaluate(async () => {
      let handle = "";
      let source;
      let audio;
      let wrong = false;
      let chooserCalls = 0;
      Object.defineProperty(navigator.mediaDevices, "setCaptureHandleConfig", { configurable: true, value: (config) => { handle = config.handle || ""; } });
      Object.defineProperty(navigator.mediaDevices, "getDisplayMedia", { configurable: true, value: async () => {
        chooserCalls++;
        const canvas = document.createElement("canvas"); canvas.width = 1000; canvas.height = 800;
        const context = canvas.getContext("2d");
        const draw = () => { context.fillStyle = "#b71010"; context.fillRect(0, 0, 1000, 800); context.fillStyle = "#11b725"; context.fillRect(100, 100, 400, 200); };
        draw();
        source = canvas.captureStream(30);
        const timer = setInterval(draw, 25);
        const track = source.getVideoTracks()[0];
        track.getSettings = () => ({ displaySurface: "browser" });
        track.getCaptureHandle = () => ({ handle: wrong ? "another-tab" : handle });
        const nativeStop = track.stop.bind(track);
        track.stop = () => { clearInterval(timer); nativeStop(); };
        return source;
      } });
      Object.defineProperty(navigator.mediaDevices, "getUserMedia", { configurable: true, value: async () => {
        audio = new AudioContext(); await audio.resume();
        const oscillator = audio.createOscillator(); const destination = audio.createMediaStreamDestination();
        oscillator.connect(destination); oscillator.start(); window.testMic = destination.stream;
        return destination.stream;
      } });
      // Regression: native cropping and compositor callbacks must not be needed
      // to start recording an idle tab, even when the APIs are available.
      let nativeCropCalls = 0;
      Object.defineProperty(window, "CropTarget", { configurable: true, value: { fromElement: () => { nativeCropCalls++; return new Promise(() => {}); } } });
      const nativeFrameCallback = HTMLVideoElement.prototype.requestVideoFrameCallback;
      HTMLVideoElement.prototype.requestVideoFrameCallback = function (callback) {
        if (this.srcObject) throw new Error("Static capture compositor is not presenting frames");
        return nativeFrameCallback.call(this, callback);
      };
      wrong = true;
      let rejected = false;
      try { await RecordingCapture.startCapture({ target: () => document.querySelector("#target"), microphone: false,
        signal: new AbortController().signal, onComplete() {}, onError() {} }); } catch { rejected = true; }
      const wrongStopped = source.getTracks().every((track) => track.readyState === "ended");
      wrong = false;
      const sharing = new RecordingCapture.CaptureSharing();
      let resolveResult; let rejectResult;
      const recorded = new Promise((resolve, reject) => { resolveResult = resolve; rejectResult = reject; });
      // Setup dismissal / sharing bars can animate the target before it settles.
      document.querySelector("#target").animate([
        { transform: "translateX(40px)" }, { transform: "translateX(0)" },
      ], { duration: 450 });
      const session = await RecordingCapture.startCapture({ target: () => document.querySelector("#target"), microphone: true, sharing,
        signal: new AbortController().signal, onComplete: resolveResult, onError: rejectResult });
      await new Promise((resolve) => setTimeout(resolve, 1600));
      session.stop();
      const recording = await recorded;
      const retained = sharing.active && source.getTracks().every((track) => track.readyState === "live");
      const micReleased = window.testMic.getTracks().every((track) => track.readyState === "ended");
      const callsBeforeRepeat = chooserCalls;
      const sharedSource = source;
      let resolveRepeat; let rejectRepeat;
      const repeated = new Promise((resolve, reject) => { resolveRepeat = resolve; rejectRepeat = reject; });
      const repeat = await RecordingCapture.startCapture({ target: () => document.querySelector("#target"), microphone: false, sharing,
        signal: new AbortController().signal, onComplete: resolveRepeat, onError: rejectRepeat });
      await new Promise((resolve) => setTimeout(resolve, 500));
      repeat.stop();
      const secondRecording = await repeated;
      const repeatedVideo = document.createElement("video"); repeatedVideo.muted = true;
      const repeatedUrl = URL.createObjectURL(secondRecording.blob); repeatedVideo.src = repeatedUrl;
      await repeatedVideo.play(); await new Promise((resolve) => repeatedVideo.requestVideoFrameCallback(resolve));
      const repeatSize = [repeatedVideo.videoWidth, repeatedVideo.videoHeight];
      repeatedVideo.pause(); URL.revokeObjectURL(repeatedUrl);
      const reused = source === sharedSource && chooserCalls === callsBeforeRepeat && sharing.active;
      sharing.close();
      const clean = !sharing.active && source.getTracks().every((track) => track.readyState === "ended") && micReleased;
      await sharing.connect(new AbortController().signal);
      const reconnected = chooserCalls === callsBeforeRepeat + 1 && sharing.active;
      source.getVideoTracks()[0].dispatchEvent(new Event("ended"));
      const externalEndReleased = !sharing.active && source.getTracks().every((track) => track.readyState === "ended");
      const video = document.createElement("video"); video.muted = true;
      const url = URL.createObjectURL(recording.blob); video.src = url;
      await video.play(); await new Promise((resolve) => video.requestVideoFrameCallback(resolve));
      const canvas = document.createElement("canvas"); canvas.width = 1; canvas.height = 1;
      canvas.getContext("2d").drawImage(video, 0, 0, 1, 1);
      const pixel = [...canvas.getContext("2d").getImageData(0, 0, 1, 1).data];
      const size = [video.videoWidth, video.videoHeight]; video.pause(); URL.revokeObjectURL(url);
      const trimmed = await RecordingTrim.trimRecording(recording.blob, 0.2, 0.9, new AbortController().signal, () => {});
      const trimmedVideo = document.createElement("video"); trimmedVideo.muted = true;
      const trimmedUrl = URL.createObjectURL(trimmed); trimmedVideo.src = trimmedUrl;
      const played = new Promise((resolve, reject) => { trimmedVideo.onended = resolve; trimmedVideo.onerror = reject; });
      await trimmedVideo.play(); await played;
      const trimmedDuration = trimmedVideo.currentTime;
      URL.revokeObjectURL(trimmedUrl);
      const decoded = await audio.decodeAudioData(await trimmed.arrayBuffer());
      const samples = decoded.getChannelData(0);
      const audioRms = Math.sqrt(samples.reduce((sum, value) => sum + value * value, 0) / samples.length);
      await audio.close();
      return { rejected, wrongStopped, clean, retained, micReleased, reused, reconnected, externalEndReleased, repeatBytes: secondRecording.blob.size, repeatSize, pixel, size, bytes: recording.blob.size, duration: recording.duration, trimmedBytes: trimmed.size, trimmedDuration, audioRms, nativeCropCalls };
    });
    assert.equal(result.rejected, true, "wrong tab rejected");
    assert.equal(result.wrongStopped, true, "wrong tab stream released");
    assert.equal(result.clean, true, "screen and mic released");
    assert.equal(result.retained, true, "screen sharing stays live after recording ends");
    assert.equal(result.micReleased, true, "idle sharing does not keep the microphone live");
    assert.equal(result.reused, true, "second recording reuses the same connection without another chooser");
    assert.ok(result.repeatBytes > 100, "second recording contains encoded media");
    assert.deepEqual(result.repeatSize, [400, 200], "second recording decodes at the correct crop dimensions");
    assert.equal(result.reconnected, true, "disconnect requires a new permission request");
    assert.equal(result.externalEndReleased, true, "browser sharing stop clears the retained connection");
    assert.equal(result.nativeCropCalls, 0, "static capture never waits for native crop frames");
    assert.ok(result.bytes > 1000 && result.trimmedBytes > 1000, "record and trim contain encoded media");
    assert.ok(result.duration >= 1.4 && result.duration < 3, "duration measured");
    assert.ok(result.trimmedDuration >= 0.55 && result.trimmedDuration < 1, "selected 0.7 second range actually exported");
    assert.ok(result.audioRms > 0.05, "microphone waveform preserved in trimmed export");
    assert.deepEqual(result.size, [400, 200], "only target region exported");
    assert.ok(result.pixel[1] > 100 && result.pixel[0] < 70, "target green pixels, no red surrounding desktop");
    await fs.writeFile("test-results/recording-test.json", JSON.stringify(result, null, 2));
    console.log("recording browser tests passed", result);
  } finally { await browser.close(); }
}
main().catch((error) => { console.error(error); process.exitCode = 1; });
