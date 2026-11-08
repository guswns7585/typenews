begin;

create or replace function public.get_showcase_spaces(
  p_limit integer default 12,
  p_offset integer default 0,
  p_query text default null,
  p_sort text default 'recent'
)
returns table (
  profile_id uuid,
  display_name text,
  profile_thumbnail_path text,
  profile_photo_updated_at timestamptz,
  intro text,
  theme text,
  accent text,
  banner text,
  keyboard_count bigint,
  total_likes bigint,
  featured_item_id uuid,
  featured_title text,
  featured_thumbnail_path text,
  last_published_at timestamptz,
  total_count bigint
)
language sql
stable
security definer
set search_path = public
as $$
  with stats as (
    select
      i.profile_id,
      count(*) as keyboard_count,
      coalesce(sum(i.like_count), 0) as total_likes,
      max(i.published_at) as last_published_at
    from public.keyboard_showcase_items i
    where i.status = 'published'
    group by i.profile_id
  ), spaces as (
    select
      p.id as profile_id,
      coalesce(nullif(p.display_name, ''), '익명') as display_name,
      pp.thumbnail_path as profile_thumbnail_path,
      pp.updated_at as profile_photo_updated_at,
      coalesce(s.intro, '') as intro,
      coalesce(s.theme, 'paper') as theme,
      coalesce(s.accent, 'rose') as accent,
      coalesce(s.banner, 'soft') as banner,
      st.keyboard_count,
      st.total_likes,
      chosen.id as featured_item_id,
      chosen.title as featured_title,
      chosen.thumbnail_path as featured_thumbnail_path,
      st.last_published_at
    from stats st
    join public.profiles p on p.id = st.profile_id
    left join public.public_profiles pp on pp.profile_id = p.id
    left join public.keyboard_showcase_spaces s on s.profile_id = p.id
    left join lateral (
      select i.id, i.title, i.thumbnail_path
      from public.keyboard_showcase_items i
      where i.profile_id = p.id and i.status = 'published'
      order by (i.id = s.featured_item_id) desc, i.published_at desc, i.id desc
      limit 1
    ) chosen on true
    where nullif(btrim(left(coalesce(p_query, ''), 80)), '') is null
       or p.display_name ilike '%' || btrim(left(p_query, 80)) || '%'
       or coalesce(s.intro, '') ilike '%' || btrim(left(p_query, 80)) || '%'
  )
  select
    s.profile_id,
    s.display_name,
    s.profile_thumbnail_path,
    s.profile_photo_updated_at,
    s.intro,
    s.theme,
    s.accent,
    s.banner,
    s.keyboard_count,
    s.total_likes,
    s.featured_item_id,
    s.featured_title,
    s.featured_thumbnail_path,
    s.last_published_at,
    count(*) over ()
  from spaces s
  order by
    case when p_sort = 'keyboards' then s.keyboard_count end desc,
    case when p_sort = 'likes' then s.total_likes end desc,
    s.last_published_at desc,
    s.profile_id desc
  limit least(greatest(coalesce(p_limit, 12), 1), 36)
  offset greatest(coalesce(p_offset, 0), 0)
$$;

revoke all on function public.get_showcase_spaces(integer, integer, text, text) from public;
grant execute on function public.get_showcase_spaces(integer, integer, text, text) to anon, authenticated;

notify pgrst, 'reload schema';

commit;
