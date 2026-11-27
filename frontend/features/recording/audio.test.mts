import assert from "node:assert/strict";
import { test } from "node:test";
import { enhanceTypingAudio, TYPING_AUDIO_PROFILE } from "./audio";

assert.equal(TYPING_AUDIO_PROFILE.rumbleCutHz, 55);
assert.equal(TYPING_AUDIO_PROFILE.presenceHz, 3200);
assert.ok(TYPING_AUDIO_PROFILE.presenceGain > 0 && TYPING_AUDIO_PROFILE.presenceGain <= 3, "typing sound boost must stay subtle");
assert.ok(TYPING_AUDIO_PROFILE.hissCutHz >= 12000, "hiss cut must preserve the typing attack");
console.log("Recording typing-audio profile checks passed.");

test("a suspended audio context falls back to the original microphone stream", async () => {
  const original = Object.getOwnPropertyDescriptor(globalThis, "AudioContext");
  let closed = false;
  const node = {
    frequency: { value: 0 }, Q: { value: 0 }, gain: { value: 0 },
    connect() { return this; },
  };
  class SuspendedAudioContext {
    state = "suspended";
    createMediaStreamSource() { return node; }
    createBiquadFilter() { return node; }
    createAnalyser() { return node; }
    createMediaStreamDestination() { return node; }
    resume() { return new Promise<void>(() => {}); }
    async close() { closed = true; }
  }
  Object.defineProperty(globalThis, "AudioContext", { configurable: true, value: SuspendedAudioContext });
  try {
    const input = {} as MediaStream;
    const audio = await enhanceTypingAudio(input);
    assert.equal(audio.stream, input);
    assert.equal(closed, true);
  } finally {
    if (original) Object.defineProperty(globalThis, "AudioContext", original);
    else Reflect.deleteProperty(globalThis, "AudioContext");
  }
});
