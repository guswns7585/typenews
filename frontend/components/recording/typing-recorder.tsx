"use client";

import { useEffect, useId, useRef, useState, type RefObject } from "react";
import { CheckCircle2, Circle, LoaderCircle, Mic, Square, Video, X } from "lucide-react";
import { createPortal } from "react-dom";
import { CaptureSharing, startCapture, type RecordingResult } from "@/features/recording/capture";
import type { TrimRange } from "@/features/recording/editor";
import { downloadRecording, MAX_SECONDS, recordingError } from "@/features/recording/media";
import { trimRecording } from "@/features/recording/trim";
import { RecordingPreview } from "./recording-preview";
import styles from "./recording.module.css";
import { useUiLanguage } from "@/lib/ui-language";

export type TypingRecorderProps = {
  targetRef: RefObject<HTMLElement | null>;
  disabled?: boolean;
  /** Fallback resolved at capture time, useful when the dock mounts first. */
  targetSelector?: string;
};

type ExportState = {
  phase: "working" | "done" | "error";
  progress: number;
  message: string;
  source?: RecordingResult;
  range?: TrimRange;
};

export function TypingRecorder({ targetRef, disabled = false, targetSelector = "#typing-tab" }: TypingRecorderProps) {
  const { t } = useUiLanguage();
  const [setup, setSetup] = useState(false);
  const [microphone, setMicrophone] = useState(true);
  const [phase, setPhase] = useState<"idle" | "starting" | "recording">("idle");
  const [seconds, setSeconds] = useState(0);
  const [recording, setRecording] = useState<RecordingResult | null>(null);
  const [resumeRange, setResumeRange] = useState<TrimRange | null>(null);
  const [error, setError] = useState("");
  const [sharingActive, setSharingActive] = useState(false);
  const [exportState, setExportState] = useState<ExportState | null>(null);
  const sharing = useRef<CaptureSharing | null>(null);
  const operation = useRef<AbortController | null>(null);
  const capture = useRef<{ stop: () => void } | null>(null);
  const exportJob = useRef<{ controller: AbortController; source: RecordingResult; range: TrimRange } | null>(null);
  const exportNoticeTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const dialog = useRef<HTMLDialogElement>(null);
  const title = useId();
  const tooltip = useId();
  useEffect(() => () => {
    operation.current?.abort(); exportJob.current?.controller.abort(); sharing.current?.close();
    if (exportNoticeTimer.current) clearTimeout(exportNoticeTimer.current);
    capture.current = null;
  }, []);
  useEffect(() => { if (setup) dialog.current?.showModal(); }, [setup]);
  useEffect(() => {
    if (phase !== "recording") return;
    const started = performance.now();
    const timer = setInterval(() => setSeconds(Math.min(MAX_SECONDS, Math.floor((performance.now() - started) / 1000))), 1000);
    return () => clearInterval(timer);
  }, [phase]);
  async function start() {
    if (operation.current || disabled) return;
    const controller = new AbortController();
    operation.current = controller;
    setSetup(false); setError(""); setPhase("starting"); setSeconds(0);
    try {
      sharing.current ??= new CaptureSharing(setSharingActive);
      const session = await startCapture({
        target: () => targetRef.current ?? document.querySelector<HTMLElement>(targetSelector),
        microphone, signal: controller.signal, sharing: sharing.current,
        onComplete: (result) => {
          if (controller.signal.aborted) return;
          capture.current = null; operation.current = null;
          setPhase("idle"); setResumeRange(null); setRecording(result);
        },
        onError: (cause) => {
          if (controller.signal.aborted) return;
          capture.current = null; operation.current = null;
          setPhase("idle"); setError(recordingError(cause));
        },
      });
      if (!controller.signal.aborted) { capture.current = session; setPhase("recording"); }
    } catch (cause) {
      if (!controller.signal.aborted) { operation.current = null; setPhase("idle"); setError(recordingError(cause)); }
    }
  }
  function cancel() {
    operation.current?.abort(); operation.current = null; capture.current = null; setPhase("idle");
  }
  function focusTypingInput() {
    requestAnimationFrame(() => {
      const input = targetRef.current?.querySelector<HTMLTextAreaElement>("#input")
        ?? document.querySelector<HTMLTextAreaElement>("#input");
      input?.focus({ preventScroll: true });
    });
  }
  async function exportInBackground(source: RecordingResult, range: TrimRange) {
    if (exportJob.current) return;
    const controller = new AbortController();
    exportJob.current = { controller, source, range };
    if (exportNoticeTimer.current) clearTimeout(exportNoticeTimer.current);
    setRecording(null);
    setResumeRange(range);
    setExportState({ phase: "working", progress: 0, message: t("영상 저장 준비 중", "Preparing video") });
    focusTypingInput();
    try {
      const blob = await trimRecording(source.blob, range.start, range.end, controller.signal, (progress) => {
        if (exportJob.current?.controller === controller) {
          setExportState({ phase: "working", progress, message: t("영상 저장 중", "Exporting video") });
        }
      });
      if (controller.signal.aborted) return;
      downloadRecording(blob, true);
      setExportState({ phase: "done", progress: 1, message: t("다운로드를 시작했습니다", "Download started") });
      exportNoticeTimer.current = setTimeout(() => setExportState(null), 6000);
    } catch (cause) {
      if (!controller.signal.aborted) {
        setExportState({ phase: "error", progress: 0, message: recordingError(cause), source, range });
      }
    } finally {
      if (exportJob.current?.controller === controller) exportJob.current = null;
    }
  }
  function cancelBackgroundExport() {
    const source = exportJob.current?.source;
    const range = exportJob.current?.range;
    exportJob.current?.controller.abort(); exportJob.current = null;
    setExportState(null);
    if (source) { setResumeRange(range ?? null); setRecording(source); }
  }
  const exporting = exportState?.phase === "working";
  const label = phase === "recording" ? t("녹화 중지", "Stop recording") : phase === "starting" ? t("녹화 준비 취소", "Cancel recording setup") : exporting ? t("영상 저장 중", "Exporting video") : sharingActive ? t("바로 다시 녹화", "Record again") : t("타이핑 녹화", "Record typing");
  return <div className={styles.root} data-dock-interactive="true">
    <button type="button" className={`${styles.dockButton} ${phase === "recording" ? styles.active : ""}`}
      disabled={(disabled || exporting) && phase === "idle"} aria-label={label} aria-describedby={tooltip}
      title={label} data-dock-interactive="true" onClick={(event) => {
        event.currentTarget.blur();
        if (phase === "recording") capture.current?.stop();
        else if (phase === "starting") cancel();
        else if (sharing.current?.active) { void start().then(focusTypingInput); }
        else setSetup(true);
      }}>
      {phase === "recording" ? <Square size={17} fill="currentColor" aria-hidden="true" /> : <Video size={19} aria-hidden="true" />}
    </button>
    <span id={tooltip} role="tooltip" className={styles.tooltip}>{label}</span>
    {phase === "recording" && <span className={styles.elapsed} role="timer" aria-label={t("녹화 시간", "Recording duration")}><Circle size={8} fill="currentColor" aria-hidden="true" /> {Math.floor(seconds / 60)}:{String(seconds % 60).padStart(2, "0")}</span>}
    {phase === "starting" && <span className={styles.elapsed} role="status">{t("공유 선택 중…", "Waiting for tab selection…")}</span>}
    {sharingActive && phase === "idle" && <button type="button" className={styles.sharing}
      data-dock-interactive="true" onClick={() => sharing.current?.close()}
      title={t("화면 공유 연결을 완전히 종료합니다. 다시 녹화하려면 허용이 필요합니다.", "Disconnect screen sharing. Recording again will require permission.")}>
      {t("공유 연결 중 · 끊기", "Sharing connected · Disconnect")}
    </button>}
    {error && <div className={styles.message} role="alert">{error}<button className={styles.icon} type="button" onClick={() => setError("")} aria-label={t("오류 닫기", "Dismiss error")}><X size={16} aria-hidden="true" /></button></div>}
    {exportState && createPortal(<div className={`${styles.exportToast} ${styles[exportState.phase]}`} role={exportState.phase === "error" ? "alert" : "status"}>
      {exportState.phase === "working" ? <LoaderCircle size={18} className={styles.spinning} aria-hidden="true" /> : exportState.phase === "done" ? <CheckCircle2 size={18} aria-hidden="true" /> : null}
      <div><strong>{exportState.message}</strong>{exportState.phase === "working" && <progress max="1" value={exportState.progress} aria-label={t("영상 저장 진행률", "Video export progress")} />}</div>
      {exportState.phase === "working" ? <button type="button" onClick={cancelBackgroundExport}>{t("취소", "Cancel")}</button>
        : exportState.phase === "error" && exportState.source ? <button type="button" onClick={() => { setResumeRange(exportState.range ?? null); setRecording(exportState.source!); setExportState(null); }}>{t("편집 다시 열기", "Reopen editor")}</button>
          : <button type="button" className={styles.icon} onClick={() => setExportState(null)} aria-label={t("알림 닫기", "Dismiss notification")}><X size={16} /></button>}
    </div>, document.body)}
    {setup && createPortal(<dialog ref={dialog} className={styles.dialog} aria-labelledby={title}
      data-dock-interactive="true" onCancel={(event) => { event.preventDefault(); setSetup(false); }}>
      <header className={styles.header}><h2 id={title}>{t("타이핑 녹화", "Record typing")}</h2><button type="button" className={styles.icon} onClick={() => setSetup(false)} aria-label={t("녹화 설정 닫기", "Close recording setup")}><X size={20} aria-hidden="true" /></button></header>
      <p>{t("공유 창에서 현재 TypeNews 탭을 선택하세요. 타이핑 영역만 녹화합니다. 최대 5분 또는 100 MB이며, 탭을 숨기거나 영역이 화면 밖으로 이동하면 종료됩니다.", "Select this TypeNews tab in the sharing dialog. Only the typing area is recorded, up to 5 minutes or 100 MB. Hiding the tab or moving the area outside the viewport stops recording.")}</p>
      <label className={styles.checkbox}><input type="checkbox" checked={microphone} onChange={(event) => setMicrophone(event.target.checked)} /><Mic size={17} aria-hidden="true" /> {t("마이크 포함 (소음 억제 끔)", "Include microphone (noise suppression off)")}</label>
      <p>{t("녹화와 편집은 브라우저 안에서 처리되며 업로드하지 않습니다. 데스크톱 Chrome / Edge가 필요합니다.", "Recording and editing stay in your browser. Nothing is uploaded. Desktop Chrome or Edge is required.")}</p>
      <p>{t("녹화를 마쳐도 화면 공유 연결은 유지됩니다. 다음 녹화는 버튼 한 번으로 시작하며, 대기 중에는 영상 저장과 마이크 사용이 중단됩니다. 독의 ‘공유 연결 중 · 끊기’로 연결을 종료할 수 있습니다.", "Screen sharing stays connected after recording so you can record again with one click. While idle, video is not saved and the microphone is off. Use ‘Sharing connected · Disconnect’ in the dock to end sharing.")}</p>
      <div className={styles.actions}><button type="button" onClick={() => setSetup(false)}>{t("취소", "Cancel")}</button><button type="button" disabled={disabled} onClick={(event) => { event.currentTarget.blur(); void start().then(focusTypingInput); }}><Video size={17} aria-hidden="true" /> {t("탭 선택 및 녹화", "Select tab and record")}</button></div>
    </dialog>, document.body)}
    {recording && <RecordingPreview recording={recording} initialRange={resumeRange ?? undefined} onClose={() => { setRecording(null); setResumeRange(null); }} onExport={(range) => void exportInBackground(recording, range)} />}
  </div>;
}

export default TypingRecorder;
