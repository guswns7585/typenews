import type { TypingSettings } from "@/lib/types";

const PUNCTUATION = /[.,!?'"“”‘’~]/;
const NUMBER = /[0-9]/;
const LATIN = /\p{Script=Latin}/u;
const SYMBOL = /[!@#$%^&*()_\-+={}[\]|\\:;<>?/~··•‧∙⋅・ㆍ･]/;

export function isIgnoredCharacter(character: string, settings: TypingSettings) {
  return (
    (settings.ignorePunctuation && PUNCTUATION.test(character)) ||
    (settings.ignoreEnglish && LATIN.test(character)) ||
    (settings.ignoreNumbers && NUMBER.test(character)) ||
    (settings.ignoreSymbols && SYMBOL.test(character))
  );
}

export type CharState = "correct" | "incorrect" | "ignored" | null;

export type AlignmentCell = {
  /** 원문 글자 */
  char: string;
  /** 화면에 그릴 글자. 오버레이 모드에서는 실제로 입력한 글자가 들어간다. */
  display: string;
  state: CharState;
};

export type Alignment = {
  cells: AlignmentCell[];
  /** 정확도 분자. 맞게 친 입력 글자 수 */
  correctCount: number;
  /** 입력 인덱스 → 원문 인덱스 매핑 */
  inputToTargetMap: number[];
  /** 이 인덱스의 셀 뒤에 커서를 그린다. -1이면 첫 셀 앞 */
  cursorAfterIndex: number;
  /** 남은 원문이 무시 문자·공백뿐이면 완료 */
  isComplete: boolean;
};

/**
 * 원본 타입뉴스 `updateHighlight()`의 비교 규칙을 그대로 옮긴 정렬기.
 *
 * - 무시 문자는 입력을 소비하지 않고 건너뛴다.
 * - 공백을 입력하면 뒤따르는 연속 공백·무시 문자를 한 번에 통과한다.
 * - 마지막으로 입력한 글자는 아직 조합 중일 수 있으므로 오답 처리하지 않는다.
 */
export function alignInput(target: string, input: string, settings: TypingSettings): Alignment {
  const chars = [...target];
  const typedChars = [...input];
  const overlay = settings.overlayMode;

  const cells: AlignmentCell[] = chars.map((char) => ({ char, display: char, state: null }));
  const inputToTargetMap: number[] = [];
  let correctCount = 0;

  const ignored = chars.map((char) => isIgnoredCharacter(char, settings));
  /* 완료 판정과 남은 부분 표시에 쓰는 기준. 안 쳐도 넘어갈 수 있는 글자다. */
  const skippable = (index: number) => ignored[index] || chars[index] === " ";
  let inputIndex = 0;
  let targetIndex = 0;

  /* 앞부분의 공백·무시 문자는 입력 없이 통과시킨다. 다만 사용자가 첫 무시 문자를
     실제로 입력했다면 본 루프에 맡겨 정답으로 인정한다. */
  while (targetIndex < chars.length && skippable(targetIndex)) {
    const firstTyped = typedChars[0];
    if (
      ignored[targetIndex] &&
      firstTyped &&
      firstTyped.toLowerCase() === chars[targetIndex].toLowerCase()
    ) {
      break;
    }
    cells[targetIndex].state = "ignored";
    targetIndex += 1;
  }
  const leadingCursorAfterIndex = targetIndex - 1;

  while (targetIndex < chars.length && inputIndex < typedChars.length) {
    const expected = chars[targetIndex];
    const typed = typedChars[inputIndex];

    /* 무시 문자는 이중 판정한다.
       안 치고 넘어가면 그대로 무시되고, 굳이 쳤다면 그것도 정답으로 인정한다.
       무시 옵션을 켜둔 채 습관적으로 문장부호까지 치는 사람이 손해 보지 않게. */
    if (ignored[targetIndex]) {
      if (typed.toLowerCase() === expected.toLowerCase()) {
        cells[targetIndex].state = "correct";
        correctCount += 1;
        inputToTargetMap[inputIndex] = targetIndex;
        inputIndex += 1;
      } else {
        cells[targetIndex].state = "ignored";
      }
      targetIndex += 1;
      continue;
    }

    // 공백 한 번으로 뒤따르는 연속 공백·무시 문자를 모두 통과한다.
    if (expected === " " && typed === " ") {
      let lookahead = targetIndex + 1;
      while (lookahead < chars.length && skippable(lookahead)) {
        const nextTyped = typedChars[inputIndex + 1];
        /* 다음 입력이 무시 문자 자체라면 여기서 멈춘다. 습관적으로 문장부호까지
           입력하는 사용자도 기존의 이중 판정을 그대로 받을 수 있다. */
        if (
          ignored[lookahead] &&
          nextTyped &&
          nextTyped.toLowerCase() === chars[lookahead].toLowerCase()
        ) {
          break;
        }
        cells[lookahead].state = ignored[lookahead] ? "ignored" : "correct";
        lookahead += 1;
      }
      cells[targetIndex].state = "correct";
      correctCount += 1;
      inputToTargetMap[inputIndex] = Math.max(targetIndex, lookahead - 1);
      inputIndex += 1;
      targetIndex = lookahead;
      continue;
    }

    const isCorrect = typed.toLowerCase() === expected.toLowerCase();
    const isLastTypedChar = inputIndex === typedChars.length - 1;

    if (isCorrect) {
      cells[targetIndex].state = "correct";
      if (overlay) cells[targetIndex].display = typed;
      correctCount += 1;
    } else {
      // 마지막 글자는 IME 조합 중일 수 있어 오답으로 확정하지 않는다.
      cells[targetIndex].state = isLastTypedChar ? null : "incorrect";
      if (overlay) cells[targetIndex].display = typed === " " ? expected : typed;
    }

    inputToTargetMap[inputIndex] = targetIndex;
    inputIndex += 1;
    targetIndex += 1;
  }

  // 아직 입력이 닿지 않은 뒷부분.
  while (targetIndex < chars.length) {
    cells[targetIndex].state = skippable(targetIndex) ? "ignored" : null;
    cells[targetIndex].display = chars[targetIndex];
    targetIndex += 1;
  }

  const lastMappedIndex = inputToTargetMap.length ? inputToTargetMap[inputToTargetMap.length - 1] : -1;
  let remainingIndex = lastMappedIndex + 1;
  while (remainingIndex < chars.length && skippable(remainingIndex)) {
    remainingIndex += 1;
  }

  return {
    cells,
    correctCount,
    inputToTargetMap,
    cursorAfterIndex: typedChars.length ? lastMappedIndex : leadingCursorAfterIndex,
    // 입력이 하나도 없으면 완료로 보지 않는다. 전부 무시 문자인 문장이 즉시 넘어가는 것을 막는다.
    isComplete: typedChars.length > 0 && remainingIndex >= chars.length,
  };
}
