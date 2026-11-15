"use client";

import { LoaderCircle, Pencil, Plus, Trash2 } from "lucide-react";
import { useCallback, useEffect, useState } from "react";
import type { ShowcaseInventoryItem } from "@/features/showcase/types";
import { getSupabaseClient } from "@/lib/supabase/client";
import { messageOf } from "@/lib/supabase/errors";
import { useUiLanguage } from "@/lib/ui-language";
import styles from "./showcase.module.css";

const EMPTY = { id: null as string | null, category: "keycap" as "keycap" | "switch", name: "", brand: "", quantity: "1", ownership_status: "owned" as "ordered" | "owned" | "sold", acquired_at: "", notes: "", is_public: true };

export function ShowcaseInventoryPanel() {
  const { t } = useUiLanguage();
  const [items, setItems] = useState<ShowcaseInventoryItem[]>([]);
  const [form, setForm] = useState(EMPTY);
  const [filter, setFilter] = useState<"all" | "keycap" | "switch">("all");
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState("");

  const load = useCallback(async () => {
    const supabase = getSupabaseClient();
    if (!supabase) return;
    setLoading(true);
    const { data, error } = await supabase.rpc("get_my_showcase_inventory");
    if (error) setMessage(messageOf(error, t("보유 장비를 불러오지 못했습니다", "Could not load inventory")));
    else setItems((data ?? []) as ShowcaseInventoryItem[]);
    setLoading(false);
  }, [t]);

  useEffect(() => { void Promise.resolve().then(load); }, [load]);

  async function save(event: React.FormEvent) {
    event.preventDefault();
    const supabase = getSupabaseClient();
    if (!supabase) return;
    setBusy(true); setMessage("");
    const { error } = await supabase.rpc("save_my_showcase_inventory", {
      p_id: form.id, p_category: form.category, p_name: form.name, p_brand: form.brand,
      p_quantity: Number(form.quantity) || 0, p_ownership_status: form.ownership_status,
      p_acquired_at: form.acquired_at || null, p_notes: form.notes, p_is_public: form.is_public,
    });
    setBusy(false);
    if (error) { setMessage(messageOf(error, t("보유 장비를 저장하지 못했습니다", "Could not save inventory"))); return; }
    setForm(EMPTY); await load();
  }

  function edit(item: ShowcaseInventoryItem) {
    setForm({ id: item.id, category: item.category, name: item.name, brand: item.brand, quantity: String(item.quantity), ownership_status: item.ownership_status, acquired_at: item.acquired_at ?? "", notes: item.notes, is_public: item.is_public });
  }

  async function remove(item: ShowcaseInventoryItem) {
    if (!window.confirm(t(`‘${item.name}’을 보유 목록에서 삭제할까요?`, `Remove “${item.name}” from inventory?`))) return;
    const supabase = getSupabaseClient();
    if (!supabase) return;
    const { error } = await supabase.rpc("delete_my_showcase_inventory", { p_id: item.id });
    if (error) setMessage(messageOf(error, t("삭제하지 못했습니다", "Could not delete item")));
    else { if (form.id === item.id) setForm(EMPTY); await load(); }
  }

  const visible = filter === "all" ? items : items.filter((item) => item.category === filter);
  const statusLabel = (value: ShowcaseInventoryItem["ownership_status"]) => value === "ordered" ? t("배송·입고 대기", "Ordered") : value === "sold" ? t("판매·정리", "Sold") : t("보유 중", "Owned");
  function downloadCsv() {
    const quote = (value: string | number | boolean | null) => `"${String(value ?? "").replaceAll('"', '""')}"`;
    const rows = [["category", "name", "brand", "quantity", "status", "acquired_at", "notes", "public"], ...items.map((item) => [item.category, item.name, item.brand, item.quantity, item.ownership_status, item.acquired_at ?? "", item.notes, item.is_public])];
    const blob = new Blob(["\ufeff", rows.map((row) => row.map(quote).join(",")).join("\r\n")], { type: "text/csv;charset=utf-8" });
    const url = URL.createObjectURL(blob); const link = document.createElement("a"); link.href = url; link.download = `typenews-gear-${new Date().toISOString().slice(0, 10)}.csv`; link.click(); setTimeout(() => URL.revokeObjectURL(url), 1000);
  }

  return <section className={styles.inventoryPanel}>
    <form className={styles.inventoryForm} onSubmit={(event) => void save(event)}>
      <header><div><strong>{form.id ? t("장비 정보 수정", "Edit gear") : t("보유 장비 추가", "Add gear")}</strong><span>{t("키캡과 스위치는 한 번 등록하면 키보드 빌드에서 다시 사용할 수 있습니다", "Reuse saved keycaps and switches in keyboard builds")}</span></div>{form.id ? <button type="button" onClick={() => setForm(EMPTY)}>{t("새로 입력", "New")}</button> : null}</header>
      <div className={styles.inventoryFields}>
        <label><span>{t("종류", "Type")}</span><select value={form.category} onChange={(event) => setForm((current) => ({ ...current, category: event.target.value as "keycap" | "switch" }))}><option value="keycap">{t("키캡", "Keycap")}</option><option value="switch">{t("스위치", "Switch")}</option></select></label>
        <label className={styles.inventoryName}><span>{t("이름", "Name")}</span><input required maxLength={120} value={form.name} onChange={(event) => setForm((current) => ({ ...current, name: event.target.value }))} placeholder={form.category === "keycap" ? "GMK CYL Ramune" : "MX2A Black"} /></label>
        <label><span>{t("브랜드", "Brand")}</span><input maxLength={120} value={form.brand} onChange={(event) => setForm((current) => ({ ...current, brand: event.target.value }))} /></label>
        <label><span>{t("수량", "Quantity")}</span><input type="number" min={0} max={10000} value={form.quantity} onChange={(event) => setForm((current) => ({ ...current, quantity: event.target.value }))} /></label>
        <label><span>{t("상태", "Status")}</span><select value={form.ownership_status} onChange={(event) => setForm((current) => ({ ...current, ownership_status: event.target.value as typeof form.ownership_status }))}><option value="ordered">{t("배송·입고 대기", "Ordered")}</option><option value="owned">{t("보유 중", "Owned")}</option><option value="sold">{t("판매·정리", "Sold")}</option></select></label>
        <label><span>{t("구매·입고일", "Acquired")}</span><input type="date" value={form.acquired_at} onChange={(event) => setForm((current) => ({ ...current, acquired_at: event.target.value }))} /></label>
        <label className={styles.inventoryNotes}><span>{t("메모", "Notes")}</span><input maxLength={1000} value={form.notes} onChange={(event) => setForm((current) => ({ ...current, notes: event.target.value }))} /></label>
        <label className={styles.inventoryPublic}><input type="checkbox" checked={form.is_public} onChange={(event) => setForm((current) => ({ ...current, is_public: event.target.checked }))} />{t("아카이브에 공개", "Public")}</label>
      </div>
      <button type="submit" className={styles.primaryButton} disabled={busy || !form.name.trim()}>{busy ? <LoaderCircle className={styles.spinning} size={15} /> : <Plus size={15} />}{form.id ? t("수정 저장", "Save") : t("목록에 추가", "Add")}</button>
    </form>
    {message ? <p className={styles.formMessage}>{message}</p> : null}
    <div className={styles.inventoryToolbar}><div><button type="button" data-active={filter === "all"} onClick={() => setFilter("all")}>{t("전체", "All")} {items.length}</button><button type="button" data-active={filter === "keycap"} onClick={() => setFilter("keycap")}>{t("키캡", "Keycaps")} {items.filter((item) => item.category === "keycap").length}</button><button type="button" data-active={filter === "switch"} onClick={() => setFilter("switch")}>{t("스위치", "Switches")} {items.filter((item) => item.category === "switch").length}</button></div>{items.length ? <button type="button" onClick={downloadCsv}>{t("CSV 내보내기", "Export CSV")}</button> : null}</div>
    {loading ? <div className={styles.loading}><LoaderCircle className={styles.spinning} /></div> : visible.length ? <div className={styles.inventoryList}>{visible.map((item) => <article key={item.id}><div><b>{item.name}</b><span>{[item.brand, statusLabel(item.ownership_status), `${item.quantity}${item.category === "switch" ? t("개", " pcs") : t("세트", " sets")}`].filter(Boolean).join(" · ")}</span>{item.notes ? <small>{item.notes}</small> : null}</div><div><button type="button" onClick={() => edit(item)}><Pencil size={14} />{t("수정", "Edit")}</button><button type="button" onClick={() => void remove(item)}><Trash2 size={14} />{t("삭제", "Delete")}</button></div></article>)}</div> : <div className={styles.inventoryEmpty}>{t("등록한 보유 장비가 없습니다", "No saved gear")}</div>}
  </section>;
}
