/**
 * 두벌식 키보드 기준 실제 타수 계산.
 *
 * 점수는 "문장의 속성"이다. 같은 문장은 누가 치든 같은 타수를 가진다.
 *   "열심히 살자"           = 13타
 *   "happiness is important" = 20타
 *
 * 규칙
 *   - 한글 음절은 초성·중성·종성을 자모로 풀어 실제 누르는 키 수를 센다.
 *     겹받침(ㄳ ㄺ ㅄ…)과 복합모음(ㅘ ㅙ ㅢ…)은 2타.
 *     쌍자음(ㄲ ㄸ ㅃ ㅆ ㅉ)과 ㅒ ㅖ는 Shift 조합이라 1타로 센다.
 *   - 영문·숫자·기호는 1타.
 *   - 공백은 세지 않는다.
 */

const HANGUL_BASE = 0xac00;
const HANGUL_LAST = 0xd7a3;
const MEDIAL_COUNT = 21;
const FINAL_COUNT = 28;

// 초성 19개는 모두 1타. (쌍자음은 Shift 조합)
const INITIAL_STROKES = Array<number>(19).fill(1);

// ㅏㅐㅑㅒㅓㅔㅕㅖㅗㅘㅙㅚㅛㅜㅝㅞㅟㅠㅡㅢㅣ
const MEDIAL_STROKES = [1, 1, 1, 1, 1, 1, 1, 1, 1, 2, 2, 2, 1, 1, 2, 2, 2, 1, 1, 2, 1];

// 종성 없음, ㄱㄲㄳㄴㄵㄶㄷㄹㄺㄻㄼㄽㄾㄿㅀㅁㅂㅄㅅㅆㅇㅈㅊㅋㅌㅍㅎ
const FINAL_STROKES = [
  0, 1, 1, 2, 1, 2, 2, 1, 1, 2, 2, 2, 2, 2, 2, 2, 1, 1, 2, 1, 1, 1, 1, 1, 1, 1, 1, 1,
];

// 낱자로 쓰인 호환 자모(ㅋㅋㅋ, ㅠㅠ 같은 입력). U+3131~U+3163
const COMPATIBILITY_JAMO_START = 0x3131;
const COMPATIBILITY_JAMO_END = 0x3163;
// 두 번 눌러야 만들어지는 겹자음·복합모음. 나머지 낱자는 모두 1타다.
const TWO_STROKE_JAMO = new Set([..."ㄳㄵㄶㄺㄻㄼㄽㄾㄿㅀㅄㅘㅙㅚㅝㅞㅟㅢ"]);

/** 글자 하나의 타수. 공백은 0. */
export function keystrokesForCharacter(character: string) {
  if (!character || character === " ") return 0;

  const code = character.codePointAt(0);
  if (code === undefined) return 0;

  if (code >= HANGUL_BASE && code <= HANGUL_LAST) {
    const offset = code - HANGUL_BASE;
    const initial = Math.floor(offset / (MEDIAL_COUNT * FINAL_COUNT));
    const medial = Math.floor((offset % (MEDIAL_COUNT * FINAL_COUNT)) / FINAL_COUNT);
    const final = offset % FINAL_COUNT;
    return INITIAL_STROKES[initial] + MEDIAL_STROKES[medial] + FINAL_STROKES[final];
  }

  if (code >= COMPATIBILITY_JAMO_START && code <= COMPATIBILITY_JAMO_END) {
    return TWO_STROKE_JAMO.has(character) ? 2 : 1;
  }

  // 공백을 제외한 나머지 제어 문자는 세지 않는다.
  if (code < 0x20) return 0;

  return 1;
}

/** 문자열 전체의 타수. */
export function countKeystrokes(text: string) {
  let total = 0;
  for (const character of text) total += keystrokesForCharacter(character);
  return total;
}
