"use client";

import { useEffect, useState } from "react";
import {
  millisecondsUntilNextSeoulDay,
  usesHangulDayExperience,
} from "@/lib/hangul-day";

/** 열린 탭도 한국 자정에 한글날 꾸밈을 켜고 끈다. */
export function useHangulDayExperience() {
  const [active, setActive] = useState(false);

  useEffect(() => {
    let timer = 0;

    const sync = () => {
      window.clearTimeout(timer);
      const now = new Date();
      setActive(usesHangulDayExperience(now));
      timer = window.setTimeout(sync, millisecondsUntilNextSeoulDay(now) + 100);
    };

    sync();
    document.addEventListener("visibilitychange", sync);
    return () => {
      window.clearTimeout(timer);
      document.removeEventListener("visibilitychange", sync);
    };
  }, []);

  return active;
}
