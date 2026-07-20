"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { AuthButton } from "@/components/auth/auth-button";
import { ChromeControls } from "@/components/layout/chrome-controls";
import { FabMail } from "@/components/layout/fab-mail";
import { InfoPanel } from "@/components/layout/info-panel";
import { TopBar } from "@/components/layout/top-bar";

type LegacyShellProps = {
  children: React.ReactNode;
  showTypingChrome?: boolean;
};

export function LegacyShell({ children, showTypingChrome = true }: LegacyShellProps) {
  const pathname = usePathname();
  const isTyping = pathname === "/";
  const isEvent = pathname === "/event";

  return (
    <div className="app-canvas">
      <header className="global-nav">
        <div className="global-nav-left">
          <Link href="/" className="global-nav-brand">
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img src="/newtypenewslogo.svg" alt="Type News" />
          </Link>
          <nav className="global-nav-links">
            <Link href="/" aria-current={isTyping ? "page" : undefined}>
              타이핑
            </Link>
            <Link href="/event" aria-current={isEvent ? "page" : undefined}>
              이벤트
            </Link>
          </nav>
        </div>
        <div className="global-nav-right">
          <AuthButton />
        </div>
      </header>

      {showTypingChrome && isTyping ? (
        <div className="sub-nav-frosted">
          <div className="sub-nav-group">
            <TopBar />
          </div>
          <div className="sub-nav-group">
            <ChromeControls />
          </div>
        </div>
      ) : null}

      <main className="content-column">{children}</main>

      <FabMail />
      {isTyping ? <InfoPanel /> : null}
    </div>
  );
}
