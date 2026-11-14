"use client";

import { useEffect, useState } from "react";
import { getSupabaseClient } from "@/lib/supabase/client";

export function useAdminStatus() {
  const [isAdmin, setIsAdmin] = useState(false);

  useEffect(() => {
    const supabase = getSupabaseClient();
    if (!supabase) return;
    let active = true;
    async function check(signedIn: boolean) {
      if (!signedIn) { if (active) setIsAdmin(false); return; }
      const { data, error } = await supabase!.rpc("is_admin");
      if (active) setIsAdmin(!error && data === true);
    }
    void supabase.auth.getSession().then(({ data }) => void check(Boolean(data.session)));
    const { data: sub } = supabase.auth.onAuthStateChange((_event, session) => void check(Boolean(session)));
    return () => { active = false; sub.subscription.unsubscribe(); };
  }, []);

  return { isAdmin };
}
