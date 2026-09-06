import { parseNewsFeed, type TrustedNewsItem } from "../features/content/news-feed";

const feeds = [
  "https://news.sbs.co.kr/news/headlineRssFeed.do",
  "https://news.sbs.co.kr/news/SectionRssFeed.do?sectionId=01",
  "https://news.sbs.co.kr/news/SectionRssFeed.do?sectionId=02",
  "https://news.sbs.co.kr/news/SectionRssFeed.do?sectionId=03",
  "https://news.sbs.co.kr/news/SectionRssFeed.do?sectionId=07",
  "https://news.sbs.co.kr/news/SectionRssFeed.do?sectionId=08",
  "https://news.sbs.co.kr/news/SectionRssFeed.do?sectionId=09",
  "https://news.sbs.co.kr/news/SectionRssFeed.do?sectionId=14",
  "https://feeds.bbci.co.uk/news/world/rss.xml",
];

const allItems: TrustedNewsItem[] = [];

for (const url of feeds) {
  const response = await fetch(url, { headers: { "User-Agent": "TypeNews parser test" } });
  if (!response.ok) throw new Error(`${url}: ${response.status}`);
  const items = parseNewsFeed(await response.text(), url);
  if (!items.length) throw new Error(`${url}: parsed no items`);
  if (items.some((item) => !item.title || item.text.length < 15)) {
    throw new Error(`${url}: invalid normalized item`);
  }
  if (items.some((item) => item.text.length > 150)) {
    throw new Error(`${url}: body exceeds 150 characters`);
  }
  if (items.some((item) => /기자입니다|영상취재|영상편집|SBS 뉴스 앱|무단복제|\(사진\s*=/.test(item.text))) {
    throw new Error(`${url}: boilerplate survived normalization`);
  }
  allItems.push(...items);
  console.log(url, `items=${items.length}`, `first=${JSON.stringify(items[0]?.text)}`);
}

const urls = allItems.map((item) => item.sourceUrl).filter(Boolean);
console.log(
  `total=${allItems.length}`,
  `cross-feed-duplicates=${urls.length - new Set(urls).size}`,
  `longest=${Math.max(...allItems.map((item) => item.text.length))}`,
);
