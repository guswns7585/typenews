/**
 * 특정 문장이 나오면 뉴스 썸네일 자리에 그림을 띄운다.
 *
 * 원본 타입뉴스에 있던 장치다. "님들 이거보셈 야광공룡임."이 뜨면 공룡 사진이
 * 같이 나왔는데, 새 프론트로 옮기면서 빠져 있었다.
 *
 * 뉴스 모드의 썸네일 자리를 그대로 쓴다. 자리를 새로 만들면 로고와 썸네일이
 * 양끝으로 밀려나는 그 전환 애니메이션을 한 벌 더 만들어야 한다.
 *
 * 문장을 추가할 때는 아래 배열에 한 줄만 넣으면 된다.
 * 그림은 `public/`에 두고 경로를 `/이름.jpg`로 적는다.
 */

type SentenceImage = {
  /** 문장 원문. 공백과 문장부호 차이는 아래에서 흡수한다. */
  text: string;
  src: string;
  alt: string;
};

const SENTENCE_IMAGES: SentenceImage[] = [
  { text: "님들 이거보셈 야광공룡임.", src: "/dino.jpg", alt: "야광 공룡" },
];

/**
 * 비교용으로 문장을 다듬는다.
 *
 * DB의 원문과 여기 적은 문장이 공백 하나, 마침표 하나로 어긋나 매칭이 조용히
 * 실패하는 일을 막는다. 관리자가 문장을 다듬어도 계속 걸리게 하려는 것이다.
 */
function normalize(text: string) {
  return text.replace(/\s+/g, "").replace(/[.,!?~…]+$/u, "");
}

const BY_TEXT = new Map(SENTENCE_IMAGES.map((item) => [normalize(item.text), item]));

/** 이 문장에 딸린 그림. 없으면 null. */
export function imageForSentence(text: string | undefined | null) {
  if (!text) return null;
  return BY_TEXT.get(normalize(text)) ?? null;
}
