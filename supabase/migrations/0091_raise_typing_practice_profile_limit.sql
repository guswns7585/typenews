begin;

create or replace function public.create_my_typing_practice_profile(p_name text)
returns uuid
language plpgsql
security definer
set search_path = public
as $$
declare
  v_owner uuid := public.current_profile_id();
  v_name text := btrim(coalesce(p_name, ''));
  v_id uuid;
begin
  if auth.uid() is null or v_owner is null then
    raise exception 'authentication required';
  end if;
  if char_length(v_name) not between 1 and 20 then
    raise exception 'invalid profile name';
  end if;

  -- Serialize operations that consume an active profile slot for this account.
  perform pg_advisory_xact_lock(hashtextextended('typing-practice:' || v_owner::text, 0));
  insert into public.typing_practice_profiles (owner_profile_id, name, is_default)
  select v_owner, '기본', true
  where not exists (
    select 1 from public.typing_practice_profiles
    where owner_profile_id = v_owner and is_default
  )
  on conflict do nothing;

  if (select count(*) from public.typing_practice_profiles
      where owner_profile_id = v_owner and not archived) >= 20 then
    raise exception 'practice profile limit reached';
  end if;

  insert into public.typing_practice_profiles (owner_profile_id, name)
  values (v_owner, v_name)
  returning id into v_id;
  return v_id;
end;
$$;

create or replace function public.restore_my_typing_practice_profile(p_profile_id uuid)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  v_owner uuid := public.current_profile_id();
begin
  if auth.uid() is null or v_owner is null then
    raise exception 'authentication required';
  end if;

  perform pg_advisory_xact_lock(hashtextextended('typing-practice:' || v_owner::text, 0));
  if (select count(*) from public.typing_practice_profiles
      where owner_profile_id = v_owner and not archived) >= 20 then
    raise exception 'practice profile limit reached';
  end if;

  update public.typing_practice_profiles
  set archived = false, updated_at = now()
  where id = p_profile_id and owner_profile_id = v_owner and archived;
  if not found then
    raise exception 'practice profile not found';
  end if;
end;
$$;

notify pgrst, 'reload schema';
commit;
