-- 이미 수집 중인 압축 통계를 관리자 화면에서 빠짐없이 조회한다.
-- 새 원시 데이터나 테이블은 추가하지 않는다.

create or replace function public.get_admin_typing_quality(
  p_days integer default 30,
  p_limit integer default 20
)
returns jsonb
language plpgsql
stable
security definer
set search_path = public
as $$
declare
  v_days integer := least(greatest(coalesce(p_days, 30), 1), 90);
  v_limit integer := least(greatest(coalesce(p_limit, 20), 1), 50);
  v_cutoff date := (now() at time zone 'Asia/Seoul')::date - v_days + 1;
  v_result jsonb;
begin
  if not public.is_admin() then return null; end if;

  with metric_source as (
    select profile_id, day, passed::bigint as passed_count,
      active_ms::bigint as active_ms, backspaces::bigint as backspace_count,
      mistakes::bigint as mistake_count, long_pauses::bigint as long_pause_count
    from public.user_daily_typing_analytics
    where day >= v_cutoff
    union all
    select profile_id, day, sum(passed)::bigint, sum(active_ms)::bigint,
      sum(backspaces)::bigint, sum(mistakes)::bigint, sum(long_pauses)::bigint
    from public.typing_analytics_buckets
    where day >= v_cutoff
    group by profile_id, day
  ), metric_totals as (
    select coalesce(sum(passed_count), 0) as passed_count,
      coalesce(sum(active_ms), 0) as active_ms,
      coalesce(sum(backspace_count), 0) as backspace_count,
      coalesce(sum(mistake_count), 0) as mistake_count,
      coalesce(sum(long_pause_count), 0) as long_pause_count,
      count(distinct profile_id) as active_users,
      count(*) as active_user_days
    from metric_source
  ), weakness_source as (
    select profile_id, sentence_id, char_index, mistake_count::bigint as mistake_count,
      correction_count::bigint as correction_count, last_seen_at
    from public.user_typing_weaknesses
    union all
    select profile_id, sentence_id, char_index, sum(mistake_count)::bigint,
      sum(correction_count)::bigint, max(updated_at)
    from public.typing_weakness_buckets
    group by profile_id, sentence_id, char_index
  ), weakness_totals as (
    select coalesce(sum(mistake_count), 0) as mistake_count,
      coalesce(sum(correction_count), 0) as correction_count,
      count(distinct profile_id) as affected_users
    from weakness_source
  ), weakness_ranked as (
    select w.sentence_id, w.char_index,
      sum(w.mistake_count)::bigint as mistake_count,
      sum(w.correction_count)::bigint as correction_count,
      count(distinct w.profile_id)::integer as affected_users,
      max(w.last_seen_at) as last_seen_at
    from weakness_source w
    group by w.sentence_id, w.char_index
    order by sum(w.mistake_count) desc, max(w.last_seen_at) desc
    limit v_limit
  )
  select jsonb_build_object(
    'summary', jsonb_build_object(
      'passed', m.passed_count,
      'activeMs', m.active_ms,
      'backspaces', m.backspace_count,
      'mistakes', m.mistake_count,
      'longPauses', m.long_pause_count,
      'activeUsers', m.active_users,
      'activeUserDays', m.active_user_days,
      'weaknessMistakes', w.mistake_count,
      'weaknessCorrections', w.correction_count,
      'weaknessUsers', w.affected_users
    ),
    'weaknesses', coalesce((
      select jsonb_agg(jsonb_build_object(
        'sentenceId', r.sentence_id,
        'sentenceText', s.text,
        'charIndex', r.char_index,
        'targetCharacter', substr(s.text, r.char_index + 1, 1),
        'mistakeCount', r.mistake_count,
        'correctionCount', r.correction_count,
        'affectedUsers', r.affected_users,
        'lastSeenAt', r.last_seen_at
      ) order by r.mistake_count desc, r.last_seen_at desc)
      from weakness_ranked r
      join public.sentences s on s.id = r.sentence_id
    ), '[]'::jsonb)
  ) into v_result
  from metric_totals m cross join weakness_totals w;

  return v_result;
end;
$$;

create or replace function public.get_admin_typing_mode_details(p_days integer default 30)
returns table (
  language text,
  mode text,
  category text,
  starts bigint,
  completions bigint,
  passed bigint,
  completion_rate numeric,
  pass_rate numeric,
  typed_chars bigint,
  active_ms bigint,
  avg_duration_ms numeric,
  avg_cpm numeric,
  avg_accuracy numeric,
  backspaces bigint,
  mistakes bigint,
  long_pauses bigint,
  news_completed bigint
)
language sql
stable
security definer
set search_path = public
as $$
  with daily_rows as (
    select split_part(e.key, ':', 1) as language_name,
      split_part(e.key, ':', 2) as mode_name,
      split_part(e.key, ':', 3) as category_name,
      coalesce((e.value ->> 0)::bigint, 0) as start_count,
      coalesce((e.value ->> 1)::bigint, 0) as completion_count,
      coalesce((e.value ->> 2)::bigint, 0) as passed_count,
      coalesce((e.value ->> 3)::bigint, 0) as typed_char_count,
      coalesce((e.value ->> 4)::bigint, 0) as active_milliseconds,
      coalesce((e.value ->> 5)::bigint, 0) as cpm_total,
      coalesce((e.value ->> 6)::bigint, 0) as accuracy_total,
      coalesce((e.value ->> 7)::bigint, 0) as backspace_count,
      coalesce((e.value ->> 8)::bigint, 0) as mistake_count,
      coalesce((e.value ->> 9)::bigint, 0) as long_pause_count,
      coalesce((e.value ->> 10)::bigint, 0) as news_completion_count
    from public.user_daily_typing_analytics d
    cross join lateral jsonb_each(d.mode_breakdown) e
    where d.day >= (now() at time zone 'Asia/Seoul')::date
      - least(greatest(coalesce(p_days, 30), 1), 90) + 1
  ), current_rows as (
    select b.language as language_name, b.mode as mode_name, b.category as category_name,
      sum(b.starts)::bigint as start_count,
      sum(b.completions)::bigint as completion_count,
      sum(b.passed)::bigint as passed_count,
      sum(b.typed_chars)::bigint as typed_char_count,
      sum(b.active_ms)::bigint as active_milliseconds,
      sum(b.cpm_sum)::bigint as cpm_total,
      sum(b.accuracy_sum)::bigint as accuracy_total,
      sum(b.backspaces)::bigint as backspace_count,
      sum(b.mistakes)::bigint as mistake_count,
      sum(b.long_pauses)::bigint as long_pause_count,
      sum(b.news_completed)::bigint as news_completion_count
    from public.typing_analytics_buckets b
    where b.day >= (now() at time zone 'Asia/Seoul')::date
      - least(greatest(coalesce(p_days, 30), 1), 90) + 1
    group by b.language, b.mode, b.category
  ), source as (
    select * from daily_rows
    union all
    select * from current_rows
  ), grouped as (
    select language_name, mode_name, category_name,
      sum(start_count)::bigint as start_count,
      sum(completion_count)::bigint as completion_count,
      sum(passed_count)::bigint as passed_count,
      sum(typed_char_count)::bigint as typed_char_count,
      sum(active_milliseconds)::bigint as active_milliseconds,
      sum(cpm_total)::bigint as cpm_total,
      sum(accuracy_total)::bigint as accuracy_total,
      sum(backspace_count)::bigint as backspace_count,
      sum(mistake_count)::bigint as mistake_count,
      sum(long_pause_count)::bigint as long_pause_count,
      sum(news_completion_count)::bigint as news_completion_count
    from source
    group by language_name, mode_name, category_name
  )
  select g.language_name, g.mode_name, g.category_name,
    g.start_count, g.completion_count, g.passed_count,
    case when g.start_count > 0
      then round(g.completion_count::numeric * 100 / g.start_count, 1) else 0 end,
    case when g.completion_count > 0
      then round(g.passed_count::numeric * 100 / g.completion_count, 1) else 0 end,
    g.typed_char_count, g.active_milliseconds,
    case when g.completion_count > 0
      then round(g.active_milliseconds::numeric / g.completion_count, 0) else 0 end,
    case when g.completion_count > 0
      then round(g.cpm_total::numeric / g.completion_count, 1) else 0 end,
    case when g.completion_count > 0
      then round(g.accuracy_total::numeric / g.completion_count, 1) else 0 end,
    g.backspace_count, g.mistake_count, g.long_pause_count, g.news_completion_count
  from grouped g
  where public.is_admin()
  order by g.completion_count desc;
$$;

revoke all on function public.get_admin_typing_quality(integer, integer) from public, anon;
revoke all on function public.get_admin_typing_mode_details(integer) from public, anon;
grant execute on function public.get_admin_typing_quality(integer, integer) to authenticated;
grant execute on function public.get_admin_typing_mode_details(integer) to authenticated;
