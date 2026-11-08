import assert from "node:assert/strict";
import { SHOWCASE_MEDIA_LIMITS, showcaseAudioType } from "./media";

assert.equal(SHOWCASE_MEDIA_LIMITS.imageLongSide, 1600);
assert.equal(SHOWCASE_MEDIA_LIMITS.imageBytes, 1.5 * 1024 * 1024);
assert.equal(SHOWCASE_MEDIA_LIMITS.audioBytes, 1024 * 1024);
assert.equal(SHOWCASE_MEDIA_LIMITS.audioDurationSeconds, 45);
assert.deepEqual(showcaseAudioType({ type: "audio/webm" }), { extension: "webm", mime: "audio/webm" });
assert.deepEqual(showcaseAudioType({ type: "audio/mpeg" }), { extension: "mp3", mime: "audio/mpeg" });
assert.equal(showcaseAudioType({ type: "audio/wav" }), null);

console.log("Showcase media limits and audio type mapping passed.");
