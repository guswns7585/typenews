export const TYPING_AUDIO_PROFILE = {
  rumbleCutHz: 55,
  presenceHz: 3200,
  presenceGain: 2,
  presenceQ: 0.85,
  hissCutHz: 14000,
} as const;

export async function enhanceTypingAudio(input: MediaStream) {
  if (typeof AudioContext === "undefined") return { stream: input, close() {} };
  const context = new AudioContext({ latencyHint: "interactive" });
  const source = context.createMediaStreamSource(input);
  const rumbleCut = context.createBiquadFilter();
  const presence = context.createBiquadFilter();
  const hissCut = context.createBiquadFilter();
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
  source.connect(rumbleCut).connect(presence).connect(hissCut).connect(destination);
  await context.resume();

  return {
    stream: destination.stream,
    close() {
      source.disconnect();
      rumbleCut.disconnect();
      presence.disconnect();
      hissCut.disconnect();
      destination.disconnect();
      void context.close();
    },
  };
}
