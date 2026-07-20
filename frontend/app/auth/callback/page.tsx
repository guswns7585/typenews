"use client";

import Link from "next/link";
import { useEffect, useState } from "react";
import { getSupabaseClient } from "@/lib/supabase/client";

export default function AuthCallbackPage() {
  const [message, setMessage] = useState("계정을 연결하고 있습니다.");

  useEffect(() => {
    async function linkProfile() {
      const supabase = getSupabaseClient();
      const { error } = await supabase.rpc("link_current_google_identity");
      setMessage(
        error
          ? "새 계정입니다. 닉네임을 설정한 뒤 시작해 주세요."
          : "기존 Type News 계정이 연결되었습니다.",
      );
    }
    void linkProfile();
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
          연습으로 이동
        </Link>
      </div>
    </div>
  );
}
