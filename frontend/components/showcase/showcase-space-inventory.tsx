"use client";

import { useEffect, useState } from "react";
import { getSupabaseClient } from "@/lib/supabase/client";
import { useUiLanguage } from "@/lib/ui-language";
import styles from "./showcase.module.css";

type PublicGear = { inventory_id: string; category: "keycap" | "switch"; name: string; brand: string; quantity: number; ownership_status: "ordered" | "owned" | "sold"; acquired_at: string | null; notes: string; installed_on: string[] };

export function ShowcaseSpaceInventory({ profileId }: { profileId: string }) {
  const { t } = useUiLanguage();
  const [items, setItems] = useState<PublicGear[]>([]);
  const [category, setCategory] = useState<"keycap" | "switch">("keycap");
  useEffect(() => {
    const supabase = getSupabaseClient();
    if (!supabase) return;
    let active = true;
    void Promise.resolve().then(async () => {
      const { data, error } = await supabase.rpc("get_showcase_space_inventory", { p_profile_id: profileId });
      if (active && !error) setItems((data ?? []) as PublicGear[]);
    });
    return () => { active = false; };
  }, [profileId]);
  if (!items.length) return null;
  const counts = { keycap: items.filter((item) => item.category === "keycap").length, switch: items.filter((item) => item.category === "switch").length };
  const activeCategory = counts[category] ? category : category === "keycap" ? "switch" : "keycap";
  const visible = items.filter((item) => item.category === activeCategory);
  return <section className={styles.publicInventory}>
    <header><h2>{t("보유 장비", "Gear")}</h2><div><button type="button" data-active={activeCategory === "keycap"} onClick={() => setCategory("keycap")}>{t("키캡", "Keycaps")} {counts.keycap}</button><button type="button" data-active={activeCategory === "switch"} onClick={() => setCategory("switch")}>{t("스위치", "Switches")} {counts.switch}</button></div></header>
    <div>{visible.map((item) => <article key={item.inventory_id}><strong>{item.name}</strong><span>{[item.brand, `${item.quantity}${item.category === "switch" ? t("개", " pcs") : t("세트", " sets")}`].filter(Boolean).join(" · ")}</span>{item.installed_on.length ? <small>{t("장착", "Installed")}: {item.installed_on.join(", ")}</small> : null}</article>)}</div>
  </section>;
}
