"use client";

import { LoaderCircle, X } from "lucide-react";
import { useCallback, useEffect, useRef, useState } from "react";
import { createShowcaseCollage } from "@/features/showcase/collage";
import { signedShowcaseUrl, SHOWCASE_BUCKET } from "@/features/showcase/media";
import type { MyShowcaseItem, MyShowcaseViewItem } from "@/features/showcase/types";
import { getSupabaseClient } from "@/lib/supabase/client";
import { messageOf } from "@/lib/supabase/errors";
import { useUiLanguage } from "@/lib/ui-language";
import styles from "./showcase.module.css";

type Props = { onClose: () => void; onAdd: () => void; onEdit: (item: MyShowcaseItem) => void; onChanged: () => void };

export function ShowcaseManager({ onClose, onAdd, onEdit, onChanged }: Props) {
  const { t } = useUiLanguage();
  const dialogRef = useRef<HTMLDialogElement>(null);
  const [items, setItems] = useState<MyShowcaseViewItem[]>([]);
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [collageOrder, setCollageOrder] = useState<string[]>([]);
  const [collageTheme, setCollageTheme] = useState<"light" | "dark">("light");
  const [collageFit, setCollageFit] = useState<"cover" | "contain">("cover");
  const [collageCaptions, setCollageCaptions] = useState(true);
  const [collageAuthor, setCollageAuthor] = useState("");
  const [loading, setLoading] = useState(true);
  const [busyId, setBusyId] = useState<string | null>(null);
  const [collageBusy, setCollageBusy] = useState(false);
  const [message, setMessage] = useState("");

  const load = useCallback(async () => {
    const supabase = getSupabaseClient();
    if (!supabase) return;
    setLoading(true);
    try {
      const { data, error } = await supabase.rpc("get_my_showcase_items");
      if (error) throw error;
      const rows = (data ?? []) as MyShowcaseItem[];
      const resolved = await Promise.all(rows.map(async (item) => ({ ...item, thumbnailUrl: await signedShowcaseUrl(supabase, item.thumbnail_path) })));
      setItems(resolved);
      const available = resolved.filter((item) => item.thumbnailUrl).map((item) => item.id);
      setSelected(new Set(available));
      setCollageOrder(available);
    } catch (error) { setMessage(messageOf(error, t("내 아카이브를 불러오지 못했습니다", "Could not load your archive"))); }
    finally { setLoading(false); }
  }, [t]);

  useEffect(() => { dialogRef.current?.showModal(); void Promise.resolve().then(load); }, [load]);

  async function togglePublished(item: MyShowcaseItem) {
    const supabase = getSupabaseClient();
    if (!supabase || item.status === "hidden") return;
    setBusyId(item.id);
    const { error } = await supabase.rpc("set_my_showcase_published", { p_item_id: item.id, p_published: item.status !== "published" });
    if (error) setMessage(messageOf(error, t("공개 상태를 바꾸지 못했습니다", "Could not change visibility")));
    else { await load(); onChanged(); }
    setBusyId(null);
  }

  async function remove(item: MyShowcaseItem) {
    if (!window.confirm(t(`‘${item.title}’을 삭제할까요?`, `Delete “${item.title}”?`))) return;
    const supabase = getSupabaseClient();
    if (!supabase) return;
    setBusyId(item.id);
    const { data, error } = await supabase.rpc("delete_my_showcase_item", { p_item_id: item.id });
    if (error) setMessage(messageOf(error, t("키보드를 삭제하지 못했습니다", "Could not delete keyboard")));
    else {
      const paths = ((data ?? []) as { path: string }[]).map((row) => row.path);
      if (paths.length) await supabase.storage.from(SHOWCASE_BUCKET).remove(paths);
      await load();
      onChanged();
    }
    setBusyId(null);
  }

  async function saveCollage() {
    const byId = new Map(items.map((item) => [item.id, item]));
    const collageItems = collageOrder.map((id) => byId.get(id)).filter((item): item is MyShowcaseViewItem => Boolean(item && selected.has(item.id) && item.thumbnailUrl)).map((item) => ({ title: item.title, imageUrl: item.thumbnailUrl! }));
    if (!collageItems.length) { setMessage(t("콜라주로 만들 키보드를 선택해 주세요", "Select keyboards for the collage")); return; }
    setCollageBusy(true);
    try {
      const blob = await createShowcaseCollage(collageItems, { theme: collageTheme, fit: collageFit, showCaptions: collageCaptions, authorName: collageAuthor });
      const url = URL.createObjectURL(blob);
      const link = document.createElement("a");
      link.href = url;
      link.download = `typenews-archive-${new Date().toISOString().slice(0, 10)}.png`;
      link.click();
      setTimeout(() => URL.revokeObjectURL(url), 1000);
    } catch (error) { setMessage(messageOf(error, t("콜라주를 만들지 못했습니다", "Could not create collage"))); }
    finally { setCollageBusy(false); }
  }

  function selectForCollage(itemId: string, checked: boolean) {
    setSelected((current) => {
      const next = new Set(current);
      if (checked) next.add(itemId); else next.delete(itemId);
      return next;
    });
    setCollageOrder((current) => checked
      ? (current.includes(itemId) ? current : [...current, itemId])
      : current.filter((id) => id !== itemId));
  }

  function moveInCollage(itemId: string, direction: -1 | 1) {
    setCollageOrder((current) => {
      const index = current.indexOf(itemId);
      const target = index + direction;
      if (index < 0 || target < 0 || target >= current.length) return current;
      const next = [...current];
      [next[index], next[target]] = [next[target], next[index]];
      return next;
    });
  }

  return (
    <dialog ref={dialogRef} className={`${styles.editor} ${styles.manager}`} onCancel={(event) => { event.preventDefault(); onClose(); }}>
      <section className={styles.managerInner}>
        <header className={styles.editorHeader}><div><h2>{t("내 아카이브 관리", "Manage my archive")}</h2></div><button type="button" className={styles.iconButton} onClick={onClose} aria-label={t("닫기", "Close")}><X size={19} /></button></header>
        <div className={styles.managerToolbar}>
          <strong>{items.length} / 10</strong>
          <div><button type="button" className={styles.secondaryButton} disabled={collageBusy || !selected.size} onClick={() => void saveCollage()}>{collageBusy ? <LoaderCircle className={styles.spinning} size={16} /> : null}{t(`콜라주 저장 (${selected.size})`, `Download collage (${selected.size})`)}</button><button type="button" className={styles.primaryButton} disabled={items.length >= 10} onClick={onAdd}>{t("키보드 추가", "Add keyboard")}</button></div>
        </div>
        {items.length ? <section className={styles.collageOptions} aria-label={t("콜라주 설정", "Collage settings")}>
          <label><span>{t("배경", "Theme")}</span><select value={collageTheme} onChange={(event) => setCollageTheme(event.target.value as "light" | "dark")}><option value="light">{t("밝게", "Light")}</option><option value="dark">{t("어둡게", "Dark")}</option></select></label>
          <label><span>{t("사진 맞춤", "Image fit")}</span><select value={collageFit} onChange={(event) => setCollageFit(event.target.value as "cover" | "contain")}><option value="cover">{t("영역 채우기", "Fill")}</option><option value="contain">{t("사진 전체", "Show all")}</option></select></label>
          <label className={styles.collageAuthor}><span>{t("작성자 · 선택", "Author · optional")}</span><input maxLength={60} value={collageAuthor} onChange={(event) => setCollageAuthor(event.target.value)} placeholder={t("표시 이름", "Display name")} /></label>
          <label className={styles.collageCheck}><input type="checkbox" checked={collageCaptions} onChange={(event) => setCollageCaptions(event.target.checked)} />{t("키보드 이름 표시", "Show keyboard names")}</label>
        </section> : null}
        {message ? <p className={styles.formMessage}>{message}</p> : null}
        {loading ? <div className={styles.loading}><LoaderCircle className={styles.spinning} /></div> : items.length ? (
          <div className={styles.managerList}>{items.map((item) => (
            <article className={styles.managerItem} key={item.id}>
              <label className={styles.selection}><input type="checkbox" checked={selected.has(item.id)} disabled={!item.thumbnailUrl} onChange={(event) => selectForCollage(item.id, event.target.checked)} /><span className={styles.managerThumb}>{item.thumbnailUrl ? (
                // Private bucket URLs are short-lived and cannot use the static Next image loader.
                // eslint-disable-next-line @next/next/no-img-element
                <img src={item.thumbnailUrl} alt="" />
              ) : null}</span></label>
              <div className={styles.managerMeta}><strong>{item.title}</strong><span data-status={item.status}>{item.status === "published" ? t("공개", "Published") : item.status === "hidden" ? t("관리자 숨김", "Hidden by moderator") : t("비공개", "Private")}</span></div>
              <div className={styles.managerActions}>
                <span className={styles.orderControls} data-visible={selected.has(item.id)}>
                  <button type="button" disabled={!selected.has(item.id) || collageOrder.indexOf(item.id) <= 0} onClick={() => moveInCollage(item.id, -1)} aria-label={t("콜라주에서 앞으로", "Move earlier in collage")} title={t("콜라주에서 앞으로", "Move earlier in collage")}>↑</button>
                  <button type="button" disabled={!selected.has(item.id) || collageOrder.indexOf(item.id) >= collageOrder.length - 1} onClick={() => moveInCollage(item.id, 1)} aria-label={t("콜라주에서 뒤로", "Move later in collage")} title={t("콜라주에서 뒤로", "Move later in collage")}>↓</button>
                </span>
                <button type="button" onClick={() => onEdit(item)}>{t("수정", "Edit")}</button>
                <button type="button" disabled={busyId === item.id || item.status === "hidden"} onClick={() => void togglePublished(item)}>{item.status === "published" ? t("비공개", "Unpublish") : t("공개", "Publish")}</button>
                <button type="button" className={styles.dangerButton} disabled={busyId === item.id} onClick={() => void remove(item)}>{t("삭제", "Delete")}</button>
              </div>
            </article>
          ))}</div>
        ) : <div className={styles.empty}><strong>{t("등록한 키보드가 없습니다", "No keyboards in your archive")}</strong></div>}
      </section>
    </dialog>
  );
}
