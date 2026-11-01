/* eslint-disable @typescript-eslint/no-require-imports -- Optional standalone Playwright tooling via NODE_PATH. */
/* Native headless tab capture of a generated fixture, with synthetic microphone. */
const assert = require("node:assert/strict");
const path = require("node:path");
const fs = require("node:fs/promises");
const { chromium } = require("playwright");
const { buildSync } = require("esbuild");

(async () => {
  buildSync({ entryPoints: ["features/recording/capture.ts"], bundle: true, format: "iife", globalName: "RecordingCapture", outfile: "test-results/capture-test.js" });
  const browser = await chromium.launch({ channel: "chrome", headless: true, args: [
    "--autoplay-policy=no-user-gesture-required", "--use-fake-ui-for-media-stream", "--use-fake-device-for-media-stream",
    "--auto-select-tab-capture-source-by-title=TypeNews Recording Fixture", "--allow-http-screen-capture",
  ] });
  try {
    const page = await browser.newPage({ viewport: { width: 1000, height: 800 }, deviceScaleFactor: 1.25 });
    await page.route("http://localhost:3000/__native-recording-test", (route) => route.fulfill({ contentType: "text/html", body:
      '<title>TypeNews Recording Fixture</title><body style="background:#b71010"><div id="target" style="position:absolute;left:100.4px;top:100.4px;width:400.4px;height:200.4px;background:#11b725"></div><button id="start">Start fixture recording</button></body>',
    }));
    await page.goto("http://localhost:3000/__native-recording-test");
    await page.addScriptTag({ path: path.resolve("test-results/capture-test.js") });
    await page.evaluate(() => {
      document.querySelector("#start").onclick = async () => {
        try {
          const session = await RecordingCapture.startCapture({ target: () => document.querySelector("#target"), microphone: true,
            signal: new AbortController().signal,
            onError: (error) => { window.fixtureError = error.message; },
            onComplete: async (recording) => {
              const video = document.createElement("video"); video.muted = true;
              const url = URL.createObjectURL(recording.blob); video.src = url;
              await video.play(); await new Promise((resolve) => video.requestVideoFrameCallback(resolve));
              const canvas = document.createElement("canvas"); canvas.width = 1; canvas.height = 1;
              const context = canvas.getContext("2d"); context.drawImage(video, 0, 0, 1, 1);
              window.fixtureResult = { bytes: recording.blob.size, width: video.videoWidth, height: video.videoHeight,
                pixel: [...context.getImageData(0, 0, 1, 1).data] };
              video.pause(); URL.revokeObjectURL(url);
            },
          });
          setTimeout(() => session.stop(), 1500);
        } catch (error) { window.fixtureError = error.message; }
      };
    });
    await page.click("#start");
    await page.waitForFunction(() => window.fixtureResult || window.fixtureError, { timeout: 20000 });
    const result = await page.evaluate(() => ({ result: window.fixtureResult, error: window.fixtureError }));
    assert.equal(result.error, undefined);
    assert.equal(result.result.width, 500);
    assert.equal(result.result.height, 250);
    assert.ok(result.result.pixel[1] > 100 && result.result.pixel[0] < 70);
    console.log("native static-tab recording with fractional dimensions and 125% pixel scale passed", result.result);
    await page.close();
    const app = await browser.newPage({ viewport: { width: 1440, height: 1000 }, acceptDownloads: true });
    await app.goto("http://localhost:3000/", { waitUntil: "networkidle" });
    await app.evaluate(() => { document.title = "TypeNews Recording Fixture"; });
    await app.getByRole("button", { name: /^(타이핑|타자) 녹화$/ }).click();
    await app.getByRole("button", { name: "탭 선택 및 녹화" }).click();
    const stop = app.getByRole("button", { name: "녹화 중지", exact: true });
    await stop.waitFor({ timeout: 20000 });
    assert.equal(await app.evaluate(() => document.activeElement?.id), "input", "recording returns focus to typing input so Space cannot click Stop");
    const moveZone = await app.locator(".typing-frame-move-zone").boundingBox();
    await app.mouse.move(moveZone.x + moveZone.width / 2, moveZone.y + moveZone.height / 2);
    await app.waitForTimeout(700);
    assert.equal(await stop.isVisible(), true, "moving the pointer over the typing-card handle does not stop recording");
    await app.locator("#typing-tab").evaluate((element) => { element.style.minHeight = `${element.getBoundingClientRect().height + 50}px`; });
    await app.waitForTimeout(500);
    assert.equal(await stop.isVisible(), true, "content-driven typing-card height changes do not stop recording");
    await app.waitForTimeout(900);
    await stop.click();
    const preview = app.getByRole("dialog");
    await preview.waitFor();
    await app.waitForFunction(() => (document.querySelector("dialog video")?.readyState ?? 0) >= 2);
    const closePreview = preview.getByRole("button", { name: "미리보기 닫기", exact: true });
    await closePreview.focus();
    await closePreview.press("Space");
    await preview.waitFor();
    await app.waitForFunction(() => document.querySelector("dialog video")?.paused === false);
    assert.equal(await preview.locator("video").evaluate((el) => el.paused), false, "Space plays preview instead of closing editor");
    await preview.press("Space");
    await app.waitForFunction(() => document.querySelector("dialog video")?.paused === true);
    assert.equal(await preview.locator("video").evaluate((el) => el.paused), true, "Space pauses preview");
    const startSlider = preview.getByRole("slider", { name: "구간 시작", exact: true });
    const endSlider = preview.getByRole("slider", { name: "구간 끝", exact: true });
    const seekSlider = preview.getByRole("slider", { name: "재생 위치", exact: true });
    await app.waitForFunction(() => document.querySelector('dialog [role="slider"]')?.disabled === false);
    await startSlider.press("ArrowRight");
    assert.ok(Math.abs(Number(await preview.getByLabel("시작 (초)").inputValue()) - 0.1) < 0.01);
    await preview.getByRole("button", { name: "전체 구간 복원", exact: true }).click();
    const rail = await seekSlider.boundingBox();
    const startBox = await startSlider.boundingBox();
    await app.mouse.move(startBox.x + startBox.width / 2, startBox.y + startBox.height / 2);
    await app.mouse.down();
    await app.mouse.move(rail.x + rail.width * 0.2, startBox.y + startBox.height / 2, { steps: 8 });
    await app.mouse.up();
    assert.ok(Number(await preview.getByLabel("시작 (초)").inputValue()) > 0.15, "drag changes selection start");
    const endBox = await endSlider.boundingBox();
    const endBeforeDrag = Number(await preview.getByLabel("끝 (초)").inputValue());
    await app.mouse.move(endBox.x + endBox.width / 2, endBox.y + endBox.height / 2);
    await app.mouse.down();
    await app.mouse.move(rail.x + rail.width * 0.8, endBox.y + endBox.height / 2, { steps: 8 });
    await app.mouse.up();
    assert.ok(Number(await preview.getByLabel("끝 (초)").inputValue()) < endBeforeDrag - 0.05, "drag changes selection end");
    await preview.getByRole("button", { name: "전체 구간 복원", exact: true }).click();
    await seekSlider.press("End");
    await preview.getByRole("button", { name: "현재 위치를 시작으로", exact: true }).click();
    assert.ok(Number(await preview.getByLabel("끝 (초)").inputValue()) - Number(await preview.getByLabel("시작 (초)").inputValue()) >= 0.099, "boundaries cannot cross");
    await preview.getByRole("button", { name: "전체 구간 복원", exact: true }).click();
    await preview.getByLabel("시작 (초)").fill("0.2");
    await preview.getByLabel("끝 (초)").fill("0.6");
    await preview.getByRole("button", { name: "선택 구간 반복", exact: true }).click();
    await preview.getByRole("button", { name: "선택 구간 재생", exact: true }).click();
    await app.waitForTimeout(950);
    assert.equal(await preview.locator("video").evaluate((el) => el.paused), false, "range loops rather than stops");
    const loopTime = await preview.locator("video").evaluate((el) => el.currentTime);
    assert.ok(loopTime >= 0.18 && loopTime <= 0.65, "loop stays inside selection");
    await preview.getByRole("button", { name: "일시 정지", exact: true }).click();
    await preview.getByRole("button", { name: "선택 구간 반복", exact: true }).click();
    await preview.getByRole("button", { name: "미리보기 음소거", exact: true }).click();
    assert.equal(await preview.locator("video").evaluate((el) => el.muted), true);
    await preview.getByLabel("미리보기 속도", { exact: true }).selectOption("1.5");
    assert.equal(await preview.locator("video").evaluate((el) => el.playbackRate), 1.5);
    await preview.getByRole("button", { name: "전체 구간 복원", exact: true }).click();
    await preview.getByLabel("시작 (초)").fill("0.2");
    await preview.getByLabel("끝 (초)").fill("0.6");
    await preview.getByRole("button", { name: /^내보내고 타이핑으로/ }).click();
    await preview.waitFor({ state: "hidden" });
    assert.equal(await app.evaluate(() => document.activeElement?.id), "input", "background export returns focus to typing");
    await app.getByRole("button", { name: "취소", exact: true }).click();
    await preview.waitFor();
    assert.ok(Math.abs(Number(await preview.getByLabel("시작 (초)").inputValue()) - 0.2) < 0.01, "cancel restores selection start");
    assert.ok(Math.abs(Number(await preview.getByLabel("끝 (초)").inputValue()) - 0.6) < 0.01, "cancel restores selection end");
    const originalDownload = app.waitForEvent("download");
    await preview.getByRole("button", { name: "원본 다운로드" }).click();
    const original = await originalDownload;
    await original.saveAs("test-results/typing-recording-original.webm");
    assert.ok((await fs.stat("test-results/typing-recording-original.webm")).size > 1000);
    await preview.getByLabel("시작 (초)").fill("0.1");
    await preview.getByLabel("끝 (초)").fill("0.8");
    await app.screenshot({ path: "test-results/recording-preview-desktop.png" });
    const trimDownload = app.waitForEvent("download");
    await preview.getByRole("button", { name: /^내보내고 타이핑으로/ }).click();
    await preview.waitFor({ state: "hidden" });
    await app.getByRole("status").filter({ hasText: "영상 저장" }).waitFor();
    const trimmed = await trimDownload;
    await trimmed.saveAs("test-results/typing-recording-trimmed.webm");
    assert.ok((await fs.stat("test-results/typing-recording-trimmed.webm")).size > 1000);
    await app.getByRole("button", { name: "바로 다시 녹화", exact: true }).click();
    await stop.waitFor({ timeout: 10000 });
    await app.waitForTimeout(700);
    await stop.click();
    await preview.waitFor();
    await preview.getByRole("button", { name: "미리보기 닫기", exact: true }).click();
    await app.getByRole("button", { name: "공유 연결 중 · 끊기", exact: true }).click();
    await app.getByRole("button", { name: "타이핑 녹화", exact: true }).waitFor();
    await app.getByRole("button", { name: "타이핑 녹화", exact: true }).click();
    await app.getByRole("button", { name: "탭 선택 및 녹화", exact: true }).waitFor();
    await app.getByRole("button", { name: "녹화 설정 닫기", exact: true }).click();
    // Reopen the second clip to verify the preview at narrow viewport sizes.
    await app.getByRole("button", { name: "타이핑 녹화", exact: true }).click();
    await app.getByRole("button", { name: "탭 선택 및 녹화", exact: true }).click();
    await stop.waitFor({ timeout: 20000 });
    await app.waitForTimeout(700);
    await stop.click();
    await preview.waitFor();
    await app.setViewportSize({ width: 390, height: 844 });
    const mobileBox = await preview.boundingBox();
    assert.ok(mobileBox.x >= 0 && mobileBox.x + mobileBox.width <= 391, "editor fits mobile viewport");
    assert.equal(await preview.evaluate((el) => el.scrollWidth > el.clientWidth + 1), false, "editor has no horizontal overflow");
    await app.screenshot({ path: "test-results/recording-preview-mobile.png" });
    await app.close();
    console.log("Native app recording: start/stop, one-click repeat, sharing disconnect/reconnect, microphone, preview and downloads passed.");
  } finally { await browser.close(); }
})().catch((error) => { console.error(error); process.exitCode = 1; });
