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

/**
 * 일부 태블릿 가상 키보드는 Space를 눌러도 keydown을 보내지 않고 textarea의
 * input 값만 갱신한다. 이미 완성된 입력 뒤에 새 공백 하나가 붙은 경우에만
 * 그 공백을 제출 명령으로 해석한다. 문장 중간의 정상 공백은 isComplete가
 * false이므로 그대로 입력값으로 남는다.
 */
export function virtualSpaceSubmissionValue(
  value: string,
  isComplete: (candidate: string) => boolean,
) {
  if (!value.endsWith(" ")) return null;
  const candidate = value.slice(0, -1);
  return isComplete(candidate) ? candidate : null;
}
