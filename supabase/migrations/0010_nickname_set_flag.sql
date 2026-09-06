-- 닉네임을 사용자가 직접 정했는지 표시한다.
--
-- link_current_google_identity()는 프로필을 만들 때 display_name을 Google 계정
-- 이름으로 채운다. 그래서 "이름이 있다"는 사실만으로는 사용자가 직접 고른 것인지
-- 구글에서 딸려온 것인지 구분할 수 없다.
-- 최초 로그인 시 닉네임 설정 모달을 띄우려면 이 구분이 필요하다.

alter table public.profiles
  add column if not exists nickname_set boolean not null default false;

comment on column public.profiles.nickname_set is
  '사용자가 닉네임을 직접 정했으면 true. false면 Google 계정 이름이 그대로 들어 있다.';

-- Firestore에서 이관된 기존 사용자는 원래 서비스에서 닉네임을 정한 사람들이다.
-- 다시 물어보면 번거로우므로 이미 정한 것으로 본다.
update public.profiles
set nickname_set = true
where firebase_uid is not null
  and coalesce(btrim(display_name), '') <> '';

-- 닉네임을 바꾸면 "직접 정했다"로 올린다.
create or replace function public.update_my_display_name(p_display_name text)
returns text
language plpgsql
security definer
set search_path = public
as $$
declare
  v_profile_id uuid;
  v_name text := btrim(coalesce(p_display_name, ''));
begin
  if auth.uid() is null then
    raise exception 'Not authenticated';
  end if;

  if char_length(v_name) < 1 or char_length(v_name) > 12 then
    raise exception '닉네임은 1~12자여야 합니다';
  end if;

  /* 보이지 않는 문자로 남을 사칭하거나 줄을 깨뜨리지 못하게 막는다.
     소스에 실제 제어문자를 적으면 문자열이 깨지므로 코드포인트로 조립한다. */
  if v_name ~ ('[' || chr(8203) || chr(8204) || chr(8205) || chr(8206) || chr(8207)
                   || chr(160) || chr(65279) || ']')
     or v_name ~ '[[:cntrl:]]'
  then
    raise exception '사용할 수 없는 문자가 있습니다';
  end if;

  select public.current_profile_id() into v_profile_id;
  if v_profile_id is null then
    raise exception 'Profile not found';
  end if;

  if exists (
    select 1 from public.profiles
    where display_name_lower = lower(v_name) and id <> v_profile_id
  ) then
    raise exception '이미 사용 중인 닉네임입니다';
  end if;

  update public.profiles
  set display_name = v_name, display_name_lower = lower(v_name), nickname_set = true
  where id = v_profile_id;

  -- 랭킹은 monthly_stats.nickname을 우선 쓰므로 이번 달 표시도 맞춰준다.
  update public.monthly_stats
  set nickname = v_name
  where profile_id = v_profile_id
    and month_id = to_char(now() at time zone 'Asia/Seoul', 'YYYYMM');

  return v_name;
end;
$$;

grant execute on function public.update_my_display_name(text) to authenticated;

notify pgrst, 'reload schema';
