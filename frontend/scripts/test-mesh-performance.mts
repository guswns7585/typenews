import assert from "node:assert/strict";
import { assessMeshFrameHealth } from "../lib/mesh-performance";

const steady60Fps = Array.from({ length: 180 }, () => 16.7);
assert.equal(assessMeshFrameHealth(steady60Fps).slow, false);

const occasionalJank = Array.from({ length: 180 }, (_, index) =>
  index % 30 === 0 ? 34 : 16.7,
);
assert.equal(assessMeshFrameHealth(occasionalJank).slow, false);

const repeatedDrops = Array.from({ length: 150 }, (_, index) =>
  index % 5 === 0 ? 34 : 16.7,
);
assert.equal(assessMeshFrameHealth(repeatedDrops).slow, true);

const steady30Fps = Array.from({ length: 90 }, () => 33.3);
assert.equal(assessMeshFrameHealth(steady30Fps).slow, true);

assert.equal(assessMeshFrameHealth([Number.NaN, 0, -1, 2_000]).slow, false);

console.log("mesh performance tests passed");
