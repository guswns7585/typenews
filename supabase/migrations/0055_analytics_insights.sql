-- 0054에서 이미 수집 중인 압축 통계를 개인 성장·관리자 분석으로 확장한다.
-- 새 원시 데이터나 새 테이블은 만들지 않는다.

create or replace function public.get_my_typing_analytics(p_days integer default 30)
returns jsonb
language plpgsql
stable
security definer
set search_path = public
as $$
declare
  v_profile_id uuid := public.current_profile_id();
  v_days integer := least(greatest(coalesce(p_days, 30), 7), 45);
  v_today date := (now() at time zone 'Asia/Seoul')::date;
  v_current_start date;
  v_previous_start date;
  v_result jsonb;
begin
  if auth.uid() is null or v_profile_id is null then return null; end if;
  v_current_start := v_today - v_days + 1;
  v_previous_start := v_current_start - v_days;

  with daily_source as (
    select day, starts::bigint starts, completions::bigint completions,
      passed::bigint passed, typed_chars, active_ms, cpm_sum, accuracy_sum,
      backspaces::bigint backspaces, mistakes::bigint mistakes,
      long_pauses::bigint long_pauses, news_completed::bigint news_completed,
      mode_breakdown
    from public.user_daily_typing_analytics
    where profile_id = v_profile_id and day >= v_previous_start
    union all
    select day, sum(starts), sum(completions), sum(passed), sum(typed_chars),
      sum(active_ms), sum(cpm_sum), sum(accuracy_sum), sum(backspaces),
      sum(mistakes), sum(long_pauses), sum(news_completed), '{}'::jsonb
    from public.typing_analytics_buckets
    where profile_id = v_profile_id and day >= v_previous_start
    group by day
  ), daily as (
    select day, sum(starts) starts, sum(completions) completions, sum(passed) passed,
      sum(typed_chars) typed_chars, sum(active_ms) active_ms, sum(cpm_sum) cpm_sum,
      sum(accuracy_sum) accuracy_sum, sum(backspaces) backspaces,
      sum(mistakes) mistakes, sum(long_pauses) long_pauses,
      sum(news_completed) news_completed
    from daily_source group by day
  ), current_totals as (
    select coalesce(sum(starts),0) starts, coalesce(sum(completions),0) completions,
      coalesce(sum(passed),0) passed, coalesce(sum(typed_chars),0) typed_chars,
      coalesce(sum(active_ms),0) active_ms, coalesce(sum(cpm_sum),0) cpm_sum,
      coalesce(sum(accuracy_sum),0) accuracy_sum, coalesce(sum(backspaces),0) backspaces,
      coalesce(sum(mistakes),0) mistakes, coalesce(sum(long_pauses),0) long_pauses,
      coalesce(sum(news_completed),0) news_completed, count(*) active_days
    from daily where day >= v_current_start
  ), previous_totals as (
    select coalesce(sum(completions),0) completions, coalesce(sum(typed_chars),0) typed_chars,
      coalesce(sum(cpm_sum),0) cpm_sum, coalesce(sum(accuracy_sum),0) accuracy_sum
    from daily where day >= v_previous_start and day < v_current_start
  ), mode_daily as (
    select split_part(e.key, ':', 1) language,
      split_part(e.key, ':', 2) mode,
      coalesce((e.value ->> 0)::bigint,0) starts,
      coalesce((e.value ->> 1)::bigint,0) completions,
      coalesce((e.value ->> 3)::bigint,0) typed_chars,
      coalesce((e.value ->> 5)::bigint,0) cpm_sum,
      coalesce((e.value ->> 6)::bigint,0) accuracy_sum
    from public.user_daily_typing_analytics d
    cross join lateral jsonb_each(d.mode_breakdown) e
    where d.profile_id = v_profile_id and d.day >= v_current_start
  ), mode_current as (
    select language, mode, sum(starts) starts, sum(completions) completions,
      sum(typed_chars) typed_chars, sum(cpm_sum) cpm_sum, sum(accuracy_sum) accuracy_sum
    from public.typing_analytics_buckets
    where profile_id = v_profile_id and day >= v_current_start
    group by language, mode
  ), mode_source as (
    select * from mode_daily union all select * from mode_current
  ), modes as (
    select language, mode, sum(starts) starts, sum(completions) completions,
      sum(typed_chars) typed_chars, sum(cpm_sum) cpm_sum, sum(accuracy_sum) accuracy_sum
    from mode_source group by language, mode
  ), activity_days as (
    select distinct day from daily where day >= v_today - 89 and day <= v_today
  ), last_activity as (
    select max(day) as latest_day from activity_days
  ), numbered_days as (
    select day, day + row_number() over (order by day desc)::integer as streak_group
    from activity_days
  ), streak as (
    select case when l.latest_day >= v_today - 1
      then count(*) filter (where n.streak_group = l.latest_day + 1)
      else 0 end::integer as streak_value
    from numbered_days n cross join last_activity l group by l.latest_day
  )
  select jsonb_build_object(
    'days', v_days,
    'summary', jsonb_build_object(
      'starts', c.starts, 'completions', c.completions, 'passed', c.passed,
      'typedChars', c.typed_chars, 'activeMs', c.active_ms,
      'avgCpm', case when c.completions > 0 then round(c.cpm_sum::numeric / c.completions,1) else 0 end,
      'avgAccuracy', case when c.completions > 0 then round(c.accuracy_sum::numeric / c.completions,1) else 0 end,
      'backspaces', c.backspaces, 'mistakes', c.mistakes,
      'longPauses', c.long_pauses, 'newsCompleted', c.news_completed,
      'activeDays', c.active_days,
      'streak', coalesce((select streak_value from streak),0)
    ),
    'comparison', jsonb_build_object(
      'typedChars', case when p.typed_chars > 0 then round((c.typed_chars-p.typed_chars)::numeric*100/p.typed_chars,1) else null end,
      'completions', case when p.completions > 0 then round((c.completions-p.completions)::numeric*100/p.completions,1) else null end,
      'avgCpm', case when p.completions > 0 and c.completions > 0
        then round(c.cpm_sum::numeric/c.completions - p.cpm_sum::numeric/p.completions,1) else null end,
      'avgAccuracy', case when p.completions > 0 and c.completions > 0
        then round(c.accuracy_sum::numeric/c.completions - p.accuracy_sum::numeric/p.completions,1) else null end
    ),
    'daily', coalesce((select jsonb_agg(jsonb_build_object(
      'day', d.day, 'typedChars', d.typed_chars, 'completions', d.completions,
      'avgCpm', case when d.completions > 0 then round(d.cpm_sum::numeric/d.completions,1) else 0 end,
      'avgAccuracy', case when d.completions > 0 then round(d.accuracy_sum::numeric/d.completions,1) else 0 end
    ) order by d.day) from daily d where d.day >= v_current_start), '[]'::jsonb),
    'modes', coalesce((select jsonb_agg(jsonb_build_object(
      'language', m.language, 'mode', m.mode, 'starts', m.starts,
      'completions', m.completions, 'typedChars', m.typed_chars,
      'avgCpm', case when m.completions > 0 then round(m.cpm_sum::numeric/m.completions,1) else 0 end,
      'avgAccuracy', case when m.completions > 0 then round(m.accuracy_sum::numeric/m.completions,1) else 0 end
    ) order by m.completions desc) from modes m), '[]'::jsonb)
  ) into v_result from current_totals c cross join previous_totals p;
  return v_result;
end;
$$;

create or replace function public.get_admin_typing_dimensions(p_days integer default 30)
returns jsonb
language plpgsql
stable
security definer
set search_path = public
as $$
declare
  v_days integer := least(greatest(coalesce(p_days,30),1),90);
  v_today date := (now() at time zone 'Asia/Seoul')::date;
  v_cutoff date;
  v_result jsonb;
begin
  if not public.is_admin() then return null; end if;
  v_cutoff := v_today - v_days + 1;

  with activity as (
    select profile_id, day from public.user_daily_typing_analytics where day >= v_today - 89
    union
    select profile_id, day from public.typing_analytics_buckets where day >= v_today - 89
  ), selected_profiles as (
    select distinct profile_id from activity where day >= v_cutoff
  ), device_source as (
    select e.key as device_name, (e.value #>> '{}')::bigint as completion_count
    from public.user_daily_typing_analytics d
    cross join lateral jsonb_each(d.device_counts) e
    where d.day >= v_cutoff
    union all
    select device_class, sum(completions) from public.typing_analytics_buckets
    where day >= v_cutoff group by device_class
  ), devices as (
    select device_name, sum(completion_count) as completion_count
    from device_source group by device_name
  ), hour_source as (
    select e.key::integer as hour_of_day, (e.value #>> '{}')::bigint as start_count
    from public.user_daily_typing_analytics d
    cross join lateral jsonb_each(d.hour_counts) e
    where d.day >= v_cutoff
    union all
    select activity_hour, sum(starts) from public.typing_analytics_buckets
    where day >= v_cutoff group by activity_hour
  ), hours as (
    select hour_of_day, sum(start_count) as start_count
    from hour_source group by hour_of_day
  ), pause_source as (
    select long_pauses::bigint as pause_count
    from public.user_daily_typing_analytics where day >= v_cutoff
    union all
    select sum(long_pauses) from public.typing_analytics_buckets where day >= v_cutoff
  )
  select jsonb_build_object(
    'summary', jsonb_build_object(
      'dau', (select count(distinct profile_id) from activity where day = v_today),
      'wau', (select count(distinct profile_id) from activity where day >= v_today-6),
      'mau', (select count(distinct profile_id) from activity where day >= v_today-29),
      'newUsers', (select count(*) from selected_profiles a join public.profiles p on p.id=a.profile_id
        where (coalesce(p.firebase_created_at,p.created_at) at time zone 'Asia/Seoul')::date >= v_cutoff),
      'returningUsers', (select count(*) from selected_profiles a join public.profiles p on p.id=a.profile_id
        where (coalesce(p.firebase_created_at,p.created_at) at time zone 'Asia/Seoul')::date < v_cutoff),
      'longPauses', (select coalesce(sum(pause_count),0) from pause_source)
    ),
    'devices', coalesce((select jsonb_agg(jsonb_build_object(
      'device', device_name, 'completions', completion_count
    ) order by completion_count desc) from devices), '[]'::jsonb),
    'hours', coalesce((select jsonb_agg(jsonb_build_object(
      'hour', hour_of_day, 'starts', start_count
    ) order by hour_of_day) from hours), '[]'::jsonb)
  ) into v_result;
  return v_result;
end;
$$;

revoke all on function public.get_my_typing_analytics(integer) from public, anon;
revoke all on function public.get_admin_typing_dimensions(integer) from public, anon;
grant execute on function public.get_my_typing_analytics(integer) to authenticated;
grant execute on function public.get_admin_typing_dimensions(integer) to authenticated;

notify pgrst, 'reload schema';
