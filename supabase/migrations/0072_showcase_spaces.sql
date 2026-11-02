begin;

create table if not exists public.keyboard_showcase_spaces (
  profile_id uuid primary key references public.profiles(id) on delete cascade,
  intro text not null default '',
  theme text not null default 'paper' check (theme in ('paper', 'studio', 'night', 'berry')),
  accent text not null default 'rose' check (accent in ('rose', 'blue', 'green', 'amber')),
  banner text not null default 'soft' check (banner in ('soft', 'grid', 'waves', 'dots')),
  layout text not null default 'gallery' check (layout in ('gallery', 'shelf')),
  featured_item_id uuid references public.keyboard_showcase_items(id) on delete set null,
  updated_at timestamptz not null default now(),
  check (char_length(intro) <= 300)
);

alter table public.keyboard_showcase_spaces enable row level security;
revoke all on table public.keyboard_showcase_spaces from public, anon, authenticated;

create or replace function public.get_showcase_space(p_profile_id uuid)
returns table (
  profile_id uuid,
  display_name text,
  profile_thumbnail_path text,
  profile_photo_updated_at timestamptz,
  intro text,
  theme text,
  accent text,
  banner text,
  layout text,
  featured_item_id uuid,
  keyboard_count bigint,
  total_likes bigint,
  is_owner boolean
)
language sql
stable
security definer
set search_path = public
as $$
  select
    p.id,
    coalesce(nullif(p.display_name, ''), '익명'),
    pp.thumbnail_path,
    pp.updated_at,
    coalesce(s.intro, ''),
    coalesce(s.theme, 'paper'),
    coalesce(s.accent, 'rose'),
    coalesce(s.banner, 'soft'),
    coalesce(s.layout, 'gallery'),
    s.featured_item_id,
    count(i.id),
    coalesce(sum(i.like_count), 0),
    p.id = public.current_profile_id()
  from public.profiles p
  left join public.public_profiles pp on pp.profile_id = p.id
  left join public.keyboard_showcase_spaces s on s.profile_id = p.id
  left join public.keyboard_showcase_items i on i.profile_id = p.id and i.status = 'published'
  where p.id = p_profile_id
  group by p.id, p.display_name, pp.thumbnail_path, pp.updated_at,
    s.intro, s.theme, s.accent, s.banner, s.layout, s.featured_item_id
$$;

create or replace function public.update_my_showcase_space(
  p_intro text,
  p_theme text,
  p_accent text,
  p_banner text,
  p_layout text,
  p_featured_item_id uuid default null
)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  v_profile_id uuid := public.current_profile_id();
  v_intro text := btrim(coalesce(p_intro, ''));
begin
  if v_profile_id is null then raise exception 'Not authenticated'; end if;
  if char_length(v_intro) > 300 then raise exception 'Archive introduction is too long'; end if;
  if p_theme not in ('paper', 'studio', 'night', 'berry')
     or p_accent not in ('rose', 'blue', 'green', 'amber')
     or p_banner not in ('soft', 'grid', 'waves', 'dots')
     or p_layout not in ('gallery', 'shelf') then
    raise exception 'Invalid archive appearance';
  end if;
  if p_featured_item_id is not null and not exists (
    select 1 from public.keyboard_showcase_items
    where id = p_featured_item_id and profile_id = v_profile_id and status = 'published'
  ) then
    raise exception 'Featured keyboard is unavailable';
  end if;

  insert into public.keyboard_showcase_spaces
    (profile_id, intro, theme, accent, banner, layout, featured_item_id, updated_at)
  values
    (v_profile_id, v_intro, p_theme, p_accent, p_banner, p_layout, p_featured_item_id, now())
  on conflict (profile_id) do update
  set intro = excluded.intro,
      theme = excluded.theme,
      accent = excluded.accent,
      banner = excluded.banner,
      layout = excluded.layout,
      featured_item_id = excluded.featured_item_id,
      updated_at = now();
end;
$$;

revoke all on function public.get_showcase_space(uuid) from public;
revoke all on function public.update_my_showcase_space(text, text, text, text, text, uuid) from public, anon;
grant execute on function public.get_showcase_space(uuid) to anon, authenticated;
grant execute on function public.update_my_showcase_space(text, text, text, text, text, uuid) to authenticated;

notify pgrst, 'reload schema';

commit;
