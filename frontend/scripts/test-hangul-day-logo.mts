import assert from "node:assert/strict";
import {
  HANGUL_DAY_OPENERS,
  HANGUL_DAY_WORDS,
  isHangulDayExclusiveContent,
  visibleSeasonalContent,
} from "../features/content/hangul-day-content";
import {
  hangulDayKoreanText,
  hangulDayScoreText,
  millisecondsUntilNextSeoulDay,
  seoulDateKey,
  usesHangulDayExperience,
  usesHangulDayLogo,
} from "../lib/hangul-day";

assert.equal(seoulDateKey(new Date("2026-10-08T14:59:59.999Z")), "2026-10-08");
assert.equal(usesHangulDayLogo(new Date("2026-10-08T14:59:59.999Z")), false);
assert.equal(usesHangulDayLogo(new Date("2026-10-08T15:00:00.000Z")), true);
assert.equal(usesHangulDayLogo(new Date("2026-10-09T14:59:59.999Z")), true);
assert.equal(usesHangulDayLogo(new Date("2026-10-09T15:00:00.000Z")), false);
assert.equal(usesHangulDayLogo(new Date("2027-10-08T15:00:00.000Z")), true);
assert.equal(usesHangulDayLogo(new Date("2027-10-09T14:59:59.999Z")), true);
assert.equal(usesHangulDayLogo(new Date("2027-10-09T15:00:00.000Z")), false);
assert.equal(millisecondsUntilNextSeoulDay(new Date("2026-10-08T15:00:00.000Z")), 86_400_000);
assert.equal(millisecondsUntilNextSeoulDay(new Date("2026-10-09T14:59:59.000Z")), 1_000);
assert.equal(usesHangulDayExperience(new Date("2026-10-08T14:59:59.999Z")), false);
assert.equal(usesHangulDayExperience(new Date("2026-10-08T15:00:00.000Z")), true);
assert.equal(usesHangulDayExperience(new Date("2026-10-25T03:00:00.000Z")), false);
assert.equal(hangulDayKoreanText("뉴스 타이핑 모드"), "새소식 타자 방식");
assert.equal(hangulDayKoreanText("최고 CPM"), "최고 분당 타수");
assert.equal(hangulDayScoreText("12.34K"), "12.34천");
assert.equal(hangulDayScoreText("1.23M"), "1.23백만");
assert.equal(
  hangulDayKoreanText("당첨자는 로그인된 이메일로 개별 연락드립니다."),
  "당첨자는 계정에 등록된 전자우편으로 개별 연락드립니다.",
);
assert.equal(
  hangulDayKoreanText("로그인하면 기록이 쌓입니다"),
  "들어오면 기록이 쌓입니다",
);
assert.equal(
  hangulDayKoreanText("이달의 랭킹 & 진행 중인 이벤트"),
  "이달의 순위 및 진행 중인 행사",
);
assert.equal(isHangulDayExclusiveContent("short", HANGUL_DAY_OPENERS.short), true);
assert.equal(isHangulDayExclusiveContent("long", HANGUL_DAY_OPENERS.long), true);
assert.equal(isHangulDayExclusiveContent("word", HANGUL_DAY_WORDS[0]), true);
assert.equal(isHangulDayExclusiveContent("word", HANGUL_DAY_WORDS[1]), true);
assert.equal(isHangulDayExclusiveContent("short", "평범한 문장"), false);
assert.deepEqual(
  visibleSeasonalContent(
    [{ text: HANGUL_DAY_OPENERS.short }, { text: "평범한 문장" }],
    "short",
    false,
  ),
  [{ text: "평범한 문장" }],
);
assert.equal(
  visibleSeasonalContent(
    [{ text: HANGUL_DAY_WORDS[0] }, { text: HANGUL_DAY_WORDS[1] }],
    "word",
    true,
  ).length,
  2,
);

console.log("hangul day logo tests passed");
