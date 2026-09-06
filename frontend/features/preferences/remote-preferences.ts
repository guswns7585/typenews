import type {
  Language,
  FontFamily,
  NewsBodyAmount,
  NewsSector,
  NewsTypingTarget,
  TypingMode,
  UiLocale,
  VisualTheme,
} from "@/lib/types";
import { FONT_FAMILIES } from "@/lib/font-options";
import { getSupabaseClient } from "@/lib/supabase/client";
import { useSettingsStore } from "@/stores/use-settings-store";
import { useTypingStore } from "@/stores/use-typing-store";
import {
  useUiStore,
  type BackgroundTheme,
  type CustomBackgroundPreset,
} from "@/stores/use-ui-store";

export type RemotePreferences = {
  uiLocale: UiLocale;
  visualTheme: VisualTheme;
  background: BackgroundTheme;
  solidColor: string;
  gradientColors: [string, string, string];
  customTextColor: string;
  customButtonBg: string;
  gradientTextColor: string;
  gradientButtonBg: string;
  customBackgroundPresets: CustomBackgroundPreset[];
  language: Language;
  mode: TypingMode;
  /** 옛 단수 키. 0018 이전 클라이언트와 호환을 위해 계속 보낸다. */
  newsSector: NewsSector;
  newsSectors: NewsSector[];
  /** 밈 문장만 뽑는 필터. 별도 모드가 아니라서 mode와 함께 저장해야 복원된다. */
  memeOnly: boolean;
  newsTypingTarget: NewsTypingTarget;
  newsBodyAmount: NewsBodyAmount;
  fontFamily: FontFamily;
  fontSize: number;
  overlayMode: boolean;
  highlightWeakWords: boolean;
  soundMode: boolean;
  ignorePunctuation: boolean;
  ignoreNumbers: boolean;
  ignoreEnglish: boolean;
  ignoreSymbols: boolean;
  ignoreStreaming: boolean;
};

const BACKGROUNDS: BackgroundTheme[] = [
  "default",
  "sky",
  "insta",
  "sunset",
  "forest",
  "oceon",
  "twilight",
  "lagoon",
  "custom-solid",
  "custom-gradient",
];
const LANGUAGES: Language[] = ["kor", "eng"];
const MODES: TypingMode[] = ["short", "long", "word", "news"];
const SECTORS: NewsSector[] = [
  "all",
  "main",
  "politics",
  "economy",
  "society",
  "global",
  "culture",
  "entertainment",
  "sports",
];
const NEWS_TARGETS: NewsTypingTarget[] = ["title", "body"];
const NEWS_AMOUNTS: NewsBodyAmount[] = ["small", "medium", "large"];
const UI_LOCALES: UiLocale[] = ["ko", "en"];
const VISUAL_THEMES: VisualTheme[] = [
  "classic",
  "dark",
  "spreadsheet",
  "vscode",
  "terminal",
  "codex",
  "claude",
  "claude-code",
];

const HEX = /^#[0-9a-fA-F]{6}$/;

/** 현재 스토어 상태를 서버로 보낼 형태로 모은다. */
export function collectPreferences(): RemotePreferences {
  const ui = useUiStore.getState();
  const typing = useTypingStore.getState();
  const settings = useSettingsStore.getState();

  return {
    uiLocale: settings.uiLocale,
    visualTheme: settings.visualTheme,
    background: ui.background,
    solidColor: ui.solidColor,
    gradientColors: ui.gradientColors,
    customTextColor: ui.customTextColor,
    customButtonBg: ui.customButtonBg,
    gradientTextColor: ui.gradientTextColor,
    gradientButtonBg: ui.gradientButtonBg,
    customBackgroundPresets: ui.customBackgroundPresets,
    language: typing.language,
    mode: typing.mode,
    /* 옛 키에는 첫 번째 카테고리를 넣는다. 배포 전 클라이언트가 이 값을 읽어도
       최소한 하나는 맞게 복원된다. */
    newsSector: typing.newsSectors[0] ?? "all",
    newsSectors: typing.newsSectors,
    memeOnly: typing.memeOnly,
    newsTypingTarget: settings.newsTypingTarget,
    newsBodyAmount: settings.newsBodyAmount,
    fontFamily: settings.fontFamily,
    fontSize: settings.fontSize,
    overlayMode: settings.overlayMode,
    highlightWeakWords: settings.highlightWeakWords,
    soundMode: ui.soundMode,
    ignorePunctuation: settings.ignorePunctuation,
    ignoreNumbers: settings.ignoreNumbers,
    ignoreEnglish: settings.ignoreEnglish,
    ignoreSymbols: settings.ignoreSymbols,
    ignoreStreaming: settings.ignoreStreaming,
  };
}

function pickOne<T extends string>(value: unknown, allowed: T[]): T | undefined {
  return typeof value === "string" && (allowed as string[]).includes(value) ? (value as T) : undefined;
}

function pickHex(value: unknown) {
  return typeof value === "string" && HEX.test(value) ? value : undefined;
}

function pickBoolean(value: unknown) {
  return typeof value === "boolean" ? value : undefined;
}

function pickGradient(value: unknown): [string, string, string] | undefined {
  if (!Array.isArray(value) || value.length !== 3) return undefined;
  const colors = value.map(pickHex);
  return colors.every((color): color is string => Boolean(color))
    ? [colors[0], colors[1], colors[2]]
    : undefined;
}

function pickCustomBackgroundPresets(value: unknown): CustomBackgroundPreset[] | undefined {
  if (!Array.isArray(value)) return undefined;
  const seen = new Set<string>();
  const presets: CustomBackgroundPreset[] = [];

  for (const item of value.slice(0, 12)) {
    if (!item || typeof item !== "object") continue;
    const source = item as Record<string, unknown>;
    const id = typeof source.id === "string" ? source.id.slice(0, 64) : "";
    const name = typeof source.name === "string" ? source.name.trim().slice(0, 20) : "";
    const kind = pickOne(source.kind, ["solid", "gradient"] as const);
    const colors = pickGradient(source.colors);
    const textColor = pickHex(source.textColor);
    const buttonColor = pickHex(source.buttonColor);
    if (!id || seen.has(id) || !name || !kind || !colors || !textColor || !buttonColor) continue;
    seen.add(id);
    presets.push({ id, name, kind, colors, textColor, buttonColor });
  }

  return presets;
}

/**
 * 서버에서 받은 값을 스토어에 적용한다.
 *
 * 서버 값은 신뢰하지 않고 클라이언트에서도 한 번 더 거른다. 유효하지 않은 항목은
 * 통째로 무시하고 현재 값을 유지한다. 일부만 저장된 오래된 레코드도 안전하게 다뤄진다.
 */
export function applyPreferences(raw: unknown) {
  if (!raw || typeof raw !== "object") return;
  const source = raw as Record<string, unknown>;

  const background = pickOne(source.background, BACKGROUNDS);
  const solidColor = pickHex(source.solidColor);
  const gradientColors = pickGradient(source.gradientColors);
  const customTextColor = pickHex(source.customTextColor);
  const customButtonBg = pickHex(source.customButtonBg);
  const gradientTextColor = pickHex(source.gradientTextColor);
  const gradientButtonBg = pickHex(source.gradientButtonBg);
  const customBackgroundPresets = pickCustomBackgroundPresets(source.customBackgroundPresets);
  const soundMode = pickBoolean(source.soundMode);

  const ui = useUiStore.getState();
  if (solidColor) ui.setSolidColor(solidColor);
  if (gradientColors) ui.setGradientColors(gradientColors);
  if (customTextColor) ui.setCustomTextColor(customTextColor);
  if (customButtonBg) ui.setCustomButtonBg(customButtonBg);
  if (gradientTextColor) ui.setGradientTextColor(gradientTextColor);
  if (gradientButtonBg) ui.setGradientButtonBg(gradientButtonBg);
  if (customBackgroundPresets) useUiStore.setState({ customBackgroundPresets });
  // 배경은 색상보다 나중에 적용해야 커스텀 배경이 옛 색으로 한 번 깜빡이지 않는다.
  if (background) ui.setBackground(background);
  if (soundMode !== undefined && soundMode !== ui.soundMode) useUiStore.setState({ soundMode });

  const settingsPatch: Record<string, unknown> = {};
  const uiLocale = pickOne(source.uiLocale, UI_LOCALES);
  if (uiLocale) settingsPatch.uiLocale = uiLocale;
  const visualTheme = pickOne(source.visualTheme, VISUAL_THEMES);
  if (visualTheme) settingsPatch.visualTheme = visualTheme;
  const fontSize = typeof source.fontSize === "number" ? source.fontSize : undefined;
  if (fontSize !== undefined && fontSize >= 12 && fontSize <= 80) settingsPatch.fontSize = fontSize;
  const fontFamily = pickOne(source.fontFamily, FONT_FAMILIES);
  const newsTypingTarget = pickOne(source.newsTypingTarget, NEWS_TARGETS);
  const newsBodyAmount = pickOne(source.newsBodyAmount, NEWS_AMOUNTS);
  if (newsTypingTarget) settingsPatch.newsTypingTarget = newsTypingTarget;
  if (newsBodyAmount) settingsPatch.newsBodyAmount = newsBodyAmount;
  if (fontFamily) settingsPatch.fontFamily = fontFamily;
  for (const key of [
    "overlayMode",
    "highlightWeakWords",
    "ignorePunctuation",
    "ignoreNumbers",
    "ignoreEnglish",
    "ignoreSymbols",
    "ignoreStreaming",
  ] as const) {
    const value = pickBoolean(source[key]);
    if (value !== undefined) settingsPatch[key] = value;
  }
  if (Object.keys(settingsPatch).length) {
    useSettingsStore.getState().update(settingsPatch);
  }

  const language = pickOne(source.language, LANGUAGES);
  const mode = pickOne(source.mode, MODES);

  /* 새 배열 키를 먼저 본다. 없으면 옛 단수 키를 배열로 올려준다.
     0018 적용 전에 저장된 프로필이나, 예전 클라이언트가 마지막으로 저장한
     레코드가 여기로 들어온다. */
  const fromArray = Array.isArray(source.newsSectors)
    ? (source.newsSectors.filter(
        (item): item is NewsSector =>
          typeof item === "string" && (SECTORS as string[]).includes(item),
      ) as NewsSector[])
    : [];
  const legacy = pickOne(source.newsSector, SECTORS);
  const newsSectors = fromArray.length ? fromArray : legacy ? [legacy] : undefined;

  const typing = useTypingStore.getState();
  const sectorsChanged =
    newsSectors !== undefined &&
    (newsSectors.length !== typing.newsSectors.length ||
      newsSectors.some((sector) => !typing.newsSectors.includes(sector)));

  /* 밈은 별도 모드가 아니라 단문의 필터라, mode만으로는 복원되지 않는다.
     값이 없으면(구버전 프로필) 꺼진 것으로 본다. */
  const memeOnly = pickBoolean(source.memeOnly) ?? false;
  const memeChanged = memeOnly !== typing.memeOnly;

  if (
    (language && language !== typing.language) ||
    (mode && mode !== typing.mode) ||
    memeChanged
  ) {
    typing.setMode(
      language ?? typing.language,
      mode ?? typing.mode,
      newsSectors ?? typing.newsSectors,
      memeOnly,
    );
  } else if (sectorsChanged) {
    typing.setMode(typing.language, typing.mode, newsSectors, typing.memeOnly);
  }
}

export async function loadRemotePreferences() {
  const supabase = getSupabaseClient();
  if (!supabase) return null;

  const { data, error } = await supabase.from("profiles").select("preferences").maybeSingle();
  if (error) {
    console.error("환경설정 불러오기 실패", error);
    return null;
  }
  return data?.preferences ?? null;
}

export async function saveRemotePreferences(preferences: RemotePreferences) {
  const supabase = getSupabaseClient();
  if (!supabase) return;

  const { error } = await supabase.rpc("save_my_preferences", { p_preferences: preferences });
  if (error) console.error("환경설정 저장 실패", error);
}
