"use client";

import type { ProfileDecoration } from "@/features/profile/decorations";
import { useUiLanguage } from "@/lib/ui-language";
import styles from "./profile-decoration-line.module.css";

export function ProfileDecorationLine({ decoration }: { decoration?: ProfileDecoration | null }) {
  const { locale } = useUiLanguage();
  if (!decoration?.title_id && !decoration?.badges.length) return null;
  const title = locale === "ko" ? decoration.title_ko : decoration.title_en;
  return (
    <span className={styles.line}>
      {title ? <span className={styles.title}>{title}</span> : null}
      {decoration.badges.map((badge) => (
        <span className={styles.badge} key={badge.id} title={locale === "ko" ? badge.nameKo : badge.nameEn}>{badge.mark}</span>
      ))}
    </span>
  );
}
