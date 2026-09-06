"use client";

import { useEffect, useState } from "react";
import { PROFILE_UPDATED_EVENT } from "@/components/auth/auth-button";
import { getSupabaseClient } from "@/lib/supabase/client";
import { useUiLanguage } from "@/lib/ui-language";

/** Supabase 예외 메시지는 그대로 보여줘도 되는 안내문이다. */
function messageOf(error: unknown, fallback: string) {
  if (error && typeof error === "object" && "message" in error) {
    const raw = String((error as { message: unknown }).message);
    return raw.replace(/^.*?:\s*/, "") || fallback;
  }
  return fallback;
}

/**
 * 처음 로그인한 사용자에게 닉네임을 묻는다.
 *
 * 프로필이 만들어질 때 display_name에는 Google 계정 이름이 들어간다.
 * 그것만으로는 사용자가 직접 정한 이름인지 알 수 없어서 profiles.nickname_set으로
 * 구분한다. false면 아직 물어본 적이 없다는 뜻이다.
 *
 * 랭킹에 그대로 노출되는 이름이라, 구글 실명이 본인도 모르게 올라가는 것을 막는
 * 목적도 있다.
 */
export function NicknameSetupModal() {
  const { t } = useUiLanguage();
  const [open, setOpen] = useState(false);
  const [nickname, setNickname] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    const supabase = getSupabaseClient();
    if (!supabase) return undefined;
    let active = true;

    async function check(signedIn: boolean) {
      if (!signedIn) {
        if (active) setOpen(false);
        return;
      }
      const { data, error: loadError } = await supabase!
        .from("profiles")
        .select("display_name, nickname_set")
        .maybeSingle();
      if (!active) return;
      if (loadError) {
        console.error("닉네임 설정 여부 확인 실패", loadError);
        return;
      }
      if (data && !data.nickname_set) {
        // 구글 이름을 초깃값으로 채워두면 그대로 쓸 사람은 저장만 누르면 된다.
        setNickname((data.display_name ?? "").slice(0, 12));
        setOpen(true);
      }
    }

    void supabase.auth.getSession().then(({ data }) => {
      if (active) void check(Boolean(data.session));
    });

    const { data: sub } = supabase.auth.onAuthStateChange((_event, session) => {
      void check(Boolean(session));
    });

    return () => {
      active = false;
      sub.subscription.unsubscribe();
    };
  }, []);

  if (!open) return null;

  async function save() {
    const supabase = getSupabaseClient();
    if (!supabase) return;
    setBusy(true);
    setError(null);

    const { error: saveError } = await supabase.rpc("update_my_display_name", {
      p_display_name: nickname,
    });
    setBusy(false);

    if (saveError) {
      console.error("닉네임 설정 실패", saveError);
      setError(messageOf(saveError, t("저장하지 못했습니다", "Could not save your nickname")));
      return;
    }

    window.dispatchEvent(new CustomEvent(PROFILE_UPDATED_EVENT));
    setOpen(false);
  }

  return (
    // 닫기 수단을 두지 않는다. 이름 없이 랭킹에 오르는 상태를 만들지 않기 위해서다.
    <div className="modal-backdrop" role="presentation">
      <div className="modal-card" role="dialog" aria-modal="true" aria-labelledby="nickname-setup-title">
        <h2 id="nickname-setup-title">{t("닉네임을 정해주세요", "Choose a nickname")}</h2>
        <p>{t("랭킹에 표시되는 이름입니다. 나중에 설정에서 바꿀 수 있습니다.", "This name appears in the ranking. You can change it later in Settings.")}</p>

        <input
          type="text"
          className="settings-input"
          value={nickname}
          maxLength={12}
          placeholder={t("1~12자", "1–12 characters")}
          aria-label={t("닉네임", "Nickname")}
          autoFocus
          onChange={(event) => {
            setNickname(event.target.value);
            setError(null);
          }}
          onKeyDown={(event) => {
            if (event.key === "Enter" && nickname.trim()) void save();
          }}
        />

        {error ? <p className="settings-status is-error">{error}</p> : null}

        <div className="modal-actions">
          <span className="settings-hint">{nickname.trim().length} / 12</span>
          <button
            type="button"
            className="btn-primary-pill"
            disabled={busy || !nickname.trim()}
            onClick={() => void save()}
          >
            {busy ? t("저장 중...", "Saving...") : t("시작하기", "Start")}
          </button>
        </div>
      </div>
    </div>
  );
}
