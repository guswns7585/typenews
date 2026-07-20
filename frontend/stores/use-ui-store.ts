"use client";

import { create } from "zustand";
import { persist } from "zustand/middleware";

export type BackgroundTheme =
  | "default"
  | "sky"
  | "insta"
  | "sunset"
  | "forest"
  | "oceon"
  | "twilight"
  | "custom-solid"
  | "custom-gradient";

type LastRecord = {
  sentence: string;
  cpm: number;
  accuracy: number;
};

type UiState = {
  background: BackgroundTheme;
  bgOptionsOpen: boolean;
  solidColor: string;
  gradientColors: [string, string, string];
  customTextColor: string;
  customButtonBg: string;
  maxCpm: number;
  monthlyScore: number;
  lastRecord: LastRecord | null;
  logoClickCount: number;
  setBackground: (background: BackgroundTheme) => void;
  setBgOptionsOpen: (open: boolean) => void;
  setSolidColor: (color: string) => void;
  setGradientColors: (colors: [string, string, string]) => void;
  setCustomTextColor: (color: string) => void;
  setCustomButtonBg: (color: string) => void;
  recordResult: (record: LastRecord) => void;
  bumpLogoClick: () => void;
};

const BG_CLASS_PREFIX = "bg-";

export function applyBackgroundToBody(
  background: BackgroundTheme,
  solidColor: string,
  gradientColors: [string, string, string],
) {
  if (typeof document === "undefined") return;
  const { body } = document;
  [...body.classList]
    .filter((name) => name.startsWith(BG_CLASS_PREFIX))
    .forEach((name) => body.classList.remove(name));

  body.classList.add(`bg-${background}`);
  body.style.background = "";
  body.style.removeProperty("--c1");
  body.style.removeProperty("--c2");
  body.style.removeProperty("--c3");

  if (background === "custom-solid") {
    body.style.background = solidColor;
  }
  if (background === "custom-gradient") {
    body.style.setProperty("--c1", gradientColors[0]);
    body.style.setProperty("--c2", gradientColors[1]);
    body.style.setProperty("--c3", gradientColors[2]);
  }
}

export const useUiStore = create<UiState>()(
  persist(
    (set) => ({
      background: "default",
      bgOptionsOpen: false,
      solidColor: "#f1f1f1",
      gradientColors: ["#ffffff", "#cccccc", "#999999"],
      customTextColor: "#222222",
      customButtonBg: "#e6e6e6",
      maxCpm: 0,
      monthlyScore: 0,
      lastRecord: null,
      logoClickCount: 0,
      setBackground: (background) => set({ background, bgOptionsOpen: false }),
      setBgOptionsOpen: (bgOptionsOpen) => set({ bgOptionsOpen }),
      setSolidColor: (solidColor) => set({ solidColor }),
      setGradientColors: (gradientColors) => set({ gradientColors }),
      setCustomTextColor: (customTextColor) => set({ customTextColor }),
      setCustomButtonBg: (customButtonBg) => set({ customButtonBg }),
      recordResult: (record) =>
        set((state) => ({
          lastRecord: record,
          maxCpm: Math.max(state.maxCpm, record.cpm),
          monthlyScore: state.monthlyScore + (record.accuracy >= 80 ? 1 : 0),
        })),
      bumpLogoClick: () => set((state) => ({ logoClickCount: state.logoClickCount + 1 })),
    }),
    {
      name: "typenews-ui-v1",
      partialize: (state) => ({
        background: state.background,
        solidColor: state.solidColor,
        gradientColors: state.gradientColors,
        customTextColor: state.customTextColor,
        customButtonBg: state.customButtonBg,
        maxCpm: state.maxCpm,
        monthlyScore: state.monthlyScore,
      }),
    },
  ),
);
