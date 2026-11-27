"use client";

import { useEffect, useState } from "react";
import { useUiLanguage } from "@/lib/ui-language";
import styles from "./deployment-update-notice.module.css";

const BUILD_VERSION = process.env.NEXT_PUBLIC_TYPENEWS_BUILD_VERSION;
const MIN_CHECK_INTERVAL_MS = 60_000;
const PERIODIC_CHECK_INTERVAL_MS = 5 * MIN_CHECK_INTERVAL_MS;

export function DeploymentUpdateNotice() {
  const { t } = useUiLanguage();
  const [visible, setVisible] = useState(false);

  useEffect(() => {
    if (process.env.NODE_ENV !== "production" || !BUILD_VERSION) return;

    let lastCheck = -Infinity;
    let checking = false;
    let updateFound = false;
    const controller = new AbortController();

    async function check(restoredFromCache = false) {
      if (updateFound || checking || document.visibilityState !== "visible") return;
      const now = performance.now();
      if (!restoredFromCache && now - lastCheck < MIN_CHECK_INTERVAL_MS) return;

      lastCheck = now;
      checking = true;
      try {
        const response = await fetch("/api/deployment", {
          cache: "no-store",
          credentials: "omit",
          signal: controller.signal,
        });
        if (!response.ok) return;
        const deployment = await response.json();
        const version = deployment?.version;
        if (!controller.signal.aborted && typeof version === "string" && version && version !== BUILD_VERSION) {
          updateFound = true;
          setVisible(true);
        }
      } catch {
        // A failed request leaves the current session usable. The next check can retry.
      } finally {
        checking = false;
      }
    }

    const checkWhenVisible = () => void check();
    const onPageShow = (event: PageTransitionEvent) => void check(event.persisted);
    window.addEventListener("pageshow", onPageShow);
    window.addEventListener("focus", checkWhenVisible);
    document.addEventListener("visibilitychange", checkWhenVisible);
    const timer = window.setInterval(checkWhenVisible, PERIODIC_CHECK_INTERVAL_MS);
    checkWhenVisible();

    return () => {
      controller.abort();
      window.clearInterval(timer);
      window.removeEventListener("pageshow", onPageShow);
      window.removeEventListener("focus", checkWhenVisible);
      document.removeEventListener("visibilitychange", checkWhenVisible);
    };
  }, []);

  if (!visible) return null;

  return (
    <aside className={styles.notice} aria-label={t("사이트 업데이트", "Site update")}>
      <span role="status">{t("새 버전이 나왔어요.", "A new version is available.")}</span>
      <button type="button" onClick={() => window.location.reload()}>
        {t("새로고침", "Reload")}
      </button>
      <button type="button" onClick={() => setVisible(false)}>
        {t("나중에", "Later")}
      </button>
    </aside>
  );
}
