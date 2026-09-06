"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { useEffect } from "react";
import { motion, useReducedMotion } from "motion/react";
import { AdminNavLink } from "@/components/admin/admin-nav-link";
import { AuthButton } from "@/components/auth/auth-button";
import { NicknameSetupModal } from "@/components/auth/nickname-setup-modal";
import { LogoMark } from "@/components/brand/logo-mark";
import { PrizeClaim } from "@/components/event/prize-claim";
import { AgentChrome, AgentWorkbench, type AgentTheme } from "@/components/layout/agent-workspace";
import { FabMail } from "@/components/layout/fab-mail";
import { HeaderStats } from "@/components/layout/header-stats";
import {
  SpreadsheetChrome,
  SpreadsheetDataLayer,
  SpreadsheetEditableGrid,
} from "@/components/layout/spreadsheet-chrome";
import { VscodeChrome, VscodeWorkbench } from "@/components/layout/vscode-chrome";
import { TerminalChrome, TerminalWorkbench } from "@/components/layout/terminal-chrome";
import { PreferencesSync } from "@/components/settings/preferences-sync";
import { SettingsMenu } from "@/components/settings/settings-menu";
import { AnalyticsMenu } from "@/components/settings/analytics-menu";
import { TopBar } from "@/components/layout/top-bar";
import { useUiLanguage } from "@/lib/ui-language";
import {
  applyBackgroundToBody,
  prepareStaticThemeBody,
  setMeshMotionAllowed,
  useUiStore,
  watchReducedMotion,
} from "@/stores/use-ui-store";
import { useSettingsStore } from "@/stores/use-settings-store";

type LegacyShellProps = {
  children: React.ReactNode;
  showTypingChrome?: boolean;
  /** 관리자 표처럼 980px 안에 들어가지 않는 화면에서 본문 폭을 넓힌다. */
  wide?: boolean;
};

const MotionLink = motion.create(Link);

export function LegacyShell({ children, showTypingChrome = true, wide = false }: LegacyShellProps) {
  const pathname = usePathname();
  const background = useUiStore((s) => s.background);
  const solidColor = useUiStore((s) => s.solidColor);
  const gradientColors = useUiStore((s) => s.gradientColors);
  const customTextColor = useUiStore((s) => s.customTextColor);
  const customButtonBg = useUiStore((s) => s.customButtonBg);
  const gradientTextColor = useUiStore((s) => s.gradientTextColor);
  const gradientButtonBg = useUiStore((s) => s.gradientButtonBg);
  const backgroundMotion = useUiStore((s) => s.backgroundMotion);
  const fontFamily = useSettingsStore((s) => s.fontFamily);
  const visualTheme = useSettingsStore((s) => s.visualTheme);
  const { locale, t } = useUiLanguage();
  const isTyping = pathname === "/";
  const isEvent = pathname === "/event";
  const isAdmin = pathname.startsWith("/admin");
  const selectedNavTab = isTyping ? "typing" : isEvent ? "event" : null;
  const reduceNavMotion = useReducedMotion();
  const isSpreadsheet = !isAdmin && visualTheme === "spreadsheet";
  const isVscode = !isAdmin && visualTheme === "vscode";
  const isTerminal = !isAdmin && visualTheme === "terminal";
  const isAgentTheme = !isAdmin && (visualTheme === "codex" || visualTheme === "claude" || visualTheme === "claude-code");
  const isLoafingTheme = isSpreadsheet || isVscode || isTerminal || isAgentTheme;
  const useEmbeddedTypingChrome = showTypingChrome && isTyping && !isLoafingTheme;
  const useShellTypingChrome = showTypingChrome && isTyping && isLoafingTheme;

  // OS의 "동작 줄이기"를 도중에 바꿔도 배경이 바로 따라오게 한다.
  useEffect(() => watchReducedMotion(), []);

  useEffect(() => {
    if (isAdmin) return prepareStaticThemeBody();
    if (visualTheme !== "classic") return prepareStaticThemeBody();
    const cleanup = applyBackgroundToBody(background, {
      solidColor,
      gradientColors,
      customTextColor,
      customButtonBg,
      gradientTextColor,
      gradientButtonBg,
    });
    /* 저장된 "배경 움직임" 설정을 반영한다. applyBackgroundToBody가 이미 움직임을
       시작했으므로 그 뒤에 불러야 꺼둔 사람에게서 확실히 멈춘다. */
    setMeshMotionAllowed(backgroundMotion);
    return cleanup;
  }, [
    backgroundMotion,
    background,
    solidColor,
    gradientColors,
    customTextColor,
    customButtonBg,
    gradientTextColor,
    gradientButtonBg,
    visualTheme,
    isAdmin,
  ]);

  useEffect(() => {
    document.documentElement.dataset.fontFamily = fontFamily;
  }, [fontFamily]);

  useEffect(() => {
    document.documentElement.dataset.visualTheme = isAdmin ? "admin" : visualTheme;
  }, [isAdmin, visualTheme]);

  useEffect(() => {
    document.documentElement.lang = locale;
    document.documentElement.dataset.uiLocale = locale;
  }, [locale]);

  return (
    <>
      <div className="mesh-scene" aria-hidden="true">
        <span className="mesh-blob mesh-blob-1" />
        <span className="mesh-blob mesh-blob-2" />
        <span className="mesh-blob mesh-blob-3" />
        <span className="mesh-blob mesh-blob-4" />
        <span className="mesh-blob mesh-blob-5" />
      </div>
      <div className="app-canvas">
      <PreferencesSync />
      {isSpreadsheet ? <SpreadsheetChrome showSettings={isTyping} /> : null}
      {isVscode ? <VscodeChrome showSettings={isTyping} /> : null}
      {isTerminal ? <TerminalChrome showSettings={isTyping} /> : null}
      {isAgentTheme ? <AgentChrome theme={visualTheme as AgentTheme} showSettings={isTyping} /> : null}
      <header className="global-nav">
        <div className="global-nav-left">
          <Link href="/" className="global-nav-brand" aria-label={t("Type News 홈", "Type News home")}>
            <LogoMark />
          </Link>
          <nav className="global-nav-links">
            <MotionLink
              href="/"
              aria-current={isTyping ? "page" : undefined}
              whileTap={reduceNavMotion ? undefined : { scale: 0.96 }}
              whileFocus={reduceNavMotion ? undefined : { scale: 1.025 }}
            >
              {selectedNavTab === "typing" ? (
                <motion.span
                  className="global-nav-tab-indicator"
                  layoutId="primary-nav-tab-selection"
                  transition={reduceNavMotion
                    ? { duration: 0.01 }
                    : { type: "spring", stiffness: 470, damping: 38, mass: 0.72 }}
                />
              ) : null}
              <span className="global-nav-tab-label">{t("타이핑", "Typing")}</span>
            </MotionLink>
            <MotionLink
              href="/event"
              aria-current={isEvent ? "page" : undefined}
              whileTap={reduceNavMotion ? undefined : { scale: 0.96 }}
              whileFocus={reduceNavMotion ? undefined : { scale: 1.025 }}
            >
              {selectedNavTab === "event" ? (
                <motion.span
                  className="global-nav-tab-indicator"
                  layoutId="primary-nav-tab-selection"
                  transition={reduceNavMotion
                    ? { duration: 0.01 }
                    : { type: "spring", stiffness: 470, damping: 38, mass: 0.72 }}
                />
              ) : null}
              <span className="global-nav-tab-label">{t("이벤트", "Event")}</span>
            </MotionLink>
          </nav>
        </div>
        {/* 내 기록. 오른쪽 접이식 패널을 걷어내고 헤더 가운데로 올렸다. */}
        {isTyping ? <HeaderStats /> : null}

        <div className="global-nav-right">
          {isTyping ? <><AnalyticsMenu /><SettingsMenu /></> : null}
          <AdminNavLink />
          <AuthButton />
        </div>
      </header>

      {/* 당첨 안내는 어느 화면에 있든 보여야 한다. 타이핑 중에도 놓치면 안 된다. */}
      <PrizeClaim />

      {useShellTypingChrome ? (
        <div className="sub-nav-frosted">
          <div className="sub-nav-group">
            <TopBar />
          </div>
        </div>
      ) : null}

      <main
        className={wide ? "content-column content-column-wide" : "content-column"}
        data-typing-chrome={useEmbeddedTypingChrome ? "embedded" : undefined}
      >
        {isSpreadsheet ? (
          <div className="spreadsheet-workbook">
            <div className="spreadsheet-corner" aria-hidden="true" />
            <div className="spreadsheet-column-heads" aria-hidden="true">
              {Array.from({ length: 14 }, (_, index) => (
                <span key={index}>{String.fromCharCode(65 + index)}</span>
              ))}
            </div>
            <div className="spreadsheet-row-heads" aria-hidden="true">
              {Array.from({ length: 24 }, (_, index) => <span key={index}>{index + 1}</span>)}
            </div>
            <div className="spreadsheet-sheet">
              <SpreadsheetEditableGrid />
              <SpreadsheetDataLayer />
              {children}
            </div>
            <footer className="spreadsheet-sheet-tabs" aria-hidden="true">
              <span className="spreadsheet-sheet-nav">‹  ›</span>
              <span className="is-active">{t("업무 현황", "Operations")}</span>
              <span>{t("월간 실적", "Monthly results")}</span>
              <span>{t("참고 자료", "Reference")}</span>
              <b>＋</b>
            </footer>
          </div>
        ) : isVscode ? (
          <VscodeWorkbench>{children}</VscodeWorkbench>
        ) : isTerminal ? (
          <TerminalWorkbench>{children}</TerminalWorkbench>
        ) : isAgentTheme ? (
          <AgentWorkbench theme={visualTheme as AgentTheme}>{children}</AgentWorkbench>
        ) : children}
      </main>

      <FabMail />
        <NicknameSetupModal />
      </div>
    </>
  );
}
