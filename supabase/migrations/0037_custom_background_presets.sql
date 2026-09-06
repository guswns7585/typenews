-- 커스텀 배경 프리셋을 로그인 사용자 preferences에 저장한다.
--
-- 기존 save_my_preferences는 아는 키만 남기므로 그대로 두면 프리셋이 제거된다.
-- 기존 검증 함수는 내부 함수로 보존하고, 프리셋만 추가 검증하는 래퍼를 둔다.
-- 구버전 클라이언트가 이 키를 보내지 않으면 DB에 있던 프리셋을 그대로 유지한다.

do $$
begin
  if to_regprocedure('public.save_my_preferences_without_presets(jsonb)') is null then
    alter function public.save_my_preferences(jsonb)
      rename to save_my_preferences_without_presets;
  end if;
end;
$$;

create or replace function public.save_my_preferences(p_preferences jsonb)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_profile_id uuid;
  v_clean jsonb;
  v_raw_presets jsonb;
  v_presets jsonb;
begin
  if auth.uid() is null then
    raise exception 'Not authenticated';
  end if;

  select public.current_profile_id() into v_profile_id;
  if v_profile_id is null then
    raise exception 'Profile not found';
  end if;

  -- 키가 없는 구버전 요청이면 기존 값을 먼저 확보한다. 내부 함수가 preferences를
  -- 갱신하면서 새 키를 제거하기 전에 읽어야 한다.
  if not (p_preferences ? 'customBackgroundPresets') then
    select preferences -> 'customBackgroundPresets'
    into v_presets
    from public.profiles
    where id = v_profile_id;
  else
    v_raw_presets := p_preferences -> 'customBackgroundPresets';

    if jsonb_typeof(v_raw_presets) = 'array'
       and jsonb_array_length(v_raw_presets) <= 12
    then
      select coalesce(jsonb_agg(cleaned.preset order by cleaned.ordinality), '[]'::jsonb)
      into v_presets
      from (
        select
          source.ordinality,
          jsonb_build_object(
            'id', source.item ->> 'id',
            'name', btrim(source.item ->> 'name'),
            'kind', source.item ->> 'kind',
            'colors', source.item -> 'colors',
            'textColor', source.item ->> 'textColor',
            'buttonColor', source.item ->> 'buttonColor'
          ) as preset
        from jsonb_array_elements(v_raw_presets) with ordinality as source(item, ordinality)
        where jsonb_typeof(source.item) = 'object'
          and source.item ->> 'id' ~ '^[A-Za-z0-9_-]{1,64}$'
          and char_length(btrim(coalesce(source.item ->> 'name', ''))) between 1 and 20
          and source.item ->> 'kind' in ('solid', 'gradient')
          and jsonb_typeof(source.item -> 'colors') = 'array'
          and jsonb_array_length(
            case
              when jsonb_typeof(source.item -> 'colors') = 'array'
              then source.item -> 'colors'
              else '[]'::jsonb
            end
          ) = 3
          and not exists (
            select 1
            from jsonb_array_elements_text(
              case
                when jsonb_typeof(source.item -> 'colors') = 'array'
                then source.item -> 'colors'
                else '[]'::jsonb
              end
            ) as color(value)
            where color.value !~ '^#[0-9a-fA-F]{6}$'
          )
          and source.item ->> 'textColor' ~ '^#[0-9a-fA-F]{6}$'
          and source.item ->> 'buttonColor' ~ '^#[0-9a-fA-F]{6}$'
          and octet_length(source.item::text) <= 512
      ) as cleaned;
    else
      -- 잘못된 요청으로 기존 프리셋을 날리지 않는다.
      select preferences -> 'customBackgroundPresets'
      into v_presets
      from public.profiles
      where id = v_profile_id;
    end if;
  end if;

  v_clean := public.save_my_preferences_without_presets(p_preferences);

  if v_presets is not null then
    v_clean := v_clean || jsonb_build_object('customBackgroundPresets', v_presets);
    update public.profiles
    set preferences = v_clean
    where id = v_profile_id;
  end if;

  return v_clean;
end;
$$;

revoke all on function public.save_my_preferences_without_presets(jsonb)
  from public, anon, authenticated;
revoke all on function public.save_my_preferences(jsonb) from public, anon;
grant execute on function public.save_my_preferences(jsonb) to authenticated;

notify pgrst, 'reload schema';
