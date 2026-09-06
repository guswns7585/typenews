import { createHash } from "node:crypto";
import { createClient } from "@supabase/supabase-js";
import { NextRequest, NextResponse } from "next/server";
import { parseNewsFeed } from "@/features/content/news-feed";
import { approvedNewsFeed } from "@/features/content/news-feed-policy";
import type { NewsBodyAmount, NewsTypingTarget } from "@/lib/types";

const MAX_FEED_BYTES = 2_000_000;
const CACHE_SECONDS = 300;
const SOURCE_LIFETIME_MS = 48 * 60 * 60 * 1000;
const NEWS_TARGETS: NewsTypingTarget[] = ["title", "body"];
const NEWS_AMOUNTS: NewsBodyAmount[] = ["small", "medium", "large"];

function adminClient() {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!url || !key) return null;
  return createClient(url, key, { auth: { persistSession: false, autoRefreshToken: false } });
}

export async function GET(request: NextRequest) {
  const source = request.nextUrl.searchParams.get("url");
  if (!source) return NextResponse.json({ error: "url is required" }, { status: 400 });

  const rawTarget = request.nextUrl.searchParams.get("target") ?? "body";
  const rawAmount = request.nextUrl.searchParams.get("amount") ?? "medium";
  if (!NEWS_TARGETS.includes(rawTarget as NewsTypingTarget)) {
    return NextResponse.json({ error: "invalid news target" }, { status: 400 });
  }
  if (!NEWS_AMOUNTS.includes(rawAmount as NewsBodyAmount)) {
    return NextResponse.json({ error: "invalid news amount" }, { status: 400 });
  }
  const targetMode = rawTarget as NewsTypingTarget;
  const bodyAmount = rawAmount as NewsBodyAmount;

  const target = approvedNewsFeed(source);
  if (!target) return NextResponse.json({ error: "unapproved RSS feed" }, { status: 403 });

  const supabase = adminClient();
  if (!supabase) {
    console.error("뉴스 원문 등록에 필요한 서버 전용 Supabase 키가 없습니다.");
    return NextResponse.json({ error: "news verification is not configured" }, { status: 503 });
  }

  let upstream: Response;
  try {
    upstream = await fetch(target, {
      headers: { "User-Agent": "TypeNews/2.0 RSS reader" },
      next: { revalidate: CACHE_SECONDS },
    });
  } catch (error) {
    console.error("RSS 상류 호출 실패", target.hostname, error);
    return NextResponse.json({ error: "RSS source unreachable" }, { status: 502 });
  }

  if (!upstream.ok) {
    console.error("RSS 상류 응답 오류", target.hostname, upstream.status);
    return NextResponse.json({ error: "RSS source unavailable" }, { status: 502 });
  }

  const declared = Number(upstream.headers.get("content-length") ?? "0");
  if (declared > MAX_FEED_BYTES) {
    return NextResponse.json({ error: "RSS feed too large" }, { status: 502 });
  }

  const xml = await upstream.text();
  if (xml.length > MAX_FEED_BYTES) {
    return NextResponse.json({ error: "RSS feed too large" }, { status: 502 });
  }

  const items = parseNewsFeed(xml, target.toString(), {
    target: targetMode,
    amount: bodyAmount,
  });
  if (!items.length) return NextResponse.json({ error: "RSS feed is empty" }, { status: 502 });

  const expiresAt = new Date(Date.now() + SOURCE_LIFETIME_MS).toISOString();
  const rows = items.map((item) => ({
    source_feed_url: target.toString(),
    article_url: item.sourceUrl ?? null,
    title: item.title,
    body: item.text,
    content_hash: createHash("sha256")
      // 같은 기사가 여러 SBS 카테고리에 있어도 검산 원문은 한 건만 둔다.
      .update(`${item.sourceUrl ?? ""}\n${item.title}\n${item.text}`)
      .digest("hex"),
    expires_at: expiresAt,
  }));

  const { data, error } = await supabase
    .from("news_score_sources")
    .upsert(rows, { onConflict: "content_hash" })
    .select("id,content_hash");
  if (error || !data) {
    console.error("뉴스 검산 원문 등록 실패", error);
    return NextResponse.json({ error: "news verification unavailable" }, { status: 503 });
  }

  const ids = new Map(data.map((row) => [String(row.content_hash), String(row.id)]));
  return NextResponse.json(
    {
      items: items.map((item, index) => ({
        ...item,
        scoreSourceId: ids.get(rows[index].content_hash),
      })),
    },
    {
      headers: {
        "cache-control": `public, s-maxage=${CACHE_SECONDS}, stale-while-revalidate=${CACHE_SECONDS * 4}`,
      },
    },
  );
}
