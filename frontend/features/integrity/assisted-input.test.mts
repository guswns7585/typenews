import assert from "node:assert/strict";
import { test } from "node:test";
import { shouldBlockAssistedInput } from "./assisted-input";

test("allows physical-key text and IME commits", () => {
  assert.equal(shouldBlockAssistedInput({ inputType: "insertText", data: "a" }), false);
  assert.equal(shouldBlockAssistedInput({ inputType: "insertText", data: "😀" }), false);
  assert.equal(shouldBlockAssistedInput({ inputType: "insertCompositionText", data: "한글", isComposing: true }), false);
  assert.equal(shouldBlockAssistedInput({ inputType: "insertFromComposition", data: "한글" }), false);
});

test("blocks writing assistants and bulk insertion paths", () => {
  assert.equal(shouldBlockAssistedInput({ inputType: "insertReplacementText", data: "AI generated sentence" }), true);
  assert.equal(shouldBlockAssistedInput({ inputType: "insertText", data: "AI generated sentence" }), true);
  assert.equal(shouldBlockAssistedInput({ inputType: "insertFromPaste", data: "paste" }), true);
  assert.equal(shouldBlockAssistedInput({ inputType: "insertFromDrop", data: "drop" }), true);
});
