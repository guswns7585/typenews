import { NextRequest, NextResponse } from "next/server";
import { approvedNewsFeed } from "@/features/content/news-feed-policy";

/**
 * 뉴스 RSS 프록시.
 *
 * 왜 프록시인가:
 *   1) 브라우저가 SBS·BBC를 직접 부르면 CORS에 막힌다
 *   2) 원본 타입뉴스는 사용자마다 직접 호출해서 **호출량 때문에 차단당한 적이 있다.**
 *      여기서 한 번 받아 캐시하면 상류로 나가는 호출이 사용자 수와 무관해진다
 *
 * 캐시가 두 겹이다.
 *   - fetch의 next.revalidate: Next 데이터 캐시. 같은 URL은 5분에 한 번만 상류로 나간다
 *   - 응답의 Cache-Control: Vercel CDN. 5분간은 이 함수조차 실행되지 않는다
 *
 * 클라이언트에도 캐시가 있다 (sentence-picker.ts의 newsCache). 그래서 문장을
 * 넘길 때마다 요청이 나가지는 않는다.
 */

/** 피드 하나가 이보다 크면 우리 대역폭을 태우는 것이다. SBS 전체 섹션이 200KB 안쪽이다. */
const MAX_FEED_BYTES = 2_000_000;

const CACHE_SECONDS = 300;

export async function GET(request: NextRequest) {
  const source = request.nextUrl.searchParams.get("url");
  if (!source) return NextResponse.json({ error: "url is required" }, { status: 400 });

  const target = approvedNewsFeed(source);
  if (!target) {
    return NextResponse.json({ error: "unapproved RSS feed" }, { status: 403 });
  }

  let response: Response;
  try {
    response = await fetch(target, {
      headers: { "User-Agent": "TypeNews/2.0 RSS reader" },
      next: { revalidate: CACHE_SECONDS },
    });
  } catch (error) {
    console.error("RSS 상류 호출 실패", target.hostname, error);
    return NextResponse.json({ error: "RSS source unreachable" }, { status: 502 });
  }

  if (!response.ok) {
    // 차단(403/429)인지 일시적 장애인지 구분되게 남긴다. 다시 막히면 여기를 본다.
    console.error("RSS 상류 응답 오류", target.hostname, response.status);
    return NextResponse.json({ error: "RSS source unavailable" }, { status: 502 });
  }

  const declared = Number(response.headers.get("content-length") ?? "0");
  if (declared > MAX_FEED_BYTES) {
    return NextResponse.json({ error: "RSS feed too large" }, { status: 502 });
  }

  const body = await response.text();
  if (body.length > MAX_FEED_BYTES) {
    return NextResponse.json({ error: "RSS feed too large" }, { status: 502 });
  }

  return new NextResponse(body, {
    headers: {
      "content-type": "application/xml; charset=utf-8",
      /* s-maxage로 CDN이 5분간 대신 응답한다. stale-while-revalidate 덕에 만료
         직후 요청도 낡은 값을 즉시 받고 갱신은 뒤에서 돈다 — 상류가 느리거나
         잠시 막혀도 뉴스 모드가 멈추지 않는다. */
      "cache-control": `public, s-maxage=${CACHE_SECONDS}, stale-while-revalidate=${CACHE_SECONDS * 4}`,
    },
  });
}
