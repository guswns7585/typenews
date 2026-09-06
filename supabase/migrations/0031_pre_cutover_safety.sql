-- 도메인 커트오버 전 Supabase가 운영 데이터처럼 행동하지 않게 막는다.
--
-- 현재 실제 사용량은 Firebase에 쌓이고 Supabase와 실시간 동기화되지 않는다.
-- 이 상태에서 1일 cron이 돌면 오래된 이관 순위로 당첨자를 만들 수 있다.
-- 수동 실행을 포함한 모든 추첨을 운영 플래그 뒤에 두고 기본값을 false로 둔다.

create table if not exists public.operational_controls (
  singleton boolean primary key default true check (singleton),
  draws_enabled boolean not null default false,
  updated_at timestamptz not null default now(),
  updated_by uuid references public.profiles(id) on delete set null
);

insert into public.operational_controls (singleton, draws_enabled)
values (true, false)
on conflict (singleton) do nothing;

comment on table public.operational_controls is
  '운영 전환 플래그. Firebase와 데이터가 분리된 동안 추첨을 실행하지 않도록 기본값은 false다.';

alter table public.operational_controls enable row level security;

drop policy if exists "operational_controls_admin_select" on public.operational_controls;
create policy "operational_controls_admin_select"
on public.operational_controls for select
to authenticated
using (public.is_admin());

revoke all on public.operational_controls from anon, authenticated;
grant select on public.operational_controls to authenticated;

create or replace function public.get_draws_enabled()
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select case
    when public.is_admin() then coalesce(
      (select c.draws_enabled from public.operational_controls c where c.singleton),
      false
    )
    else false
  end
$$;

create or replace function public.set_draws_enabled(p_enabled boolean)
returns boolean
language plpgsql
security definer
set search_path = public
as $$
begin
  if not public.is_admin() then
    raise exception 'Admin only';
  end if;

  insert into public.operational_controls (singleton, draws_enabled, updated_at, updated_by)
  values (true, coalesce(p_enabled, false), now(), public.current_profile_id())
  on conflict (singleton) do update set
    draws_enabled = excluded.draws_enabled,
    updated_at = excluded.updated_at,
    updated_by = excluded.updated_by;

  return coalesce(p_enabled, false);
end;
$$;

-- 0030의 실제 추첨 구현을 내부 함수로 옮기고, 원래 이름에는 운영 플래그를 검사하는
-- 얇은 문지기를 둔다. 기존 cron·관리자 래퍼는 이름으로 호출하므로 자동으로 문지기를 탄다.
do $$
begin
  if to_regprocedure('public.run_monthly_draw_unchecked(text,text)') is null then
    alter function public.run_monthly_draw(text, text)
      rename to run_monthly_draw_unchecked;
  end if;
end;
$$;

create or replace function public.run_monthly_draw(
  p_month_id text,
  p_note text default null
)
returns table (
  winner_id bigint,
  profile_id uuid,
  prize_name text,
  rank_at_draw integer,
  tickets_at_draw integer
)
language plpgsql
security definer
set search_path = public
as $$
begin
  if not coalesce(
    (select c.draws_enabled from public.operational_controls c where c.singleton),
    false
  ) then
    raise exception '추첨이 비활성화되어 있습니다. 최종 데이터 이관과 운영 전환을 먼저 완료하세요';
  end if;

  return query
  select * from public.run_monthly_draw_unchecked(p_month_id, p_note);
end;
$$;

comment on function public.run_monthly_draw(text, text) is
  '운영 플래그를 확인한 뒤 고정된 회차 스냅샷에서 월간 추첨을 실행한다.';

revoke all on function public.run_monthly_draw_unchecked(text, text)
  from public, anon, authenticated;
revoke all on function public.run_monthly_draw(text, text)
  from public, anon, authenticated;
revoke all on function public.get_draws_enabled() from public, anon;
revoke all on function public.set_draws_enabled(boolean) from public, anon;
grant execute on function public.get_draws_enabled() to authenticated;
grant execute on function public.set_draws_enabled(boolean) to authenticated;

-- 이벤트 기간에는 이의 제기를 위해 원시 제출을 30일 보존한다.
-- 월별 점수와 일 집계는 별도 표에 있으므로 이 변경은 랭킹 계산에 영향을 주지 않는다.
do $$
declare
  v_name text;
begin
  for v_name in
    select jobname from cron.job where jobname = 'typenews-rollup-typing'
  loop
    perform cron.unschedule(v_name);
  end loop;
end;
$$;

select cron.schedule(
  'typenews-rollup-typing',
  '40 19 * * *',
  $$select public.rollup_typing_results(30)$$
);

-- monthly_stats에는 profiles.email과 같은 이메일 및 Firestore 원문 전체가 중복으로
-- 보관돼 있었다. 랭킹과 앱은 이 컬럼을 사용하지 않는다. 로컬 백업은 그대로 둔다.
alter table public.monthly_stats
  drop column if exists email,
  drop column if exists raw_data,
  drop column if exists source_path;

notify pgrst, 'reload schema';

-- 커트오버 직전 최종 백업 이관과 점수 검증을 마친 뒤 관리자 계정으로 한 번만 실행:
--   select public.set_draws_enabled(true);
-- 상태 확인:
--   select public.get_draws_enabled();
--   select jobname, schedule, active, command
--   from cron.job where jobname = 'typenews-rollup-typing';
