"use client";

import { useEffect, useState } from "react";
import { useAuthProfile } from "@/components/auth/auth-button";
import type { MyAchievementState } from "@/features/profile/decorations";
import { getSupabaseClient } from "@/lib/supabase/client";
import { messageOf } from "@/lib/supabase/errors";
import { useUiLanguage } from "@/lib/ui-language";
import styles from "./profile-achievements.module.css";

const EMPTY_STATE: MyAchievementState = {
  equippedTitleId: null,
  equippedBadgeIds: [],
  achievements: [],
};

export function ProfileAchievements() {
  const { signedIn, authReady } = useAuthProfile();
  const { locale, t } = useUiLanguage();
  const [state, setState] = useState<MyAchievementState>(EMPTY_STATE);
  const [titleId, setTitleId] = useState<string | null>(null);
  const [badgeIds, setBadgeIds] = useState<string[]>([]);
  const [loading, setLoading] = useState(false);
  const [saving, setSaving] = useState(false);
  const [message, setMessage] = useState("");

  useEffect(() => {
    if (!signedIn) return;
    const supabase = getSupabaseClient();
    if (!supabase) return;
    let active = true;
    void Promise.resolve().then(async () => {
      if (active) setLoading(true);
      const { data, error } = await supabase.rpc("get_my_profile_achievements");
      if (!active) return;
      setLoading(false);
      if (error) {
        setMessage(messageOf(error, t("칭호와 배지를 불러오지 못했습니다", "Could not load titles and badges")));
        return;
      }
      const next = (data ?? EMPTY_STATE) as MyAchievementState;
      setState(next);
      setTitleId(next.equippedTitleId);
      setBadgeIds(next.equippedBadgeIds);
      setMessage("");
    });
    return () => { active = false; };
  }, [signedIn, t]);

  if (!authReady || !signedIn) return null;

  const titles = state.achievements.filter((item) => item.kind === "title");
  const badges = state.achievements.filter((item) => item.kind === "badge");

  function toggleBadge(id: string) {
    setMessage("");
    setBadgeIds((current) => {
      if (current.includes(id)) return current.filter((item) => item !== id);
      if (current.length >= 3) {
        setMessage(t("배지는 3개까지 달 수 있습니다", "You can equip up to three badges"));
        return current;
      }
      return [...current, id];
    });
  }

  async function save() {
    const supabase = getSupabaseClient();
    if (!supabase) return;
    setSaving(true);
    setMessage("");
    const { error } = await supabase.rpc("update_my_profile_decorations", {
      p_title_id: titleId,
      p_badge_ids: badgeIds,
    });
    setSaving(false);
    if (error) {
      setMessage(messageOf(error, t("저장하지 못했습니다", "Could not save")));
      return;
    }
    setState((current) => ({ ...current, equippedTitleId: titleId, equippedBadgeIds: badgeIds }));
    setMessage(t("저장했습니다", "Saved"));
    window.dispatchEvent(new CustomEvent("typenews:profile-decorations-updated"));
  }

  return (
    <section className="settings-section">
      <h4>{t("칭호와 배지", "Titles and badges")}</h4>
      {loading ? <p className="settings-hint">{t("불러오는 중", "Loading")}</p> : (
        <div className={styles.body}>
          <div>
            <span className={styles.label}>{t("칭호", "Title")}</span>
            <div className={styles.titles}>
              <button type="button" data-selected={titleId === null} onClick={() => setTitleId(null)}>{t("사용 안 함", "None")}</button>
              {titles.map((item) => (
                <button key={item.id} type="button" data-selected={titleId === item.id} title={locale === "ko" ? item.descriptionKo : item.descriptionEn} onClick={() => setTitleId(item.id)}>
                  {locale === "ko" ? item.nameKo : item.nameEn}
                </button>
              ))}
            </div>
          </div>
          <div>
            <span className={styles.label}>{t("배지", "Badges")} <small>{badgeIds.length}/3</small></span>
            <div className={styles.badges}>
              {badges.map((item) => (
                <button key={item.id} type="button" data-selected={badgeIds.includes(item.id)} title={locale === "ko" ? item.descriptionKo : item.descriptionEn} onClick={() => toggleBadge(item.id)}>
                  <span>{item.mark}</span>{locale === "ko" ? item.nameKo : item.nameEn}
                </button>
              ))}
            </div>
          </div>
          <div className={styles.actions}>
            {message ? <span>{message}</span> : <span />}
            <button type="button" className="chip-pill" disabled={saving} onClick={() => void save()}>{saving ? t("저장 중", "Saving") : t("저장", "Save")}</button>
          </div>
        </div>
      )}
    </section>
  );
}
