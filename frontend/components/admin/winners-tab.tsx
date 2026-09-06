"use client";

import { useEffect, useState } from "react";
import { ClipboardCopy, Table2, Truck, X } from "lucide-react";
import { formatDateTime } from "@/components/admin/labels";
import {
  winnerGmailLink,
  winnerMailBody,
  winnerMailSubject,
  winnerMailtoLink,
} from "@/components/admin/winner-mail";
import {
  groupSponsorShipping,
  sponsorShippingMessage,
  sponsorShippingTsv,
  type SponsorShippingRow,
} from "@/components/admin/winner-shipping";
import { seoulMonthId } from "@/lib/month";
import { getSupabaseClient } from "@/lib/supabase/client";
import { messageOf } from "@/lib/supabase/errors";

type WinnerRow = {
  winner_id: number;
  month_id: string;
  display_name: string;
  email: string | null;
  prize_name: string;
  prize_sponsor: string | null;
  score_at_draw: number;
  rank_at_draw: number;
  tickets_at_draw: number;
  win_odds: number;
  status: string;
  respond_by: string;
  notified_at: string | null;
  response_channel: string | null;
  response_note: string | null;
  has_address: boolean;
  /**
   * 이 경품을 지금 들고 있는 사람이 따로 있는지.
   * 만료된 건을 되살리면 같은 경품 당첨자가 둘이 되므로 이걸로 막는다.
   * 0027 이전 서버는 이 컬럼을 돌려주지 않아 undefined다.
   */
  prize_taken?: boolean;
  created_at: string;
};

type Address = {
  recipient: string;
  phone: string;
  postal_code: string;
  address1: string;
  address2: string | null;
  memo: string | null;
};

type DrawAuditRow = {
  draw_id: number;
  month_id: string;
  round: number;
  drawn_at: string;
  note: string | null;
  candidate_count: number;
  total_tickets: number;
  rank_at_draw: number;
  profile_id: string | null;
  display_name_at_draw: string;
  score_at_draw: number;
  tickets_at_draw: number;
  eligible_at_draw: boolean;
  exclusion_reason: "already_won" | null;
  selected_order: number | null;
  tickets_available_at_pick: number | null;
  selection_odds: number | null;
  prize_name: string | null;
};

const STATUS_LABEL: Record<string, string> = {
  pending: "대기",
  confirmed: "확인",
  expired: "만료",
  voided: "취소",
};

/** 지난달. 추첨은 1일에 지난달을 대상으로 돈다. */
function lastMonthId() {
  const now = new Date();
  const kst = new Date(now.getTime() + 9 * 60 * 60 * 1000);
  kst.setUTCDate(1);
  kst.setUTCMonth(kst.getUTCMonth() - 1);
  return `${kst.getUTCFullYear()}${String(kst.getUTCMonth() + 1).padStart(2, "0")}`;
}

export function WinnersTab() {
  const [month, setMonth] = useState<string>("");
  const [rows, setRows] = useState<WinnerRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [busyId, setBusyId] = useState<number | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const [address, setAddress] = useState<{ id: number; data: Address } | null>(null);
  const [mail, setMail] = useState<WinnerRow | null>(null);
  const [shippingRows, setShippingRows] = useState<SponsorShippingRow[]>([]);
  const [shippingMonth, setShippingMonth] = useState("");
  const [shippingOpen, setShippingOpen] = useState(false);
  const [shippingLoading, setShippingLoading] = useState(false);
  const [copied, setCopied] = useState<string | null>(null);
  const [drawing, setDrawing] = useState(false);
  const [reloadToken, setReloadToken] = useState(0);
  const [auditRows, setAuditRows] = useState<DrawAuditRow[]>([]);
  const [auditLoading, setAuditLoading] = useState(true);
  const [drawsEnabled, setDrawsEnabled] = useState<boolean | null>(null);
  /** 당첨 안내 메일 자동 발송 스위치(`0036`). null이면 아직 확인 못 한 상태다. */
  const [mailEnabled, setMailEnabled] = useState<boolean | null>(null);

  useEffect(() => {
    let active = true;

    async function fetchWinners() {
      const supabase = getSupabaseClient();
      if (!supabase) return;

      const { data, error: rpcError } = await supabase.rpc("get_prize_winners", {
        p_month_id: month || null,
        p_limit: 200,
      });
      if (!active) return;
      setLoading(false);

      if (rpcError) {
        console.error("당첨자 목록 실패", rpcError);
        setError(messageOf(rpcError, "목록을 불러오지 못했습니다"));
        return;
      }
      setError(null);
      setRows((data ?? []) as WinnerRow[]);
    }

    void fetchWinners();
    return () => {
      active = false;
    };
  }, [month, reloadToken]);

  useEffect(() => {
    let active = true;

    async function fetchDrawAudit() {
      const supabase = getSupabaseClient();
      if (!supabase) return;

      const [auditResult, controlResult, mailResult] = await Promise.all([
        supabase.rpc("get_prize_draw_audit", {
          p_month_id: month || lastMonthId(),
          p_round: null,
        }),
        supabase.rpc("get_draws_enabled"),
        supabase.rpc("get_winner_mail_enabled"),
      ]);
      if (!active) return;
      setAuditLoading(false);

      if (auditResult.error) {
        console.error("추첨 감사 기록 실패", auditResult.error);
        setError(messageOf(auditResult.error, "추첨 기록을 불러오지 못했습니다"));
        return;
      }
      if (controlResult.error) {
        console.error("추첨 운영 상태 확인 실패", controlResult.error);
        setError(messageOf(controlResult.error, "추첨 운영 상태를 확인하지 못했습니다"));
        return;
      }
      setAuditRows((auditResult.data ?? []) as DrawAuditRow[]);
      setDrawsEnabled(controlResult.data === true);
      /* 0036 적용 전에는 이 RPC가 없다. 그때는 상태를 모르는 것으로 두고
         화면에 아무것도 띄우지 않는다 — "꺼짐"으로 단정하면 잘못된 정보가 된다. */
      if (mailResult.error) {
        console.warn("메일 자동 발송 상태 확인 실패", mailResult.error);
        setMailEnabled(null);
      } else {
        setMailEnabled(mailResult.data === true);
      }
    }

    void fetchDrawAudit();
    return () => {
      active = false;
    };
  }, [month, reloadToken]);

  function reload() {
    setLoading(true);
    setAuditLoading(true);
    setReloadToken((value) => value + 1);
  }

  /** 메일로 주소를 받았을 때. 이걸 안 하면 만료되어 재추첨이 돌아버린다. */
  async function markResponded(row: WinnerRow) {
    const supabase = getSupabaseClient();
    if (!supabase) return;

    const note = window.prompt(
      `${row.display_name} — ${row.prize_name}\n\n메일 등으로 배송지를 받았다면 확인 처리합니다.\n메모를 남겨주세요 (예: 8/2 메일 회신 확인)`,
      "메일로 배송지 회신 확인",
    );
    if (note === null) return;

    setBusyId(row.winner_id);
    const { error: rpcError } = await supabase.rpc("mark_winner_responded", {
      p_winner_id: row.winner_id,
      p_channel: "email",
      p_note: note.trim() || null,
    });
    setBusyId(null);

    if (rpcError) {
      console.error("확인 처리 실패", rpcError);
      setError(messageOf(rpcError, "처리하지 못했습니다"));
      return;
    }
    setError(null);
    setNotice(`${row.display_name} 확인 처리했습니다`);
    reload();
  }

  async function voidWinner(row: WinnerRow) {
    const supabase = getSupabaseClient();
    if (!supabase) return;
    const reason = window.prompt(
      `${row.display_name}의 당첨을 취소합니다.\n빈 자리는 다음 재추첨에서 채워집니다.\n\n사유를 남겨주세요.`,
      "",
    );
    if (reason === null) return;
    if (reason.trim().length < 2) {
      setError("사유를 2자 이상 남겨야 합니다");
      return;
    }

    setBusyId(row.winner_id);
    const { error: rpcError } = await supabase.rpc("void_prize_winner", {
      p_winner_id: row.winner_id,
      p_reason: reason.trim(),
    });
    setBusyId(null);

    if (rpcError) {
      console.error("당첨 취소 실패", rpcError);
      setError(messageOf(rpcError, "취소하지 못했습니다"));
      return;
    }
    setError(null);
    setNotice(`${row.display_name} 당첨을 취소했습니다`);
    reload();
  }

  /** 그 달 추첨을 지금 돌린다. 이미 채워진 경품은 건너뛴다. */
  async function runDraw(targetMonth: string) {
    const supabase = getSupabaseClient();
    if (!supabase) return;
    if (drawsEnabled !== true) {
      setError("최종 데이터 이관과 운영 전환 전에는 추첨할 수 없습니다");
      return;
    }
    if (
      !window.confirm(
        `${targetMonth} 추첨을 실행합니다.\n\n등수별 응모권(1등 8장 · 2등 5장 · 3등 3장 · 4~10등 2장 · 11~50등 1장)으로 뽑습니다.\n이미 주인이 있는 경품은 건너뜁니다.\n\n되돌리려면 당첨을 하나씩 취소해야 합니다.`,
      )
    ) {
      return;
    }

    setDrawing(true);
    const { data, error: rpcError } = await supabase.rpc("admin_run_monthly_draw", {
      p_month_id: targetMonth,
    });
    setDrawing(false);

    if (rpcError) {
      console.error("추첨 실패", rpcError);
      setError(messageOf(rpcError, "추첨하지 못했습니다"));
      return;
    }
    const picked = Array.isArray(data) ? data.length : 0;
    setError(null);
    setNotice(picked ? `${picked}명을 뽑았습니다` : "새로 뽑을 경품이 없습니다");
    setMonth(targetMonth);
    reload();
  }

  /** 기한이 지난 당첨을 만료시키고 빈 자리를 재추첨한다. cron이 할 일을 손으로 한다. */
  async function runExpire() {
    const supabase = getSupabaseClient();
    if (!supabase) return;
    if (drawsEnabled !== true) {
      setError("최종 데이터 이관과 운영 전환 전에는 재추첨할 수 없습니다");
      return;
    }
    const ok = window.confirm(
      "기한이 지난 당첨을 만료 처리하고, 비워진 경품을 재추첨합니다.\n\n기한 안의 건은 건드리지 않습니다.",
    );
    if (!ok) return;

    setDrawing(true);
    const { data, error: rpcError } = await supabase.rpc("admin_expire_stale_winners");
    setDrawing(false);

    if (rpcError) {
      console.error("만료 처리 실패", rpcError);
      setError(messageOf(rpcError, "처리하지 못했습니다"));
      return;
    }
    setError(null);
    setNotice(data ? `${data}건을 만료 처리하고 재추첨했습니다` : "기한이 지난 건이 없습니다");
    reload();
  }

  /**
   * 당첨 안내 메일을 서버(Brevo)로 보낸다.
   *
   * 사람에게 가는 메일이라 한 번 더 묻는다. 되돌릴 수 없다.
   * 발송 표시는 서버가 함께 처리한다 — 보낸 것과 표시가 어긋나지 않게.
   */
  async function sendMail(row: WinnerRow) {
    const supabase = getSupabaseClient();
    if (!supabase) return;

    const again = Boolean(row.notified_at);
    const ok = window.confirm(
      `${row.email}\n\n${row.display_name}님에게 당첨 안내 메일을 보냅니다.` +
        (again ? "\n\n⚠️ 이미 발송한 당첨자입니다. 같은 메일을 한 번 더 보냅니다." : "") +
        "\n\n보낸 메일은 되돌릴 수 없습니다.",
    );
    if (!ok) return;

    const { data: session } = await supabase.auth.getSession();
    const token = session.session?.access_token;
    if (!token) {
      setError("로그인이 만료되었습니다. 새로고침 후 다시 시도해주세요");
      return;
    }

    setBusyId(row.winner_id);
    try {
      const response = await fetch("/api/admin/send-winner-mail", {
        method: "POST",
        headers: { "content-type": "application/json", authorization: `Bearer ${token}` },
        body: JSON.stringify({ winnerId: row.winner_id, monthId: row.month_id, force: again }),
      });
      const payload = (await response.json().catch(() => null)) as
        | { error?: string; warning?: string }
        | null;

      if (!response.ok) {
        // 설정이 안 됐거나 Brevo가 거절했다. Gmail 경로가 그대로 남아 있다.
        setError(payload?.error ?? "메일을 보내지 못했습니다");
        return;
      }

      setError(null);
      setNotice(payload?.warning ?? `${row.display_name}님에게 메일을 보냈습니다`);
      reload();
    } catch (cause) {
      console.error("메일 발송 실패", cause);
      setError("메일을 보내지 못했습니다");
    } finally {
      setBusyId(null);
    }
  }

  /** 메일을 보냈다고 표시한다. 누가 아직 못 받았는지 화면에서 잃지 않기 위함이다. */
  async function toggleNotified(row: WinnerRow) {
    const supabase = getSupabaseClient();
    if (!supabase) return;
    setBusyId(row.winner_id);

    const { error: rpcError } = await supabase.rpc("mark_winner_notified", {
      p_winner_id: row.winner_id,
      p_sent: !row.notified_at,
    });
    setBusyId(null);

    if (rpcError) {
      console.error("발송 표시 실패", rpcError);
      setError(messageOf(rpcError, "표시하지 못했습니다"));
      return;
    }
    setError(null);
    reload();
  }

  async function copyText(label: string, text: string) {
    try {
      await navigator.clipboard.writeText(text);
      setCopied(label);
      window.setTimeout(() => setCopied(null), 1500);
    } catch (cause) {
      console.error("복사 실패", cause);
      setError("복사하지 못했습니다. 직접 선택해 복사해 주세요");
    }
  }

  /** 배송지는 필요할 때만 연다. 화면에 늘 띄워두지 않는다. */
  async function openAddress(row: WinnerRow) {
    const supabase = getSupabaseClient();
    if (!supabase) return;
    setBusyId(row.winner_id);

    const { data, error: rpcError } = await supabase.rpc("get_winner_address", {
      p_winner_id: row.winner_id,
    });
    setBusyId(null);

    if (rpcError) {
      console.error("배송지 조회 실패", rpcError);
      setError(messageOf(rpcError, "불러오지 못했습니다"));
      return;
    }
    const found = Array.isArray(data) ? (data[0] as Address | undefined) : undefined;
    if (!found) {
      setError("저장된 배송지가 없습니다");
      return;
    }
    setError(null);
    setAddress({ id: row.winner_id, data: found });
  }

  /** 개인정보는 협찬사에 전달할 때만 명시적으로 불러오고 닫을 때 화면 상태에서 지운다. */
  async function loadSponsorShippingList() {
    const supabase = getSupabaseClient();
    if (!supabase) return;
    const targetMonth = month || lastMonthId();

    setShippingOpen(true);
    setShippingLoading(true);
    setShippingRows([]);
    setShippingMonth(targetMonth);
    setError(null);

    const { data, error: rpcError } = await supabase.rpc("get_sponsor_shipping_list", {
      p_month_id: targetMonth,
    });
    setShippingLoading(false);

    if (rpcError) {
      console.error("협찬사 배송 명단 조회 실패", rpcError);
      setError(messageOf(rpcError, "배송 명단을 불러오지 못했습니다"));
      return;
    }
    setShippingRows((data ?? []) as SponsorShippingRow[]);
  }

  function closeSponsorShippingList() {
    setShippingOpen(false);
    setShippingRows([]);
    setShippingMonth("");
  }

  const shippingGroups = groupSponsorShipping(shippingRows);
  const unstructuredAddressCount = rows.filter(
    (row) =>
      row.month_id === shippingMonth && row.status === "confirmed" && !row.has_address,
  ).length;

  return (
    <section className="admin-panel">
      <header className="admin-panel-head">
        <h2>당첨 관리</h2>
        <span>{loading ? "불러오는 중" : `${rows.length}건`}</span>
      </header>

      <div className="settings-row">
        <span className="settings-hint">월</span>
        {[
          { id: "", label: "전체" },
          { id: lastMonthId(), label: `지난달 (${lastMonthId()})` },
          { id: seoulMonthId(), label: `이번 달 (${seoulMonthId()})` },
        ].map((item) => (
          <button
            key={item.id || "all"}
            type="button"
            className="chip-pill"
            data-selected={month === item.id}
            onClick={() => {
              setMonth(item.id);
              setLoading(true);
              setAuditLoading(true);
              setNotice(null);
            }}
          >
            {item.label}
          </button>
        ))}
        <button
          type="button"
          className="chip-pill"
          disabled={shippingLoading}
          title={`${month || lastMonthId()} 협찬사별 배송 명단을 불러옵니다`}
          onClick={() => void loadSponsorShippingList()}
        >
          <Truck size={14} />
          {shippingLoading ? "불러오는 중" : "협찬사 배송 명단"}
        </button>
      </div>

      {/* 추첨 실행. 매월 1일 자동화(pg_cron)를 붙이기 전까지는 여기서 돌린다. */}
      <div className="settings-row">
        <span className="settings-hint">추첨</span>
        <button
          type="button"
          className="chip-pill"
          disabled={drawing || drawsEnabled !== true}
          title={drawsEnabled ? "지난달을 대상으로 추첨합니다" : "운영 전환 전 추첨 잠금"}
          onClick={() => void runDraw(lastMonthId())}
        >
          {lastMonthId()} 추첨 실행
        </button>
        {/* cron을 등록하기 전에는 만료 처리를 아무도 안 한다. 기한이 지나도
            상태가 pending으로 남아 재추첨이 돌지 않고, 경품이 주인 없이 뜬다. */}
        <button
          type="button"
          className="chip-pill"
          disabled={drawing || drawsEnabled !== true}
          title="기한이 지난 당첨을 만료 처리하고 빈 자리를 재추첨합니다"
          onClick={() => void runExpire()}
        >
          만료 처리 + 재추첨
        </button>
        <span className="settings-hint">
          1등 8장 · 2등 5장 · 3등 3장 · 4~10등 2장 · 11~50등 1장
        </span>
        {drawsEnabled === false ? (
          <span className="admin-badge is-rejected">운영 전환 전 · 추첨 잠금</span>
        ) : null}
      </div>

      {/* 메일 자동 발송 상태. 켜고 끄는 것은 SQL로만 한다 — 사람에게 실제로
          메일이 나가는 스위치라 화면에서 실수로 눌리지 않는 편이 낫다.
            select public.set_winner_mail_enabled(true);  */}
      {mailEnabled !== null ? (
        <div className="settings-row">
          <span className="settings-hint">안내 메일</span>
          {mailEnabled ? (
            <>
              <span className="admin-badge">자동 발송 켜짐</span>
              <span className="settings-hint">
                매일 00:30(KST)에 아직 못 받은 당첨자에게 자동으로 나갑니다.
                아래 목록의 &ldquo;메일&rdquo; 칸이 발송 여부입니다
              </span>
            </>
          ) : (
            <>
              <span className="admin-badge is-rejected">자동 발송 꺼짐</span>
              <span className="settings-hint">
                지금은 당첨자별 &ldquo;메일 내용 → 메일 보내기&rdquo;로 직접 보내야 합니다
              </span>
            </>
          )}
        </div>
      ) : null}

      {error ? <p className="settings-status is-error">{error}</p> : null}
      {notice ? <p className="settings-status is-done">{notice}</p> : null}

      {shippingOpen ? (
        <section className="shipping-export" aria-label="협찬사별 배송 명단">
          <header className="shipping-export-head">
            <div>
              <h2>{shippingMonth} 협찬사별 배송 명단</h2>
              <p>
                {shippingRows.length}건 · {shippingGroups.length}개 협찬사
              </p>
            </div>
            <button
              type="button"
              className="icon-btn-circular"
              title="배송 명단 닫기"
              aria-label="배송 명단 닫기"
              onClick={closeSponsorShippingList}
            >
              <X size={16} />
            </button>
          </header>

          <p className="settings-hint shipping-privacy-note">
            배송에 필요한 정보만 포함됩니다. 협찬사에 전달한 뒤 이 화면을 닫고, 별도 파일로
            저장했다면 배송 완료 후 폐기해 주세요.
          </p>

          {unstructuredAddressCount > 0 ? (
            <p className="settings-status is-error">
              메일 등으로 확인 처리된 {unstructuredAddressCount}건은 저장된 배송지가 없어 이
              명단에 포함되지 않았습니다.
            </p>
          ) : null}

          {!shippingLoading && shippingGroups.length === 0 ? (
            <p className="settings-hint">확정 상태로 저장된 배송지가 없습니다.</p>
          ) : null}

          <div className="shipping-sponsor-list">
            {shippingGroups.map((group) => {
              const message = sponsorShippingMessage(shippingMonth, group);
              const copyLabel = `${group.sponsor} 배송 명단`;
              return (
                <section
                  className={`shipping-sponsor-group${group.sponsorMissing ? " is-missing" : ""}`}
                  key={group.sponsor}
                >
                  <header className="shipping-sponsor-head">
                    <div>
                      <h3>{group.sponsor}</h3>
                      <span>{group.rows.length}건</span>
                    </div>
                    {group.sponsorMissing ? (
                      <span className="admin-badge is-rejected">전달 전 협찬사 지정 필요</span>
                    ) : null}
                  </header>

                  <textarea
                    className="shipping-copy-area"
                    aria-label={`${group.sponsor} 배송 명단 내용`}
                    value={message}
                    rows={Math.min(18, 5 + group.rows.length * 6)}
                    readOnly
                  />

                  <div className="admin-item-actions shipping-copy-actions">
                    <button
                      type="button"
                      className="btn-primary-pill"
                      onClick={() => void copyText(copyLabel, message)}
                    >
                      <ClipboardCopy size={14} />
                      내용 복사
                    </button>
                    <button
                      type="button"
                      className="chip-pill"
                      title="엑셀이나 구글시트의 첫 셀에 붙여넣습니다"
                      onClick={() => void copyText(`${group.sponsor} 표`, sponsorShippingTsv(group))}
                    >
                      <Table2 size={14} />
                      표 복사
                    </button>
                    {copied === copyLabel || copied === `${group.sponsor} 표` ? (
                      <span className="settings-status is-done">복사했습니다</span>
                    ) : null}
                  </div>
                </section>
              );
            })}
          </div>
        </section>
      ) : null}

      <details className="admin-audit">
        <summary>
          추첨 기록 ({month || lastMonthId()})
          {!auditLoading && auditRows.length > 0 ? ` · ${auditRows.length}명` : ""}
        </summary>
        {auditLoading ? <p className="settings-hint">불러오는 중</p> : null}
        {!auditLoading && auditRows.length === 0 ? (
          <p className="settings-hint">저장된 추첨 스냅샷이 없습니다.</p>
        ) : null}
        {auditRows.length > 0 ? (
          <div className="admin-table-scroll">
            <table className="admin-table">
              <thead>
                <tr>
                  <th scope="col">회차</th>
                  <th scope="col">추첨 시각</th>
                  <th scope="col">순위</th>
                  <th scope="col">닉네임</th>
                  <th scope="col">점수</th>
                  <th scope="col">응모권</th>
                  <th scope="col">후보</th>
                  <th scope="col">결과</th>
                </tr>
              </thead>
              <tbody>
                {auditRows.map((row) => (
                  <tr key={`${row.draw_id}-${row.rank_at_draw}`}>
                    <td>
                      {row.round}회
                      <span className="admin-cell-dim">
                        {` · ${row.candidate_count}명/${row.total_tickets}장`}
                      </span>
                    </td>
                    <td className="admin-cell-dim">{formatDateTime(row.drawn_at)}</td>
                    <td>{row.rank_at_draw}위</td>
                    <td>{row.display_name_at_draw}</td>
                    <td>{row.score_at_draw.toLocaleString()}</td>
                    <td>{row.tickets_at_draw}장</td>
                    <td>
                      {row.eligible_at_draw ? (
                        <span className="admin-badge">후보</span>
                      ) : (
                        <span className="admin-badge is-rejected">이전 당첨</span>
                      )}
                    </td>
                    <td>
                      {row.selected_order ? (
                        <span className="admin-badge is-accepted">
                          {row.selected_order}번째 · {row.prize_name} · {row.selection_odds}%
                        </span>
                      ) : (
                        <span className="admin-cell-dim">—</span>
                      )}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        ) : null}
      </details>

      {!loading && rows.length === 0 ? (
        <p className="settings-hint">
          당첨 내역이 없습니다. 추첨은 매월 1일 00:00(KST)에 지난달을 대상으로 자동 실행됩니다.
        </p>
      ) : null}

      <div className="admin-table-scroll is-tall">
        <table className="admin-table">
          <thead>
            <tr>
              <th scope="col">닉네임</th>
              <th scope="col">이메일</th>
              <th scope="col">경품</th>
              <th scope="col">등수</th>
              <th scope="col">응모권</th>
              <th scope="col">확률</th>
              <th scope="col">상태</th>
              <th scope="col">회신 기한</th>
              <th scope="col">메일</th>
              <th scope="col">처리</th>
            </tr>
          </thead>
          <tbody>
            {rows.map((row) => (
              <tr key={row.winner_id}>
                <td>{row.display_name}</td>
                <td className="admin-cell-dim">{row.email ?? "—"}</td>
                <td>{row.prize_name}</td>
                <td>{row.rank_at_draw}위</td>
                <td>{row.tickets_at_draw}장</td>
                <td className="admin-cell-dim">{row.win_odds}%</td>
                <td>
                  <span
                    className={`admin-badge${
                      row.status === "confirmed"
                        ? " is-accepted"
                        : row.status === "expired" || row.status === "voided"
                          ? " is-rejected"
                          : ""
                    }`}
                  >
                    {STATUS_LABEL[row.status] ?? row.status}
                  </span>
                  {row.response_channel === "email" ? (
                    <span className="admin-badge" title={row.response_note ?? undefined}>
                      메일
                    </span>
                  ) : null}
                </td>
                <td className="admin-cell-dim">{formatDateTime(row.respond_by)}</td>
                <td className="admin-cell-dim">
                  <button
                    type="button"
                    className="chip-pill"
                    disabled={busyId === row.winner_id}
                    title={row.notified_at ? "발송 표시를 해제합니다" : "메일을 보냈다고 표시합니다"}
                    onClick={() => void toggleNotified(row)}
                  >
                    {row.notified_at ? `발송 ${formatDateTime(row.notified_at)}` : "미발송"}
                  </button>
                </td>
                <td>
                  <div className="admin-item-actions">
                    <button
                      type="button"
                      className="chip-pill"
                      disabled={!row.email}
                      title={row.email ? "보낼 메일 내용을 만듭니다" : "이메일이 없는 계정입니다"}
                      onClick={() => {
                        setMail(row);
                        setError(null);
                      }}
                    >
                      메일 내용
                    </button>
                    {row.has_address ? (
                      <button
                        type="button"
                        className="chip-pill"
                        disabled={busyId === row.winner_id}
                        onClick={() => void openAddress(row)}
                      >
                        배송지
                      </button>
                    ) : null}
                    {/* 만료된 건은 그 경품에 새 주인이 없을 때만 되살릴 수 있다.
                        재추첨이 끝난 뒤에 되살리면 같은 경품 당첨자가 둘이 된다. */}
                    {row.status === "pending" ||
                    (row.status === "expired" && !row.prize_taken) ? (
                      <button
                        type="button"
                        className="chip-pill"
                        disabled={busyId === row.winner_id}
                        title="메일로 배송지를 받았을 때 누릅니다"
                        onClick={() => void markResponded(row)}
                      >
                        메일로 받음
                      </button>
                    ) : null}
                    {row.status === "expired" && row.prize_taken ? (
                      <span
                        className="admin-badge"
                        title="재추첨으로 다른 분이 이 경품의 당첨자가 되었습니다. 되살리려면 그분의 당첨을 먼저 취소하세요"
                      >
                        재추첨됨
                      </span>
                    ) : null}
                    {row.status === "pending" || row.status === "confirmed" ? (
                      <button
                        type="button"
                        className="chip-pill admin-danger"
                        disabled={busyId === row.winner_id}
                        onClick={() => void voidWinner(row)}
                      >
                        취소
                      </button>
                    ) : null}
                  </div>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      {mail ? (
        <div className="admin-add card-style">
          <div className="admin-panel-head">
            <h2>메일 내용 — {mail.display_name}</h2>
            <button type="button" className="chip-pill" onClick={() => setMail(null)}>
              닫기
            </button>
          </div>

          <div className="settings-row">
            <span className="settings-hint">받는 사람</span>
            <code className="winner-mail-to">{mail.email}</code>
            <button
              type="button"
              className="chip-pill"
              onClick={() => void copyText("주소", mail.email ?? "")}
            >
              주소 복사
            </button>
          </div>

          {(() => {
            const input = {
              displayName: mail.display_name,
              prizeName: mail.prize_name,
              prizeSponsor: mail.prize_sponsor,
              respondBy: mail.respond_by,
            };
            const subject = winnerMailSubject(input);
            const body = winnerMailBody(input);
            const href = mail.email ? winnerMailtoLink(mail.email, input) : null;
            const gmail = mail.email ? winnerGmailLink(mail.email, input) : null;

            return (
              <>
                <div className="settings-row">
                  <span className="settings-hint">제목</span>
                  <input className="settings-input" value={subject} readOnly />
                  <button
                    type="button"
                    className="chip-pill"
                    onClick={() => void copyText("제목", subject)}
                  >
                    복사
                  </button>
                </div>

                <textarea
                  className="settings-input settings-textarea winner-mail-body"
                  value={body}
                  readOnly
                  rows={20}
                  aria-label="메일 본문"
                />

                <div className="settings-row settings-row-end">
                  <span className="settings-hint">
                    {copied ? `${copied}을(를) 복사했습니다` : "붙여넣어 보내신 뒤 발송 표시를 눌러주세요"}
                  </span>
                  <div className="admin-item-actions">
                    {/* 서버(Brevo)가 바로 보낸다. 실패하면 아래 Gmail 경로가 그대로 남아 있다. */}
                    <button
                      type="button"
                      className="btn-primary-pill"
                      disabled={busyId === mail.winner_id || mail.status !== "pending"}
                      title={
                        mail.status === "pending"
                          ? "타입뉴스 이름으로 지금 보냅니다"
                          : `상태가 '${STATUS_LABEL[mail.status] ?? mail.status}'인 당첨에는 보내지 않습니다`
                      }
                      onClick={() => void sendMail(mail)}
                    >
                      {mail.notified_at ? "다시 보내기" : "메일 보내기"}
                    </button>
                    <button
                      type="button"
                      className="chip-pill"
                      onClick={() => void copyText("본문", body)}
                    >
                      본문 복사
                    </button>
                    {/* Gmail 작성 화면을 채워서 연다. mailto와 달리 길이 제약이 없다. */}
                    {gmail ? (
                      <a
                        className="btn-primary-pill"
                        href={gmail}
                        target="_blank"
                        rel="noreferrer"
                        onClick={() => setNotice("Gmail 창에서 보낸 뒤 발송 표시를 눌러주세요")}
                      >
                        Gmail로 작성
                      </a>
                    ) : null}
                    {/* mailto는 본문이 길면 OS 메일 앱이 잘라버린다. 짧을 때만 보여준다. */}
                    {href ? (
                      <a className="chip-pill" href={href}>
                        기본 메일 앱
                      </a>
                    ) : null}
                    <button
                      type="button"
                      className="btn-primary-pill"
                      disabled={busyId === mail.winner_id || Boolean(mail.notified_at)}
                      onClick={() => void toggleNotified(mail)}
                    >
                      {mail.notified_at ? "발송 표시됨" : "발송했음으로 표시"}
                    </button>
                  </div>
                </div>
              </>
            );
          })()}
        </div>
      ) : null}

      {address ? (
        <div className="admin-add card-style">
          <div className="admin-panel-head">
            <h2>배송지 #{address.id}</h2>
            <button type="button" className="chip-pill" onClick={() => setAddress(null)}>
              닫기
            </button>
          </div>
          <dl className="settings-shortcuts">
            <div>
              <dt>받는 분</dt>
              <dd>{address.data.recipient}</dd>
            </div>
            <div>
              <dt>연락처</dt>
              <dd>{address.data.phone}</dd>
            </div>
            <div>
              <dt>우편번호</dt>
              <dd>{address.data.postal_code}</dd>
            </div>
            <div>
              <dt>주소</dt>
              <dd>
                {address.data.address1}
                {address.data.address2 ? ` ${address.data.address2}` : ""}
              </dd>
            </div>
            {address.data.memo ? (
              <div>
                <dt>요청사항</dt>
                <dd>{address.data.memo}</dd>
              </div>
            ) : null}
          </dl>
          <p className="settings-hint">
            배송이 끝나면 개인정보는 자동으로 파기됩니다 (확인 후 90일).
          </p>
        </div>
      ) : null}
    </section>
  );
}
