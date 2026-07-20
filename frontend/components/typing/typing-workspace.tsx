"use client";

import { ChevronLeft, ChevronRight, ExternalLink } from "lucide-react";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { SiteLogo } from "@/components/brand/site-logo";
import { pickSentence } from "@/features/content/sentence-picker";
import { calculateMetrics, isCompleted, isIgnoredCharacter } from "@/features/typing-engine/metrics";
import { getSupabaseClient } from "@/lib/supabase/client";
import { useSettingsStore } from "@/stores/use-settings-store";
import { useTypingStore } from "@/stores/use-typing-store";
import { useUiStore } from "@/stores/use-ui-store";

function seoulMonthId() {
  const parts = new Intl.DateTimeFormat("en-US", {
    timeZone: "Asia/Seoul",
    year: "numeric",
    month: "2-digit",
  }).formatToParts();
  const year = parts.find((part) => part.type === "year")?.value;
  const month = parts.find((part) => part.type === "month")?.value;
  return `${year}${month}`;
}

function preventClipboard(event: Event) {
  event.preventDefault();
}

export function TypingWorkspace() {
  const sentence = useTypingStore((state) => state.sentence);
  const input = useTypingStore((state) => state.input);
  const startedAt = useTypingStore((state) => state.startedAt);
  const language = useTypingStore((state) => state.language);
  const mode = useTypingStore((state) => state.mode);
  const sessionCount = useTypingStore((state) => state.sessionCount);
  const setInput = useTypingStore((state) => state.setInput);
  const setSentence = useTypingStore((state) => state.setSentence);
  const completeSentence = useTypingStore((state) => state.completeSentence);
  const settings = useSettingsStore();
  const lastRecord = useUiStore((state) => state.lastRecord);
  const recordResult = useUiStore((state) => state.recordResult);
  const bumpLogoClick = useUiStore((state) => state.bumpLogoClick);
  const [logoClicked, setLogoClicked] = useState(false);
  const inputRef = useRef<HTMLTextAreaElement>(null);

  const focusInput = useCallback(() => {
    inputRef.current?.focus({ preventScroll: true });
  }, []);

  const loadNext = useCallback(
    () => setSentence(pickSentence(language, mode)),
    [language, mode, setSentence],
  );

  useEffect(() => {
    if (!sentence) loadNext();
  }, [loadNext, sentence]);

  useEffect(() => {
    focusInput();
  }, [sentence?.id, focusInput]);

  useEffect(() => {
    document.documentElement.style.setProperty("--font-size-body", `${settings.fontSize}px`);
  }, [settings.fontSize]);

  useEffect(() => {
    function onKeyDown(event: KeyboardEvent) {
      const hasModifier = event.ctrlKey || event.metaKey;
      if (hasModifier && [",", ".", "c", "v", "x", "a"].includes(event.key.toLowerCase())) {
        event.preventDefault();
        if (event.key === ".") loadNext();
        return;
      }
      if (event.key === "Tab") {
        event.preventDefault();
        loadNext();
      }
    }

    function onMouseDown(event: MouseEvent) {
      const target = event.target as HTMLElement | null;
      if (!target) return;
      if (
        target.closest(
          "button, a, input, textarea, select, #bg-options, .dropdown-content, .mode-dropdown-content, .sub-nav-frosted, .global-nav",
        )
      ) {
        return;
      }
      window.requestAnimationFrame(focusInput);
    }

    document.addEventListener("keydown", onKeyDown);
    document.addEventListener("mousedown", onMouseDown);
    document.addEventListener("copy", preventClipboard);
    document.addEventListener("paste", preventClipboard);
    document.addEventListener("cut", preventClipboard);
    document.addEventListener("contextmenu", preventClipboard);
    return () => {
      document.removeEventListener("keydown", onKeyDown);
      document.removeEventListener("mousedown", onMouseDown);
      document.removeEventListener("copy", preventClipboard);
      document.removeEventListener("paste", preventClipboard);
      document.removeEventListener("cut", preventClipboard);
      document.removeEventListener("contextmenu", preventClipboard);
    };
  }, [focusInput, loadNext]);

  const metrics = useMemo(
    () => calculateMetrics(sentence?.text ?? "", input, startedAt, settings),
    [sentence?.text, input, startedAt, settings],
  );

  const progress = useMemo(() => {
    const target = sentence?.text ?? "";
    if (!target.length) return 0;
    return Math.min(100, Math.round((input.length / target.length) * 100));
  }, [input.length, sentence?.text]);

  function onChange(value: string) {
    setInput(value);
    if (sentence && isCompleted(sentence.text, value, settings)) {
      const finalMetrics = calculateMetrics(sentence.text, value, startedAt ?? Date.now(), settings);
      recordResult({
        sentence: sentence.text.slice(0, 40),
        cpm: finalMetrics.cpm,
        accuracy: finalMetrics.accuracy,
      });
      void (async () => {
        try {
          await getSupabaseClient().rpc("record_typing_result", {
            p_month_id: seoulMonthId(),
            p_mode: mode,
            p_accuracy: finalMetrics.accuracy,
            p_cpm: finalMetrics.cpm,
          });
        } catch {
          // 로그인/환경 설정 전에도 익명 연습은 계속할 수 있습니다.
        }
      })();
      completeSentence();
      window.setTimeout(() => {
        loadNext();
        focusInput();
      }, 180);
    }
  }

  const characters = [...(sentence?.text ?? "")];

  return (
    <div id="typing-tab" className="product-tile-light" onClick={focusInput}>
      <SiteLogo
        clicked={logoClicked}
        onClick={() => {
          setLogoClicked(true);
          bumpLogoClick();
          window.setTimeout(() => setLogoClicked(false), 120);
        }}
      />

      <div className="thumbnail-wrapper">
        <div id="thumbnail-container" className="thumbnail-container" style={{ display: "none" }} />
        <a
          href={sentence?.sourceUrl ?? "#"}
          target="_blank"
          rel="noreferrer"
          id="news-original-link"
          style={{
            color: "#5e5e5e",
            fontSize: 14,
            textDecoration: "none",
            display: sentence?.sourceUrl ? "inline-flex" : "none",
            alignItems: "center",
            gap: 4,
            marginTop: 8,
          }}
        >
          기사 원문 보기
          <ExternalLink size={13} />
        </a>
      </div>

      <span id="milestone-text" />

      <div className="sentence-wrapper">
        <button
          id="prev-sentence"
          className="side-button icon-btn-circular"
          type="button"
          title="이전 문장"
          onClick={() => {
            loadNext();
            focusInput();
          }}
        >
          <ChevronLeft size={18} />
        </button>

        <div
          id="sentence"
          style={{ fontSize: `${settings.fontSize}px`, lineHeight: 1.8, cursor: "text" }}
          onClick={focusInput}
        >
          {characters.map((character, index) => {
            const ignored = isIgnoredCharacter(character, settings);
            const typed = index < input.length ? input[index] : undefined;
            let className = ignored ? "ignored" : "";
            let display = character;
            if (!ignored && typed !== undefined) {
              className = typed === character ? "correct" : "incorrect";
              // 오버레이 모드에서는 실제로 입력한 글자를 그대로 보여줍니다(공백은 원문 유지).
              display = typed === " " ? character : typed;
            }
            return (
              <span key={`${character}-${index}`}>
                {settings.overlayMode && index === input.length ? (
                  <span className="virtual-cursor-inline" aria-hidden="true" />
                ) : null}
                <span className={className || undefined}>{display}</span>
              </span>
            );
          })}
          {settings.overlayMode && input.length >= characters.length && characters.length > 0 ? (
            <span className="virtual-cursor-inline" aria-hidden="true" />
          ) : null}
        </div>

        <button
          id="skip-sentence"
          className="side-button icon-btn-circular"
          type="button"
          title="다음 문장"
          onClick={() => {
            loadNext();
            focusInput();
          }}
        >
          <ChevronRight size={18} />
        </button>
      </div>

      <div id="news-link" style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }} />

      <div id="progress-bar" style={{ width: `${progress}%` }} />

      <textarea
        ref={inputRef}
        id="input"
        aria-label="타이핑할 문장 입력"
        value={input}
        onChange={(event) => onChange(event.target.value)}
        onKeyDown={(event) => {
          if (event.key === "Escape") {
            if (input) setInput("");
            else loadNext();
          }
        }}
        spellCheck={false}
        autoFocus
        style={{ fontSize: `${settings.fontSize}px` }}
        className={settings.overlayMode ? "overlay-mode" : "visible-mode"}
        placeholder=""
      />

      <div className="stats">
        <div>
          SPD: <span id="speed">{metrics.cpm} CPM</span>
        </div>
        <div>
          ACC: <span id="accuracy">{metrics.accuracy}</span>
        </div>
        <div>
          CNT: <span id="count">{sessionCount}</span>
        </div>
      </div>

      <div className="record-box" id="last-record">
        <div>
          <span id="record-sentence">
            {lastRecord ? `직전: ${lastRecord.sentence}${lastRecord.sentence.length >= 40 ? "…" : ""}` : ""}
          </span>
        </div>
        <div>
          <span id="record-cpm">{lastRecord ? `${lastRecord.cpm} CPM` : ""}</span>
        </div>
        <div>
          <span id="record-accuracy">{lastRecord ? `ACC ${lastRecord.accuracy}%` : ""}</span>
        </div>
      </div>
    </div>
  );
}
