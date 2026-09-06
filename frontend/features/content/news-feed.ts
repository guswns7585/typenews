import { decodeHTML } from "entities";
import { XMLParser } from "fast-xml-parser";
import type { NewsBodyAmount, NewsTypingTarget } from "@/lib/types";

export type TrustedNewsItem = {
  title: string;
  text: string;
  sourceUrl?: string;
  thumbnailUrl?: string;
};

const unwantedPatterns = [
  /▲[^.!?\n]*(?:[.!?\n]|$)/g,
  /▶?\s*뉴스에는\s*위아래가 없다\s*스브스뉴스/gi,
  /▶?\s*SBS\s*뉴스\s*앱\s*다운로드/gi,
  /▶?\s*뉴스에\s*지식을\s*담다\s*-\s*스브스프리미엄\s*앱\s*다운로드/gi,
  /ⓒ\s*SBS\s*&\s*SBS\s*i\s*[:：]/gi,
  /무단복제\s*및\s*재배포\s*금지/gi,
  /이\s*기사의\s*전체\s*내용\s*확인하기/gi,
  /▶?\s*영상\s*시청/gi,
  /\([^)]*(?:영상취재|영상편집|디자인|취재|촬영|편집|프로듀서|담당\s*인턴|연출)\s*:[^)]*\)/gi,
  /(?:영상취재|영상편집|디자인|취재|촬영|편집|프로듀서|담당\s*인턴|연출)\s*:[^\n.!?]*/gi,
  /위 사진은 기사 내용과 관련이 없습니다\./gi,
  /^▲.*관련이 없습니다\./gm,
  /<script[\s\S]*?<\/script>/gi,
  /<style[\s\S]*?<\/style>/gi,
  /<iframe[\s\S]*?<\/iframe>/gi,
  /<img[\s\S]*?>/gi,
];

const blockedKeywords = ["편상욱의 뉴스브리핑"];
const blockedTitles = ["클로징", "closing"];
const MIN_SENTENCE_CHARS = 14;
// RSS 매체마다 목록 구분자로 서로 다른 가운데점 문자를 쓴다. 일부는 유니코드상
// "문자"로 분류되어 일반 기호 필터를 통과하므로 먼저 단어 경계로 정규화한다.
const INLINE_SEPARATOR_MARKS = /[\u00b7\u0387\u2022\u2027\u2219\u22c5\u30fb\u318d\uff65]/g;

const bodyLimits: Record<NewsBodyAmount, { maxChars: number; maxSentences: number }> = {
  small: { maxChars: 100, maxSentences: 1 },
  medium: { maxChars: 150, maxSentences: 2 },
  large: { maxChars: 280, maxSentences: 4 },
};

const parser = new XMLParser({
  ignoreAttributes: false,
  attributeNamePrefix: "@_",
  parseTagValue: false,
  trimValues: false,
});

function asArray<T>(value: T | T[] | undefined): T[] {
  if (value === undefined) return [];
  return Array.isArray(value) ? value : [value];
}

function scalar(value: unknown): string {
  if (typeof value === "string" || typeof value === "number") return String(value).trim();
  if (!value || typeof value !== "object") return "";
  const record = value as Record<string, unknown>;
  return scalar(record["#text"] ?? record["__cdata"] ?? record["#cdata"]);
}

function normalizeForMatch(text: string) {
  return text.toLowerCase().replace(/\s+/g, "");
}

function containsBlockedKeyword(text: string) {
  const normalized = normalizeForMatch(text);
  return blockedKeywords.some((keyword) => normalized.includes(normalizeForMatch(keyword)));
}

function normalizeTypography(text: string) {
  return decodeHTML(text)
    .normalize("NFC")
    .replace(/[\u00a0\u2007\u202f]/g, " ")
    .replace(/[\u2018\u2019\u02bc]/g, "'")
    .replace(/[\u201c\u201d]/g, '"')
    .replace(/[\u2013\u2014\u2212]/g, "-")
    .replace(/\u2026/g, "...")
    .replace(/\u223c/g, "~");
}

function stripHtml(text: string) {
  return normalizeTypography(
    text
      .replace(/<script[\s\S]*?<\/script>/gi, " ")
      .replace(/<style[\s\S]*?<\/style>/gi, " ")
      .replace(/<iframe[\s\S]*?<\/iframe>/gi, " ")
      .replace(/<(?:br\s*\/?>|\/(?:p|div|li|h[1-6]))>/gi, "\n")
      .replace(/<[^>]*>/g, " "),
  ).replace(/<[^>]{1,80}>/g, " ");
}

export function cleanNewsText(text: string) {
  let cleaned = stripHtml(text);
  for (const pattern of unwantedPatterns) cleaned = cleaned.replace(pattern, " ");

  return cleaned
    // 사진·자료 출처만 지운다. 오늘(28일) 같은 의미 있는 괄호는 보존한다.
    .replace(/\((?:사진|영상|그래픽|자료|출처)\s*[=:][^)]*\)/gi, " ")
    .replace(/\[(?:사진|영상|그래픽|자료|출처)[^\]]*\]/gi, " ")
    .replace(/\[[^\]]{1,80}\s*[:：]\s*([^\]]+)\]/g, "$1")
    .replace(/\b[\p{L}\p{N}._%+-]+@[\p{L}\p{N}.-]+\.[A-Za-z]{2,}\b/gu, " ")
    .replace(/\s/g, " ")
    .replace(/https?:\/\/\S+/g, " ")
    .replace(INLINE_SEPARATOR_MARKS, " ")
    .replace(/[①②③④⑤⑥⑦⑧⑨⑩⑪⑫©★※•◆■▶▷]/g, " ")
    .replace(/[^ \p{L}\p{N}!@#$%^&*()_+\-=[\]{}|;:'",.<>/?~]/gu, " ")
    .replace(/\s+/g, " ")
    // SBS 설명은 문장 끝과 다음 문장·기자명이 붙어 오는 경우가 많다.
    .replace(/([.!?])(?=[가-힣])/g, "$1 ")
    .trim();
}

function isBoilerplateSentence(sentence: string) {
  const compact = sentence.replace(/\s+/g, " ").trim();
  return [
    /(?:에서\s*)?[가-힣]{2,6}\s*기자(?:가\s*(?:보도|취재)합니다|입니다|가\s*보도합니다)[.!?]?$/,
    /^(?:입력|수정)\s*[:：]?\s*\d{4}/,
    /^(?:영상취재|영상편집|디자인|취재|촬영|편집|프로듀서|연출)\s*[:：]/,
    /^(?:SBS|BBC)\s*(?:뉴스\s*앱|News\s*App)/i,
    /^(?:무단복제|Copyright|All rights reserved)/i,
    /^이 기사의 전체 내용 확인하기/,
  ].some((pattern) => pattern.test(compact));
}

function hasTypingQuality(sentence: string) {
  if (sentence.length < MIN_SENTENCE_CHARS) return false;
  const visible = sentence.replace(/\s/g, "");
  if (!visible) return false;
  // 한 문장이 지나치게 길면 긴 분량에서도 타이핑하기 좋지 않다.
  if (sentence.length > bodyLimits.medium.maxChars) return false;
  const lettersAndNumbers = visible.match(/[\p{L}\p{N}]/gu)?.length ?? 0;
  if (lettersAndNumbers / visible.length < 0.55) return false;
  if (/(.)\1{7,}/u.test(visible)) return false;
  if (/\.{3}$/.test(sentence)) return false;
  if (!/[.!?](?:["')\]]+)?$/.test(sentence)) return false;
  return !isBoilerplateSentence(sentence);
}

function sentenceSegments(text: string, locale: "ko" | "en") {
  const cleaned = cleanNewsText(text);
  if (!cleaned) return [];

  if (typeof Intl.Segmenter === "function") {
    const segmenter = new Intl.Segmenter(locale, { granularity: "sentence" });
    return [...segmenter.segment(cleaned)].map(({ segment }) => segment.trim()).filter(Boolean);
  }

  return cleaned.split(/(?<=[.!?。])\s+/u).map((sentence) => sentence.trim()).filter(Boolean);
}

function mergeShortFragments(sentences: string[]) {
  const merged: string[] = [];
  for (const sentence of sentences) {
    if (sentence.length < MIN_SENTENCE_CHARS && merged.length) {
      const previous = merged.at(-1)!;
      if (previous.length + sentence.length + 1 <= bodyLimits.medium.maxChars) {
        merged[merged.length - 1] = `${previous} ${sentence}`;
        continue;
      }
    }
    merged.push(sentence);
  }
  return merged;
}

export function buildTypingBody(
  text: string,
  locale: "ko" | "en",
  amount: NewsBodyAmount = "medium",
) {
  const limits = bodyLimits[amount];
  const candidates = mergeShortFragments(
    sentenceSegments(text, locale).filter((sentence) => !isBoilerplateSentence(sentence)),
  ).filter(hasTypingQuality);

  const selected: string[] = [];
  for (const candidate of candidates) {
    if (selected.length >= limits.maxSentences) break;
    const nextLength = selected.join(" ").length + (selected.length ? 1 : 0) + candidate.length;
    if (nextLength <= limits.maxChars) selected.push(candidate);
  }
  return selected.join(" ");
}

function paragraphText(html: string) {
  const changeParagraphs = [...html.matchAll(/<p\b[^>]*class=["'][^"']*\bchange\b[^"']*["'][^>]*>([\s\S]*?)<\/p>/gi)];
  const paragraphs = changeParagraphs.length
    ? changeParagraphs
    : [...html.matchAll(/<p\b[^>]*>([\s\S]*?)<\/p>/gi)];
  return paragraphs.map((match) => match[1] ?? "");
}

function extractSummary(
  item: Record<string, unknown>,
  isKoreanNews: boolean,
  amount: NewsBodyAmount,
) {
  const locale = isKoreanNews ? "ko" : "en";
  const content = scalar(item["content:encoded"]);
  if (isKoreanNews && content) {
    const body = buildTypingBody(paragraphText(content).join("\n"), locale, amount);
    if (body.length >= 30) return body;
  }

  const description = scalar(item.description);
  return buildTypingBody(description, locale, amount);
}

function thumbnail(item: Record<string, unknown>) {
  const media = item["media:thumbnail"];
  const enclosure = item.enclosure;
  const mediaRecord = Array.isArray(media) ? media[0] : media;
  const enclosureRecord = Array.isArray(enclosure) ? enclosure[0] : enclosure;
  if (mediaRecord && typeof mediaRecord === "object") {
    const url = scalar((mediaRecord as Record<string, unknown>)["@_url"]);
    if (url) return url;
  }
  if (enclosureRecord && typeof enclosureRecord === "object") {
    const url = scalar((enclosureRecord as Record<string, unknown>)["@_url"]);
    if (url) return url;
  }
  return undefined;
}

function canonicalArticleUrl(source: string) {
  if (!source) return undefined;
  try {
    const url = new URL(source);
    for (const key of [...url.searchParams.keys()]) {
      if (key.toLowerCase().startsWith("utm_") || key === "at_medium" || key === "at_campaign") {
        url.searchParams.delete(key);
      }
    }
    url.hash = "";
    return url.toString();
  } catch {
    return source;
  }
}

export function parseNewsFeed(
  xml: string,
  sourceFeedUrl: string,
  options: { target?: NewsTypingTarget; amount?: NewsBodyAmount } = {},
): TrustedNewsItem[] {
  const parsed = parser.parse(xml) as { rss?: { channel?: { item?: unknown } } };
  const rawItems = asArray(parsed.rss?.channel?.item).filter(
    (item): item is Record<string, unknown> => Boolean(item) && typeof item === "object",
  );
  const isKoreanNews = sourceFeedUrl.includes("sbs.co.kr");
  const target = options.target ?? "body";
  const amount = options.amount ?? "medium";

  const seen = new Set<string>();
  return rawItems
    .map((item): TrustedNewsItem | null => {
      const rawTitle = scalar(item.title);
      const rawDescription = scalar(item.description);
      const rawContent = scalar(item["content:encoded"]);
      if (blockedTitles.includes(rawTitle.toLowerCase().trim())) return null;
      if (containsBlockedKeyword(rawTitle + rawDescription + rawContent)) return null;

      const title = cleanNewsText(rawTitle);
      const text = target === "title" ? title : extractSummary(item, isKoreanNews, amount);
      if (!title || !text || (target === "body" && text.length < 15)) return null;

      const sourceUrl = canonicalArticleUrl(scalar(item.link));
      const duplicateKey = sourceUrl
        ? sourceUrl
        : normalizeForMatch(`${title}|${text}`);
      if (seen.has(duplicateKey)) return null;
      seen.add(duplicateKey);

      return {
        title,
        text,
        sourceUrl,
        thumbnailUrl: thumbnail(item),
      };
    })
    .filter((item): item is TrustedNewsItem => item !== null)
    .slice(0, 10);
}
