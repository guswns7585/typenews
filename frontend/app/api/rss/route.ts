import { NextRequest, NextResponse } from "next/server";

const allowedHosts = new Set(["news.sbs.co.kr", "feeds.bbci.co.uk"]);

export async function GET(request: NextRequest) {
  const source = request.nextUrl.searchParams.get("url");
  if (!source) return NextResponse.json({ error: "url is required" }, { status: 400 });

  let target: URL;
  try {
    target = new URL(source);
  } catch {
    return NextResponse.json({ error: "invalid url" }, { status: 400 });
  }

  if (!allowedHosts.has(target.hostname)) {
    return NextResponse.json({ error: "unapproved RSS host" }, { status: 403 });
  }

  const response = await fetch(target, {
    headers: { "User-Agent": "TypeNews/2.0 RSS reader" },
    next: { revalidate: 300 },
  });
  if (!response.ok) return NextResponse.json({ error: "RSS source unavailable" }, { status: 502 });

  return new NextResponse(await response.text(), {
    headers: { "content-type": "application/xml; charset=utf-8" },
  });
}
