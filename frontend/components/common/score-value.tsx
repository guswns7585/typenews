"use client";

import { useState } from "react";
import { formatScore } from "@/features/typing-engine/format-score";
import { useUiLanguage } from "@/lib/ui-language";

type ScoreValueProps = {
  value: number;
  /** 전체 표기 뒤에 붙는 단위. 예: "점", "문장" */
  unit?: string;
  className?: string;
};

/**
 * 큰 숫자를 줄여 보여주다가, 누르면 전체 자릿수로 바꾼다.
 *
 * 타수 기준으로 바뀌면서 점수 자릿수가 커졌다. 랭킹에서 여덟 자리가 그대로
 * 나오면 읽기 어렵고 열 너비도 흔들린다. 그렇다고 정확한 값을 볼 방법이
 * 없으면 곤란해서, 눌러서 전환할 수 있게 했다.
 */
export function ScoreValue({ value, unit = "", className }: ScoreValueProps) {
  const { locale, t } = useUiLanguage();
  const [expanded, setExpanded] = useState(false);
  const short = formatScore(value);
  const full = value.toLocaleString(locale === "en" ? "en-US" : "ko-KR");
  // 줄여도 같은 값이면 굳이 누를 수 있게 하지 않는다.
  const canToggle = short !== full;

  if (!canToggle) {
    return <span className={className}>{full}</span>;
  }

  return (
    <button
      type="button"
      className={`score-value${className ? ` ${className}` : ""}`}
      aria-label={`${full}${unit}`}
      title={t("눌러서 전체 숫자 보기", "Click to show the full number")}
      onClick={(event) => {
        event.stopPropagation();
        setExpanded((current) => !current);
      }}
    >
      {expanded ? full : short}
    </button>
  );
}
