begin;

drop function if exists public.get_showcase_feed(integer, integer, uuid);

create function public.get_showcase_feed(
  p_limit integer default 24,
  p_offset integer default 0,
  p_profile_id uuid default null,
  p_query text default null,
  p_sort text default 'newest',
  p_bookmarked_only boolean default false
)
returns table (
  item_id uuid,
  profile_id uuid,
  display_name text,
  profile_thumbnail_path text,
  profile_photo_updated_at timestamptz,
  title text,
  description text,
  build_info jsonb,
  keyxif_url text,
  image_path text,
  thumbnail_path text,
  audio_path text,
  audio_mime text,
  audio_duration_ms integer,
  like_count integer,
  bookmark_count integer,
  liked_by_me boolean,
  bookmarked_by_me boolean,
  published_at timestamptz,
  total_count bigint
)
language sql
stable
security definer
set search_path = public
as $$
  with filtered as (
    select i.*, p.display_name, pp.thumbnail_path as profile_thumbnail_path,
      pp.updated_at as profile_photo_updated_at
    from public.keyboard_showcase_items i
    join public.profiles p on p.id = i.profile_id
    left join public.public_profiles pp on pp.profile_id = i.profile_id
    where i.status = 'published'
      and (p_profile_id is null or i.profile_id = p_profile_id)
      and (
        nullif(btrim(left(coalesce(p_query, ''), 80)), '') is null
        or i.title ilike '%' || btrim(left(p_query, 80)) || '%'
        or i.description ilike '%' || btrim(left(p_query, 80)) || '%'
        or i.build_info::text ilike '%' || btrim(left(p_query, 80)) || '%'
        or p.display_name ilike '%' || btrim(left(p_query, 80)) || '%'
      )
      and (
        not coalesce(p_bookmarked_only, false)
        or exists (
          select 1 from public.keyboard_showcase_bookmarks mine
          where mine.item_id = i.id and mine.profile_id = public.current_profile_id()
        )
      )
  )
  select
    i.id,
    i.profile_id,
    coalesce(nullif(i.display_name, ''), '익명'),
    i.profile_thumbnail_path,
    i.profile_photo_updated_at,
    i.title,
    i.description,
    i.build_info,
    i.keyxif_url,
    i.image_path,
    i.thumbnail_path,
    i.audio_path,
    i.audio_mime,
    i.audio_duration_ms,
    i.like_count,
    i.bookmark_count,
    exists (
      select 1 from public.keyboard_showcase_likes l
      where l.item_id = i.id and l.profile_id = public.current_profile_id()
    ),
    exists (
      select 1 from public.keyboard_showcase_bookmarks b
      where b.item_id = i.id and b.profile_id = public.current_profile_id()
    ),
    i.published_at,
    count(*) over ()
  from filtered i
  order by
    case when p_sort = 'likes' then i.like_count end desc,
    case when p_sort = 'bookmarks' then i.bookmark_count end desc,
    i.published_at desc,
    i.id desc
  limit least(greatest(coalesce(p_limit, 24), 1), 48)
  offset greatest(coalesce(p_offset, 0), 0)
$$;

revoke all on function public.get_showcase_feed(integer, integer, uuid, text, text, boolean) from public;
grant execute on function public.get_showcase_feed(integer, integer, uuid, text, text, boolean) to anon, authenticated;

notify pgrst, 'reload schema';

commit;
