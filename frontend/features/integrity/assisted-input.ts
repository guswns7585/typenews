type BeforeInputLike = {
  inputType?: string;
  data?: string | null;
  isComposing?: boolean;
};

/** Block browser/extension generated text while preserving physical keys and IME composition. */
export function shouldBlockAssistedInput(event: BeforeInputLike) {
  if (event.isComposing || event.inputType?.includes("Composition")) return false;
  if (event.inputType === "insertFromPaste" || event.inputType === "insertFromDrop" || event.inputType === "insertReplacementText") return true;
  return event.inputType === "insertText" && [...(event.data ?? "")].length > 1;
}
