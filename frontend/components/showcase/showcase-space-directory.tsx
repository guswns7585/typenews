"use client";

import { Heart, Keyboard, LoaderCircle, RefreshCw, Search } from "lucide-react";
import Link from "next/link";
import { useCallback, useEffect, useState, type CSSProperties } from "react";
import { signedShowcaseUrl } from "@/features/showcase/media";
import type { ShowcaseSpaceDirectoryItem, ShowcaseSpaceDirectoryView } from "@/features/showcase/types";
import { publicProfilePhotoUrl } from "@/features/profile/profile-photo";
import { getSupabaseClient } from "@/lib/supabase/client";
import { messageOf } from "@/lib/supabase/errors";
import { useUiLanguage } from "@/lib/ui-language";
import styles from "./showcase.module.css";

const PAGE_SIZE = 12;
const ACCENTS = { rose: "#b85270", blue: "#4777ba", green: "#4f8168", amber: "#b4772f" } as const;

async function resolveSpace(item: ShowcaseSpaceDirectoryItem): Promise<ShowcaseSpaceDirectoryView> {
  const supabase = getSupabaseClient();
  if (!supabase) throw new Error("Supabase is not configured");
  const featuredThumbnailUrl = await signedShowcaseUrl(supabase, item.featured_thumbnail_path);
  return {
    ...item,
    featuredThumbnailUrl,
    profilePhotoUrl: publicProfilePhotoUrl(
      supabase,
      item.profile_thumbnail_path,
      item.profile_photo_updated_at,
    ),
  };
}

export function ShowcaseSpaceDirectory() {
  const { t } = useUiLanguage();
  const [spaces, setSpaces] = useState<ShowcaseSpaceDirectoryView[]>([]);
  const [queryDraft, setQueryDraft] = useState("");
  const [query, setQuery] = useState("");
  const [sort, setSort] = useState<"recent" | "keyboards" | "likes">("recent");
  const [total, setTotal] = useState(0);
  const [loading, setLoading] = useState(true);
  const [loadingMore, setLoadingMore] = useState(false);
  const [message, setMessage] = useState("");

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
      const { data, error } = await supabase.rpc("get_showcase_spaces", {
        p_limit: PAGE_SIZE,
        p_offset: offset,
        p_query: query || null,
        p_sort: sort,
      });
      if (error) throw error;
      const rows = (data ?? []) as ShowcaseSpaceDirectoryItem[];
      const resolved = await Promise.all(rows.map(resolveSpace));
      setSpaces((current) => offset ? [...current, ...resolved] : resolved);
      setTotal(Number(rows[0]?.total_count ?? offset + rows.length));
    } catch (error) {
      const detail = messageOf(error, t("사용자 공간을 불러오지 못했습니다", "Could not load personal spaces"));
      setMessage(detail.includes("get_showcase_spaces") && detail.includes("schema cache")
        ? t("개인 공간 데이터베이스를 준비하는 중입니다", "The personal-space database is being prepared")
        : detail);
      if (!offset) setSpaces([]);
    } finally {
      setLoading(false);
      setLoadingMore(false);
    }
  }, [query, sort, t]);

  useEffect(() => { void Promise.resolve().then(() => load(0)); }, [load]);

  return <>
    <div className={styles.toolbar}>
      <strong>{t(`사용자 공간 ${total.toLocaleString()}곳`, `${total.toLocaleString()} spaces`)}</strong>
      <div className={styles.discoveryControls}>
        <label className={styles.archiveSearch}><Search size={15} aria-hidden="true" /><input type="search" maxLength={80} value={queryDraft} onChange={(event) => setQueryDraft(event.target.value)} placeholder={t("사용자·공간 소개 검색", "Search people and spaces")} aria-label={t("사용자 공간 검색", "Search personal spaces")} /></label>
        <select value={sort} onChange={(event) => setSort(event.target.value as typeof sort)} aria-label={t("사용자 공간 정렬", "Sort personal spaces")}><option value="recent">{t("최근 활동순", "Recently active")}</option><option value="keyboards">{t("키보드 많은 순", "Most keyboards")}</option><option value="likes">{t("좋아요 많은 순", "Most liked")}</option></select>
        <button type="button" className={styles.iconButton} aria-label={t("새로고침", "Refresh")} disabled={loading} onClick={() => void load(0)}><RefreshCw className={loading ? styles.spinning : undefined} size={17} /></button>
      </div>
    </div>

    {message ? <p className={styles.pageMessage} role="status">{message}</p> : null}
    {loading ? <div className={styles.loading}><LoaderCircle className={styles.spinning} />{t("사용자 공간을 여는 중입니다", "Opening personal spaces")}</div> : spaces.length ? (
      <div className={styles.spaceDirectory}>
        {spaces.map((space) => {
          const style = { "--archive-accent": ACCENTS[space.accent] } as CSSProperties;
          return <Link key={space.profile_id} href={`/showcase?profile=${space.profile_id}`} className={styles.spaceCard} data-theme={space.theme} data-banner={space.banner} style={style}>
            <div className={styles.spaceCardBanner}>
              {space.featuredThumbnailUrl ? (
                // eslint-disable-next-line @next/next/no-img-element
                <img src={space.featuredThumbnailUrl} alt="" />
              ) : null}
              <span className={styles.spaceCardAvatar} data-empty={!space.profilePhotoUrl}>{space.profilePhotoUrl ? (
                // eslint-disable-next-line @next/next/no-img-element
                <img src={space.profilePhotoUrl} alt="" />
              ) : space.display_name.slice(0, 1)}</span>
            </div>
            <div className={styles.spaceCardBody}>
              <div><span>{t("개인 아카이브", "Personal archive")}</span><h2>{space.display_name}</h2></div>
              <p>{space.intro || t("키보드와 타건음을 모아둔 공간입니다.", "A personal collection of keyboards and typing sounds.")}</p>
              <strong className={styles.spaceFeaturedTitle}>{space.featured_title}</strong>
              <div className={styles.spaceCardStats}><span><Keyboard size={14} />{space.keyboard_count}</span><span><Heart size={14} />{space.total_likes}</span></div>
            </div>
          </Link>;
        })}
      </div>
    ) : <div className={styles.empty}><Keyboard size={30} /><strong>{query ? t("조건에 맞는 공간이 없습니다", "No spaces match this search") : t("아직 공개된 사용자 공간이 없습니다", "No personal spaces are public yet")}</strong><span>{query ? t("다른 검색어를 입력해 보세요.", "Try another search.") : t("키보드를 공개하면 이곳에 개인 공간이 생깁니다.", "Publish a keyboard to create a space here.")}</span></div>}

    {spaces.length < total ? <button type="button" className={styles.loadMore} disabled={loadingMore} onClick={() => void load(spaces.length)}>{loadingMore ? <LoaderCircle className={styles.spinning} size={16} /> : null}{t("더 보기", "Load more")}</button> : null}
  </>;
}
