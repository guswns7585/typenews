import assert from "node:assert/strict";
import { TYPING_AUDIO_PROFILE } from "./audio";

assert.equal(TYPING_AUDIO_PROFILE.rumbleCutHz, 55);
assert.equal(TYPING_AUDIO_PROFILE.presenceHz, 3200);
assert.ok(TYPING_AUDIO_PROFILE.presenceGain > 0 && TYPING_AUDIO_PROFILE.presenceGain <= 3, "typing sound boost must stay subtle");
assert.ok(TYPING_AUDIO_PROFILE.hissCutHz >= 12000, "hiss cut must preserve the typing attack");
console.log("Recording typing-audio profile checks passed.");
