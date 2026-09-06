-- TypeNews product analytics foundation.
--
-- 원시 keydown, 입력 문자열, 오타 문자열은 저장하지 않는다. 브라우저가 집계한
-- 누적 스냅샷만 세션·날짜·모드 단위로 덮어쓰고, 오래된 행은 일/월/누적으로 접는다.
-- 점수·랭킹·추첨 함수(record_typing_result)는 이 마이그레이션과 독립적이다.

create table if not exists public.typing_analytics_buckets (
  profile_id uuid not null references public.profiles(id) on delete cascade,
  session_key uuid not null,
  day date not null,
  mode text not null check (mode in ('short', 'long', 'word', 'news')),
  language text not null check (language in ('kor', 'eng')),
  category text not null default '',
  device_class text not null check (device_class in ('desktop', 'tablet', 'mobile')),
  activity_hour smallint not null check (activity_hour between 0 and 23),
  starts integer not null default 0 check (starts >= 0),
  completions integer not null default 0 check (completions >= 0),
  passed integer not null default 0 check (passed >= 0),
  typed_chars bigint not null default 0 check (typed_chars >= 0),
  active_ms bigint not null default 0 check (active_ms >= 0),
  cpm_sum bigint not null default 0 check (cpm_sum >= 0),
  accuracy_sum bigint not null default 0 check (accuracy_sum >= 0),
  backspaces integer not null default 0 check (backspaces >= 0),
  mistakes integer not null default 0 check (mistakes >= 0),
  long_pauses integer not null default 0 check (long_pauses >= 0),
  news_completed integer not null default 0 check (news_completed >= 0),
  updated_at timestamptz not null default now(),
  primary key (
    profile_id, session_key, day, mode, language,
    category, device_class, activity_hour
  )
);

comment on table public.typing_analytics_buckets is
  '클라이언트 누적 스냅샷. 원문 입력값 없이 세션·날짜·모드별 집계만 잠시 보관한다.';

create index if not exists typing_analytics_buckets_day_idx
  on public.typing_analytics_buckets (day);

create table if not exists public.typing_weakness_buckets (
  profile_id uuid not null references public.profiles(id) on delete cascade,
  session_key uuid not null,
  day date not null,
  sentence_id bigint not null references public.sentences(id) on delete cascade,
  char_index integer not null check (char_index between 0 and 4000),
  mistake_count integer not null default 0 check (mistake_count >= 0),
  correction_count integer not null default 0 check (correction_count >= 0),
  updated_at timestamptz not null default now(),
  primary key (profile_id, session_key, day, sentence_id, char_index)
);

create index if not exists typing_weakness_buckets_day_idx
  on public.typing_weakness_buckets (day);

-- 하루에 사용자당 한 행이다. 모드·언어별 값은 compact JSON 배열로 둬 행 폭과
-- 인덱스 수를 줄인다. 배열 순서:
-- starts, completions, passed, typed_chars, active_ms, cpm_sum, accuracy_sum,
-- backspaces, mistakes, long_pauses, news_completed
create table if not exists public.user_daily_typing_analytics (
  profile_id uuid not null references public.profiles(id) on delete cascade,
  day date not null,
  starts integer not null default 0,
  completions integer not null default 0,
  passed integer not null default 0,
  typed_chars bigint not null default 0,
  active_ms bigint not null default 0,
  cpm_sum bigint not null default 0,
  accuracy_sum bigint not null default 0,
  backspaces integer not null default 0,
  mistakes integer not null default 0,
  long_pauses integer not null default 0,
  news_completed integer not null default 0,
  mode_breakdown jsonb not null default '{}'::jsonb,
  device_counts jsonb not null default '{}'::jsonb,
  hour_counts jsonb not null default '{}'::jsonb,
  updated_at timestamptz not null default now(),
  primary key (profile_id, day)
);

create index if not exists user_daily_typing_analytics_day_idx
  on public.user_daily_typing_analytics (day desc);

create table if not exists public.user_monthly_typing_analytics (
  profile_id uuid not null references public.profiles(id) on delete cascade,
  month_id integer not null check (month_id between 200001 and 299912),
  active_days integer not null default 0,
  starts integer not null default 0,
  completions integer not null default 0,
  passed integer not null default 0,
  typed_chars bigint not null default 0,
  active_ms bigint not null default 0,
  cpm_sum bigint not null default 0,
  accuracy_sum bigint not null default 0,
  backspaces integer not null default 0,
  mistakes integer not null default 0,
  long_pauses integer not null default 0,
  news_completed integer not null default 0,
  mode_breakdown jsonb not null default '{}'::jsonb,
  updated_at timestamptz not null default now(),
  primary key (profile_id, month_id)
);

create index if not exists user_monthly_typing_analytics_month_idx
  on public.user_monthly_typing_analytics (month_id desc);

create table if not exists public.user_typing_analytics_totals (
  profile_id uuid primary key references public.profiles(id) on delete cascade,
  active_days bigint not null default 0,
  starts bigint not null default 0,
  completions bigint not null default 0,
  passed bigint not null default 0,
  typed_chars bigint not null default 0,
  active_ms bigint not null default 0,
  cpm_sum bigint not null default 0,
  accuracy_sum bigint not null default 0,
  backspaces bigint not null default 0,
  mistakes bigint not null default 0,
  long_pauses bigint not null default 0,
  news_completed bigint not null default 0,
  updated_at timestamptz not null default now()
);

create table if not exists public.user_typing_weaknesses (
  profile_id uuid not null references public.profiles(id) on delete cascade,
  sentence_id bigint not null references public.sentences(id) on delete cascade,
  char_index integer not null check (char_index between 0 and 4000),
  mistake_count integer not null default 0,
  correction_count integer not null default 0,
  first_seen_at timestamptz not null default now(),
  last_seen_at timestamptz not null default now(),
  primary key (profile_id, sentence_id, char_index)
);

create index if not exists user_typing_weaknesses_profile_rank_idx
  on public.user_typing_weaknesses (profile_id, mistake_count desc, last_seen_at desc);

-- compact mode_breakdown의 같은 키·같은 배열 위치끼리 더한다.
create or replace function public.analytics_metric_map_add(p_left jsonb, p_right jsonb)
returns jsonb
language plpgsql
immutable
set search_path = public
as $$
declare
  v_result jsonb := coalesce(p_left, '{}'::jsonb);
  v_key text;
  v_right jsonb;
  v_left jsonb;
begin
  for v_key, v_right in select key, value from jsonb_each(coalesce(p_right, '{}'::jsonb))
  loop
    v_left := coalesce(v_result -> v_key, '[0,0,0,0,0,0,0,0,0,0,0]'::jsonb);
    v_result := jsonb_set(v_result, array[v_key], jsonb_build_array(
      coalesce((v_left ->> 0)::bigint, 0) + coalesce((v_right ->> 0)::bigint, 0),
      coalesce((v_left ->> 1)::bigint, 0) + coalesce((v_right ->> 1)::bigint, 0),
      coalesce((v_left ->> 2)::bigint, 0) + coalesce((v_right ->> 2)::bigint, 0),
      coalesce((v_left ->> 3)::bigint, 0) + coalesce((v_right ->> 3)::bigint, 0),
      coalesce((v_left ->> 4)::bigint, 0) + coalesce((v_right ->> 4)::bigint, 0),
      coalesce((v_left ->> 5)::bigint, 0) + coalesce((v_right ->> 5)::bigint, 0),
      coalesce((v_left ->> 6)::bigint, 0) + coalesce((v_right ->> 6)::bigint, 0),
      coalesce((v_left ->> 7)::bigint, 0) + coalesce((v_right ->> 7)::bigint, 0),
      coalesce((v_left ->> 8)::bigint, 0) + coalesce((v_right ->> 8)::bigint, 0),
      coalesce((v_left ->> 9)::bigint, 0) + coalesce((v_right ->> 9)::bigint, 0),
      coalesce((v_left ->> 10)::bigint, 0) + coalesce((v_right ->> 10)::bigint, 0)
    ), true);
  end loop;
  return v_result;
end;
$$;

create or replace function public.analytics_number_map_add(p_left jsonb, p_right jsonb)
returns jsonb
language plpgsql
immutable
set search_path = public
as $$
declare
  v_result jsonb := coalesce(p_left, '{}'::jsonb);
  v_key text;
  v_value jsonb;
begin
  for v_key, v_value in select key, value from jsonb_each(coalesce(p_right, '{}'::jsonb))
  loop
    v_result := jsonb_set(
      v_result,
      array[v_key],
      to_jsonb(coalesce((v_result ->> v_key)::bigint, 0) + coalesce((v_value #>> '{}')::bigint, 0)),
      true
    );
  end loop;
  return v_result;
end;
$$;

-- jsonb 집계용 aggregate. 앞에서 만든 결합 함수가 상태 함수다.
drop aggregate if exists public.analytics_metric_map_add_agg(jsonb);
create aggregate public.analytics_metric_map_add_agg(jsonb) (
  sfunc = public.analytics_metric_map_add,
  stype = jsonb,
  initcond = '{}'
);

create or replace function public.report_typing_analytics(
  p_session_key uuid,
  p_buckets jsonb,
  p_weaknesses jsonb default '[]'::jsonb
)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  v_profile_id uuid := public.current_profile_id();
  v_today date := (now() at time zone 'Asia/Seoul')::date;
  v_item jsonb;
  v_day date;
  v_mode text;
  v_language text;
  v_device text;
  v_category text;
  v_hour integer;
  v_sentence_id bigint;
  v_char_index integer;
begin
  if auth.uid() is null or v_profile_id is null then return; end if;
  if jsonb_typeof(p_buckets) <> 'array' or jsonb_array_length(p_buckets) > 96 then
    raise exception 'invalid analytics buckets';
  end if;
  if jsonb_typeof(coalesce(p_weaknesses, '[]'::jsonb)) <> 'array'
     or jsonb_array_length(coalesce(p_weaknesses, '[]'::jsonb)) > 160 then
    raise exception 'invalid weakness buckets';
  end if;

  for v_item in select value from jsonb_array_elements(p_buckets)
  loop
    v_day := coalesce((v_item ->> 'day')::date, v_today);
    v_mode := v_item ->> 'mode';
    v_language := v_item ->> 'language';
    v_device := v_item ->> 'deviceClass';
    v_category := left(regexp_replace(coalesce(v_item ->> 'category', ''), '[^a-z+_-]', '', 'g'), 40);
    v_hour := least(greatest(coalesce((v_item ->> 'hour')::integer, 0), 0), 23);
    if v_day not between v_today - 1 and v_today
       or v_mode not in ('short', 'long', 'word', 'news')
       or v_language not in ('kor', 'eng')
       or v_device not in ('desktop', 'tablet', 'mobile') then
      continue;
    end if;

    insert into public.typing_analytics_buckets as b (
      profile_id, session_key, day, mode, language, category, device_class, activity_hour,
      starts, completions, passed, typed_chars, active_ms, cpm_sum, accuracy_sum,
      backspaces, mistakes, long_pauses, news_completed, updated_at
    ) values (
      v_profile_id, p_session_key, v_day, v_mode, v_language, v_category, v_device, v_hour,
      least(greatest(coalesce((v_item ->> 'starts')::integer, 0), 0), 10000),
      least(greatest(coalesce((v_item ->> 'completions')::integer, 0), 0), 10000),
      least(greatest(coalesce((v_item ->> 'passed')::integer, 0), 0), 10000),
      least(greatest(coalesce((v_item ->> 'typedChars')::bigint, 0), 0), 10000000),
      least(greatest(coalesce((v_item ->> 'activeMs')::bigint, 0), 0), 86400000),
      least(greatest(coalesce((v_item ->> 'cpmSum')::bigint, 0), 0), 10000000),
      least(greatest(coalesce((v_item ->> 'accuracySum')::bigint, 0), 0), 1000000),
      least(greatest(coalesce((v_item ->> 'backspaces')::integer, 0), 0), 1000000),
      least(greatest(coalesce((v_item ->> 'mistakes')::integer, 0), 0), 1000000),
      least(greatest(coalesce((v_item ->> 'longPauses')::integer, 0), 0), 100000),
      least(greatest(coalesce((v_item ->> 'newsCompleted')::integer, 0), 0), 10000),
      now()
    )
    on conflict (profile_id, session_key, day, mode, language, category, device_class, activity_hour)
    do update set
      starts = greatest(b.starts, excluded.starts),
      completions = greatest(b.completions, excluded.completions),
      passed = greatest(b.passed, excluded.passed),
      typed_chars = greatest(b.typed_chars, excluded.typed_chars),
      active_ms = greatest(b.active_ms, excluded.active_ms),
      cpm_sum = greatest(b.cpm_sum, excluded.cpm_sum),
      accuracy_sum = greatest(b.accuracy_sum, excluded.accuracy_sum),
      backspaces = greatest(b.backspaces, excluded.backspaces),
      mistakes = greatest(b.mistakes, excluded.mistakes),
      long_pauses = greatest(b.long_pauses, excluded.long_pauses),
      news_completed = greatest(b.news_completed, excluded.news_completed),
      updated_at = now();
  end loop;

  for v_item in select value from jsonb_array_elements(coalesce(p_weaknesses, '[]'::jsonb))
  loop
    v_day := coalesce((v_item ->> 'day')::date, v_today);
    v_sentence_id := (v_item ->> 'sentenceId')::bigint;
    v_char_index := (v_item ->> 'charIndex')::integer;
    if v_day not between v_today - 1 and v_today
       or v_sentence_id is null or v_char_index not between 0 and 4000
       or not exists (
         select 1 from public.sentences s
         where s.id = v_sentence_id and v_char_index < char_length(s.text)
       ) then
      continue;
    end if;

    insert into public.typing_weakness_buckets as w (
      profile_id, session_key, day, sentence_id, char_index,
      mistake_count, correction_count, updated_at
    ) values (
      v_profile_id, p_session_key, v_day, v_sentence_id, v_char_index,
      least(greatest(coalesce((v_item ->> 'mistakeCount')::integer, 0), 0), 10000),
      least(greatest(coalesce((v_item ->> 'correctionCount')::integer, 0), 0), 10000),
      now()
    )
    on conflict (profile_id, session_key, day, sentence_id, char_index)
    do update set
      mistake_count = greatest(w.mistake_count, excluded.mistake_count),
      correction_count = greatest(w.correction_count, excluded.correction_count),
      updated_at = now();
  end loop;
end;
$$;

revoke all on function public.report_typing_analytics(uuid, jsonb, jsonb) from public, anon;
grant execute on function public.report_typing_analytics(uuid, jsonb, jsonb) to authenticated;

create or replace function public.rollup_typing_analytics(
  p_daily_days integer default 90,
  p_monthly_months integer default 60
)
returns table (bucket_rows integer, weakness_rows integer, daily_rows integer)
language plpgsql
security definer
set search_path = public
as $$
declare
  v_today date := (now() at time zone 'Asia/Seoul')::date;
  v_bucket_rows integer := 0;
  v_weakness_rows integer := 0;
  v_daily_rows integer := 0;
begin
  with removed as materialized (
    delete from public.typing_analytics_buckets
    where day < v_today - 1
    returning *
  ),
  overall as (
    select profile_id, day,
      sum(starts)::integer starts, sum(completions)::integer completions,
      sum(passed)::integer passed, sum(typed_chars)::bigint typed_chars,
      sum(active_ms)::bigint active_ms, sum(cpm_sum)::bigint cpm_sum,
      sum(accuracy_sum)::bigint accuracy_sum, sum(backspaces)::integer backspaces,
      sum(mistakes)::integer mistakes, sum(long_pauses)::integer long_pauses,
      sum(news_completed)::integer news_completed
    from removed group by profile_id, day
  ),
  mode_rows as (
    select profile_id, day, language || ':' || mode || case when category = '' then '' else ':' || category end as key,
      jsonb_build_array(sum(starts), sum(completions), sum(passed), sum(typed_chars),
        sum(active_ms), sum(cpm_sum), sum(accuracy_sum), sum(backspaces),
        sum(mistakes), sum(long_pauses), sum(news_completed)) value
    from removed group by profile_id, day, language, mode, category
  ),
  mode_maps as (
    select profile_id, day, jsonb_object_agg(key, value) value
    from mode_rows group by profile_id, day
  ),
  device_maps as (
    select profile_id, day, jsonb_object_agg(device_class, completions) value
    from (select profile_id, day, device_class, sum(completions) completions
          from removed group by profile_id, day, device_class) d
    group by profile_id, day
  ),
  hour_maps as (
    select profile_id, day, jsonb_object_agg(activity_hour::text, starts) value
    from (select profile_id, day, activity_hour, sum(starts) starts
          from removed group by profile_id, day, activity_hour) h
    group by profile_id, day
  ),
  merged as (
    insert into public.user_daily_typing_analytics as d (
      profile_id, day, starts, completions, passed, typed_chars, active_ms,
      cpm_sum, accuracy_sum, backspaces, mistakes, long_pauses, news_completed,
      mode_breakdown, device_counts, hour_counts, updated_at
    )
    select o.profile_id, o.day, o.starts, o.completions, o.passed, o.typed_chars,
      o.active_ms, o.cpm_sum, o.accuracy_sum, o.backspaces, o.mistakes,
      o.long_pauses, o.news_completed, m.value, dv.value, hr.value, now()
    from overall o
    join mode_maps m using (profile_id, day)
    join device_maps dv using (profile_id, day)
    join hour_maps hr using (profile_id, day)
    on conflict (profile_id, day) do update set
      starts = d.starts + excluded.starts,
      completions = d.completions + excluded.completions,
      passed = d.passed + excluded.passed,
      typed_chars = d.typed_chars + excluded.typed_chars,
      active_ms = d.active_ms + excluded.active_ms,
      cpm_sum = d.cpm_sum + excluded.cpm_sum,
      accuracy_sum = d.accuracy_sum + excluded.accuracy_sum,
      backspaces = d.backspaces + excluded.backspaces,
      mistakes = d.mistakes + excluded.mistakes,
      long_pauses = d.long_pauses + excluded.long_pauses,
      news_completed = d.news_completed + excluded.news_completed,
      mode_breakdown = public.analytics_metric_map_add(d.mode_breakdown, excluded.mode_breakdown),
      device_counts = public.analytics_number_map_add(d.device_counts, excluded.device_counts),
      hour_counts = public.analytics_number_map_add(d.hour_counts, excluded.hour_counts),
      updated_at = now()
    returning 1
  )
  select (select count(*) from removed), (select count(*) from merged)
  into v_bucket_rows, v_daily_rows;

  with removed as (
    delete from public.typing_weakness_buckets
    where day < v_today - 1
    returning *
  ), agg as (
    select profile_id, sentence_id, char_index,
      sum(mistake_count)::integer mistake_count,
      sum(correction_count)::integer correction_count,
      min(updated_at) first_seen_at, max(updated_at) last_seen_at
    from removed group by profile_id, sentence_id, char_index
  ), merged as (
    insert into public.user_typing_weaknesses as w (
      profile_id, sentence_id, char_index, mistake_count, correction_count,
      first_seen_at, last_seen_at
    )
    select profile_id, sentence_id, char_index, mistake_count, correction_count,
      first_seen_at, last_seen_at from agg
    on conflict (profile_id, sentence_id, char_index) do update set
      mistake_count = w.mistake_count + excluded.mistake_count,
      correction_count = w.correction_count + excluded.correction_count,
      last_seen_at = greatest(w.last_seen_at, excluded.last_seen_at)
    returning 1
  )
  select count(*) into v_weakness_rows from removed;

  with removed as materialized (
    delete from public.user_daily_typing_analytics
    where day < v_today - greatest(coalesce(p_daily_days, 90), 14)
    returning *
  ), mode_rows as (
    select r.profile_id,
      (extract(year from r.day)::integer * 100 + extract(month from r.day)::integer) month_id,
      e.key, public.analytics_metric_map_add('{}'::jsonb, jsonb_build_object(e.key, e.value)) value
    from removed r cross join lateral jsonb_each(r.mode_breakdown) e
  ), mode_maps as (
    select profile_id, month_id,
      public.analytics_metric_map_add_agg(value) value
    from mode_rows group by profile_id, month_id
  ), overall as (
    select profile_id,
      (extract(year from day)::integer * 100 + extract(month from day)::integer) month_id,
      count(*)::integer active_days, sum(starts)::integer starts,
      sum(completions)::integer completions, sum(passed)::integer passed,
      sum(typed_chars)::bigint typed_chars, sum(active_ms)::bigint active_ms,
      sum(cpm_sum)::bigint cpm_sum, sum(accuracy_sum)::bigint accuracy_sum,
      sum(backspaces)::integer backspaces, sum(mistakes)::integer mistakes,
      sum(long_pauses)::integer long_pauses, sum(news_completed)::integer news_completed
    from removed group by profile_id, month_id
  ), monthly as (
    insert into public.user_monthly_typing_analytics as m (
      profile_id, month_id, active_days, starts, completions, passed, typed_chars,
      active_ms, cpm_sum, accuracy_sum, backspaces, mistakes, long_pauses,
      news_completed, mode_breakdown, updated_at
    )
    select o.profile_id, o.month_id, o.active_days, o.starts, o.completions, o.passed,
      o.typed_chars, o.active_ms, o.cpm_sum, o.accuracy_sum, o.backspaces,
      o.mistakes, o.long_pauses, o.news_completed, coalesce(mm.value, '{}'::jsonb), now()
    from overall o left join mode_maps mm using (profile_id, month_id)
    on conflict (profile_id, month_id) do update set
      active_days = m.active_days + excluded.active_days,
      starts = m.starts + excluded.starts,
      completions = m.completions + excluded.completions,
      passed = m.passed + excluded.passed,
      typed_chars = m.typed_chars + excluded.typed_chars,
      active_ms = m.active_ms + excluded.active_ms,
      cpm_sum = m.cpm_sum + excluded.cpm_sum,
      accuracy_sum = m.accuracy_sum + excluded.accuracy_sum,
      backspaces = m.backspaces + excluded.backspaces,
      mistakes = m.mistakes + excluded.mistakes,
      long_pauses = m.long_pauses + excluded.long_pauses,
      news_completed = m.news_completed + excluded.news_completed,
      mode_breakdown = public.analytics_metric_map_add(m.mode_breakdown, excluded.mode_breakdown),
      updated_at = now()
    returning 1
  ), totals as (
    insert into public.user_typing_analytics_totals as t (
      profile_id, active_days, starts, completions, passed, typed_chars, active_ms,
      cpm_sum, accuracy_sum, backspaces, mistakes, long_pauses, news_completed, updated_at
    )
    select profile_id, count(*)::bigint, sum(starts), sum(completions), sum(passed),
      sum(typed_chars), sum(active_ms), sum(cpm_sum), sum(accuracy_sum),
      sum(backspaces), sum(mistakes), sum(long_pauses), sum(news_completed), now()
    from removed group by profile_id
    on conflict (profile_id) do update set
      active_days = t.active_days + excluded.active_days,
      starts = t.starts + excluded.starts,
      completions = t.completions + excluded.completions,
      passed = t.passed + excluded.passed,
      typed_chars = t.typed_chars + excluded.typed_chars,
      active_ms = t.active_ms + excluded.active_ms,
      cpm_sum = t.cpm_sum + excluded.cpm_sum,
      accuracy_sum = t.accuracy_sum + excluded.accuracy_sum,
      backspaces = t.backspaces + excluded.backspaces,
      mistakes = t.mistakes + excluded.mistakes,
      long_pauses = t.long_pauses + excluded.long_pauses,
      news_completed = t.news_completed + excluded.news_completed,
      updated_at = now()
    returning 1
  )
  select count(*) into v_daily_rows from removed;

  delete from public.user_monthly_typing_analytics
  where month_id < (
    extract(year from (v_today - make_interval(months => greatest(coalesce(p_monthly_months, 60), 12))))::integer * 100
    + extract(month from (v_today - make_interval(months => greatest(coalesce(p_monthly_months, 60), 12))))::integer
  );

  -- 사용자당 연습 가치가 높은 위치 120개만 보존한다.
  delete from public.user_typing_weaknesses w
  using (
    select profile_id, sentence_id, char_index
    from (
      select profile_id, sentence_id, char_index,
        row_number() over (
          partition by profile_id
          order by mistake_count desc, last_seen_at desc
        ) rank_no
      from public.user_typing_weaknesses
    ) ranked where rank_no > 120
  ) stale
  where w.profile_id = stale.profile_id
    and w.sentence_id = stale.sentence_id
    and w.char_index = stale.char_index;

  return query select coalesce(v_bucket_rows, 0), coalesce(v_weakness_rows, 0), coalesce(v_daily_rows, 0);
end;
$$;

revoke all on function public.rollup_typing_analytics(integer, integer) from public, anon, authenticated;

-- 개인 화면: 최근 N일의 일별 통계와 현재 미접힌 버킷을 합쳐 JSON 하나만 반환한다.
create or replace function public.get_my_typing_analytics(p_days integer default 30)
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
  v_result jsonb;
begin
  if auth.uid() is null or v_profile_id is null then return null; end if;
  with rows as (
    select day, starts::bigint starts, completions::bigint completions,
      passed::bigint passed, typed_chars, active_ms, cpm_sum, accuracy_sum,
      backspaces::bigint backspaces, mistakes::bigint mistakes,
      long_pauses::bigint long_pauses, news_completed::bigint news_completed
    from public.user_daily_typing_analytics
    where profile_id = v_profile_id and day >= v_cutoff
    union all
    select day, sum(starts), sum(completions), sum(passed), sum(typed_chars),
      sum(active_ms), sum(cpm_sum), sum(accuracy_sum), sum(backspaces),
      sum(mistakes), sum(long_pauses), sum(news_completed)
    from public.typing_analytics_buckets
    where profile_id = v_profile_id and day >= v_cutoff
    group by day
  ), daily as (
    select day, sum(starts) starts, sum(completions) completions, sum(passed) passed,
      sum(typed_chars) typed_chars, sum(active_ms) active_ms, sum(cpm_sum) cpm_sum,
      sum(accuracy_sum) accuracy_sum, sum(backspaces) backspaces,
      sum(mistakes) mistakes, sum(long_pauses) long_pauses,
      sum(news_completed) news_completed
    from rows group by day
  ), totals as (
    select coalesce(sum(starts),0) starts, coalesce(sum(completions),0) completions,
      coalesce(sum(passed),0) passed, coalesce(sum(typed_chars),0) typed_chars,
      coalesce(sum(active_ms),0) active_ms, coalesce(sum(cpm_sum),0) cpm_sum,
      coalesce(sum(accuracy_sum),0) accuracy_sum, coalesce(sum(backspaces),0) backspaces,
      coalesce(sum(mistakes),0) mistakes, coalesce(sum(long_pauses),0) long_pauses,
      coalesce(sum(news_completed),0) news_completed, count(*) active_days
    from daily
  )
  select jsonb_build_object(
    'days', v_days,
    'summary', jsonb_build_object(
      'starts', t.starts, 'completions', t.completions, 'passed', t.passed,
      'typedChars', t.typed_chars, 'activeMs', t.active_ms,
      'avgCpm', case when t.completions > 0 then round(t.cpm_sum::numeric / t.completions, 1) else 0 end,
      'avgAccuracy', case when t.completions > 0 then round(t.accuracy_sum::numeric / t.completions, 1) else 0 end,
      'backspaces', t.backspaces, 'mistakes', t.mistakes,
      'longPauses', t.long_pauses, 'newsCompleted', t.news_completed,
      'activeDays', t.active_days
    ),
    'daily', coalesce((select jsonb_agg(jsonb_build_object(
      'day', d.day, 'typedChars', d.typed_chars, 'completions', d.completions,
      'avgCpm', case when d.completions > 0 then round(d.cpm_sum::numeric / d.completions, 1) else 0 end,
      'avgAccuracy', case when d.completions > 0 then round(d.accuracy_sum::numeric / d.completions, 1) else 0 end
    ) order by d.day) from daily d), '[]'::jsonb)
  ) into v_result from totals t;
  return v_result;
end;
$$;

create or replace function public.get_my_typing_weaknesses(p_limit integer default 12)
returns table (
  sentence_id bigint,
  sentence_text text,
  char_index integer,
  target_character text,
  mistake_count integer,
  correction_count integer,
  last_seen_at timestamptz
)
language sql
stable
security definer
set search_path = public
as $$
  with source as (
    select sentence_id, char_index, mistake_count, correction_count, last_seen_at
    from public.user_typing_weaknesses
    where profile_id = public.current_profile_id()
    union all
    select sentence_id, char_index, sum(mistake_count)::integer,
      sum(correction_count)::integer, max(updated_at)
    from public.typing_weakness_buckets
    where profile_id = public.current_profile_id()
    group by sentence_id, char_index
  ), combined as (
    select sentence_id, char_index, sum(mistake_count)::integer mistake_count,
      sum(correction_count)::integer correction_count, max(last_seen_at) last_seen_at
    from source group by sentence_id, char_index
  )
  select w.sentence_id, s.text, w.char_index,
    substr(s.text, w.char_index + 1, 1), w.mistake_count,
    w.correction_count, w.last_seen_at
  from combined w join public.sentences s on s.id = w.sentence_id
  where auth.uid() is not null
  order by w.mistake_count desc, w.last_seen_at desc
  limit least(greatest(coalesce(p_limit, 12), 1), 30)
$$;

create or replace function public.get_admin_typing_analytics(p_days integer default 30)
returns table (
  day date, active_users integer, starts bigint, completions bigint,
  completion_rate numeric, typed_chars bigint, active_ms bigint,
  avg_cpm numeric, avg_accuracy numeric, mistakes bigint,
  backspaces bigint, news_completed bigint
)
language sql
stable
security definer
set search_path = public
as $$
  with source as (
    select profile_id, day, starts::bigint starts, completions::bigint completions,
      typed_chars, active_ms, cpm_sum, accuracy_sum,
      mistakes::bigint mistakes, backspaces::bigint backspaces,
      news_completed::bigint news_completed
    from public.user_daily_typing_analytics
    where day >= (now() at time zone 'Asia/Seoul')::date
      - least(greatest(coalesce(p_days, 30), 1), 90) + 1
    union all
    select profile_id, day, sum(starts), sum(completions), sum(typed_chars),
      sum(active_ms), sum(cpm_sum), sum(accuracy_sum), sum(mistakes),
      sum(backspaces), sum(news_completed)
    from public.typing_analytics_buckets
    where day >= (now() at time zone 'Asia/Seoul')::date
      - least(greatest(coalesce(p_days, 30), 1), 90) + 1
    group by profile_id, day
  )
  select s.day, count(distinct s.profile_id)::integer, sum(s.starts), sum(s.completions),
    case when sum(s.starts) > 0 then round(sum(s.completions)::numeric * 100 / sum(s.starts), 1) else 0 end,
    sum(s.typed_chars), sum(s.active_ms),
    case when sum(s.completions) > 0 then round(sum(s.cpm_sum)::numeric / sum(s.completions), 1) else 0 end,
    case when sum(s.completions) > 0 then round(sum(s.accuracy_sum)::numeric / sum(s.completions), 1) else 0 end,
    sum(s.mistakes), sum(s.backspaces), sum(s.news_completed)
  from source s
  where public.is_admin()
  group by s.day order by s.day desc
$$;

create or replace function public.get_admin_typing_mode_analytics(p_days integer default 30)
returns table (
  language text, mode text, category text, starts bigint, completions bigint,
  completion_rate numeric, typed_chars bigint, avg_cpm numeric, avg_accuracy numeric
)
language sql
stable
security definer
set search_path = public
as $$
  with daily_rows as (
    select split_part(e.key, ':', 1) language,
      split_part(e.key, ':', 2) mode,
      split_part(e.key, ':', 3) category,
      coalesce((e.value ->> 0)::bigint, 0) starts,
      coalesce((e.value ->> 1)::bigint, 0) completions,
      coalesce((e.value ->> 3)::bigint, 0) typed_chars,
      coalesce((e.value ->> 5)::bigint, 0) cpm_sum,
      coalesce((e.value ->> 6)::bigint, 0) accuracy_sum
    from public.user_daily_typing_analytics d
    cross join lateral jsonb_each(d.mode_breakdown) e
    where d.day >= (now() at time zone 'Asia/Seoul')::date
      - least(greatest(coalesce(p_days, 30), 1), 90) + 1
  ), current_rows as (
    select b.language, b.mode, b.category, sum(b.starts) starts,
      sum(b.completions) completions, sum(b.typed_chars) typed_chars,
      sum(b.cpm_sum) cpm_sum, sum(b.accuracy_sum) accuracy_sum
    from public.typing_analytics_buckets b
    where b.day >= (now() at time zone 'Asia/Seoul')::date
      - least(greatest(coalesce(p_days, 30), 1), 90) + 1
    group by b.language, b.mode, b.category
  ), source as (
    select * from daily_rows union all select * from current_rows
  )
  select s.language, s.mode, s.category, sum(s.starts), sum(s.completions),
    case when sum(s.starts) > 0 then round(sum(s.completions)::numeric * 100 / sum(s.starts), 1) else 0 end,
    sum(s.typed_chars),
    case when sum(s.completions) > 0 then round(sum(s.cpm_sum)::numeric / sum(s.completions), 1) else 0 end,
    case when sum(s.completions) > 0 then round(sum(s.accuracy_sum)::numeric / sum(s.completions), 1) else 0 end
  from source s where public.is_admin()
  group by s.language, s.mode, s.category
  order by sum(s.completions) desc
$$;

grant execute on function public.get_my_typing_analytics(integer) to authenticated;
grant execute on function public.get_my_typing_weaknesses(integer) to authenticated;
grant execute on function public.get_admin_typing_analytics(integer) to authenticated;
grant execute on function public.get_admin_typing_mode_analytics(integer) to authenticated;

alter table public.typing_analytics_buckets enable row level security;
alter table public.typing_weakness_buckets enable row level security;
alter table public.user_daily_typing_analytics enable row level security;
alter table public.user_monthly_typing_analytics enable row level security;
alter table public.user_typing_analytics_totals enable row level security;
alter table public.user_typing_weaknesses enable row level security;

drop policy if exists "user_daily_typing_analytics_own" on public.user_daily_typing_analytics;
create policy "user_daily_typing_analytics_own" on public.user_daily_typing_analytics
  for select to authenticated using (profile_id = public.current_profile_id() or public.is_admin());
drop policy if exists "user_monthly_typing_analytics_own" on public.user_monthly_typing_analytics;
create policy "user_monthly_typing_analytics_own" on public.user_monthly_typing_analytics
  for select to authenticated using (profile_id = public.current_profile_id() or public.is_admin());
drop policy if exists "user_typing_analytics_totals_own" on public.user_typing_analytics_totals;
create policy "user_typing_analytics_totals_own" on public.user_typing_analytics_totals
  for select to authenticated using (profile_id = public.current_profile_id() or public.is_admin());
drop policy if exists "user_typing_weaknesses_own" on public.user_typing_weaknesses;
create policy "user_typing_weaknesses_own" on public.user_typing_weaknesses
  for select to authenticated using (profile_id = public.current_profile_id() or public.is_admin());

revoke all on public.typing_analytics_buckets, public.typing_weakness_buckets from anon, authenticated;
revoke all on public.user_daily_typing_analytics, public.user_monthly_typing_analytics,
  public.user_typing_analytics_totals, public.user_typing_weaknesses from anon, authenticated;
grant select on public.user_daily_typing_analytics, public.user_monthly_typing_analytics,
  public.user_typing_analytics_totals, public.user_typing_weaknesses to authenticated;

do $$
declare v_name text;
begin
  for v_name in select jobname from cron.job where jobname = 'typenews-rollup-analytics'
  loop perform cron.unschedule(v_name); end loop;
end;
$$;

select cron.schedule(
  'typenews-rollup-analytics',
  '50 19 * * *',
  $$select public.rollup_typing_analytics(90, 60)$$
);

notify pgrst, 'reload schema';
