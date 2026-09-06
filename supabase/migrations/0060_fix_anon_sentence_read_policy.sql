-- Keep public reading public without requiring anon to execute admin helpers.
--
-- 0058 correctly removed anon EXECUTE on is_admin(), but the old public read
-- policies used "enabled or public.is_admin()". Anon users only need enabled
-- rows, so split the policies instead of reopening is_admin() to anon.

drop policy if exists "sentences_read" on public.sentences;
drop policy if exists "sentences_read_enabled" on public.sentences;
drop policy if exists "sentences_read_admin" on public.sentences;

create policy "sentences_read_enabled" on public.sentences
for select to anon, authenticated
using (enabled);

create policy "sentences_read_admin" on public.sentences
for select to authenticated
using (public.is_admin());

drop policy if exists "event_prizes_read" on public.event_prizes;
drop policy if exists "event_prizes_read_enabled" on public.event_prizes;
drop policy if exists "event_prizes_read_admin" on public.event_prizes;

create policy "event_prizes_read_enabled" on public.event_prizes
for select to anon, authenticated
using (enabled);

create policy "event_prizes_read_admin" on public.event_prizes
for select to authenticated
using (public.is_admin());

grant select on public.sentences to anon, authenticated;
grant select on public.event_prizes to anon, authenticated;

notify pgrst, 'reload schema';
