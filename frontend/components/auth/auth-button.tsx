"use client";

import { useEffect, useState } from "react";
import { getSupabaseClient, hasSupabaseConfig } from "@/lib/supabase/client";
import { useUiLanguage } from "@/lib/ui-language";

/** 프로필(닉네임 등)이 바뀌었을 때 화면 곳곳에 알리는 신호. */
export const PROFILE_UPDATED_EVENT = "typenews:profile-updated";

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

/**
 * 로그인 여부와 표시할 닉네임.
 *
 * 헤더의 로그인 버튼과 설정 버튼이 같은 값을 봐야 해서 훅으로 뺐다.
 * 로그아웃 버튼은 설정 사이드바 안으로 옮겼다 — 헤더에서 설정 바로 옆에 있으니
 * 설정을 누르려다 로그아웃되는 일이 잦다는 제보가 있었다.
 */
export function useAuthProfile() {
  const [isConfigured] = useState(hasSupabaseConfig);
  const [email, setEmail] = useState<string | null>(null);
  const [nickname, setNickname] = useState<string | null>(null);

  useEffect(() => {
    if (!isConfigured) return;
    const supabase = getSupabaseClient();
    if (!supabase) return;

    let active = true;

    /* 표시할 이름은 우리 DB의 profiles.display_name이다.
       예전에는 Google 계정 이름(user_metadata)만 읽어서, 설정에서 닉네임을
       바꿔도 여기 표시는 그대로였다. */
    async function loadNickname(signedIn: boolean) {
      if (!signedIn) {
        if (active) setNickname(null);
        return;
      }
      const { data, error } = await supabase!.from("profiles").select("display_name").maybeSingle();
      if (!active) return;
      if (error) {
        console.error("프로필 이름 불러오기 실패", error);
        return;
      }
      setNickname(data?.display_name ?? null);
    }

    void supabase.auth.getSession().then(({ data }) => {
      if (!active) return;
      setEmail(data.session?.user?.email ?? null);
      void loadNickname(Boolean(data.session));
    });

    const { data: sub } = supabase.auth.onAuthStateChange((_event, session) => {
      setEmail(session?.user?.email ?? null);
      void loadNickname(Boolean(session));
    });

    // 설정에서 닉네임을 바꾸면 곧바로 여기도 갱신되어야 한다.
    const onProfileUpdated = () => void loadNickname(true);
    window.addEventListener(PROFILE_UPDATED_EVENT, onProfileUpdated);

    return () => {
      active = false;
      sub.subscription.unsubscribe();
      window.removeEventListener(PROFILE_UPDATED_EVENT, onProfileUpdated);
    };
  }, [isConfigured]);

  async function signIn() {
    const supabase = getSupabaseClient();
    if (!supabase) return;
    const configuredSiteUrl = process.env.NEXT_PUBLIC_SITE_URL?.replace(/\/+$/, "");
    const siteUrl = configuredSiteUrl || window.location.origin;
    await supabase.auth.signInWithOAuth({
      provider: "google",
      options: { redirectTo: `${siteUrl}/auth/callback` },
    });
  }

  return { isConfigured, email, nickname, signedIn: Boolean(email), signIn };
}

/** 로그아웃. 로컬 기록 정리는 preferences-sync가 SIGNED_OUT 이벤트로 처리한다. */
export async function signOutUser() {
  const supabase = getSupabaseClient();
  if (!supabase) return;
  await supabase.auth.signOut();
}

/**
 * 헤더의 로그인 버튼.
 *
 * 로그인한 뒤에는 아무것도 그리지 않는다. 닉네임은 설정 버튼이 보여주고,
 * 로그아웃은 설정 사이드바 안에 있다.
 */
export function AuthButton() {
  const { t } = useUiLanguage();
  const { isConfigured, signedIn, signIn } = useAuthProfile();

  if (!isConfigured || signedIn) return null;

  return (
    <div id="auth-container">
      <button id="login-btn" type="button" className="btn-google" onClick={signIn}>
        <GoogleIcon />
        {t("Google로 로그인", "Sign in with Google")}
      </button>
    </div>
  );
}
