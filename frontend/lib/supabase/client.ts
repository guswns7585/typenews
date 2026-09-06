import { createClient, type SupabaseClient } from "@supabase/supabase-js";

let client: SupabaseClient | null = null;

// Supabase가 anon key를 publishable key로 이름을 바꿨다. 어느 쪽 이름으로 넣어도 동작하게 둘 다 받는다.
// process.env는 빌드 시점에 치환되므로 반드시 정적 접근이어야 한다. 변수로 키를 조립하면 값이 사라진다.
const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
const supabaseKey =
  process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY || process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;

export function hasSupabaseConfig() {
  return Boolean(supabaseUrl && supabaseKey);
}

export function getSupabaseClient() {
  if (!hasSupabaseConfig()) return null;
  client ??= createClient(
    supabaseUrl!,
    supabaseKey!,
    {
      auth: {
        autoRefreshToken: true,
        detectSessionInUrl: false,
        flowType: "pkce",
        persistSession: true,
      },
    },
  );
  return client;
}
