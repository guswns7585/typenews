"use client";

import { useEffect } from "react";
import { useHangulDayExperience } from "@/lib/use-hangul-day";

const FAVICON_ID = "hangul-day-favicon";

export function HangulDayFavicon() {
  const active = useHangulDayExperience();

  useEffect(() => {
    document.getElementById(FAVICON_ID)?.remove();
    if (!active) return;

    const link = document.createElement("link");
    link.id = FAVICON_ID;
    link.rel = "icon";
    link.type = "image/svg+xml";
    link.href = "/hangul-day-favicon.svg";
    document.head.append(link);

    return () => link.remove();
  }, [active]);

  return null;
}
