"use client";

import { useCallback } from "react";
import type { UiLocale } from "@/lib/types";
import { useSettingsStore } from "@/stores/use-settings-store";

export type LocalizedText = { ko: string; en: string };

export function textFor(locale: UiLocale, ko: string, en: string) {
  return locale === "en" ? en : ko;
}

/** UI 언어만 바꾸며 한국어/영어 타이핑 자료 선택에는 손대지 않는다. */
export function useUiLanguage() {
  const locale = useSettingsStore((state) => state.uiLocale);
  const update = useSettingsStore((state) => state.update);
  const t = useCallback(
    (ko: string, en: string) => textFor(locale, ko, en),
    [locale],
  );
  const setLocale = useCallback(
    (next: UiLocale) => update({ uiLocale: next }),
    [update],
  );

  return { locale, isEnglish: locale === "en", setLocale, t };
}
