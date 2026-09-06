"use client";

import Link from "next/link";
import { useEffect, useState } from "react";
import { getSupabaseClient } from "@/lib/supabase/client";

export default function AuthCallbackPage() {
  const [message, setMessage] = useState("계정을 연결하고 있습니다.");

  useEffect(() => {
    let cancelled = false;

    async function linkProfile() {
      const supabase = getSupabaseClient();
      if (!supabase) {
        setMessage("Supabase 환경변수가 설정되지 않았습니다.");
        return;
      }

      const code = new URLSearchParams(window.location.search).get("code");
      if (code) {
        const { error: exchangeError } = await supabase.auth.exchangeCodeForSession(code);
        if (exchangeError) {
          if (!cancelled) setMessage("로그인 세션을 생성하지 못했습니다. 다시 로그인해 주세요.");
          return;
        }
        window.history.replaceState({}, "", "/auth/callback");
      }

      const { data: sessionData } = await supabase.auth.getSession();
      if (!sessionData.session) {
        if (!cancelled) setMessage("로그인 세션을 확인할 수 없습니다. 다시 로그인해 주세요.");
        return;
      }

      const { error } = await supabase.rpc("link_current_google_identity");
      if (error) {
        // 원인을 화면에 노출하면 스키마 정보가 새므로 콘솔에만 남긴다.
        console.error("link_current_google_identity 실패", error);
      }
      if (cancelled) return;
      if (error) {
        setMessage("계정 연결에 실패했습니다. 프로필 설정을 확인해 주세요.");
        return;
      }

      /* 성공하면 곧바로 타이핑 화면으로 돌려보낸다.
         이 페이지는 로그인할 때마다 거치는 경유지라, "연결되었습니다"를 띄워두고
         버튼을 누르게 하면 매번 같은 안내를 보게 된다. 처음 한 번이면 몰라도
         계속 나오면 무언가 잘못된 것처럼 보인다. */
      setMessage("로그인되었습니다. 잠시만 기다려 주세요.");
      window.location.replace("/");
    }

    void linkProfile();
    return () => {
      cancelled = true;
    };
  }, []);

  return (
    <div className="app-canvas" style={{ display: "flex", alignItems: "center", justifyContent: "center" }}>
      <div
        className="product-tile-light"
        style={{ maxWidth: 420, textAlign: "center", padding: "64px 48px" }}
      >
        <h1 className="product-tile-headline" style={{ fontSize: 28 }}>
          Type News
        </h1>
        <p className="product-tile-subcopy">{message}</p>
        <Link href="/" className="btn-primary-pill">
          타이핑으로 이동
        </Link>
      </div>
    </div>
  );
}
