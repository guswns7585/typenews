begin;

-- The original table constraints only accepted image.webp / audio.mp3 style
-- names. Keep those rows valid while allowing immutable replacement objects.
alter table public.keyboard_showcase_items
  drop constraint if exists keyboard_showcase_image_paths;
alter table public.keyboard_showcase_items
  add constraint keyboard_showcase_image_paths check (
    image_path is null
    or (
      image_path = profile_id::text || '/' || id::text || '/image.webp'
      and thumbnail_path = profile_id::text || '/' || id::text || '/thumbnail.webp'
    )
    or (
      image_path ~ ('^' || profile_id::text || '/' || id::text || '/image-[0-9a-f-]{36}\.webp$')
      and thumbnail_path = replace(image_path, '/image-', '/thumbnail-')
    )
  );

alter table public.keyboard_showcase_items
  drop constraint if exists keyboard_showcase_audio_path;
alter table public.keyboard_showcase_items
  add constraint keyboard_showcase_audio_path check (
    audio_path is null
    or audio_path ~ (
      '^' || profile_id::text || '/' || id::text
      || '/audio(-[0-9a-f-]{36})?\.(webm|ogg|mp3|m4a)$'
    )
  );

-- Accept both legacy fixed object names and the immutable versioned names used
-- by the current editor. Image and thumbnail versions must always match.
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

  if not (
    (
      p_image_path = v_base || 'image.webp'
      and p_thumbnail_path = v_base || 'thumbnail.webp'
    )
    or (
      p_image_path ~ ('^' || v_base || 'image-[0-9a-f-]{36}\.webp$')
      and p_thumbnail_path = replace(p_image_path, '/image-', '/thumbnail-')
    )
  ) then
    raise exception 'Invalid showcase image path';
  end if;

  if p_image_width not between 1 and 1600 or p_image_height not between 1 and 1600
     or p_image_bytes not between 1 and 1572864
     or p_thumbnail_bytes not between 1 and 204800 then
    raise exception 'Invalid showcase image dimensions or size';
  end if;

  if p_audio_path is not null then
    if p_audio_path !~ ('^' || v_base || 'audio(-[0-9a-f-]{36})?\.(webm|ogg|mp3|m4a)$')
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

revoke all on function public.save_my_showcase_media(uuid, text, text, integer, integer, integer, integer, text, text, integer, integer) from public, anon;
grant execute on function public.save_my_showcase_media(uuid, text, text, integer, integer, integer, integer, text, text, integer, integer) to authenticated;

-- Keep anonymous reads away from current_profile_id(). Security hardening
-- intentionally denies anon permission to that helper, but the old combined
-- policy evaluated it while creating signed URLs for otherwise-public media.
drop policy if exists "keyboard_showcase_media_read" on storage.objects;
drop policy if exists "keyboard_showcase_published_media_read" on storage.objects;
drop policy if exists "keyboard_showcase_owner_media_read" on storage.objects;

create policy "keyboard_showcase_published_media_read"
on storage.objects for select
to anon, authenticated
using (
  bucket_id = 'keyboard-showcase'
  and exists (
    select 1
    from public.keyboard_showcase_items i
    where i.status = 'published'
      and name in (i.image_path, i.thumbnail_path, i.audio_path)
  )
);

create policy "keyboard_showcase_owner_media_read"
on storage.objects for select
to authenticated
using (
  bucket_id = 'keyboard-showcase'
  and (
    (storage.foldername(name))[1] = public.current_profile_id()::text
    or public.is_admin()
  )
);

-- Replacements use immutable, versioned object names. This preserves the
-- published object until the metadata transaction succeeds and makes a failed
-- upload safe to remove without deleting the previous version.
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
    storage.filename(name) in ('image.webp', 'thumbnail.webp')
    or storage.filename(name) ~ '^audio\.(webm|ogg|mp3|m4a)$'
    or storage.filename(name) ~ '^image-[0-9a-f-]{36}\.webp$'
    or storage.filename(name) ~ '^thumbnail-[0-9a-f-]{36}\.webp$'
    or storage.filename(name) ~ '^audio-[0-9a-f-]{36}\.(webm|ogg|mp3|m4a)$'
  )
);

drop policy if exists "keyboard_showcase_media_update" on storage.objects;
create policy "keyboard_showcase_media_update"
on storage.objects for update
to authenticated
using (
  bucket_id = 'keyboard-showcase'
  and (storage.foldername(name))[1] = public.current_profile_id()::text
  and exists (
    select 1 from public.keyboard_showcase_items i
    where i.id::text = (storage.foldername(name))[2]
      and i.profile_id = public.current_profile_id()
  )
)
with check (
  bucket_id = 'keyboard-showcase'
  and (storage.foldername(name))[1] = public.current_profile_id()::text
  and exists (
    select 1 from public.keyboard_showcase_items i
    where i.id::text = (storage.foldername(name))[2]
      and i.profile_id = public.current_profile_id()
  )
  and (
    storage.filename(name) in ('image.webp', 'thumbnail.webp')
    or storage.filename(name) ~ '^audio\.(webm|ogg|mp3|m4a)$'
    or storage.filename(name) ~ '^image-[0-9a-f-]{36}\.webp$'
    or storage.filename(name) ~ '^thumbnail-[0-9a-f-]{36}\.webp$'
    or storage.filename(name) ~ '^audio-[0-9a-f-]{36}\.(webm|ogg|mp3|m4a)$'
  )
);

notify pgrst, 'reload schema';

commit;
