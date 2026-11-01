const SEOUL_OFFSET_MS = 9 * 60 * 60 * 1000;

/** 한국 시간 기준 매년 10월 9일. 연도에 의존하지 않는다. */
export const HANGUL_DAY_MONTH_DAY = "10-09";

/** Date를 고정 UTC+9인 한국 표준시의 YYYY-MM-DD로 바꾼다. */
export function seoulDateKey(date = new Date()) {
  return new Date(date.getTime() + SEOUL_OFFSET_MS).toISOString().slice(0, 10);
}

export function usesHangulDayLogo(date = new Date()) {
  return seoulDateKey(date).slice(5) === HANGUL_DAY_MONTH_DAY;
}

/** 개발·운영 환경 모두 한국 시간 한글날 하루에만 켜진다. */
export function usesHangulDayExperience(date = new Date()) {
  return usesHangulDayLogo(date);
}

/** 점수 축약 자릿수는 유지하고 영문 단위만 우리말로 바꾼다. */
export function hangulDayScoreText(text: string) {
  return text
    .replace(/K$/, "천")
    .replace(/M$/, "백만")
    .replace(/B$/, "십억");
}

/** 한국어 UI의 외래어 표기를 한글날 하루 동안 조금 더 우리말답게 다듬는다. */
export function hangulDayKoreanText(text: string) {
  const exact: Record<string, string> = {
    "뉴스 한국어": "한국어 새소식",
    "뉴스 영어": "영어 새소식",
    "Google로 로그인": "구글로 들어가기",
    "Type News 홈": "글쇠일보 첫 화면",
    "Type News Ranking": "글쇠일보 순위",
    "PERSONAL REPORT": "개인 기록",
    English: "영어",
    Short: "단문",
    Long: "장문",
    Word: "단어",
  };
  if (exact[text]) return exact[text];

  const naturalized = [
    ["랭킹은", "순위는"],
    ["랭킹을", "순위를"],
    ["랭킹이", "순위가"],
    ["랭킹과", "순위와"],
    ["랭킹으로", "순위로"],
    ["세션은", "차례는"],
    ["세션을", "차례를"],
    ["프로필은", "대표 정보는"],
    ["프로필을", "대표 정보를"],
    ["로그인된 이메일 주소로", "계정에 등록된 전자우편 주소로"],
    ["로그인된 이메일로", "계정에 등록된 전자우편으로"],
    ["로그인된 이메일 주소", "계정에 등록된 전자우편 주소"],
    ["로그인된 이메일", "계정에 등록된 전자우편"],
    ["로그인하지 않은", "들어오지 않은"],
    ["로그인하지 않으면", "들어오지 않으면"],
    ["로그인하면", "들어오면"],
    ["로그인한", "들어온"],
    ["로그인이 필요합니다", "먼저 들어가야 합니다"],
  ].reduce((result, [from, to]) => result.replaceAll(from, to), text);

  return [
    ["Type News", "글쇠일보"],
    ["로그아웃", "나가기"],
    ["로그인", "들어가기"],
    ["이메일", "전자우편"],
    ["타이핑", "타자"],
    ["뉴스", "새소식"],
    ["이벤트", "행사"],
    ["랭킹", "순위"],
    ["프로필", "대표"],
    ["키보드", "글쇠판"],
    ["썸네일", "미리보기 그림"],
    ["오버레이", "겹쳐쓰기"],
    ["스트리밍", "실시간 전송"],
    ["콘텐츠", "내용"],
    ["세션", "차례"],
    ["모드", "방식"],
    ["테마", "꾸밈"],
    ["메인", "주요"],
    ["라이프", "생활"],
    ["스포츠", "운동"],
    ["SPD", "속도"],
    ["CPM", "분당 타수"],
    ["WPM", "분당 낱말"],
    ["ACC", "정확도"],
    ["CNT", "완주"],
    ["LINE", "줄"],
    [" & ", " 및 "],
  ].reduce((result, [from, to]) => result.replaceAll(from, to), naturalized);
}

/** 현재 시각부터 다음 한국 자정까지 남은 시간. 열린 탭의 자동 전환에 쓴다. */
export function millisecondsUntilNextSeoulDay(date = new Date()) {
  const shifted = new Date(date.getTime() + SEOUL_OFFSET_MS);
  const nextMidnight = Date.UTC(
    shifted.getUTCFullYear(),
    shifted.getUTCMonth(),
    shifted.getUTCDate() + 1,
  );
  return Math.max(0, nextMidnight - shifted.getTime());
}
