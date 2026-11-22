"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { Circle, FileCode2, Folder, History, TableProperties } from "lucide-react";
import { useUiLanguage } from "@/lib/ui-language";

export type LoafingNavVariant = "spreadsheet" | "vscode" | "terminal" | "codex" | "claude" | "claude-code";

type NavItem = { href: string; active: (pathname: string) => boolean; labels: Record<LoafingNavVariant, [string, string]> };

const ITEMS: NavItem[] = [
  {
    href: "/", active: (path) => path === "/",
    labels: {
      spreadsheet: ["업무 현황", "Operations"], vscode: ["quality-monitor.ts", "quality-monitor.ts"],
      terminal: ["review", "review"], codex: ["문장 품질 검토", "Prompt quality review"],
      claude: ["입력 검수 워크스페이스", "Input review workspace"], ["claude-code"]: ["quality-session", "quality-session"],
    },
  },
  {
    href: "/event", active: (path) => path === "/event",
    labels: {
      spreadsheet: ["운영 일정", "Schedule"], vscode: ["release-calendar.json", "release-calendar.json"],
      terminal: ["schedule", "schedule"], codex: ["운영 일정 확인", "Review operations schedule"],
      claude: ["운영 일정 확인", "Operations schedule"], ["claude-code"]: ["schedule.json", "schedule.json"],
    },
  },
  {
    href: "/showcase", active: (path) => path.startsWith("/showcase"),
    labels: {
      spreadsheet: ["장비 목록", "Assets"], vscode: ["asset-catalog.json", "asset-catalog.json"],
      terminal: ["assets", "assets"], codex: ["장비 자산 정리", "Organize equipment assets"],
      claude: ["장비 자산 정리", "Equipment asset catalog"], ["claude-code"]: ["assets.json", "assets.json"],
    },
  },
  {
    href: "/notices", active: (path) => path === "/notices",
    labels: {
      spreadsheet: ["변경 기록", "Change log"], vscode: ["CHANGELOG.md", "CHANGELOG.md"],
      terminal: ["changelog", "changelog"], codex: ["변경 기록 확인", "Review change log"],
      claude: ["변경 기록 확인", "Change log review"], ["claude-code"]: ["CHANGELOG.md", "CHANGELOG.md"],
    },
  },
];

export function loafingDocumentLabel(pathname: string, variant: LoafingNavVariant, english = false) {
  const item = ITEMS.find((candidate) => candidate.active(pathname)) ?? ITEMS[0];
  return item.labels[variant][english ? 1 : 0];
}

function NativeIcon({ variant, index }: { variant: LoafingNavVariant; index: number }) {
  if (variant === "vscode") return index === 3 ? <FileCode2 size={13} /> : <span aria-hidden="true">{index === 1 || index === 2 ? "JSON" : "TS"}</span>;
  if (variant === "codex") return index === 0 ? <Folder size={14} /> : index === 3 ? <History size={14} /> : <TableProperties size={14} />;
  if (variant === "claude") return <Circle size={8} />;
  return null;
}

export function LoafingNavigation({ variant }: { variant: LoafingNavVariant }) {
  const pathname = usePathname();
  const { isEnglish, t } = useUiLanguage();

  return (
    <nav className={`loafing-nav is-${variant}`} aria-label={t("작업 화면 이동", "Workspace navigation")}>
      {ITEMS.map((item, index) => {
        const active = item.active(pathname);
        const label = item.labels[variant][isEnglish ? 1 : 0];
        return (
          <Link key={item.href} href={item.href} data-active={active || undefined} aria-current={active ? "page" : undefined}>
            <NativeIcon variant={variant} index={index} />
            <span>{variant === "terminal" ? `[${index + 1}] ${label}` : label}</span>
          </Link>
        );
      })}
    </nav>
  );
}
