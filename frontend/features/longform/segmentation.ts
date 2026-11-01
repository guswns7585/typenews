export const MAX_SEGMENT_CHARACTERS = 180;
export type LongformSegment = { text: string; paragraph: number };

/** Count Unicode characters, never UTF-16 halves. Prefer whitespace when wrapping. */
export function segmentLongform(body: string, language: "kor" | "eng"): LongformSegment[] {
  const result: LongformSegment[] = [];
  const segmenter = typeof Intl.Segmenter === "function"
    ? new Intl.Segmenter(language === "kor" ? "ko" : "en", { granularity: "sentence" })
    : null;
  body.replace(/\r\n?/g, "\n").split(/\n+/).forEach((paragraph, index) => {
    const normalized = paragraph.replace(/\s+/gu, " ").trim();
    const sentences = segmenter
      ? Array.from(segmenter.segment(normalized), (part) => part.segment)
      : normalized.split(/(?<=[.!?。！？][”’"']?)\s+/u);
    for (const sentence of sentences) {
      let characters = Array.from(sentence.trim());
      while (characters.length) {
        let end = Math.min(characters.length, MAX_SEGMENT_CHARACTERS);
        if (end < characters.length) {
          for (let i = end; i > 0; i--) {
            if (/\s/u.test(characters[i])) { end = i; break; }
          }
        }
        const text = characters.slice(0, end).join("").trim();
        if (text) result.push({ text, paragraph: index });
        characters = characters.slice(end);
        while (characters.length && /\s/u.test(characters[0])) characters.shift();
      }
    }
  });
  return result;
}
