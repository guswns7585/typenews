export const MIN_SELECTION = 0.1;
export type TrimRange = { start: number; end: number };

export function clampTime(time: number, duration: number) {
  return Math.max(0, Math.min(Number.isFinite(duration) ? Math.max(0, duration) : 0, Number.isFinite(time) ? time : 0));
}

export function moveBoundary(range: TrimRange, edge: "start" | "end", value: number, duration: number): TrimRange {
  if (!Number.isFinite(value)) return range;
  const gap = Math.min(MIN_SELECTION, Math.max(0, duration));
  return edge === "start"
    ? { start: Math.min(clampTime(value, duration), Math.max(0, range.end - gap)), end: range.end }
    : { start: range.start, end: Math.max(clampTime(value, duration), Math.min(duration, range.start + gap)) };
}

export function pointerTime(clientX: number, left: number, width: number, duration: number) {
  return width > 0 ? clampTime((clientX - left) / width * duration, duration) : 0;
}

export function formatTime(value: number, precise = true) {
  const tenths = Math.floor(Math.max(0, Number.isFinite(value) ? value : 0) * 10 + 0.00001);
  const seconds = Math.floor(tenths / 10);
  return `${Math.floor(seconds / 60)}:${String(seconds % 60).padStart(2, "0")}${precise ? `.${tenths % 10}` : ""}`;
}
