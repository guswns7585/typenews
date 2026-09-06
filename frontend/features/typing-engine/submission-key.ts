export function shouldSubmitTypingKey(
  key: string,
  canComplete: boolean,
  isImeComposing: boolean,
) {
  if (!canComplete || (key !== "Enter" && key !== " ")) return false;

  /* macOS Chrome keeps Korean IME composition active through the first Space
     after the final syllable. Once the prompt is complete, that Space is the
     user's submit command rather than text that still needs composing. */
  return !isImeComposing || key === " ";
}
