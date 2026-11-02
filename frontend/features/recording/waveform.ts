export const WAVEFORM_BARS = 220;

/** Condense regularly sampled microphone levels into a stable timeline envelope. */
export function buildWaveform(samples: readonly number[], bars = WAVEFORM_BARS) {
  const clean = samples.map((sample) => Number.isFinite(sample) ? Math.max(0, sample) : 0);
  if (!clean.length || bars <= 0) return [];
  const sorted = [...clean].sort((a, b) => a - b);
  const noiseFloor = sorted[Math.floor((sorted.length - 1) * 0.2)] ?? 0;
  const gated = clean.map((sample) => Math.max(0, sample - noiseFloor * 1.15));
  const count = Math.min(Math.max(1, Math.floor(bars)), clean.length);
  const peaks = Array.from({ length: count }, (_, index) => {
    const start = Math.floor(index * gated.length / count);
    const end = Math.max(start + 1, Math.floor((index + 1) * gated.length / count));
    let peak = 0;
    for (let sample = start; sample < end; sample++) peak = Math.max(peak, gated[sample] ?? 0);
    return peak;
  });
  const rankedPeaks = [...peaks].sort((a, b) => a - b);
  const ceiling = rankedPeaks[Math.max(0, Math.ceil(rankedPeaks.length * 0.95) - 1)] ?? 0;
  if (ceiling <= Number.EPSILON) return peaks.map(() => 0);
  return peaks.map((peak) => Math.min(1, Math.pow(peak / ceiling, 0.78)));
}
