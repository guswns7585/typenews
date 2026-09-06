"use client";

import { create } from "zustand";
import type { ScriptureKind } from "@/features/scripture/scripture-library";
import type { ContentItem, Language, NewsSector, TypingMode } from "@/lib/types";

/**
 * 이번 세션에 모드별로 몇 개를 쳤는지.
 *
 * 단문 1문장(44타), 장문 1문장(205타), 뉴스 1문장(약 300타), 단어 1개(5타)는
 * 분량이 전혀 다르다. 하나로 합쳐 세면 CNT가 무엇을 뜻하는지 알 수 없다.
 */
type SessionCounts = Record<TypingMode, number>;

const EMPTY_COUNTS: SessionCounts = { short: 0, long: 0, word: 0, news: 0 };

type TypingState = {
  language: Language;
  mode: TypingMode;
  /**
   * 뉴스 모드에서 켜둔 카테고리들.
   *
   * 예전에는 하나만 고를 수 있었다. 여러 개를 켜면 그 섹션들을 모두 불러와 섞는다.
   * `["all"]`은 전체를 뜻하고 다른 값과 함께 두지 않는다.
   * 빈 배열은 만들지 않는다 — 마지막 하나를 끄면 전체로 되돌린다.
   */
  newsSectors: NewsSector[];
  /**
   * 밈 문장만 뽑을지.
   *
   * 별도 TypingMode가 아니라 **문장을 고르는 필터**다. 기록은 그대로 `short`로
   * 남는다. 밈 문장 자체가 `sentences`에 `mode='short'`로 들어 있고, 모드를
   * 하나 늘리면 typing_results·typing_mode_counts의 CHECK 제약과 점수 적립
   * 함수까지 손대야 한다 — 이벤트 중에 점수 경로를 건드리지 않으려고 이렇게 뒀다.
   */
  memeOnly: boolean;
  /**
   * 지금 필사 중인 보관함 글의 id. null이면 필사 모드가 아니다.
   *
   * `memeOnly`와 같은 이유로 별도 TypingMode를 만들지 않았다. 모드를 늘리면
   * typing_results·typing_mode_counts의 CHECK와 점수 적립 함수까지 손대야 한다.
   * 필사는 **점수를 전혀 주지 않으므로** 서버 스키마를 건드릴 이유가 더 없다.
   */
  scriptureId: string | null;
  /**
   * 지금 필사 중인 글의 종류. dock 드롭다운의 선택 표시가 이 값을 본다.
   * 보관함을 다시 읽지 않고도 알 수 있어야 해서 id와 함께 들고 있는다.
   */
  scriptureKind: ScriptureKind | null;
  /** 보관함 글 안에서 지금 치고 있는 줄. */
  scriptureLine: number;
  sentence: ContentItem | null;
  input: string;
  startedAt: number | null;
  /** 모드 구분 없는 합계. 마일스톤과 헤더 기록이 쓴다. */
  sessionCount: number;
  sessionCounts: SessionCounts;
  /** `memeOnly`를 주지 않으면 꺼진다. 밈은 한국어 단문에서만 켤 수 있다. */
  setMode: (
    language: Language,
    mode: TypingMode,
    newsSectors?: NewsSector[],
    memeOnly?: boolean,
  ) => void;
  /** 카테고리 하나를 켜고 끈다. 뉴스 모드가 아니면 뉴스 모드로 함께 넘어간다. */
  toggleNewsSector: (sector: NewsSector) => void;
  /** 필사할 글을 고른다. null이면 필사에서 빠져나온다. */
  setScripture: (id: string | null, kind?: ScriptureKind) => void;
  /** 필사 줄을 옮긴다. 범위는 호출부가 정한다. */
  setScriptureLine: (line: number) => void;
  setSentence: (sentence: ContentItem) => void;
  setInput: (input: string) => void;
  completeSentence: (countSession?: boolean) => void;
};

/** `all`은 단독으로만 의미가 있고, 빈 목록은 전체로 되돌린다. */
function normalizeSectors(sectors: NewsSector[]): NewsSector[] {
  const unique = [...new Set(sectors)];
  if (!unique.length || unique.includes("all")) return ["all"];
  return unique;
}

export const useTypingStore = create<TypingState>((set) => ({
  language: "kor",
  mode: "short",
  newsSectors: ["all"],
  memeOnly: false,
  scriptureId: null,
  scriptureKind: null,
  scriptureLine: 0,
  sentence: null,
  input: "",
  startedAt: null,
  sessionCount: 0,
  sessionCounts: EMPTY_COUNTS,
  setMode: (language, mode, newsSectors, memeOnly = false) =>
    set((state) => ({
      language,
      mode,
      /* 모드와 무관하게 적용한다. 카테고리 선택은 뉴스 모드에 들어가기 전에도
         복원돼 있어야 한다. 예전에는 mode === "news"일 때만 반영해서, 단문으로
         저장하고 나간 사용자가 다시 뉴스로 들어가면 선택이 전체로 돌아갔다. */
      newsSectors: newsSectors ? normalizeSectors(newsSectors) : state.newsSectors,
      /* 밈은 한국어 단문에서만 성립한다. 다른 곳으로 옮기면 자동으로 꺼진다. */
      memeOnly: memeOnly && language === "kor" && mode === "short",
      /* 다른 모드를 고르면 필사에서 빠져나온다.
         필사 입력이 다른 모드의 제출로 섞이지 않게 하는 첫 번째 방어선이다. */
      scriptureId: null,
      scriptureKind: null,
      scriptureLine: 0,
      sentence: null,
      input: "",
      startedAt: null,
    })),
  toggleNewsSector: (sector) =>
    set((state) => {
      const current = state.newsSectors;
      let next: NewsSector[];
      if (sector === "all") {
        next = ["all"];
      } else if (current.includes(sector)) {
        next = current.filter((item) => item !== sector);
      } else {
        // 개별 카테고리를 켜면 "전체"는 의미가 없어지므로 빠진다.
        next = [...current.filter((item) => item !== "all"), sector];
      }
      return {
        language: "kor",
        mode: "news",
        memeOnly: false,
        scriptureId: null,
        scriptureKind: null,
        scriptureLine: 0,
        newsSectors: normalizeSectors(next),
        // 고른 범위가 바뀌었으니 지금 문장은 버리고 새로 받는다.
        sentence: null,
        input: "",
        startedAt: null,
      };
    }),
  setScripture: (id, kind) =>
    set({
      scriptureId: id,
      scriptureKind: id ? (kind ?? null) : null,
      scriptureLine: 0,
      /* 필사는 밈과 함께 켜지지 않는다. 둘 다 점수를 주지 않지만 문장 출처가 다르다. */
      memeOnly: false,
      sentence: null,
      input: "",
      startedAt: null,
    }),
  setScriptureLine: (line) =>
    set({ scriptureLine: Math.max(0, line), sentence: null, input: "", startedAt: null }),
  setSentence: (sentence) => set({ sentence, input: "", startedAt: null }),
  setInput: (input) => set((state) => ({ input, startedAt: state.startedAt ?? Date.now() })),
  completeSentence: (countSession = true) =>
    set((state) => {
      if (!countSession) return { input: "", startedAt: null };
      return {
        input: "",
        startedAt: null,
        sessionCount: state.sessionCount + 1,
        // 지금 치고 있던 모드에 더한다. 단어 모드는 단어 1개다.
        sessionCounts: {
          ...state.sessionCounts,
          [state.mode]: state.sessionCounts[state.mode] + 1,
        },
      };
    }),
}));
