/**
 * Supabase가 돌려주는 예외 메시지는 그대로 보여줘도 되는 안내문이다.
 * PostgreSQL이 앞에 붙이는 접두사만 떼어낸다.
 */
export function messageOf(error: unknown, fallback: string) {
  if (error && typeof error === "object" && "message" in error) {
    const raw = String((error as { message: unknown }).message);
    return raw.replace(/^.*?:\s*/, "") || fallback;
  }
  return fallback;
}
