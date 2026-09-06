"use client";

import { BarChart3, X } from "lucide-react";
import { useEffect, useState } from "react";
import { createPortal } from "react-dom";
import { useAuthProfile } from "@/components/auth/auth-button";
import { TypingAnalyticsSummary } from "@/components/settings/typing-analytics-summary";
import { useUiLanguage } from "@/lib/ui-language";

export function AnalyticsMenu() {
  const [open, setOpen] = useState(false);
  const { signedIn } = useAuthProfile();
  const { t } = useUiLanguage();
  useEffect(() => {
    if (!open) return;
    const onKeyDown = (event: KeyboardEvent) => { if (event.key === "Escape") setOpen(false); };
    document.addEventListener("keydown", onKeyDown);
    return () => document.removeEventListener("keydown", onKeyDown);
  }, [open]);
  return (
    <div className="analytics-menu">
      <button type="button" className="chip-pill" data-selected={open} title={t("통계", "Analytics")} onClick={() => setOpen(true)}><BarChart3 size={14} /> {t("통계", "Analytics")}</button>
      {open ? createPortal(<><div className="analytics-scrim" onClick={() => setOpen(false)} aria-hidden="true" /><section className="analytics-modal" role="dialog" aria-modal="true" aria-label={t("나의 타이핑 통계", "My typing analytics")}><header className="analytics-modal-head"><div><span>PERSONAL REPORT</span><h2>{t("나의 타이핑 통계", "My typing analytics")}</h2></div><button type="button" className="icon-btn-circular" aria-label={t("통계 닫기", "Close analytics")} onClick={() => setOpen(false)}><X size={17} /></button></header><TypingAnalyticsSummary signedIn={signedIn} /></section></>, document.body) : null}
    </div>
  );
}
