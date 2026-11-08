"use client";

import { AnimatePresence, motion, useReducedMotion } from "motion/react";
import Link from "next/link";
import { useCallback, useEffect, useMemo, useState } from "react";
import { useAuthProfile } from "@/components/auth/auth-button";
import type { GameDrawResult, GameItem, TypingGameState } from "@/features/game/types";
import { RARITY_LABELS } from "@/features/game/types";
import { getSupabaseClient } from "@/lib/supabase/client";
import { messageOf } from "@/lib/supabase/errors";
import { useUiLanguage } from "@/lib/ui-language";
import styles from "./typing-workshop.module.css";

const DRAW_COST = 600;

const PREVIEW_ITEMS: GameItem[] = [
  { id: "desk_snail", nameKo: "원고 달팽이", nameEn: "Draft Snail", descriptionKo: "느리지만 밤새 원고를 옮긴다.", descriptionEn: "Slowly carries drafts through the night.", category: "companion", rarity: "common", quantity: 4, activeBonusBps: 0, passiveInkPerHour: 5 },
  { id: "proofreader_cat", nameKo: "교정 보는 고양이", nameEn: "Proofreader Cat", descriptionKo: "오탈자를 발견하면 꼬리를 친다.", descriptionEn: "Flicks its tail whenever it spots a typo.", category: "companion", rarity: "rare", quantity: 2, activeBonusBps: 0, passiveInkPerHour: 12 },
  { id: "clockwork_typewriter", nameKo: "태엽 타자기", nameEn: "Clockwork Typewriter", descriptionKo: "키가 혼자 움직이며 잉크를 만든다.", descriptionEn: "Its keys move on their own to make ink.", category: "tool", rarity: "epic", quantity: 1, activeBonusBps: 350, passiveInkPerHour: 20 },
  { id: "blue_editor_banner", nameKo: "푸른 편집실 명패", nameEn: "Blue Editor Banner", descriptionKo: "랭킹 이름표에 쓰는 푸른 명패.", descriptionEn: "A blue ranking nameplate.", category: "banner", rarity: "rare", quantity: 1, activeBonusBps: 0, passiveInkPerHour: 0, cosmeticData: { style: "blueprint" } },
  { id: "archive_nocturne", nameKo: "아카이브 녹턴", nameEn: "Archive Nocturne", descriptionKo: "개인 아카이브에 적용하는 짙은 밤색 테마.", descriptionEn: "A deep night theme for a personal archive.", category: "archive_theme", rarity: "epic", quantity: 1, activeBonusBps: 0, passiveInkPerHour: 0, cosmeticData: { style: "nocturne" } },
];

const PREVIEW_STATE: TypingGameState = {
  wallet: { ink: 12480, lifetimeInk: 46320, pityCount: 7, passivePerHour: 64, claimableInk: 936, passiveClaimedAt: new Date(0).toISOString() },
  inventory: PREVIEW_ITEMS,
  catalog: [...PREVIEW_ITEMS,
    { id: "golden_press", nameKo: "황금 윤전기", nameEn: "Golden Press", descriptionKo: "아직 발견하지 못했습니다.", descriptionEn: "Not discovered yet.", category: "tool", rarity: "legendary", activeBonusBps: 700, passiveInkPerHour: 60 },
    { id: "golden_edition", nameKo: "황금판 이름표", nameEn: "Golden Edition", descriptionKo: "아직 발견하지 못했습니다.", descriptionEn: "Not discovered yet.", category: "banner", rarity: "legendary", activeBonusBps: 0, passiveInkPerHour: 0 },
  ],
  equipment: { rankingBannerId: "blue_editor_banner", archiveThemeId: "archive_nocturne" },
};

const ITEM_SIGNS: Record<string, string> = {
  pencil_stub: "✎",
  ink_bottle: "墨",
  paperweight: "◇",
  desk_snail: "＠",
  brass_nib: "✦",
  proofreader_cat: "猫",
  night_lamp: "灯",
  blue_editor_banner: "名",
  clockwork_typewriter: "⌨",
  paper_bird: "鳥",
  archive_nocturne: "夜",
  golden_press: "輪",
};

function isSetupError(message: string) {
  return message.includes("get_my_typing_game_state") && message.includes("schema cache");
}

function ItemSign({ item, hidden = false }: { item: Pick<GameItem, "id" | "rarity">; hidden?: boolean }) {
  const hasArtwork = item.id !== "archive_pressroom";
  return <span className={styles.itemSign} data-rarity={item.rarity} data-hidden={hidden}>{hasArtwork ? (
    // Generated project artwork, split from a consistent inventory sprite sheet.
    // eslint-disable-next-line @next/next/no-img-element
    <img src={`/game/items/${item.id}.webp`} alt="" />
  ) : hidden ? "?" : ITEM_SIGNS[item.id] ?? "•"}</span>;
}

export function TypingWorkshop() {
  const { signedIn, authReady, signIn } = useAuthProfile();
  const { locale, t } = useUiLanguage();
  const reduceMotion = useReducedMotion();
  const [state, setState] = useState<TypingGameState | null>(null);
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState<"claim" | "draw-1" | "draw-10" | null>(null);
  const [message, setMessage] = useState("");
  const [results, setResults] = useState<GameDrawResult[]>([]);
  const [collectionFilter, setCollectionFilter] = useState<"all" | "owned">("owned");
  const [preview, setPreview] = useState(false);

  const load = useCallback(async () => {
    if (!signedIn || preview) { setLoading(false); return; }
    const supabase = getSupabaseClient();
    if (!supabase) { setLoading(false); return; }
    setLoading(true);
    const { data, error } = await supabase.rpc("get_my_typing_game_state");
    setLoading(false);
    if (error) {
      const detail = messageOf(error, t("공방을 불러오지 못했습니다", "Could not load the workshop"));
      setMessage(isSetupError(detail) ? t("게임 데이터베이스 준비 중", "Game database setup in progress") : detail);
      return;
    }
    setState(data as TypingGameState);
    setMessage("");
  }, [preview, signedIn, t]);

  useEffect(() => { void Promise.resolve().then(load); }, [load]);

  useEffect(() => {
    if (process.env.NODE_ENV !== "development" || !new URLSearchParams(window.location.search).has("preview")) return;
    void Promise.resolve().then(() => {
      setPreview(true);
      setState(PREVIEW_STATE);
      setLoading(false);
    });
  }, []);

  const ownedMap = useMemo(() => new Map((state?.inventory ?? []).map((item) => [item.id, item])), [state]);
  const activeBonus = Math.min(50, (state?.inventory ?? []).reduce((sum, item) => sum + item.activeBonusBps * (item.quantity ?? 1), 0) / 100);
  const shownItems = collectionFilter === "owned" ? state?.inventory ?? [] : state?.catalog ?? [];

  async function claim() {
    if (preview && state) {
      setState({ ...state, wallet: { ...state.wallet, ink: state.wallet.ink + state.wallet.claimableInk, claimableInk: 0 } });
      return;
    }
    const supabase = getSupabaseClient();
    if (!supabase || !state || state.wallet.claimableInk < 1) return;
    setBusy("claim");
    const { data, error } = await supabase.rpc("claim_typing_game_passive_ink");
    setBusy(null);
    if (error) { setMessage(messageOf(error, t("잉크를 받지 못했습니다", "Could not claim ink"))); return; }
    setMessage(t(`${Number(data).toLocaleString()} 잉크를 받았습니다`, `Claimed ${Number(data).toLocaleString()} ink`));
    await load();
  }

  async function draw(count: 1 | 10) {
    if (preview && state) {
      const samples: GameDrawResult[] = Array.from({ length: count }, (_, index) => ({ draw_index: index + 1, item_id: index % 4 === 3 ? "clockwork_typewriter" : "desk_snail", name_ko: index % 4 === 3 ? "태엽 타자기" : "원고 달팽이", name_en: index % 4 === 3 ? "Clockwork Typewriter" : "Draft Snail", rarity: index % 4 === 3 ? "epic" : "common", quantity_owned: index % 4 === 3 ? 2 : 5 + index }));
      setState({ ...state, wallet: { ...state.wallet, ink: state.wallet.ink - DRAW_COST * count } });
      setResults(samples);
      return;
    }
    const supabase = getSupabaseClient();
    if (!supabase || !state) return;
    if (state.wallet.ink < DRAW_COST * count) {
      setMessage(t("잉크가 부족합니다", "Not enough ink"));
      return;
    }
    setBusy(count === 1 ? "draw-1" : "draw-10");
    setMessage("");
    const { data, error } = await supabase.rpc("draw_typing_game_items", { p_count: count });
    setBusy(null);
    if (error) { setMessage(messageOf(error, t("상자를 열지 못했습니다", "Could not open the box"))); return; }
    setResults((data ?? []) as GameDrawResult[]);
    await load();
  }

  async function equip(item: GameItem) {
    if (item.category !== "banner" && item.category !== "archive_theme") return;
    if (preview && state) {
      setState({ ...state, equipment: item.category === "banner" ? { ...state.equipment, rankingBannerId: state.equipment.rankingBannerId === item.id ? null : item.id } : { ...state.equipment, archiveThemeId: state.equipment.archiveThemeId === item.id ? null : item.id } });
      return;
    }
    const supabase = getSupabaseClient();
    if (!supabase) return;
    const slot = item.category === "banner" ? "ranking_banner" : "archive_theme";
    const equippedId = item.category === "banner" ? state?.equipment.rankingBannerId : state?.equipment.archiveThemeId;
    setMessage("");
    const { error } = await supabase.rpc("equip_my_typing_game_cosmetic", {
      p_slot: slot,
      p_item_id: equippedId === item.id ? null : item.id,
    });
    if (error) { setMessage(messageOf(error, t("꾸미기를 적용하지 못했습니다", "Could not apply cosmetic"))); return; }
    setMessage(equippedId === item.id ? t("꾸미기를 해제했습니다", "Cosmetic removed") : t("꾸미기를 적용했습니다", "Cosmetic equipped"));
    window.dispatchEvent(new CustomEvent("typenews:game-cosmetics-updated"));
    await load();
  }

  if (!authReady || loading && signedIn && !state) return <div className={styles.loading}>{t("공방 문을 여는 중", "Opening the workshop")}</div>;

  if (!signedIn && !preview) return (
    <section className={styles.page}>
      <div className={styles.introOnly}>
        <span className={styles.kicker}>{t("실험 기능", "Experimental")}</span>
        <h1>{t("활자 공방", "Type Workshop")}</h1>
        <p>{t("타이핑으로 잉크를 모으고, 오래된 편집실의 물건을 하나씩 채워 나갑니다.", "Earn ink by typing and fill an old newsroom one object at a time.")}</p>
        <button type="button" onClick={() => void signIn()}>{t("로그인하고 시작", "Sign in to begin")}</button>
      </div>
    </section>
  );

  if (!state) return <section className={styles.page}><div className={styles.errorBox}><strong>{message || t("공방을 열 수 없습니다", "Workshop unavailable")}</strong><button type="button" onClick={() => void load()}>{t("다시 시도", "Retry")}</button></div></section>;

  return (
    <section className={styles.page}>
      <header className={styles.hero}>
        <div>
          <span className={styles.kicker}>{t("타이핑 방치형 수집", "Typing idle collection")}</span>
          <h1>{t("활자 공방", "Type Workshop")}<small>Alpha</small></h1>
          <p>{t("검증된 타수 10타마다 잉크 1개가 쌓입니다. 공방 물건은 게임 속 생산량만 올립니다.", "Every 10 verified strokes earns 1 ink. Workshop items only affect the game economy.")}</p>
        </div>
        <Link href="/" className={styles.typeLink}>{t("타이핑하러 가기", "Go type")}</Link>
      </header>

      <div className={styles.stats}>
        <div><span>{t("보유 잉크", "Ink")}</span><strong>{state.wallet.ink.toLocaleString()}</strong></div>
        <div><span>{t("시간당 생산", "Per hour")}</span><strong>+{state.wallet.passivePerHour.toLocaleString()}</strong></div>
        <div><span>{t("타이핑 보너스", "Typing bonus")}</span><strong>+{activeBonus.toFixed(activeBonus % 1 ? 2 : 0)}%</strong></div>
        <div><span>{t("수집", "Collection")}</span><strong>{state.inventory.length}/{state.catalog.length}</strong></div>
      </div>

      <div className={styles.mainGrid}>
        <section className={styles.workbench}>
          <header><div><span>{t("현재 공방", "Current workshop")}</span><strong>{t("편집실 1호", "Newsroom No. 1")}</strong></div><span>{t("최대 8시간 보관", "Stores up to 8 hours")}</span></header>
          <div className={styles.scene} aria-label={t("수집한 물건이 놓인 활자 공방", "Workshop containing collected items")}>
            {/* Generated project artwork, optimized to WebP before being committed. */}
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img className={styles.workshopArt} src="/game/workshop-scene-v1.webp" alt="" />
            <div className={styles.sceneHud}><span>{t("발견한 물건", "Discovered")}</span><strong>{state.inventory.length} / {state.catalog.length}</strong></div>
          </div>
          <div className={styles.passiveBar}>
            <div><span>{t("쌓인 잉크", "Stored ink")}</span><strong>{state.wallet.claimableInk.toLocaleString()}</strong></div>
            <button type="button" disabled={busy !== null || state.wallet.claimableInk < 1} onClick={() => void claim()}>{busy === "claim" ? t("받는 중", "Claiming") : t("받기", "Claim")}</button>
          </div>
        </section>

        <section className={styles.drawPanel}>
          <header><span>{t("공방 보급함", "Workshop supply")}</span><strong>{t("오래된 물건 상자", "Old newsroom box")}</strong></header>
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img className={styles.chestArt} src="/game/supply-chest-v1.webp" alt="" aria-hidden="true" />
          <p>{t("도구, 동료, 이름표와 아카이브 장식이 나옵니다.", "Contains tools, companions, nameplates, and archive decorations.")}</p>
          <div className={styles.pity}><span>{t("희귀 이상 확정까지", "Rare guarantee")}</span><strong>{20 - state.wallet.pityCount}{t("회", " draws")}</strong></div>
          <div className={styles.drawActions}>
            <button type="button" disabled={busy !== null} onClick={() => void draw(1)}><span>{t("1회 열기", "Open 1")}</span><small>{DRAW_COST.toLocaleString()} 잉크</small></button>
            <button type="button" disabled={busy !== null} onClick={() => void draw(10)}><span>{t("10회 열기", "Open 10")}</span><small>{(DRAW_COST * 10).toLocaleString()} 잉크</small></button>
          </div>
        </section>
      </div>

      {message ? <p className={styles.message} role="status">{message}</p> : null}

      <section className={styles.collection}>
        <header><div><span>{t("수집함", "Collection")}</span><strong>{t("공방 물건", "Workshop objects")}</strong></div><div className={styles.filters}><button type="button" data-selected={collectionFilter === "owned"} onClick={() => setCollectionFilter("owned")}>{t("보유", "Owned")}</button><button type="button" data-selected={collectionFilter === "all"} onClick={() => setCollectionFilter("all")}>{t("전체", "All")}</button></div></header>
        {shownItems.length ? <div className={styles.itemGrid}>{shownItems.map((item) => {
          const owned = ownedMap.get(item.id);
          const name = locale === "ko" ? item.nameKo : item.nameEn;
          const description = locale === "ko" ? item.descriptionKo : item.descriptionEn;
          return <article className={styles.itemCard} key={item.id} data-rarity={item.rarity} data-locked={!owned}>
            <ItemSign item={item} hidden={!owned} />
            <div><span>{RARITY_LABELS[item.rarity][locale]}</span><strong>{owned ? name : "???"}</strong><p>{owned ? description : t("아직 발견하지 못했습니다.", "Not discovered yet.")}</p></div>
            {owned ? <div className={styles.itemMeta}><span>×{owned.quantity}</span>{item.activeBonusBps ? <small>{t("타이핑", "Typing")} +{item.activeBonusBps / 100}%</small> : null}{item.passiveInkPerHour ? <small>+{item.passiveInkPerHour}/{t("시간", "hr")}</small> : null}{item.category === "banner" || item.category === "archive_theme" ? <button type="button" onClick={() => void equip(item)}>{(item.category === "banner" ? state.equipment.rankingBannerId : state.equipment.archiveThemeId) === item.id ? t("적용 중", "Equipped") : item.category === "banner" ? t("랭킹에 적용", "Use in ranking") : t("아카이브에 적용", "Use in archive")}</button> : null}</div> : null}
          </article>;
        })}</div> : <p className={styles.emptyCollection}>{t("아직 가진 물건이 없습니다. 첫 상자를 열어 보세요.", "No items yet. Open your first box.")}</p>}
      </section>

      <AnimatePresence>
        {results.length ? <motion.div className={styles.resultBackdrop} initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }} onClick={() => setResults([])}>
          <motion.div className={styles.resultDialog} role="dialog" aria-modal="true" aria-label={t("상자 개봉 결과", "Box results")} onClick={(event) => event.stopPropagation()}
            initial={reduceMotion ? { opacity: 0 } : { opacity: 0, y: 24, scale: 0.96 }} animate={{ opacity: 1, y: 0, scale: 1 }} exit={{ opacity: 0, y: 12 }}>
            <header><span>{t("상자 개봉", "Box opened")}</span><strong>{results.length === 1 ? t("새 물건을 확인하세요", "Your item") : t("10개의 물건", "Ten items")}</strong></header>
            <div className={styles.resultGrid}>{results.map((result, index) => (
              <motion.article key={`${result.draw_index}:${result.item_id}`} data-rarity={result.rarity}
                initial={reduceMotion ? false : { opacity: 0, rotateY: 90, y: 12 }} animate={{ opacity: 1, rotateY: 0, y: 0 }} transition={{ delay: reduceMotion ? 0 : index * 0.07, type: "spring", stiffness: 260, damping: 22 }}>
                <ItemSign item={{ id: result.item_id, rarity: result.rarity }} />
                <span>{RARITY_LABELS[result.rarity][locale]}</span><strong>{locale === "ko" ? result.name_ko : result.name_en}</strong><small>×{result.quantity_owned}</small>
              </motion.article>
            ))}</div>
            <button type="button" onClick={() => setResults([])}>{t("확인", "Done")}</button>
          </motion.div>
        </motion.div> : null}
      </AnimatePresence>
    </section>
  );
}
