"use client";

import { Bookmark, Heart, LoaderCircle } from "lucide-react";
import Link from "next/link";
import { useCallback, useEffect, useState } from "react";
import { ShowcaseEditor } from "@/components/showcase/showcase-editor";
import { ShowcaseManager } from "@/components/showcase/showcase-manager";
import { ShowcaseSpaceEditor } from "@/components/showcase/showcase-space-editor";
import { ShowcaseSpaceDirectory } from "@/components/showcase/showcase-space-directory";
import { ShowcaseAudioPlayer } from "@/components/showcase/showcase-audio-player";
import { ProfileDecorationLine } from "@/components/profile/profile-decoration-line";
import { loadProfileDecorations, type ProfileDecoration } from "@/features/profile/decorations";
import { loadGameCosmetics, type PublicGameCosmetic } from "@/features/game/cosmetics";
import { useAuthProfile } from "@/components/auth/auth-button";
import { signedShowcaseUrl } from "@/features/showcase/media";
import { readShowcaseDraft, type ShowcaseEditorDraft } from "@/features/showcase/audio-draft";
import type { MyShowcaseItem, ShowcaseItem, ShowcaseSpace, ShowcaseSpaceView, ShowcaseViewItem } from "@/features/showcase/types";
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
  const { signedIn, authReady, profileId: myProfileId } = useAuthProfile();
  const [items, setItems] = useState<ShowcaseViewItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [loadingMore, setLoadingMore] = useState(false);
  const [editorOpen, setEditorOpen] = useState(false);
  const [managerOpen, setManagerOpen] = useState(false);
  const [spaceEditorOpen, setSpaceEditorOpen] = useState(false);
  const [editingItem, setEditingItem] = useState<MyShowcaseItem | null>(null);
  const [restoredDraft, setRestoredDraft] = useState<ShowcaseEditorDraft | null>(null);
  const [message, setMessage] = useState("");
  const [total, setTotal] = useState(0);
  const [profileName, setProfileName] = useState("");
  const [decorations, setDecorations] = useState<Map<string, ProfileDecoration>>(new Map());
  const [gameCosmetics, setGameCosmetics] = useState<Map<string, PublicGameCosmetic>>(new Map());
  const [space, setSpace] = useState<ShowcaseSpaceView | null>(null);
  const [queryDraft, setQueryDraft] = useState("");
  const [query, setQuery] = useState("");
  const [sort, setSort] = useState<"newest" | "likes" | "bookmarks">("newest");
  const [bookmarkedOnly, setBookmarkedOnly] = useState(false);
  const [directoryView, setDirectoryView] = useState<"spaces" | "keyboards">("spaces");
  const activeBookmarkFilter = signedIn && bookmarkedOnly;

  useEffect(() => {
    const url = new URL(window.location.href);
    const draftId = url.searchParams.get("showcaseAudioDraft");
    if (!draftId) return;
    url.searchParams.delete("showcaseAudioDraft");
    window.history.replaceState(window.history.state, "", `${url.pathname}${url.search}${url.hash}`);
    void readShowcaseDraft(draftId).then((draft) => {
      if (!draft) {
        setMessage(t("임시 저장한 아카이브 편집 내용을 찾지 못했습니다", "The saved archive draft could not be found"));
        return;
      }
      setRestoredDraft(draft);
      setEditingItem(draft.item);
      setEditorOpen(true);
    }).catch((error) => setMessage(messageOf(error, t("아카이브 편집 내용을 복원하지 못했습니다", "Could not restore the archive draft"))));
  }, [t]);

  const loadSpace = useCallback(async () => {
    if (!profileId) { setSpace(null); return; }
    const supabase = getSupabaseClient();
    if (!supabase) return;
    const { data, error } = await supabase.rpc("get_showcase_space", { p_profile_id: profileId });
    if (error) return;
    const row = ((data ?? []) as ShowcaseSpace[])[0];
    if (!row) return;
    setSpace({
      ...row,
      keyboard_count: Number(row.keyboard_count), total_likes: Number(row.total_likes),
      profilePhotoUrl: publicProfilePhotoUrl(supabase, row.profile_thumbnail_path, row.profile_photo_updated_at),
    });
    setProfileName(row.display_name);
    try {
      const [loaded, loadedGameCosmetics] = await Promise.all([
        loadProfileDecorations(supabase, [row.profile_id]),
        loadGameCosmetics(supabase, [row.profile_id]).catch(() => new Map<string, PublicGameCosmetic>()),
      ]);
      setDecorations((current) => new Map([...current, ...loaded]));
      setGameCosmetics((current) => new Map([...current, ...loadedGameCosmetics]));
    } catch { /* Decorations are optional profile metadata. */ }
  }, [profileId]);

  useEffect(() => { void Promise.resolve().then(loadSpace); }, [loadSpace, signedIn]);

  useEffect(() => {
    const refresh = () => void loadSpace();
    window.addEventListener("typenews:game-cosmetics-updated", refresh);
    return () => window.removeEventListener("typenews:game-cosmetics-updated", refresh);
  }, [loadSpace]);

  useEffect(() => {
    const timer = window.setTimeout(() => setQuery(queryDraft.trim()), 300);
    return () => window.clearTimeout(timer);
  }, [queryDraft]);

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
      const { data, error } = await supabase.rpc("get_showcase_feed", {
        p_limit: PAGE_SIZE, p_offset: offset, p_profile_id: profileId,
        p_query: query || null, p_sort: sort, p_bookmarked_only: activeBookmarkFilter,
      });
      if (error) throw error;
      const rows = (data ?? []) as ShowcaseItem[];
      try {
        const profileIds = rows.map((row) => row.profile_id);
        const [loaded, loadedGameCosmetics] = await Promise.all([
          loadProfileDecorations(supabase, profileIds),
          loadGameCosmetics(supabase, profileIds).catch(() => new Map<string, PublicGameCosmetic>()),
        ]);
        setDecorations((current) => new Map([...current, ...loaded]));
        setGameCosmetics((current) => new Map([...current, ...loadedGameCosmetics]));
      } catch { /* Keep the archive usable if decorations are unavailable. */ }
      if (profileId && rows[0]?.display_name) setProfileName(rows[0].display_name);
      const resolved = await Promise.all(rows.map(resolveItem));
      if (profileId && resolved[0]) setSpace((current) => current ?? {
        profile_id: profileId,
        display_name: resolved[0].display_name,
        profile_thumbnail_path: resolved[0].profile_thumbnail_path,
        profile_photo_updated_at: resolved[0].profile_photo_updated_at,
        profilePhotoUrl: resolved[0].profilePhotoUrl,
        intro: "", theme: "paper", accent: "rose", banner: "soft", layout: "gallery",
        featured_item_id: null, keyboard_count: Number(rows[0]?.total_count ?? rows.length),
        total_likes: rows.reduce((sum, row) => sum + row.like_count, 0), is_owner: false,
      });
      setItems((current) => offset ? [...current, ...resolved] : resolved);
      setTotal(Number(rows[0]?.total_count ?? offset + rows.length));
    } catch (error) {
      const detail = messageOf(error, t("아카이브를 불러오지 못했습니다", "Could not load the archive"));
      setMessage(
        (detail.includes("get_showcase_feed") && detail.includes("schema cache")) || detail.includes("permission denied for function current_profile_id")
          ? t("데이터베이스 준비 중", "Database setup in progress")
          : detail,
      );
    } finally {
      setLoading(false);
      setLoadingMore(false);
    }
  }, [activeBookmarkFilter, profileId, query, sort, t]);

  useEffect(() => {
    if (!profileId && directoryView === "spaces") return;
    /* The initial state already represents loading. Start the external request
       in a microtask so the effect itself does not synchronously cascade state. */
    void Promise.resolve().then(() => load(0));
  }, [directoryView, load, profileId]);

  async function toggle(itemId: string, kind: "like" | "bookmark") {
    const supabase = getSupabaseClient();
    if (!supabase) return;
    if (!signedIn) {
      setMessage(t("로그인 필요", "Sign-in required"));
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
    setItems((current) => current.flatMap((item) => item.item_id === itemId
      ? (kind === "bookmark" && activeBookmarkFilter && !result.active ? [] : [{
          ...item,
          ...(kind === "like"
            ? { liked_by_me: result.active, like_count: result.count }
            : { bookmarked_by_me: result.active, bookmark_count: result.count }),
        }])
      : item));
    if (kind === "bookmark" && activeBookmarkFilter && !result.active) setTotal((current) => Math.max(0, current - 1));
  }

  const featuredItem = space?.featured_item_id ? items.find((item) => item.item_id === space.featured_item_id) : null;
  const canManage = signedIn && (!profileId || Boolean(space?.is_owner));

  return (
    <section className={styles.page} data-game-theme={profileId ? gameCosmetics.get(profileId)?.archive_theme_style ?? undefined : undefined}>
      {profileId && space ? <>
        <Link className={styles.personalBackLink} href="/showcase">← {t("전체 아카이브", "All archives")}</Link>
        <header className={styles.personalHero}>
          <div className={styles.personalOverview}>
            <div className={styles.personalIdentity}>
              <span className={styles.personalAvatar} data-empty={!space.profilePhotoUrl}>{space.profilePhotoUrl ? (
                // eslint-disable-next-line @next/next/no-img-element
                <img src={space.profilePhotoUrl} alt="" />
              ) : space.display_name.slice(0, 1)}</span>
              <div><h1>{space.display_name}<ProfileDecorationLine decoration={decorations.get(space.profile_id)} /></h1>{space.intro ? <p>{space.intro}</p> : null}</div>
            </div>
            <div className={styles.spaceStats}><span><strong>{space.keyboard_count}</strong>{t("키보드", "keyboards")}</span><span><strong>{space.total_likes}</strong>{t("받은 좋아요", "likes received")}</span></div>
            {space.is_owner ? <div className={styles.personalActions}><button type="button" className={styles.secondaryButton} onClick={() => setSpaceEditorOpen(true)}>{t("공간 정보 편집", "Edit space")}</button><button type="button" className={styles.secondaryButton} onClick={() => setManagerOpen(true)}>{t("키보드 관리", "Manage keyboards")}</button><button type="button" className={styles.primaryButton} onClick={() => { setEditingItem(null); setEditorOpen(true); }}>{t("키보드 추가", "Add keyboard")}</button></div> : null}
          </div>
          {featuredItem ? <Link className={styles.featuredKeyboard} href={`/showcase/${featuredItem.item_id}`}><span>{t("대표 키보드", "Featured")}</span>
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img src={featuredItem.thumbnailUrl} alt="" /><strong>{featuredItem.title}</strong></Link> : <div className={styles.featuredEmpty}><span>{t("대표 키보드 없음", "No featured keyboard")}</span></div>}
        </header>
      </> : <header className={styles.hero}>
        <div>
          <h1 className={styles.heroTitle}>{profileId ? (profileName ? t(`${profileName}의 아카이브`, `${profileName}'s archive`) : t("사용자 아카이브", "User archive")) : t("아카이브", "Archive")}{!profileId ? <span className={styles.betaBadge}>Beta</span> : null}</h1>
          {profileId ? <Link className={styles.backLink} href="/showcase">← {t("전체 아카이브", "All archives")}</Link> : null}
        </div>
        <div className={styles.heroActions}>
          {!profileId && myProfileId ? <Link className={styles.secondaryButton} href={`/showcase?profile=${myProfileId}`}>{t("내 공간", "My space")}</Link> : null}
          {canManage ? <button type="button" className={styles.secondaryButton} onClick={() => setManagerOpen(true)}>{t("내 아카이브 관리", "Manage my archive")}</button> : null}
          {!profileId || space?.is_owner ? <button type="button" className={styles.primaryButton} disabled={!authReady} onClick={() => {
            if (!authReady) return;
            if (!signedIn) { setMessage(t("로그인 필요", "Sign-in required")); return; }
            setEditingItem(null); setEditorOpen(true);
          }}>{t("키보드 등록", "Add keyboard")}</button> : null}
        </div>
      </header>}

      {!profileId ? <div className={styles.directoryTabs} role="tablist" aria-label={t("아카이브 보기 방식", "Archive view")}>
        <button type="button" role="tab" aria-selected={directoryView === "spaces"} data-active={directoryView === "spaces"} onClick={() => setDirectoryView("spaces")}>{t("공간 둘러보기", "Explore spaces")}</button>
        <button type="button" role="tab" aria-selected={directoryView === "keyboards"} data-active={directoryView === "keyboards"} onClick={() => setDirectoryView("keyboards")}>{t("키보드 전체", "All keyboards")}</button>
      </div> : null}

      {!profileId && directoryView === "spaces" ? <ShowcaseSpaceDirectory /> : <>

      <div className={styles.toolbar}>
        <strong>{t(`키보드 ${total.toLocaleString()}대`, `${total.toLocaleString()} keyboards`)}</strong>
        <div className={styles.discoveryControls}>
          <label className={styles.archiveSearch}><input type="search" maxLength={80} value={queryDraft} onChange={(event) => setQueryDraft(event.target.value)} placeholder={t("키보드·빌드·작성자 검색", "Search keyboards, builds, authors")} aria-label={t("아카이브 검색", "Search archive")} /></label>
          <select value={sort} onChange={(event) => setSort(event.target.value as typeof sort)} aria-label={t("아카이브 정렬", "Sort archive")}><option value="newest">{t("최신순", "Newest")}</option><option value="likes">{t("좋아요순", "Most liked")}</option><option value="bookmarks">{t("북마크순", "Most bookmarked")}</option></select>
          {!profileId && signedIn ? <button type="button" className={styles.bookmarkFilter} data-active={activeBookmarkFilter} aria-pressed={activeBookmarkFilter} onClick={() => setBookmarkedOnly((current) => !current)}><Bookmark size={15} fill={activeBookmarkFilter ? "currentColor" : "none"} />{t("내 북마크", "My bookmarks")}</button> : null}
          <button type="button" className={styles.textButton} disabled={loading} onClick={() => void load(0)}>{t("새로고침", "Refresh")}</button>
        </div>
      </div>

      {message ? <p className={styles.pageMessage} role="status">{message}</p> : null}

      {loading ? (
        <div className={styles.loading}><LoaderCircle className={styles.spinning} />{t("불러오는 중", "Loading")}</div>
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
                  <Link href={`/showcase?profile=${item.profile_id}`}>{item.display_name}</Link><ProfileDecorationLine decoration={decorations.get(item.profile_id)} />
                </div>
                <Link className={styles.cardTitle} href={`/showcase/${item.item_id}`}>{item.title}</Link>
                <div className={styles.buildTags}>
                  {[item.build_info.case, item.build_info.switches, item.build_info.keycaps].filter((value): value is string => Boolean(value)).map((value) => <span key={value}>{value}</span>)}
                </div>
                {item.audioUrl ? (
                  <ShowcaseAudioPlayer src={item.audioUrl} durationHint={item.audio_duration_ms ? item.audio_duration_ms / 1000 : undefined} compact />
                ) : (
                  <span className={styles.noAudio}>{t("타건음 없음", "No typing sound")}</span>
                )}
                <div className={styles.reactions}>
                  <button type="button" disabled={!authReady} data-active={item.liked_by_me} onClick={() => void toggle(item.item_id, "like")}>
                    <Heart size={16} fill={item.liked_by_me ? "currentColor" : "none"} />
                    {item.like_count}
                  </button>
                  <button type="button" disabled={!authReady} data-active={item.bookmarked_by_me} onClick={() => void toggle(item.item_id, "bookmark")}>
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
          <strong>{query || activeBookmarkFilter ? t("검색 결과 없음", "No results") : t("등록된 키보드 없음", "No keyboards")}</strong>
          <span>{query || activeBookmarkFilter ? t("검색어나 필터를 바꿔 보세요.", "Try another search or filter.") : t("첫 번째 키보드를 올려 보세요.", "Add the first keyboard.")}</span>
        </div>
      )}

      {items.length < total ? (
        <button type="button" className={styles.loadMore} disabled={loadingMore} onClick={() => void load(items.length)}>
          {loadingMore ? <LoaderCircle className={styles.spinning} size={16} /> : null}
          {t("더 보기", "Load more")}
        </button>
      ) : null}
      </>}

      {managerOpen ? <ShowcaseManager onClose={() => setManagerOpen(false)} onAdd={() => { setManagerOpen(false); setEditingItem(null); setEditorOpen(true); }} onEdit={(item) => { setManagerOpen(false); setEditingItem(item); setEditorOpen(true); }} onChanged={() => void load(0)} /> : null}
      {editorOpen ? <ShowcaseEditor item={editingItem} restoredDraft={restoredDraft} onClose={() => { setEditorOpen(false); setEditingItem(null); setRestoredDraft(null); }} onSaved={() => void load(0)} /> : null}
      {spaceEditorOpen && space ? <ShowcaseSpaceEditor space={space} items={items} onClose={() => setSpaceEditorOpen(false)} onSaved={() => void loadSpace()} /> : null}
    </section>
  );
}
