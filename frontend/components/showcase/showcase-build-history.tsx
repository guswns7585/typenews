"use client";

import { useEffect, useState } from "react";
import type { ShowcaseBuildEvent } from "@/features/showcase/types";
import { getSupabaseClient } from "@/lib/supabase/client";
import { useUiLanguage } from "@/lib/ui-language";
import styles from "./showcase.module.css";

export function ShowcaseBuildHistory({ itemId }: { itemId: string }) {
  const { t } = useUiLanguage();
  const [events, setEvents] = useState<ShowcaseBuildEvent[]>([]);

  useEffect(() => {
    const supabase = getSupabaseClient();
    if (!supabase) return;
    let active = true;
    void Promise.resolve().then(async () => {
      const { data, error } = await supabase.rpc("get_showcase_build_events", { p_item_id: itemId });
      if (active && !error) setEvents((data ?? []) as ShowcaseBuildEvent[]);
    });
    return () => { active = false; };
  }, [itemId]);

  if (!events.length) return null;
  return <section className={styles.buildHistory}>
    <header><h2>{t("빌드 기록", "Build history")}</h2><span>{events.length}</span></header>
    <ol>{events.map((event) => <li key={event.event_id}><time>{new Intl.DateTimeFormat(t("ko-KR", "en"), { dateStyle: "medium" }).format(new Date(`${event.event_date}T00:00:00`))}</time><div><strong>{event.title}</strong>{event.details ? <p>{event.details}</p> : null}</div></li>)}</ol>
  </section>;
}
