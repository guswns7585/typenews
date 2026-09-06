"use client";

import { type CSSProperties, useEffect, useState } from "react";
import { MonthlyRanking } from "@/components/ranking/monthly-ranking";
import { getSupabaseClient } from "@/lib/supabase/client";
import { useUiLanguage } from "@/lib/ui-language";

type Prize = {
  /** 카드에 표시되는 이름. 임의로 바꾸지 말 것. */
  name: string;
  /** 이름이 길어 줄인 경우의 원래 표기. 마우스를 올리면 보인다. */
  fullName?: string;
  image?: string;
  href?: string;
};

type PrizeRow = {
  name: string;
  full_name: string | null;
  image_url: string | null;
  link_url: string | null;
};

/**
 * 경품 폴백.
 *
 * event_prizes 테이블이 비어 있거나 조회에 실패하면 이것을 쓴다.
 * 관리자 페이지에서 표를 채우면 그쪽이 우선한다.
 *
 * ⚠️ DB를 채운 뒤에도 지우지 말 것. 조회가 실패했을 때 이벤트 페이지가
 * 빈 화면이 되는 것보다 낡은 목록이라도 보이는 편이 낫다.
 *
 * image가 없으면 자리만 잡아두고 "준비 중"으로 표시한다.
 */
const fallbackPrizes: Prize[] = [
  { name: "포피즈", image: "/pride.jpg", href: "https://smartstore.naver.com/sandunart" },
  { name: "햄찌 키캡 (랜덤)", image: "/prize.jpg", href: "https://smartstore.naver.com/keypiece" },
  {
    name: "HMX KD400 스위치",
    fullName: "80Retros x HMX KD400 40gf 35개입 x 3개",
  },
];

function usePrizes() {
  const [prizes, setPrizes] = useState<Prize[]>(fallbackPrizes);

  useEffect(() => {
    let active = true;

    async function loadPrizes() {
      const supabase = getSupabaseClient();
      if (!supabase) return;

      /* enabled 행만 정책이 통과시킨다(event_prizes_read).
         정렬은 관리자가 정한 sort_order를 따른다. */
      const { data, error } = await supabase
        .from("event_prizes")
        .select("name, full_name, image_url, link_url")
        .eq("enabled", true)
        .order("sort_order", { ascending: true })
        .order("id", { ascending: true });
      if (!active) return;

      if (error) {
        console.error("경품 목록 불러오기 실패", error);
        return;
      }
      const rows = (data ?? []) as PrizeRow[];
      // 표가 비어 있으면 폴백을 유지한다. 빈 화면보다 낫다.
      if (!rows.length) return;

      setPrizes(
        rows.map((row) => ({
          name: row.name,
          fullName: row.full_name ?? undefined,
          image: row.image_url ?? undefined,
          href: row.link_url ?? undefined,
        })),
      );
    }

    void loadPrizes();
    return () => {
      active = false;
    };
  }, []);

  return prizes;
}

function PrizeCard({ prize, index }: { prize: Prize; index: number }) {
  const { t } = useUiLanguage();
  const thumbnail = prize.image ? (
    // eslint-disable-next-line @next/next/no-img-element
    <img src={prize.image} alt={prize.name} />
  ) : (
    <span className="prize-placeholder">{t("준비 중", "Coming soon")}</span>
  );

  return (
    <article
      className={`prize-card${prize.image ? "" : " is-placeholder"}`}
      style={{ "--card-index": index } as CSSProperties}
    >
      <div className="prize-thumb">
        {prize.href ? (
          <a href={prize.href} target="_blank" rel="noreferrer">
            {thumbnail}
          </a>
        ) : (
          thumbnail
        )}
      </div>
      <div className="prize-meta">
        <h5 title={prize.fullName ?? prize.name}>{prize.name}</h5>
      </div>
    </article>
  );
}

export function EventContent() {
  const { t } = useUiLanguage();
  const prizes = usePrizes();

  return (
    <div id="event-tab">
      <div className="event-header">
        <p>Type News Ranking</p>
        <h1>{t("이달의 랭킹 & 진행 중인 이벤트", "Monthly ranking & current event")}</h1>
      </div>

      <div className="ranking-event-wrapper">
        <section className="ranking-panel">
          <header className="ranking-panel-head">
            <h2>{t("이달의 랭킹", "Monthly ranking")}</h2>
            <span>{t("타수 기준", "By keystrokes")}</span>
          </header>
          <MonthlyRanking />
        </section>

        <section id="event-info-box">
          <header className="event-section-head">
            <h2>{t("이달의 경품", "This month's prizes")}</h2>
          </header>

          <div className="prize-grid">
            {prizes.map((prize, index) => (
              <PrizeCard key={prize.name} prize={prize} index={index} />
            ))}
          </div>

          <div className="event-description">
            <p>{t("매월 순위를 집계하여 추첨을 진행하며, 점수가 높을수록 당첨 확률이 올라갑니다.", "A monthly draw is held from the ranking. A higher score increases your chance of winning.")}</p>
            <p>{t("매월 1일 랭킹은 초기화되며, 당첨자는 로그인된 이메일로 개별 연락드립니다.", "The ranking resets on the first day of each month. Winners are contacted at their sign-in email.")}</p>
            <p>{t("일정 기간 응답이 없을 경우 당첨은 무효 처리되며, 재추첨이 진행됩니다.", "If a winner does not respond by the deadline, the prize may be redrawn.")}</p>
          </div>

          <div className="event-warning">
            <p>{t("부정 행위 적발 시 경고 없이 당첨 자격이 박탈될 수 있습니다.", "Fraudulent activity may result in disqualification without notice.")}</p>
            {/* 13:00이라고 안내하던 시절이 있었지만 서버는 그 시각에 아무것도 하지
                않았다. 점수는 말일 자정까지 쌓인다. 안내를 실제 동작에 맞춘다. */}
            <p>{t("랭킹 마감은 매월 마지막 날 23:59이며, 추첨은 다음 달 1일에 진행됩니다.", "The ranking closes at 23:59 on the last day of each month, and the draw takes place on the first day of the next month.")}</p>
          </div>

          <p className="event-fine-print">{t("본 이벤트는 Type News 운영 상황에 따라 조정될 수 있습니다.", "This event may be adjusted depending on Type News operations.")}</p>
        </section>
      </div>
    </div>
  );
}
