import { createHash } from "node:crypto";
import { createClient } from "@supabase/supabase-js";
import { NextResponse } from "next/server";

const CATEGORIES = new Set(["bug", "feature", "content", "other"]);

export async function POST(request: Request) {
  const url = process.env.SUPABASE_URL || process.env.NEXT_PUBLIC_SUPABASE_URL;
  const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!url || !serviceKey) return NextResponse.json({ error: "건의함 설정이 없습니다" }, { status: 503 });

  const requestOrigin = request.headers.get("origin");
  if (requestOrigin && new URL(request.url).origin !== requestOrigin) {
    return NextResponse.json({ error: "허용되지 않은 요청입니다" }, { status: 403 });
  }
  const contentLength = Number(request.headers.get("content-length") || 0);
  if (contentLength > 12_000) return NextResponse.json({ error: "내용이 너무 깁니다" }, { status: 413 });

  let input: Record<string, unknown>;
  try {
    const body: unknown = await request.json();
    if (!body || typeof body !== "object") throw new Error("invalid");
    input = body as Record<string, unknown>;
  } catch {
    return NextResponse.json({ error: "잘못된 요청입니다" }, { status: 400 });
  }

  if (typeof input.website === "string" && input.website) {
    return NextResponse.json({ ok: true });
  }
  const category = text(input.category, 20);
  const title = text(input.title, 120);
  const body = text(input.body, 3000);
  const pagePath = text(input.pagePath, 500);
  const contactEmail = text(input.contactEmail, 254).toLowerCase() || null;
  if (!CATEGORIES.has(category) || !title || !body) {
    return NextResponse.json({ error: "유형, 제목과 내용을 확인해주세요" }, { status: 400 });
  }
  if (contactEmail && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(contactEmail)) {
    return NextResponse.json({ error: "연락받을 이메일을 확인해주세요" }, { status: 400 });
  }

  const userAgent = (request.headers.get("user-agent") || "").slice(0, 500);
  const forwarded = request.headers.get("x-forwarded-for")?.split(",")[0]?.trim();
  const address = forwarded || request.headers.get("x-real-ip") || "local";
  const fingerprint = createHash("sha256")
    .update(`${address}\n${userAgent}\n${process.env.FEEDBACK_HASH_SALT || serviceKey.slice(-24)}`)
    .digest("hex");
  const supabase = createClient(url, serviceKey, {
    auth: { autoRefreshToken: false, detectSessionInUrl: false, persistSession: false },
  });

  const tenMinutesAgo = new Date(Date.now() - 10 * 60 * 1000).toISOString();
  const { count, error: countError } = await supabase
    .from("feedback_submissions")
    .select("id", { count: "exact", head: true })
    .eq("request_fingerprint", fingerprint)
    .gte("created_at", tenMinutesAgo);
  if (countError) {
    console.error("건의함 횟수 확인 실패", countError);
    return NextResponse.json({ error: "건의함을 준비 중입니다" }, { status: 503 });
  }
  if ((count ?? 0) >= 3) {
    return NextResponse.json({ error: "잠시 후 다시 보내주세요" }, { status: 429 });
  }

  let profileId: string | null = null;
  const token = request.headers.get("authorization")?.replace(/^Bearer\s+/i, "").trim();
  if (token) {
    const { data } = await supabase.auth.getUser(token);
    if (data.user) {
      const { data: profile } = await supabase
        .from("profiles")
        .select("id")
        .eq("supabase_user_id", data.user.id)
        .maybeSingle();
      profileId = profile?.id ?? null;
    }
  }

  const { data, error } = await supabase.from("feedback_submissions").insert({
    profile_id: profileId,
    category,
    title,
    body,
    page_path: pagePath,
    user_agent: userAgent,
    contact_email: contactEmail,
    request_fingerprint: fingerprint,
  }).select("id").single();
  if (error) {
    console.error("건의함 저장 실패", error);
    return NextResponse.json({ error: "건의사항을 저장하지 못했습니다" }, { status: 500 });
  }

  return NextResponse.json({ ok: true, id: data.id });
}

function text(value: unknown, limit: number) {
  return typeof value === "string" ? value.trim().slice(0, limit) : "";
}
