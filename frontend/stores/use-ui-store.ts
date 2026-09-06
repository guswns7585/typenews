"use client";

import { create } from "zustand";
import { persist } from "zustand/middleware";
import { assessMeshFrameHealth } from "@/lib/mesh-performance";
import { seoulMonthId } from "@/lib/month";

export type BackgroundTheme =
  | "default"
  | "sky"
  | "insta"
  | "sunset"
  | "forest"
  | "oceon"
  | "twilight"
  | "lagoon"
  | "custom-solid"
  | "custom-gradient";

export type CustomBackgroundPreset = {
  id: string;
  name: string;
  kind: "solid" | "gradient";
  colors: [string, string, string];
  textColor: string;
  buttonColor: string;
};

type LastRecord = {
  sentence: string;
  cpm: number;
  accuracy: number;
};

export type DockPlacement = "top" | "bottom" | "left" | "right";
export type TypingGroupPosition = {
  /** 브라우저 viewport 너비 기준 그룹 중심(0~1). */
  x: number;
  /** 브라우저 viewport 높이 기준 그룹 중심(0~1). */
  y: number;
};
export type TypingFrameRect = {
  /** stage 폭 기준 중심 오프셋. -0.1은 왼쪽으로 stage 폭의 10% 이동. */
  x: number;
  /** stage 높이 기준 상하 오프셋. */
  y: number;
  /** stage 폭 기준 카드 폭. */
  width: number;
  /** stage 높이 기준 카드 높이. */
  height: number;
};

type UiState = {
  background: BackgroundTheme;
  bgOptionsOpen: boolean;
  solidColor: string;
  gradientColors: [string, string, string];
  /* 단색 배경과 그라데이션 배경은 각자의 글자·버튼 색을 갖는다.
     배경이 완전히 다르므로 어울리는 색도 달라서, 원본 타입뉴스도 따로 저장한다. */
  customTextColor: string;
  customButtonBg: string;
  gradientTextColor: string;
  gradientButtonBg: string;
  customBackgroundPresets: CustomBackgroundPreset[];
  maxCpm: number;
  monthlyScore: number;
  /**
   * monthlyScore가 어느 달의 값인지 (`YYYYMM`, Asia/Seoul).
   *
   * 이 값이 없으면 8월 1일에 들어온 사용자가 7월 점수를 보게 된다. localStorage는
   * 달이 바뀌어도 스스로 비워지지 않는다. 로그인하면 서버 값이 덮지만
   * 비로그인 상태에서는 계속 지난달 숫자가 남는다.
   */
  scoreMonthId: string;
  lastRecord: LastRecord | null;
  logoClickCount: number;
  /** 로고를 5번 누르면 켜지는 타건음 모드. */
  soundMode: boolean;
  /** 타이핑 dock 위치. 화면에서 직접 끌어 옮긴다. */
  dockPlacement: DockPlacement;
  /** 기본 타이핑 화면에서 직접 움직인 카드 위치와 크기. */
  typingFrameRect: TypingFrameRect;
  /** 독과 타이핑 카드를 합친 그룹 중심. 브라우저 viewport 비율로 저장한다. */
  typingGroupPosition: TypingGroupPosition;
  /**
   * 배경 안개가 떠다닐지.
   *
   * 계정이 아니라 **이 브라우저에만** 저장한다. 성능 문제는 기기마다 다르다 —
   * 약한 노트북에서는 끄고 데스크톱에서는 켜두는 편이 자연스럽고,
   * 서버 환경설정에 넣으면 기기를 옮길 때마다 원치 않는 값이 따라온다.
   */
  backgroundMotion: boolean;
  setBackgroundMotion: (enabled: boolean) => void;
  setBackground: (background: BackgroundTheme) => void;
  setBgOptionsOpen: (open: boolean) => void;
  setSolidColor: (color: string) => void;
  setGradientColors: (colors: [string, string, string]) => void;
  setCustomTextColor: (color: string) => void;
  setCustomButtonBg: (color: string) => void;
  setGradientTextColor: (color: string) => void;
  setGradientButtonBg: (color: string) => void;
  saveCustomPreset: (name: string) => void;
  renameCustomPreset: (id: string, name: string) => void;
  overwriteCustomPreset: (id: string) => void;
  applyCustomPreset: (id: string) => void;
  deleteCustomPreset: (id: string) => void;
  /** earnedScore는 이번 문장으로 얻은 타수. 정확도 미달이면 0이다. */
  recordResult: (record: LastRecord, earnedScore?: number) => void;
  /**
   * 이 브라우저에 남은 기록을 지운다. 로그아웃할 때 호출한다.
   *
   * 기록은 localStorage에 남으므로, 지우지 않으면 로그아웃한 뒤에도 헤더에
   * 직전 계정의 최고 CPM·이번 달 점수·마지막 문장이 그대로 보인다.
   * 배경 같은 표시 설정은 계정과 무관하므로 건드리지 않는다.
   */
  resetRecords: () => void;
  bumpLogoClick: () => void;
  setDockPlacement: (placement: DockPlacement) => void;
  setTypingFrameRect: (rect: TypingFrameRect) => void;
  setTypingGroupPosition: (position: TypingGroupPosition) => void;
};

const BG_CLASS_PREFIX = "bg-";
const MESH_VAR_PREFIX = "--mesh-";
const MESH_COLOR_VARS = [
  "var(--fog-1, transparent)",
  "var(--fog-2, transparent)",
  "var(--fog-3, transparent)",
  "var(--fog-4, var(--fog-2, transparent))",
  "var(--fog-5, var(--fog-1, transparent))",
] as const;
const MESH_BLOB_COUNT = MESH_COLOR_VARS.length;

function rand(min: number, max: number) {
  return Math.round((min + Math.random() * (max - min)) * 10) / 10;
}

function shuffled<T>(items: readonly T[]) {
  const result = [...items];
  for (let index = result.length - 1; index > 0; index -= 1) {
    const swapIndex = Math.floor(Math.random() * (index + 1));
    [result[index], result[swapIndex]] = [result[swapIndex], result[index]];
  }
  return result;
}

/** 사용자가 끈 경우. 저사양 기기에서 배경 때문에 버벅이는 것을 피하려는 스위치다. */
let meshMotionAllowed = true;
type MeshRuntimeQuality = "full" | "lite" | "off";
let meshRuntimeQuality: MeshRuntimeQuality = "full";
let cancelMeshFrameCheck: (() => void) | undefined;

const MESH_FRAME_WARMUP_MS = 900;
const MESH_FRAME_SAMPLE_MS = 2_600;

function prefersReducedMotion() {
  if (typeof window === "undefined") return false;
  return window.matchMedia("(prefers-reduced-motion: reduce)").matches;
}

type NavigatorWithDeviceHints = Navigator & {
  deviceMemory?: number;
  connection?: { saveData?: boolean };
};

/** 브라우저가 공개하는 보수적인 신호만으로 두 번째 움직이는 레이어를 멈춘다. */
function prefersLightweightMesh() {
  if (typeof window === "undefined") return false;
  const navigatorWithHints = window.navigator as NavigatorWithDeviceHints;
  const physicalWidth = window.innerWidth * window.devicePixelRatio;
  const physicalHeight = window.innerHeight * window.devicePixelRatio;
  const denseLargeDisplay = Math.max(physicalWidth, physicalHeight) >= 2800;
  const lowMemory =
    typeof navigatorWithHints.deviceMemory === "number" && navigatorWithHints.deviceMemory <= 4;
  const fewCores = window.navigator.hardwareConcurrency > 0 && window.navigator.hardwareConcurrency <= 4;

  return (
    lowMemory ||
    fewCores ||
    denseLargeDisplay ||
    navigatorWithHints.connection?.saveData === true ||
    window.matchMedia("(update: slow)").matches
  );
}

function syncMeshMotionClasses(body: HTMLElement) {
  const motionOff =
    !meshMotionAllowed || prefersReducedMotion() || meshRuntimeQuality === "off";
  const lightweight =
    !motionOff && (prefersLightweightMesh() || meshRuntimeQuality === "lite");

  body.classList.toggle("mesh-motion-off", motionOff);
  body.classList.toggle("mesh-motion-lite", lightweight);
}

function stopMeshFrameCheck() {
  cancelMeshFrameCheck?.();
  cancelMeshFrameCheck = undefined;
}

/** 현재 기기에서 실제로 그려지는 프레임을 보고 메시 품질을 한 단계씩 낮춘다. */
function startMeshFrameCheck(body: HTMLElement) {
  stopMeshFrameCheck();
  if (
    typeof window === "undefined" ||
    !meshMotionAllowed ||
    prefersReducedMotion() ||
    meshRuntimeQuality === "off" ||
    !body.classList.contains("mesh-active")
  ) {
    return;
  }

  let cancelled = false;
  let animationFrame = 0;
  let visibilityInterrupted = document.visibilityState !== "visible";
  const onVisibilityChange = () => {
    if (document.visibilityState !== "visible") visibilityInterrupted = true;
  };
  document.addEventListener("visibilitychange", onVisibilityChange);
  const finish = () => {
    document.removeEventListener("visibilitychange", onVisibilityChange);
    cancelMeshFrameCheck = undefined;
  };

  const measure = () => {
    let stageStartedAt: number | undefined;
    let previousFrameAt: number | undefined;
    const intervals: number[] = [];

    const frame = (now: number) => {
      if (cancelled) return;

      /* 백그라운드 탭의 rAF는 강하게 제한된다. 복귀 직후의 긴 간격을 기기 성능으로
         오판하지 않도록, 보이지 않는 동안의 표본은 전부 버리고 다시 예열한다. */
      if (document.visibilityState !== "visible" || visibilityInterrupted) {
        stageStartedAt = undefined;
        previousFrameAt = undefined;
        intervals.length = 0;
        if (document.visibilityState === "visible") visibilityInterrupted = false;
        animationFrame = window.requestAnimationFrame(frame);
        return;
      }

      if (stageStartedAt === undefined) {
        stageStartedAt = now;
        previousFrameAt = now;
        animationFrame = window.requestAnimationFrame(frame);
        return;
      }

      const elapsed = now - stageStartedAt;
      if (elapsed >= MESH_FRAME_WARMUP_MS && previousFrameAt !== undefined) {
        intervals.push(now - previousFrameAt);
      }
      previousFrameAt = now;

      if (elapsed < MESH_FRAME_WARMUP_MS + MESH_FRAME_SAMPLE_MS) {
        animationFrame = window.requestAnimationFrame(frame);
        return;
      }

      const health = assessMeshFrameHealth(intervals);
      if (!health.slow) {
        finish();
        return;
      }

      const alreadyLightweight = prefersLightweightMesh() || meshRuntimeQuality === "lite";
      meshRuntimeQuality = alreadyLightweight ? "off" : "lite";
      syncMeshMotionClasses(body);

      /* 5개에서 2개로 줄인 뒤에도 느린지 한 번 더 재서, 필요한 기기에서만 완전히
         정지한다. 정지 상태에서는 더 이상 프레임 검사를 돌리지 않는다. */
      if (meshRuntimeQuality === "lite") measure();
      else finish();
    };

    animationFrame = window.requestAnimationFrame(frame);
  };

  cancelMeshFrameCheck = () => {
    cancelled = true;
    window.cancelAnimationFrame(animationFrame);
    document.removeEventListener("visibilitychange", onVisibilityChange);
  };
  measure();
}

/**
 * 안개를 떠다니게 한다.
 *
 * ⚠️ **위치·크기를 주기적으로 바꾸는 방식으로 되돌리지 말 것.**
 *    예전에는 몇십 초마다 background-position·background-size를 새로 뽑아
 *    9.2초에 걸쳐 전환했다. 그 둘은 GPU가 합성만 하면 되는 속성이 아니라
 *    **페인트 속성**이라, 전환이 도는 동안 레이어를 매 프레임 다시 그린다.
 *    그 레이어는 화면보다 크고 blur까지 걸려 있어서, 전체 화면 블러를 초당 60번
 *    다시 계산하는 꼴이었다. backdrop-filter를 쓰는 요소들도 뒤가 계속 바뀌니
 *    함께 다시 블러됐다. 저사양 기기에서 렉이 심하다는 제보의 원인이다.
 *
 * 지금은 다섯 개의 작은 색 레이어를 한 번만 래스터화하고, 각 레이어를 서로 다른
 * transform 키프레임으로 옮긴다. 색·위치·크기·진행 시점은 배경을 적용할 때 한 번만
 * 섞으므로 색이 독립적으로 떠다녀도 매 프레임 페인트하지 않는다.
 */
function startMeshMotion(body: HTMLElement) {
  if (typeof window === "undefined") return;
  syncMeshMotionClasses(body);
  startMeshFrameCheck(body);
}

/**
 * 배경 움직임을 켜고 끈다.
 *
 * 끄면 지금 위치에서 멈춘다. 안개 자체는 그대로 보이고 떠다니지만 않는다.
 * (각 색 레이어의 transform 애니메이션은 CSS에서 한꺼번에 끈다.)
 */
export function setMeshMotionAllowed(allowed: boolean) {
  const wasAllowed = meshMotionAllowed;
  meshMotionAllowed = allowed;
  if (typeof document === "undefined") return;

  if (!allowed) {
    stopMeshFrameCheck();
  } else if (!wasAllowed) {
    /* 사용자가 직접 다시 켰다면 이전 자동 정지 판정을 초기화하고 재측정한다. */
    meshRuntimeQuality = "full";
  }

  syncMeshMotionClasses(document.body);
  if (allowed && !wasAllowed) startMeshFrameCheck(document.body);
}

/**
 * OS의 "동작 줄이기"를 켜고 끄는 것을 바로 반영한다.
 *
 * 예전에는 시작할 때 한 번만 확인해서, 페이지를 열어둔 채 설정을 바꾸면
 * 다음 새로고침까지 그대로 돌았다.
 */
export function watchReducedMotion() {
  if (typeof window === "undefined") return undefined;
  const query = window.matchMedia("(prefers-reduced-motion: reduce)");
  const onChange = () => {
    syncMeshMotionClasses(document.body);
    if (query.matches) stopMeshFrameCheck();
    else startMeshFrameCheck(document.body);
  };
  query.addEventListener("change", onChange);
  return () => query.removeEventListener("change", onChange);
}

function clearMeshVariables(body: HTMLElement) {
  for (let index = body.style.length - 1; index >= 0; index -= 1) {
    const property = body.style.item(index);
    if (property.startsWith(MESH_VAR_PREFIX)) body.style.removeProperty(property);
  }
}

function randomizeMeshVariables(body: HTMLElement) {
  clearMeshVariables(body);

  const blendColors = shuffled(MESH_COLOR_VARS);
  const blobColors = shuffled(MESH_COLOR_VARS);

  body.style.setProperty("--mesh-base-angle", `${rand(112, 156)}deg`);
  blendColors.slice(0, 3).forEach((color, index) => {
    body.style.setProperty(`--mesh-base-blend-${index + 1}`, color);
  });

  for (let index = 0; index < MESH_BLOB_COUNT; index += 1) {
    const number = index + 1;
    body.style.setProperty(`--mesh-blob-color-${number}`, blobColors[index]);
    body.style.setProperty(`--mesh-blob-x-${number}`, `${rand(12, 88)}%`);
    body.style.setProperty(`--mesh-blob-y-${number}`, `${rand(10, 90)}%`);
    body.style.setProperty(`--mesh-blob-width-${number}`, `${rand(42, 60)}vmax`);
    body.style.setProperty(`--mesh-blob-height-${number}`, `${rand(36, 54)}vmax`);
    body.style.setProperty(`--mesh-blob-duration-${number}`, `${rand(17, 26)}s`);
    body.style.setProperty(`--mesh-blob-delay-${number}`, `${rand(-22, -1)}s`);
  }
}

function hexToRgba(hex: string, alpha: number) {
  const value = hex.replace(/^#/, "");
  const full = value.length === 3 ? [...value].map((c) => c + c).join("") : value;
  const int = Number.parseInt(full, 16);
  if (!Number.isFinite(int)) return hex;
  return `rgba(${(int >> 16) & 255}, ${(int >> 8) & 255}, ${int & 255}, ${alpha})`;
}

function newPresetId() {
  return typeof crypto !== "undefined" && "randomUUID" in crypto
    ? crypto.randomUUID()
    : `preset-${Date.now()}-${Math.random().toString(16).slice(2)}`;
}

const CUSTOM_COLOR_VARS = [
  "--color-ink",
  "--color-ink-muted-80",
  "--color-ink-muted-48",
  "--typenews-button",
  "--svg-black",
  "--svg-type",
  "--svg-gray",
] as const;

/**
 * 커스텀 배경에서 글자색·버튼색을 문서 전체에 먹인다.
 *
 * 원본 타입뉴스는 `body * { color: X !important }` 스타일 태그를 주입했지만,
 * 여기서는 CSS 변수만 갈아끼운다. !important 없이 같은 효과를 내고,
 * 되돌릴 때도 변수만 지우면 된다.
 *
 * 로고는 인라인 SVG라 --svg-* 를 통해 같이 물든다.
 * 진한 부분은 글자색, "News" 부분은 버튼색을 따라간다.
 */
function applyCustomColors(body: HTMLElement, textColor: string, buttonColor: string) {
  body.style.setProperty("--color-ink", textColor);
  body.style.setProperty("--color-ink-muted-80", hexToRgba(textColor, 0.8));
  body.style.setProperty("--color-ink-muted-48", hexToRgba(textColor, 0.6));
  body.style.setProperty("--typenews-button", hexToRgba(buttonColor, 0.8));
  body.style.setProperty("--svg-black", textColor);
  body.style.setProperty("--svg-type", textColor);
  body.style.setProperty("--svg-gray", buttonColor);
}

function clearCustomColors(body: HTMLElement) {
  CUSTOM_COLOR_VARS.forEach((name) => body.style.removeProperty(name));
}

/** 다크·문서형 테마는 사용자가 고른 배경을 잊지 않고 잠시 화면에서만 치운다. */
export function prepareStaticThemeBody() {
  if (typeof document === "undefined") return undefined;
  stopMeshFrameCheck();
  const { body } = document;
  body.classList.remove("mesh-active", "mesh-motion-lite");
  body.classList.add("mesh-motion-off");
  [...body.classList]
    .filter((name) => name.startsWith(BG_CLASS_PREFIX))
    .forEach((name) => body.classList.remove(name));
  body.style.background = "";
  body.style.removeProperty("--c1");
  body.style.removeProperty("--c2");
  body.style.removeProperty("--c3");
  clearMeshVariables(body);
  clearCustomColors(body);
  return () => body.classList.remove("mesh-active", "mesh-motion-lite");
}

export type CustomColors = {
  solidColor: string;
  gradientColors: [string, string, string];
  customTextColor: string;
  customButtonBg: string;
  gradientTextColor: string;
  gradientButtonBg: string;
};

export function applyBackgroundToBody(background: BackgroundTheme, colors: CustomColors) {
  if (typeof document === "undefined") return undefined;
  const { body } = document;
  body.classList.remove("mesh-active", "mesh-motion-lite");
  [...body.classList]
    .filter((name) => name.startsWith(BG_CLASS_PREFIX))
    .forEach((name) => body.classList.remove(name));

  body.classList.add(`bg-${background}`);
  body.style.background = "";
  body.style.removeProperty("--c1");
  body.style.removeProperty("--c2");
  body.style.removeProperty("--c3");
  clearMeshVariables(body);
  clearCustomColors(body);

  if (background === "custom-solid") {
    body.style.background = colors.solidColor;
    applyCustomColors(body, colors.customTextColor, colors.customButtonBg);
    body.classList.add("mesh-motion-off");
    return () => body.classList.remove("mesh-active", "mesh-motion-lite");
  }
  if (background === "custom-gradient") {
    body.style.setProperty("--c1", colors.gradientColors[0]);
    body.style.setProperty("--c2", colors.gradientColors[1]);
    body.style.setProperty("--c3", colors.gradientColors[2]);
    applyCustomColors(body, colors.gradientTextColor, colors.gradientButtonBg);
  }

  body.classList.add("mesh-active");
  randomizeMeshVariables(body);
  startMeshMotion(body);
  return () => {
    stopMeshFrameCheck();
    body.classList.remove("mesh-active", "mesh-motion-lite");
  };
}

export const useUiStore = create<UiState>()(
  persist(
    (set) => ({
      background: "insta",
      bgOptionsOpen: false,
      solidColor: "#f1f1f1",
      gradientColors: ["#ff8b8b", "#f6b18c", "#f7d0df"],
      customTextColor: "#222222",
      customButtonBg: "#e6e6e6",
      gradientTextColor: "#2a2529",
      gradientButtonBg: "#f0e2dd",
      customBackgroundPresets: [],
      maxCpm: 0,
      monthlyScore: 0,
      scoreMonthId: "",
      lastRecord: null,
      logoClickCount: 0,
      soundMode: false,
      dockPlacement: "top",
      typingFrameRect: { x: 0, y: 0, width: 0.78, height: 0.48 },
      typingGroupPosition: { x: 0.5, y: 0.52 },
      backgroundMotion: true,
      setBackground: (background) => set({ background, bgOptionsOpen: false }),
      setBgOptionsOpen: (bgOptionsOpen) => set({ bgOptionsOpen }),
      setSolidColor: (solidColor) => set({ solidColor }),
      setGradientColors: (gradientColors) => set({ gradientColors }),
      setCustomTextColor: (customTextColor) => set({ customTextColor }),
      setCustomButtonBg: (customButtonBg) => set({ customButtonBg }),
      setGradientTextColor: (gradientTextColor) => set({ gradientTextColor }),
      setGradientButtonBg: (gradientButtonBg) => set({ gradientButtonBg }),
      saveCustomPreset: (name) =>
        set((state) => {
          const trimmed = name.trim().slice(0, 20);
          if (!trimmed || !state.background.startsWith("custom-")) return state;
          const gradient = state.background === "custom-gradient";
          const preset: CustomBackgroundPreset = {
            id: newPresetId(),
            name: trimmed,
            kind: gradient ? "gradient" : "solid",
            colors: gradient
              ? [...state.gradientColors]
              : [state.solidColor, state.solidColor, state.solidColor],
            textColor: gradient ? state.gradientTextColor : state.customTextColor,
            buttonColor: gradient ? state.gradientButtonBg : state.customButtonBg,
          };
          return {
            customBackgroundPresets: [...state.customBackgroundPresets, preset].slice(-12),
          };
        }),
      renameCustomPreset: (id, name) =>
        set((state) => {
          const trimmed = name.trim().slice(0, 20);
          if (!trimmed) return state;
          return {
            customBackgroundPresets: state.customBackgroundPresets.map((preset) =>
              preset.id === id ? { ...preset, name: trimmed } : preset,
            ),
          };
        }),
      overwriteCustomPreset: (id) =>
        set((state) => ({
          customBackgroundPresets: state.customBackgroundPresets.map((preset) => {
            if (preset.id !== id) return preset;
            const gradient = state.background === "custom-gradient";
            const solid = state.background === "custom-solid";
            if (!gradient && !solid) return preset;
            return {
              ...preset,
              kind: gradient ? "gradient" : "solid",
              colors: gradient
                ? [...state.gradientColors]
                : [state.solidColor, state.solidColor, state.solidColor],
              textColor: gradient ? state.gradientTextColor : state.customTextColor,
              buttonColor: gradient ? state.gradientButtonBg : state.customButtonBg,
            };
          }),
        })),
      applyCustomPreset: (id) =>
        set((state) => {
          const preset = state.customBackgroundPresets.find((item) => item.id === id);
          if (!preset) return state;
          if (preset.kind === "gradient") {
            return {
              background: "custom-gradient",
              gradientColors: [...preset.colors],
              gradientTextColor: preset.textColor,
              gradientButtonBg: preset.buttonColor,
            };
          }
          return {
            background: "custom-solid",
            solidColor: preset.colors[0],
            customTextColor: preset.textColor,
            customButtonBg: preset.buttonColor,
          };
        }),
      deleteCustomPreset: (id) =>
        set((state) => ({
          customBackgroundPresets: state.customBackgroundPresets.filter(
            (preset) => preset.id !== id,
          ),
        })),
      recordResult: (record, earnedScore = 0) =>
        set((state) => {
          // 달이 넘어갔으면 0부터 다시 센다. 서버도 새 달로 적립한다.
          const month = seoulMonthId();
          const carried = state.scoreMonthId === month ? state.monthlyScore : 0;
          return {
            lastRecord: record,
            maxCpm: Math.max(state.maxCpm, record.cpm),
            monthlyScore: carried + earnedScore,
            scoreMonthId: month,
          };
        }),
      resetRecords: () =>
        set({ maxCpm: 0, monthlyScore: 0, scoreMonthId: "", lastRecord: null }),
      bumpLogoClick: () =>
        set((state) => {
          const next = state.logoClickCount + 1;
          if (next < 5) return { logoClickCount: next };
          return { logoClickCount: 0, soundMode: !state.soundMode };
        }),
      setDockPlacement: (dockPlacement) => set({ dockPlacement }),
      setTypingFrameRect: (typingFrameRect) => set({ typingFrameRect }),
      setTypingGroupPosition: (typingGroupPosition) => set({ typingGroupPosition }),
      setBackgroundMotion: (enabled) => {
        setMeshMotionAllowed(enabled);
        set({ backgroundMotion: enabled });
      },
    }),
    {
      name: "typenews-ui-v1",
      partialize: (state) => ({
        background: state.background,
        solidColor: state.solidColor,
        gradientColors: state.gradientColors,
        customTextColor: state.customTextColor,
        customButtonBg: state.customButtonBg,
        gradientTextColor: state.gradientTextColor,
        gradientButtonBg: state.gradientButtonBg,
        customBackgroundPresets: state.customBackgroundPresets,
        maxCpm: state.maxCpm,
        monthlyScore: state.monthlyScore,
        scoreMonthId: state.scoreMonthId,
        soundMode: state.soundMode,
        dockPlacement: state.dockPlacement,
        typingFrameRect: state.typingFrameRect,
        typingGroupPosition: state.typingGroupPosition,
        backgroundMotion: state.backgroundMotion,
      }),
    },
  ),
);
