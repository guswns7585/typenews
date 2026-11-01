/**
 * 2026 한글날 로고.
 *
 * 기존 Type News 로고와 같은 프레임, 좌우 색상 역할, 화면 비율을 쓴다.
 * 인라인 SVG여야 커스텀 배경에서 바뀌는 --svg-* 변수가 그대로 적용된다.
 */
export function HangulDayLogo({ className }: { className?: string }) {
  return (
    <svg
      viewBox="0 0 813 263"
      xmlns="http://www.w3.org/2000/svg"
      className={`${className ?? ""} hangul-day-logo`.trim()}
      role="img"
      aria-label="글쇠 일보"
    >
      <path
        fill="var(--svg-black, #0a0a0a)"
        d="M441,255h-31V8h31c2.21,0,4-1.79,4-4s-1.79-4-4-4h-34.9s-.06,0-.1,0-.06,0-.1,0h-33.9c-2.21,0-4,1.79-4,4s1.79,4,4,4h30v247h-30c-2.21,0-4,1.79-4,4s1.79,4,4,4h69c2.21,0,4-1.79,4-4s-1.79-4-4-4Z"
      />
      <path
        fill="var(--svg-black, #0a0a0a)"
        d="M345,230H30c-12.13,0-22-9.87-22-22V57c0-12.13,9.87-22,22-22h315c2.21,0,4-1.79,4-4s-1.79-4-4-4H30C13.46,27,0,40.46,0,57v151C0,224.54,13.46,238,30,238h315c2.21,0,4-1.79,4-4s-1.79-4-4-4Z"
      />
      <path
        fill="var(--svg-black, #0a0a0a)"
        d="M467,35h315c12.13,0,22,9.87,22,22v151c0,12.13-9.87,22-22,22H467c-2.21,0-4,1.79-4,4s1.79,4,4,4h315c16.54,0,30-13.46,30-30V57c0-16.54-13.46-30-30-30H467c-2.21,0-4,1.79-4,4s1.79,4,4,4Z"
      />
      <text
        x="174"
        y="170"
        textAnchor="middle"
        fill="var(--svg-type, #0a0a0a)"
        className="hangul-day-logo-text"
      >
        글쇠
      </text>
      <text
        x="638"
        y="170"
        textAnchor="middle"
        fill="var(--svg-gray, #bfbfbf)"
        className="hangul-day-logo-text site-logo-secondary"
      >
        일보
      </text>
    </svg>
  );
}
