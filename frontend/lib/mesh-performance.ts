export type MeshFrameHealth = {
  medianMs: number;
  p95Ms: number;
  slowFrameRatio: number;
  sampleCount: number;
  slow: boolean;
};

const SLOW_FRAME_MS = 22;
const SLOW_P95_MS = 26;
const SLOW_FRAME_RATIO = 0.12;

/**
 * 메시 애니메이션을 유지할 수 있는지 판단한다.
 *
 * 60Hz 화면의 정상 프레임은 약 16.7ms다. 일시적인 GC 한두 번에는 반응하지 않고,
 * 프레임 하락이 반복되거나 하위 5%가 확실히 느릴 때만 품질을 낮춘다.
 */
export function assessMeshFrameHealth(intervals: readonly number[]): MeshFrameHealth {
  const samples = intervals
    .filter((interval) => Number.isFinite(interval) && interval > 0 && interval < 1_000)
    .sort((left, right) => left - right);

  if (samples.length === 0) {
    return { medianMs: 0, p95Ms: 0, slowFrameRatio: 0, sampleCount: 0, slow: false };
  }

  const percentile = (value: number) =>
    samples[Math.min(samples.length - 1, Math.floor((samples.length - 1) * value))];
  const slowFrameRatio = samples.filter((interval) => interval > SLOW_FRAME_MS).length / samples.length;
  const p95Ms = percentile(0.95);

  return {
    medianMs: percentile(0.5),
    p95Ms,
    slowFrameRatio,
    sampleCount: samples.length,
    slow: p95Ms > SLOW_P95_MS || slowFrameRatio > SLOW_FRAME_RATIO,
  };
}
