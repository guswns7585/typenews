"use client";

import { Bookmark, FolderCog, Heart, ImagePlus, LoaderCircle, Music2, RefreshCw } from "lucide-react";
import Link from "next/link";
import { useCallback, useEffect, useState } from "react";
import { ShowcaseEditor } from "@/components/showcase/showcase-editor";
import { ShowcaseManager } from "@/components/showcase/showcase-manager";
import { signedShowcaseUrl } from "@/features/showcase/media";
import type { MyShowcaseItem, ShowcaseItem, ShowcaseViewItem } from "@/features/showcase/types";
import { publicProfilePhotoUrl } from "@/features/profile/profile-photo";
import { getSupabaseClient } from "@/lib/supabase/client";
import { messageOf } from "@/lib/supabase/errors";
import { useUiLanguage } from "@/lib/ui-language";
import styles from "./showcase.module.css";

const PAGE_SIZE = 18;

async function resolveItem(item: ShowcaseItem): Promise<ShowcaseViewItem> {
  const supabase = getSupabaseClient();
  if (!supabase) throw new Error("Supabase is not configured");
  const [thumbnailUrl, audioUrl] = await Promise.all([
    signedShowcaseUrl(supabase, item.thumbnail_path),
    signedShowcaseUrl(supabase, item.audio_path),
  ]);
  if (!thumbnailUrl) throw new Error("Showcase image is unavailable");
  return {
    ...item,
    imageUrl: thumbnailUrl,
    thumbnailUrl,
    audioUrl,
    profilePhotoUrl: publicProfilePhotoUrl(
      supabase,
      item.profile_thumbnail_path,
      item.profile_photo_updated_at,
    ),
  };
}

export function ShowcaseGallery({ profileId = null }: { profileId?: string | null }) {
  const { t } = useUiLanguage();
  const [items, setItems] = useState<ShowcaseViewItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [loadingMore, setLoadingMore] = useState(false);
  const [signedIn, setSignedIn] = useState(false);
  const [editorOpen, setEditorOpen] = useState(false);
  const [managerOpen, setManagerOpen] = useState(false);
  const [editingItem, setEditingItem] = useState<MyShowcaseItem | null>(null);
  const [message, setMessage] = useState("");
  const [total, setTotal] = useState(0);
  const [profileName, setProfileName] = useState("");

  const load = useCallback(async (offset = 0) => {
    const supabase = getSupabaseClient();
    if (!supabase) {
      setMessage(t("아카이브 연결 정보가 없습니다", "Archive connection is unavailable"));
      setLoading(false);
      return;
    }
    if (offset) setLoadingMore(true);
    else setLoading(true);
    setMessage("");
    try {
      const [{ data, error }, { data: authData }] = await Promise.all([
        supabase.rpc("get_showcase_feed", { p_limit: PAGE_SIZE, p_offset: offset, p_profile_id: profileId }),
        supabase.auth.getUser(),
      ]);
      if (error) throw error;
      setSignedIn(Boolean(authData.user));
      const rows = (data ?? []) as ShowcaseItem[];
      if (profileId && rows[0]?.display_name) setProfileName(rows[0].display_name);
      const resolved = await Promise.all(rows.map(resolveItem));
      setItems((current) => offset ? [...current, ...resolved] : resolved);
      setTotal(Number(rows[0]?.total_count ?? offset + rows.length));
    } catch (error) {
      const detail = messageOf(error, t("아카이브를 불러오지 못했습니다", "Could not load the archive"));
      setMessage(
        detail.includes("get_showcase_feed") && detail.includes("schema cache")
          ? t("아카이브 데이터베이스를 준비하는 중입니다", "The archive database is being prepared")
          : detail,
      );
    } finally {
      setLoading(false);
      setLoadingMore(false);
    }
  }, [profileId, t]);

  useEffect(() => {
    /* The initial state already represents loading. Start the external request
       in a microtask so the effect itself does not synchronously cascade state. */
    void Promise.resolve().then(() => load(0));
  }, [load]);

  async function toggle(itemId: string, kind: "like" | "bookmark") {
    const supabase = getSupabaseClient();
    if (!supabase) return;
    if (!signedIn) {
      setMessage(t("좋아요와 북마크는 로그인 후 사용할 수 있습니다", "Sign in to like or bookmark"));
      return;
    }
    const functionName = kind === "like" ? "toggle_showcase_like" : "toggle_showcase_bookmark";
    const { data, error } = await supabase.rpc(functionName, { p_item_id: itemId });
    if (error) {
      setMessage(messageOf(error, t("반응을 저장하지 못했습니다", "Could not save your reaction")));
      return;
    }
    const result = ((data ?? []) as { active: boolean; count: number }[])[0];
    if (!result) return;
    setItems((current) => current.map((item) => item.item_id === itemId
      ? {
          ...item,
          ...(kind === "like"
            ? { liked_by_me: result.active, like_count: result.count }
            : { bookmarked_by_me: result.active, bookmark_count: result.count }),
        }
      : item));
  }

  return (
    <section className={styles.page}>
      <header className={styles.hero}>
        <div>
          <span className={styles.eyebrow}>TYPENEWS ARCHIVE</span>
          <h1>{profileId ? (profileName ? t(`${profileName}의 아카이브`, `${profileName}'s archive`) : t("사용자 아카이브", "User archive")) : t("아카이브", "Archive")}</h1>
          <p>{profileId ? t("이 사용자가 기록한 키보드와 빌드, 타건음입니다.", "Keyboards, builds, and typing sounds from this user.") : t("각자의 키보드와 빌드, 타건음을 한곳에서 구경해 보세요.", "Explore community keyboards, builds, and typing sounds.")}</p>
          {profileId ? <Link className={styles.backLink} href="/showcase">← {t("전체 아카이브", "All archives")}</Link> : null}
        </div>
        <div className={styles.heroActions}>
          {signedIn ? <button type="button" className={styles.secondaryButton} onClick={() => setManagerOpen(true)}><FolderCog size={17} />{t("내 아카이브 관리", "Manage my archive")}</button> : null}
          <button type="button" className={styles.primaryButton} onClick={() => {
            if (!signedIn) { setMessage(t("키보드 등록은 로그인 후 사용할 수 있습니다", "Sign in to add a keyboard")); return; }
            setEditingItem(null); setEditorOpen(true);
          }}><ImagePlus size={17} />{t("키보드 등록", "Add keyboard")}</button>
        </div>
      </header>

      <div className={styles.toolbar}>
        <strong>{t(`기록된 키보드 ${total.toLocaleString()}대`, `${total.toLocaleString()} keyboards`)}</strong>
        <button type="button" className={styles.iconButton} aria-label={t("새로고침", "Refresh")} disabled={loading} onClick={() => void load(0)}>
          <RefreshCw className={loading ? styles.spinning : undefined} size={17} />
        </button>
      </div>

      {message ? <p className={styles.pageMessage} role="status">{message}</p> : null}

      {loading ? (
        <div className={styles.loading}><LoaderCircle className={styles.spinning} />{t("아카이브를 여는 중입니다", "Opening the archive")}</div>
      ) : items.length ? (
        <div className={styles.grid}>
          {items.map((item) => (
            <article className={styles.card} key={item.item_id}>
              <Link className={styles.cardImage} href={`/showcase/${item.item_id}`}>
                {/* Private bucket URLs are short-lived and already point at optimized WebP files. */}
                {/* eslint-disable-next-line @next/next/no-img-element */}
                <img src={item.thumbnailUrl} alt={item.title} />
              </Link>
              <div className={styles.cardBody}>
                <div className={styles.author}>
                  <span className={styles.avatar} data-empty={!item.profilePhotoUrl}>
                    {item.profilePhotoUrl ? (
                      // eslint-disable-next-line @next/next/no-img-element
                      <img src={item.profilePhotoUrl} alt="" />
                    ) : item.display_name.slice(0, 1)}
                  </span>
                  <Link href={`/showcase?profile=${item.profile_id}`}>{item.display_name}</Link>
                </div>
                <Link className={styles.cardTitle} href={`/showcase/${item.item_id}`}>{item.title}</Link>
                <div className={styles.buildTags}>
                  {Object.values(item.build_info).filter(Boolean).slice(0, 3).map((value) => <span key={value}>{value}</span>)}
                </div>
                {item.audioUrl ? (
                  <audio className={styles.audio} controls preload="none" src={item.audioUrl} aria-label={`${item.title} ${t("타건음", "typing sound")}`} />
                ) : (
                  <span className={styles.noAudio}><Music2 size={13} />{t("타건음 없음", "No typing sound")}</span>
                )}
                <div className={styles.reactions}>
                  <button type="button" data-active={item.liked_by_me} onClick={() => void toggle(item.item_id, "like")}>
                    <Heart size={16} fill={item.liked_by_me ? "currentColor" : "none"} />
                    {item.like_count}
                  </button>
                  <button type="button" data-active={item.bookmarked_by_me} onClick={() => void toggle(item.item_id, "bookmark")}>
                    <Bookmark size={16} fill={item.bookmarked_by_me ? "currentColor" : "none"} />
                    {item.bookmark_count}
                  </button>
                </div>
              </div>
            </article>
          ))}
        </div>
      ) : (
        <div className={styles.empty}>
          <ImagePlus size={30} />
          <strong>{t("아직 기록된 키보드가 없습니다", "No keyboards in the archive yet")}</strong>
          <span>{t("첫 번째 키보드를 올려 보세요.", "Add the first keyboard.")}</span>
        </div>
      )}

      {items.length < total ? (
        <button type="button" className={styles.loadMore} disabled={loadingMore} onClick={() => void load(items.length)}>
          {loadingMore ? <LoaderCircle className={styles.spinning} size={16} /> : null}
          {t("더 보기", "Load more")}
        </button>
      ) : null}

      {managerOpen ? <ShowcaseManager onClose={() => setManagerOpen(false)} onAdd={() => { setManagerOpen(false); setEditingItem(null); setEditorOpen(true); }} onEdit={(item) => { setManagerOpen(false); setEditingItem(item); setEditorOpen(true); }} onChanged={() => void load(0)} /> : null}
      {editorOpen ? <ShowcaseEditor item={editingItem} onClose={() => { setEditorOpen(false); setEditingItem(null); }} onSaved={() => void load(0)} /> : null}
    </section>
  );
}
