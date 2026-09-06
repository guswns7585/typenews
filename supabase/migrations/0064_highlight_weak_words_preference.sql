-- 취약 단어 형광펜 표시 설정을 기기 간 동기화한다.
-- 기존 save_my_preferences 검증 체인은 그대로 보존하고 boolean 한 키만 감싼다.

do $$
begin
  if to_regprocedure('public.save_my_preferences_without_weak_word_highlight(jsonb)') is null then
    alter function public.save_my_preferences(jsonb)
      rename to save_my_preferences_without_weak_word_highlight;
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
  v_highlight boolean;
begin
  if auth.uid() is null then raise exception 'Not authenticated'; end if;
  v_profile_id := public.current_profile_id();
  if v_profile_id is null then raise exception 'Profile not found'; end if;
  if p_preferences is null or jsonb_typeof(p_preferences) <> 'object' then
    raise exception 'preferences must be a JSON object';
  end if;

  if p_preferences ? 'highlightWeakWords'
     and jsonb_typeof(p_preferences -> 'highlightWeakWords') = 'boolean' then
    v_highlight := (p_preferences ->> 'highlightWeakWords')::boolean;
  else
    select coalesce((preferences ->> 'highlightWeakWords')::boolean, true)
    into v_highlight from public.profiles where id = v_profile_id;
  end if;

  v_clean := public.save_my_preferences_without_weak_word_highlight(p_preferences);
  v_clean := jsonb_set(v_clean, '{highlightWeakWords}', to_jsonb(v_highlight), true);

  update public.profiles set preferences = v_clean where id = v_profile_id;
  return v_clean;
end;
$$;

revoke all on function public.save_my_preferences_without_weak_word_highlight(jsonb)
  from public, anon, authenticated;
revoke all on function public.save_my_preferences(jsonb) from public, anon;
grant execute on function public.save_my_preferences(jsonb) to authenticated;

notify pgrst, 'reload schema';
