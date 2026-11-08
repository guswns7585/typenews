"use client";

import { useMemo, useState } from "react";
import styles from "./workshop-loop-preview.module.css";

type Locale = "ko" | "en";

type Contract = {
  id: string;
  name: { ko: string; en: string };
  note: { ko: string; en: string };
  target: number;
  reward: number;
  reputation: number;
  quality: number;
};

const CONTRACTS: Contract[] = [
  { id: "night", name: { ko: "심야 속보판", en: "Midnight Extra" }, note: { ko: "빠른 납기 · 보통 품질", en: "Fast deadline · standard quality" }, target: 120, reward: 760, reputation: 24, quality: 72 },
  { id: "feature", name: { ko: "주말 특집호", en: "Weekend Feature" }, note: { ko: "느린 납기 · 높은 품질", en: "Slow deadline · high quality" }, target: 220, reward: 1480, reputation: 52, quality: 86 },
  { id: "international", name: { ko: "국제 소식판", en: "International Desk" }, note: { ko: "영문 원고 보너스", en: "English copy bonus" }, target: 160, reward: 1120, reputation: 38, quality: 80 },
];

const STATIONS = [
  { id: "typeset", ko: "조판대", en: "Typesetting", inputKo: "원고", inputEn: "Copy", outputKo: "활자판", outputEn: "Plates" },
  { id: "proof", ko: "교정대", en: "Proof desk", inputKo: "활자판", inputEn: "Plates", outputKo: "품질", outputEn: "Quality" },
  { id: "press", ko: "인쇄기", en: "Press", inputKo: "활자판", inputEn: "Plates", outputKo: "인쇄본", outputEn: "Copies" },
] as const;

export function WorkshopLoopPreview({ locale }: { locale: Locale }) {
  const [contractId, setContractId] = useState(CONTRACTS[0].id);
  const [resources, setResources] = useState({ drafts: 186, plates: 74, editions: 42, coins: 2400, reputation: 680, quality: 78 });
  const [levels, setLevels] = useState<Record<(typeof STATIONS)[number]["id"], number>>({ typeset: 2, proof: 1, press: 3 });
  const [delivered, setDelivered] = useState(36);
  const [notice, setNotice] = useState("");
  const contract = useMemo(() => CONTRACTS.find((entry) => entry.id === contractId) ?? CONTRACTS[0], [contractId]);
  const text = (ko: string, en: string) => locale === "ko" ? ko : en;

  function runShift() {
    const composed = Math.min(resources.drafts, 8 + levels.typeset * 4);
    const printed = Math.min(resources.plates + composed, 5 + levels.press * 3);
    const qualityGain = levels.proof >= 3 ? 2 : 1;
    setResources((current) => ({
      ...current,
      drafts: current.drafts - composed,
      plates: current.plates + composed - printed,
      editions: current.editions + printed,
      quality: Math.min(99, current.quality + qualityGain),
    }));
    setNotice(text(`조판 ${composed}장 · 인쇄 ${printed}부가 진행됐습니다.`, `${composed} plates set · ${printed} copies printed.`));
  }

  function deliver() {
    const amount = Math.min(resources.editions, contract.target - delivered);
    if (amount <= 0) return;
    const next = delivered + amount;
    setResources((current) => ({ ...current, editions: current.editions - amount }));
    setDelivered(next);
    if (next >= contract.target) {
      setResources((current) => ({ ...current, coins: current.coins + contract.reward, reputation: current.reputation + contract.reputation }));
      setNotice(text(`${contract.name.ko} 납품 완료. 다음 지역으로 가는 명성이 올랐습니다.`, `${contract.name.en} delivered. Your newsroom reputation increased.`));
    } else {
      setNotice(text(`${amount}부를 납품했습니다.`, `Delivered ${amount} copies.`));
    }
  }

  function chooseContract(id: string) {
    setContractId(id);
    setDelivered(0);
    setNotice("");
  }

  function upgrade(id: (typeof STATIONS)[number]["id"]) {
    const cost = levels[id] * 350;
    if (resources.coins < cost) {
      setNotice(text("동전이 부족합니다.", "Not enough coins."));
      return;
    }
    setResources((current) => ({ ...current, coins: current.coins - cost }));
    setLevels((current) => ({ ...current, [id]: current[id] + 1 }));
  }

  return (
    <section className={styles.loop}>
      <header className={styles.loopHeader}>
        <div><span>{text("게임 루프 시제품", "GAME LOOP PROTOTYPE")}</span><strong>{text("오늘의 신문 제작", "Today’s production")}</strong></div>
        <p>{text("타이핑한 원고를 공정에 넣고, 병목을 고쳐 의뢰를 끝냅니다.", "Process typed copy, fix bottlenecks, and finish commissions.")}</p>
      </header>

      <div className={styles.resourceRail}>
        <div><span>{text("원고", "Copy")}</span><strong>{resources.drafts}</strong></div>
        <i>→</i><div><span>{text("활자판", "Plates")}</span><strong>{resources.plates}</strong></div>
        <i>→</i><div><span>{text("인쇄본", "Copies")}</span><strong>{resources.editions}</strong></div>
        <div><span>{text("평균 품질", "Quality")}</span><strong>{resources.quality}</strong></div>
        <div><span>{text("동전", "Coins")}</span><strong>{resources.coins.toLocaleString()}</strong></div>
        <div><span>{text("명성", "Reputation")}</span><strong>{resources.reputation}</strong></div>
      </div>

      <div className={styles.loopGrid}>
        <div className={styles.contractBoard}>
          <header><span>{text("의뢰 게시판", "COMMISSION BOARD")}</span><strong>{contract.name[locale]}</strong></header>
          <div className={styles.contractTabs}>{CONTRACTS.map((entry) => <button type="button" key={entry.id} data-selected={entry.id === contractId} onClick={() => chooseContract(entry.id)}>{entry.name[locale]}</button>)}</div>
          <p>{contract.note[locale]} · {text(`품질 ${contract.quality} 이상`, `Quality ${contract.quality}+`)}</p>
          <div className={styles.orderProgress}><span style={{ width: `${Math.min(100, delivered / contract.target * 100)}%` }} /></div>
          <div className={styles.orderNumbers}><strong>{Math.min(delivered, contract.target)} / {contract.target}{text("부", " copies")}</strong><span>+{contract.reward.toLocaleString()} · REP +{contract.reputation}</span></div>
          <button className={styles.deliverButton} type="button" disabled={resources.editions < 1 || delivered >= contract.target || resources.quality < contract.quality} onClick={deliver}>{delivered >= contract.target ? text("납품 완료", "Delivered") : text("인쇄본 납품", "Deliver copies")}</button>
        </div>

        <div className={styles.production}>
          <header><span>{text("제작 공정", "PRODUCTION LINE")}</span><button type="button" onClick={runShift}>{text("1분 작업 진행", "Run one shift")}</button></header>
          <div className={styles.stations}>{STATIONS.map((station, index) => {
            const level = levels[station.id];
            return <article key={station.id}>
              <span className={styles.stationNumber}>0{index + 1}</span>
              <div><strong>{locale === "ko" ? station.ko : station.en}</strong><small>{locale === "ko" ? station.inputKo : station.inputEn} → {locale === "ko" ? station.outputKo : station.outputEn}</small></div>
              <div className={styles.level}><span>LV.{level}</span><button type="button" onClick={() => upgrade(station.id)}>+ {level * 350}</button></div>
            </article>;
          })}</div>
          {notice ? <p className={styles.notice} role="status">{notice}</p> : <p className={styles.notice}>{text("설비마다 속도가 달라 병목이 생깁니다.", "Different station speeds create real bottlenecks.")}</p>}
        </div>
      </div>
    </section>
  );
}
