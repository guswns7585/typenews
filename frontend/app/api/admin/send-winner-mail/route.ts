import { createClient } from "@supabase/supabase-js";
import { NextResponse } from "next/server";
import { readMailConfig, sendWinnerMail } from "@/lib/mail/brevo";

/**
 * 당첨 안내 메일을 Brevo로 보낸다.
 *
 * 왜 서버에서 보내나
 *   Brevo API 키는 그 키만 있으면 누구든 우리 이름으로 메일을 보낼 수 있다.
 *   브라우저에 내려보내면 안 된다. 그래서 키는 서버 환경변수로만 두고,
 *   보내는 일도 여기서만 한다.
 *
 * 왜 DNS가 필요 없나
 *   Brevo는 "단일 발신자 인증"을 지원한다. 발신 주소로 온 확인 메일을 클릭하면
 *   그 주소로 보낼 수 있다. SPF/DKIM 레코드를 넣으려면 도메인 통제가 필요한데
 *   typenews.kr의 DNS를 우리가 못 바꾸므로 이 방식이라야 한다.
 *   (도달률은 도메인 인증보다 낮다. 스팸함을 한 번 확인할 것.)
 *
 * 권한 ★
 *   이 라우트는 service_role 키를 쓰지 않는다. 호출자의 Supabase 액세스 토큰을
 *   그대로 써서 get_prize_winners를 부른다. 그 함수는 `where public.is_admin()`이라
 *   관리자가 아니면 0행이 온다. 즉 **권한 판정은 여기가 아니라 DB가 한다.**
 *   토큰을 위조하지 않는 한 남의 당첨자 메일 주소를 얻어낼 수 없다.
 */

type WinnerRow = {
  winner_id: number;
  display_name: string;
  email: string | null;
  prize_name: string;
  prize_sponsor: string | null;
  status: string;
  respond_by: string;
  notified_at: string | null;
};

export async function POST(request: Request) {
  /* 자동 발송(/api/cron/send-winner-mails)과 같은 함수로 보낸다.
     문안이나 발신 방식이 두 경로에서 갈라지지 않게. */
  const mail = readMailConfig();
  if (!mail) {
    return NextResponse.json(
      {
        error:
          "메일 발송이 설정되지 않았습니다. BREVO_API_KEY와 BREVO_SENDER_EMAIL을 등록해주세요.",
      },
      { status: 503 },
    );
  }

  const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const supabaseKey =
    process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY || process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
  if (!supabaseUrl || !supabaseKey) {
    return NextResponse.json({ error: "Supabase 설정이 없습니다" }, { status: 503 });
  }

  const token = request.headers.get("authorization")?.replace(/^Bearer\s+/i, "").trim();
  if (!token) {
    return NextResponse.json({ error: "로그인이 필요합니다" }, { status: 401 });
  }

  let winnerId: number | null = null;
  let monthId: string | null = null;
  let force = false;
  try {
    const body: unknown = await request.json();
    if (body && typeof body === "object") {
      const raw = body as Record<string, unknown>;
      if (typeof raw.winnerId === "number") winnerId = raw.winnerId;
      if (typeof raw.monthId === "string" && /^[0-9]{6}$/.test(raw.monthId)) monthId = raw.monthId;
      force = raw.force === true;
    }
  } catch {
    return NextResponse.json({ error: "잘못된 요청입니다" }, { status: 400 });
  }

  if (winnerId === null) {
    return NextResponse.json({ error: "winnerId가 필요합니다" }, { status: 400 });
  }

  // 호출자의 토큰으로 부른다. 관리자가 아니면 DB가 0행을 돌려준다.
  const supabase = createClient(supabaseUrl, supabaseKey, {
    auth: { autoRefreshToken: false, detectSessionInUrl: false, persistSession: false },
    global: { headers: { Authorization: `Bearer ${token}` } },
  });

  const { data, error } = await supabase.rpc("get_prize_winners", {
    p_month_id: monthId,
    p_limit: 500,
  });
  if (error) {
    console.error("당첨자 조회 실패", error);
    return NextResponse.json({ error: "당첨자를 확인하지 못했습니다" }, { status: 500 });
  }

  const winner = ((data ?? []) as WinnerRow[]).find((row) => row.winner_id === winnerId);
  if (!winner) {
    // 관리자가 아니거나, 없는 번호이거나, 다른 달이다. 어느 쪽인지 알려주지 않는다.
    return NextResponse.json({ error: "당첨 정보를 찾을 수 없습니다" }, { status: 404 });
  }

  if (!winner.email) {
    return NextResponse.json({ error: "이메일이 없는 계정입니다" }, { status: 400 });
  }

  /* 회신을 기다리는 사람에게만 보낸다. 이미 확정됐거나 만료·취소된 사람에게
     "당첨을 축하드립니다"가 가면 되돌릴 수 없다. */
  if (winner.status !== "pending") {
    return NextResponse.json(
      { error: `상태가 '${winner.status}'인 당첨에는 보내지 않습니다` },
      { status: 409 },
    );
  }

  // 이미 보낸 사람에게 또 보내는 것은 명시적으로 요청했을 때만.
  if (winner.notified_at && !force) {
    return NextResponse.json(
      { error: "이미 발송한 당첨자입니다", alreadyNotified: true },
      { status: 409 },
    );
  }

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

  if (!result.ok) {
    return NextResponse.json(
      {
        error: result.status
          ? `메일 발송에 실패했습니다 (${result.status})`
          : "메일 서버에 연결하지 못했습니다",
        detail: result.detail,
      },
      { status: 502 },
    );
  }

  /* 발송은 끝났다. 표시에 실패해도 메일을 되돌릴 수는 없으므로 성공으로 돌려주되
     경고를 함께 보낸다. 관리자가 손으로 '발송 표시'를 누를 수 있다. */
  const { error: markError } = await supabase.rpc("mark_winner_notified", {
    p_winner_id: winnerId,
    p_sent: true,
  });
  if (markError) {
    console.error("발송 표시 실패", markError);
    return NextResponse.json({
      ok: true,
      warning: "메일은 보냈지만 발송 표시에 실패했습니다. 목록에서 직접 표시해주세요.",
    });
  }

  return NextResponse.json({ ok: true });
}
