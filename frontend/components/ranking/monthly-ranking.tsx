"use client";

import { type CSSProperties, useEffect, useState } from "react";
import { AnimatePresence, LayoutGroup, motion, useReducedMotion } from "motion/react";
import { ScoreValue } from "@/components/common/score-value";
import {
  PROFILE_PHOTO_UPDATED_EVENT,
  publicProfilePhotoUrl,
} from "@/features/profile/profile-photo";
import { seoulMonthId } from "@/lib/month";
import { getSupabaseClient } from "@/lib/supabase/client";
import type { RankingEntry } from "@/lib/types";
import { useUiLanguage } from "@/lib/ui-language";

type RankingRow = {
  profile_id: string;
  display_name: string;
  /** 이번 달 누적 타수. 0006부터 문장 수가 아니다. */
  score: number;
  photo_path?: string | null;
  thumbnail_path?: string | null;
  photo_updated_at?: string | null;
};

type MyRankingRow = RankingRow & {
  rank: number | null;
  participant_count: number;
};

type MyRankingEntry = RankingEntry & {
  rank: number | null;
  participantCount: number;
};

/**
 * 갱신 주기.
 *
 * 원본은 Firestore onSnapshot 실시간 리스너를 썼지만, Supabase Realtime은 RLS가
 * 본인 행만 통과시켜 남의 점수 변화를 받을 수 없다. 그래서 폴링으로 대신한다.
 * 화면이 보이지 않을 때는 돌지 않는다.
 */
const REFRESH_INTERVAL_MS = 30_000;


export function MonthlyRanking() {
  const { t } = useUiLanguage();
  const reduceMotion = useReducedMotion();
  const [entries, setEntries] = useState<RankingEntry[]>([]);
  const [myEntry, setMyEntry] = useState<MyRankingEntry | null>(null);
  const [expandedCardKey, setExpandedCardKey] = useState<string | null>(null);
  const [status, setStatus] = useState<"loading" | "config" | "unavailable" | "empty" | "error" | "">("loading");

  useEffect(() => {
    const configuredClient = getSupabaseClient();
    if (!configuredClient) {
      const configTimer = window.setTimeout(() => setStatus("config"), 0);
      return () => window.clearTimeout(configTimer);
    }
    const supabase = configuredClient;
    let active = true;
    let hasLoaded = false;
    let timer: number | null = null;

    async function loadRanking() {
      try {
        const { data, error } = await supabase.rpc("get_monthly_ranking", {
          p_month_id: seoulMonthId(),
        });
        if (!active) return;

        if (error) {
          // 갱신에 실패했다고 이미 보고 있던 순위를 지우지는 않는다.
          if (!hasLoaded) setStatus("unavailable");
          return;
        }

        const rows = (data ?? []) as RankingRow[];
        setEntries(
          rows.map((entry) => ({
            profileId: entry.profile_id,
            displayName: entry.display_name,
            score: entry.score,
            photoPath: entry.photo_path,
            thumbnailPath: entry.thumbnail_path,
            photoUpdatedAt: entry.photo_updated_at,
          })),
        );
        setStatus(rows.length ? "" : "empty");
        hasLoaded = true;

        const { data: sessionData } = await supabase.auth.getSession();
        if (!active) return;
        if (!sessionData.session) {
          setMyEntry(null);
          return;
        }

        const { data: myData, error: myError } = await supabase.rpc("get_my_monthly_rank", {
          p_month_id: seoulMonthId(),
        });
        if (!active) return;
        if (myError) {
          setMyEntry(null);
          return;
        }
        const row = ((myData ?? []) as MyRankingRow[])[0];
        setMyEntry(row ? {
          profileId: row.profile_id,
          displayName: row.display_name,
          score: row.score,
          rank: row.rank,
          participantCount: row.participant_count,
          photoPath: row.photo_path,
          thumbnailPath: row.thumbnail_path,
          photoUpdatedAt: row.photo_updated_at,
        } : null);
      } catch {
        if (active && !hasLoaded) setStatus("error");
      }
    }

    function start() {
      if (timer !== null) return;
      timer = window.setInterval(() => void loadRanking(), REFRESH_INTERVAL_MS);
    }

    function stop() {
      if (timer === null) return;
      window.clearInterval(timer);
      timer = null;
    }

    function onVisibilityChange() {
      if (document.visibilityState === "visible") {
        // 돌아왔을 때 낡은 순위를 그대로 두지 않도록 즉시 한 번 받아온다.
        void loadRanking();
        start();
      } else {
        stop();
      }
    }

    void loadRanking();
    if (document.visibilityState === "visible") start();
    document.addEventListener("visibilitychange", onVisibilityChange);
    window.addEventListener(PROFILE_PHOTO_UPDATED_EVENT, loadRanking);
    const { data: authSubscription } = supabase.auth.onAuthStateChange(() => {
      window.setTimeout(() => void loadRanking(), 0);
    });

    return () => {
      active = false;
      stop();
      document.removeEventListener("visibilitychange", onVisibilityChange);
      window.removeEventListener(PROFILE_PHOTO_UPDATED_EVENT, loadRanking);
      authSubscription.subscription.unsubscribe();
    };
  }, []);

  const statusText = {
    loading: t("랭킹을 불러오는 중입니다.", "Loading the ranking."),
    config: t("Supabase 설정이 없어 랭킹을 표시할 수 없습니다.", "The ranking is unavailable because Supabase is not configured."),
    unavailable: t("이번 달 랭킹을 확인할 수 없습니다.", "This month's ranking is unavailable."),
    empty: t("아직 이번 달 기록이 없습니다.", "There are no records for this month yet."),
    error: t("환경 설정 문제로 랭킹을 표시하지 못했습니다.", "The ranking could not be displayed."),
    "": "",
  }[status];

  function renderRankingCard(
    entry: RankingEntry,
    rank: number | null,
    cardKey: string,
    rowIndex?: number,
  ) {
    const supabase = getSupabaseClient();
    const thumbnailUrl = supabase
      ? publicProfilePhotoUrl(supabase, entry.thumbnailPath, entry.photoUpdatedAt)
      : null;
    const fullPhotoUrl = supabase
      ? publicProfilePhotoUrl(supabase, entry.photoPath, entry.photoUpdatedAt)
      : null;
    const isExpanded = expandedCardKey === cardKey;
    const canExpand = Boolean(fullPhotoUrl && thumbnailUrl);
    const photoLayoutId = `ranking-photo:${cardKey}`;

    return (
      <motion.li
        key={cardKey}
        layout="position"
        transition={{ layout: { type: "spring", stiffness: 360, damping: 34, mass: 0.8 } }}
        className={`card-style ranking-photo-card${canExpand ? " has-photo" : ""}${isExpanded ? " is-expanded" : ""}`}
        data-rank={rank && rank <= 3 ? rank : undefined}
        style={rowIndex === undefined ? undefined : { "--row-index": rowIndex } as CSSProperties}
      >
        <div className="ranking-row-toggle">
          {canExpand ? (
            <button
              type="button"
              className="ranking-expand-hit"
              aria-expanded={isExpanded}
              aria-label={t(`${entry.displayName}님의 사진 보기`, `View ${entry.displayName}'s photo`)}
              onClick={() => setExpandedCardKey(isExpanded ? null : cardKey)}
            />
          ) : null}
          {thumbnailUrl ? (
            // The upload pipeline already fixes the thumbnail at 480x160 WebP.
            <motion.img
              layoutId={photoLayoutId}
              transition={{ layout: { type: "spring", stiffness: 330, damping: 32, mass: 0.82 } }}
              className="ranking-photo-strip"
              src={thumbnailUrl}
              alt=""
              loading="lazy"
              decoding="async"
            />
          ) : null}
          {thumbnailUrl ? <span className="ranking-row-shade" aria-hidden="true" /> : null}
          <span className="card-left">
            <span className="rank-badge">{rank ?? "–"}</span>
            <span className="rank-name">{entry.displayName}</span>
          </span>
          <span className="card-right">
            <ScoreValue value={entry.score} unit={t("점", " points")} />
            <em>{t("점", "pts")}</em>
          </span>
        </div>
        <AnimatePresence initial={false}>
          {isExpanded && fullPhotoUrl ? (
            <motion.div
              key="expanded-photo"
              className="ranking-photo-expanded"
              initial={reduceMotion ? false : { height: 0, opacity: 0 }}
              animate={{ height: "auto", opacity: 1 }}
              exit={reduceMotion ? { opacity: 0 } : { height: 0, opacity: 0 }}
              transition={reduceMotion
                ? { duration: 0.01 }
                : {
                    height: { duration: 0.46, ease: [0.22, 1, 0.36, 1] },
                    opacity: { duration: 0.24, ease: "easeOut" },
                  }}
            >
              <motion.div
                className="ranking-photo-expanded-inner"
                initial={reduceMotion ? false : { y: -10, scale: 0.985 }}
                animate={{ y: 0, scale: 1 }}
                exit={reduceMotion ? undefined : { y: -6, scale: 0.99 }}
                transition={{ duration: 0.42, ease: [0.22, 1, 0.36, 1] }}
              >
                {/* The backdrop uses the same cached image and only exists while open. */}
                {/* eslint-disable-next-line @next/next/no-img-element */}
                <img
                  className="ranking-photo-backdrop"
                  src={fullPhotoUrl}
                  alt=""
                  aria-hidden="true"
                  decoding="async"
                />
                <figure className="ranking-photo-frame">
                  <motion.img
                    layoutId={photoLayoutId}
                    transition={{ layout: { type: "spring", stiffness: 330, damping: 32, mass: 0.82 } }}
                    className="ranking-photo-main"
                    src={fullPhotoUrl}
                    alt={t(`${entry.displayName}님의 프로필 사진`, `${entry.displayName}'s profile photo`)}
                    decoding="async"
                  />
                </figure>
              </motion.div>
            </motion.div>
          ) : null}
        </AnimatePresence>
      </motion.li>
    );
  }

  return (
    <LayoutGroup id="monthly-ranking-cards">
      <div className="monthly-ranking-stack">
      {myEntry ? (
        <section className="my-ranking-pin" aria-label={t("내 랭킹", "My ranking")}>
          <header>
            <strong>{t("내 순위", "My rank")}</strong>
            <span>
              {myEntry.rank
                ? t(`${myEntry.rank}위`, `#${myEntry.rank}`)
                : t("이번 달 참가 전", "Not ranked this month")}
            </span>
          </header>
          <ul className="my-ranking-card-list">
            {renderRankingCard(myEntry, myEntry.rank, `self:${myEntry.profileId}`)}
          </ul>
        </section>
      ) : null}
      <ul id="monthly-ranking-list">
        {statusText ? (
          <li style={{ fontSize: 14, color: "var(--color-ink-muted-48)", listStyle: "none" }}>{statusText}</li>
        ) : (
          entries.map((entry, index) => renderRankingCard(entry, index + 1, `list:${entry.profileId}`, index))
        )}
      </ul>
      </div>
    </LayoutGroup>
  );
}
