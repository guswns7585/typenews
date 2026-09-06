"use client";

import { useEffect, useState } from "react";
import { LogOut } from "lucide-react";
import { PROFILE_UPDATED_EVENT, signOutUser } from "@/components/auth/auth-button";
import { ProfilePhotoSettings } from "@/components/settings/profile-photo-settings";
import { getSupabaseClient } from "@/lib/supabase/client";
import { messageOf } from "@/lib/supabase/errors";
import type { Language, TypingMode } from "@/lib/types";
import { useUiLanguage } from "@/lib/ui-language";

type Status = { kind: "idle" | "busy" | "done" | "error"; message?: string };

const REQUEST_MODES: Exclude<TypingMode, "news">[] = ["short", "long", "word"];

/** 서버(0042)와 같은 값. 화면 안내에만 쓰고, 실제 차단은 서버가 한다. */
const NICKNAME_COOLDOWN_MS = 24 * 60 * 60 * 1000;

/** 남은 시간을 "3시간 20분" 꼴로. 1시간 미만이면 분만 적는다. */
function formatRemaining(ms: number) {
  const minutes = Math.max(1, Math.ceil(ms / 60000));
  const hours = Math.floor(minutes / 60);
  const rest = minutes % 60;
  if (hours <= 0) return `${rest}분`;
  return rest > 0 ? `${hours}시간 ${rest}분` : `${hours}시간`;
}

export function AccountSettings() {
  const { locale, t } = useUiLanguage();
  const [signedIn, setSignedIn] = useState(false);
  const [nickname, setNickname] = useState("");
  const [nicknameStatus, setNicknameStatus] = useState<Status>({ kind: "idle" });
  /** 지금 저장된 이름. 같은 이름은 변경이 아니므로 잠금과 무관하게 보낼 수 있다. */
  const [savedNickname, setSavedNickname] = useState("");
  /** 다음 변경이 가능해지는 시각(ms). 0이면 잠겨 있지 않다. */
  const [nicknameUnlockAt, setNicknameUnlockAt] = useState(0);
  /* 남은 시간을 렌더 중에 Date.now()로 재면 순수하지 않다(React 규칙 위반).
     시계를 state로 들고 주기적으로 갱신해서 패널을 열어둔 채로도 줄어들게 한다. */
  const [now, setNow] = useState(0);

  const [language, setLanguage] = useState<Language>("kor");
  const [mode, setMode] = useState<Exclude<TypingMode, "news">>("short");
  const [sentence, setSentence] = useState("");
  const [requestStatus, setRequestStatus] = useState<Status>({ kind: "idle" });

  useEffect(() => {
    const supabase = getSupabaseClient();
    if (!supabase) return undefined;
    let active = true;

    async function loadProfile() {
      const { data, error } = await supabase!
        .from("profiles")
        .select("display_name, nickname_set, display_name_changed_at")
        .maybeSingle();
      if (error) {
        console.error("프로필을 읽지 못했습니다", error);
        return;
      }
      if (!active || !data) return;
      if (data.display_name) {
        setNickname(data.display_name);
        setSavedNickname(data.display_name);
      }
      /* 최초 설정은 제한 대상이 아니다(서버 0042와 같은 판정).
         컬럼이 아직 없는 서버라면 undefined가 와서 잠기지 않는다 — 어차피
         그 서버에는 제한 자체가 없으므로 화면과 동작이 어긋나지 않는다. */
      const changedAt = data.display_name_changed_at
        ? new Date(data.display_name_changed_at).getTime()
        : 0;
      setNicknameUnlockAt(
        data.nickname_set && changedAt ? changedAt + NICKNAME_COOLDOWN_MS : 0,
      );
    }

    void supabase.auth.getSession().then(({ data }) => {
      if (!active) return;
      setSignedIn(Boolean(data.session));
      if (data.session) void loadProfile();
    });

    const { data: subscription } = supabase.auth.onAuthStateChange((_event, session) => {
      setSignedIn(Boolean(session));
      if (session) void loadProfile();
    });

    return () => {
      active = false;
      subscription.subscription.unsubscribe();
    };
  }, []);

  /* 잠겨 있는 동안에만 시계를 돌린다. 분 단위로 보여주므로 30초면 충분하다.
     effect 본문에서 곧바로 setState를 부르면 렌더가 연쇄되므로 한 틱 미룬다. */
  useEffect(() => {
    if (!nicknameUnlockAt) return undefined;
    const tick = () => setNow(Date.now());
    const first = window.setTimeout(tick, 0);
    const timer = window.setInterval(tick, 30_000);
    return () => {
      window.clearTimeout(first);
      window.clearInterval(timer);
    };
  }, [nicknameUnlockAt]);

  if (!signedIn) {
    return <p className="settings-hint">{t("로그인하면 닉네임 변경과 문장 요청을 쓸 수 있습니다.", "Sign in to change your nickname and request new prompts.")}</p>;
  }

  async function saveNickname() {
    const supabase = getSupabaseClient();
    if (!supabase) return;
    setNicknameStatus({ kind: "busy" });

    const { data, error } = await supabase.rpc("update_my_display_name", {
      p_display_name: nickname,
    });
    if (error) {
      console.error("닉네임 변경 실패", error);
      setNicknameStatus({ kind: "error", message: messageOf(error, t("변경하지 못했습니다", "Could not update your nickname")) });
      return;
    }
    if (typeof data === "string") {
      setNickname(data);
      setSavedNickname(data);
    }
    // 방금 바꿨으니 24시간을 다시 센다. 서버가 기록한 시각과 몇 ms 차이는 있지만
    // 실제 차단은 서버가 하므로 화면 안내로는 충분하다.
    setNicknameUnlockAt(Date.now() + NICKNAME_COOLDOWN_MS);
    // 헤더의 로그아웃 버튼 등 다른 곳도 새 이름으로 갱신되게 알린다.
    window.dispatchEvent(new CustomEvent(PROFILE_UPDATED_EVENT));
    setNicknameStatus({ kind: "done", message: t("변경했습니다. 다음 변경은 24시간 뒤에 가능합니다", "Nickname updated. You can change it again in 24 hours") });
  }

  async function submitRequest() {
    const supabase = getSupabaseClient();
    if (!supabase) return;
    setRequestStatus({ kind: "busy" });

    const { error } = await supabase.rpc("submit_sentence_request", {
      p_language: language,
      p_mode: mode,
      p_text: sentence,
    });
    if (error) {
      console.error("문장 요청 실패", error);
      setRequestStatus({ kind: "error", message: messageOf(error, t("보내지 못했습니다", "Could not send the request")) });
      return;
    }
    setSentence("");
    setRequestStatus({ kind: "done", message: t("보냈습니다. 검토 후 반영됩니다", "Request sent for review") });
  }

  /* 같은 이름을 다시 저장하는 것은 변경이 아니므로 잠겨 있어도 막지 않는다
     (서버도 같은 판정으로 조기 반환한다).
     now가 0인 첫 프레임에는 잠그지 않는다 — 아직 시계를 읽기 전이라
     남은 시간을 알 수 없고, 실제 차단은 어차피 서버가 한다. */
  const remainingMs = now && nicknameUnlockAt ? nicknameUnlockAt - now : 0;
  const nicknameLocked = remainingMs > 0 && nickname.trim() !== savedNickname;

  return (
    <>
      <section className="settings-section">
        <h4>{t("닉네임", "Nickname")}</h4>
        <div className="settings-row">
          <input
            type="text"
            className="settings-input"
            value={nickname}
            maxLength={12}
            placeholder={t("1~12자", "1–12 characters")}
            aria-label={t("닉네임", "Nickname")}
            onChange={(event) => {
              setNickname(event.target.value);
              setNicknameStatus({ kind: "idle" });
            }}
          />
          <button
            type="button"
            className="chip-pill"
            disabled={nicknameStatus.kind === "busy" || !nickname.trim() || nicknameLocked}
            title={nicknameLocked ? t(`${formatRemaining(remainingMs)} 뒤에 바꿀 수 있습니다`, "You can change it after the cooldown") : undefined}
            onClick={() => void saveNickname()}
          >
            {t("저장", "Save")}
          </button>
        </div>
        {/* 잠겨 있으면 누르기 전에 알려준다. 실제 차단은 서버가 하지만,
            눌러 보고 나서야 알게 되면 고장으로 보인다. */}
        {nicknameLocked ? (
          <p className="settings-hint">
            {locale === "en"
              ? "You can change your nickname once every 24 hours"
              : `닉네임은 24시간에 한 번 바꿀 수 있습니다 · ${formatRemaining(remainingMs)} 남음`}
          </p>
        ) : null}
        {nicknameStatus.message ? (
          <p className={`settings-status is-${nicknameStatus.kind}`}>{nicknameStatus.message}</p>
        ) : null}
        {/* 로그아웃은 원래 헤더에서 설정 버튼 바로 옆에 있었다. 닉네임까지 함께
            적혀 있어서 설정을 누르려다 로그아웃되는 일이 잦다는 제보를 받았다.
            되돌릴 수 없는 동작이니 한 단계 안쪽으로 넣는다. */}
        <div className="settings-row settings-row-end">
          <span className="settings-hint">{t("계정", "Account")}</span>
          <button type="button" className="chip-pill" onClick={() => void signOutUser()}>
            <LogOut size={14} />
            {t("로그아웃", "Sign out")}
          </button>
        </div>
      </section>

      <ProfilePhotoSettings />

      <section className="settings-section">
        <h4>{t("문장 추가 요청", "Request a prompt")}</h4>
        <div className="settings-choice-row">
          <span className="settings-choice-label">{t("언어", "Language")}</span>
          <div className="settings-segmented" role="group" aria-label={t("요청 문장 언어", "Requested prompt language")}>
            <button
              type="button"
              data-selected={language === "kor"}
              aria-pressed={language === "kor"}
              onClick={() => setLanguage("kor")}
            >
              한국어
            </button>
            <button
              type="button"
              data-selected={language === "eng"}
              aria-pressed={language === "eng"}
              onClick={() => setLanguage("eng")}
            >
              English
            </button>
          </div>
        </div>
        <div className="settings-choice-row">
          <span className="settings-choice-label">{t("모드", "Mode")}</span>
          <div className="settings-segmented" role="group" aria-label={t("요청 문장 모드", "Requested prompt mode")}>
            {REQUEST_MODES.map((item) => (
              <button
                key={item}
                type="button"
                data-selected={mode === item}
                aria-pressed={mode === item}
                onClick={() => setMode(item)}
              >
                {{ short: t("단문", "Short"), long: t("장문", "Long"), word: t("단어", "Word") }[item]}
              </button>
            ))}
          </div>
        </div>
        <textarea
          className="settings-input settings-textarea"
          value={sentence}
          maxLength={400}
          rows={3}
          placeholder={t("추가했으면 하는 문장을 적어주세요", "Enter a prompt you would like us to add")}
          aria-label={t("요청할 문장", "Prompt request")}
          onChange={(event) => {
            setSentence(event.target.value);
            setRequestStatus({ kind: "idle" });
          }}
        />
        <div className="settings-row settings-row-end">
          <span className="settings-hint">{sentence.trim().length} / 400</span>
          <button
            type="button"
            className="chip-pill"
            disabled={requestStatus.kind === "busy" || sentence.trim().length < 2}
            onClick={() => void submitRequest()}
          >
            {t("보내기", "Send")}
          </button>
        </div>
        {requestStatus.message ? (
          <p className={`settings-status is-${requestStatus.kind}`}>{requestStatus.message}</p>
        ) : null}
      </section>
    </>
  );
}
