-- 뉴스 카테고리를 여러 개 고를 수 있게 되면서 환경설정에 배열이 하나 늘었다.
--
-- save_my_preferences는 아는 키만 통과시킨다(0005). 화이트리스트에 넣지 않으면
-- 저장이 조용히 누락되고, 사용자는 다시 로그인할 때마다 선택이 풀린다.
--
-- 기존 newsSector(단수, 문자열)도 그대로 둔다. 아직 배포되지 않은 클라이언트가
-- 그 키를 쓰고 있고, 새 클라이언트도 첫 로그인 때 옛 값을 읽어 배열로 승격한다.

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
  v_sectors jsonb;
  v_font_size integer;
  c_sectors constant text[] := array[
    'all','main','politics','economy','society','global','culture','entertainment','sports'
  ];
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

  /* 뉴스 카테고리 목록. 아는 값만 남기고, 하나도 안 남으면 통째로 버린다.
     개수 상한을 두는 이유: 여기 담긴 값이 그대로 프로필에 저장되므로
     길이를 제한하지 않으면 임의의 데이터를 쌓을 수 있다. */
  v_sectors := p_preferences -> 'newsSectors';
  if v_sectors is null
     or jsonb_typeof(v_sectors) <> 'array'
     or jsonb_array_length(v_sectors) > 9
  then
    v_sectors := null;
  else
    select case when count(*) = 0 then null else jsonb_agg(distinct value) end
    into v_sectors
    from jsonb_array_elements_text(v_sectors) as value
    where value = any (c_sectors);
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
      where value = any (c_sectors)
    ),
    'newsSectors', v_sectors,
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

grant execute on function public.save_my_preferences(jsonb) to authenticated;

notify pgrst, 'reload schema';
