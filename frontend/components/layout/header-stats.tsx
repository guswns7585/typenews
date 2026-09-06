"use client";

import { useEffect, useState } from "react";
import { ScoreValue } from "@/components/common/score-value";
import { seoulMonthId } from "@/lib/month";
import { getSupabaseClient } from "@/lib/supabase/client";
import { useUiLanguage } from "@/lib/ui-language";
import { useTypingStore } from "@/stores/use-typing-store";
import { useUiStore } from "@/stores/use-ui-store";

/**
 * 서버와 맞추는 주기 (완료한 문장 수).
 *
 * 예전에는 sessionCount가 바뀔 때마다 effect가 돌아서 문장 하나당 RPC가 한 번
 * 더 나갔다. 단어 모드는 1~2초에 한 개씩 끝나므로 초당 한 번꼴이었다.
 * 화면 숫자는 낙관적 갱신(localMonthlyScore)이 이미 맡고 있으니 서버 확인은
 * 드물어도 된다.
 */
const SYNC_EVERY = 10;

type TypingSummary = {
  total_typing_count: number;
  max_cpm: number;
  monthly_score: number;
  /* 모드별 누적. 단문 1문장(44타)과 장문 1문장(205타)은 분량이 달라서
     합쳐 놓으면 숫자가 무엇을 뜻하는지 알 수 없다. 단어는 단어 개수다.
     ⚠️ 0014를 적용하기 전 서버는 이 컬럼들을 돌려주지 않는다. RPC 응답은
     타입 선언과 무관하게 그때의 DB 스키마를 따르므로 반드시 옵셔널이어야 한다. */
  short_count?: number | null;
  long_count?: number | null;
  word_count?: number | null;
  news_count?: number | null;
};


/**
 * 헤더 가운데에 붙는 내 기록.
 *
 * 예전에는 화면 오른쪽에 접혀 있는 패널이었는데, 타이핑 영역을 가리면서도
 * 펼쳐야만 보였다. 헤더로 올려 항상 보이게 하고 패널은 없앴다.
 */
export function HeaderStats() {
  const { locale, t } = useUiLanguage();
  const sessionCount = useTypingStore((s) => s.sessionCount);
  const localMaxCpm = useUiStore((s) => s.maxCpm);
  const localMonthlyScore = useUiStore((s) => s.monthlyScore);
  const localScoreMonthId = useUiStore((s) => s.scoreMonthId);
  const [summary, setSummary] = useState<TypingSummary | null>(null);
  /* 로그인 여부. 로그아웃 상태에서는 숫자를 아예 보여주지 않는다.
     기록은 계정에 쌓이는 것이라 로그인하지 않으면 아무 의미가 없는데,
     예전에는 이 브라우저에 남은 값(sessionCount, localStorage의 최고 CPM·이번 달
     점수)이 그대로 보였다. 사용자는 그것이 자기 기록으로 쌓이는 줄 안다. */
  const [signedIn, setSignedIn] = useState(false);

  // 10문장마다 한 번만 값이 바뀌므로 effect도 그때만 돈다.
  const syncBucket = Math.floor(sessionCount / SYNC_EVERY);

  useEffect(() => {
    const supabaseClient = getSupabaseClient();
    if (!supabaseClient) return undefined;
    let active = true;

    async function loadSummary() {
      const { data, error } = await supabaseClient!.rpc("get_my_typing_summary", {
        p_month_id: seoulMonthId(),
      });
      if (!active) return;
      if (error) {
        console.error("타이핑 기록 불러오기 실패", error);
        return;
      }
      const row = Array.isArray(data) ? data[0] : null;
      setSummary(row ?? null);
    }

    void supabaseClient.auth.getSession().then(({ data }) => {
      if (!active) return;
      setSignedIn(Boolean(data.session));
      if (data.session) void loadSummary();
      else setSummary(null);
    });

    const { data: subscription } = supabaseClient.auth.onAuthStateChange((_event, session) => {
      setSignedIn(Boolean(session));
      if (session) void loadSummary();
      else setSummary(null);
    });

    return () => {
      active = false;
      subscription.subscription.unsubscribe();
    };
  }, [syncBucket]);

  const totalTypingCount = summary?.total_typing_count ?? 0;
  const maxCpm = Math.max(summary?.max_cpm ?? 0, localMaxCpm);

  /* 서버 값은 최대 9문장(단어 모드는 9단어)만큼 뒤처져 있고, 낙관적 갱신은 바로
     올라간다. 서버 값을 그냥 쓰면 숫자가 올라갔다 내려간다. 큰 쪽을 쓴다.
     최고 CPM이 이미 같은 방식이다.
     지난달 값이 localStorage에 남아 있으면 로컬 쪽은 버린다. */
  const localScoreThisMonth = localScoreMonthId === seoulMonthId() ? localMonthlyScore : 0;
  const monthlyScore = Math.max(summary?.monthly_score ?? 0, localScoreThisMonth);

  /* 모드별 내역. 마우스를 올렸을 때 보여준다. 헤더에 네 칸을 더 붙이면
     가운데가 넘쳐서 로고와 로그인 버튼을 밀어낸다.
     0014 적용 전에는 컬럼이 없으므로 안내를 아예 붙이지 않는다. 전부 0으로
     보여주면 "기록이 없다"는 잘못된 정보가 된다. */
  const hasModeCounts = summary != null && summary.short_count != null;
  const modeBreakdown = hasModeCounts
    ? [
        `${t("단문", "Short")} ${(summary.short_count ?? 0).toLocaleString(locale === "en" ? "en-US" : "ko-KR")} ${t("문장", "prompts")}`,
        `${t("장문", "Long")} ${(summary.long_count ?? 0).toLocaleString(locale === "en" ? "en-US" : "ko-KR")} ${t("문장", "prompts")}`,
        `${t("뉴스", "News")} ${(summary.news_count ?? 0).toLocaleString(locale === "en" ? "en-US" : "ko-KR")} ${t("문장", "prompts")}`,
        /* 단어는 문장 수에 들어가지 않는다(0029). 여기서만 센다. */
        `${t("단어", "Words")} ${(summary.word_count ?? 0).toLocaleString(locale === "en" ? "en-US" : "ko-KR")} (${t("누적 문장에는 포함되지 않음", "not included in total prompts")})`,
      ].join("\n")
    : undefined;

  /* 숫자 대신 줄표를 보여주는 경우
       - 로그인하지 않았다  → 기록은 계정에 쌓이므로 보여줄 값이 없다
       - 아직 못 읽었다      → 0을 먼저 띄우면 "0문장"이 번쩍였다가 튄다

     0으로 채우지 않는 이유는 그것이 "기록이 없다"는 또 다른 거짓말이기 때문이다.
     칸은 그대로 둔다 — 값이 들어올 때 헤더 폭이 흔들리지 않게. */
  if (!signedIn || summary == null) {
    const hint = signedIn ? t("기록을 불러오는 중입니다", "Loading your stats") : t("로그인하면 기록이 쌓입니다", "Sign in to save your stats");
    return (
      <dl className="header-stats" aria-label={t("내 타이핑 기록", "My typing stats")} title={hint}>
        {[t("누적 문장", "Total prompts"), t("최고 CPM", "Best CPM"), t("이번 달 점수", "Monthly score")].map((label) => (
          <div className="header-stat" key={label}>
            <dt>{label}</dt>
            <dd aria-label={hint}>—</dd>
          </div>
        ))}
      </dl>
    );
  }

  return (
    <dl className="header-stats" aria-label={t("내 타이핑 기록", "My typing stats")}>
      <div className="header-stat" title={modeBreakdown}>
        <dt>{t("누적 문장", "Total prompts")}</dt>
        <dd>
          <ScoreValue value={totalTypingCount} unit={t("문장", " prompts")} />
        </dd>
      </div>
      <div className="header-stat">
        <dt>{t("최고 CPM", "Best CPM")}</dt>
        <dd>{maxCpm.toLocaleString(locale === "en" ? "en-US" : "ko-KR")}</dd>
      </div>
      <div className="header-stat">
        <dt>{t("이번 달 점수", "Monthly score")}</dt>
        <dd>
          <ScoreValue value={monthlyScore} unit={t("점", " points")} />
        </dd>
      </div>
    </dl>
  );
}
