import type { TypingMetrics, TypingSettings } from "@/lib/types";

const punctuation = /[.,!?;:()[\]{}'"`“”‘’…—-]/;
const symbols = /[~@#$%^&*_+=<>|\\/]/;

export function isIgnoredCharacter(character: string, settings: TypingSettings) {
  return (
    (settings.ignorePunctuation && punctuation.test(character)) ||
    (settings.ignoreNumbers && /\d/.test(character)) ||
    (settings.ignoreEnglish && /[a-z]/i.test(character)) ||
    (settings.ignoreSymbols && symbols.test(character))
  );
}

export function comparableText(text: string, settings: TypingSettings) {
  return [...text].filter((character) => !isIgnoredCharacter(character, settings)).join("");
}

export function calculateMetrics(
  target: string,
  input: string,
  startedAt: number | null,
  settings: TypingSettings,
): TypingMetrics {
  const elapsedSeconds = startedAt ? Math.max((Date.now() - startedAt) / 1000, 0) : 0;
  const targetComparable = comparableText(target, settings);
  const inputComparable = comparableText(input, settings);
  const typedCount = inputComparable.length;
  const matchedCount = [...inputComparable].reduce(
    (count, character, index) => count + Number(character === targetComparable[index]),
    0,
  );
  const accuracy = typedCount ? Math.round((matchedCount / typedCount) * 100) : 0;
  const cpm = elapsedSeconds ? Math.round((typedCount / elapsedSeconds) * 60 * 2) : 0;

  return { cpm, accuracy, typedCount, elapsedSeconds };
}

export function isCompleted(target: string, input: string, settings: TypingSettings) {
  return comparableText(target, settings) === comparableText(input, settings);
}
