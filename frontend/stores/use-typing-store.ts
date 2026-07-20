"use client";

import { create } from "zustand";
import type { ContentItem, Language, TypingMode } from "@/lib/types";

type TypingState = {
  language: Language;
  mode: TypingMode;
  sentence: ContentItem | null;
  input: string;
  startedAt: number | null;
  sessionCount: number;
  setMode: (language: Language, mode: TypingMode) => void;
  setSentence: (sentence: ContentItem) => void;
  setInput: (input: string) => void;
  completeSentence: () => void;
};

export const useTypingStore = create<TypingState>((set) => ({
  language: "kor",
  mode: "short",
  sentence: null,
  input: "",
  startedAt: null,
  sessionCount: 0,
  setMode: (language, mode) => set({ language, mode, sentence: null, input: "", startedAt: null }),
  setSentence: (sentence) => set({ sentence, input: "", startedAt: null }),
  setInput: (input) => set((state) => ({ input, startedAt: state.startedAt ?? Date.now() })),
  completeSentence: () =>
    set((state) => ({
      input: "",
      startedAt: null,
      sessionCount: state.sessionCount + 1,
    })),
}));
