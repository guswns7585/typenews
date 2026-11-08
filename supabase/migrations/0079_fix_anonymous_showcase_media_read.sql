begin;

-- Storage evaluates every permissive SELECT policy that applies to the caller.
-- Remove any older archive read policy left by a partially applied migration;
-- some of those called current_profile_id(), which anon intentionally cannot run.
do $$
declare
  v_policy text;
begin
  for v_policy in
    select policyname
    from pg_policies
    where schemaname = 'storage'
      and tablename = 'objects'
      and cmd = 'SELECT'
      and policyname like 'keyboard_showcase%'
  loop
    execute format('drop policy if exists %I on storage.objects', v_policy);
  end loop;
end;
$$;

-- This helper is safe for anon: auth.uid() is null and only published media
-- can pass. Signed-in owners and administrators can also read their drafts.
create or replace function public.can_read_showcase_media(p_name text)
returns boolean
language sql
stable
security definer
set search_path = public, storage
as $$
  select
    exists (
      select 1
      from public.keyboard_showcase_items i
      where i.status = 'published'
        and p_name in (i.image_path, i.thumbnail_path, i.audio_path)
    )
    or exists (
      select 1
      from public.profiles p
      where p.supabase_user_id = auth.uid()
        and (
          (storage.foldername(p_name))[1] = p.id::text
          or p.role = 'admin'
        )
    );
$$;

revoke all on function public.can_read_showcase_media(text) from public;
grant execute on function public.can_read_showcase_media(text) to anon, authenticated;

create policy "keyboard_showcase_media_read"
on storage.objects for select
to anon, authenticated
using (
  bucket_id = 'keyboard-showcase'
  and public.can_read_showcase_media(name)
);

notify pgrst, 'reload schema';

commit;
