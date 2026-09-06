"use client";

import { PartyPopper, X } from "lucide-react";
import { useEffect, useState } from "react";
import { createPortal } from "react-dom";
import { getSupabaseClient } from "@/lib/supabase/client";
import { messageOf } from "@/lib/supabase/errors";
import { useUiLanguage } from "@/lib/ui-language";
import type { UiLocale } from "@/lib/types";

type PendingPrize = {
  winner_id: number;
  month_id: string;
  prize_name: string;
  prize_sponsor: string | null;
  respond_by: string;
  status: string;
  has_address: boolean;
};

type Form = {
  recipient: string;
  phone: string;
  postalCode: string;
  address1: string;
  address2: string;
  memo: string;
};

const EMPTY: Form = {
  recipient: "",
  phone: "",
  postalCode: "",
  address1: "",
  address2: "",
  memo: "",
};

/**
 * "그만보기"를 누른 당첨 번호들.
 *
 * 서버에는 남기지 않는다. 당첨 사실 자체는 그대로 유효하고, 이건 이 브라우저에서
 * 안내를 접어두겠다는 뜻일 뿐이다. 다른 기기에서는 다시 보인다.
 */
const DISMISSED_KEY = "typenews:prize-dismissed";

function readDismissed(): number[] {
  try {
    const raw = window.localStorage.getItem(DISMISSED_KEY);
    const parsed = raw ? JSON.parse(raw) : [];
    return Array.isArray(parsed) ? parsed.filter((v) => typeof v === "number") : [];
  } catch {
    return [];
  }
}

function addDismissed(winnerId: number) {
  try {
    const next = [...new Set([...readDismissed(), winnerId])];
    window.localStorage.setItem(DISMISSED_KEY, JSON.stringify(next));
  } catch {
    // 저장에 실패해도 이번 세션에서는 숨긴다.
  }
}

/** "8월 3일(일) 23시 50분" — 메일 안내와 같은 형식으로 보여준다. */
function formatDeadline(iso: string, locale: UiLocale) {
  const date = new Date(iso);
  if (Number.isNaN(date.getTime())) return "";
  return new Intl.DateTimeFormat(locale === "en" ? "en-US" : "ko-KR", {
    timeZone: "Asia/Seoul",
    month: "long",
    day: "numeric",
    weekday: "short",
    hour: "2-digit",
    minute: "2-digit",
    hour12: locale === "en",
  }).format(date);
}

function monthLabel(monthId: string, locale: UiLocale) {
  const month = Number(monthId.slice(4, 6));
  if (locale === "ko") return `${month}월`;
  return new Intl.DateTimeFormat("en-US", { month: "long" }).format(new Date(2020, month - 1, 1));
}

/**
 * 당첨 안내 배너와 주소 입력 모달.
 *
 * 메일로도 같은 안내가 나가므로, 당첨자가 메일로 회신해버릴 수도 있다.
 * 그 경우 관리자가 화면에서 "받았음"으로 표시한다(mark_winner_responded).
 * 여기서는 사이트로 입력하는 경로만 다룬다.
 */
export function PrizeClaim() {
  const { isEnglish, locale, t } = useUiLanguage();
  const [prize, setPrize] = useState<PendingPrize | null>(null);
  const [open, setOpen] = useState(false);
  const [form, setForm] = useState<Form>(EMPTY);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [done, setDone] = useState(false);
  const [reloadToken, setReloadToken] = useState(0);
  const [hidden, setHidden] = useState(false);

  useEffect(() => {
    const supabase = getSupabaseClient();
    if (!supabase) return undefined;
    let active = true;

    async function load(signedIn: boolean) {
      if (!signedIn) {
        if (active) setPrize(null);
        return;
      }
      const { data, error: rpcError } = await supabase!.rpc("get_my_pending_prize");
      if (!active) return;
      if (rpcError) {
        // 0019 적용 전이면 함수가 없다. 화면을 막을 이유는 없으니 조용히 넘어간다.
        console.error("당첨 정보 확인 실패", rpcError);
        return;
      }
      const row = Array.isArray(data) ? (data[0] as PendingPrize | undefined) : undefined;
      setPrize(row ?? null);
      /* localStorage는 서버 렌더에서 읽을 수 없다. RPC를 기다린 뒤(=브라우저에서)
         확인한다. effect 본문에서 곧바로 setState 하면 안 되는 이유이기도 하다. */
      setHidden(row ? readDismissed().includes(row.winner_id) : false);
    }

    void supabase.auth.getSession().then(({ data }) => {
      if (active) void load(Boolean(data.session));
    });
    const { data: sub } = supabase.auth.onAuthStateChange((_event, session) => {
      void load(Boolean(session));
    });

    return () => {
      active = false;
      sub.subscription.unsubscribe();
    };
  }, [reloadToken]);

  useEffect(() => {
    if (!open) return undefined;
    function onKeyDown(event: KeyboardEvent) {
      if (event.key === "Escape") setOpen(false);
    }
    document.addEventListener("keydown", onKeyDown);
    return () => document.removeEventListener("keydown", onKeyDown);
  }, [open]);

  if (!prize || hidden) return null;

  // 이미 주소를 넣었으면 배너만 조용히 바꾼다.
  const submitted = prize.has_address || prize.status === "confirmed";
  const deadline = formatDeadline(prize.respond_by, locale);

  /** 이 브라우저에서 안내를 접는다. 되돌릴 수 없으므로 한 번 묻는다. */
  function dismiss() {
    if (!prize) return;
    const warning = submitted
      ? t(
          `이 안내를 다시 표시하지 않습니다.\n\n배송지는 이미 접수되었으니 문제 없습니다.\n주소를 고치셔야 하면 지금 "주소 수정"을 눌러주세요.`,
          `This notice will not appear again.\n\nYour shipping address has been received. Choose "Edit address" now if it needs correcting.`,
        )
      : t(
          `이 안내를 다시 표시하지 않습니다.\n\n아직 배송지를 입력하지 않으셨습니다.\n기한(${deadline})까지 입력하지 않으면 당첨이 취소되고 재추첨됩니다.\n\n안내 메일로 회신하셔도 됩니다. 그래도 숨기시겠습니까?`,
          `This notice will not appear again.\n\nYou have not submitted a shipping address. If it is not submitted by ${deadline}, the prize may be redrawn.\n\nYou may also reply to the notification email. Hide this notice anyway?`,
        );
    if (!window.confirm(warning)) return;
    addDismissed(prize.winner_id);
    setHidden(true);
  }

  /** 이미 낸 주소를 불러와 폼을 채운다. 빈 칸부터 다시 쓰게 하지 않는다. */
  async function openForEdit() {
    const supabase = getSupabaseClient();
    if (!supabase || !prize) return;
    setError(null);
    setDone(false);
    setOpen(true);

    // 본인 행만 보이도록 RLS가 걸려 있어 그대로 조회하면 된다.
    const { data, error: queryError } = await supabase
      .from("winner_addresses")
      .select("recipient, phone, postal_code, address1, address2, memo")
      .eq("winner_id", prize.winner_id)
      .maybeSingle();

    if (queryError) {
      console.error("기존 배송지 조회 실패", queryError);
      return;
    }
    if (!data) return;
    setForm({
      recipient: data.recipient ?? "",
      phone: data.phone ?? "",
      postalCode: data.postal_code ?? "",
      address1: data.address1 ?? "",
      address2: data.address2 ?? "",
      memo: data.memo ?? "",
    });
  }

  async function submit() {
    const supabase = getSupabaseClient();
    if (!supabase || !prize) return;
    setBusy(true);
    setError(null);

    const { error: rpcError } = await supabase.rpc("submit_winner_address", {
      p_winner_id: prize.winner_id,
      p_recipient: form.recipient,
      p_phone: form.phone,
      p_postal_code: form.postalCode,
      p_address1: form.address1,
      p_address2: form.address2 || null,
      p_memo: form.memo || null,
    });
    setBusy(false);

    if (rpcError) {
      console.error("배송지 저장 실패", rpcError);
      setError(messageOf(rpcError, t("저장하지 못했습니다", "Could not save the address")));
      return;
    }
    setDone(true);
    setForm(EMPTY);
    setReloadToken((value) => value + 1);
  }

  return (
    <>
      <div className="prize-banner" role="status">
        <PartyPopper size={18} aria-hidden="true" />
        <div className="prize-banner-text">
          <strong>
            {isEnglish
              ? `You won the ${monthLabel(prize.month_id, locale)} event — ${prize.prize_name}`
              : `${monthLabel(prize.month_id, locale)} 이벤트에 당첨되셨습니다 — ${prize.prize_name}`}
          </strong>
          <span>
            {submitted
              ? t("배송지를 받았습니다. 발송까지 조금만 기다려 주세요.", "Your shipping address has been received. Please allow time for dispatch.")
              : isEnglish ? `Submit your shipping address by ${deadline}.` : `${deadline}까지 배송지를 입력해 주세요.`}
          </span>
        </div>
        <div className="prize-banner-actions">
          {submitted ? (
            <button type="button" className="chip-pill" onClick={() => void openForEdit()}>
              {t("주소 수정", "Edit address")}
            </button>
          ) : (
            <button type="button" className="chip-pill" onClick={() => setOpen(true)}>
              {t("배송지 입력", "Add shipping address")}
            </button>
          )}
          <button
            type="button"
            className="chip-pill prize-banner-dismiss"
            title={t("이 브라우저에서 안내를 숨깁니다", "Hide this notice in this browser")}
            onClick={dismiss}
          >
            {t("그만보기", "Dismiss")}
          </button>
        </div>
      </div>

      {open
        ? createPortal(
            <>
              <div className="settings-scrim" onClick={() => setOpen(false)} aria-hidden="true" />
              <div className="modal-card prize-modal" role="dialog" aria-modal="true" aria-label={t("경품 배송지 입력", "Prize shipping address")}>
                <button
                  type="button"
                  className="icon-btn-circular settings-close prize-modal-close"
                  aria-label={t("닫기", "Close")}
                  onClick={() => setOpen(false)}
                >
                  <X size={16} />
                </button>

                {done ? (
                  <>
                    <h2>{t("배송지를 받았습니다", "Shipping address received")}</h2>
                    <p>
                      {t("발송이 시작되면 별도로 안내드리겠습니다. 축하드립니다!", "We will notify you when shipping begins. Congratulations!")}
                      <br />
                      {t("주소가 잘못되었다면 배너의 주소 수정에서 언제든 고치실 수 있습니다.", "You can correct the address at any time from Edit address in the banner.")}
                    </p>
                    <div className="modal-actions">
                      <button type="button" className="chip-pill" onClick={() => setOpen(false)}>
                        {t("닫기", "Close")}
                      </button>
                    </div>
                  </>
                ) : (
                  <>
                    <h2>{submitted ? t("배송지 수정", "Edit shipping address") : t("경품 배송지 입력", "Prize shipping address")}</h2>
                    <p>
                      <strong>{prize.prize_name}</strong>
                      {prize.prize_sponsor ? (
                        <>
                          {" "}
                          {isEnglish ? ` — Sponsored by ${prize.prize_sponsor}.` : ` — ${prize.prize_sponsor}의 협찬으로 제공됩니다.`}
                        </>
                      ) : null}
                    </p>
                    <p className="prize-deadline">
                      {submitted
                        ? isEnglish ? `You can edit it until ${deadline}.` : `${deadline}까지 수정하실 수 있습니다.`
                        : isEnglish ? `Submit it by ${deadline}.` : `${deadline}까지 입력해 주세요.`}
                    </p>

                    <div className="prize-form">
                      <label htmlFor="prize-recipient">
                        {t("성함", "Recipient")} *
                        <input
                          id="prize-recipient"
                          className="settings-input"
                          value={form.recipient}
                          maxLength={40}
                          onChange={(e) => setForm({ ...form, recipient: e.target.value })}
                        />
                      </label>
                      <label htmlFor="prize-phone">
                        {t("연락처", "Phone")} *
                        <input
                          id="prize-phone"
                          className="settings-input"
                          value={form.phone}
                          maxLength={40}
                          placeholder="010-0000-0000"
                          onChange={(e) => setForm({ ...form, phone: e.target.value })}
                        />
                      </label>
                      <label htmlFor="prize-postal">
                        {t("우편번호", "Postal code")} *
                        <input
                          id="prize-postal"
                          className="settings-input"
                          value={form.postalCode}
                          maxLength={10}
                          onChange={(e) => setForm({ ...form, postalCode: e.target.value })}
                        />
                      </label>
                      <label htmlFor="prize-address1" className="prize-form-wide">
                        {t("주소", "Address")} *
                        <input
                          id="prize-address1"
                          className="settings-input"
                          value={form.address1}
                          maxLength={200}
                          onChange={(e) => setForm({ ...form, address1: e.target.value })}
                        />
                      </label>
                      <label htmlFor="prize-address2" className="prize-form-wide">
                        {t("상세 주소", "Address line 2")}
                        <input
                          id="prize-address2"
                          className="settings-input"
                          value={form.address2}
                          maxLength={200}
                          onChange={(e) => setForm({ ...form, address2: e.target.value })}
                        />
                      </label>
                      <label htmlFor="prize-memo" className="prize-form-wide">
                        {t("배송 요청사항", "Delivery notes")}
                        <input
                          id="prize-memo"
                          className="settings-input"
                          value={form.memo}
                          maxLength={200}
                          onChange={(e) => setForm({ ...form, memo: e.target.value })}
                        />
                      </label>
                    </div>

                    {/* 개인정보를 받는 화면이므로 무엇에 쓰이는지 그 자리에서 밝힌다. */}
                    <div className="prize-consent">
                      <p>{isEnglish
                        ? `We collect the recipient name, phone number, and address for prize delivery and share them with ${prize.prize_sponsor || "the sponsor"} for shipping.`
                        : <>경품 발송을 위해 성함·연락처·주소를 수집하며, 배송을 위해{prize.prize_sponsor ? ` ${prize.prize_sponsor}` : " 협찬사"}에 제공됩니다.</>}
                      </p>
                      <p>{t(
                        "제공된 정보는 발송 이후 파기되며 다른 목적으로 쓰이지 않습니다. 입력하시면 개인정보 제공에 동의하신 것으로 봅니다.",
                        "The information is deleted after shipping and is not used for other purposes. Submission indicates consent to this data sharing.",
                      )}</p>
                      <p>{t("기한 내 입력이 없으면 당첨이 취소되고 재추첨될 수 있습니다.", "If you miss the deadline, the prize may be canceled and redrawn.")}</p>
                    </div>

                    {error ? <p className="settings-status is-error">{error}</p> : null}

                    <div className="modal-actions">
                      <button type="button" className="chip-pill" onClick={() => setOpen(false)}>
                        {t("나중에", "Later")}
                      </button>
                      <button
                        type="button"
                        className="btn-primary-pill"
                        disabled={
                          busy ||
                          !form.recipient.trim() ||
                          !form.phone.trim() ||
                          !form.postalCode.trim() ||
                          !form.address1.trim()
                        }
                        onClick={() => void submit()}
                      >
                        {submitted ? t("수정 저장", "Save changes") : t("제출", "Submit")}
                      </button>
                    </div>
                  </>
                )}
              </div>
            </>,
            document.body,
          )
        : null}
    </>
  );
}
