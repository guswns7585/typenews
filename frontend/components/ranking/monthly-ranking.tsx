"use client";

import { useEffect, useState } from "react";
import { getSupabaseClient } from "@/lib/supabase/client";
import type { RankingEntry } from "@/lib/types";

type RankingRow = {
  profile_id: string;
  display_name: string;
  typing_count: number;
};

function seoulMonthId() {
  const parts = new Intl.DateTimeFormat("en-US", {
    timeZone: "Asia/Seoul",
    year: "numeric",
    month: "2-digit",
  }).formatToParts();
  return `${parts.find((part) => part.type === "year")?.value}${parts.find((part) => part.type === "month")?.value}`;
}

export function MonthlyRanking() {
  const [entries, setEntries] = useState<RankingEntry[]>([]);
  const [status, setStatus] = useState("랭킹을 불러오는 중입니다.");

  useEffect(() => {
    let active = true;
    async function loadRanking() {
      try {
        const { data, error } = await getSupabaseClient().rpc("get_monthly_ranking", {
          p_month_id: seoulMonthId(),
        });
        if (!active) return;
        if (error) {
          setStatus("로그인 후 이번 달의 랭킹을 확인할 수 있습니다.");
          return;
        }
        setEntries(
          ((data ?? []) as RankingRow[]).map((entry) => ({
            profileId: entry.profile_id,
            displayName: entry.display_name,
            typingCount: entry.typing_count,
          })),
        );
        setStatus(data?.length ? "" : "아직 이번 달 기록이 없습니다.");
      } catch {
        if (active) setStatus("환경 설정 후 랭킹을 표시합니다.");
      }
    }
    void loadRanking();
    return () => {
      active = false;
    };
  }, []);

  return (
    <ul id="monthly-ranking-list">
      {status ? (
        <li style={{ fontSize: 14, color: "var(--color-ink-muted-48)", listStyle: "none" }}>{status}</li>
      ) : (
        entries.map((entry, index) => (
          <li key={entry.profileId} className="card-style">
            <div className="card-left">
              <span>{index + 1}.</span>
              <span>{entry.displayName}</span>
            </div>
            <div className="card-right">{entry.typingCount}</div>
          </li>
        ))
      )}
    </ul>
  );
}
