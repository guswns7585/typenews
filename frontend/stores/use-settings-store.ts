"use client";

import { create } from "zustand";
import { persist } from "zustand/middleware";
import type { TypingSettings } from "@/lib/types";

type SettingsState = TypingSettings & {
  update: (settings: Partial<TypingSettings>) => void;
};

export const useSettingsStore = create<SettingsState>()(
  persist(
    (set) => ({
      ignorePunctuation: false,
      ignoreNumbers: false,
      ignoreEnglish: false,
      ignoreSymbols: false,
      ignoreStreaming: false,
      fontSize: 28,
      overlayMode: true,
      update: (settings) => set(settings),
    }),
    { name: "typenews-settings-v2" },
  ),
);
