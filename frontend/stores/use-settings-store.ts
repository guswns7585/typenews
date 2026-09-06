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
      uiLocale: "ko",
      visualTheme: "classic",
      ignorePunctuation: false,
      ignoreNumbers: false,
      ignoreEnglish: false,
      ignoreSymbols: false,
      /* kor.json은 밈이 섞인 문장 묶음, kor_stream.json은 밈이 빠진 묶음이다.
         밈은 모두가 아는 것도 아니고 민감한 것도 있어 기본은 밈 없는 쪽으로 둔다.
         (M 버튼을 끄면 밈 포함 묶음으로 바뀐다) */
      ignoreStreaming: true,
      newsTypingTarget: "body",
      newsBodyAmount: "medium",
      fontFamily: "pretendard-jp",
      fontSize: 28,
      overlayMode: true,
      highlightWeakWords: true,
      update: (settings) => set(settings),
    }),
    {
      name: "typenews-settings-v2",
      version: 4,
      /* 밈 없는 문장을 기본으로 바꾸면서, 이미 설정이 저장된 사용자에게도 한 번만
         적용한다. 저장소 이름을 갈면 배경·글자 크기까지 전부 초기화되므로
         이 항목만 밀어준다. */
      migrate: (persisted, version) => {
        const state = (persisted ?? {}) as Partial<TypingSettings>;
        if (version < 1) return { ...state, ignoreStreaming: true, visualTheme: "classic" };
        if (version < 2) return { ...state, visualTheme: "classic" };
        if (version < 3) return { ...state, uiLocale: "ko" };
        if (version < 4) return { ...state, highlightWeakWords: true };
        return state;
      },
    },
  ),
);
