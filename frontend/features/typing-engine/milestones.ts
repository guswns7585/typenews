/** 이 문장 수마다 한 번씩 문구가 뜬다. */
export const MILESTONE_STEP = 200;

/** 노출 시간(ms). 이후 CSS transition으로 서서히 사라진다. */
export const MILESTONE_VISIBLE_MS = 2000;

const messages = [
  "자연윤활 중 이신가봐요",
  "키캡이 마모되고 있어요",
  "손가락 관절은 괜찮으신가요?",
  "수제 머신흑 완성입니다",
  "키캡이 번들거려요",
  "손가락 관절이 다 닳았겠어요",
  "키보드를 좀 쉬게 해주시는건 어떠신가요",
  "키보드가 죽어가고 있어요",
  "키보드님께서 사망하셨습니다",
  "이미 사망한 키보드입니다.",
];

/** 해당 문장 수에서 띄울 문구. 없으면 null. */
export function milestoneFor(count: number) {
  if (count <= 0 || count % MILESTONE_STEP !== 0) return null;
  return messages[count / MILESTONE_STEP - 1] ?? null;
}
