-- 점수 체계를 "완료한 문장 수"에서 "실제 타수"로 바꾼다.
--
-- 기존: 단문 5문장 = 1점, 장문·뉴스 1문장 = 1점, 영어뉴스 2문장 = 1점
-- 변경: 정확도 80%를 넘기면 그 문장의 타수만큼 점수. "열심히 살자" = 13점
--
-- 점수는 문장의 속성이라 누가 치든 같은 값이다. 사용자가 예측할 수 있다.
--
-- ⚠️ 이 마이그레이션은 record_typing_result의 시그니처를 바꾼다.
--    배포된 프론트엔드가 4-인자 버전을 호출하고 있으므로 SQL 적용과 재배포를
--    함께 진행해야 한다. Vercel은 아직 프로덕션이 아니라 사용자 영향은 없다.

-- ---------------------------------------------------------------------------
-- 스키마
-- ---------------------------------------------------------------------------

-- typing_count는 이제 문장 수가 아니라 누적 타수다. 이름을 맞춘다.
alter table public.monthly_stats rename column typing_count to score;

alter table public.monthly_stats
  drop constraint if exists monthly_stats_typing_count_check;
alter table public.monthly_stats
  add constraint monthly_stats_score_check check (score >= 0);

alter table public.typing_results
  add column if not exists score integer not null default 0 check (score >= 0),
  add column if not exists elapsed_ms integer;

comment on column public.monthly_stats.score is '이번 달 누적 타수. 0006부터 문장 수가 아니라 타수다.';
comment on column public.typing_results.score is '이 문장의 타수. 정확도 80% 미만이면 기록되지 않는다.';

-- profiles.total_typing_count는 그대로 "누적 문장 수"다. 점수와는 다른 지표라 유지한다.

drop index if exists monthly_stats_month_rank_idx;
create index if not exists monthly_stats_month_rank_idx
  on public.monthly_stats (month_id, score desc, updated_at desc);

-- ---------------------------------------------------------------------------
-- 점수 기록
-- ---------------------------------------------------------------------------

-- 인자가 바뀌므로 옛 함수를 먼저 없앤다. 남겨두면 호출이 모호해진다.
drop function if exists public.record_typing_result(text, text, integer, integer);

create or replace function public.record_typing_result(
  p_month_id text,
  p_mode text,
  p_accuracy integer,
  p_cpm integer,
  p_score integer,
  p_elapsed_ms integer
)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  -- 문장 데이터 실측 기준. 가장 긴 장문이 277타, 뉴스 본문이 400타 안쪽이다.
  c_max_submission_score constant integer := 600;
  -- 초당 20타 = 1200 CPM. 사람의 최고 기록보다 넉넉히 위다.
  c_max_strokes_per_second constant numeric := 20;
  -- 1시간 누적 상한. 이걸 넘기면 사람이 아니다.
  c_max_hourly_score constant integer := 60000;

  v_profile_id uuid;
  v_recent_score integer;
begin
  if auth.uid() is null then
    raise exception 'Not authenticated';
  end if;

  if p_month_id !~ '^[0-9]{6}$' then
    raise exception 'Invalid month_id';
  end if;

  if p_mode not in ('short', 'long', 'word', 'news') then
    raise exception 'Invalid mode';
  end if;

  -- 정확도 미달은 조용히 버린다. 부정행위가 아니라 그냥 못 친 것이다.
  if p_accuracy < 80 or p_accuracy > 100 then
    return;
  end if;

  if p_cpm < 0 or p_cpm > 5000 then
    return;
  end if;

  select public.current_profile_id() into v_profile_id;
  if v_profile_id is null then
    select id into v_profile_id from public.link_current_google_identity();
  end if;

  -- ---- 여기부터는 사람이 낼 수 없는 값인지 본다 ----
  -- 클라이언트가 보낸 숫자는 위조될 수 있다. 완벽히 막을 수는 없으므로
  -- 물리적으로 불가능한 값을 거르고, 걸리면 탐지 신호를 남긴다.

  if p_score is null or p_score <= 0 or p_score > c_max_submission_score then
    perform public.raise_abuse_signal(
      v_profile_id, null, 'IMPLAUSIBLE_SCORE', 3,
      jsonb_build_object('score', p_score, 'limit', c_max_submission_score, 'mode', p_mode)
    );
    return;
  end if;

  if p_elapsed_ms is null or p_elapsed_ms < 500 or p_elapsed_ms > 3600000 then
    perform public.raise_abuse_signal(
      v_profile_id, null, 'IMPLAUSIBLE_ELAPSED', 3,
      jsonb_build_object('elapsed_ms', p_elapsed_ms, 'score', p_score)
    );
    return;
  end if;

  if p_score > ceil(p_elapsed_ms / 1000.0 * c_max_strokes_per_second) then
    perform public.raise_abuse_signal(
      v_profile_id, null, 'IMPOSSIBLE_SPEED', 3,
      jsonb_build_object(
        'score', p_score,
        'elapsed_ms', p_elapsed_ms,
        'strokes_per_second', round(p_score / (p_elapsed_ms / 1000.0), 1)
      )
    );
    return;
  end if;

  select coalesce(sum(tr.score), 0)
  into v_recent_score
  from public.typing_results tr
  where tr.profile_id = v_profile_id
    and tr.created_at > now() - interval '1 hour';

  if v_recent_score + p_score > c_max_hourly_score then
    perform public.raise_abuse_signal(
      v_profile_id, null, 'HOURLY_SCORE_CAP', 3,
      jsonb_build_object('last_hour_score', v_recent_score, 'limit', c_max_hourly_score)
    );
    return;
  end if;

  -- ---- 통과 ----

  insert into public.typing_results (profile_id, month_id, mode, accuracy, cpm, score, elapsed_ms)
  values (v_profile_id, p_month_id, p_mode, p_accuracy, p_cpm, p_score, p_elapsed_ms);

  insert into public.monthly_stats (profile_id, month_id, score)
  values (v_profile_id, p_month_id, p_score)
  on conflict (profile_id, month_id)
  do update set score = public.monthly_stats.score + p_score;

  update public.profiles
  set
    total_typing_count = total_typing_count + 1,
    max_cpm = greatest(max_cpm, p_cpm)
  where id = v_profile_id;
end;
$$;

-- ---------------------------------------------------------------------------
-- 조회 함수도 새 컬럼명에 맞춘다
-- ---------------------------------------------------------------------------

drop function if exists public.get_monthly_ranking(text, integer);

create or replace function public.get_monthly_ranking(p_month_id text, p_limit integer default 50)
returns table (
  profile_id uuid,
  display_name text,
  score integer
)
language sql
stable
security definer
set search_path = public
as $$
  select
    p.id as profile_id,
    coalesce(nullif(ms.nickname, ''), nullif(p.display_name, ''), '익명') as display_name,
    ms.score
  from public.monthly_stats ms
  join public.profiles p on p.id = ms.profile_id
  where ms.month_id = p_month_id
  order by ms.score desc, ms.updated_at desc, p.created_at asc
  limit least(greatest(coalesce(p_limit, 50), 1), 100)
$$;

create or replace function public.get_my_typing_summary(p_month_id text)
returns table (
  total_typing_count integer,
  max_cpm integer,
  monthly_score integer
)
language plpgsql
stable
security definer
set search_path = public
as $$
declare
  v_profile_id uuid;
begin
  if auth.uid() is null then
    return query select 0, 0, 0;
    return;
  end if;

  select public.current_profile_id() into v_profile_id;

  if v_profile_id is null then
    return query select 0, 0, 0;
    return;
  end if;

  return query
  select
    p.total_typing_count,
    p.max_cpm,
    coalesce(ms.score, 0)
  from public.profiles p
  left join public.monthly_stats ms
    on ms.profile_id = p.id
   and ms.month_id = p_month_id
  where p.id = v_profile_id;
end;
$$;

-- ---------------------------------------------------------------------------
-- 어뷰징 워치리스트도 새 컬럼명에 맞춘다
-- ---------------------------------------------------------------------------

drop function if exists public.get_abuse_watchlist(integer, integer);

create or replace function public.get_abuse_watchlist(
  p_since_days integer default 30,
  p_limit integer default 50
)
returns table (
  profile_id uuid,
  display_name text,
  email text,
  risk_score integer,
  max_severity smallint,
  signal_count integer,
  rule_codes text[],
  last_seen_at timestamptz,
  monthly_score integer
)
language sql
stable
security definer
set search_path = public
as $$
  select
    p.id,
    coalesce(nullif(p.display_name, ''), '익명'),
    p.email::text,
    sum(a.severity * a.severity * (1 + ln(a.occurrence_count)))::integer,
    max(a.severity),
    count(*)::integer,
    array_agg(distinct a.rule_code order by a.rule_code),
    max(a.last_seen_at),
    coalesce(max(ms.score), 0)
  from public.abuse_signals a
  join public.profiles p on p.id = a.profile_id
  left join public.monthly_stats ms
    on ms.profile_id = p.id
   and ms.month_id = to_char(now() at time zone 'Asia/Seoul', 'YYYYMM')
  where a.reviewed_at is null
    and a.last_seen_at > now() - make_interval(days => greatest(coalesce(p_since_days, 30), 1))
    and public.is_admin()
  group by p.id, p.display_name, p.email
  order by 4 desc, 8 desc
  limit least(greatest(coalesce(p_limit, 50), 1), 500)
$$;

grant execute on function public.record_typing_result(text, text, integer, integer, integer, integer) to authenticated;
grant execute on function public.get_monthly_ranking(text, integer) to anon, authenticated;
grant execute on function public.get_my_typing_summary(text) to authenticated;
grant execute on function public.get_abuse_watchlist(integer, integer) to authenticated;

notify pgrst, 'reload schema';
