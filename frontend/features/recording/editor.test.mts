import assert from "node:assert/strict";
import { clampTime, formatTime, moveBoundary, pointerTime } from "./editor";

assert.deepEqual(moveBoundary({ start: 1, end: 4 }, "start", 6, 10), { start: 3.9, end: 4 });
assert.deepEqual(moveBoundary({ start: 1, end: 4 }, "end", -2, 10), { start: 1, end: 1.1 });
assert.deepEqual(moveBoundary({ start: 0, end: 0.05 }, "start", 1, 0.05), { start: 0, end: 0.05 });
assert.deepEqual(moveBoundary({ start: 1, end: 4 }, "end", NaN, 10), { start: 1, end: 4 });
assert.equal(pointerTime(-100, 10, 100, 60), 0);
assert.equal(pointerTime(210, 10, 100, 60), 60);
assert.equal(pointerTime(60, 10, 100, 60), 30);
assert.equal(pointerTime(60, 10, 0, 60), 0);
assert.equal(clampTime(Infinity, 20), 0);
assert.equal(formatTime(300), "5:00.0");
assert.equal(formatTime(61.29), "1:01.2");
assert.equal(formatTime(NaN), "0:00.0");
console.log("Recording editor bounds, short clips, pointer positions and time formatting passed.");
