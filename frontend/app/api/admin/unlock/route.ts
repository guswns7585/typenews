import { createHash, timingSafeEqual } from "node:crypto";
import { createClient } from "@supabase/supabase-js";
import { type NextRequest, NextResponse } from "next/server";
import { ADMIN_DEVICE_SECONDS, createAdminDeviceToken, verifyAdminDeviceToken } from "@/features/admin/admin-device";

const DEVICE_COOKIE = "typenews_admin_device";

/** 저장된 기기 잠금 해제를 확인한다. 실제 권한은 매번 is_admin()으로 다시 판정한다. */
export async function GET(request: NextRequest) {
  const admin = await verifiedAdmin(request);
  if ("response" in admin) return admin.response;

  const secret = process.env.ADMIN_PANEL_PASSWORD;
  if (!secret) return configurationError();
  const remembered = verifyAdminDeviceToken(request.cookies.get(DEVICE_COOKIE)?.value, admin.userId, secret);
  return remembered
    ? NextResponse.json({ ok: true })
    : NextResponse.json({ error: "기억된 기기가 아닙니다" }, { status: 401 });
}

/** 관리자 비밀번호를 확인하고 선택한 경우 이 브라우저를 30일간 기억한다. */
export async function POST(request: NextRequest) {
  const admin = await verifiedAdmin(request);
  if ("response" in admin) return admin.response;

  const expected = process.env.ADMIN_PANEL_PASSWORD;
  if (!expected) return configurationError();

  let password = "";
  let rememberDevice = false;
  try {
    const body: unknown = await request.json();
    if (body && typeof body === "object") {
      if ("password" in body && typeof (body as { password: unknown }).password === "string") {
        password = (body as { password: string }).password;
      }
      rememberDevice = "rememberDevice" in body && (body as { rememberDevice: unknown }).rememberDevice === true;
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

  const response = NextResponse.json({ ok: true, remembered: rememberDevice });
  if (rememberDevice) {
    const expires = Date.now() + ADMIN_DEVICE_SECONDS * 1000;
    response.cookies.set({
      name: DEVICE_COOKIE,
      value: createAdminDeviceToken(admin.userId, expires, expected),
      httpOnly: true,
      secure: process.env.NODE_ENV === "production",
      sameSite: "strict",
      path: "/",
      maxAge: ADMIN_DEVICE_SECONDS,
      expires: new Date(expires),
    });
  } else {
    forgetDevice(response);
  }
  return response;
}

/** 관리자 화면에서 잠글 때 브라우저 기억도 지운다. */
export async function DELETE() {
  const response = NextResponse.json({ ok: true });
  forgetDevice(response);
  return response;
}

async function verifiedAdmin(request: NextRequest): Promise<{ userId: string } | { response: NextResponse }> {
  const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const supabaseKey = process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY || process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
  if (!supabaseUrl || !supabaseKey) {
    return { response: NextResponse.json({ error: "Supabase 설정이 없습니다" }, { status: 503 }) };
  }

  const token = request.headers.get("authorization")?.replace(/^Bearer\s+/i, "").trim();
  if (!token) return { response: NextResponse.json({ error: "로그인이 필요합니다" }, { status: 401 }) };

  const supabase = createClient(supabaseUrl, supabaseKey, {
    auth: { autoRefreshToken: false, detectSessionInUrl: false, persistSession: false },
    global: { headers: { Authorization: `Bearer ${token}` } },
  });
  const [{ data: isAdmin, error: adminError }, { data: userData, error: userError }] = await Promise.all([
    supabase.rpc("is_admin"),
    supabase.auth.getUser(token),
  ]);
  if (adminError || userError || isAdmin !== true || !userData.user) {
    return { response: NextResponse.json({ error: "권한이 없습니다" }, { status: 403 }) };
  }
  return { userId: userData.user.id };
}

function forgetDevice(response: NextResponse) {
  response.cookies.set({
    name: DEVICE_COOKIE,
    value: "",
    httpOnly: true,
    secure: process.env.NODE_ENV === "production",
    sameSite: "strict",
    path: "/",
    maxAge: 0,
    expires: new Date(0),
  });
}

function configurationError() {
  return NextResponse.json({ error: "ADMIN_PANEL_PASSWORD가 설정되지 않았습니다" }, { status: 503 });
}

/** 길이가 달라도 비교 시간이 새지 않게 해시를 거친 뒤 맞춘다. */
function matches(given: string, expected: string) {
  const a = createHash("sha256").update(given).digest();
  const b = createHash("sha256").update(expected).digest();
  return timingSafeEqual(a, b);
}
