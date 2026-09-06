/**
 * 랭킹과 점수의 월 구분자.
 *
 * 서버(`record_typing_result`)가 `Asia/Seoul` 기준으로 판정하므로 클라이언트도
 * 같은 기준이어야 화면과 적립이 어긋나지 않는다. 사용자의 기기 시간대와 무관하다.
 *
 * ⚠️ 조회에만 쓴다. 점수가 어느 달로 들어갈지는 서버가 정한다.
 */
export function seoulMonthId(now = new Date()) {
  const parts = new Intl.DateTimeFormat("en-US", {
    timeZone: "Asia/Seoul",
    year: "numeric",
    month: "2-digit",
  }).formatToParts(now);
  const year = parts.find((part) => part.type === "year")?.value;
  const month = parts.find((part) => part.type === "month")?.value;
  return `${year}${month}`;
}
