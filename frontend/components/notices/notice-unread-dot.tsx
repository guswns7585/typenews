"use client";

import { useEffect, useState } from "react";
import { getSupabaseClient } from "@/lib/supabase/client";

const STORAGE_KEY = "typenews:last-notice-seen";
export const NOTICE_SEEN_EVENT = "typenews:notice-seen";

export function NoticeUnreadDot() {
  const [unread, setUnread] = useState(false);

  useEffect(() => {
    const supabase = getSupabaseClient();
    if (!supabase) return;
    let active = true;

    async function check() {
      const { data, error } = await supabase!.rpc("get_latest_notice_at");
      if (!active || error || !data) return;
      const seen = window.localStorage.getItem(STORAGE_KEY);
      setUnread(!seen || new Date(String(data)).getTime() > new Date(seen).getTime());
    }

    const clear = () => setUnread(false);
    void check();
    window.addEventListener(NOTICE_SEEN_EVENT, clear);
    return () => { active = false; window.removeEventListener(NOTICE_SEEN_EVENT, clear); };
  }, []);

  return unread ? <span className="global-nav-unread-dot" aria-label="읽지 않은 새소식" /> : null;
}

export function markNoticesSeen(value: string) {
  window.localStorage.setItem(STORAGE_KEY, value);
  window.dispatchEvent(new Event(NOTICE_SEEN_EVENT));
}
