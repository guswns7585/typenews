/* eslint-disable @typescript-eslint/no-require-imports -- Optional Playwright tooling via NODE_PATH. */
const assert = require("node:assert/strict");
const { chromium } = require("playwright");

(async () => {
  const browser = await chromium.launch({ channel: "chrome", headless: true });
  try {
    const page = await browser.newPage({ viewport: { width: 1440, height: 1000 } });
    const errors = [];
    const scores = [];
    page.on("pageerror", (error) => errors.push(error.message));
    page.on("request", (request) => { if (request.url().includes("record_typing_result")) scores.push(request.url()); });
    await page.goto("http://localhost:3000/", { waitUntil: "networkidle" });
    await page.evaluate(() => { for (const key of Object.keys(localStorage)) if (key.startsWith("typenews.longform.")) localStorage.removeItem(key); });
    await page.reload({ waitUntil: "networkidle" });
    await page.locator("#korModeBtn").click();
    const menuTypography = await page.locator(".kor-mode-dropdown-content").evaluate((panel) => {
      const regular = getComputedStyle(panel.querySelector("div[data-mode]"));
      const longform = getComputedStyle(panel.querySelector("button"));
      return { regularSize: regular.fontSize, longformSize: longform.fontSize };
    });
    assert.deepEqual(menuTypography, { regularSize: "13px", longformSize: "13px" }, "long-form menu item uses the same text size as other modes");
    await page.getByRole("button", { name: /^긴 글/ }).click();
    const dialog = page.getByRole("dialog");
    await dialog.waitFor();
    await page.screenshot({ path: "test-results/longform-picker-desktop.png" });
    const pickerBox = await dialog.boundingBox();
    assert.ok(pickerBox.x > 100, "picker centered on desktop");
    await dialog.getByRole("button", { name: /책상 위의 작은 작업실/ }).click();
    assert.equal(await page.getByTitle("문장부호 무시").isEnabled(), true, "Korean long-form enables punctuation ignore");
    assert.equal(await page.getByTitle("숫자 무시").isEnabled(), true, "Korean long-form enables number ignore");
    assert.equal(await page.getByTitle("영어 무시").isEnabled(), true, "Korean long-form enables English ignore");
    assert.equal(await page.getByTitle("특수문자 무시").isEnabled(), true, "Korean long-form enables symbol ignore");
    await page.getByTitle("문장부호 무시").click();
    assert.equal(await page.getByTitle("문장부호 무시").getAttribute("data-selected"), "true", "long-form ignore control can be selected");
    const current = page.locator(".line-slot.is-current");
    await current.waitFor();
    const first = await current.innerText();
    const firstDialHeight = (await page.locator(".line-dial").boundingBox()).height;
    await page.evaluate(() => {
      const sentence = document.querySelector("#sentence");
      window.__longformSentenceHeights = [sentence.getBoundingClientRect().height];
      window.__longformSentenceObserver = new ResizeObserver(() => {
        window.__longformSentenceHeights.push(sentence.getBoundingClientRect().height);
      });
      window.__longformSentenceObserver.observe(sentence);
    });
    await page.locator("#input").fill(first.replace(/[.,!?\"'“”‘’~]/g, ""));
    await page.locator("#input").press("Enter");
    await page.waitForFunction((text) => document.querySelector(".line-slot.is-current")?.textContent !== text, first);
    await page.waitForTimeout(400);
    const secondDialHeight = (await page.locator(".line-dial").boundingBox()).height;
    assert.ok(Math.abs(firstDialHeight - secondDialHeight) < 1, "long-form sentence changes keep a stable dial height");
    const sentenceHeights = await page.evaluate(() => {
      window.__longformSentenceObserver.disconnect();
      return window.__longformSentenceHeights;
    });
    assert.ok(Math.max(...sentenceHeights) - Math.min(...sentenceHeights) < 1, "outer sentence area stays stable throughout a long-form line change");
    const second = await current.innerText();
    await page.reload({ waitUntil: "networkidle" });
    await current.waitFor();
    assert.equal(await current.innerText(), second, "reload restores completed-line position");
    await page.screenshot({ path: "test-results/longform-desktop.png" });
    const completedEssayTitle = await page.locator('[role="status"] strong').innerText();
    for (let guard = 0; guard < 80 && await page.locator('[role="status"] strong').innerText() === completedEssayTitle; guard += 1) {
      const line = await current.innerText();
      await page.locator("#input").fill(line);
      await page.locator("#input").press("Enter");
      await page.waitForFunction(({ line, title }) => (
        document.querySelector(".line-slot.is-current")?.textContent !== line
        || document.querySelector('[role="status"] strong')?.textContent !== title
      ), { line, title: completedEssayTitle });
    }
    const randomNextTitle = await page.locator('[role="status"] strong').innerText();
    assert.notEqual(randomNextTitle, completedEssayTitle, "finishing an essay automatically opens a different random essay");
    await page.locator("#engModeBtn").click();
    await page.getByRole("button", { name: /^Long-form/ }).click();
    assert.equal(await dialog.locator("button:has(strong)").count(), 5, "five built-in English essays");
    assert.equal(await dialog.getByText("Add your own text").count(), 0, "custom text form removed");
    await dialog.getByRole("button", { name: /^A Small Workshop on the Desk/ }).click();
    assert.equal(await page.getByTitle("문장부호 무시").isEnabled(), true, "English long-form enables punctuation ignore");
    assert.equal(await page.getByTitle("영어 모드에서는 사용할 수 없습니다").isDisabled(), true, "English long-form cannot ignore all English letters");
    const englishFirst = await current.innerText();
    await page.locator("#input").fill(englishFirst);
    await page.locator("#input").press("Enter");
    await page.waitForFunction((text) => document.querySelector(".line-slot.is-current")?.textContent !== text, englishFirst);
    const englishSecond = await current.innerText();
    await page.reload({ waitUntil: "networkidle" });
    await current.waitFor();
    assert.equal(await current.innerText(), englishSecond, "built-in essay progress persists");
    await page.getByRole("button", { name: "처음부터", exact: true }).click();
    await page.waitForFunction((text) => document.querySelector(".line-slot.is-current")?.textContent === text, englishFirst);
    assert.equal(await page.locator("#input").isDisabled(), false, "restart allows typing");
    assert.equal(scores.length, 0, "long-form never submits score RPCs");
    await page.getByRole("button", { name: /^(타이핑|타자) 녹화$/ }).click();
    await page.getByRole("dialog").waitFor();
    assert.equal(await page.getByRole("checkbox").isChecked(), true, "microphone on by default");
    await page.screenshot({ path: "test-results/recording-setup-desktop.png" });
    await page.getByRole("button", { name: "녹화 설정 닫기" }).click();
    await page.setViewportSize({ width: 390, height: 844 });
    await page.locator("#engModeBtn").click();
    await page.getByRole("button", { name: /^Long-form/ }).click();
    await dialog.waitFor();
    const mobile = await dialog.boundingBox();
    assert.ok(mobile.x >= 0 && mobile.x + mobile.width <= 391, "mobile dialog fits viewport");
    await page.screenshot({ path: "test-results/longform-picker-mobile.png" });
    await dialog.getByRole("button", { name: /^The Quiet Repair Shop/ }).click();
    await current.waitFor();
    await page.screenshot({ path: "test-results/longform-mobile.png" });
    const bounds = await page.evaluate(() => {
      const line = document.querySelector(".line-slot.is-current").getBoundingClientRect();
      const dial = document.querySelector(".line-dial").getBoundingClientRect();
      const stats = document.querySelector(".stats").getBoundingClientRect();
      return { currentTop: line.top, currentBottom: line.bottom, dialTop: dial.top, dialBottom: dial.bottom, statsTop: stats.top };
    });
    assert.ok(bounds.currentTop >= bounds.dialTop - 1 && bounds.currentBottom <= bounds.dialBottom + 1, "mobile long-form sentence fully visible without an internal scroll");
    assert.ok(bounds.statsTop >= bounds.dialBottom, "stats below long sentence");
    await page.screenshot({ path: "test-results/longform-mobile-stress.png", fullPage: true });
    assert.deepEqual(errors, [], "no browser runtime errors");
    console.log("Longform browser tests passed: fourteen built-ins, random next essay, no custom form, line advance, stable reserve, reload/resume, restart, score exclusion, recording setup, desktop/mobile.");
  } finally { await browser.close(); }
})().catch((error) => { console.error(error); process.exitCode = 1; });
