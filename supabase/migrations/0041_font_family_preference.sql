-- 사이트 전체 글꼴 선택을 profiles.preferences에 저장한다.
--
-- 0037의 save_my_preferences 래퍼는 커스텀 배경 프리셋을 담당하고,
-- save_my_preferences_without_presets가 나머지 키를 화이트리스트로 거른다.
-- 기존 본체를 한 단계 안쪽으로 옮기고 fontFamily만 검증해 다시 합친다.
-- 구버전 클라이언트가 이 키 없이 저장해도 기존 글꼴 선택은 보존한다.

do $$
begin
  if to_regprocedure('public.save_my_preferences_without_font_family(jsonb)') is null then
    alter function public.save_my_preferences_without_presets(jsonb)
      rename to save_my_preferences_without_font_family;
  end if;
end
$$;

create or replace function public.save_my_preferences_without_presets(p_preferences jsonb)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_profile_id uuid;
  v_clean jsonb;
  v_font_family text;
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

  -- 키가 없는 구버전 요청이면 현재 값을 유지한다.
  if not (p_preferences ? 'fontFamily') then
    select preferences ->> 'fontFamily'
    into v_font_family
    from public.profiles
    where id = v_profile_id;
  else
    v_font_family := p_preferences ->> 'fontFamily';
  end if;

  if v_font_family not in (
    'pretendard-jp',
    'gowun-batang',
    'noto-sans-kr',
    'noto-serif-kr',
    'nanum-gothic',
    'nanum-myeongjo'
  ) then
    v_font_family := null;
  end if;

  v_clean := public.save_my_preferences_without_font_family(p_preferences);

  if v_font_family is not null then
    v_clean := jsonb_set(v_clean, '{fontFamily}', to_jsonb(v_font_family), true);
  end if;

  update public.profiles
  set preferences = v_clean
  where id = v_profile_id;

  return v_clean;
end;
$$;

-- 두 내부 함수는 최상위 save_my_preferences 래퍼만 호출한다.
revoke all on function public.save_my_preferences_without_font_family(jsonb)
  from public, anon, authenticated;
revoke all on function public.save_my_preferences_without_presets(jsonb)
  from public, anon, authenticated;

notify pgrst, 'reload schema';
