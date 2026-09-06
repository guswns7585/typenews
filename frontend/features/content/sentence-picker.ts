import { getSupabaseClient } from "@/lib/supabase/client";
import type {
  ContentItem,
  Language,
  NewsBodyAmount,
  NewsSector,
  NewsTypingTarget,
  TypingMode,
} from "@/lib/types";

type LocalMode = Exclude<TypingMode, "news">;

type ContentRequest = {
  language: Language;
  mode: TypingMode;
  newsSectors: NewsSector[];
  useStreaming: boolean;
  /** 밈 문장만 뽑는다. 한국어에서만 성립한다. */
  memeOnly?: boolean;
  newsTypingTarget: NewsTypingTarget;
  newsBodyAmount: NewsBodyAmount;
};

/**
 * 같은 (언어, 모드) 안에서 어떤 문장만 담을지.
 *
 *   all     전부
 *   nomeme  밈 제외 — M 버튼(useStreaming)
 *   meme    밈만 — 밈 모드
 *
 * ⚠️ 캐시 키와 "이미 뽑은 문장" 키가 이 값으로 갈린다. 예전에는 키를 만드는
 *    식이 loadLocalItems와 pickLocalSentence 두 곳에 따로 적혀 있어서, 한쪽만
 *    고치면 캐시는 맞는데 중복 방지가 어긋나는 상태가 됐다. 한 곳에서 만든다.
 */
type BundleFilter = "all" | "nomeme" | "meme";

function bundleFilterFor(
  language: Language,
  useStreaming: boolean,
  memeOnly: boolean,
): BundleFilter {
  // 밈은 한국어에만 있다. 영어에서 켜면 빈 목록이 되므로 무시한다.
  if (memeOnly && language === "kor") return "meme";
  return useStreaming && language === "kor" ? "nomeme" : "all";
}

function bundleKeyFor(language: Language, mode: LocalMode, filter: BundleFilter) {
  /* 밈 묶음은 단문·장문을 함께 담으므로 모드가 키에 들어가면 안 된다.
     들어가면 같은 목록이 두 벌 캐시되고 "이미 뽑은 문장" 집합도 갈라진다. */
  if (filter === "meme") return `bundle:${language}:meme`;
  return `bundle:${language}:${mode}:${filter}`;
}

const koreanNewsUrls: Record<Exclude<NewsSector, "all">, string> = {
  main: "https://news.sbs.co.kr/news/headlineRssFeed.do",
  politics: "https://news.sbs.co.kr/news/SectionRssFeed.do?sectionId=01",
  economy: "https://news.sbs.co.kr/news/SectionRssFeed.do?sectionId=02",
  society: "https://news.sbs.co.kr/news/SectionRssFeed.do?sectionId=03",
  global: "https://news.sbs.co.kr/news/SectionRssFeed.do?sectionId=07",
  culture: "https://news.sbs.co.kr/news/SectionRssFeed.do?sectionId=08",
  entertainment: "https://news.sbs.co.kr/news/SectionRssFeed.do?sectionId=14",
  sports: "https://news.sbs.co.kr/news/SectionRssFeed.do?sectionId=09",
};

const englishNewsUrl = "https://feeds.bbci.co.uk/news/world/rss.xml";

/**
 * 묶음 하나에 담기는 문장.
 *
 * `id`는 sentences 표의 번호다. 서버가 이 번호로 원문을 찾아 점수를 다시 센다.
 * JSON 폴백에는 번호가 없으므로 null이고, 그때는 검산이 그냥 건너뛰어진다.
 */
type BundleSentence = { id: number | null; text: string };

const localCache = new Map<string, BundleSentence[]>();
const newsCache = new Map<string, ContentItem[]>();
const usedIndexes = new Map<string, Set<number>>();

function randomId() {
  return typeof crypto !== "undefined" && "randomUUID" in crypto
    ? crypto.randomUUID()
    : `${Date.now()}-${Math.random().toString(16).slice(2)}`;
}

function shuffle<T>(items: T[]) {
  const result = [...items];
  for (let index = result.length - 1; index > 0; index -= 1) {
    const swapIndex = Math.floor(Math.random() * (index + 1));
    [result[index], result[swapIndex]] = [result[swapIndex], result[index]];
  }
  return result;
}

/**
 * DB에서 문장을 받아온다.
 *
 * 한 묶음이 400~500문장이라 통째로 받아 캐시한다. JSON을 쓸 때와 같은 모양이므로
 * 아래 뽑기 로직(pickUnusedIndex 등)을 그대로 쓴다.
 *
 * `is_meme`는 M 버튼(useStreaming)이 켜져 있으면 제외한다. JSON 시절의
 * kor.json / kor_stream.json 두 파일 관계를 그대로 옮긴 것이다.
 *
 * 실패하거나 표가 비어 있으면 null을 돌려준다. 점수 강제 검산 이후에는 ID 없는
 * JSON 문장을 보여주면 사용자는 쳤는데 점수는 적립되지 않으므로 호출부가 오류를 낸다.
 */
/**
 * ⚠️ PostgREST는 한 응답에 1,000행까지만 준다(db-max-rows). `.limit(2000)`을 줘도
 *    서버가 1,000에서 자른다 — 요청이 실패하지 않고 **조용히 잘린다.**
 *    지금은 가장 큰 묶음이 433문장이라 문제가 없지만, 관리자 화면에서 문장을 계속
 *    추가하다 1,000을 넘기면 그 뒤 문장은 영영 안 나오게 된다. 그래서 나눠 받는다.
 */
const DB_PAGE_SIZE = 1000;

async function fetchDbSentences(language: Language, mode: LocalMode, filter: BundleFilter) {
  const supabase = getSupabaseClient();
  if (!supabase) return null;

  const rows: BundleSentence[] = [];

  for (let from = 0; ; from += DB_PAGE_SIZE) {
    let query = supabase
      .from("sentences")
      // id는 서버 검산용이다. 이것이 없으면 점수를 대조할 방법이 없다.
      .select("id,text")
      .eq("language", language)
      .eq("enabled", true);

    if (filter === "meme") {
      /* 밈은 수가 적어서(2026-07-30 기준 25개) 단문·장문을 함께 담는다.
         모드를 나누면 장문 밈 2개짜리 목록이 따로 생긴다. */
      query = query.in("mode", ["short", "long"]).eq("is_meme", true);
    } else {
      query = query.eq("mode", mode);
      if (filter === "nomeme") query = query.eq("is_meme", false);
    }

    // 순서를 고정하지 않으면 페이지마다 같은 행이 섞여 들어올 수 있다.
    const { data, error } = await query.order("id").range(from, from + DB_PAGE_SIZE - 1);
    if (error) {
      console.error("문장 DB 조회 실패, JSON으로 대체합니다", error);
      // 첫 페이지부터 실패했으면 JSON으로 넘긴다. 뒷페이지만 실패했으면 받은 만큼 쓴다.
      return rows.length ? rows : null;
    }

    const page = (data ?? [])
      .map((row) => ({ id: Number(row.id), text: String(row.text) }))
      .filter((row) => Boolean(row.text) && Number.isFinite(row.id));
    rows.push(...page);

    if ((data ?? []).length < DB_PAGE_SIZE) break;
  }

  return rows.length ? rows : null;
}

/**
 * 같은 묶음을 동시에 여러 번 요청하는 것을 막는다.
 *
 * 캐시는 응답이 온 뒤에야 채워진다. 그 사이에 다른 호출이 들어오면 캐시를 보고
 * 비어 있다고 판단해 요청을 또 보낸다. 첫 문장 로드와 프리페치가 겹치면 실제로
 * 그렇게 된다. 진행 중인 약속을 같이 기다리게 한다.
 */
const inFlight = new Map<string, Promise<BundleSentence[]>>();

async function loadLocalItems(language: Language, mode: LocalMode, filter: BundleFilter) {
  const cacheKey = bundleKeyFor(language, mode, filter);

  const cached = localCache.get(cacheKey);
  if (cached) return cached;

  const pending = inFlight.get(cacheKey);
  if (pending) return pending;

  const task = (async () => {
    const fromDb = await fetchDbSentences(language, mode, filter);

    if (!fromDb) {
      if (filter === "meme") {
        throw new Error("밈 문장이 아직 없습니다. 다른 모드를 골라주세요.");
      }
      throw new Error("문장 원문을 불러오지 못했습니다. 잠시 후 다시 시도해 주세요.");
    }
    localCache.set(cacheKey, fromDb);
    return fromDb;
  })();

  inFlight.set(cacheKey, task);
  try {
    return await task;
  } finally {
    inFlight.delete(cacheKey);
  }
}

function pickUnusedIndex(cacheKey: string, length: number) {
  let used = usedIndexes.get(cacheKey);
  if (!used) {
    used = new Set<number>();
    usedIndexes.set(cacheKey, used);
  }
  if (used.size >= length) used.clear();

  let index = Math.floor(Math.random() * length);
  let attempts = 0;
  while (used.has(index) && attempts < 80) {
    index = Math.floor(Math.random() * length);
    attempts += 1;
  }
  used.add(index);
  return index;
}

/**
 * 켜둔 카테고리들의 피드 주소.
 *
 * "전체"는 메인을 뺀 모든 섹션이다. 메인은 다른 섹션의 머리기사를 다시 싣기 때문에
 * 함께 넣으면 같은 기사가 두 번 나온다.
 * 개별 카테고리를 여러 개 켜면 그 피드를 모두 받아 섞는다.
 */
function newsUrls(language: Language, sectors: NewsSector[]) {
  if (language === "eng") return [englishNewsUrl];
  if (sectors.includes("all")) {
    return Object.values(koreanNewsUrls).filter((url) => url !== koreanNewsUrls.main);
  }
  const urls = sectors
    .filter((sector): sector is Exclude<NewsSector, "all"> => sector !== "all")
    .map((sector) => koreanNewsUrls[sector]);
  // 하나도 안 켜진 상태로 들어오면 빈 화면이 되므로 전체로 되돌린다.
  return urls.length ? [...new Set(urls)] : Object.values(koreanNewsUrls).filter((url) => url !== koreanNewsUrls.main);
}

/** 캐시와 "이미 뽑은 기사" 집합의 키. 고른 카테고리 조합마다 하나다. */
function newsKey(
  language: Language,
  sectors: NewsSector[],
  target: NewsTypingTarget,
  amount: NewsBodyAmount,
) {
  return `news:${language}:${[...sectors].sort().join("+")}:${target}:${amount}`;
}

async function fetchNewsFromUrl(
  url: string,
  target: NewsTypingTarget,
  amount: NewsBodyAmount,
) {
  const params = new URLSearchParams({ url, target, amount });
  const response = await fetch(`/api/news?${params.toString()}`);
  if (!response.ok) throw new Error("뉴스 RSS 로딩 실패");
  const payload = (await response.json()) as { items?: Omit<ContentItem, "id">[] };
  if (!Array.isArray(payload.items)) throw new Error("뉴스 응답 형식 오류");
  return payload.items
    .filter((item) => item.title && item.text && item.scoreSourceId)
    .map((item) => ({ ...item, id: randomId() } satisfies ContentItem));
}

async function loadNewsItems(
  language: Language,
  sectors: NewsSector[],
  target: NewsTypingTarget,
  amount: NewsBodyAmount,
) {
  const cacheKey = newsKey(language, sectors, target, amount);
  const cached = newsCache.get(cacheKey);
  if (cached?.length) return cached;

  const results = await Promise.allSettled(
    newsUrls(language, sectors).map((url) => fetchNewsFromUrl(url, target, amount)),
  );
  /* 섞어서 담는다. 안 섞으면 켜둔 카테고리 순서대로 몰려 나와
     "정치만 계속 나온다"처럼 느껴진다. */
  const seen = new Set<string>();
  const unique = results
    .flatMap((result) => (result.status === "fulfilled" ? result.value : []))
    .filter((item) => {
      const key = item.sourceUrl ?? `${item.title ?? ""}|${item.text}`.toLowerCase().replace(/\s+/g, "");
      if (seen.has(key)) return false;
      seen.add(key);
      return true;
    });
  const items = shuffle(unique);
  // 일부 섹션만 실패해도 나머지로 진행한다. 전부 실패했을 때만 오류다.
  if (!items.length) throw new Error("뉴스를 불러오지 못했습니다.");

  newsCache.set(cacheKey, items);
  return items;
}

async function pickLocalSentence(language: Language, mode: LocalMode, filter: BundleFilter) {
  const data = await loadLocalItems(language, mode, filter);

  if (mode === "word") {
    /* 이 함수는 프리페치 호환용이다. 실제 단어 다이얼은 loadWordPool의 개별 ID를
       유지하므로 서버가 10개 묶음의 점수를 다시 계산할 수 있다. */
    return {
      id: randomId(),
      text: shuffle(data)
        .slice(0, 10)
        .map((row) => row.text)
        .join(" "),
    } satisfies ContentItem;
  }

  /* "이미 뽑은 문장" 집합의 키. 캐시 키와 **같은 식으로** 만들어야 한다. */
  const index = pickUnusedIndex(bundleKeyFor(language, mode, filter), data.length);
  const picked = data[index];
  return {
    id: randomId(),
    text: picked.text,
    sentenceId: picked.id ?? undefined,
  } satisfies ContentItem;
}

/**
 * 지금 쓰지 않는 묶음을 미리 받아 캐시에 넣어둔다.
 *
 * 한 묶음을 처음 받는 데 약 200ms가 든다(문장 430개). 그동안 화면에는 직전 문장이
 * 남아 있어 깜빡이지는 않지만, 모드나 언어를 바꾸는 순간에는 어차피 기다리게 된다.
 * 첫 문장을 띄운 뒤 한가할 때 나머지를 받아두면 그 대기도 사라진다.
 *
 * 이미 캐시에 있으면 loadLocalItems가 바로 돌아오므로 여러 번 불러도 요청이
 * 늘지 않는다. 실패는 무시한다 — 어차피 미리 받아두는 것뿐이다.
 */
export function prefetchBundles(language: Language, useStreaming: boolean, activeMode: TypingMode) {
  const run = async () => {
    for (const mode of ["short", "long", "word"] as LocalMode[]) {
      /* 지금 쓰는 묶음은 건너뛴다. 그건 이미 받고 있거나 받았다.
         ⚠️ 한꺼번에 쏘면 안 된다. 처음에 세 묶음을 동시에 요청했더니 서로
         경쟁해서 정작 필요한 묶음이 수십 초씩 밀렸다. 하나씩 기다린다. */
      if (mode === activeMode) continue;
      try {
        // 밈 묶음은 미리 받지 않는다. 25문장뿐이라 받아도 이득이 없다.
        await loadLocalItems(language, mode, bundleFilterFor(language, useStreaming, false));
      } catch {
        // 미리 받아두는 것뿐이라 실패해도 넘어간다. 필요할 때 다시 받는다.
      }
    }
  };

  // 지금 치고 있는 문장의 렌더를 방해하지 않도록 한가할 때 돈다.
  if (typeof window !== "undefined" && "requestIdleCallback" in window) {
    window.requestIdleCallback(() => void run(), { timeout: 5000 });
    return;
  }
  setTimeout(() => void run(), 2000);
}

/**
 * 단어 모드용 단어 목록.
 *
 * 단어 모드는 문장처럼 한 덩어리로 끝나지 않고 다이얼처럼 계속 흐르므로,
 * 호출부가 직접 큐를 들고 관리한다. 여기서는 원본 목록만 넘긴다.
 */
export async function loadWordPool(language: Language) {
  // 단어에는 밈이 없다. 항상 전체를 쓴다.
  const items = await loadLocalItems(language, "word", "all");
  return items.map((item) => ({ text: item.text, sentenceId: item.id ?? undefined }));
}

export async function pickSentence({
  language,
  mode,
  newsSectors,
  useStreaming,
  memeOnly = false,
  newsTypingTarget,
  newsBodyAmount,
}: ContentRequest) {
  if (mode !== "news") {
    return pickLocalSentence(language, mode, bundleFilterFor(language, useStreaming, memeOnly));
  }

  const items = await loadNewsItems(language, newsSectors, newsTypingTarget, newsBodyAmount);
  const index = pickUnusedIndex(
    newsKey(language, newsSectors, newsTypingTarget, newsBodyAmount),
    items.length,
  );
  const item = items[index];
  if (!item) throw new Error("뉴스 문장을 선택하지 못했습니다.");
  return {
    ...item,
    id: randomId(),
  } satisfies ContentItem;
}
