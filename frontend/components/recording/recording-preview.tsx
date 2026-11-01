"use client";

import { useEffect, useId, useRef, useState, type KeyboardEvent as ReactKeyboardEvent } from "react";
import { ChevronLeft, ChevronRight, Download, Pause, Play, Repeat2, RotateCcw, Scissors, SkipBack, Volume2, VolumeX, X } from "lucide-react";
import { createPortal } from "react-dom";
import type { RecordingResult } from "@/features/recording/capture";
import { clampTime, formatTime, MIN_SELECTION, moveBoundary, type TrimRange } from "@/features/recording/editor";
import { downloadRecording } from "@/features/recording/media";
import { useUiLanguage } from "@/lib/ui-language";
import { RecordingTimeline } from "./recording-timeline";
import styles from "./recording.module.css";
import editor from "./editor.module.css";

export function RecordingPreview({ recording, initialRange, onClose, onExport }: {
  recording: RecordingResult;
  initialRange?: TrimRange;
  onClose: () => void;
  onExport: (range: TrimRange) => void;
}) {
  const { t } = useUiLanguage();
  const dialog = useRef<HTMLDialogElement>(null);
  const video = useRef<HTMLVideoElement>(null);
  const rangePreview = useRef(false);
  const [duration, setDuration] = useState(recording.duration);
  const [range, setRange] = useState<TrimRange>(initialRange ?? { start: 0, end: recording.duration });
  const [time, setTime] = useState(0);
  const [playing, setPlaying] = useState(false);
  const [loop, setLoop] = useState(false);
  const [muted, setMuted] = useState(false);
  const [rate, setRate] = useState(1);
  const [ready, setReady] = useState(false);
  const [error, setError] = useState("");
  const [status, setStatus] = useState("");
  const title = useId();
  const busy = false;
  const length = range.end - range.start;
  const valid = duration >= MIN_SELECTION && length >= MIN_SELECTION - 0.00001;

  useEffect(() => {
    const url = URL.createObjectURL(recording.blob);
    const player = video.current;
    const modal = dialog.current;
    if (player) player.src = url;
    modal?.showModal();
    requestAnimationFrame(() => modal?.focus({ preventScroll: true }));
    return () => { player?.pause(); modal?.close(); URL.revokeObjectURL(url); };
  }, [recording.blob]);

  useEffect(() => {
    const player = video.current;
    if (!playing || !player) return;
    let frame = 0;
    const sync = () => {
      if (rangePreview.current && player.currentTime >= range.end - 0.015) {
        if (loop) { player.currentTime = range.start; void player.play().catch(() => {}); }
        else { player.pause(); player.currentTime = range.end; rangePreview.current = false; }
      }
      setTime(clampTime(player.currentTime, duration));
      frame = requestAnimationFrame(sync);
    };
    frame = requestAnimationFrame(sync);
    return () => cancelAnimationFrame(frame);
  }, [playing, duration, range, loop]);

  function seek(next: number) {
    const player = video.current;
    if (!player) return;
    player.pause(); rangePreview.current = false;
    player.currentTime = clampTime(next, duration); setTime(player.currentTime);
  }
  function boundary(edge: "start" | "end", value: number) {
    if (!Number.isFinite(value)) return;
    const next = moveBoundary(range, edge, value, duration);
    setRange(next); seek(next[edge]);
  }
  async function playSelection() {
    const player = video.current;
    if (!player || !ready || !valid) return;
    if (!player.paused) { player.pause(); return; }
    if (player.currentTime < range.start || player.currentTime >= range.end - 0.02) player.currentTime = range.start;
    rangePreview.current = true;
    try { await player.play(); } catch { setError(t("영상을 재생할 수 없습니다. 다시 시도해 주세요.", "Unable to play. Please try again.")); }
  }
  function exportTrim() {
    if (!valid || !ready) return;
    video.current?.pause(); rangePreview.current = false;
    onExport(range);
  }
  function resetSelection() { setRange({ start: 0, end: duration }); seek(0); setStatus(t("전체 구간을 선택했습니다.", "Selected the full recording.")); }
  function handleEditorKeys(event: ReactKeyboardEvent<HTMLDialogElement>) {
    const target = event.target as HTMLElement;
    if (target.closest("input, select, textarea, [role='slider']") || event.altKey) return;
    const key = event.key.toLowerCase();
    if (event.code === "Space") { event.preventDefault(); if (!event.repeat) void playSelection(); return; }
    if (event.ctrlKey || event.metaKey) {
      if (key === "s") { event.preventDefault(); exportTrim(); }
      return;
    }
    const step = event.shiftKey ? 1 : 0.1;
    if (event.key === "ArrowLeft" || event.key === "ArrowRight") {
      event.preventDefault(); seek(time + (event.key === "ArrowLeft" ? -step : step));
    } else if (key === "i") { event.preventDefault(); boundary("start", time); setStatus(t("현재 위치를 시작점으로 지정했습니다.", "Set the current position as the start.")); }
    else if (key === "o") { event.preventDefault(); boundary("end", time); setStatus(t("현재 위치를 끝점으로 지정했습니다.", "Set the current position as the end.")); }
    else if (key === "r") { event.preventDefault(); resetSelection(); }
    else if (key === "m") { event.preventDefault(); setMuted((value) => !value); }
    else if (key === "l") { event.preventDefault(); setLoop((value) => !value); }
  }
  function handleEditorKeyUp(event: ReactKeyboardEvent<HTMLDialogElement>) {
    const target = event.target as HTMLElement;
    if (event.code === "Space" && !target.closest("input, select, textarea, [role='slider']")) {
      // Suppress the synthetic button click browsers dispatch on Space keyup.
      event.preventDefault();
      event.stopPropagation();
    }
  }
  const actionLabel = playing ? t("일시 정지", "Pause") : t("선택 구간 재생", "Play selection");
  return createPortal(
    <dialog ref={dialog} className={`${styles.dialog} ${editor.editor}`} aria-labelledby={title} tabIndex={-1}
      data-dock-interactive="true" onKeyDownCapture={handleEditorKeys} onKeyUpCapture={handleEditorKeyUp}
      onCancel={(event) => { event.preventDefault(); onClose(); }}>
      <header className={styles.header}>
        <div><h2 id={title}>{t("녹화 편집", "Edit recording")}</h2><span className={editor.metadata}>{formatTime(duration)} · {(recording.blob.size / 1024 / 1024).toFixed(1)} MB</span></div>
        <button type="button" onClick={onClose} aria-label={t("미리보기 닫기", "Close preview")} title={t("닫기", "Close")} className={styles.icon}><X size={20} aria-hidden="true" /></button>
      </header>
      <video ref={video} className={`${styles.video} ${editor.preview}`} playsInline preload="auto" muted={muted}
        onClick={() => void playSelection()} title={t("클릭 또는 스페이스바로 재생·일시정지", "Click or press Space to play/pause")}
        onLoadedData={() => setReady(true)}
        onPlay={() => setPlaying(true)} onPause={() => setPlaying(false)}
        onEnded={() => {
          if (loop && rangePreview.current && video.current) { video.current.currentTime = range.start; void video.current.play().catch(() => {}); }
          else { rangePreview.current = false; setPlaying(false); }
        }}
        onTimeUpdate={(event) => setTime(clampTime(event.currentTarget.currentTime, duration))}
        onSeeked={(event) => setTime(clampTime(event.currentTarget.currentTime, duration))}
        onLoadedMetadata={(event) => {
          const actual = event.currentTarget.duration;
          if (Number.isFinite(actual) && actual > 0) {
            setDuration(actual);
            setRange(initialRange
              ? { start: clampTime(initialRange.start, actual), end: Math.max(clampTime(initialRange.end, actual), Math.min(actual, initialRange.start + MIN_SELECTION)) }
              : { start: 0, end: actual });
          }
        }} onError={() => setError(t("미리보기를 재생할 수 없습니다. 원본 다운로드를 이용해 주세요.", "Preview playback failed. Download the original instead."))} />
      <div className={editor.transport}>
        <div className={editor.controls}>
          <button type="button" className={styles.icon} disabled={busy || !ready} aria-label={t("구간 시작으로", "Go to selection start")} title={t("구간 시작으로", "Go to selection start")} onClick={() => seek(range.start)}><SkipBack size={17} /></button>
          <button type="button" className={`${styles.icon} ${editor.play}`} disabled={busy || !ready || !valid} aria-label={actionLabel} title={actionLabel} onClick={() => void playSelection()}>{playing ? <Pause size={19} /> : <Play size={19} />}</button>
          <button type="button" className={styles.icon} disabled={busy || !ready} aria-label={t("0.1초 뒤로", "Back 0.1 seconds")} title={t("0.1초 뒤로", "Back 0.1 seconds")} onClick={() => seek(time - 0.1)}><ChevronLeft size={17} /></button>
          <button type="button" className={styles.icon} disabled={busy || !ready} aria-label={t("0.1초 앞으로", "Forward 0.1 seconds")} title={t("0.1초 앞으로", "Forward 0.1 seconds")} onClick={() => seek(time + 0.1)}><ChevronRight size={17} /></button>
          <output className={editor.clock} aria-label={t("현재 재생 시간", "Current time")}>{formatTime(time)} <span>/ {formatTime(duration)}</span></output>
        </div>
        <div className={editor.controls}>
          <button type="button" className={styles.icon} disabled={busy} aria-pressed={loop} aria-label={t("선택 구간 반복", "Loop selection")} title={t("선택 구간 반복", "Loop selection")} onClick={() => setLoop(!loop)}><Repeat2 size={17} /></button>
          <button type="button" className={styles.icon} disabled={busy} aria-pressed={muted} aria-label={t("미리보기 음소거", "Mute preview")} title={t("미리보기 음소거", "Mute preview")} onClick={() => setMuted(!muted)}>{muted ? <VolumeX size={17} /> : <Volume2 size={17} />}</button>
          <select className={editor.rate} aria-label={t("미리보기 속도", "Preview speed")} value={rate} disabled={busy} onChange={(event) => { const next = Number(event.target.value); setRate(next); if (video.current) video.current.playbackRate = next; }}>
            {[0.5, 0.75, 1, 1.5, 2].map((value) => <option key={value} value={value}>{value}×</option>)}
          </select>
        </div>
      </div>
      <RecordingTimeline duration={duration} range={range} time={time} disabled={busy || !ready} onSeek={seek} onBoundary={boundary} />
      <div className={editor.shortcuts} aria-label={t("편집 단축키", "Editing shortcuts")}>
        <span><kbd>Space</kbd> {t("재생", "Play")}</span><span><kbd>I</kbd> {t("시작점", "Start")}</span><span><kbd>O</kbd> {t("끝점", "End")}</span>
        <span><kbd>← →</kbd> {t("0.1초 이동", "Seek 0.1s")}</span><span><kbd>Shift</kbd>+<kbd>← →</kbd> {t("1초 이동", "Seek 1s")}</span><span><kbd>Ctrl/⌘ S</kbd> {t("내보내기", "Export")}</span>
      </div>
      <div className={editor.trimFields}>
        {(["start", "end"] as const).map((edge) => <label key={edge}>
          <span>{edge === "start" ? t("시작 (초)", "Start (seconds)") : t("끝 (초)", "End (seconds)")}</span>
          <div className={editor.timeInput}><input type="number" step="0.1" min={edge === "start" ? 0 : range.start + MIN_SELECTION} max={edge === "start" ? Math.max(0, range.end - MIN_SELECTION) : duration}
            value={Number(range[edge].toFixed(3))} disabled={busy} onChange={(event) => boundary(edge, event.target.valueAsNumber)} />
            <button type="button" disabled={busy || !ready} aria-label={edge === "start" ? t("현재 위치를 시작으로", "Set start here") : t("현재 위치를 끝으로", "Set end here")}
              title={edge === "start" ? t("현재 위치를 시작으로", "Set start here") : t("현재 위치를 끝으로", "Set end here")} onClick={() => boundary(edge, time)}><Scissors size={15} /></button>
          </div>
        </label>)}
        <div className={editor.selectionSummary}><span>{t("선택 길이", "Selection")}</span><strong>{formatTime(length)}</strong>
          <button type="button" className={styles.icon} disabled={busy} aria-label={t("전체 구간 복원", "Reset selection")} title={t("전체 구간 복원", "Reset selection")} onClick={resetSelection}><RotateCcw size={16} /></button>
        </div>
      </div>
      {recording.notice && <p className={editor.notice} role="status">{recording.notice}</p>}
      {status && <p className={editor.srStatus} role="status">{status}</p>}
      <div className={styles.actions}>
        <button type="button" onClick={() => downloadRecording(recording.blob)}><Download size={16} aria-hidden="true" />{t("원본 다운로드", "Download original")}</button>
        <button type="button" disabled={!valid || !ready} onClick={exportTrim}><Scissors size={16} aria-hidden="true" />{t("내보내고 타이핑으로", "Export in background")}<span className={editor.exportLength}>{formatTime(length)}</span></button>
      </div>
      {error && <p role="alert" className={styles.error}>{error}</p>}
    </dialog>, document.body,
  );
}
