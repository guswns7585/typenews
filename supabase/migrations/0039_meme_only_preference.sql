-- 밈 모드(단문 안의 밈 전용 필터)를 환경설정에 저장한다.
--
-- 밈은 별도 TypingMode가 아니다. 문장을 고르는 필터이고 기록은 그대로 'short'로
-- 남는다. 모드를 하나 늘리면 typing_results·typing_mode_counts의 CHECK 제약과
-- record_typing_result까지 손대야 하는데, 8월 이벤트 중에는 점수 적립 경로를
-- 건드리지 않기로 했다.
--
-- 그래서 mode='short'와 함께 memeOnly 플래그를 따로 저장해야 복원된다.
-- 화이트리스트에 없으면 저장에서 조용히 제거되어, 고른 순간에는 밈이 나오지만
-- 다음 로그인에는 일반 단문으로 돌아간다.
--
-- 0038과 같은 본체이고 'memeOnly' 한 키만 늘었다. (0038의 'lagoon'도 그대로 있다)

create or replace function public.save_my_preferences_without_presets(p_preferences jsonb)
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

  if jsonb_typeof(p_preferences -> 'fontSize') = 'number' then
    v_font_size := round((p_preferences ->> 'fontSize')::numeric);
    if v_font_size < 12 or v_font_size > 80 then
      v_font_size := null;
    end if;
  end if;

  v_clean := jsonb_strip_nulls(jsonb_build_object(
    'background', (
      select value from (values (p_preferences ->> 'background')) as t(value)
      where value in ('default','sky','insta','sunset','forest','oceon','twilight',
                      'lagoon','custom-solid','custom-gradient')
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
    'newsTypingTarget', (
      select value from (values (p_preferences ->> 'newsTypingTarget')) as t(value)
      where value in ('title','body')
    ),
    'newsBodyAmount', (
      select value from (values (p_preferences ->> 'newsBodyAmount')) as t(value)
      where value in ('small','medium','large')
    ),
    'fontSize', v_font_size,
    -- ★ 추가. 아래 boolean 필터 목록에도 같이 넣어야 한다.
    'memeOnly', p_preferences -> 'memeOnly',
    'overlayMode', p_preferences -> 'overlayMode',
    'soundMode', p_preferences -> 'soundMode',
    'ignorePunctuation', p_preferences -> 'ignorePunctuation',
    'ignoreNumbers', p_preferences -> 'ignoreNumbers',
    'ignoreEnglish', p_preferences -> 'ignoreEnglish',
    'ignoreSymbols', p_preferences -> 'ignoreSymbols',
    'ignoreStreaming', p_preferences -> 'ignoreStreaming'
  ));

  /* boolean으로 온 것만 남긴다. 위에서 jsonb를 그대로 넣은 키들은 숫자나 문자열이
     들어와도 통과하므로 여기서 한 번 더 거른다. */
  v_clean := (
    select coalesce(jsonb_object_agg(key, value), '{}'::jsonb)
    from jsonb_each(v_clean)
    where key not in ('memeOnly','overlayMode','soundMode','ignorePunctuation','ignoreNumbers',
                      'ignoreEnglish','ignoreSymbols','ignoreStreaming')
       or jsonb_typeof(value) = 'boolean'
  );

  update public.profiles
  set preferences = v_clean
  where id = v_profile_id;

  return v_clean;
end;
$$;

revoke all on function public.save_my_preferences_without_presets(jsonb)
  from public, anon, authenticated;

notify pgrst, 'reload schema';
