"use client";

import { Music2, Pause, Play, Volume2, VolumeX } from "lucide-react";
import { useCallback, useEffect, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { useUiLanguage } from "@/lib/ui-language";
import {
  readAudioFile,
  sanitizeStartSeconds,
  type ScriptureMedia,
} from "@/features/scripture/scripture-media";

type ScriptureMediaViewProps = {
  media: ScriptureMedia;
  title: string;
  controlsHost: HTMLElement | null;
};

type YouTubePlayer = {
  destroy: () => void;
  getCurrentTime: () => number;
  getDuration: () => number;
  getVolume: () => number;
  pauseVideo: () => void;
  playVideo: () => void;
  seekTo: (seconds: number, allowSeekAhead: boolean) => void;
  setVolume: (volume: number) => void;
};

type YouTubeReadyEvent = { target: YouTubePlayer };
type YouTubeStateEvent = { data: number };
type YouTubeApi = {
  Player: new (
    element: HTMLElement,
    options: {
      videoId: string;
      playerVars: Record<string, number | string>;
      events: {
        onReady: (event: YouTubeReadyEvent) => void;
        onStateChange: (event: YouTubeStateEvent) => void;
      };
    },
  ) => YouTubePlayer;
};

declare global {
  interface Window {
    YT?: YouTubeApi;
  }
}

let youtubeApiPromise: Promise<YouTubeApi> | null = null;

function loadYouTubeApi(): Promise<YouTubeApi> {
  if (window.YT?.Player) return Promise.resolve(window.YT);
  if (youtubeApiPromise) return youtubeApiPromise;

  youtubeApiPromise = new Promise((resolve, reject) => {
    const existing = document.querySelector<HTMLScriptElement>('script[src="https://www.youtube.com/iframe_api"]');
    const script = existing ?? document.createElement("script");
    if (!existing) {
      script.src = "https://www.youtube.com/iframe_api";
      script.async = true;
      document.head.appendChild(script);
    }

    const startedAt = Date.now();
    const timer = window.setInterval(() => {
      if (window.YT?.Player) {
        window.clearInterval(timer);
        resolve(window.YT);
      } else if (Date.now() - startedAt > 12000) {
        window.clearInterval(timer);
        youtubeApiPromise = null;
        reject(new Error("YouTube 플레이어를 불러오지 못했습니다"));
      }
    }, 50);
  });

  return youtubeApiPromise;
}

function formatTime(value: number) {
  const seconds = Math.max(0, Math.floor(Number.isFinite(value) ? value : 0));
  const minutes = Math.floor(seconds / 60);
  return `${minutes}:${String(seconds % 60).padStart(2, "0")}`;
}

type PlayerControlsProps = {
  playing: boolean;
  currentTime: number;
  duration: number;
  volume: number;
  disabled?: boolean;
  onToggle: () => void;
  onSeek: (value: number) => void;
  onVolume: (value: number) => void;
};

function PlayerControls({
  playing,
  currentTime,
  duration,
  volume,
  disabled = false,
  onToggle,
  onSeek,
  onVolume,
}: PlayerControlsProps) {
  const { t } = useUiLanguage();
  const muted = volume === 0;
  return (
    <div className="scripture-player-controls" onClick={(event) => event.stopPropagation()}>
      <button
        type="button"
        className="scripture-player-icon"
        aria-label={playing ? t("일시정지", "Pause") : t("재생", "Play")}
        disabled={disabled}
        onClick={onToggle}
      >
        {playing ? <Pause size={17} fill="currentColor" /> : <Play size={17} fill="currentColor" />}
      </button>
      <span className="scripture-player-time">{formatTime(currentTime)}</span>
      <input
        className="scripture-player-seek"
        type="range"
        min={0}
        max={Math.max(duration, 0.1)}
        step={0.1}
        value={Math.min(currentTime, Math.max(duration, 0.1))}
        disabled={disabled || duration <= 0}
        aria-label={t("재생 위치", "Playback position")}
        onChange={(event) => onSeek(Number(event.target.value))}
      />
      <span className="scripture-player-time">{formatTime(duration)}</span>
      <button
        type="button"
        className="scripture-player-icon"
        aria-label={muted ? t("음소거 해제", "Unmute") : t("음소거", "Mute")}
        disabled={disabled}
        onClick={() => onVolume(muted ? 70 : 0)}
      >
        {muted ? <VolumeX size={17} /> : <Volume2 size={17} />}
      </button>
      <input
        className="scripture-player-volume"
        type="range"
        min={0}
        max={100}
        value={volume}
        disabled={disabled}
        aria-label={t("음량", "Volume")}
        onChange={(event) => onVolume(Number(event.target.value))}
      />
    </div>
  );
}

export function ScriptureMediaView({ media, title, controlsHost }: ScriptureMediaViewProps) {
  const { isEnglish, t } = useUiLanguage();
  const youtubeHostRef = useRef<HTMLDivElement>(null);
  const youtubePlayerRef = useRef<YouTubePlayer | null>(null);
  const audioRef = useRef<HTMLAudioElement>(null);
  const [audioUrl, setAudioUrl] = useState<string | null>(null);
  const [failed, setFailed] = useState(false);
  const [ready, setReady] = useState(false);
  const [playing, setPlaying] = useState(false);
  const [currentTime, setCurrentTime] = useState(0);
  const [duration, setDuration] = useState(0);
  const [volume, setVolumeState] = useState(70);
  const audioId = media.type === "audio" ? media.audioId : "";

  useEffect(() => {
    if (media.type !== "youtube" || !youtubeHostRef.current) return undefined;
    let active = true;
    let player: YouTubePlayer | null = null;

    void loadYouTubeApi()
      .then((YT) => {
        if (!active || !youtubeHostRef.current) return;
        setReady(false);
        setPlaying(false);
        setDuration(0);
        setCurrentTime(sanitizeStartSeconds(media.startSeconds));
        player = new YT.Player(youtubeHostRef.current, {
          videoId: media.videoId,
          playerVars: {
            autoplay: 1,
            controls: 0,
            disablekb: 1,
            playsinline: 1,
            rel: 0,
            start: sanitizeStartSeconds(media.startSeconds),
            loop: media.loop ? 1 : 0,
            playlist: media.loop ? media.videoId : "",
            origin: location.origin,
          },
          events: {
            onReady: (event) => {
              youtubePlayerRef.current = event.target;
              event.target.setVolume(70);
              setDuration(event.target.getDuration() || 0);
              setCurrentTime(event.target.getCurrentTime() || 0);
              setReady(true);
            },
            onStateChange: (event) => setPlaying(event.data === 1),
          },
        });
      })
      .catch((error: unknown) => {
        console.error(error);
        if (active) setFailed(true);
      });

    return () => {
      active = false;
      youtubePlayerRef.current = null;
      try {
        player?.destroy();
      } catch {
        // The iframe may already be detached while switching out of song mode.
      }
    };
  }, [media]);

  useEffect(() => {
    if (media.type !== "youtube" || !ready) return undefined;
    const timer = window.setInterval(() => {
      const player = youtubePlayerRef.current;
      if (!player) return;
      setCurrentTime(player.getCurrentTime() || 0);
      setDuration(player.getDuration() || 0);
    }, 250);
    return () => window.clearInterval(timer);
  }, [media.type, ready]);

  useEffect(() => {
    if (!audioId) return undefined;
    let active = true;
    let url = "";

    void (async () => {
      try {
        const record = await readAudioFile(audioId);
        if (!active) return;
        if (!record?.blob) {
          setFailed(true);
          return;
        }
        url = URL.createObjectURL(record.blob);
        setAudioUrl(url);
      } catch (error) {
        console.error("음원을 읽지 못했습니다", error);
        if (active) setFailed(true);
      }
    })();

    return () => {
      active = false;
      if (url) URL.revokeObjectURL(url);
      setAudioUrl(null);
      setFailed(false);
    };
  }, [audioId]);

  const toggle = useCallback(() => {
    if (media.type === "youtube") {
      const player = youtubePlayerRef.current;
      if (!player) return;
      if (playing) player.pauseVideo();
      else player.playVideo();
      return;
    }
    const audio = audioRef.current;
    if (!audio) return;
    if (audio.paused) void audio.play().catch(() => undefined);
    else audio.pause();
  }, [media.type, playing]);

  const seek = useCallback((seconds: number) => {
    setCurrentTime(seconds);
    if (media.type === "youtube") youtubePlayerRef.current?.seekTo(seconds, true);
    else if (audioRef.current) audioRef.current.currentTime = seconds;
  }, [media.type]);

  const setVolume = useCallback((next: number) => {
    const normalized = Math.min(100, Math.max(0, next));
    setVolumeState(normalized);
    youtubePlayerRef.current?.setVolume(normalized);
    if (audioRef.current) audioRef.current.volume = normalized / 100;
  }, []);

  const controls = controlsHost
    ? createPortal(
        <PlayerControls
          playing={playing}
          currentTime={currentTime}
          duration={duration}
          volume={volume}
          disabled={!ready || failed}
          onToggle={toggle}
          onSeek={seek}
          onVolume={setVolume}
        />,
        controlsHost,
      )
    : null;

  if (media.type === "youtube") {
    return (
      <>
        <div className="scripture-media-frame" aria-label={isEnglish ? `${title} video` : `${title} 영상`}>
          <div ref={youtubeHostRef} />
        </div>
        {failed ? <span className="scripture-media-overlay-error">{t("영상을 불러오지 못했습니다", "Could not load the video")}</span> : null}
        {controls}
      </>
    );
  }

  if (media.type !== "audio") return null;

  return (
    <>
      <div className="scripture-media-audio">
        <Music2 size={25} aria-hidden="true" />
        <span className="scripture-media-name" title={media.name}>{media.name || t("음원", "Audio")}</span>
        {failed ? <span className="scripture-media-error">{t("음원을 찾지 못했습니다", "Could not find the audio")}</span> : null}
        {audioUrl ? (
          <audio
            ref={audioRef}
            src={audioUrl}
            autoPlay
            aria-label={isEnglish ? `${title} audio` : `${title} 음원`}
            onLoadedMetadata={(event) => {
              const audio = event.currentTarget;
              const start = sanitizeStartSeconds(media.startSeconds);
              audio.currentTime = Math.min(start, Math.max(audio.duration - 0.1, 0));
              audio.volume = volume / 100;
              setCurrentTime(audio.currentTime);
              setDuration(audio.duration || 0);
              setReady(true);
            }}
            onPlay={() => setPlaying(true)}
            onPause={() => setPlaying(false)}
            onTimeUpdate={(event) => setCurrentTime(event.currentTarget.currentTime)}
            onEnded={(event) => {
              setPlaying(false);
              if (!media.loop) return;
              event.currentTarget.currentTime = sanitizeStartSeconds(media.startSeconds);
              void event.currentTarget.play().catch(() => undefined);
            }}
          />
        ) : null}
      </div>
      {controls}
    </>
  );
}
