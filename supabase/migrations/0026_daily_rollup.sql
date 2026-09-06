-- typing_results를 사용자·날짜·모드당 한 행으로 접고 원시행을 지운다.
--
-- 무엇이 문제인가
--   typing_results는 문장 하나마다 1행이다. 랭킹은 monthly_stats만 읽으므로
--   이 표는 탐지와 사후 조사에만 쓰이는데, 행 수는 "완료한 문장 수"에 비례해
--   무한히 늘어난다. 무료 한도(500MB)를 채우는 유일한 표다.
--
--   하루 3,000문장을 치는 사용자 한 명이 월 12.2MB다. 행당 약 135바이트.
--   활성 100명이 하루 300문장씩만 쳐도 하루 3만 행(약 4MB)이다.
--
-- 무엇을 잃는가
--   원시행을 지우면 "몇 시 몇 분에 어떤 문장을 쳤는지"는 사라진다. 남는 것은
--   날짜·모드별 제출 수, 점수 합, 최고/합계 CPM, 정확도 합, 소요 시간 합이다.
--   평균은 합에서 되살릴 수 있다.
--
-- 무엇이 안전한가 ★
--   원시행을 읽는 곳은 딱 둘이고 **둘 다 최근 것만 본다.**
--     record_typing_result   — 최근 1시간 점수 합 (시간당 상한)
--     evaluate_server_side_signals — 최근 2시간 제출 간격 (UNIFORM_SUBMIT_INTERVAL)
--   기본 보존 14일은 그 둘보다 한참 길다. 랭킹(monthly_stats)과 누적 카운터
--   (typing_mode_counts, profiles.total_typing_count)는 별도 표라 영향이 없다.

-- ---------------------------------------------------------------------------
-- 1. 일 집계
-- ---------------------------------------------------------------------------

create table if not exists public.daily_typing_stats (
  profile_id uuid not null references public.profiles(id) on delete cascade,
  -- Asia/Seoul 기준 날짜. 점수와 랭킹이 KST 기준이라 여기도 맞춘다.
  day date not null,
  mode text not null check (mode in ('short', 'long', 'word', 'news')),

  -- 제출 횟수. 단어 모드는 10개 묶음이 1이다 (typing_results와 같은 기준).
  submissions integer not null default 0 check (submissions >= 0),
  score integer not null default 0 check (score >= 0),

  max_cpm integer not null default 0 check (max_cpm >= 0),
  -- 평균을 되살리기 위한 합. 개별 값은 남기지 않는다.
  cpm_sum bigint not null default 0 check (cpm_sum >= 0),
  accuracy_sum bigint not null default 0 check (accuracy_sum >= 0),
  elapsed_ms bigint not null default 0 check (elapsed_ms >= 0),

  first_at timestamptz,
  last_at timestamptz,
  primary key (profile_id, day, mode)
);

comment on table public.daily_typing_stats is
  'typing_results를 접은 일 집계. 원시행이 지워져도 이 표는 남는다. 랭킹에는 쓰이지 않는다.';
comment on column public.daily_typing_stats.submissions is
  '제출 횟수. 단어 모드는 10개 묶음이 1이다.';

create index if not exists daily_typing_stats_day_idx
  on public.daily_typing_stats (day desc);

alter table public.daily_typing_stats enable row level security;

drop policy if exists "daily_typing_stats_own" on public.daily_typing_stats;
create policy "daily_typing_stats_own"
on public.daily_typing_stats for select
to authenticated
using (profile_id = public.current_profile_id() or public.is_admin());

revoke all on public.daily_typing_stats from anon, authenticated;
grant select on public.daily_typing_stats to authenticated;

-- ---------------------------------------------------------------------------
-- 2. 접기
-- ---------------------------------------------------------------------------
--
-- ⚠️ 지우는 것과 세는 것이 반드시 같은 행이어야 한다.
--    "먼저 집계하고 나중에 지운다"로 짜면, 그 사이에 들어온 행이 집계에는
--    빠지고 삭제에는 걸려 점수 기록이 조용히 사라진다. 반대로 "지우고 나서
--    다시 집계"하면 지운 것을 셀 수 없다.
--    그래서 DELETE ... RETURNING을 CTE로 두고 그 결과만 집계한다.
--    한 문장 안에서 원자적으로 끝나므로 어긋날 여지가 없다.

create or replace function public.rollup_typing_results(p_keep_days integer default 14)
returns table (rolled_days integer, deleted_rows integer)
language plpgsql
security definer
set search_path = public
as $$
declare
  -- 최소 3일은 남긴다. 탐지 룰이 보는 2시간보다 넉넉해야 한다.
  v_keep integer := greatest(coalesce(p_keep_days, 14), 3);
  v_cutoff timestamptz := now() - make_interval(days => v_keep);
  v_rolled integer;
  v_deleted integer;
begin
  with removed as (
    delete from public.typing_results
    where created_at < v_cutoff
    returning profile_id, mode, accuracy, cpm, score, elapsed_ms, created_at
  ),
  agg as (
    select
      r.profile_id,
      (r.created_at at time zone 'Asia/Seoul')::date as day,
      r.mode,
      count(*)::integer as submissions,
      coalesce(sum(r.score), 0)::integer as score,
      coalesce(max(r.cpm), 0)::integer as max_cpm,
      coalesce(sum(r.cpm), 0)::bigint as cpm_sum,
      coalesce(sum(r.accuracy), 0)::bigint as accuracy_sum,
      /* 아주 오래된 행에는 elapsed_ms가 없다(0006 이전).
         없는 것을 0으로 두면 "빨리 친 것"으로 보이지만, 합계라 왜곡이 작고
         제출 수로 나눈 평균을 볼 때 이상하면 바로 눈에 띈다. */
      coalesce(sum(coalesce(r.elapsed_ms, 0)), 0)::bigint as elapsed_ms,
      min(r.created_at) as first_at,
      max(r.created_at) as last_at
    from removed r
    group by 1, 2, 3
  ),
  merged as (
    insert into public.daily_typing_stats as d (
      profile_id, day, mode, submissions, score,
      max_cpm, cpm_sum, accuracy_sum, elapsed_ms, first_at, last_at
    )
    select
      a.profile_id, a.day, a.mode, a.submissions, a.score,
      a.max_cpm, a.cpm_sum, a.accuracy_sum, a.elapsed_ms, a.first_at, a.last_at
    from agg a
    on conflict (profile_id, day, mode) do update set
      -- 같은 날을 두 번 접어도 합쳐진다. 원시행은 이미 지워졌으므로 두 번 세지 않는다.
      submissions = d.submissions + excluded.submissions,
      score = d.score + excluded.score,
      max_cpm = greatest(d.max_cpm, excluded.max_cpm),
      cpm_sum = d.cpm_sum + excluded.cpm_sum,
      accuracy_sum = d.accuracy_sum + excluded.accuracy_sum,
      elapsed_ms = d.elapsed_ms + excluded.elapsed_ms,
      first_at = least(d.first_at, excluded.first_at),
      last_at = greatest(d.last_at, excluded.last_at)
    returning 1
  )
  select
    (select count(*) from agg)::integer,
    (select count(*) from removed)::integer
  into v_rolled, v_deleted;

  return query select coalesce(v_rolled, 0), coalesce(v_deleted, 0);
end;
$$;

comment on function public.rollup_typing_results(integer) is
  '보존기간이 지난 typing_results를 daily_typing_stats로 접고 지운다. 지우는 행과 세는 행이 같도록 한 문장으로 처리한다.';

revoke all on function public.rollup_typing_results(integer) from public, anon, authenticated;

-- ---------------------------------------------------------------------------
-- 3. 관리자 조회
-- ---------------------------------------------------------------------------

create or replace function public.get_daily_typing_summary(p_days integer default 30)
returns table (
  day date,
  profiles integer,
  submissions bigint,
  score bigint,
  avg_cpm numeric,
  avg_accuracy numeric
)
language sql
stable
security definer
set search_path = public
as $$
  select
    d.day,
    count(distinct d.profile_id)::integer,
    sum(d.submissions),
    sum(d.score),
    case when sum(d.submissions) > 0
      then round(sum(d.cpm_sum)::numeric / sum(d.submissions), 1) end,
    case when sum(d.submissions) > 0
      then round(sum(d.accuracy_sum)::numeric / sum(d.submissions), 1) end
  from public.daily_typing_stats d
  where d.day > ((now() at time zone 'Asia/Seoul')::date
                 - greatest(coalesce(p_days, 30), 1))
    and public.is_admin()
  group by d.day
  order by d.day desc
$$;

grant execute on function public.get_daily_typing_summary(integer) to authenticated;

-- ---------------------------------------------------------------------------
-- 4. 잡 등록 — 매일 19:40 UTC = 04:40 KST
-- ---------------------------------------------------------------------------
--
-- 0025의 무결성 정리(04:20 KST) 다음이다. 사람이 가장 적은 시간대에 몰아둔다.

do $$
declare
  v_name text;
begin
  for v_name in select jobname from cron.job where jobname = 'typenews-rollup-typing'
  loop
    perform cron.unschedule(v_name);
  end loop;
end;
$$;

select cron.schedule(
  'typenews-rollup-typing',
  '40 19 * * *',
  $$select public.rollup_typing_results(14)$$
);

-- ---------------------------------------------------------------------------
-- 보존 기간을 바꾸려면
-- ---------------------------------------------------------------------------
--
--   14일: 활성 100명 × 하루 300문장 기준 약 56MB. 기본값.
--   30일: 약 120MB. 이벤트 중 분쟁 조사를 넉넉히 하려면.
--    7일: 약 28MB. 한도가 급하면.
--
--   select cron.unschedule('typenews-rollup-typing');
--   select cron.schedule('typenews-rollup-typing', '40 19 * * *',
--     $$select public.rollup_typing_results(30)$$);
--
-- 지금 한 번 손으로 돌려보려면 (되돌릴 수 없으니 보존일수를 확인하고):
--
--   select * from public.rollup_typing_results(14);
--
-- ⚠️ 8월 이벤트 기간에는 30일로 두는 편이 낫다. 이의 제기가 들어왔을 때
--    원시 제출 시각이 남아 있어야 설명할 수 있다. 9월에 14일로 내린다.

notify pgrst, 'reload schema';
