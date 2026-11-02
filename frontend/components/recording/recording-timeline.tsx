"use client";

import { useRef } from "react";
import { GripVertical } from "lucide-react";
import { formatTime, pointerTime, type TrimRange } from "@/features/recording/editor";
import { useUiLanguage } from "@/lib/ui-language";
import styles from "./editor.module.css";

type TimelineProps = {
  duration: number;
  range: TrimRange;
  time: number;
  waveform?: readonly number[];
  disabled: boolean;
  onSeek: (time: number) => void;
  onBoundary: (edge: "start" | "end", value: number) => void;
};

export function RecordingTimeline({ duration, range, time, waveform = [], disabled, onSeek, onBoundary }: TimelineProps) {
  const { t } = useUiLanguage();
  const track = useRef<HTMLDivElement>(null);
  const dragging = useRef<"start" | "end" | null>(null);
  const percent = (value: number) => duration > 0 ? value / duration * 100 : 0;
  const updatePointer = (edge: "start" | "end", clientX: number) => {
    const box = track.current?.getBoundingClientRect();
    if (box) onBoundary(edge, pointerTime(clientX, box.left, box.width, duration));
  };
  const waveformPath = waveform.map((level, index) => {
    const height = Math.max(1.5, Math.min(1, level) * 46);
    return `M${index + 0.5} ${50 - height}V${50 + height}`;
  }).join(" ");
  const selectedWaveformClip = `inset(0 ${Math.max(0, 100 - percent(range.end))}% 0 ${Math.max(0, percent(range.start))}%)`;
  return <div className={styles.timelineSection}>
    <div className={styles.timeline} ref={track}>
      {waveformPath && <svg className={styles.waveform} viewBox={`0 0 ${waveform.length} 100`}
        preserveAspectRatio="none" aria-hidden="true"><path d={waveformPath} /></svg>}
      <input className={styles.seek} type="range" min={0} max={duration} step={0.01}
        value={Math.min(time, duration)} disabled={disabled} aria-label={t("재생 위치", "Playhead")}
        aria-valuetext={formatTime(time)} onChange={(event) => onSeek(event.target.valueAsNumber)} />
      <div className={styles.selectedRange} style={{ left: `${percent(range.start)}%`, width: `${percent(range.end - range.start)}%` }} aria-hidden="true" />
      {waveformPath && <svg className={`${styles.waveform} ${styles.waveformSelected}`}
        viewBox={`0 0 ${waveform.length} 100`} preserveAspectRatio="none" aria-hidden="true"
        style={{ clipPath: selectedWaveformClip }}><path d={waveformPath} /></svg>}
      <div className={styles.playhead} style={{ left: `${percent(time)}%` }} aria-hidden="true" />
      {(["start", "end"] as const).map((edge) => <button key={edge} type="button" role="slider"
        className={styles.handle} style={{ left: `${percent(range[edge])}%` }} disabled={disabled}
        aria-label={edge === "start" ? t("구간 시작", "Selection start") : t("구간 끝", "Selection end")}
        aria-valuemin={edge === "start" ? 0 : range.start + Math.min(0.1, duration)}
        aria-valuemax={edge === "start" ? Math.max(0, range.end - Math.min(0.1, duration)) : duration}
        aria-valuenow={range[edge]} aria-valuetext={formatTime(range[edge])}
        title={`${edge === "start" ? t("구간 시작", "Selection start") : t("구간 끝", "Selection end")} ${formatTime(range[edge])}`}
        onPointerDown={(event) => {
          if (disabled) return;
          event.preventDefault(); event.currentTarget.focus();
          dragging.current = edge; event.currentTarget.setPointerCapture(event.pointerId);
        }}
        onPointerMove={(event) => { if (dragging.current === edge) updatePointer(edge, event.clientX); }}
        onPointerUp={() => { dragging.current = null; }} onPointerCancel={() => { dragging.current = null; }}
        onLostPointerCapture={() => { dragging.current = null; }}
        onKeyDown={(event) => {
          const step = event.shiftKey ? 1 : 0.1;
          const moves: Record<string, number> = { ArrowLeft: -step, ArrowDown: -step, ArrowRight: step, ArrowUp: step };
          if (event.key in moves) { event.preventDefault(); onBoundary(edge, range[edge] + moves[event.key]); }
          else if (event.key === "Home" || event.key === "End") { event.preventDefault(); onBoundary(edge, event.key === "Home" ? 0 : duration); }
        }}>
        <GripVertical size={15} aria-hidden="true" />
        <span className={styles.handleTime}>{formatTime(range[edge])}</span>
      </button>)}
    </div>
    <div className={styles.ticks} aria-hidden="true">
      {[0, 0.25, 0.5, 0.75, 1].map((fraction) => <span key={fraction}>{formatTime(duration * fraction)}</span>)}
    </div>
  </div>;
}
