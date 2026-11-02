import type { ShowcaseBuildInfo } from "./types";

export type KeyxifPreset = {
  name: string;
  build: ShowcaseBuildInfo;
  snapshot: Record<string, string>;
};

function record(value: unknown): Record<string, unknown> | null {
  return value !== null && typeof value === "object" && !Array.isArray(value) ? value as Record<string, unknown> : null;
}

function cleanText(value: unknown) {
  return typeof value === "string" ? value.trim().slice(0, 240) : "";
}

function toPreset(value: unknown, fallbackName = "KeyXIF 빌드"): KeyxifPreset | null {
  const source = record(value);
  if (!source) return null;
  const info = record(source.buildInfo) ?? source;
  const snapshot = {
    housing: cleanText(info.housing),
    switchName: cleanText(info.switchName),
    plate: cleanText(info.plate),
    mount: cleanText(info.mount),
    keycap: cleanText(info.keycap),
    nickname: cleanText(info.nickname),
  };
  if (!Object.values(snapshot).some(Boolean)) return null;
  return {
    name: cleanText(source.presetName) || snapshot.housing || fallbackName,
    build: {
      case: snapshot.housing,
      switches: snapshot.switchName,
      plate: snapshot.plate,
      mounting: snapshot.mount,
      keycaps: snapshot.keycap,
    },
    snapshot,
  };
}

export function parseKeyxifJson(raw: string): KeyxifPreset[] {
  if (raw.length > 1_000_000) throw new Error("KeyXIF JSON은 1MB 이하여야 합니다.");
  let parsed: unknown;
  try { parsed = JSON.parse(raw); } catch { throw new Error("올바른 KeyXIF JSON 파일이 아닙니다."); }
  const root = record(parsed);
  if (!root) throw new Error("KeyXIF 빌드 정보를 찾지 못했습니다.");
  const candidates = Array.isArray(root.buildPresets) ? root.buildPresets.slice(0, 100) : [root];
  const presets = candidates.map((value, index) => toPreset(value, `KeyXIF 빌드 ${index + 1}`)).filter((value): value is KeyxifPreset => Boolean(value));
  if (!presets.length) throw new Error("KeyXIF 빌드 정보를 찾지 못했습니다.");
  return presets;
}
