-- 닉네임을 DB 차원에서 유일하게 만든다.
--
-- 왜 지금인가
--   당첨자 확인과 안내 메일이 닉네임 기준이다. 같은 닉네임이 둘이면 누구에게
--   경품을 보내야 하는지 사람이 판단할 수 없다. 2026-07-28 기준 869명 중
--   닉네임이 있는 850명에 중복이 0건이라, 인덱스를 거는 데 정리할 것이 없다.
--
-- 왜 애플리케이션 검사만으로는 부족한가
--   update_my_display_name()이 "있으면 거절"을 하지만 select 후 update라
--   두 사람이 동시에 같은 이름을 넣으면 둘 다 통과한다. 유니크 인덱스만이
--   이것을 막는다.
--
-- 이 마이그레이션이 인덱스만 만들지 않는 이유 ★
--   link_current_google_identity()가 프로필을 만들 때 display_name_lower를
--   구글 계정 이름에서 그대로 채운다. 인덱스만 걸면, 새 사용자의 구글 이름이
--   기존 닉네임과 겹치는 순간 insert가 실패하고 **그 사람은 로그인 자체가 막힌다.**
--   한국어 실명은 겹치기 쉬워서 실제로 일어난다. 그래서 겹칠 때 뒤에 숫자를
--   붙여 비켜가도록 같이 고친다. 어차피 최초 로그인 모달에서 직접 정하게 되므로
--   임시로 붙는 숫자는 오래 남지 않는다.

-- ---------------------------------------------------------------------------
-- 1. 빈 닉네임은 인덱스에서 제외한다
-- ---------------------------------------------------------------------------
-- 이관 과정에서 생긴 빈 껍데기 프로필 19건은 display_name이 ''이고
-- display_name_lower가 NULL이다. 부분 인덱스라 NULL은 몇 개든 허용된다.
-- 혹시 ''로 채워진 행이 있으면 NULL로 내려 인덱스 대상에서 뺀다.

update public.profiles
set display_name_lower = null
where display_name_lower = '';

-- ---------------------------------------------------------------------------
-- 2. 유니크 인덱스
-- ---------------------------------------------------------------------------
-- 중복이 하나라도 있으면 여기서 실패한다. 실패하면 인덱스를 만들지 말고
-- 중복부터 사람 손으로 정리할 것. 자동으로 이름을 바꾸면 당사자가 모른다.

create unique index if not exists profiles_display_name_lower_idx
  on public.profiles (display_name_lower)
  where display_name_lower is not null;

-- ---------------------------------------------------------------------------
-- 3. 비어 있는 이름을 고를 때 쓰는 헬퍼
-- ---------------------------------------------------------------------------
-- 자동 생성 이름 전용이다. 사용자가 직접 고른 이름은 조용히 바꾸지 않고 거절한다.
-- 닉네임 길이 규칙(1~12자)에 맞춰 잘라 쓴다.

create or replace function public.available_display_name(
  p_base text,
  p_exclude uuid default null
)
returns text
language plpgsql
security definer
set search_path = public
as $$
declare
  v_base text := btrim(coalesce(p_base, ''));
  v_candidate text;
  v_suffix text;
  i integer;
begin
  if v_base = '' then
    v_base := '익명';
  end if;
  v_base := left(v_base, 12);

  -- 원래 이름이 비어 있으면 그대로 쓴다
  if not exists (
    select 1 from public.profiles
    where display_name_lower = lower(v_base)
      and (p_exclude is null or id <> p_exclude)
  ) then
    return v_base;
  end if;

  -- 겹치면 뒤에 숫자를 붙인다. 12자를 넘지 않도록 앞을 잘라낸다.
  for i in 2..9999 loop
    v_suffix := i::text;
    v_candidate := left(v_base, greatest(1, 12 - char_length(v_suffix))) || v_suffix;
    if not exists (
      select 1 from public.profiles
      where display_name_lower = lower(v_candidate)
        and (p_exclude is null or id <> p_exclude)
    ) then
      return v_candidate;
    end if;
  end loop;

  -- 여기까지 왔다면 같은 접두어가 9,998개다. 현실적으로 오지 않지만
  -- 로그인을 막느니 임의 문자열을 준다.
  return left(v_base, 4) || substr(md5(random()::text), 1, 8);
end;
$$;

comment on function public.available_display_name(text, uuid) is
  '자동 생성 닉네임이 겹칠 때 숫자를 붙여 비어 있는 이름을 돌려준다. 사용자가 직접 고른 이름에는 쓰지 않는다.';

-- 이름 존재 여부를 캐물을 수 있는 함수라 클라이언트에는 열지 않는다.
revoke all on function public.available_display_name(text, uuid) from public;
revoke all on function public.available_display_name(text, uuid) from anon;
revoke all on function public.available_display_name(text, uuid) from authenticated;

-- ---------------------------------------------------------------------------
-- 4. 로그인 경로가 유니크 인덱스에 걸려 죽지 않게 한다
-- ---------------------------------------------------------------------------
-- 0004에서 바뀐 것은 display_name / display_name_lower를 정하는 부분뿐이다.
-- 나머지는 그대로 옮겼다.

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
  v_name text;
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
    -- 이미 이름이 있으면 건드리지 않는다. 자기 자신과는 겹치지 않으므로
    -- 이 경로에서 유니크 인덱스에 걸릴 일이 없다.
    if coalesce(nullif(btrim(v_profile.display_name), ''), '') <> '' then
      v_name := v_profile.display_name;
    else
      v_name := public.available_display_name(
        coalesce(v_display_name, v_email, '익명'),
        v_profile.id
      );
    end if;

    update public.profiles
    set
      supabase_user_id = v_user_id,
      google_sub = coalesce(v_profile.google_sub, v_google_sub),
      email = coalesce(v_profile.email, v_email),
      display_name = v_name,
      display_name_lower = lower(v_name)
    where id = v_profile.id
    returning * into v_profile;
  else
    v_name := public.available_display_name(coalesce(v_display_name, v_email, '익명'));

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
      v_name,
      lower(v_name)
    )
    returning * into v_profile;
  end if;

  return v_profile;
end;
$$;

grant execute on function public.link_current_google_identity() to authenticated;

-- ---------------------------------------------------------------------------
-- 5. 경합에서 진 쪽에게도 읽을 수 있는 메시지를 준다
-- ---------------------------------------------------------------------------
-- 0010과 같되, 인덱스가 거절했을 때의 23505를 잡아 같은 문구로 바꾼다.
-- 이것이 없으면 화면에 'duplicate key value violates unique constraint ...'가
-- 그대로 뜬다.

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

  begin
    update public.profiles
    set display_name = v_name, display_name_lower = lower(v_name), nickname_set = true
    where id = v_profile_id;
  exception
    when unique_violation then
      -- 위 검사와 update 사이에 다른 사람이 같은 이름을 가져간 경우
      raise exception '이미 사용 중인 닉네임입니다';
  end;

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
