import { createClient } from "@supabase/supabase-js";
import { NextResponse } from "next/server";
import { readMailConfig, sendWinnerMail } from "@/lib/mail/brevo";

/**
 * 아직 안내 메일을 못 받은 당첨자에게 자동으로 보낸다.
 *
 * 언제 도나
 *   Vercel Cron이 매일 한 번 부른다(vercel.json). 추첨은 1일 00:00 KST,
 *   무응답 재추첨은 매일 00:05 KST에 도므로 그 뒤에 한 번 쓸어담으면 된다.
 *
 * 왜 "추첨이 끝나면 바로 보낸다"가 아니라 쓸어담기인가
 *   추첨은 DB 안에서 일어난다(pg_cron). 거기서 메일까지 보내려면 메일 문안을
 *   SQL로 다시 옮겨 적어야 하는데, 그러면 문안이 두 벌이 되어 갈라진다.
 *   그리고 쓸어담기는 **실패한 건이 다음 회차에 저절로 재시도된다.**
 *   추첨에 붙이면 그 순간 실패한 사람은 영영 못 받는다.
 *
 * 두 번 보내지 않는 방법
 *   claim_winner_mails가 대상을 고르면서 같은 문장 안에서 notified_at을 찍는다.
 *   회차가 겹쳐 돌아도 이미 집힌 행은 건너뛴다(`for update ... skip locked`).
 *   발송에 실패하면 release_winner_mail로 잠금을 풀어 다음 회차에 넘긴다.
 *
 * ⚠️ 사람에게 실제로 메일이 나가는 경로다. 운영 플래그(winner_mail_enabled)가
 *    꺼져 있으면 claim_winner_mails가 0행을 돌려주므로 한 통도 나가지 않는다.
 *    기본값은 꺼짐이다. `0036` 참고.
 */

/** 한 번에 보내는 최대 통수. 잘못 돌아도 여기서 멈춘다. */
const BATCH_LIMIT = 20;

/* GET 라우트는 Next가 정적으로 굳혀 캐시할 수 있다. 그러면 크론이 불러도
   저장된 응답만 돌아오고 **메일은 한 통도 나가지 않는다.** 실패가 조용해서
   더 위험하다. 매번 실제로 돌게 못박는다. */
export const dynamic = "force-dynamic";

/* 최대 20통을 차례로 보낸다. 기본 10초로는 모자랄 수 있다. */
export const maxDuration = 60;

type ClaimedWinner = {
  winner_id: number;
  display_name: string;
  email: string;
  prize_name: string;
  prize_sponsor: string | null;
  respond_by: string;
};

export async function GET(request: Request) {
  return handle(request);
}

// 손으로 한 번 돌려보고 싶을 때를 위해 POST도 받는다. 인증은 같다.
export async function POST(request: Request) {
  return handle(request);
}

async function handle(request: Request) {
  const cronSecret = process.env.CRON_SECRET;
  if (!cronSecret) {
    return NextResponse.json({ error: "CRON_SECRET이 설정되지 않았습니다" }, { status: 503 });
  }

  /* Vercel Cron은 CRON_SECRET이 등록돼 있으면 Authorization 헤더에 담아 보낸다.
     이게 없으면 이 주소를 아는 누구나 발송을 트리거할 수 있다. */
  const given = request.headers.get("authorization")?.replace(/^Bearer\s+/i, "").trim();
  if (given !== cronSecret) {
    return NextResponse.json({ error: "권한이 없습니다" }, { status: 401 });
  }

  /* ⚠️ 대상을 집기 **전에** 설정을 확인한다.
     순서가 뒤바뀌면 당첨자를 "발송함"으로 잠가놓고 실제로는 못 보낸다. */
  const mail = readMailConfig();
  if (!mail) {
    return NextResponse.json(
      { error: "BREVO_API_KEY / BREVO_SENDER_EMAIL이 없습니다" },
      { status: 503 },
    );
  }

  const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!supabaseUrl || !serviceKey) {
    return NextResponse.json({ error: "Supabase 서버 설정이 없습니다" }, { status: 503 });
  }

  /* 크론에는 로그인한 사용자가 없다. is_admin()이 성립하지 않으므로
     service_role로 부른다. 이 키는 서버 환경변수에만 있다. */
  const supabase = createClient(supabaseUrl, serviceKey, {
    auth: { autoRefreshToken: false, detectSessionInUrl: false, persistSession: false },
  });

  const { data, error } = await supabase.rpc("claim_winner_mails", { p_limit: BATCH_LIMIT });
  if (error) {
    console.error("당첨자 클레임 실패", error);
    return NextResponse.json({ error: "당첨자를 가져오지 못했습니다" }, { status: 500 });
  }

  const claimed = (data ?? []) as ClaimedWinner[];
  if (claimed.length === 0) {
    // 보낼 사람이 없거나 자동 발송이 꺼져 있다. 정상이다.
    return NextResponse.json({ ok: true, sent: 0, failed: 0 });
  }

  let sent = 0;
  const failed: Array<{ winnerId: number; status: number }> = [];

  for (const winner of claimed) {
    const result = await sendWinnerMail(
      mail,
      { email: winner.email, name: winner.display_name },
      {
        displayName: winner.display_name,
        prizeName: winner.prize_name,
        prizeSponsor: winner.prize_sponsor,
        respondBy: winner.respond_by,
      },
    );

    if (result.ok) {
      sent += 1;
      continue;
    }

    failed.push({ winnerId: winner.winner_id, status: result.status });

    /* 잠금을 되돌려 다음 회차가 다시 집게 한다.
       이것마저 실패하면 그 사람은 "발송함"으로 남는다. 관리자 화면에서
       발송 표시를 해제하고 손으로 보낼 수 있고, 당첨 배너는 사이트에서
       계속 보이므로 메일이 유일한 통로는 아니다. */
    const { error: releaseError } = await supabase.rpc("release_winner_mail", {
      p_winner_id: winner.winner_id,
    });
    if (releaseError) {
      console.error("클레임 되돌리기 실패", winner.winner_id, releaseError);
    }
  }

  console.log(`당첨 안내 메일: ${sent}통 발송, ${failed.length}통 실패`);
  return NextResponse.json({ ok: true, sent, failed: failed.length, details: failed });
}
