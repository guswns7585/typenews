"use client";

import { Download, Eye, EyeOff, LoaderCircle, Pencil, Plus, Trash2, X } from "lucide-react";
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
      setSelected(new Set(resolved.filter((item) => item.thumbnailUrl).map((item) => item.id)));
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
    const collageItems = items.filter((item) => selected.has(item.id) && item.thumbnailUrl).map((item) => ({ title: item.title, imageUrl: item.thumbnailUrl! }));
    if (!collageItems.length) { setMessage(t("콜라주로 만들 키보드를 선택해 주세요", "Select keyboards for the collage")); return; }
    setCollageBusy(true);
    try {
      const blob = await createShowcaseCollage(collageItems);
      const url = URL.createObjectURL(blob);
      const link = document.createElement("a");
      link.href = url;
      link.download = `typenews-archive-${new Date().toISOString().slice(0, 10)}.png`;
      link.click();
      setTimeout(() => URL.revokeObjectURL(url), 1000);
    } catch (error) { setMessage(messageOf(error, t("콜라주를 만들지 못했습니다", "Could not create collage"))); }
    finally { setCollageBusy(false); }
  }

  return (
    <dialog ref={dialogRef} className={`${styles.editor} ${styles.manager}`} onCancel={(event) => { event.preventDefault(); onClose(); }}>
      <section className={styles.managerInner}>
        <header className={styles.editorHeader}><div><span>{t("ARCHIVE", "ARCHIVE")}</span><h2>{t("내 아카이브 관리", "Manage my archive")}</h2></div><button type="button" className={styles.iconButton} onClick={onClose} aria-label={t("닫기", "Close")}><X size={19} /></button></header>
        <div className={styles.managerToolbar}>
          <strong>{items.length} / 10</strong>
          <div><button type="button" className={styles.secondaryButton} disabled={collageBusy || !items.length} onClick={() => void saveCollage()}>{collageBusy ? <LoaderCircle className={styles.spinning} size={16} /> : <Download size={16} />}{t("선택한 키보드 콜라주", "Download collage")}</button><button type="button" className={styles.primaryButton} disabled={items.length >= 10} onClick={onAdd}><Plus size={16} />{t("키보드 추가", "Add keyboard")}</button></div>
        </div>
        {message ? <p className={styles.formMessage}>{message}</p> : null}
        {loading ? <div className={styles.loading}><LoaderCircle className={styles.spinning} /></div> : items.length ? (
          <div className={styles.managerList}>{items.map((item) => (
            <article className={styles.managerItem} key={item.id}>
              <label className={styles.selection}><input type="checkbox" checked={selected.has(item.id)} disabled={!item.thumbnailUrl} onChange={(event) => setSelected((current) => { const next = new Set(current); if (event.target.checked) next.add(item.id); else next.delete(item.id); return next; })} /><span className={styles.managerThumb}>{item.thumbnailUrl ? (
                // Private bucket URLs are short-lived and cannot use the static Next image loader.
                // eslint-disable-next-line @next/next/no-img-element
                <img src={item.thumbnailUrl} alt="" />
              ) : null}</span></label>
              <div className={styles.managerMeta}><strong>{item.title}</strong><span data-status={item.status}>{item.status === "published" ? t("공개", "Published") : item.status === "hidden" ? t("관리자 숨김", "Hidden by moderator") : t("비공개", "Private")}</span></div>
              <div className={styles.managerActions}>
                <button type="button" onClick={() => onEdit(item)}><Pencil size={15} />{t("수정", "Edit")}</button>
                <button type="button" disabled={busyId === item.id || item.status === "hidden"} onClick={() => void togglePublished(item)}>{item.status === "published" ? <EyeOff size={15} /> : <Eye size={15} />}{item.status === "published" ? t("비공개", "Unpublish") : t("공개", "Publish")}</button>
                <button type="button" className={styles.dangerButton} disabled={busyId === item.id} onClick={() => void remove(item)}><Trash2 size={15} />{t("삭제", "Delete")}</button>
              </div>
            </article>
          ))}</div>
        ) : <div className={styles.empty}><strong>{t("등록한 키보드가 없습니다", "No keyboards in your archive")}</strong></div>}
      </section>
    </dialog>
  );
}
