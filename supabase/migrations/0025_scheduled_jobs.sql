-- 추첨·만료·재추첨·주소파기·무결성정리를 pg_cron으로 자동 실행한다.
--
-- 지금까지는 `0019` 맨 아래에 등록 예시가 주석으로만 있었다. 등록하지 않으면
-- **아무것도 자동으로 돌지 않는다.** 관리자가 매달 1일 00:00에 직접 버튼을
-- 누르지 않으면 추첨이 없고, 3일 기한이 지나도 재추첨이 없고, 배송이 끝난
-- 주소가 계속 남는다.
--
-- ⚠️ 시각은 전부 UTC다. KST는 +9시간이라 00:00 KST = 전날 15:00 UTC다.
--    pg_cron에는 "매월 1일"을 KST로 표현할 방법이 없다(크론은 UTC 날짜를 본다).
--    그래서 날짜 판정을 SQL 쪽으로 옮겼다 — 잡은 매일 돌고, 함수가 1일인지 본다.
--
-- ⚠️ 이 파일을 실행하기 전에 pg_cron 확장이 켜져 있어야 한다.
--    Supabase 대시보드 → Database → Extensions → pg_cron 검색 → 활성화.
--    아래 create extension으로도 되지만, 대시보드 쪽이 확실하다.

create extension if not exists pg_cron;

-- ---------------------------------------------------------------------------
-- 1. 매월 1일 추첨을 안전하게 감싼다
-- ---------------------------------------------------------------------------
--
-- 크론 명령에 날짜 조건을 넣는 대신 함수로 옮긴 이유
--   `select f() where <조건>` 은 조건이 거짓이면 f()가 호출되지 않는다는 것에
--   기대는 형태다. 맞는 동작이지만, 스케줄러가 조용히 잘못 도는 것보다
--   함수 안에서 명시적으로 판정하는 편이 읽기도 쉽고 손으로 시험하기도 쉽다.
--
-- 실패해도 잡 전체를 죽이지 않는다. 후보가 없는 달은 run_monthly_draw가
-- 예외를 던지는데, 그것 때문에 크론 잡이 실패로 기록되면 진짜 문제를 놓친다.

create or replace function public.run_scheduled_monthly_draw()
returns integer
language plpgsql
security definer
set search_path = public
as $$
declare
  v_today date := (now() at time zone 'Asia/Seoul')::date;
  v_month text;
  v_drawn integer := 0;
begin
  -- KST 기준으로 1일이 아니면 아무것도 하지 않는다.
  if extract(day from v_today) <> 1 then
    return 0;
  end if;

  -- 1일에 뽑는 것은 **지난달** 순위다.
  v_month := to_char(v_today - interval '1 day', 'YYYYMM');

  begin
    select count(*) into v_drawn
    from public.run_monthly_draw(v_month, '자동 추첨');
  exception when others then
    -- 후보가 없거나(첫 달) 이미 다 뽑혔으면 여기로 온다. 잡은 성공으로 끝낸다.
    raise notice '자동 추첨 건너뜀 (month_id=%): %', v_month, sqlerrm;
    return 0;
  end;

  return v_drawn;
end;
$$;

comment on function public.run_scheduled_monthly_draw() is
  'pg_cron이 매일 부르고, KST 1일일 때만 지난달 추첨을 실행한다.';

revoke all on function public.run_scheduled_monthly_draw() from public, anon, authenticated;

-- ---------------------------------------------------------------------------
-- 2. 주소 파기가 취소된 당첨자를 빠뜨리고 있었다
-- ---------------------------------------------------------------------------
--
-- 기존 purge_delivered_addresses는 status='confirmed'인 주소만 지웠다.
-- 그런데 주소를 낸 뒤(=confirmed) 관리자가 부정행위 등으로 취소하면 status가
-- 'voided'로 바뀐다. 그 순간 그 사람의 이름·전화번호·주소는 **파기 대상에서
-- 영원히 빠진다.** 자동 파기를 등록하기 전에 막아야 한다.
--
-- expired는 원래 주소를 낼 수 없지만(0022가 기한을 강제한다), 과거에 만들어진
-- 행이 있을 수 있어 함께 본다.

create or replace function public.purge_delivered_addresses(p_days integer default 90)
returns integer
language plpgsql
security definer
set search_path = public
as $$
declare
  v_days integer := greatest(coalesce(p_days, 90), 7);
  v_deleted integer;
begin
  delete from public.winner_addresses a
  using public.prize_winners w
  where w.id = a.winner_id
    and (
      -- 배송이 끝났을 만큼 시간이 지난 정상 당첨
      (w.status = 'confirmed' and w.responded_at < now() - make_interval(days => v_days))
      -- 취소·만료된 당첨은 보관할 근거가 없다. 유예만 두고 지운다.
      or (w.status in ('voided', 'expired')
          and coalesce(w.responded_at, w.created_at) < now() - make_interval(days => 7))
    );

  get diagnostics v_deleted = row_count;
  return v_deleted;
end;
$$;

comment on function public.purge_delivered_addresses(integer) is
  '배송이 끝난 주소를 파기한다. 취소·만료된 당첨의 주소는 7일 뒤 지운다 — 보관할 근거가 없다.';

revoke all on function public.purge_delivered_addresses(integer) from public, anon, authenticated;

-- ---------------------------------------------------------------------------
-- 3. 무결성 데이터 정리에 검산 집계도 포함시킨다
-- ---------------------------------------------------------------------------
--
-- score_verifications는 사용자·날짜당 한 행이라 크지 않지만, 정리하는 곳이
-- 하나면 나중에 잊지 않는다.
--
-- ⚠️ 반환 컬럼이 2개에서 3개로 늘어난다. create or replace로는 안 되므로
--    먼저 지운다. 크론과 관리자만 부르는 함수라 영향 범위가 없다.

drop function if exists public.prune_integrity_data(integer, integer);

create or replace function public.prune_integrity_data(
  p_session_days integer default 120,
  p_reviewed_signal_days integer default 400,
  p_verification_days integer default 180
)
returns table (deleted_sessions integer, deleted_signals integer, deleted_verifications integer)
language plpgsql
security definer
set search_path = public
as $$
declare
  v_sessions integer;
  v_signals integer;
  v_verifications integer;
begin
  -- 신호가 붙지 않은 평범한 세션만 지운다. 근거가 남아 있어야 할 세션은 보존.
  delete from public.typing_sessions ts
  where ts.last_seen_at < now() - make_interval(days => greatest(p_session_days, 7))
    and not exists (select 1 from public.abuse_signals a where a.session_id = ts.id);
  get diagnostics v_sessions = row_count;

  delete from public.abuse_signals
  where reviewed_at is not null
    and reviewed_at < now() - make_interval(days => greatest(p_reviewed_signal_days, 30));
  get diagnostics v_signals = row_count;

  delete from public.score_verifications
  where day < ((now() at time zone 'Asia/Seoul')::date
               - greatest(coalesce(p_verification_days, 180), 30));
  get diagnostics v_verifications = row_count;

  return query select v_sessions, v_signals, v_verifications;
end;
$$;

revoke all on function public.prune_integrity_data(integer, integer, integer)
  from public, anon, authenticated;

-- ---------------------------------------------------------------------------
-- 4. 잡 등록
-- ---------------------------------------------------------------------------
--
-- 다시 실행해도 잡이 겹치지 않도록 같은 이름을 먼저 지운다.
-- cron.unschedule은 없는 이름에 예외를 던지므로 있는 것만 골라 지운다.

do $$
declare
  v_name text;
begin
  for v_name in
    select jobname from cron.job
    where jobname in (
      'typenews-prize-draw',
      'typenews-prize-expire',
      'typenews-address-purge',
      'typenews-prune-integrity',
      -- 0019 주석의 예시 이름으로 등록해뒀다면 그것도 걷어낸다
      'prize-draw', 'prize-expire', 'prize-purge', 'prune-integrity'
    )
  loop
    perform cron.unschedule(v_name);
  end loop;
end;
$$;

/* 추첨 — 매일 15:00 UTC = 00:00 KST. 함수가 KST 1일에만 실제로 뽑는다. */
select cron.schedule(
  'typenews-prize-draw',
  '0 15 * * *',
  $$select public.run_scheduled_monthly_draw()$$
);

/* 무응답 만료 + 재추첨 — 매일 15:05 UTC = 00:05 KST.
   ⚠️ 추첨 잡과 5분 띄운다. 1일 00:00에는 두 잡이 겹치는데, pg_cron은 잡을
      동시에 띄우므로 같은 달을 두 세션이 함께 뽑으려 할 여지를 남기지 않는다.
      회신 기한은 date_trunc('day')로 잡히므로 5분 늦어도 3일 23:50 그대로다. */
select cron.schedule(
  'typenews-prize-expire',
  '5 15 * * *',
  $$select public.expire_stale_winners()$$
);

/* 배송 완료 주소 파기 — 토요일 18:00 UTC = 일요일 03:00 KST.
   ⚠️ 0019 주석의 '0 18 * * 0'은 일요일 18:00 UTC라 실제로는 월요일 03:00 KST였다. */
select cron.schedule(
  'typenews-address-purge',
  '0 18 * * 6',
  $$select public.purge_delivered_addresses(90)$$
);

/* 무결성 집계 정리 — 매일 19:20 UTC = 04:20 KST. 사람이 가장 적은 시간대다. */
select cron.schedule(
  'typenews-prune-integrity',
  '20 19 * * *',
  $$select public.prune_integrity_data()$$
);

-- ---------------------------------------------------------------------------
-- 확인
-- ---------------------------------------------------------------------------
--
--   -- 등록된 잡
--   select jobid, jobname, schedule, active, command from cron.job order by jobname;
--
--   -- 최근 실행 결과 (실패했으면 status='failed', return_message에 이유)
--   select j.jobname, r.start_time, r.status, r.return_message
--   from cron.job_run_details r join cron.job j using (jobid)
--   order by r.start_time desc limit 20;
--
--   -- 손으로 한 번 돌려보기 (1일이 아니면 0을 돌려주는 것이 정상)
--   select public.run_scheduled_monthly_draw();
--
-- ⚠️ 8월 1일 첫 추첨은 이 잡에 맡기지 말고 관리자 화면에서 직접 실행하고
--    결과를 눈으로 확인할 것. 자동화는 9월부터 믿는다.
--    (그래도 잡이 먼저 돌아버리면 run_monthly_draw가 이미 채워진 경품을
--     다시 뽑지 않으므로 중복 당첨은 생기지 않는다.)
