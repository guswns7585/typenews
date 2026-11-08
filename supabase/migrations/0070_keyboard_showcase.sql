-- Keyboard showcase: public collections with private drafts and tightly scoped media paths.
-- The browser optimizes images before upload; Postgres remains the source of truth for quotas.

create table if not exists public.keyboard_showcase_items (
  id uuid primary key default gen_random_uuid(),
  profile_id uuid not null references public.profiles(id) on delete cascade,
  title text not null,
  description text not null default '',
  build_info jsonb not null default '{}'::jsonb,
  keyxif_url text,
  keyxif_snapshot jsonb,
  image_path text,
  thumbnail_path text,
  image_width integer,
  image_height integer,
  image_bytes integer,
  thumbnail_bytes integer,
  audio_path text,
  audio_mime text,
  audio_bytes integer,
  audio_duration_ms integer,
  status text not null default 'draft',
  like_count integer not null default 0,
  bookmark_count integer not null default 0,
  published_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint keyboard_showcase_title_length check (char_length(btrim(title)) between 1 and 80),
  constraint keyboard_showcase_description_length check (char_length(description) <= 3000),
  constraint keyboard_showcase_build_object check (jsonb_typeof(build_info) = 'object'),
  constraint keyboard_showcase_keyxif_url_length check (keyxif_url is null or char_length(keyxif_url) <= 500),
  constraint keyboard_showcase_status check (status in ('draft', 'published', 'hidden')),
  constraint keyboard_showcase_like_count check (like_count >= 0),
  constraint keyboard_showcase_bookmark_count check (bookmark_count >= 0),
  constraint keyboard_showcase_image_dimensions check (
    (image_path is null and thumbnail_path is null and image_width is null and image_height is null
      and image_bytes is null and thumbnail_bytes is null)
    or
    (image_path is not null and thumbnail_path is not null
      and image_width between 1 and 1600 and image_height between 1 and 1600
      and image_bytes between 1 and 1572864 and thumbnail_bytes between 1 and 204800)
  ),
  constraint keyboard_showcase_image_paths check (
    image_path is null
    or (
      image_path = profile_id::text || '/' || id::text || '/image.webp'
      and thumbnail_path = profile_id::text || '/' || id::text || '/thumbnail.webp'
    )
  ),
  constraint keyboard_showcase_audio_metadata check (
    (audio_path is null and audio_mime is null and audio_bytes is null and audio_duration_ms is null)
    or
    (audio_path is not null and audio_mime is not null
      and audio_bytes between 1 and 1048576
      and audio_duration_ms between 250 and 45000)
  ),
  constraint keyboard_showcase_audio_path check (
    audio_path is null
    or audio_path ~ ('^' || profile_id::text || '/' || id::text || '/audio\.(webm|ogg|mp3|m4a)$')
  )
);

create index if not exists keyboard_showcase_feed_idx
  on public.keyboard_showcase_items (published_at desc, id desc)
  where status = 'published';
create index if not exists keyboard_showcase_owner_idx
  on public.keyboard_showcase_items (profile_id, created_at desc);

create table if not exists public.keyboard_showcase_likes (
  item_id uuid not null references public.keyboard_showcase_items(id) on delete cascade,
  profile_id uuid not null references public.profiles(id) on delete cascade,
  created_at timestamptz not null default now(),
  primary key (item_id, profile_id)
);

create table if not exists public.keyboard_showcase_bookmarks (
  item_id uuid not null references public.keyboard_showcase_items(id) on delete cascade,
  profile_id uuid not null references public.profiles(id) on delete cascade,
  created_at timestamptz not null default now(),
  primary key (item_id, profile_id)
);

create table if not exists public.keyboard_showcase_reports (
  id bigint generated always as identity primary key,
  item_id uuid not null references public.keyboard_showcase_items(id) on delete cascade,
  profile_id uuid not null references public.profiles(id) on delete cascade,
  reason text not null,
  details text not null default '',
  reviewed_at timestamptz,
  reviewed_by uuid references public.profiles(id) on delete set null,
  created_at timestamptz not null default now(),
  constraint keyboard_showcase_report_reason check (
    reason in ('inappropriate', 'copyright', 'spam', 'privacy', 'other')
  ),
  constraint keyboard_showcase_report_details check (char_length(details) <= 1000),
  unique (item_id, profile_id)
);

alter table public.keyboard_showcase_items enable row level security;
alter table public.keyboard_showcase_likes enable row level security;
alter table public.keyboard_showcase_bookmarks enable row level security;
alter table public.keyboard_showcase_reports enable row level security;

drop policy if exists "keyboard_showcase_items_read" on public.keyboard_showcase_items;
create policy "keyboard_showcase_items_read"
on public.keyboard_showcase_items for select
to anon, authenticated
using (
  status = 'published'
  or profile_id = public.current_profile_id()
  or public.is_admin()
);

drop policy if exists "keyboard_showcase_likes_read_own" on public.keyboard_showcase_likes;
create policy "keyboard_showcase_likes_read_own"
on public.keyboard_showcase_likes for select
to authenticated
using (profile_id = public.current_profile_id());

drop policy if exists "keyboard_showcase_bookmarks_read_own" on public.keyboard_showcase_bookmarks;
create policy "keyboard_showcase_bookmarks_read_own"
on public.keyboard_showcase_bookmarks for select
to authenticated
using (profile_id = public.current_profile_id());

drop policy if exists "keyboard_showcase_reports_read" on public.keyboard_showcase_reports;
create policy "keyboard_showcase_reports_read"
on public.keyboard_showcase_reports for select
to authenticated
using (profile_id = public.current_profile_id() or public.is_admin());

revoke all on public.keyboard_showcase_items from public, anon, authenticated;
revoke all on public.keyboard_showcase_likes from public, anon, authenticated;
revoke all on public.keyboard_showcase_bookmarks from public, anon, authenticated;
revoke all on public.keyboard_showcase_reports from public, anon, authenticated;
grant select on public.keyboard_showcase_items to anon, authenticated;
grant select on public.keyboard_showcase_likes, public.keyboard_showcase_bookmarks,
  public.keyboard_showcase_reports to authenticated;

create or replace function public.touch_keyboard_showcase_item()
returns trigger
language plpgsql
set search_path = public
as $$
begin
  new.updated_at := now();
  return new;
end;
$$;

drop trigger if exists keyboard_showcase_items_touch_updated_at on public.keyboard_showcase_items;
create trigger keyboard_showcase_items_touch_updated_at
before update on public.keyboard_showcase_items
for each row execute function public.touch_keyboard_showcase_item();

create or replace function public.refresh_keyboard_showcase_like_count()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  v_item_id uuid;
begin
  v_item_id := case when tg_op = 'DELETE' then old.item_id else new.item_id end;
  update public.keyboard_showcase_items
  set like_count = (select count(*) from public.keyboard_showcase_likes where item_id = v_item_id)
  where id = v_item_id;
  if tg_op = 'DELETE' then return old; end if;
  return new;
end;
$$;

drop trigger if exists keyboard_showcase_likes_refresh_count on public.keyboard_showcase_likes;
create trigger keyboard_showcase_likes_refresh_count
after insert or delete on public.keyboard_showcase_likes
for each row execute function public.refresh_keyboard_showcase_like_count();

create or replace function public.refresh_keyboard_showcase_bookmark_count()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  v_item_id uuid;
begin
  v_item_id := case when tg_op = 'DELETE' then old.item_id else new.item_id end;
  update public.keyboard_showcase_items
  set bookmark_count = (select count(*) from public.keyboard_showcase_bookmarks where item_id = v_item_id)
  where id = v_item_id;
  if tg_op = 'DELETE' then return old; end if;
  return new;
end;
$$;

drop trigger if exists keyboard_showcase_bookmarks_refresh_count on public.keyboard_showcase_bookmarks;
create trigger keyboard_showcase_bookmarks_refresh_count
after insert or delete on public.keyboard_showcase_bookmarks
for each row execute function public.refresh_keyboard_showcase_bookmark_count();

create or replace function public.validate_showcase_build_info(p_build_info jsonb)
returns jsonb
language plpgsql
immutable
set search_path = public
as $$
declare
  v_value jsonb := coalesce(p_build_info, '{}'::jsonb);
  v_key text;
  v_text text;
  v_allowed constant text[] := array[
    'case', 'pcb', 'plate', 'switches', 'keycaps', 'stabilizers',
    'mounting', 'foam', 'layout', 'weight', 'cable', 'other'
  ];
begin
  if jsonb_typeof(v_value) <> 'object' then
    raise exception 'Build information must be an object';
  end if;

  for v_key, v_text in select key, value from jsonb_each_text(v_value)
  loop
    if not (v_key = any(v_allowed)) then
      raise exception 'Unknown build field: %', v_key;
    end if;
    if char_length(v_text) > 240 then
      raise exception 'Build field is too long: %', v_key;
    end if;
  end loop;

  return v_value;
end;
$$;

create or replace function public.create_my_showcase_item(
  p_title text,
  p_description text default '',
  p_build_info jsonb default '{}'::jsonb,
  p_keyxif_url text default null,
  p_keyxif_snapshot jsonb default null
)
returns table (item_id uuid, profile_id uuid)
language plpgsql
security definer
set search_path = public
as $$
declare
  v_profile_id uuid := public.current_profile_id();
  v_item_id uuid;
  v_title text := btrim(coalesce(p_title, ''));
  v_description text := btrim(coalesce(p_description, ''));
  v_keyxif_url text := nullif(btrim(coalesce(p_keyxif_url, '')), '');
begin
  if v_profile_id is null then raise exception 'Not authenticated'; end if;
  if char_length(v_title) not between 1 and 80 then raise exception '키보드 이름은 1~80자여야 합니다'; end if;
  if char_length(v_description) > 3000 then raise exception '설명은 3,000자 이하여야 합니다'; end if;
  if char_length(coalesce(v_keyxif_url, '')) > 500 then raise exception 'KeyXIF 주소가 너무 깁니다'; end if;
  if p_keyxif_snapshot is not null and pg_column_size(p_keyxif_snapshot) > 65536 then
    raise exception 'KeyXIF snapshot is too large';
  end if;

  perform pg_advisory_xact_lock(hashtext(v_profile_id::text));
  if (select count(*) from public.keyboard_showcase_items i where i.profile_id = v_profile_id) >= 10 then
    raise exception '키보드는 계정당 최대 10대까지 등록할 수 있습니다';
  end if;

  insert into public.keyboard_showcase_items (
    profile_id, title, description, build_info, keyxif_url, keyxif_snapshot
  ) values (
    v_profile_id, v_title, v_description,
    public.validate_showcase_build_info(p_build_info), v_keyxif_url, p_keyxif_snapshot
  ) returning id into v_item_id;

  return query select v_item_id, v_profile_id;
end;
$$;

create or replace function public.update_my_showcase_item(
  p_item_id uuid,
  p_title text,
  p_description text default '',
  p_build_info jsonb default '{}'::jsonb,
  p_keyxif_url text default null,
  p_keyxif_snapshot jsonb default null
)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  v_profile_id uuid := public.current_profile_id();
  v_title text := btrim(coalesce(p_title, ''));
  v_description text := btrim(coalesce(p_description, ''));
  v_keyxif_url text := nullif(btrim(coalesce(p_keyxif_url, '')), '');
begin
  if v_profile_id is null then raise exception 'Not authenticated'; end if;
  if char_length(v_title) not between 1 and 80 then raise exception '키보드 이름은 1~80자여야 합니다'; end if;
  if char_length(v_description) > 3000 then raise exception '설명은 3,000자 이하여야 합니다'; end if;
  if char_length(coalesce(v_keyxif_url, '')) > 500 then raise exception 'KeyXIF 주소가 너무 깁니다'; end if;
  if p_keyxif_snapshot is not null and pg_column_size(p_keyxif_snapshot) > 65536 then
    raise exception 'KeyXIF snapshot is too large';
  end if;

  update public.keyboard_showcase_items
  set title = v_title,
      description = v_description,
      build_info = public.validate_showcase_build_info(p_build_info),
      keyxif_url = v_keyxif_url,
      keyxif_snapshot = p_keyxif_snapshot
  where id = p_item_id and profile_id = v_profile_id;

  if not found then raise exception 'Showcase item not found'; end if;
end;
$$;

create or replace function public.save_my_showcase_media(
  p_item_id uuid,
  p_image_path text,
  p_thumbnail_path text,
  p_image_width integer,
  p_image_height integer,
  p_image_bytes integer,
  p_thumbnail_bytes integer,
  p_audio_path text default null,
  p_audio_mime text default null,
  p_audio_bytes integer default null,
  p_audio_duration_ms integer default null
)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  v_profile_id uuid := public.current_profile_id();
  v_base text;
begin
  if v_profile_id is null then raise exception 'Not authenticated'; end if;
  v_base := v_profile_id::text || '/' || p_item_id::text || '/';

  if p_image_path <> v_base || 'image.webp'
     or p_thumbnail_path <> v_base || 'thumbnail.webp' then
    raise exception 'Invalid showcase image path';
  end if;
  if p_image_width not between 1 and 1600 or p_image_height not between 1 and 1600
     or p_image_bytes not between 1 and 1572864
     or p_thumbnail_bytes not between 1 and 204800 then
    raise exception 'Invalid showcase image dimensions or size';
  end if;

  if p_audio_path is not null then
    if p_audio_path !~ ('^' || v_base || 'audio\.(webm|ogg|mp3|m4a)$')
       or p_audio_mime not in ('audio/webm', 'audio/ogg', 'audio/mpeg', 'audio/mp4', 'audio/x-m4a')
       or p_audio_bytes not between 1 and 1048576
       or p_audio_duration_ms not between 250 and 45000 then
      raise exception 'Invalid showcase audio';
    end if;
  elsif p_audio_mime is not null or p_audio_bytes is not null or p_audio_duration_ms is not null then
    raise exception 'Incomplete showcase audio metadata';
  end if;

  update public.keyboard_showcase_items
  set image_path = p_image_path,
      thumbnail_path = p_thumbnail_path,
      image_width = p_image_width,
      image_height = p_image_height,
      image_bytes = p_image_bytes,
      thumbnail_bytes = p_thumbnail_bytes,
      audio_path = p_audio_path,
      audio_mime = p_audio_mime,
      audio_bytes = p_audio_bytes,
      audio_duration_ms = p_audio_duration_ms
  where id = p_item_id and profile_id = v_profile_id;

  if not found then raise exception 'Showcase item not found'; end if;
end;
$$;

create or replace function public.publish_my_showcase_item(p_item_id uuid)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  v_profile_id uuid := public.current_profile_id();
begin
  if v_profile_id is null then raise exception 'Not authenticated'; end if;

  update public.keyboard_showcase_items
  set status = 'published', published_at = coalesce(published_at, now())
  where id = p_item_id
    and profile_id = v_profile_id
    and image_path is not null
    and status <> 'hidden';

  if not found then raise exception '사진을 등록한 키보드만 공개할 수 있습니다'; end if;
end;
$$;

create or replace function public.set_my_showcase_published(
  p_item_id uuid,
  p_published boolean
)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  v_profile_id uuid := public.current_profile_id();
begin
  if v_profile_id is null then raise exception 'Not authenticated'; end if;

  update public.keyboard_showcase_items
  set status = case when p_published then 'published' else 'draft' end,
      published_at = case when p_published then coalesce(published_at, now()) else published_at end
  where id = p_item_id
    and profile_id = v_profile_id
    and status <> 'hidden'
    and (not p_published or image_path is not null);

  if not found then
    raise exception '숨김 처리된 항목이거나 공개할 사진이 없습니다';
  end if;
end;
$$;

create or replace function public.delete_my_showcase_item(p_item_id uuid)
returns table (path text)
language plpgsql
security definer
set search_path = public
as $$
declare
  v_profile_id uuid := public.current_profile_id();
  v_item public.keyboard_showcase_items;
begin
  if v_profile_id is null then raise exception 'Not authenticated'; end if;

  delete from public.keyboard_showcase_items
  where id = p_item_id and profile_id = v_profile_id
  returning * into v_item;
  if not found then raise exception 'Showcase item not found'; end if;

  return query
  select u.path
  from unnest(array[v_item.image_path, v_item.thumbnail_path, v_item.audio_path]) as u(path)
  where u.path is not null;
end;
$$;

create or replace function public.get_showcase_feed(
  p_limit integer default 24,
  p_offset integer default 0,
  p_profile_id uuid default null
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
  select
    i.id,
    i.profile_id,
    coalesce(nullif(p.display_name, ''), '익명'),
    pp.thumbnail_path,
    pp.updated_at,
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
  from public.keyboard_showcase_items i
  join public.profiles p on p.id = i.profile_id
  left join public.public_profiles pp on pp.profile_id = i.profile_id
  where i.status = 'published'
    and (p_profile_id is null or i.profile_id = p_profile_id)
  order by i.published_at desc, i.id desc
  limit least(greatest(coalesce(p_limit, 24), 1), 48)
  offset greatest(coalesce(p_offset, 0), 0)
$$;

create or replace function public.get_showcase_item(p_item_id uuid)
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
  published_at timestamptz
)
language sql
stable
security definer
set search_path = public
as $$
  select
    i.id,
    i.profile_id,
    coalesce(nullif(p.display_name, ''), '익명'),
    pp.thumbnail_path,
    pp.updated_at,
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
    i.published_at
  from public.keyboard_showcase_items i
  join public.profiles p on p.id = i.profile_id
  left join public.public_profiles pp on pp.profile_id = i.profile_id
  where i.id = p_item_id and i.status = 'published'
$$;

create or replace function public.get_my_showcase_items()
returns setof public.keyboard_showcase_items
language sql
stable
security definer
set search_path = public
as $$
  select i.* from public.keyboard_showcase_items i
  where i.profile_id = public.current_profile_id()
  order by i.created_at desc
$$;

create or replace function public.toggle_showcase_like(p_item_id uuid)
returns table (active boolean, count integer)
language plpgsql
security definer
set search_path = public
as $$
declare
  v_profile_id uuid := public.current_profile_id();
begin
  if v_profile_id is null then raise exception 'Not authenticated'; end if;
  if not exists (select 1 from public.keyboard_showcase_items where id = p_item_id and status = 'published') then
    raise exception 'Showcase item not found';
  end if;

  if exists (select 1 from public.keyboard_showcase_likes where item_id = p_item_id and profile_id = v_profile_id) then
    delete from public.keyboard_showcase_likes where item_id = p_item_id and profile_id = v_profile_id;
    active := false;
  else
    insert into public.keyboard_showcase_likes (item_id, profile_id) values (p_item_id, v_profile_id);
    active := true;
  end if;
  select i.like_count into count from public.keyboard_showcase_items i where i.id = p_item_id;
  return next;
end;
$$;

create or replace function public.toggle_showcase_bookmark(p_item_id uuid)
returns table (active boolean, count integer)
language plpgsql
security definer
set search_path = public
as $$
declare
  v_profile_id uuid := public.current_profile_id();
begin
  if v_profile_id is null then raise exception 'Not authenticated'; end if;
  if not exists (select 1 from public.keyboard_showcase_items where id = p_item_id and status = 'published') then
    raise exception 'Showcase item not found';
  end if;

  if exists (select 1 from public.keyboard_showcase_bookmarks where item_id = p_item_id and profile_id = v_profile_id) then
    delete from public.keyboard_showcase_bookmarks where item_id = p_item_id and profile_id = v_profile_id;
    active := false;
  else
    insert into public.keyboard_showcase_bookmarks (item_id, profile_id) values (p_item_id, v_profile_id);
    active := true;
  end if;
  select i.bookmark_count into count from public.keyboard_showcase_items i where i.id = p_item_id;
  return next;
end;
$$;

create or replace function public.report_showcase_item(
  p_item_id uuid,
  p_reason text,
  p_details text default ''
)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  v_profile_id uuid := public.current_profile_id();
  v_reason text := lower(btrim(coalesce(p_reason, '')));
  v_details text := btrim(coalesce(p_details, ''));
begin
  if v_profile_id is null then raise exception 'Not authenticated'; end if;
  if v_reason not in ('inappropriate', 'copyright', 'spam', 'privacy', 'other') then
    raise exception 'Invalid report reason';
  end if;
  if char_length(v_details) > 1000 then raise exception '신고 내용은 1,000자 이하여야 합니다'; end if;
  if not exists (select 1 from public.keyboard_showcase_items where id = p_item_id and status = 'published') then
    raise exception 'Showcase item not found';
  end if;

  insert into public.keyboard_showcase_reports (item_id, profile_id, reason, details)
  values (p_item_id, v_profile_id, v_reason, v_details)
  on conflict (item_id, profile_id) do update
  set reason = excluded.reason, details = excluded.details, created_at = now(), reviewed_at = null, reviewed_by = null;
end;
$$;

create or replace function public.admin_set_showcase_hidden(
  p_item_id uuid,
  p_hidden boolean
)
returns void
language plpgsql
security definer
set search_path = public
as $$
begin
  if not public.is_admin() then raise exception 'Admin only'; end if;
  update public.keyboard_showcase_items
  set status = case when p_hidden then 'hidden' else 'published' end,
      published_at = case when p_hidden then published_at else coalesce(published_at, now()) end
  where id = p_item_id;
  if not found then raise exception 'Showcase item not found'; end if;
end;
$$;

create or replace function public.get_admin_showcase_reports(
  p_reviewed boolean default false,
  p_limit integer default 200
)
returns table (
  report_id bigint,
  item_id uuid,
  item_title text,
  image_path text,
  thumbnail_path text,
  item_status text,
  owner_name text,
  reporter_name text,
  reason text,
  details text,
  created_at timestamptz,
  reviewed_at timestamptz
)
language sql
stable
security definer
set search_path = public
as $$
  select
    r.id,
    i.id,
    i.title,
    i.image_path,
    i.thumbnail_path,
    i.status,
    coalesce(nullif(owner_profile.display_name, ''), '익명'),
    coalesce(nullif(reporter_profile.display_name, ''), '익명'),
    r.reason,
    r.details,
    r.created_at,
    r.reviewed_at
  from public.keyboard_showcase_reports r
  join public.keyboard_showcase_items i on i.id = r.item_id
  join public.profiles owner_profile on owner_profile.id = i.profile_id
  join public.profiles reporter_profile on reporter_profile.id = r.profile_id
  where public.is_admin()
    and ((p_reviewed and r.reviewed_at is not null) or (not p_reviewed and r.reviewed_at is null))
  order by r.created_at desc
  limit least(greatest(coalesce(p_limit, 200), 1), 500)
$$;

create or replace function public.admin_review_showcase_report(
  p_report_id bigint,
  p_action text
)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  v_profile_id uuid := public.current_profile_id();
  v_item_id uuid;
  v_action text := lower(btrim(coalesce(p_action, '')));
begin
  if not public.is_admin() or v_profile_id is null then raise exception 'Admin only'; end if;
  if v_action not in ('dismiss', 'hide', 'restore') then raise exception 'Invalid report action'; end if;

  select r.item_id into v_item_id
  from public.keyboard_showcase_reports r
  where r.id = p_report_id;
  if not found then raise exception 'Showcase report not found'; end if;

  if v_action = 'hide' then
    update public.keyboard_showcase_items set status = 'hidden' where id = v_item_id;
  elsif v_action = 'restore' then
    update public.keyboard_showcase_items
    set status = 'published', published_at = coalesce(published_at, now())
    where id = v_item_id and image_path is not null;
  end if;

  update public.keyboard_showcase_reports
  set reviewed_at = now(), reviewed_by = v_profile_id
  where id = p_report_id;
end;
$$;

-- Private bucket: published objects are readable through storage RLS and signed URLs;
-- draft objects remain visible only to their owner and administrators.
insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values (
  'keyboard-showcase',
  'keyboard-showcase',
  false,
  1572864,
  array['image/webp', 'audio/webm', 'audio/ogg', 'audio/mpeg', 'audio/mp4', 'audio/x-m4a']::text[]
)
on conflict (id) do update
set public = excluded.public,
    file_size_limit = excluded.file_size_limit,
    allowed_mime_types = excluded.allowed_mime_types;

drop policy if exists "keyboard_showcase_media_read" on storage.objects;
create policy "keyboard_showcase_media_read"
on storage.objects for select
to anon, authenticated
using (
  bucket_id = 'keyboard-showcase'
  and (
    (storage.foldername(name))[1] = public.current_profile_id()::text
    or public.is_admin()
    or exists (
      select 1 from public.keyboard_showcase_items i
      where i.status = 'published'
        and name in (i.image_path, i.thumbnail_path, i.audio_path)
    )
  )
);

drop policy if exists "keyboard_showcase_media_insert" on storage.objects;
create policy "keyboard_showcase_media_insert"
on storage.objects for insert
to authenticated
with check (
  bucket_id = 'keyboard-showcase'
  and (storage.foldername(name))[1] = public.current_profile_id()::text
  and exists (
    select 1 from public.keyboard_showcase_items i
    where i.id::text = (storage.foldername(name))[2]
      and i.profile_id = public.current_profile_id()
  )
  and (
    (storage.filename(name) = 'image.webp' and coalesce((metadata ->> 'size')::bigint, 0) between 1 and 1572864)
    or (storage.filename(name) = 'thumbnail.webp' and coalesce((metadata ->> 'size')::bigint, 0) between 1 and 204800)
    or (storage.filename(name) ~ '^audio\.(webm|ogg|mp3|m4a)$' and coalesce((metadata ->> 'size')::bigint, 0) between 1 and 1048576)
  )
);

drop policy if exists "keyboard_showcase_media_update" on storage.objects;
create policy "keyboard_showcase_media_update"
on storage.objects for update
to authenticated
using (
  bucket_id = 'keyboard-showcase'
  and (storage.foldername(name))[1] = public.current_profile_id()::text
)
with check (
  bucket_id = 'keyboard-showcase'
  and (storage.foldername(name))[1] = public.current_profile_id()::text
  and (
    (storage.filename(name) = 'image.webp' and coalesce((metadata ->> 'size')::bigint, 0) between 1 and 1572864)
    or (storage.filename(name) = 'thumbnail.webp' and coalesce((metadata ->> 'size')::bigint, 0) between 1 and 204800)
    or (storage.filename(name) ~ '^audio\.(webm|ogg|mp3|m4a)$' and coalesce((metadata ->> 'size')::bigint, 0) between 1 and 1048576)
  )
);

drop policy if exists "keyboard_showcase_media_delete" on storage.objects;
create policy "keyboard_showcase_media_delete"
on storage.objects for delete
to authenticated
using (
  bucket_id = 'keyboard-showcase'
  and (storage.foldername(name))[1] = public.current_profile_id()::text
);

revoke all on function public.validate_showcase_build_info(jsonb) from public, anon, authenticated;
revoke all on function public.create_my_showcase_item(text, text, jsonb, text, jsonb) from public, anon;
revoke all on function public.update_my_showcase_item(uuid, text, text, jsonb, text, jsonb) from public, anon;
revoke all on function public.save_my_showcase_media(uuid, text, text, integer, integer, integer, integer, text, text, integer, integer) from public, anon;
revoke all on function public.publish_my_showcase_item(uuid) from public, anon;
revoke all on function public.set_my_showcase_published(uuid, boolean) from public, anon;
revoke all on function public.delete_my_showcase_item(uuid) from public, anon;
revoke all on function public.get_showcase_feed(integer, integer, uuid) from public;
revoke all on function public.get_showcase_item(uuid) from public;
revoke all on function public.get_my_showcase_items() from public, anon;
revoke all on function public.toggle_showcase_like(uuid) from public, anon;
revoke all on function public.toggle_showcase_bookmark(uuid) from public, anon;
revoke all on function public.report_showcase_item(uuid, text, text) from public, anon;
revoke all on function public.admin_set_showcase_hidden(uuid, boolean) from public, anon;
revoke all on function public.get_admin_showcase_reports(boolean, integer) from public, anon;
revoke all on function public.admin_review_showcase_report(bigint, text) from public, anon;

grant execute on function public.create_my_showcase_item(text, text, jsonb, text, jsonb) to authenticated;
grant execute on function public.update_my_showcase_item(uuid, text, text, jsonb, text, jsonb) to authenticated;
grant execute on function public.save_my_showcase_media(uuid, text, text, integer, integer, integer, integer, text, text, integer, integer) to authenticated;
grant execute on function public.publish_my_showcase_item(uuid) to authenticated;
grant execute on function public.set_my_showcase_published(uuid, boolean) to authenticated;
grant execute on function public.delete_my_showcase_item(uuid) to authenticated;
grant execute on function public.get_showcase_feed(integer, integer, uuid) to anon, authenticated;
grant execute on function public.get_showcase_item(uuid) to anon, authenticated;
grant execute on function public.get_my_showcase_items() to authenticated;
grant execute on function public.toggle_showcase_like(uuid) to authenticated;
grant execute on function public.toggle_showcase_bookmark(uuid) to authenticated;
grant execute on function public.report_showcase_item(uuid, text, text) to authenticated;
grant execute on function public.admin_set_showcase_hidden(uuid, boolean) to authenticated;
grant execute on function public.get_admin_showcase_reports(boolean, integer) to authenticated;
grant execute on function public.admin_review_showcase_report(bigint, text) to authenticated;

comment on table public.keyboard_showcase_items is
  '사용자 키보드 전시장. 계정당 최대 10대 제한은 create_my_showcase_item에서 강제한다.';
comment on column public.keyboard_showcase_items.keyxif_snapshot is
  '향후 KeyXIF 가져오기를 위한 원본 스냅샷. 파서 확정 전에는 null로 둔다.';

notify pgrst, 'reload schema';
