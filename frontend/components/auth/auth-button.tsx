"use client";

import { LogOut } from "lucide-react";
import { useEffect, useState } from "react";
import { getSupabaseClient } from "@/lib/supabase/client";

function GoogleIcon() {
  return (
    <svg width="18" height="18" viewBox="0 0 18 18" aria-hidden="true">
      <path
        fill="#4285F4"
        d="M17.64 9.2c0-.64-.06-1.25-.16-1.84H9v3.48h4.84c-.21 1.13-.85 2.09-1.81 2.73v2.27h2.92c1.71-1.57 2.69-3.88 2.69-6.64z"
      />
      <path
        fill="#34A853"
        d="M9 18c2.43 0 4.47-.8 5.96-2.17l-2.92-2.27c-.81.54-1.85.86-3.04.86-2.34 0-4.32-1.58-5.03-3.71H.96v2.33C2.44 15.98 5.48 18 9 18z"
      />
      <path
        fill="#FBBC05"
        d="M3.97 10.71c-.18-.54-.28-1.11-.28-1.71s.1-1.17.28-1.71V4.96H.96A8.997 8.997 0 000 9c0 1.45.35 2.83.96 4.04l3.01-2.33z"
      />
      <path
        fill="#EA4335"
        d="M9 3.58c1.32 0 2.5.45 3.44 1.35l2.58-2.58C13.46.89 11.43 0 9 0 5.48 0 2.44 2.02.96 4.96l3.01 2.33C4.68 5.16 6.66 3.58 9 3.58z"
      />
    </svg>
  );
}

export function AuthButton() {
  const [email, setEmail] = useState<string | null>(null);
  const [nickname, setNickname] = useState<string | null>(null);

  useEffect(() => {
    const supabase = getSupabaseClient();
    void supabase.auth.getSession().then(({ data }) => {
      const user = data.session?.user;
      setEmail(user?.email ?? null);
      setNickname(
        (user?.user_metadata?.nickname as string | undefined) ??
          (user?.user_metadata?.full_name as string | undefined) ??
          null,
      );
    });
    const { data: sub } = supabase.auth.onAuthStateChange((_event, session) => {
      setEmail(session?.user?.email ?? null);
      setNickname(
        (session?.user?.user_metadata?.nickname as string | undefined) ??
          (session?.user?.user_metadata?.full_name as string | undefined) ??
          null,
      );
    });
    return () => sub.subscription.unsubscribe();
  }, []);

  async function signIn() {
    const supabase = getSupabaseClient();
    await supabase.auth.signInWithOAuth({
      provider: "google",
      options: { redirectTo: `${window.location.origin}/auth/callback` },
    });
  }

  async function signOut() {
    await getSupabaseClient().auth.signOut();
    setEmail(null);
    setNickname(null);
  }

  return (
    <div id="auth-container">
      {!email ? (
        <button id="login-btn" type="button" className="btn-google" onClick={signIn}>
          <GoogleIcon />
          Google로 로그인
        </button>
      ) : (
        <button id="logout-btn" type="button" className="btn-dark-utility" onClick={signOut}>
          {nickname ? <span id="user-nickname">{nickname}</span> : null}
          <LogOut size={14} />
          로그아웃
        </button>
      )}
    </div>
  );
}
