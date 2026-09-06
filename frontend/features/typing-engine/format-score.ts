/**
 * 점수 표기.
 *
 * 점수가 타수 기준으로 바뀌면서 자릿수가 크게 늘었다. 랭킹에서 여덟 자리
 * 숫자가 그대로 나오면 읽기 어렵고 열 너비도 흔들린다.
 * 1,000 이상은 K·M·B로 줄이고 소수점은 **항상 두 자리**로 적는다.
 *
 * 값은 버림으로 줄인다. 4,999를 "5K"로 올리면 5,000을 넘긴 것처럼 보인다.
 *
 *     999      → "999"
 *   1_000      → "1.00K"
 *   1_500      → "1.50K"
 *   4_566      → "4.56K"
 *   1_234_567  → "1.23M"
 *
 * ⚠️ 소수점 끝의 0을 떼지 말 것.
 *    예전에는 "1.50K"를 "1.5K"로, "50.00K"를 "50K"로 줄였다. 읽기는 편하지만
 *    랭킹처럼 숫자가 세로로 늘어서는 곳에서 자릿수가 들쭉날쭉해져, 어떤 줄만
 *    쑥 들어가 보인다는 지적을 받았다. 목록에서는 자리가 맞는 편이 낫다.
 */
const UNITS = [
  { threshold: 1_000_000_000, suffix: "B" },
  { threshold: 1_000_000, suffix: "M" },
  { threshold: 1_000, suffix: "K" },
] as const;

export function formatScore(value: number) {
  if (!Number.isFinite(value)) return "0";

  const sign = value < 0 ? "-" : "";
  const size = Math.abs(value);

  const unit = UNITS.find((candidate) => size >= candidate.threshold);
  if (!unit) return `${sign}${Math.round(size)}`;

  // 버림으로 처리한다. 4,999를 "5K"로 올리면 5,000을 넘긴 것처럼 보인다.
  const scaled = Math.floor((size / unit.threshold) * 100) / 100;
  // 두 자리를 그대로 남긴다. 자세한 이유는 위 주석 참고.
  return `${sign}${scaled.toFixed(2)}${unit.suffix}`;
}

/** 마우스를 올렸을 때 보여줄 정확한 값. */
export function formatScoreExact(value: number) {
  return `${Math.round(value).toLocaleString("ko-KR")}점`;
}
