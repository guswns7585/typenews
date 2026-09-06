import { winnerMailBody, winnerMailSubject, type WinnerMailInput } from "@/components/admin/winner-mail";

/**
 * Brevo로 당첨 안내 메일을 보낸다.
 *
 * 관리자가 손으로 누르는 경로(/api/admin/send-winner-mail)와 크론이 자동으로
 * 도는 경로(/api/cron/send-winner-mails)가 **같은 함수를 쓴다.**
 * 문안이나 발신 방식이 두 경로에서 갈라지면 "관리자가 보낸 것과 자동으로 나간 것이
 * 다르다"는 상황이 생긴다.
 *
 * ⚠️ 서버에서만 부를 것. API 키가 있으면 누구든 우리 이름으로 메일을 보낼 수 있다.
 */

const BREVO_ENDPOINT = "https://api.brevo.com/v3/smtp/email";

export type MailConfig = {
  apiKey: string;
  senderEmail: string;
  senderName: string;
};

/**
 * 환경변수를 읽는다. 하나라도 없으면 null이다.
 *
 * 호출부는 **대상을 고르기 전에** 이것부터 확인해야 한다. 크론 경로에서 순서가
 * 뒤바뀌면 당첨자를 "발송함"으로 잠가놓고 실제로는 못 보내는 상태가 된다.
 */
export function readMailConfig(): MailConfig | null {
  const apiKey = process.env.BREVO_API_KEY;
  const senderEmail = process.env.BREVO_SENDER_EMAIL;
  if (!apiKey || !senderEmail) return null;
  return {
    apiKey,
    senderEmail,
    senderName: process.env.BREVO_SENDER_NAME || "타입뉴스",
  };
}

export type SendResult =
  | { ok: true }
  | { ok: false; status: number; detail: string };

export async function sendWinnerMail(
  config: MailConfig,
  to: { email: string; name: string },
  input: WinnerMailInput,
): Promise<SendResult> {
  let response: Response;
  try {
    response = await fetch(BREVO_ENDPOINT, {
      method: "POST",
      headers: {
        "api-key": config.apiKey,
        "content-type": "application/json",
        accept: "application/json",
      },
      body: JSON.stringify({
        sender: { name: config.senderName, email: config.senderEmail },
        to: [{ email: to.email, name: to.name }],
        subject: winnerMailSubject(input),
        // 안내문은 서식이 필요 없다. 평문이라야 스팸 판정도 덜 받는다.
        textContent: winnerMailBody(input),
      }),
    });
  } catch (cause) {
    console.error("Brevo 요청 실패", cause);
    return { ok: false, status: 0, detail: String(cause) };
  }

  if (!response.ok) {
    const detail = await response.text().catch(() => "");
    console.error("Brevo 발송 실패", response.status, detail);
    return { ok: false, status: response.status, detail: detail.slice(0, 300) };
  }

  return { ok: true };
}
