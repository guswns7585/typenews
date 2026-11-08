begin;

create or replace function public.validate_showcase_build_info(p_build_info jsonb)
returns jsonb
language plpgsql
immutable
set search_path = public
as $$
declare
  v_value jsonb := coalesce(p_build_info, '{}'::jsonb);
  v_key text;
  v_text text;
  v_allowed constant text[] := array[
    'buildDate', 'buildStatus',
    'case', 'pcb', 'plate', 'switches', 'keycaps', 'stabilizers',
    'switchMods', 'stabilizerMods',
    'mounting', 'foam', 'layout', 'weight', 'cable',
    'firmware', 'mods', 'typingFeel', 'soundProfile', 'other'
  ];
begin
  if jsonb_typeof(v_value) <> 'object' then
    raise exception 'Build information must be an object';
  end if;

  for v_key, v_text in select key, value from jsonb_each_text(v_value)
  loop
    if not (v_key = any(v_allowed)) then
      raise exception 'Unknown build field: %', v_key;
    end if;
    if char_length(v_text) > 240 then
      raise exception 'Build field is too long: %', v_key;
    end if;
  end loop;

  return v_value;
end;
$$;

revoke all on function public.validate_showcase_build_info(jsonb) from public, anon, authenticated;

notify pgrst, 'reload schema';

commit;
