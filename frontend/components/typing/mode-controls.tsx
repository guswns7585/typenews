"use client";

import { ChevronDown } from "lucide-react";
import { useState } from "react";
import type { Language, TypingMode } from "@/lib/types";
import { useTypingStore } from "@/stores/use-typing-store";

const korModes: { mode: TypingMode; label: string }[] = [
  { mode: "short", label: "단문" },
  { mode: "long", label: "장문" },
  { mode: "word", label: "단어" },
];

const engModes: { mode: TypingMode; label: string }[] = [
  { mode: "short", label: "Short" },
  { mode: "long", label: "Long" },
  { mode: "word", label: "Word" },
];

const newsSectors = [
  { id: "all", label: "전체" },
  { id: "main", label: "메인" },
  { id: "politics", label: "정치" },
  { id: "economy", label: "경제" },
  { id: "global", label: "국제·글로벌" },
  { id: "society", label: "사회" },
  { id: "entertainment", label: "방송·연예" },
  { id: "culture", label: "문화·라이프" },
  { id: "sports", label: "스포츠" },
];

export function ModeControls() {
  const language = useTypingStore((s) => s.language);
  const mode = useTypingStore((s) => s.mode);
  const setMode = useTypingStore((s) => s.setMode);
  const [open, setOpen] = useState<"kor" | "eng" | "news" | null>(null);

  function pick(lang: Language, nextMode: TypingMode) {
    setMode(lang, nextMode);
    setOpen(null);
  }

  return (
    <>
      <div className="kor-mode-dropdown mode-dropdown">
        <button
          id="korModeBtn"
          type="button"
          className="chip-pill"
          data-selected={language === "kor" && mode !== "news"}
          onClick={() => setOpen(open === "kor" ? null : "kor")}
        >
          한국어
          <ChevronDown size={14} />
        </button>
        <div className={`kor-mode-dropdown-content mode-dropdown-content${open === "kor" ? " show" : ""}`}>
          {korModes.map((item) => (
            <div
              key={item.mode}
              data-mode={item.mode}
              onClick={() => pick("kor", item.mode)}
              style={language === "kor" && mode === item.mode ? { fontWeight: 700, color: "var(--color-primary)" } : undefined}
            >
              {item.label}
            </div>
          ))}
        </div>
      </div>

      <div className="kor-mode-dropdown mode-dropdown">
        <button
          id="engModeBtn"
          type="button"
          className="chip-pill"
          data-selected={language === "eng" && mode !== "news"}
          onClick={() => setOpen(open === "eng" ? null : "eng")}
        >
          English
          <ChevronDown size={14} />
        </button>
        <div className={`eng-mode-dropdown-content mode-dropdown-content${open === "eng" ? " show" : ""}`}>
          {engModes.map((item) => (
            <div
              key={item.mode}
              data-mode={item.mode}
              onClick={() => pick("eng", item.mode)}
              style={language === "eng" && mode === item.mode ? { fontWeight: 700, color: "var(--color-primary)" } : undefined}
            >
              {item.label}
            </div>
          ))}
        </div>
      </div>

      <div className={`dropdown${open === "news" ? " open" : ""}`}>
        <button
          id="newsDropdownBtn"
          type="button"
          className="chip-pill"
          data-selected={language === "kor" && mode === "news"}
          onClick={() => {
            pick("kor", "news");
            setOpen(open === "news" ? null : "news");
          }}
        >
          뉴스 (한글)
          <ChevronDown size={14} />
        </button>
        <div className="dropdown-content">
          {newsSectors.map((sector) => (
            <div key={sector.id} data-sector={sector.id} onClick={() => pick("kor", "news")}>
              {sector.label}
            </div>
          ))}
        </div>
      </div>

      <button
        id="langNews"
        type="button"
        className="chip-pill"
        data-selected={language === "eng" && mode === "news"}
        onClick={() => pick("eng", "news")}
      >
        뉴스 (영어)
      </button>
    </>
  );
}
