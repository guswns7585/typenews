-- Admin-only profile photo moderation. There is intentionally no user report flow.

alter table public.profiles
  add column if not exists profile_photo_blocked boolean not null default false;

alter table public.public_profiles
  add column if not exists is_visible boolean not null default true;

drop policy if exists "public_profiles_read" on public.public_profiles;
create policy "public_profiles_read"
on public.public_profiles for select
to anon, authenticated
using (
  is_visible
  or profile_id = public.current_profile_id()
  or public.is_admin()
);

drop policy if exists "profile_photos_admin_delete" on storage.objects;
create policy "profile_photos_admin_delete"
on storage.objects for delete
to authenticated
using (bucket_id = 'profile-photos' and public.is_admin());

drop policy if exists "profile_photos_insert_own" on storage.objects;
create policy "profile_photos_insert_own"
on storage.objects for insert
to authenticated
with check (
  bucket_id = 'profile-photos'
  and (storage.foldername(name))[1] = public.current_profile_id()::text
  and storage.filename(name) in ('photo.webp', 'ranking.webp')
  and exists (
    select 1 from public.profiles p
    where p.id = public.current_profile_id() and not p.profile_photo_blocked
  )
);

drop policy if exists "profile_photos_update_own" on storage.objects;
create policy "profile_photos_update_own"
on storage.objects for update
to authenticated
using (
  bucket_id = 'profile-photos'
  and (storage.foldername(name))[1] = public.current_profile_id()::text
  and exists (
    select 1 from public.profiles p
    where p.id = public.current_profile_id() and not p.profile_photo_blocked
  )
)
with check (
  bucket_id = 'profile-photos'
  and (storage.foldername(name))[1] = public.current_profile_id()::text
  and storage.filename(name) in ('photo.webp', 'ranking.webp')
  and exists (
    select 1 from public.profiles p
    where p.id = public.current_profile_id() and not p.profile_photo_blocked
  )
);

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
  v_blocked boolean;
begin
  if v_profile_id is null then
    raise exception 'Not authenticated';
  end if;

  select profile_photo_blocked into v_blocked
  from public.profiles where id = v_profile_id;

  if coalesce(v_blocked, false) then
    raise exception '프로필 사진 업로드가 제한된 계정입니다';
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
    profile_id, photo_path, thumbnail_path, photo_width, photo_height,
    photo_bytes, thumbnail_bytes, is_visible, updated_at
  ) values (
    v_profile_id, p_photo_path, p_thumbnail_path, p_photo_width, p_photo_height,
    p_photo_bytes, p_thumbnail_bytes, true, now()
  )
  on conflict (profile_id) do update set
    photo_path = excluded.photo_path,
    thumbnail_path = excluded.thumbnail_path,
    photo_width = excluded.photo_width,
    photo_height = excluded.photo_height,
    photo_bytes = excluded.photo_bytes,
    thumbnail_bytes = excluded.thumbnail_bytes,
    updated_at = now();
end;
$$;

create or replace function public.get_admin_profile_photos(p_limit integer default 200)
returns table (
  profile_id uuid,
  display_name text,
  email text,
  photo_path text,
  thumbnail_path text,
  is_visible boolean,
  upload_blocked boolean,
  updated_at timestamptz
)
language sql
stable
security definer
set search_path = public
as $$
  select
    p.id,
    coalesce(nullif(p.display_name, ''), '익명'),
    p.email::text,
    pp.photo_path,
    pp.thumbnail_path,
    coalesce(pp.is_visible, false),
    p.profile_photo_blocked,
    pp.updated_at
  from public.profiles p
  left join public.public_profiles pp on pp.profile_id = p.id
  where public.is_admin()
    and (pp.profile_id is not null or p.profile_photo_blocked)
  order by pp.updated_at desc nulls last, p.created_at desc
  limit least(greatest(coalesce(p_limit, 200), 1), 500)
$$;

create or replace function public.admin_set_profile_photo_visibility(
  p_profile_id uuid,
  p_visible boolean
)
returns void
language plpgsql
security definer
set search_path = public
as $$
begin
  if not public.is_admin() then raise exception 'Admin only'; end if;

  update public.public_profiles
  set is_visible = p_visible
  where profile_id = p_profile_id;

  if not found then raise exception 'Profile photo not found'; end if;
end;
$$;

create or replace function public.admin_remove_profile_photo(
  p_profile_id uuid,
  p_block_upload boolean default true
)
returns table (photo_path text, thumbnail_path text)
language plpgsql
security definer
set search_path = public
as $$
declare
  v_photo_path text;
  v_thumbnail_path text;
begin
  if not public.is_admin() then raise exception 'Admin only'; end if;

  select pp.photo_path, pp.thumbnail_path
  into v_photo_path, v_thumbnail_path
  from public.public_profiles pp
  where pp.profile_id = p_profile_id;

  update public.profiles
  set profile_photo_blocked = p_block_upload
  where id = p_profile_id;

  -- Keep the paths until Storage deletion succeeds. This also removes the
  -- photo from ranking immediately if the following client request fails.
  update public.public_profiles
  set is_visible = false
  where profile_id = p_profile_id;

  return query select v_photo_path, v_thumbnail_path;
end;
$$;

create or replace function public.admin_finalize_profile_photo_removal(p_profile_id uuid)
returns void
language plpgsql
security definer
set search_path = public
as $$
begin
  if not public.is_admin() then raise exception 'Admin only'; end if;

  delete from public.public_profiles
  where profile_id = p_profile_id;
end;
$$;

create or replace function public.admin_unblock_profile_photo(p_profile_id uuid)
returns void
language plpgsql
security definer
set search_path = public
as $$
begin
  if not public.is_admin() then raise exception 'Admin only'; end if;
  update public.profiles set profile_photo_blocked = false where id = p_profile_id;
end;
$$;

-- Photo visibility never changes score ordering, score values, or draw eligibility.
create or replace function public.get_monthly_ranking(p_month_id text, p_limit integer default 50)
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
    p.id,
    coalesce(nullif(ms.nickname, ''), nullif(p.display_name, ''), '익명'),
    ms.score,
    pp.photo_path,
    pp.thumbnail_path,
    pp.updated_at
  from public.monthly_stats ms
  join public.profiles p on p.id = ms.profile_id
  left join public.public_profiles pp
    on pp.profile_id = p.id and pp.is_visible
  where ms.month_id = p_month_id
  order by ms.score desc, ms.updated_at desc, p.created_at asc
  limit least(greatest(coalesce(p_limit, 50), 1), 100)
$$;

create or replace function public.get_my_monthly_rank(p_month_id text)
returns table (
  profile_id uuid,
  display_name text,
  score integer,
  rank integer,
  participant_count integer,
  photo_path text,
  thumbnail_path text,
  photo_updated_at timestamptz
)
language plpgsql
stable
security definer
set search_path = public
as $$
declare
  v_profile_id uuid := public.current_profile_id();
begin
  if v_profile_id is null then raise exception 'Not authenticated'; end if;

  return query
  with ranked as (
    select
      ms.profile_id,
      coalesce(nullif(ms.nickname, ''), nullif(p.display_name, ''), '익명') as display_name,
      ms.score,
      row_number() over (order by ms.score desc, ms.updated_at desc, p.created_at asc)::integer as rank,
      count(*) over ()::integer as participant_count
    from public.monthly_stats ms
    join public.profiles p on p.id = ms.profile_id
    where ms.month_id = p_month_id
  )
  select
    p.id,
    coalesce(r.display_name, nullif(p.display_name, ''), '익명'),
    coalesce(r.score, 0),
    r.rank,
    coalesce(r.participant_count, (
      select count(*)::integer from public.monthly_stats ms where ms.month_id = p_month_id
    )),
    pp.photo_path,
    pp.thumbnail_path,
    pp.updated_at
  from public.profiles p
  left join ranked r on r.profile_id = p.id
  left join public.public_profiles pp
    on pp.profile_id = p.id and pp.is_visible
  where p.id = v_profile_id;
end;
$$;

revoke all on function public.get_admin_profile_photos(integer) from public, anon;
revoke all on function public.admin_set_profile_photo_visibility(uuid, boolean) from public, anon;
revoke all on function public.admin_remove_profile_photo(uuid, boolean) from public, anon;
revoke all on function public.admin_finalize_profile_photo_removal(uuid) from public, anon;
revoke all on function public.admin_unblock_profile_photo(uuid) from public, anon;
grant execute on function public.get_admin_profile_photos(integer) to authenticated;
grant execute on function public.admin_set_profile_photo_visibility(uuid, boolean) to authenticated;
grant execute on function public.admin_remove_profile_photo(uuid, boolean) to authenticated;
grant execute on function public.admin_finalize_profile_photo_removal(uuid) to authenticated;
grant execute on function public.admin_unblock_profile_photo(uuid) to authenticated;

notify pgrst, 'reload schema';
