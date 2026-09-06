-- 커스텀 배경의 글자·버튼 색상을 환경설정 동기화 대상에 추가한다.
--
-- 원본 타입뉴스처럼 단색 배경과 그라데이션 배경이 각자의 글자·버튼 색을 갖는다.
-- 단색은 배경/글자/버튼 3색, 그라데이션은 배경 3색 + 글자/버튼으로 5색이다.
-- 이 색은 로고(인라인 SVG)에도 --svg-* 변수를 통해 반영된다.
--
-- 0005의 save_my_preferences는 아는 키만 통과시키므로, 새 키를 화이트리스트에
-- 넣지 않으면 저장 자체가 조용히 누락된다.

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
    'gradientTextColor', (
      select value from (values (p_preferences ->> 'gradientTextColor')) as t(value)
      where value ~ '^#[0-9a-fA-F]{6}$'
    ),
    'gradientButtonBg', (
      select value from (values (p_preferences ->> 'gradientButtonBg')) as t(value)
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
