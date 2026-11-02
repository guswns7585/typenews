begin;

-- Storage may populate metadata.size after the INSERT policy is evaluated.
-- Keep the global bucket cap here; exact per-media sizes are validated by
-- save_my_showcase_media before an item can be published.
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
  )
);

notify pgrst, 'reload schema';

commit;
