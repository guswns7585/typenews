"use client";

import { useTypingStore } from "@/stores/use-typing-store";
import { useUiStore } from "@/stores/use-ui-store";

export function InfoPanel() {
  const sessionCount = useTypingStore((s) => s.sessionCount);
  const maxCpm = useUiStore((s) => s.maxCpm);
  const monthlyScore = useUiStore((s) => s.monthlyScore);

  return (
    <div className="info-panel" id="info-panel">
      <div className="content">
        <h3>타이핑 기록</h3>
        <p>
          누적 문장 수
          <br />
          <span id="total-sentences">{sessionCount}</span>
        </p>
        <p>
          CPM 최고기록
          <br />
          <span id="max-cpm">{maxCpm}</span>
        </p>
        <p>
          현재 내 점수
          <br />
          <span id="monthly-score">{monthlyScore}</span>
        </p>
      </div>
      <div className="info-footer">
        <p>
          ESC <br />
          모두 지우기
        </p>
        <p>
          Ctrl + <span className="key-char">,</span> / <span className="key-char">.</span> | Tap | ESC
          <br />
          이전 / 다음 문장
        </p>
        <p>
          Type News 5회 클릭
          <br />
          사운드 모드 On/Off
        </p>
      </div>
    </div>
  );
}
