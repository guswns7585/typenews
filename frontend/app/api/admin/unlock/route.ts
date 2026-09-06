import { createHash, timingSafeEqual } from "node:crypto";
import { createClient } from "@supabase/supabase-js";
import { NextResponse } from "next/server";

/**
 * 관리자 페이지 잠금 해제.
 *
 * ⚠️ 이것은 권한 검사가 아니다. 오조작 방지용 잠금이다.
 * 실제 권한은 Supabase의 RLS와 is_admin()이 판정한다. 여기를 통과해도
 * 관리자가 아니면 어떤 행도 읽거나 고칠 수 없다.
 *
 * 비밀번호를 클라이언트에서 비교하면 번들에 값이 그대로 들어간다.
 * 그래서 서버에서만 비교하고, 환경변수 이름에도 NEXT_PUBLIC을 붙이지 않는다.
 */
export async function POST(request: Request) {
  const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const supabaseKey =
    process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY || process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
  if (!supabaseUrl || !supabaseKey) {
    return NextResponse.json({ error: "Supabase 설정이 없습니다" }, { status: 503 });
  }

  const token = request.headers.get("authorization")?.replace(/^Bearer\s+/i, "").trim();
  if (!token) {
    return NextResponse.json({ error: "로그인이 필요합니다" }, { status: 401 });
  }

  /* 비밀번호 정답 여부를 확인하기 전에 실제 관리자 계정인지 DB에서 판정한다.
     이 검사가 없으면 인터넷의 누구나 이 API를 비밀번호 확인기로 쓸 수 있다. */
  const supabase = createClient(supabaseUrl, supabaseKey, {
    auth: { autoRefreshToken: false, detectSessionInUrl: false, persistSession: false },
    global: { headers: { Authorization: `Bearer ${token}` } },
  });
  const { data: isAdmin, error: adminError } = await supabase.rpc("is_admin");
  if (adminError || isAdmin !== true) {
    return NextResponse.json({ error: "권한이 없습니다" }, { status: 403 });
  }

  const expected = process.env.ADMIN_PANEL_PASSWORD;
  if (!expected) {
    return NextResponse.json(
      { error: "ADMIN_PANEL_PASSWORD가 설정되지 않았습니다" },
      { status: 503 },
    );
  }

  let password = "";
  try {
    const body: unknown = await request.json();
    if (body && typeof body === "object" && "password" in body) {
      const value = (body as { password: unknown }).password;
      if (typeof value === "string") password = value;
    }
  } catch {
    return NextResponse.json({ error: "잘못된 요청입니다" }, { status: 400 });
  }

  if (!password || password.length > 256) {
    return NextResponse.json({ error: "비밀번호를 입력하세요" }, { status: 400 });
  }

  if (!matches(password, expected)) {
    return NextResponse.json({ error: "비밀번호가 맞지 않습니다" }, { status: 401 });
  }

  return NextResponse.json({ ok: true });
}

/** 길이가 달라도 비교 시간이 새지 않게 해시를 거친 뒤 맞춘다. */
function matches(given: string, expected: string) {
  const a = createHash("sha256").update(given).digest();
  const b = createHash("sha256").update(expected).digest();
  return timingSafeEqual(a, b);
}
