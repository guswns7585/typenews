-- Public profile photos for ranking cards.
-- Private identity fields remain in profiles; this table only exposes display assets.

create table if not exists public.public_profiles (
  profile_id uuid primary key references public.profiles(id) on delete cascade,
  photo_path text not null,
  thumbnail_path text not null,
  photo_width integer not null check (photo_width between 1 and 1600),
  photo_height integer not null check (photo_height between 1 and 1600),
  photo_bytes integer not null check (photo_bytes between 1 and 716800),
  thumbnail_bytes integer not null check (thumbnail_bytes between 1 and 81920),
  updated_at timestamptz not null default now(),
  constraint public_profiles_fixed_paths check (
    photo_path = profile_id::text || '/photo.webp'
    and thumbnail_path = profile_id::text || '/ranking.webp'
  )
);

alter table public.public_profiles enable row level security;

drop policy if exists "public_profiles_read" on public.public_profiles;
create policy "public_profiles_read"
on public.public_profiles for select
to anon, authenticated
using (true);

revoke all on public.public_profiles from public, anon, authenticated;
grant select on public.public_profiles to anon, authenticated;

-- The browser converts source files to WebP before upload. The bucket rejects
-- oversized files and every other MIME type as a second line of defence.
insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values (
  'profile-photos',
  'profile-photos',
  true,
  716800,
  array['image/webp']::text[]
)
on conflict (id) do update
set
  public = excluded.public,
  file_size_limit = excluded.file_size_limit,
  allowed_mime_types = excluded.allowed_mime_types;

drop policy if exists "profile_photos_select_own" on storage.objects;
create policy "profile_photos_select_own"
on storage.objects for select
to authenticated
using (
  bucket_id = 'profile-photos'
  and (storage.foldername(name))[1] = public.current_profile_id()::text
);

drop policy if exists "profile_photos_insert_own" on storage.objects;
create policy "profile_photos_insert_own"
on storage.objects for insert
to authenticated
with check (
  bucket_id = 'profile-photos'
  and (storage.foldername(name))[1] = public.current_profile_id()::text
  and storage.filename(name) in ('photo.webp', 'ranking.webp')
);

drop policy if exists "profile_photos_update_own" on storage.objects;
create policy "profile_photos_update_own"
on storage.objects for update
to authenticated
using (
  bucket_id = 'profile-photos'
  and (storage.foldername(name))[1] = public.current_profile_id()::text
)
with check (
  bucket_id = 'profile-photos'
  and (storage.foldername(name))[1] = public.current_profile_id()::text
  and storage.filename(name) in ('photo.webp', 'ranking.webp')
);

drop policy if exists "profile_photos_delete_own" on storage.objects;
create policy "profile_photos_delete_own"
on storage.objects for delete
to authenticated
using (
  bucket_id = 'profile-photos'
  and (storage.foldername(name))[1] = public.current_profile_id()::text
);

create or replace function public.get_my_profile_photo()
returns table (
  profile_id uuid,
  photo_path text,
  thumbnail_path text,
  updated_at timestamptz
)
language plpgsql
stable
security definer
set search_path = public
as $$
declare
  v_profile_id uuid := public.current_profile_id();
begin
  if v_profile_id is null then
    raise exception 'Not authenticated';
  end if;

  return query
  select
    v_profile_id,
    pp.photo_path,
    pp.thumbnail_path,
    pp.updated_at
  from (select 1) seed
  left join public.public_profiles pp on pp.profile_id = v_profile_id;
end;
$$;

create or replace function public.save_my_profile_photo(
  p_photo_path text,
  p_thumbnail_path text,
  p_photo_width integer,
  p_photo_height integer,
  p_photo_bytes integer,
  p_thumbnail_bytes integer
)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  v_profile_id uuid := public.current_profile_id();
begin
  if v_profile_id is null then
    raise exception 'Not authenticated';
  end if;

  if p_photo_path <> v_profile_id::text || '/photo.webp'
     or p_thumbnail_path <> v_profile_id::text || '/ranking.webp' then
    raise exception 'Invalid profile photo path';
  end if;

  if p_photo_width not between 1 and 1600
     or p_photo_height not between 1 and 1600
     or p_photo_bytes not between 1 and 716800
     or p_thumbnail_bytes not between 1 and 81920 then
    raise exception 'Invalid profile photo dimensions or size';
  end if;

  insert into public.public_profiles (
    profile_id,
    photo_path,
    thumbnail_path,
    photo_width,
    photo_height,
    photo_bytes,
    thumbnail_bytes,
    updated_at
  )
  values (
    v_profile_id,
    p_photo_path,
    p_thumbnail_path,
    p_photo_width,
    p_photo_height,
    p_photo_bytes,
    p_thumbnail_bytes,
    now()
  )
  on conflict (profile_id) do update
  set
    photo_path = excluded.photo_path,
    thumbnail_path = excluded.thumbnail_path,
    photo_width = excluded.photo_width,
    photo_height = excluded.photo_height,
    photo_bytes = excluded.photo_bytes,
    thumbnail_bytes = excluded.thumbnail_bytes,
    updated_at = now();
end;
$$;

create or replace function public.remove_my_profile_photo()
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  v_profile_id uuid := public.current_profile_id();
begin
  if v_profile_id is null then
    raise exception 'Not authenticated';
  end if;

  delete from public.public_profiles where profile_id = v_profile_id;
end;
$$;

-- Adding photo columns does not change score ordering or draw eligibility.
drop function if exists public.get_monthly_ranking(text, integer);

create function public.get_monthly_ranking(p_month_id text, p_limit integer default 50)
returns table (
  profile_id uuid,
  display_name text,
  score integer,
  photo_path text,
  thumbnail_path text,
  photo_updated_at timestamptz
)
language sql
stable
security definer
set search_path = public
as $$
  select
    p.id as profile_id,
    coalesce(nullif(ms.nickname, ''), nullif(p.display_name, ''), '익명') as display_name,
    ms.score,
    pp.photo_path,
    pp.thumbnail_path,
    pp.updated_at as photo_updated_at
  from public.monthly_stats ms
  join public.profiles p on p.id = ms.profile_id
  left join public.public_profiles pp on pp.profile_id = p.id
  where ms.month_id = p_month_id
  order by ms.score desc, ms.updated_at desc, p.created_at asc
  limit least(greatest(coalesce(p_limit, 50), 1), 100)
$$;

revoke all on function public.get_my_profile_photo() from public, anon;
revoke all on function public.save_my_profile_photo(text, text, integer, integer, integer, integer) from public, anon;
revoke all on function public.remove_my_profile_photo() from public, anon;
grant execute on function public.get_my_profile_photo() to authenticated;
grant execute on function public.save_my_profile_photo(text, text, integer, integer, integer, integer) to authenticated;
grant execute on function public.remove_my_profile_photo() to authenticated;
grant execute on function public.get_monthly_ranking(text, integer) to anon, authenticated;

notify pgrst, 'reload schema';
