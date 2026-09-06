import assert from "node:assert/strict";
import { buildTypingBody, cleanNewsText, parseNewsFeed } from "../features/content/news-feed";

assert.equal(
  cleanNewsText("반발…윤리위도 내홍 — 오늘(28일) 결정"),
  "반발... 윤리위도 내홍 - 오늘(28일) 결정",
  "말줄임표 뒤 단어가 붙지 않고 의미 있는 날짜 괄호는 남아야 한다",
);

const koreanBody = buildTypingBody(
  [
    "▲ 회의장에 놓인 법안 심사 자료",
    "개정안은 오늘(28일) 국회 소위원회를 통과했습니다.",
    "여야는 내일 전체회의에서 추가 논의를 이어갈 예정입니다.",
    "서울에서 김보미 기자입니다.",
    "(영상취재 : 홍길동, 영상편집 : 김편집)",
    "▶ SBS 뉴스 앱 다운로드",
  ].join("\n"),
  "ko",
);
assert.equal(
  koreanBody,
  "개정안은 오늘(28일) 국회 소위원회를 통과했습니다. 여야는 내일 전체회의에서 추가 논의를 이어갈 예정입니다.",
  "사진 설명·기자 소개·제작진·홍보 문구를 빼고 두 문장을 골라야 한다",
);

const longBody = buildTypingBody(
  "정부는 새로운 대책을 발표했으며 관계 기관은 현장 상황을 계속 확인하고, 주민 안전을 위한 추가 지원 방안을 마련하는 동시에 피해 규모를 면밀하게 조사할 계획이라고 밝혔습니다.",
  "ko",
);
assert.ok(longBody.length >= 30 && longBody.length <= 150, "긴 문장은 점수 상한 안에서 잘라야 한다");

const amountSource = [
  "첫 번째 문장은 적은 분량에서도 온전히 선택되어야 합니다.",
  "두 번째 문장은 중간 분량부터 함께 선택되는 기사 본문입니다.",
  "세 번째 문장은 많은 분량을 선택했을 때 추가로 제공됩니다.",
  "네 번째 문장까지 문장 중간을 자르지 않고 자연스럽게 이어집니다.",
].join(" ");
assert.equal(
  buildTypingBody(amountSource, "ko", "small"),
  "첫 번째 문장은 적은 분량에서도 온전히 선택되어야 합니다.",
);
assert.equal(buildTypingBody(amountSource, "ko", "medium").match(/\./g)?.length, 2);
assert.equal(buildTypingBody(amountSource, "ko", "large").match(/\./g)?.length, 4);

const fixture = `<?xml version="1.0" encoding="UTF-8"?>
<rss xmlns:content="http://purl.org/rss/1.0/modules/content/" version="2.0"><channel>
  <item>
    <title><![CDATA[첫 기사…후속 소식]]></title>
    <link>https://example.com/article/1?utm_source=rss&amp;at_medium=RSS</link>
    <description><![CDATA[첫 문장은 정상적인 기사 설명입니다.박기자 기자입니다.]]></description>
    <content:encoded><![CDATA[
      <p class="change">▲ 현장에 놓인 안내판</p>
      <p class="change">첫 문장은 정상적인 기사 설명입니다.</p>
      <p class="change">두 번째 문장도 타이핑하기 적당한 길이로 제공됩니다.</p>
      <p class="change">(사진=뉴스 제공)</p>
    ]]></content:encoded>
  </item>
  <item>
    <title>첫 기사 후속 소식</title>
    <link>https://example.com/article/1?at_campaign=rss</link>
    <description>중복 기사는 결과에서 빠져야 합니다.</description>
  </item>
  <item>
    <title>클로징</title>
    <link>https://example.com/closing</link>
    <description>시청해 주셔서 감사합니다.</description>
  </item>
</channel></rss>`;

const parsed = parseNewsFeed(fixture, "https://news.sbs.co.kr/news/SectionRssFeed.do?sectionId=01");
assert.equal(parsed.length, 1, "추적 쿼리가 다른 같은 기사와 클로징을 제거해야 한다");
assert.equal(parsed[0].sourceUrl, "https://example.com/article/1");
assert.equal(parsed[0].title, "첫 기사... 후속 소식");
assert.equal(
  parsed[0].text,
  "첫 문장은 정상적인 기사 설명입니다. 두 번째 문장도 타이핑하기 적당한 길이로 제공됩니다.",
);

const titleParsed = parseNewsFeed(
  fixture,
  "https://news.sbs.co.kr/news/SectionRssFeed.do?sectionId=01",
  { target: "title", amount: "large" },
);
assert.equal(titleParsed[0].text, "첫 기사... 후속 소식", "제목 모드는 정제된 제목을 검증 원문으로 써야 한다");

console.log("news feed fixture tests passed");
