import assert from "node:assert/strict";
import { test } from "node:test";
import { buildWaveform } from "./waveform";

test("waveform condenses samples and normalizes the loudest bar", () => {
  const waveform = buildWaveform([0, 1, 0.2, 0.4, 0.8, 0], 3);
  assert.equal(waveform.length, 3);
  assert.equal(waveform[0], 1);
  assert.ok(waveform[1] > 0 && waveform[1] < 1);
  assert.ok(waveform[2] > 0 && waveform[2] < 1);
});

test("waveform handles silent and invalid samples safely", () => {
  assert.deepEqual(buildWaveform([], 10), []);
  assert.deepEqual(buildWaveform([0, Number.NaN, -1], 3), [0, 0, 0]);
});

test("waveform suppresses a steady microphone noise floor", () => {
  assert.deepEqual(buildWaveform(Array.from({ length: 30 }, () => 0.02), 10), Array.from({ length: 10 }, () => 0));
  const waveform = buildWaveform([...Array.from({ length: 20 }, () => 0.02), 0.3, 0.02], 11);
  assert.equal(Math.max(...waveform), 1);
  assert.ok(waveform.filter((value) => value > 0).length <= 2);
});
