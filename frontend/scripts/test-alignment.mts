import assert from "node:assert/strict";
import { alignInput, overlayCaretBoundary } from "../features/typing-engine/alignment";
import {
  shouldSubmitTypingKey,
  virtualSpaceSubmissionValue,
} from "../features/typing-engine/submission-key";
import type { TypingSettings } from "../lib/types";

const baseSettings: TypingSettings = {
  uiLocale: "ko",
  visualTheme: "classic",
  ignorePunctuation: false,
  ignoreNumbers: false,
  ignoreEnglish: false,
  ignoreSymbols: false,
  ignoreStreaming: true,
  newsTypingTarget: "body",
  newsBodyAmount: "medium",
  fontFamily: "pretendard-jp",
  fontSize: 28,
  overlayMode: true,
  highlightWeakWords: true,
};

const trailingIgnoredPunctuation = alignInput("문장을 마칩니다.", "문장을 마칩니다", {
  ...baseSettings,
  ignorePunctuation: true,
});
assert.equal(trailingIgnoredPunctuation.isComplete, true);
assert.equal(shouldSubmitTypingKey(" ", true, true), true);
assert.equal(shouldSubmitTypingKey("Enter", true, true), false);
assert.equal(shouldSubmitTypingKey(" ", false, true), false);
assert.equal(virtualSpaceSubmissionValue("완성 ", (value) => value === "완성"), "완성");
assert.equal(virtualSpaceSubmissionValue("미완 ", (value) => value === "완성"), null);
assert.equal(virtualSpaceSubmissionValue("완성", (value) => value === "완성"), null);

const leadingIgnored = alignInput("[NASA] 발사 성공", "발", {
  ...baseSettings,
  ignoreEnglish: true,
  ignoreSymbols: true,
});
assert.equal(leadingIgnored.correctCount, 1);
assert.equal(leadingIgnored.inputToTargetMap[0], 7);
assert.equal(leadingIgnored.cells.some((cell) => cell.state === "incorrect"), false);

const leadingCursor = alignInput("[NASA] 발사 성공", "", {
  ...baseSettings,
  ignoreEnglish: true,
  ignoreSymbols: true,
});
assert.equal(leadingCursor.cursorAfterIndex, 6);
assert.equal(overlayCaretBoundary(leadingCursor, "", 0), 7);
assert.equal(overlayCaretBoundary(leadingIgnored, "발", 0), 7);

const editingInput = "가😀나";
const editing = alignInput("가😀나.", editingInput, baseSettings);
assert.equal(overlayCaretBoundary(editing, editingInput, 0), 0);
assert.equal(overlayCaretBoundary(editing, editingInput, 1), 1);
assert.equal(overlayCaretBoundary(editing, editingInput, 3), 2);
assert.equal(overlayCaretBoundary(editing, editingInput, 4), 3);

const ignoredBetweenSpaces = alignInput("뉴스 -  속보", "뉴스 속", {
  ...baseSettings,
  ignoreSymbols: true,
});
assert.equal(ignoredBetweenSpaces.correctCount, 4);
assert.equal(ignoredBetweenSpaces.cells.some((cell) => cell.state === "incorrect"), false);
assert.equal(ignoredBetweenSpaces.inputToTargetMap.at(-1), 6);

const explicitlyTypedIgnored = alignInput("뉴스 - 속보", "뉴스 - 속", {
  ...baseSettings,
  ignoreSymbols: true,
});
assert.equal(explicitlyTypedIgnored.correctCount, 6);
assert.equal(explicitlyTypedIgnored.cells[3].state, "correct");

const explicitlyTypedLeading = alignInput("[NASA] 발사", "[NASA] 발", {
  ...baseSettings,
  ignoreEnglish: true,
  ignoreSymbols: true,
});
assert.equal(explicitlyTypedLeading.correctCount, 8);
assert.equal(explicitlyTypedLeading.cells[0].state, "correct");

console.log("alignment tests passed");
