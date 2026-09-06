-- Classify active accounts by account/history evidence, not only profile.created_at.
--
-- Firebase-imported profiles can have firebase_created_at missing, while profile.created_at
-- reflects the Supabase migration/cutover time. In that case old accounts were counted as
-- "new" and returningUsers stayed at 0 until the selected window moved past the migration date.

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
  v_cutoff_month text;
  v_result jsonb;
begin
  if not public.is_admin() then return null; end if;
  v_cutoff := v_today - v_days + 1;
  v_cutoff_month := to_char(v_cutoff::timestamp, 'YYYYMM');

  with activity as (
    select profile_id, day from public.user_daily_typing_analytics where day >= v_today - 89
    union
    select profile_id, day from public.typing_analytics_buckets where day >= v_today - 89
  ), selected_profiles as (
    select distinct profile_id from activity where day >= v_cutoff
  ), profile_cohorts as (
    select
      a.profile_id,
      (
        p.firebase_uid is not null
        or (coalesce(p.firebase_created_at, p.created_at) at time zone 'Asia/Seoul')::date < v_cutoff
        or exists (
          select 1
          from activity prior_activity
          where prior_activity.profile_id = a.profile_id
            and prior_activity.day < v_cutoff
        )
        or exists (
          select 1
          from public.monthly_stats ms
          where ms.profile_id = a.profile_id
            and (
              ms.month_id < v_cutoff_month
              or (
                ms.updated_at_source is not null
                and (ms.updated_at_source at time zone 'Asia/Seoul')::date < v_cutoff
              )
            )
        )
      ) as existed_before_window
    from selected_profiles a
    join public.profiles p on p.id = a.profile_id
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
      'newUsers', (select count(*) from profile_cohorts where not existed_before_window),
      'returningUsers', (select count(*) from profile_cohorts where existed_before_window),
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

revoke all on function public.get_admin_typing_dimensions(integer) from public, anon;
grant execute on function public.get_admin_typing_dimensions(integer) to authenticated;

notify pgrst, 'reload schema';
