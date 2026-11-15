begin;

create or replace function public.get_my_typing_speed_position(
  p_days integer default 30,
  p_min_completions integer default 20
)
returns table (
  avg_cpm numeric,
  speed_rank bigint,
  participant_count bigint,
  top_percent numeric,
  completions bigint
)
language plpgsql
stable
security definer
set search_path = public
as $$
declare
  v_profile_id uuid := public.current_profile_id();
  v_days integer := least(greatest(coalesce(p_days, 30), 7), 90);
  v_min_completions integer := least(greatest(coalesce(p_min_completions, 20), 5), 1000);
  v_cutoff date := (now() at time zone 'Asia/Seoul')::date - v_days + 1;
begin
  if auth.uid() is null or v_profile_id is null then
    return;
  end if;

  return query
  with speed_source as (
    select a.profile_id, a.completions::bigint as completions, a.cpm_sum::bigint as cpm_sum
    from public.user_daily_typing_analytics a
    where a.day >= v_cutoff
    union all
    select b.profile_id, b.completions::bigint, b.cpm_sum::bigint
    from public.typing_analytics_buckets b
    where b.day >= v_cutoff
  ), averages as (
    select
      s.profile_id,
      sum(s.completions)::bigint as completions,
      sum(s.cpm_sum)::numeric / nullif(sum(s.completions), 0) as avg_cpm
    from speed_source s
    group by s.profile_id
    having sum(s.completions) >= v_min_completions
  ), ranked as (
    select
      a.profile_id,
      a.avg_cpm,
      a.completions,
      rank() over (order by a.avg_cpm desc) as speed_rank,
      count(*) over () as participant_count
    from averages a
  )
  select
    round(r.avg_cpm, 1),
    r.speed_rank,
    r.participant_count,
    round(r.speed_rank::numeric * 100 / nullif(r.participant_count, 0), 1),
    r.completions
  from ranked r
  where r.profile_id = v_profile_id;
end;
$$;

comment on function public.get_my_typing_speed_position(integer, integer) is
  '최근 기간 평균 CPM 기준의 개인 순위. 최소 완주 횟수를 넘긴 사용자끼리만 비교한다.';

revoke all on function public.get_my_typing_speed_position(integer, integer) from public, anon;
grant execute on function public.get_my_typing_speed_position(integer, integer) to authenticated;

notify pgrst, 'reload schema';

commit;
