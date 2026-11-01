import type { ScriptureItem } from "../scripture/scripture-library";
import { BUILTIN_LONGFORM, type LongformText } from "./content";
import { segmentLongform } from "./segmentation";

export const LONGFORM_UPDATED_EVENT = "typenews:longform-updated";
const ACTIVE_KEY = "typenews.longform.active.v1";
const memory = new Map<string, string>();
export const isLongformId = (id: string | null | undefined): id is string => Boolean(id?.startsWith("longform:"));

function read(key: string): unknown {
  try {
    const raw = memory.get(key) ?? (typeof window === "undefined" ? undefined : window.localStorage.getItem(key));
    return JSON.parse(raw ?? "null");
  } catch { try { return JSON.parse(memory.get(key) ?? "null"); } catch { return null; } }
}
function write(key: string, value: unknown) {
  const raw = JSON.stringify(value);
  try { window.localStorage.setItem(key, raw); memory.delete(key); return true; } catch { memory.set(key, raw); return false; }
}
export function loadLongformTexts(): LongformText[] {
  return BUILTIN_LONGFORM;
}
export function getLongformText(id: string) { return loadLongformTexts().find((item) => item.id === id); }
/** Stay in the current language and avoid repeating the essay that just ended.
 * Unfinished essays are preferred so a completed essay is not reset until every
 * other essay in that language has also been completed. */
export function pickRandomNextLongform(current: LongformText, random = Math.random) {
  const others = loadLongformTexts().filter((item) => item.language === current.language && item.id !== current.id);
  const unfinished = others.filter((item) => !loadLongformProgress(item).completed);
  const pool = unfinished.length > 0 ? unfinished : (others.length > 0 ? others : [current]);
  const sample = random();
  const value = Number.isFinite(sample) ? Math.max(0, Math.min(0.999999999999, sample)) : 0;
  return pool[Math.floor(value * pool.length)];
}
export function longformVersion(text: LongformText) {
  let hash = 2166136261;
  for (const character of `${text.language}\n${text.body}`) hash = Math.imul(hash ^ character.codePointAt(0)!, 16777619);
  return `segments-v1-${(hash >>> 0).toString(16)}`;
}
export type LongformProgress = {
  version: string; line: number; completed: boolean;
  segments: Record<string, { characters: number; elapsedMs: number; accuracy: number }>;
};
function progressKey(text: LongformText) { return `typenews.longform.progress.v1:${text.id}:${longformVersion(text)}`; }
export function loadLongformProgress(text: LongformText): LongformProgress {
  const count = segmentLongform(text.body, text.language).length;
  const empty: LongformProgress = { version: longformVersion(text), line: 0, completed: false, segments: {} };
  const value = read(progressKey(text)) as Partial<LongformProgress> | null;
  if (!value || value.version !== empty.version || !Number.isInteger(value.line) || typeof value.completed !== "boolean") return empty;
  const segments: LongformProgress["segments"] = {};
  if (value.segments && typeof value.segments === "object") {
    for (const [key, metric] of Object.entries(value.segments)) {
      if (!/^\d+$/.test(key) || Number(key) >= count || !metric || !Number.isFinite(metric.characters) || metric.characters < 0 || !Number.isFinite(metric.elapsedMs) || metric.elapsedMs < 0 || !Number.isFinite(metric.accuracy) || metric.accuracy < 0 || metric.accuracy > 100) continue;
      segments[key] = metric;
    }
  }
  return { version: empty.version, line: Math.max(0, Math.min(value.line!, count - 1)), completed: value.completed, segments };
}
export function saveLongformProgress(text: LongformText, progress: LongformProgress) { return write(progressKey(text), progress); }
/** Compare the expected line before recording: duplicate final/old-line submits are inert. */
export function completeLongformSegment(text: LongformText, line: number, metric: LongformProgress["segments"][string]) {
  const progress = loadLongformProgress(text);
  const count = segmentLongform(text.body, text.language).length;
  if (progress.completed || progress.line !== line || line < 0 || line >= count) return null;
  progress.segments[String(line)] = metric;
  progress.completed = line === count - 1;
  progress.line = progress.completed ? line : line + 1;
  saveLongformProgress(text, progress);
  return progress;
}
export function restartLongform(text: LongformText) {
  const progress: LongformProgress = { version: longformVersion(text), line: 0, completed: false, segments: {} };
  saveLongformProgress(text, progress);
  return progress;
}
export function setActiveLongform(id: string | null) { write(ACTIVE_KEY, id); }
export function getActiveLongform() {
  const id = read(ACTIVE_KEY);
  return typeof id === "string" && isLongformId(id) ? getLongformText(id) : undefined;
}
export function toScriptureItem(text: LongformText): ScriptureItem {
  return { id: text.id, kind: "long", title: text.title, source: "TypeNews original", body: segmentLongform(text.body, text.language).map((part) => part.text).join("\n"), media: { type: "none" }, createdAt: 0, updatedAt: 0 };
}
export function loadLongformLibrary() { return loadLongformTexts().map(toScriptureItem); }

export function summarizeLongformProgress(progress: LongformProgress) {
  const entries = Object.values(progress.segments);
  const characters = entries.reduce((sum, entry) => sum + entry.characters, 0);
  return {
    completedSegments: entries.length,
    characters,
    elapsedMs: entries.reduce((sum, entry) => sum + entry.elapsedMs, 0),
    accuracy: characters ? Math.round(entries.reduce((sum, entry) => sum + entry.accuracy * entry.characters, 0) / characters) : 100,
  };
}
