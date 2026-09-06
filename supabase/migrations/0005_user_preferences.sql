-- 사용자 환경설정 서버 동기화.
--
-- profiles.preferences 컬럼은 0001에서 만들어졌지만 아무도 쓰지 않고 있었다.
-- 원본 타입뉴스는 배경·언어·모드·뉴스 섹터·커스텀 색상을 Firestore에 저장했다.
--
-- 왜 테이블 UPDATE 대신 RPC인가:
--   profiles_update_own_preferences 정책이 있긴 하지만 authenticated에는 SELECT만
--   grant되어 있어 실제로는 동작하지 않는다. 그리고 그 정책을 살리면 사용자가
--   role이나 max_cpm, total_typing_count까지 고칠 수 있게 된다.
--   preferences 한 컬럼만 건드리는 security definer 함수가 안전하다.

-- 열려 있으면 위험한 정책이라 명시적으로 제거한다. 쓰기는 아래 RPC로만 한다.
drop policy if exists "profiles_update_own_preferences" on public.profiles;

create or replace function public.save_my_preferences(p_preferences jsonb)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_profile_id uuid;
  v_clean jsonb;
  v_gradient jsonb;
  v_font_size integer;
begin
  if auth.uid() is null then
    raise exception 'Not authenticated';
  end if;

  select public.current_profile_id() into v_profile_id;
  if v_profile_id is null then
    raise exception 'Profile not found';
  end if;

  if p_preferences is null or jsonb_typeof(p_preferences) <> 'object' then
    raise exception 'preferences must be a JSON object';
  end if;

  -- 그라데이션 색상은 #rrggbb 3개짜리 배열일 때만 받는다.
  v_gradient := p_preferences -> 'gradientColors';
  if v_gradient is null
     or jsonb_typeof(v_gradient) <> 'array'
     or jsonb_array_length(v_gradient) <> 3
     or exists (
       select 1
       from jsonb_array_elements_text(v_gradient) as color
       where color !~ '^#[0-9a-fA-F]{6}$'
     )
  then
    v_gradient := null;
  end if;

  -- 숫자가 아닌 값이 오면 캐스팅에서 함수가 통째로 실패하므로 타입부터 확인한다.
  if jsonb_typeof(p_preferences -> 'fontSize') = 'number' then
    v_font_size := round((p_preferences ->> 'fontSize')::numeric);
    if v_font_size < 12 or v_font_size > 80 then
      v_font_size := null;
    end if;
  end if;

  -- 아는 키만 추려서 저장한다. 클라이언트가 임의 데이터를 프로필에 쌓지 못하게.
  v_clean := jsonb_strip_nulls(jsonb_build_object(
    'background', (
      select value from (values (p_preferences ->> 'background')) as t(value)
      where value in ('default','sky','insta','sunset','forest','oceon','twilight',
                      'custom-solid','custom-gradient')
    ),
    'solidColor', (
      select value from (values (p_preferences ->> 'solidColor')) as t(value)
      where value ~ '^#[0-9a-fA-F]{6}$'
    ),
    'gradientColors', v_gradient,
    'customTextColor', (
      select value from (values (p_preferences ->> 'customTextColor')) as t(value)
      where value ~ '^#[0-9a-fA-F]{6}$'
    ),
    'customButtonBg', (
      select value from (values (p_preferences ->> 'customButtonBg')) as t(value)
      where value ~ '^#[0-9a-fA-F]{6}$'
    ),
    'language', (
      select value from (values (p_preferences ->> 'language')) as t(value)
      where value in ('kor','eng')
    ),
    'mode', (
      select value from (values (p_preferences ->> 'mode')) as t(value)
      where value in ('short','long','word','news')
    ),
    'newsSector', (
      select value from (values (p_preferences ->> 'newsSector')) as t(value)
      where value in ('all','main','politics','economy','society','global',
                      'culture','entertainment','sports')
    ),
    'fontSize', v_font_size,
    'overlayMode', p_preferences -> 'overlayMode',
    'soundMode', p_preferences -> 'soundMode',
    'ignorePunctuation', p_preferences -> 'ignorePunctuation',
    'ignoreNumbers', p_preferences -> 'ignoreNumbers',
    'ignoreEnglish', p_preferences -> 'ignoreEnglish',
    'ignoreSymbols', p_preferences -> 'ignoreSymbols',
    'ignoreStreaming', p_preferences -> 'ignoreStreaming'
  ));

  -- 불리언 자리에 다른 타입이 오면 버린다.
  v_clean := (
    select coalesce(jsonb_object_agg(key, value), '{}'::jsonb)
    from jsonb_each(v_clean)
    where key not in ('overlayMode','soundMode','ignorePunctuation','ignoreNumbers',
                      'ignoreEnglish','ignoreSymbols','ignoreStreaming')
       or jsonb_typeof(value) = 'boolean'
  );

  update public.profiles
  set preferences = v_clean
  where id = v_profile_id;

  return v_clean;
end;
$$;

comment on function public.save_my_preferences(jsonb) is
  '본인 프로필의 preferences만 갱신한다. 아는 키만 통과시키고 값도 검증한다.';

-- 읽기는 별도 함수 없이 profiles select로 한다.
-- profiles_select_own 정책이 본인 행만 노출하므로 그것으로 충분하다.

grant execute on function public.save_my_preferences(jsonb) to authenticated;

notify pgrst, 'reload schema';
