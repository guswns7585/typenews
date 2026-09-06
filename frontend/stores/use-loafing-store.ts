"use client";

import { create } from "zustand";
import { persist } from "zustand/middleware";
import type { UiLocale } from "@/lib/types";

type LoafingState = {
  spreadsheetCells: Record<string, string>;
  setSpreadsheetCell: (locale: UiLocale, id: string, value: string) => void;
  resetSpreadsheetCells: (locale?: UiLocale) => void;
};

function keyFor(locale: UiLocale, id: string) {
  return `${locale}:${id}`;
}

export function spreadsheetCellValue(
  cells: Record<string, string>,
  locale: UiLocale,
  id: string,
  fallback: string,
) {
  return cells[keyFor(locale, id)] ?? fallback;
}

export const useLoafingStore = create<LoafingState>()(
  persist(
    (set) => ({
      spreadsheetCells: {},
      setSpreadsheetCell: (locale, id, value) =>
        set((state) => ({
          spreadsheetCells: {
            ...state.spreadsheetCells,
            [keyFor(locale, id)]: value,
          },
        })),
      resetSpreadsheetCells: (locale) =>
        set((state) => ({
          spreadsheetCells: locale
            ? Object.fromEntries(
                Object.entries(state.spreadsheetCells).filter(
                  ([key]) => !key.startsWith(`${locale}:`),
                ),
              )
            : {},
        })),
    }),
    { name: "typenews-loafing-v1", version: 1 },
  ),
);
