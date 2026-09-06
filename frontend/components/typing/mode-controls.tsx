"use client";

import { ChevronDown, Library, PenLine } from "lucide-react";
import { AnimatePresence, motion, useReducedMotion } from "motion/react";
import { useEffect, useRef, useState } from "react";
import { createPortal } from "react-dom";
import {
  SCRIPTURE_KINDS,
  SCRIPTURE_UPDATED_EVENT,
  loadLibrary,
  type ScriptureKind,
} from "@/features/scripture/scripture-library";
import type { Language, NewsSector, TypingMode } from "@/lib/types";
import { useUiLanguage } from "@/lib/ui-language";
import { useTypingStore } from "@/stores/use-typing-store";

/* 밈은 별도 TypingMode가 아니라 단문의 필터다. 기록도 단문으로 남는다.
   밈 문장이 sentences에 mode='short'로 들어 있고, 모드를 늘리면 점수 적립
   경로(typing_results·typing_mode_counts의 CHECK, record_typing_result)까지
   손대야 해서 이벤트 중에는 건드리지 않기로 했다. */
const korModes: { mode: TypingMode; label: string; labelEn: string; memeOnly?: boolean }[] = [
  { mode: "short", label: "단문", labelEn: "Short" },
  { mode: "long", label: "장문", labelEn: "Long" },
  { mode: "word", label: "단어", labelEn: "Word" },
  { mode: "short", label: "밈", labelEn: "Meme", memeOnly: true },
];

const engModes: { mode: TypingMode; label: string }[] = [
  { mode: "short", label: "Short" },
  { mode: "long", label: "Long" },
  { mode: "word", label: "Word" },
];

const newsSectorOptions: { id: NewsSector; label: string; labelEn: string }[] = [
  { id: "all", label: "전체", labelEn: "All" },
  { id: "main", label: "메인", labelEn: "Top" },
  { id: "politics", label: "정치", labelEn: "Politics" },
  { id: "economy", label: "경제", labelEn: "Business" },
  { id: "global", label: "국제", labelEn: "World" },
  { id: "society", label: "사회", labelEn: "Society" },
  { id: "entertainment", label: "방송/연예", labelEn: "Entertainment" },
  { id: "culture", label: "문화/라이프", labelEn: "Culture" },
  { id: "sports", label: "스포츠", labelEn: "Sports" },
];

/** 패널 최소 폭. CSS의 min-width와 같아야 화면 밖으로 나가는 것을 제대로 막는다. */
const PANEL_MIN_WIDTH = 168;
/** 버튼과 패널 사이 간격. */
const PANEL_GAP = 8;
/** 화면 가장자리에서 이만큼은 띄운다. */
const VIEWPORT_MARGIN = 12;

type DropdownDirection = "up" | "down";
type OpenState = {
  kind: "kor" | "eng" | "news" | "scripture";
  direction: DropdownDirection;
  vertical: number;
  left: number;
};

/** 하단 독에서는 버튼 위로, 나머지는 아래로 연다. 좌우는 화면 안으로 제한한다. */
function anchorTo(button: HTMLElement): Omit<OpenState, "kind"> {
  const rect = button.getBoundingClientRect();
  const maxLeft = window.innerWidth - PANEL_MIN_WIDTH - VIEWPORT_MARGIN;
  const dock = button.closest<HTMLElement>(".dock-snap-surface");
  const frame = dock?.closest(".typing-layout-group")?.querySelector<HTMLElement>(
    ".typing-card-frame",
  );
  // 모바일에서는 저장된 bottom 배치를 시각적으로 top으로 풀어놓는다. 속성값이
  // 아니라 실제 좌표를 비교해야 모바일에서 메뉴가 헤더 쪽으로 잘못 열리지 않는다.
  const dockIsVisuallyBelowFrame = Boolean(
    dock && frame && dock.getBoundingClientRect().top >= frame.getBoundingClientRect().bottom,
  );
  const direction: DropdownDirection = dockIsVisuallyBelowFrame ? "up" : "down";
  return {
    direction,
    vertical: direction === "up"
      ? window.innerHeight - rect.top + PANEL_GAP
      : rect.bottom + PANEL_GAP,
    left: Math.max(VIEWPORT_MARGIN, Math.min(rect.left, maxLeft)),
  };
}

/** 버튼에 적을 요약. 여러 개를 켜면 첫 이름과 나머지 개수로 줄인다. */
function sectorSummary(selected: NewsSector[], english: boolean) {
  if (selected.includes("all")) return english ? "All" : "전체";
  const labels = selected.map(
    (id) => {
      const option = newsSectorOptions.find((entry) => entry.id === id);
      return (english ? option?.labelEn : option?.label) ?? id;
    },
  );
  if (labels.length === 0) return english ? "All" : "전체";
  if (labels.length === 1) return labels[0];
  return english ? `${labels[0]} +${labels.length - 1}` : `${labels[0]} 외 ${labels.length - 1}`;
}

type ModeControlsProps = {
  /** 고른 종류의 필사 보관함을 연다. 목록 관리는 dock이 아니라 별도 패널이 맡는다. */
  onOpenScripture: (kind: ScriptureKind) => void;
  /** 가사는 한 곡을 오래 치므로 시작 전에 보관함에서 직접 고른다. */
  onOpenSongPicker: () => void;
};

export function ModeControls({ onOpenScripture, onOpenSongPicker }: ModeControlsProps) {
  const { isEnglish, t } = useUiLanguage();
  const reduceDropdownMotion = useReducedMotion();
  const scriptureId = useTypingStore((s) => s.scriptureId);
  const scriptureKind = useTypingStore((s) => s.scriptureKind);
  const isScripture = scriptureId !== null;
  const language = useTypingStore((s) => s.language);
  const mode = useTypingStore((s) => s.mode);
  const newsSectors = useTypingStore((s) => s.newsSectors);
  const memeOnly = useTypingStore((s) => s.memeOnly);
  const setMode = useTypingStore((s) => s.setMode);
  const toggleNewsSector = useTypingStore((s) => s.toggleNewsSector);
  const setScripture = useTypingStore((s) => s.setScripture);
  const [open, setOpen] = useState<OpenState | null>(null);
  const [scriptureCounts, setScriptureCounts] = useState<Record<ScriptureKind, number>>({
    short: 0,
    long: 0,
    song: 0,
  });

  useEffect(() => {
    const refreshCounts = () => {
      const next: Record<ScriptureKind, number> = { short: 0, long: 0, song: 0 };
      for (const item of loadLibrary()) next[item.kind] += 1;
      setScriptureCounts(next);
    };
    const timer = window.setTimeout(refreshCounts, 0);
    window.addEventListener(SCRIPTURE_UPDATED_EVENT, refreshCounts);
    return () => {
      window.clearTimeout(timer);
      window.removeEventListener(SCRIPTURE_UPDATED_EVENT, refreshCounts);
    };
  }, []);

  /* 트리거 버튼들. 바깥 클릭 판정에 쓴다.
     ⚠️ 컨트롤들을 감싸는 div를 두면 dock의 flex 배치가 깨져 버튼이 세로로 쌓인다.
     그래서 감싸지 않고 각각 ref로 잡는다. */
  const korRef = useRef<HTMLDivElement>(null);
  const engRef = useRef<HTMLDivElement>(null);
  const newsRef = useRef<HTMLDivElement>(null);
  const scriptureRef = useRef<HTMLDivElement>(null);
  /* 패널은 포털로 body에 붙으므로 위 ref들의 자손이 아니다.
     바깥 클릭 판정에서 따로 확인해야 패널 안을 눌렀을 때 닫히지 않는다. */
  const panelRef = useRef<HTMLDivElement>(null);

  /* 드롭다운 바깥을 누르면 닫는다.
     pointerdown을 쓰는 이유: click은 버튼을 놓는 순간에 오는데, 그러면 토글
     버튼의 onClick과 순서가 엉켜 열자마자 닫히는 일이 생긴다. */
  useEffect(() => {
    if (!open) return undefined;

    function onPointerDown(event: PointerEvent) {
      const target = event.target;
      if (!(target instanceof Node)) return;
      const inside = [korRef, engRef, newsRef, scriptureRef, panelRef].some((ref) =>
        ref.current?.contains(target),
      );
      if (!inside) setOpen(null);
    }
    function onKeyDown(event: KeyboardEvent) {
      if (event.key === "Escape") setOpen(null);
    }
    /* 스크롤·리사이즈로 버튼이 움직이면 패널만 제자리에 남는다.
       따라다니게 만들 수도 있지만, 잠깐 열어두는 메뉴라 닫는 편이 단순하고
       effect 안에서 좌표를 다시 계산하지 않아도 된다. */
    function close() {
      setOpen(null);
    }

    document.addEventListener("pointerdown", onPointerDown);
    document.addEventListener("keydown", onKeyDown);
    window.addEventListener("resize", close);
    window.addEventListener("scroll", close, true);
    return () => {
      document.removeEventListener("pointerdown", onPointerDown);
      document.removeEventListener("keydown", onKeyDown);
      window.removeEventListener("resize", close);
      window.removeEventListener("scroll", close, true);
    };
  }, [open]);

  /* 좌표는 클릭한 그 순간에 버튼에서 읽는다.
     effect 안에서 재면 React 19의 set-state-in-effect 규칙에 걸리고,
     열리는 첫 프레임에 위치가 한 번 튄다. */
  function toggle(kind: OpenState["kind"], event: React.MouseEvent<HTMLButtonElement>) {
    const button = event.currentTarget;
    setOpen((current) =>
      current?.kind === kind ? null : { kind, ...anchorTo(button) },
    );
  }

  function pick(lang: Language, nextMode: TypingMode, memeOnly = false) {
    setMode(lang, nextMode, undefined, memeOnly);
    setOpen(null);
  }

  function pickScripture(kind: ScriptureKind) {
    const items = loadLibrary().filter((item) => item.kind === kind);
    if (!items.length) return;
    if (kind === "song") {
      onOpenSongPicker();
      setOpen(null);
      return;
    }
    const current = items.find((item) => item.id === scriptureId) ?? items[0];
    setScripture(current.id, current.kind);
    setOpen(null);
  }

  /**
   * 패널을 body에 붙인다.
   *
   * ⚠️ 독(.sub-nav-frosted)이 backdrop-filter를 갖고 있어서, 그 안에 두면
   *    거기가 backdrop root가 된다. 그러면 패널의 backdrop-filter는 페이지가
   *    아니라 **독 안쪽만** 샘플링해서 블러가 사실상 사라진다.
   *    설정 패널(.settings-panel)이 제대로 흐려 보이는 것은 body 바로 아래
   *    fixed로 떠 있기 때문이다. 같은 재질로 보이려면 여기도 나와야 한다.
   */
  function panel(kind: OpenState["kind"], className: string, children: React.ReactNode) {
    if (typeof document === "undefined") return null;
    const activePanel = open?.kind === kind ? open : null;
    return createPortal(
      <AnimatePresence initial={false}>
        {activePanel ? (
          <motion.div
            key={kind}
            ref={panelRef}
            className={className}
            data-dock-interactive="true"
            data-dropdown-direction={activePanel.direction}
            style={{
              top: activePanel.direction === "down" ? activePanel.vertical : undefined,
              bottom: activePanel.direction === "up" ? activePanel.vertical : undefined,
              left: activePanel.left,
              transformOrigin: `${activePanel.direction === "up" ? "bottom" : "top"} left`,
            }}
            onPointerDown={(event) => event.stopPropagation()}
            initial={reduceDropdownMotion
              ? false
              : { opacity: 0, scale: 0.92, y: activePanel.direction === "up" ? 8 : -8 }}
            animate={{ opacity: 1, scale: 1, y: 0 }}
            exit={reduceDropdownMotion
              ? { opacity: 0 }
              : {
                  opacity: 0,
                  scale: 0.96,
                  y: activePanel.direction === "up" ? 4 : -4,
                }}
            transition={reduceDropdownMotion
              ? { duration: 0.01 }
              : {
                  type: "spring",
                  stiffness: 520,
                  damping: 36,
                  mass: 0.68,
                  opacity: { duration: 0.16, ease: "easeOut" },
                }}
          >
            {children}
          </motion.div>
        ) : null}
      </AnimatePresence>,
      document.body,
      `mode-dropdown-${kind}`,
    );
  }

  const isNewsMode = !isScripture && language === "kor" && mode === "news";

  return (
    <>
      <div className="kor-mode-dropdown mode-dropdown" ref={korRef}>
        <button
          id="korModeBtn"
          type="button"
          className="chip-pill"
          data-selected={!isScripture && language === "kor" && mode !== "news"}
          aria-expanded={open?.kind === "kor"}
          onClick={(event) => toggle("kor", event)}
        >
          {t("한국어", "Korean")}
          <motion.span
            className="dropdown-chevron"
            animate={{ rotate: open?.kind === "kor" ? 180 : 0 }}
            transition={reduceDropdownMotion ? { duration: 0.01 } : { type: "spring", stiffness: 520, damping: 32 }}
          >
            <ChevronDown size={14} />
          </motion.span>
        </button>
      </div>
      {panel(
        "kor",
        "kor-mode-dropdown-content mode-dropdown-content",
        korModes.map((item) => {
          /* 단문과 밈은 mode가 같으므로 memeOnly까지 봐야 구분된다. */
          const isCurrent =
            language === "kor" && mode === item.mode && memeOnly === Boolean(item.memeOnly);
          return (
            <div
              key={`${item.mode}-${item.memeOnly ? "meme" : "regular"}`}
              data-mode={item.mode}
              /* 선택 표시는 CSS가 맡는다(chip-pill과 같은 "눌린 면"). */
              data-selected={isCurrent}
              aria-current={isCurrent ? "true" : undefined}
              onClick={() => pick("kor", item.mode, item.memeOnly)}
            >
              {isEnglish ? item.labelEn : item.label}
              {/* 점수가 안 쌓인다는 것은 고르기 전에 알아야 한다. */}
              {item.memeOnly ? <span className="dropdown-item-note">{t("점수 획득 불가", "No score")}</span> : null}
            </div>
          );
        }),
      )}

      <div className="eng-mode-dropdown mode-dropdown" ref={engRef}>
        <button
          id="engModeBtn"
          type="button"
          className="chip-pill"
          data-selected={!isScripture && language === "eng" && mode !== "news"}
          aria-expanded={open?.kind === "eng"}
          onClick={(event) => toggle("eng", event)}
        >
          English
          <motion.span
            className="dropdown-chevron"
            animate={{ rotate: open?.kind === "eng" ? 180 : 0 }}
            transition={reduceDropdownMotion ? { duration: 0.01 } : { type: "spring", stiffness: 520, damping: 32 }}
          >
            <ChevronDown size={14} />
          </motion.span>
        </button>
      </div>
      {panel(
        "eng",
        "eng-mode-dropdown-content mode-dropdown-content",
        engModes.map((item) => (
          <div
            key={item.mode}
            data-mode={item.mode}
            data-selected={language === "eng" && mode === item.mode}
            aria-current={language === "eng" && mode === item.mode ? "true" : undefined}
            onClick={() => pick("eng", item.mode)}
          >
            {item.label}
          </div>
        )),
      )}

      <div className="dropdown" ref={newsRef}>
        <button
          id="newsDropdownBtn"
          type="button"
          className="chip-pill"
          data-selected={isNewsMode}
          aria-expanded={open?.kind === "news"}
          onClick={(event) => {
            if (!isNewsMode) setMode("kor", "news", newsSectors);
            toggle("news", event);
          }}
        >
          <span className="chip-label">
            {isNewsMode ? `${t("뉴스", "News")}(${sectorSummary(newsSectors, isEnglish)})` : t("뉴스 한국어", "Korean News")}
          </span>
          <motion.span
            className="dropdown-chevron"
            animate={{ rotate: open?.kind === "news" ? 180 : 0 }}
            transition={reduceDropdownMotion ? { duration: 0.01 } : { type: "spring", stiffness: 520, damping: 32 }}
          >
            <ChevronDown size={14} />
          </motion.span>
        </button>
      </div>
      {/* 여러 개를 켤 수 있으므로 고르면 닫지 않는다. 바깥을 누르면 닫힌다. */}
      {panel(
        "news",
        "dropdown-content",
        <>
          <p className="dropdown-hint">{t("여러 개를 고를 수 있습니다", "Select multiple sections")}</p>
          {newsSectorOptions.map((sector) => {
            const checked = newsSectors.includes(sector.id);
            return (
              <div
                key={sector.id}
                data-sector={sector.id}
                className={`dropdown-check${checked ? " is-checked" : ""}`}
                role="checkbox"
                aria-checked={checked}
                tabIndex={0}
                onClick={() => toggleNewsSector(sector.id)}
                onKeyDown={(event) => {
                  if (event.key === "Enter" || event.key === " ") {
                    event.preventDefault();
                    toggleNewsSector(sector.id);
                  }
                }}
              >
                <span className="dropdown-check-label">{isEnglish ? sector.labelEn : sector.label}</span>
              </div>
            );
          })}
        </>,
      )}

      <button
        id="langNews"
        type="button"
        className="chip-pill"
        data-selected={!isScripture && language === "eng" && mode === "news"}
        onClick={() => pick("eng", "news")}
      >
        {t("뉴스 영어", "English News")}
      </button>

      {/* 필사는 내가 넣은 글을 쓰는 개인 연습이다. 점수가 붙지 않는다는 것은
          누르기 전에 보여야 한다. 밈 항목과 같은 방식으로 알린다. */}
      <div className="scripture-dropdown mode-dropdown" ref={scriptureRef}>
        <button
          id="scriptureBtn"
          type="button"
          className="chip-pill"
          data-selected={isScripture}
          aria-expanded={open?.kind === "scripture"}
          title={t("내가 넣은 글로 연습합니다 · 점수 획득 불가", "Practice your own text · no score")}
          onClick={(event) => toggle("scripture", event)}
        >
          <PenLine size={14} />
          {t("필사", "My Text")}
          <motion.span
            className="dropdown-chevron"
            animate={{ rotate: open?.kind === "scripture" ? 180 : 0 }}
            transition={reduceDropdownMotion ? { duration: 0.01 } : { type: "spring", stiffness: 520, damping: 32 }}
          >
            <ChevronDown size={14} />
          </motion.span>
        </button>
      </div>
      {panel(
        "scripture",
        "scripture-dropdown-content mode-dropdown-content",
        <>
          <p className="dropdown-hint">{t("점수 획득 불가", "No score")}</p>
          {SCRIPTURE_KINDS.map((item) => {
            const count = scriptureCounts[item.id];
            const unavailable = count === 0;
            return (
              <div
                key={item.id}
                data-mode={item.id}
                data-selected={isScripture && scriptureKind === item.id}
                data-disabled={unavailable}
                aria-current={isScripture && scriptureKind === item.id ? "true" : undefined}
                aria-disabled={unavailable}
                onClick={() => pickScripture(item.id)}
              >
                {isEnglish ? ({ short: "Short", long: "Long", song: "Lyrics" } as const)[item.id] : item.label}
                <span className="dropdown-item-note">
                  {unavailable ? t("추가 필요", "Add first") : isEnglish ? `${count} saved` : `${count}개`}
                </span>
              </div>
            );
          })}
          <hr className="scripture-dropdown-divider" />
          <button
            type="button"
            className="scripture-manage-button"
            onClick={() => {
              onOpenScripture(scriptureKind ?? "short");
              setOpen(null);
            }}
          >
            <span className="scripture-manage-icon" aria-hidden="true">
              <Library size={15} />
            </span>
            <span className="scripture-manage-copy">
              <strong>{t("문장 관리", "Manage texts")}</strong>
              <small>{t("추가 · 수정 · 삭제", "Add · edit · delete")}</small>
            </span>
          </button>
        </>,
      )}
    </>
  );
}
