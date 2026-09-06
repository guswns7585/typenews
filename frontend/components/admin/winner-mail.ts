/**
 * 당첨 안내 메일 본문.
 *
 * 운영자가 지금까지 손으로 보내던 문안을 그대로 옮겼다. 문구를 바꾸면 받는 사람이
 * 느끼는 톤이 달라지므로 임의로 다듬지 않는다.
 *
 * ⚠️ DNS를 통제할 수 없어 @typenews.kr 발신을 붙이지 못한다. 그래서 당분간
 * 사람이 보낸다. 이 파일은 "무엇을 붙여넣을지"를 만드는 역할만 한다.
 */

export type WinnerMailInput = {
  displayName: string;
  prizeName: string;
  prizeSponsor: string | null;
  /** ISO 문자열. 회신 기한 */
  respondBy: string;
};

/** "8월 3일(일) 23시 50분" — 기존 메일과 같은 표기. */
export function formatMailDeadline(iso: string) {
  const date = new Date(iso);
  if (Number.isNaN(date.getTime())) return "";
  const parts = new Intl.DateTimeFormat("ko-KR", {
    timeZone: "Asia/Seoul",
    month: "numeric",
    day: "numeric",
    weekday: "short",
    hour: "2-digit",
    minute: "2-digit",
    hour12: false,
  }).formatToParts(date);
  const get = (type: string) => parts.find((part) => part.type === type)?.value ?? "";
  return `${get("month")}월 ${get("day")}일(${get("weekday")}) ${get("hour")}시 ${get("minute")}분`;
}

export function winnerMailSubject(input: WinnerMailInput) {
  return `[타입뉴스] ${input.displayName}님, 이벤트 당첨을 축하드립니다`;
}

export function winnerMailBody(input: WinnerMailInput) {
  const sponsor = input.prizeSponsor?.trim();
  // 협찬사가 비어 있으면 그 문장을 통째로 뺀다. "의 협찬으로"만 남으면 어색하다.
  const sponsorLine = sponsor
    ? `이번 경품(${input.prizeName})은(는) ${sponsor}의 협찬으로 제공됩니다.`
    : `이번 경품은 ${input.prizeName}입니다.`;
  const sponsorForConsent = sponsor ? sponsor : "경품별 협찬사";

  return `안녕하세요, 타입뉴스입니다.
타입뉴스 이벤트에 참여해주신 모든 분들께 감사드리며,
기쁜 소식을 전해드립니다 🎉

${input.displayName}님께서는 본 이벤트에 당첨되셨습니다!
${sponsorLine}

경품 발송을 위해 아래 정보를 ${formatMailDeadline(input.respondBy)}까지 회신해주시기 바랍니다.

- 성함
- 연락처
- 배송지 주소

타입뉴스에 로그인하시면 화면에서 바로 입력하실 수도 있습니다.

[개인정보 수집 및 제공에 대한 안내]
이벤트 당첨자 확인 및 경품 발송을 위해 고객님의 개인정보(성함, 연락처, 주소)가 수집되며,
해당 정보는 배송을 위하여 ${sponsorForConsent}에 제공됩니다.
제공된 정보는 경품 발송 이후 즉시 폐기되며, 다른 목적으로 사용되지 않습니다.
회신을 통해 개인정보 제공에 동의하신 것으로 간주됩니다.

※ 기한 내 회신이 없을 경우, 당첨은 자동 취소되며 재추첨이 진행될 수 있습니다.

다시 한 번 당첨을 축하드리며,
앞으로도 타입뉴스에 많은 관심 부탁드립니다.

감사합니다.
타입뉴스 드림`;
}

/**
 * 메일 앱을 열어주는 mailto 링크.
 *
 * 한글은 인코딩되면 글자당 9바이트까지 늘어난다. 본문이 길면 브라우저나 메일
 * 클라이언트가 잘라버리므로, 길이를 재서 넘칠 것 같으면 호출부가 복사 방식을
 * 안내하도록 null을 돌려준다.
 */
const MAILTO_SAFE_LENGTH = 1900;

export function winnerMailtoLink(email: string, input: WinnerMailInput) {
  const link =
    `mailto:${encodeURIComponent(email)}` +
    `?subject=${encodeURIComponent(winnerMailSubject(input))}` +
    `&body=${encodeURIComponent(winnerMailBody(input))}`;
  return link.length <= MAILTO_SAFE_LENGTH ? link : null;
}

/**
 * Gmail 작성 화면을 받는 사람·제목·본문이 채워진 채로 연다.
 *
 * mailto와 달리 길이 제약이 사실상 없다. mailto는 OS 기본 메일 앱이 URL을
 * 처리하는데 그 한계가 1~2천 자 수준이라 한글 본문이 잘린다. 이쪽은 평범한
 * https 주소라 브라우저가 그대로 연다.
 *
 * `/mail/?view=cm`은 현재 로그인된 기본 계정으로 열린다. 여러 계정을 쓰면
 * Gmail이 계정 선택을 물어본다.
 */
export function winnerGmailLink(email: string, input: WinnerMailInput) {
  const params = new URLSearchParams({
    view: "cm",
    fs: "1",
    to: email,
    su: winnerMailSubject(input),
    body: winnerMailBody(input),
  });
  return `https://mail.google.com/mail/?${params.toString()}`;
}
