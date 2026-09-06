"use client";

import { ArrowLeftRight, Bot, Code2, Highlighter, LayoutTemplate, Moon, Settings, Sparkles, SquareTerminal, Table2, Waves, X } from "lucide-react";
import { useEffect, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { useAuthProfile } from "@/components/auth/auth-button";
import { AccountSettings } from "@/components/settings/account-settings";
import { BackgroundOptions } from "@/components/settings/background-options";
import { FONT_OPTIONS } from "@/lib/font-options";
import { useUiLanguage } from "@/lib/ui-language";
import { useSettingsStore } from "@/stores/use-settings-store";
import { useUiStore } from "@/stores/use-ui-store";

/**
 * 헤더 우측의 설정 버튼.
 *
 * 원래 dock(sub-nav)에 흩어져 있던 배경·표시 모드·글자 크기를 여기로 모았다.
 * dock에는 타이핑 중에 자주 바꾸는 모드와 무시 옵션만 남는다.
 */
export function SettingsMenu() {
  const [open, setOpen] = useState(false);
  const containerRef = useRef<HTMLDivElement>(null);
  const overlayMode = useSettingsStore((s) => s.overlayMode);
  const fontFamily = useSettingsStore((s) => s.fontFamily);
  const fontSize = useSettingsStore((s) => s.fontSize);
  const newsTypingTarget = useSettingsStore((s) => s.newsTypingTarget);
  const newsBodyAmount = useSettingsStore((s) => s.newsBodyAmount);
  const visualTheme = useSettingsStore((s) => s.visualTheme);
  const highlightWeakWords = useSettingsStore((s) => s.highlightWeakWords);
  const update = useSettingsStore((s) => s.update);
  const { nickname } = useAuthProfile();
  const backgroundMotion = useUiStore((s) => s.backgroundMotion);
  const setBackgroundMotion = useUiStore((s) => s.setBackgroundMotion);
  const { locale, setLocale, t } = useUiLanguage();
  const isLoafingTheme = ["spreadsheet", "vscode", "terminal", "codex", "claude", "claude-code"].includes(visualTheme);

  useEffect(() => {
    if (!open) return undefined;

    /* 포털로 body에 붙였으므로 바깥 클릭 판정은 스크림이 담당한다.
       여기서는 Esc만 본다. */
    function onKeyDown(event: KeyboardEvent) {
      if (event.key === "Escape") setOpen(false);
    }

    document.addEventListener("keydown", onKeyDown);
    return () => document.removeEventListener("keydown", onKeyDown);
  }, [open]);

  return (
    <div className="settings-menu" ref={containerRef}>
      <button
        type="button"
        className="chip-pill"
        data-selected={open}
        aria-expanded={open}
        aria-haspopup="dialog"
        title={t("설정", "Settings")}
        onClick={() => setOpen((value) => !value)}
      >
        <Settings size={14} />
        {/* 로그인했으면 닉네임을 단다. 헤더에 버튼이 하나로 줄어 설정을
            누르려다 로그아웃되는 일이 없어진다. */}
        {nickname ?? t("설정", "Settings")}
      </button>

      {/* 팝오버는 항목이 늘면서 화면을 넘쳤다. 우측에서 밀려나오는 사이드바로
          바꿔 내부에서 스크롤되게 한다.
          ⚠️ 헤더에 backdrop-filter가 걸려 있어서 그 안에 두면 position:fixed의
          기준이 뷰포트가 아니라 헤더가 된다. 그래서 body로 빼낸다. */}
      {/* open은 클릭으로만 켜지므로 이 시점에는 항상 브라우저다. */}
      {open
        ? createPortal(
            <>
              <div className="settings-scrim" onClick={() => setOpen(false)} aria-hidden="true" />
              <aside className="settings-panel" role="dialog" aria-label={t("설정", "Settings")}>
          <header className="settings-panel-head">
            <h3>{t("설정", "Settings")}</h3>
            <button
              type="button"
              className="icon-btn-circular settings-close"
              aria-label={t("설정 닫기", "Close settings")}
              onClick={() => setOpen(false)}
            >
              <X size={16} />
            </button>
          </header>

          <AccountSettings />
          <section className="settings-section">
            <h4>{t("사이트 언어", "Site language")}</h4>
            <div className="settings-segmented" role="group" aria-label={t("사이트 언어", "Site language")}>
              <button type="button" data-selected={locale === "ko"} aria-pressed={locale === "ko"} onClick={() => setLocale("ko")}>
                한국어
              </button>
              <button type="button" data-selected={locale === "en"} aria-pressed={locale === "en"} onClick={() => setLocale("en")}>
                English
              </button>
            </div>
          </section>

          <section className="settings-section settings-theme-section">
            <h4>{t("테마", "Theme")}</h4>
            <div className="settings-segmented settings-theme-modes" role="group" aria-label={t("테마 모드", "Theme mode")}>
              <button
                type="button"
                data-selected={!isLoafingTheme}
                aria-pressed={!isLoafingTheme}
                onClick={() => update({ visualTheme: isLoafingTheme ? "classic" : visualTheme })}
              >
                {t("기본 모드", "Standard")}
              </button>
              <button
                type="button"
                data-selected={isLoafingTheme}
                aria-pressed={isLoafingTheme}
                onClick={() => update({ visualTheme: "spreadsheet" })}
              >
                {t("루팡 모드", "Stealth")}
              </button>
            </div>

            <div className="settings-theme-grid" role="group" aria-label={t("화면 테마", "Screen theme")}>
              {isLoafingTheme ? (
                <>
                  <button
                    type="button"
                    className="settings-theme-card is-spreadsheet"
                    data-selected={visualTheme === "spreadsheet"}
                    aria-pressed={visualTheme === "spreadsheet"}
                    onClick={() => update({ visualTheme: "spreadsheet" })}
                  >
                    <span className="settings-theme-preview" aria-hidden="true">
                      <Table2 size={20} />
                    </span>
                    <span><strong>{t("스프레드시트", "Spreadsheet")}</strong><small>{t("업무 문서 화면", "Office worksheet")}</small></span>
                  </button>
                  <button
                    type="button"
                    className="settings-theme-card is-vscode"
                    data-selected={visualTheme === "vscode"}
                    aria-pressed={visualTheme === "vscode"}
                    onClick={() => update({ visualTheme: "vscode" })}
                  >
                    <span className="settings-theme-preview" aria-hidden="true">
                      <Code2 size={20} />
                    </span>
                    <span><strong>VS Code</strong><small>{t("코드 편집 화면", "Code editor")}</small></span>
                  </button>
                  <button
                    type="button"
                    className="settings-theme-card is-terminal"
                    data-selected={visualTheme === "terminal"}
                    aria-pressed={visualTheme === "terminal"}
                    onClick={() => update({ visualTheme: "terminal" })}
                  >
                    <span className="settings-theme-preview" aria-hidden="true">
                      <SquareTerminal size={20} />
                    </span>
                    <span><strong>CMD</strong><small>{t("명령 프롬프트 화면", "Command prompt")}</small></span>
                  </button>
                  <button
                    type="button"
                    className="settings-theme-card is-codex"
                    data-selected={visualTheme === "codex"}
                    aria-pressed={visualTheme === "codex"}
                    onClick={() => update({ visualTheme: "codex" })}
                  >
                    <span className="settings-theme-preview" aria-hidden="true"><Bot size={20} /></span>
                    <span><strong>Codex</strong><small>{t("에이전트 작업 화면", "Agent workspace")}</small></span>
                  </button>
                  <button
                    type="button"
                    className="settings-theme-card is-claude"
                    data-selected={visualTheme === "claude"}
                    aria-pressed={visualTheme === "claude"}
                    onClick={() => update({ visualTheme: "claude" })}
                  >
                    <span className="settings-theme-preview" aria-hidden="true"><Sparkles size={20} /></span>
                    <span><strong>Claude</strong><small>{t("인앱 대화 화면", "Desktop chat")}</small></span>
                  </button>
                  <button
                    type="button"
                    className="settings-theme-card is-claude-code"
                    data-selected={visualTheme === "claude-code"}
                    aria-pressed={visualTheme === "claude-code"}
                    onClick={() => update({ visualTheme: "claude-code" })}
                  >
                    <span className="settings-theme-preview" aria-hidden="true"><SquareTerminal size={20} /></span>
                    <span><strong>Claude Code</strong><small>{t("코딩 에이전트 터미널", "Coding agent terminal")}</small></span>
                  </button>
                </>
              ) : (
                <>
                  <button
                    type="button"
                    className="settings-theme-card is-classic"
                    data-selected={visualTheme === "classic"}
                    aria-pressed={visualTheme === "classic"}
                    onClick={() => update({ visualTheme: "classic" })}
                  >
                    <span className="settings-theme-preview" aria-hidden="true"><LayoutTemplate size={20} /></span>
                    <span><strong>{t("기본", "Default")}</strong><small>{t("움직이는 배경", "Animated background")}</small></span>
                  </button>
                  <button
                    type="button"
                    className="settings-theme-card is-dark"
                    data-selected={visualTheme === "dark"}
                    aria-pressed={visualTheme === "dark"}
                    onClick={() => update({ visualTheme: "dark" })}
                  >
                    <span className="settings-theme-preview" aria-hidden="true"><Moon size={20} /></span>
                    <span><strong>{t("다크", "Dark")}</strong><small>{t("정적인 어두운 배경", "Static dark background")}</small></span>
                  </button>
                </>
              )}
            </div>
          </section>

          <section className="settings-section">
            <h4>{t("뉴스", "News")}</h4>
            <div className="settings-choice-row">
              <span className="settings-choice-label">{t("타이핑", "Typing source")}</span>
              <div className="settings-segmented" role="group" aria-label={t("뉴스 타이핑 대상", "News typing source")}>
                {([
                  ["title", t("제목", "Title")],
                  ["body", t("본문", "Body")],
                ] as const).map(([value, label]) => (
                  <button
                    key={value}
                    type="button"
                    data-selected={newsTypingTarget === value}
                    aria-pressed={newsTypingTarget === value}
                    onClick={() => update({ newsTypingTarget: value })}
                  >
                    {label}
                  </button>
                ))}
              </div>
            </div>
            <div className="settings-choice-row">
              <span className="settings-choice-label">{t("본문 분량", "Body length")}</span>
              <div className="settings-segmented" role="group" aria-label={t("뉴스 본문 분량", "News body length")}>
                {([
                  ["small", t("적게", "Short")],
                  ["medium", t("중간", "Medium")],
                  ["large", t("많이", "Long")],
                ] as const).map(([value, label]) => (
                  <button
                    key={value}
                    type="button"
                    data-selected={newsBodyAmount === value}
                    aria-pressed={newsBodyAmount === value}
                    disabled={newsTypingTarget === "title"}
                    onClick={() => update({ newsBodyAmount: value })}
                  >
                    {label}
                  </button>
                ))}
              </div>
            </div>
          </section>

          <section className="settings-section">
            <h4>{t("표시 모드", "Display")}</h4>
            {/* 두 버튼을 한 줄에 나란히 둔다. 따로 두면 세로로 쌓여
                서로 붙어 보인다(.settings-row가 gap을 준다). */}
            <div className="settings-row">
              <button
                id="modeToggleBtn"
                type="button"
                className="chip-pill"
                data-selected={!overlayMode}
                onClick={() => update({ overlayMode: !overlayMode })}
              >
                <ArrowLeftRight size={14} />
                {overlayMode ? t("오버레이 모드", "Overlay mode") : t("입력창 모드", "Input field mode")}
              </button>
              {/* 배경 안개가 떠다니는 것만으로도 GPU가 계속 돈다. 약한 기기에서
                  버벅이면 여기서 끈다. 이 브라우저에만 저장된다. */}
              <button
                type="button"
                className="chip-pill"
                data-selected={backgroundMotion}
                aria-pressed={backgroundMotion}
                onClick={() => setBackgroundMotion(!backgroundMotion)}
              >
                <Waves size={14} />
                {t("배경 움직임", "Background motion")} {backgroundMotion ? t("켬", "On") : t("끔", "Off")}
              </button>
            </div>
            <div className="settings-row">
              <button
                type="button"
                className="chip-pill"
                data-selected={highlightWeakWords}
                aria-pressed={highlightWeakWords}
                onClick={() => update({ highlightWeakWords: !highlightWeakWords })}
              >
                <Highlighter size={14} />
                {t("취약 단어 강조", "Highlight weak words")} {highlightWeakWords ? t("켬", "On") : t("끔", "Off")}
              </button>
            </div>
            <p className="settings-hint">
              {t("끄면 배경이 멎습니다. 화면이 버벅이거나 노트북이 뜨거워질 때 쓰세요.", "Turn this off if animation feels slow or makes your laptop run hot.")}
            </p>
          </section>

          <section className="settings-section">
            <h4>{t("글꼴", "Font")}</h4>
            <div className="settings-font-grid" role="group" aria-label={t("사이트 글꼴", "Site font")}>
              {FONT_OPTIONS.map((option) => (
                <button
                  key={option.id}
                  type="button"
                  data-selected={fontFamily === option.id}
                  aria-pressed={fontFamily === option.id}
                  onClick={() => update({ fontFamily: option.id })}
                >
                  <span style={{ fontFamily: option.family }}>{locale === "en" ? "Aa Bb" : "가나다 Aa"}</span>
                  <small>{locale === "en" ? option.labelEn : option.label}</small>
                </button>
              ))}
            </div>
          </section>

          <section className="settings-section">
            <h4>
              {t("글자 크기", "Font size")}
              <span className="settings-value">{fontSize}px</span>
            </h4>
            <input
              type="range"
              id="fontSizeSlider"
              min={18}
              max={42}
              value={fontSize}
              aria-label={t("글자 크기", "Font size")}
              onChange={(event) => {
                const next = Number(event.target.value);
                update({ fontSize: next });
                document.documentElement.style.setProperty("--font-size-body", `${next}px`);
              }}
            />
          </section>

          {visualTheme === "classic" ? (
            <section className="settings-section">
              <h4>{t("배경", "Background")}</h4>
              <BackgroundOptions />
            </section>
          ) : null}

          {/* 기록 패널을 없애면서 그 아래 있던 단축키 안내를 여기로 옮겼다. */}
          <section className="settings-section">
            <h4>{t("단축키", "Keyboard shortcuts")}</h4>
            <dl className="settings-shortcuts">
              <div>
                <dt>Esc</dt>
                <dd>{t("입력 지우기", "Clear input")}</dd>
              </div>
              <div>
                <dt>
                  Ctrl + <span className="key-char">,</span> / <span className="key-char">.</span>
                </dt>
                <dd>{t("이전 / 다음", "Previous / next")}</dd>
              </div>
              <div>
                <dt>Tab</dt>
                <dd>{t("다음", "Next")}</dd>
              </div>
              <div>
                <dt>{t("로고 5회 클릭", "Click logo 5 times")}</dt>
                <dd>{t("타건음 On/Off", "Typing sound on/off")}</dd>
              </div>
            </dl>
                </section>
              </aside>
            </>,
            document.body,
          )
        : null}
    </div>
  );
}
