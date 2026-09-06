-- 물리 키 사용량을 원문·입력 순서 없이 합계로만 저장한다.
-- 세션 스냅샷으로 중복 전송을 제거하고, 최근 90일과 평생 누적만 보존한다.

create table if not exists public.typing_key_usage_sessions (
  profile_id uuid not null references public.profiles(id) on delete cascade,
  session_key uuid not null,
  day date not null,
  key_counts jsonb not null default '{}'::jsonb,
  updated_at timestamptz not null default now(),
  primary key (profile_id, session_key, day)
);

create index if not exists typing_key_usage_sessions_updated_idx
  on public.typing_key_usage_sessions (updated_at);

create table if not exists public.user_daily_key_usage (
  profile_id uuid not null references public.profiles(id) on delete cascade,
  day date not null,
  key_counts jsonb not null default '{}'::jsonb,
  updated_at timestamptz not null default now(),
  primary key (profile_id, day)
);

create index if not exists user_daily_key_usage_day_idx
  on public.user_daily_key_usage (day desc);

create table if not exists public.user_key_usage_totals (
  profile_id uuid primary key references public.profiles(id) on delete cascade,
  key_counts jsonb not null default '{}'::jsonb,
  updated_at timestamptz not null default now()
);

alter table public.typing_key_usage_sessions enable row level security;
alter table public.user_daily_key_usage enable row level security;
alter table public.user_key_usage_totals enable row level security;

revoke all on public.typing_key_usage_sessions, public.user_daily_key_usage,
  public.user_key_usage_totals from anon, authenticated;

create or replace function public.add_key_counts(p_base jsonb, p_delta jsonb)
returns jsonb
language sql
immutable
set search_path = public
as $$
  select coalesce(jsonb_object_agg(key_code, to_jsonb(key_total)), '{}'::jsonb)
  from (
    select key_code, sum(key_value)::bigint as key_total
    from (
      select e.key as key_code, (e.value #>> '{}')::bigint as key_value
      from jsonb_each(coalesce(p_base, '{}'::jsonb)) e
      union all
      select e.key, (e.value #>> '{}')::bigint
      from jsonb_each(coalesce(p_delta, '{}'::jsonb)) e
    ) values_by_key
    group by key_code
  ) totals;
$$;

revoke all on function public.add_key_counts(jsonb, jsonb) from public, anon, authenticated;

create or replace function public.report_typing_analytics_v2(
  p_session_key uuid,
  p_buckets jsonb default '[]'::jsonb,
  p_weaknesses jsonb default '[]'::jsonb,
  p_key_usage jsonb default '[]'::jsonb
)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  v_profile_id uuid := public.current_profile_id();
  v_item jsonb;
  v_day date;
  v_counts jsonb;
  v_previous jsonb;
  v_delta jsonb;
begin
  perform public.report_typing_analytics(p_session_key, p_buckets, p_weaknesses);

  if auth.uid() is null or v_profile_id is null then
    raise exception 'authentication required';
  end if;
  if p_session_key is null or jsonb_typeof(coalesce(p_key_usage, '[]'::jsonb)) <> 'array'
     or jsonb_array_length(coalesce(p_key_usage, '[]'::jsonb)) > 3 then
    raise exception 'invalid key usage payload';
  end if;

  for v_item in select value from jsonb_array_elements(coalesce(p_key_usage, '[]'::jsonb))
  loop
    begin
      v_day := (v_item ->> 'day')::date;
    exception when others then
      raise exception 'invalid key usage day';
    end;
    v_counts := coalesce(v_item -> 'counts', '{}'::jsonb);

    if v_day < (now() at time zone 'Asia/Seoul')::date - 2
       or v_day > (now() at time zone 'Asia/Seoul')::date + 1
       or jsonb_typeof(v_counts) <> 'object'
       or (select count(*) from jsonb_object_keys(v_counts)) > 64
       or exists (
         select 1
         from jsonb_each(v_counts) e
         where e.key !~ '^(Key[A-Z]|Digit[0-9]|Space|Backspace|Delete|Enter|Tab|CapsLock|ShiftLeft|ShiftRight|Comma|Period|Slash|Semicolon|Quote|BracketLeft|BracketRight|Backslash|Minus|Equal|Backquote)$'
            or (e.value #>> '{}') !~ '^[0-9]{1,12}$'
       ) then
      raise exception 'invalid key usage counts';
    end if;

    insert into public.typing_key_usage_sessions (profile_id, session_key, day, key_counts)
    values (v_profile_id, p_session_key, v_day, '{}'::jsonb)
    on conflict (profile_id, session_key, day) do nothing;

    select key_counts into v_previous
    from public.typing_key_usage_sessions
    where profile_id = v_profile_id and session_key = p_session_key and day = v_day
    for update;

    select coalesce(jsonb_object_agg(key_code, to_jsonb(key_delta)), '{}'::jsonb)
    into v_delta
    from (
      select e.key as key_code,
        greatest((e.value #>> '{}')::bigint - coalesce((v_previous ->> e.key)::bigint, 0), 0) as key_delta
      from jsonb_each(v_counts) e
    ) deltas
    where key_delta > 0;

    update public.typing_key_usage_sessions
    set key_counts = v_counts, updated_at = now()
    where profile_id = v_profile_id and session_key = p_session_key and day = v_day;

    if v_delta <> '{}'::jsonb then
      insert into public.user_daily_key_usage as d (profile_id, day, key_counts)
      values (v_profile_id, v_day, v_delta)
      on conflict (profile_id, day) do update
      set key_counts = public.add_key_counts(d.key_counts, excluded.key_counts),
          updated_at = now();

      insert into public.user_key_usage_totals as t (profile_id, key_counts)
      values (v_profile_id, v_delta)
      on conflict (profile_id) do update
      set key_counts = public.add_key_counts(t.key_counts, excluded.key_counts),
          updated_at = now();
    end if;
  end loop;

  delete from public.typing_key_usage_sessions
  where profile_id = v_profile_id and updated_at < now() - interval '3 days';
  delete from public.user_daily_key_usage
  where profile_id = v_profile_id
    and day < (now() at time zone 'Asia/Seoul')::date - 89;
end;
$$;

create or replace function public.get_my_key_usage(p_days integer default 30)
returns jsonb
language plpgsql
stable
security definer
set search_path = public
as $$
declare
  v_profile_id uuid := public.current_profile_id();
  v_days integer := least(greatest(coalesce(p_days, 30), 7), 90);
  v_cutoff date := (now() at time zone 'Asia/Seoul')::date - v_days + 1;
  v_recent jsonb;
  v_total jsonb;
begin
  if auth.uid() is null or v_profile_id is null then return null; end if;

  select coalesce(jsonb_object_agg(key_code, to_jsonb(key_total)), '{}'::jsonb)
  into v_recent
  from (
    select e.key as key_code, sum((e.value #>> '{}')::bigint)::bigint as key_total
    from public.user_daily_key_usage d
    cross join lateral jsonb_each(d.key_counts) e
    where d.profile_id = v_profile_id and d.day >= v_cutoff
    group by e.key
  ) totals;

  select coalesce(key_counts, '{}'::jsonb) into v_total
  from public.user_key_usage_totals where profile_id = v_profile_id;

  return jsonb_build_object(
    'days', v_days,
    'recent', coalesce(v_recent, '{}'::jsonb),
    'total', coalesce(v_total, '{}'::jsonb)
  );
end;
$$;

revoke all on function public.report_typing_analytics_v2(uuid, jsonb, jsonb, jsonb) from public, anon;
revoke all on function public.get_my_key_usage(integer) from public, anon;
grant execute on function public.report_typing_analytics_v2(uuid, jsonb, jsonb, jsonb) to authenticated;
grant execute on function public.get_my_key_usage(integer) to authenticated;

notify pgrst, 'reload schema';
