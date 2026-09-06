-- 배경 테마 'lagoon'(틸 & 오렌지)을 환경설정 화이트리스트에 더한다.
--
-- 왜 SQL까지 고쳐야 하나
--   save_my_preferences는 **아는 값만 남기는** 방식이다. 목록에 없는 배경 id는
--   조용히 제거된다. 화면에만 추가하면 로그인 사용자가 고른 순간에는 바뀌지만,
--   저장에서 값이 빠져 다음 로그인에 원래대로 돌아간다. 오류도 안 뜬다.
--
-- 어디를 고치나
--   0037이 검증 본체를 save_my_preferences_without_presets로 이름만 바꾸고
--   프리셋 처리 래퍼를 save_my_preferences에 새로 두었다. 배경 화이트리스트는
--   **본체 쪽**에 있으므로 여기서는 본체를 갈아끼운다. 래퍼는 건드리지 않는다.
--
-- 0035의 본체와 같고, 'lagoon' 한 값만 늘었다.

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
      -- ★ 'lagoon' 추가. 화면 쪽 목록은 넷이다:
      --   globals.css(.bg-lagoon / body.bg-lagoon / 메시 셀렉터 목록),
      --   stores/use-ui-store.ts(BackgroundId),
      --   features/preferences/remote-preferences.ts(BACKGROUNDS),
      --   components/settings/background-options.tsx(라벨)
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
    'overlayMode', p_preferences -> 'overlayMode',
    'soundMode', p_preferences -> 'soundMode',
    'ignorePunctuation', p_preferences -> 'ignorePunctuation',
    'ignoreNumbers', p_preferences -> 'ignoreNumbers',
    'ignoreEnglish', p_preferences -> 'ignoreEnglish',
    'ignoreSymbols', p_preferences -> 'ignoreSymbols',
    'ignoreStreaming', p_preferences -> 'ignoreStreaming'
  ));

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

-- 본체는 래퍼(save_my_preferences)만 부른다. 브라우저에는 열지 않는다.
revoke all on function public.save_my_preferences_without_presets(jsonb)
  from public, anon, authenticated;

notify pgrst, 'reload schema';
