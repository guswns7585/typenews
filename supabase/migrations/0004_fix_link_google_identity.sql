-- link_current_google_identity() 수정.
--
-- 문제 1: coalesce(i.identity_data ->> 'sub', i.id)
--   identity_data ->> 'sub'는 text, auth.identities.id는 uuid다.
--   COALESCE는 인자 타입이 섞이면 실행 시점이 아니라 파싱 시점에 실패하므로
--   이 함수는 호출될 때마다 예외를 던졌다. 로그인은 되지만 프로필 연결이 항상 실패한다.
--   Google sub는 auth.identities.provider_id에 text로 들어 있으므로 그것을 쓴다.
--
-- 문제 2: UPDATE ... SET google_sub = coalesce(public.profiles.google_sub, ...)
--   갱신 대상 테이블을 스키마까지 붙여 참조하고 있었다. 이미 v_profile에 이전 값을
--   담아뒀으므로 그대로 쓰는 편이 명확하고 안전하다.

create or replace function public.link_current_google_identity()
returns public.profiles
language plpgsql
security definer
set search_path = public, auth
as $$
declare
  v_user_id uuid := auth.uid();
  v_email text;
  v_google_sub text;
  v_display_name text;
  v_profile public.profiles;
begin
  if v_user_id is null then
    raise exception 'Not authenticated';
  end if;

  select
    u.email,
    coalesce(
      u.raw_user_meta_data ->> 'full_name',
      u.raw_user_meta_data ->> 'name',
      u.raw_user_meta_data ->> 'nickname'
    )
  into v_email, v_display_name
  from auth.users u
  where u.id = v_user_id;

  -- provider_id가 Google의 sub 값이다. 전부 text라 타입이 섞이지 않는다.
  select coalesce(i.identity_data ->> 'sub', i.provider_id, i.id::text)
  into v_google_sub
  from auth.identities i
  where i.user_id = v_user_id
    and i.provider = 'google'
  order by i.created_at asc
  limit 1;

  select *
  into v_profile
  from public.profiles p
  where p.supabase_user_id = v_user_id
     or (v_google_sub is not null and p.google_sub = v_google_sub)
     or (v_email is not null and p.email = v_email)
  order by
    case when p.supabase_user_id = v_user_id then 0 else 1 end,
    p.created_at asc
  limit 1;

  if found then
    update public.profiles
    set
      supabase_user_id = v_user_id,
      google_sub = coalesce(v_profile.google_sub, v_google_sub),
      email = coalesce(v_profile.email, v_email),
      display_name = coalesce(nullif(v_profile.display_name, ''), v_display_name, v_email, '익명'),
      display_name_lower = lower(coalesce(nullif(v_profile.display_name, ''), v_display_name, v_email, '익명'))
    where id = v_profile.id
    returning * into v_profile;
  else
    insert into public.profiles (
      supabase_user_id,
      google_sub,
      email,
      display_name,
      display_name_lower
    )
    values (
      v_user_id,
      v_google_sub,
      v_email,
      coalesce(v_display_name, v_email, '익명'),
      lower(coalesce(v_display_name, v_email, '익명'))
    )
    returning * into v_profile;
  end if;

  return v_profile;
end;
$$;

grant execute on function public.link_current_google_identity() to authenticated;

notify pgrst, 'reload schema';
