"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import type { TypingWorkshopState, WorkshopContract } from "@/features/game/types";
import { getSupabaseClient } from "@/lib/supabase/client";
import { messageOf } from "@/lib/supabase/errors";
import styles from "./workshop-loop-preview.module.css";

type Locale = "ko" | "en";
type StationId = "typeset" | "proof" | "press";

const PREVIEW_OFFERS: WorkshopContract[] = [
  { id: "alley_extra", nameKo: "골목 속보판", nameEn: "Alley Extra", descriptionKo: "빠른 납기의 작은 속보판", descriptionEn: "A small extra with a quick deadline", targetCopies: 60, minQuality: 70, rewardCoins: 420, rewardReputation: 12 },
  { id: "night_extra", nameKo: "심야 속보판", nameEn: "Midnight Extra", descriptionKo: "밤거리 소식을 모은 속보판", descriptionEn: "A late edition for the night streets", targetCopies: 120, minQuality: 72, rewardCoins: 760, rewardReputation: 24 },
  { id: "weekend_feature", nameKo: "주말 특집호", nameEn: "Weekend Feature", descriptionKo: "품질을 중시하는 두꺼운 특집호", descriptionEn: "A larger feature that rewards quality", targetCopies: 220, minQuality: 84, rewardCoins: 1480, rewardReputation: 52 },
];

const PREVIEW_STATE: TypingWorkshopState = {
  progress: { manuscripts: 186, plates: 74, editions: 42, coins: 2400, reputation: 68, regionTier: 1, quality: 78, lastProcessedAt: new Date(0).toISOString() },
  stations: { typeset: 2, proof: 1, press: 3 },
  activeContract: { ...PREVIEW_OFFERS[1], delivered: 36, completedAt: null },
  offers: PREVIEW_OFFERS,
};

const STATIONS: Array<{ id: StationId; ko: string; en: string; inputKo: string; inputEn: string; outputKo: string; outputEn: string }> = [
  { id: "typeset", ko: "조판대", en: "Typesetting", inputKo: "원고", inputEn: "Copy", outputKo: "활자판", outputEn: "Plates" },
  { id: "proof", ko: "교정대", en: "Proof desk", inputKo: "활자판", inputEn: "Plates", outputKo: "품질", outputEn: "Quality" },
  { id: "press", ko: "인쇄기", en: "Press", inputKo: "활자판", inputEn: "Plates", outputKo: "인쇄본", outputEn: "Copies" },
];

export function WorkshopProduction({ locale, preview = false }: { locale: Locale; preview?: boolean }) {
  const [state, setState] = useState<TypingWorkshopState | null>(preview ? PREVIEW_STATE : null);
  const [selectedOfferId, setSelectedOfferId] = useState(PREVIEW_STATE.activeContract?.id ?? PREVIEW_OFFERS[0].id);
  const [busy, setBusy] = useState<"load" | "contract" | "deliver" | StationId | null>(null);
  const [notice, setNotice] = useState("");
  const text = useCallback((ko: string, en: string) => locale === "ko" ? ko : en, [locale]);

  const load = useCallback(async () => {
    if (preview) return;
    const supabase = getSupabaseClient();
    if (!supabase) return;
    setBusy("load");
    const { data, error } = await supabase.rpc("get_my_typing_workshop_state");
    setBusy(null);
    if (error) {
      setNotice(messageOf(error, text("제작 공정을 불러오지 못했습니다.", "Could not load production.")));
      return;
    }
    const next = data as TypingWorkshopState;
    setState(next);
    setSelectedOfferId(next.activeContract?.id ?? next.offers[0]?.id ?? "");
  }, [preview, text]);

  useEffect(() => { void Promise.resolve().then(load); }, [load]);

  const contract = useMemo(() => {
    if (!state) return null;
    return state.activeContract ?? state.offers.find((offer) => offer.id === selectedOfferId) ?? state.offers[0] ?? null;
  }, [selectedOfferId, state]);

  function runPreviewShift() {
    if (!state) return;
    const composed = Math.min(state.progress.manuscripts, 8 + state.stations.typeset * 4);
    const printed = Math.min(state.progress.plates + composed, 5 + state.stations.press * 3);
    setState({ ...state, progress: { ...state.progress, manuscripts: state.progress.manuscripts - composed, plates: state.progress.plates + composed - printed, editions: state.progress.editions + printed, quality: Math.min(99, state.progress.quality + (state.stations.proof >= 3 ? 2 : 1)) } });
    setNotice(text(`조판 ${composed}장 · 인쇄 ${printed}부가 진행됐습니다.`, `${composed} plates set · ${printed} copies printed.`));
  }

  async function refreshProduction() {
    if (preview) { runPreviewShift(); return; }
    await load();
    setNotice(text("방치 생산량을 정산했습니다.", "Offline production settled."));
  }

  async function chooseContract(offer: WorkshopContract) {
    if (!state) return;
    setSelectedOfferId(offer.id);
    if (state.activeContract && !state.activeContract.completedAt) return;
    if (preview) {
      setState({ ...state, activeContract: { ...offer, delivered: 0, completedAt: null } });
      setNotice(text(`${offer.nameKo} 제작을 시작했습니다.`, `${offer.nameEn} accepted.`));
      return;
    }
    const supabase = getSupabaseClient();
    if (!supabase) return;
    setBusy("contract");
    const { data, error } = await supabase.rpc("select_typing_workshop_contract", { p_contract_id: offer.id });
    setBusy(null);
    if (error) { setNotice(messageOf(error, text("의뢰를 시작하지 못했습니다.", "Could not accept the commission."))); return; }
    setState(data as TypingWorkshopState);
  }

  async function deliver() {
    if (!state?.activeContract) return;
    if (preview) {
      const active = state.activeContract;
      const amount = Math.min(state.progress.editions, active.targetCopies - (active.delivered ?? 0));
      if (amount <= 0) return;
      const delivered = (active.delivered ?? 0) + amount;
      const completed = delivered >= active.targetCopies;
      setState({ ...state, progress: { ...state.progress, editions: state.progress.editions - amount, coins: state.progress.coins + (completed ? active.rewardCoins : 0), reputation: state.progress.reputation + (completed ? active.rewardReputation : 0) }, activeContract: { ...active, delivered, completedAt: completed ? new Date().toISOString() : null } });
      setNotice(completed ? text(`${active.nameKo} 납품을 완료했습니다.`, `${active.nameEn} delivered.`) : text(`${amount}부를 납품했습니다.`, `Delivered ${amount} copies.`));
      return;
    }
    const supabase = getSupabaseClient();
    if (!supabase) return;
    setBusy("deliver");
    const { data, error } = await supabase.rpc("deliver_typing_workshop_editions");
    setBusy(null);
    if (error) { setNotice(messageOf(error, text("납품하지 못했습니다.", "Could not deliver editions."))); return; }
    const result = data as { delivered: number; completed: boolean; state: TypingWorkshopState };
    setState(result.state);
    setNotice(result.completed ? text("의뢰를 완수해 동전과 명성을 받았습니다.", "Commission complete. Coins and reputation received.") : text(`${result.delivered}부를 납품했습니다.`, `Delivered ${result.delivered} copies.`));
  }

  async function upgrade(station: StationId) {
    if (!state) return;
    const level = state.stations[station];
    const cost = level * level * 250;
    if (preview) {
      if (state.progress.coins < cost) { setNotice(text("동전이 부족합니다.", "Not enough coins.")); return; }
      setState({ ...state, progress: { ...state.progress, coins: state.progress.coins - cost }, stations: { ...state.stations, [station]: level + 1 } });
      return;
    }
    const supabase = getSupabaseClient();
    if (!supabase) return;
    setBusy(station);
    const { data, error } = await supabase.rpc("upgrade_typing_workshop_station", { p_station: station });
    setBusy(null);
    if (error) { setNotice(messageOf(error, text("설비를 강화하지 못했습니다.", "Could not upgrade the station."))); return; }
    setState(data as TypingWorkshopState);
  }

  if (!state) return <section className={styles.loop}><div className={styles.loopLoading}>{busy === "load" ? text("제작 공정 정산 중", "Settling production") : notice}</div></section>;
  const progress = state.progress;
  const delivered = state.activeContract?.delivered ?? 0;
  const completed = Boolean(state.activeContract?.completedAt);

  return (
    <section className={styles.loop}>
      <header className={styles.loopHeader}>
        <div><span>{text(`골목 인쇄소 · 신문사 ${progress.regionTier}단계`, `ALLEY PRESS · NEWSROOM TIER ${progress.regionTier}`)}</span><strong>{text("오늘의 신문 제작", "Today’s production")}</strong></div>
        <p>{text("타이핑한 원고를 공정에 넣고, 병목을 고쳐 의뢰를 끝냅니다.", "Process typed copy, fix bottlenecks, and finish commissions.")}</p>
      </header>

      <div className={styles.resourceRail}>
        <div><span>{text("원고", "Copy")}</span><strong>{progress.manuscripts.toLocaleString()}</strong></div>
        <i>→</i><div><span>{text("활자판", "Plates")}</span><strong>{progress.plates.toLocaleString()}</strong></div>
        <i>→</i><div><span>{text("인쇄본", "Copies")}</span><strong>{progress.editions.toLocaleString()}</strong></div>
        <div><span>{text("평균 품질", "Quality")}</span><strong>{progress.quality}</strong></div>
        <div><span>{text("동전", "Coins")}</span><strong>{progress.coins.toLocaleString()}</strong></div>
        <div><span>{text("명성", "Reputation")}</span><strong>{progress.reputation.toLocaleString()}</strong></div>
      </div>

      <div className={styles.loopGrid}>
        <div className={styles.contractBoard}>
          <header><span>{text("의뢰 게시판", "COMMISSION BOARD")}</span><strong>{contract ? locale === "ko" ? contract.nameKo : contract.nameEn : text("새 의뢰 없음", "No offers")}</strong></header>
          <div className={styles.contractTabs}>{state.offers.map((offer) => <button type="button" key={offer.id} disabled={Boolean(state.activeContract && !completed && state.activeContract.id !== offer.id) || busy !== null} data-selected={offer.id === contract?.id} onClick={() => void chooseContract(offer)}>{locale === "ko" ? offer.nameKo : offer.nameEn}</button>)}</div>
          {contract ? <>
            <p>{locale === "ko" ? contract.descriptionKo : contract.descriptionEn} · {text(`품질 ${contract.minQuality} 이상`, `Quality ${contract.minQuality}+`)}</p>
            <div className={styles.orderProgress}><span style={{ width: `${Math.min(100, delivered / contract.targetCopies * 100)}%` }} /></div>
            <div className={styles.orderNumbers}><strong>{Math.min(delivered, contract.targetCopies)} / {contract.targetCopies}{text("부", " copies")}</strong><span>+{contract.rewardCoins.toLocaleString()} · REP +{contract.rewardReputation}</span></div>
            <button className={styles.deliverButton} type="button" disabled={!state.activeContract || progress.editions < 1 || completed || progress.quality < contract.minQuality || busy !== null} onClick={() => void deliver()}>{completed ? text("납품 완료", "Delivered") : !state.activeContract ? text("의뢰를 먼저 선택", "Accept this commission") : text("인쇄본 납품", "Deliver copies")}</button>
          </> : null}
        </div>

        <div className={styles.production}>
          <header><span>{text("제작 공정", "PRODUCTION LINE")}</span><button type="button" disabled={busy !== null} onClick={() => void refreshProduction()}>{preview ? text("1분 작업 진행", "Run one shift") : text("생산량 정산", "Settle production")}</button></header>
          <div className={styles.stations}>{STATIONS.map((station, index) => {
            const level = state.stations[station.id];
            const cost = level * level * 250;
            return <article key={station.id}>
              <span className={styles.stationNumber}>0{index + 1}</span>
              <div><strong>{locale === "ko" ? station.ko : station.en}</strong><small>{locale === "ko" ? station.inputKo : station.inputEn} → {locale === "ko" ? station.outputKo : station.outputEn}</small></div>
              <div className={styles.level}><span>LV.{level}</span><button type="button" disabled={busy !== null} onClick={() => void upgrade(station.id)}>+ {cost.toLocaleString()}</button></div>
            </article>;
          })}</div>
          {notice ? <p className={styles.notice} role="status">{notice}</p> : <p className={styles.notice}>{text("설비마다 속도가 달라 병목이 생깁니다. 접속하지 않은 동안에도 최대 8시간 가동됩니다.", "Different station speeds create bottlenecks. Production runs offline for up to eight hours.")}</p>}
        </div>
      </div>
    </section>
  );
}
