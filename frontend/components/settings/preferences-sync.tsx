"use client";

import { useEffect } from "react";
import {
  applyPreferences,
  collectPreferences,
  loadRemotePreferences,
  saveRemotePreferences,
} from "@/features/preferences/remote-preferences";
import { getSupabaseClient } from "@/lib/supabase/client";
import { useSettingsStore } from "@/stores/use-settings-store";
import { useTypingStore } from "@/stores/use-typing-store";
import { useUiStore } from "@/stores/use-ui-store";

const SAVE_DEBOUNCE_MS = 1200;

/**
 * 로그인 사용자의 환경설정을 서버와 맞춘다.
 *
 * 로그인 시점에 서버 값을 내려받아 덮어쓰고(서버 우선), 이후 설정이 바뀌면
 * 잠깐 모았다가 올린다. 비로그인 사용자는 기존대로 localStorage만 쓴다.
 * 화면에 아무것도 그리지 않는다.
 */
export function PreferencesSync() {
  useEffect(() => {
    const supabase = getSupabaseClient();
    if (!supabase) return undefined;

    let disposed = false;
    // 어느 사용자 기준으로 서버 값을 적용했는지. 토큰 갱신 때마다 다시 적용하지 않기 위함이다.
    let hydratedUserId: string | null = null;
    let lastSaved = "";
    let saveTimer: number | null = null;

    function scheduleSave() {
      if (!hydratedUserId) return;
      if (saveTimer !== null) window.clearTimeout(saveTimer);
      saveTimer = window.setTimeout(() => {
        saveTimer = null;
        if (disposed || !hydratedUserId) return;
        const preferences = collectPreferences();
        const serialized = JSON.stringify(preferences);
        if (serialized === lastSaved) return;
        lastSaved = serialized;
        void saveRemotePreferences(preferences);
      }, SAVE_DEBOUNCE_MS);
    }

    async function hydrate(userId: string) {
      const remote = await loadRemotePreferences();
      if (disposed) return;

      if (remote) applyPreferences(remote);
      // 적용으로 발생한 스토어 변경이 곧바로 저장되지 않도록 현재 상태를 기준선으로 잡는다.
      lastSaved = JSON.stringify(collectPreferences());
      hydratedUserId = userId;

      // 서버에 아직 기록이 없으면 지금 상태를 초기값으로 올려둔다.
      if (!remote) void saveRemotePreferences(collectPreferences());
    }

    void supabase.auth.getSession().then(({ data }) => {
      const userId = data.session?.user.id;
      if (userId && !disposed) void hydrate(userId);
    });

    const { data: subscription } = supabase.auth.onAuthStateChange((event, session) => {
      const userId = session?.user.id ?? null;
      if (!userId) {
        hydratedUserId = null;
        lastSaved = "";
        /* 로그아웃하면 이 브라우저에 남은 기록도 지운다. 기록은 localStorage에
           있어서, 지우지 않으면 헤더에 직전 계정의 최고 CPM과 이번 달 점수가
           계속 보인다.
           세션이 없는 상태(첫 방문)와 구분해야 한다. INITIAL_SESSION에도 여기로
           들어오므로, 그때 지우면 비로그인 방문자의 기록이 매번 날아간다. */
        if (event === "SIGNED_OUT") useUiStore.getState().resetRecords();
        return;
      }
      if (userId !== hydratedUserId) void hydrate(userId);
    });

    const unsubscribers = [
      useUiStore.subscribe(scheduleSave),
      useTypingStore.subscribe(scheduleSave),
      useSettingsStore.subscribe(scheduleSave),
    ];

    return () => {
      disposed = true;
      if (saveTimer !== null) window.clearTimeout(saveTimer);
      subscription.subscription.unsubscribe();
      unsubscribers.forEach((unsubscribe) => unsubscribe());
    };
  }, []);

  return null;
}
