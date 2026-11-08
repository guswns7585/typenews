"use client";

import { useEffect, useRef, useState } from "react";
import { useUiLanguage } from "@/lib/ui-language";
import styles from "./showcase.module.css";

function timeLabel(seconds: number) {
  if (!Number.isFinite(seconds) || seconds < 0) return "0:00";
  const whole = Math.floor(seconds);
  return `${Math.floor(whole / 60)}:${String(whole % 60).padStart(2, "0")}`;
}

type Props = { src: string; label?: string; durationHint?: number; compact?: boolean };

function validDuration(value: number | undefined) {
  return Number.isFinite(value) && (value ?? 0) > 0 ? value! : 0;
}

export function ShowcaseAudioPlayer({ src, label, durationHint, compact = false }: Props) {
  const { t } = useUiLanguage();
  const audio = useRef<HTMLAudioElement>(null);
  const [playing, setPlaying] = useState(false);
  const [duration, setDuration] = useState(0);
  const [current, setCurrent] = useState(0);
  const [ready, setReady] = useState(false);
  const [error, setError] = useState("");
  const hintedDuration = validDuration(durationHint);

  useEffect(() => {
    const element = audio.current;
    if (!playing || !element) return;
    let frame = 0;
    const update = () => {
      setCurrent(Math.min(validDuration(element.currentTime), duration || hintedDuration));
      frame = requestAnimationFrame(update);
    };
    frame = requestAnimationFrame(update);
    return () => {
      cancelAnimationFrame(frame);
    };
  }, [playing, duration, hintedDuration]);

  useEffect(() => () => audio.current?.pause(), []);

  function updateDuration(element: HTMLAudioElement) {
    const reported = validDuration(element.duration);
    // The selected range saved with the archive is authoritative. Chromium can
    // briefly expose an invalid or stale WebM duration while metadata loads.
    setDuration(hintedDuration || reported);
  }

  async function toggle() {
    const element = audio.current;
    if (!element) return;
    setError("");
    if (!element.paused) { element.pause(); return; }
    const length = duration || hintedDuration;
    if (length && element.currentTime >= length - 0.02) element.currentTime = 0;
    try { await element.play(); }
    catch { setPlaying(false); setError(t("재생할 수 없습니다", "Unable to play")); }
  }

  return (
    <div className={styles.audioPlayer} data-compact={compact}>
      <audio
        ref={audio}
        src={src}
        preload="auto"
        onLoadStart={() => { setPlaying(false); setReady(false); setError(""); setCurrent(0); setDuration(hintedDuration); }}
        onLoadedMetadata={(event) => updateDuration(event.currentTarget)}
        onDurationChange={(event) => updateDuration(event.currentTarget)}
        onCanPlay={() => setReady(true)}
        onTimeUpdate={(event) => setCurrent(Math.min(validDuration(event.currentTarget.currentTime), duration || hintedDuration))}
        onPlay={() => setPlaying(true)}
        onPause={() => setPlaying(false)}
        onEnded={(event) => { event.currentTarget.currentTime = 0; setPlaying(false); setCurrent(0); }}
        onError={() => { setReady(false); setPlaying(false); setError(t("타건음을 불러오지 못했습니다", "Could not load typing sound")); }}
      />
      <button type="button" className={styles.audioPlayButton} disabled={!ready || Boolean(error)} onClick={() => void toggle()} aria-label={playing ? t("일시정지", "Pause") : t("재생", "Play")}>
        {playing ? "Ⅱ" : "▶"}
      </button>
      {label || error ? <span className={styles.audioLabel} title={error || undefined}>{error || label}</span> : null}
      <input
        type="range"
        min={0}
        max={1000}
        step={1}
        value={duration > 0 ? Math.round(Math.min(1, current / duration) * 1000) : 0}
        disabled={!ready || duration <= 0 || Boolean(error)}
        aria-label={t("재생 위치", "Playback position")}
        onChange={(event) => {
          const next = Number(event.target.value) / 1000 * duration;
          if (audio.current && Number.isFinite(next)) audio.current.currentTime = next;
          setCurrent(next);
        }}
      />
      <span className={styles.audioTime}>{timeLabel(current)} / {timeLabel(duration)}</span>
    </div>
  );
}
