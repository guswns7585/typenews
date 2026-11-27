import { resumeRecordingAudio } from "./media";

export const TYPING_AUDIO_PROFILE = {
  rumbleCutHz: 55,
  presenceHz: 3200,
  presenceGain: 2,
  presenceQ: 0.85,
  hissCutHz: 14000,
} as const;

function unprocessedAudio(input: MediaStream) {
  return { stream: input, sampleLevel: () => 0, close() {} };
}

export async function enhanceTypingAudio(input: MediaStream, signal?: AbortSignal) {
  signal?.throwIfAborted();
  if (typeof AudioContext === "undefined") return unprocessedAudio(input);
  let context: AudioContext | undefined;
  try {
    context = new AudioContext({ latencyHint: "interactive" });
    return await connectTypingAudio(context, input, signal);
  } catch {
    // A suspended or unavailable Web Audio context must not block raw mic capture.
    if (context && context.state !== "closed") void context.close().catch(() => {});
    signal?.throwIfAborted();
    return unprocessedAudio(input);
  }
}

async function connectTypingAudio(context: AudioContext, input: MediaStream, signal?: AbortSignal) {
  const source = context.createMediaStreamSource(input);
  const rumbleCut = context.createBiquadFilter();
  const presence = context.createBiquadFilter();
  const hissCut = context.createBiquadFilter();
  const analyser = context.createAnalyser();
  const destination = context.createMediaStreamDestination();
  rumbleCut.type = "highpass";
  rumbleCut.frequency.value = TYPING_AUDIO_PROFILE.rumbleCutHz;
  rumbleCut.Q.value = 0.7;
  presence.type = "peaking";
  presence.frequency.value = TYPING_AUDIO_PROFILE.presenceHz;
  presence.gain.value = TYPING_AUDIO_PROFILE.presenceGain;
  presence.Q.value = TYPING_AUDIO_PROFILE.presenceQ;
  hissCut.type = "lowpass";
  hissCut.frequency.value = TYPING_AUDIO_PROFILE.hissCutHz;
  hissCut.Q.value = 0.55;
  analyser.fftSize = 256;
  analyser.smoothingTimeConstant = 0.15;
  const levelBuffer = new Float32Array(analyser.fftSize);
  source.connect(rumbleCut).connect(presence).connect(hissCut).connect(analyser).connect(destination);
  // The tab chooser can outlive the click's user activation. In that case
  // Chromium may leave resume() pending while the raw microphone is usable.
  await resumeRecordingAudio(context, signal, 1000, "오디오 효과를 시작하지 못했습니다.");

  return {
    stream: destination.stream,
    sampleLevel() {
      analyser.getFloatTimeDomainData(levelBuffer);
      let squareSum = 0;
      let peak = 0;
      for (const sample of levelBuffer) {
        const absolute = Math.abs(sample);
        squareSum += sample * sample;
        peak = Math.max(peak, absolute);
      }
      const rms = Math.sqrt(squareSum / levelBuffer.length);
      return Math.min(1, rms * 0.7 + peak * 0.3);
    },
    close() {
      source.disconnect();
      rumbleCut.disconnect();
      presence.disconnect();
      hissCut.disconnect();
      analyser.disconnect();
      destination.disconnect();
      void context.close().catch(() => {});
    },
  };
}
