"use client";

import { ShieldCheck } from "lucide-react";
import Link from "next/link";
import { useEffect, useState } from "react";
import { getSupabaseClient } from "@/lib/supabase/client";
import { useUiLanguage } from "@/lib/ui-language";

/**
 * 헤더의 관리자 진입 버튼.
 *
 * is_admin()이 true일 때만 보인다. 숨기는 것은 화면 정리 목적이고,
 * 권한 판정은 /admin에서 다시 하고 데이터는 RLS가 지킨다.
 */
export function AdminNavLink() {
  const { t } = useUiLanguage();
  const [isAdmin, setIsAdmin] = useState(false);

  useEffect(() => {
    const supabase = getSupabaseClient();
    if (!supabase) return undefined;
    let active = true;

    async function check(signedIn: boolean) {
      if (!signedIn) {
        if (active) setIsAdmin(false);
        return;
      }
      const { data, error } = await supabase!.rpc("is_admin");
      if (!active) return;
      if (error) {
        console.error("관리자 확인 실패", error);
        setIsAdmin(false);
        return;
      }
      setIsAdmin(data === true);
    }

    void supabase.auth.getSession().then(({ data }) => {
      if (!active) return;
      void check(Boolean(data.session));
    });

    const { data: sub } = supabase.auth.onAuthStateChange((_event, session) => {
      void check(Boolean(session));
    });

    return () => {
      active = false;
      sub.subscription.unsubscribe();
    };
  }, []);

  if (!isAdmin) return null;

  return (
    <Link href="/admin" className="chip-pill" title={t("관리자", "Admin")}>
      <ShieldCheck size={14} />
      {t("관리자", "Admin")}
    </Link>
  );
}
