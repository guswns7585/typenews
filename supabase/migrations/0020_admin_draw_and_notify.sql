-- 관리자 화면에서 추첨을 돌리고 메일 발송 여부를 기록할 수 있게 한다.
--
-- 배경: 도메인 DNS를 통제할 수 없어 @typenews.kr 발신을 붙이지 못한다.
-- 그래서 당분간 메일은 사람이 보낸다. 대신 화면이 완성된 본문을 만들어 주고,
-- 보낸 사실을 여기에 기록해 "누가 아직 못 받았는지"를 잃지 않게 한다.
--
-- run_monthly_draw / expire_stale_winners 자체는 0019에서 클라이언트에 닫아뒀다.
-- 관리자용 얇은 래퍼를 따로 둔다.

-- ---------------------------------------------------------------------------
-- 관리자 래퍼
-- ---------------------------------------------------------------------------

create or replace function public.admin_run_monthly_draw(p_month_id text)
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
  if not public.is_admin() then
    raise exception 'Admin only';
  end if;
  return query select * from public.run_monthly_draw(p_month_id, '관리자 수동 실행');
end;
$$;

create or replace function public.admin_expire_stale_winners()
returns integer
language plpgsql
security definer
set search_path = public
as $$
begin
  if not public.is_admin() then
    raise exception 'Admin only';
  end if;
  return public.expire_stale_winners();
end;
$$;

/** 메일을 보냈다고 표시한다. 되돌릴 수 있게 null로도 만들 수 있다. */
create or replace function public.mark_winner_notified(
  p_winner_id bigint,
  p_sent boolean default true
)
returns void
language plpgsql
security definer
set search_path = public
as $$
begin
  if not public.is_admin() then
    raise exception 'Admin only';
  end if;

  update public.prize_winners
  set notified_at = case when p_sent then coalesce(notified_at, now()) else null end
  where id = p_winner_id;

  if not found then
    raise exception '당첨 내역을 찾을 수 없습니다';
  end if;
end;
$$;

-- ---------------------------------------------------------------------------
-- 목록에 협찬사를 더한다
-- ---------------------------------------------------------------------------
--
-- ⚠️ 반환 컬럼이 늘어난다. create or replace로는 반환 타입을 못 바꾸므로
--    (cannot change return type of existing function) 먼저 지운다. 0014에서 겪었다.

drop function if exists public.get_prize_winners(text, integer);

create function public.get_prize_winners(
  p_month_id text default null,
  p_limit integer default 100
)
returns table (
  winner_id bigint,
  month_id text,
  display_name text,
  email text,
  prize_name text,
  prize_sponsor text,
  score_at_draw integer,
  rank_at_draw integer,
  tickets_at_draw integer,
  win_odds numeric,
  status text,
  respond_by timestamptz,
  notified_at timestamptz,
  response_channel text,
  response_note text,
  has_address boolean,
  created_at timestamptz
)
language sql
stable
security definer
set search_path = public
as $$
  select
    w.id,
    w.month_id,
    coalesce(nullif(p.display_name, ''), '익명'),
    p.email::text,
    w.prize_name,
    w.prize_sponsor,
    w.score_at_draw,
    w.rank_at_draw,
    w.tickets_at_draw,
    case when w.total_tickets_at_draw > 0
      then round(w.tickets_at_draw::numeric * 100 / w.total_tickets_at_draw, 2)
      else 0 end,
    w.status,
    w.respond_by,
    w.notified_at,
    w.response_channel,
    w.response_note,
    exists (select 1 from public.winner_addresses a where a.winner_id = w.id),
    w.created_at
  from public.prize_winners w
  join public.profiles p on p.id = w.profile_id
  where public.is_admin()
    and (p_month_id is null or w.month_id = p_month_id)
  order by w.created_at desc
  limit least(greatest(coalesce(p_limit, 100), 1), 500)
$$;

-- ---------------------------------------------------------------------------
-- 추첨 전 미리보기
-- ---------------------------------------------------------------------------
--
-- 실제로 뽑기 전에 후보와 응모권 배분을 확인할 수 있어야 한다.
-- run_monthly_draw와 같은 규칙으로 계산한다.

create or replace function public.preview_draw_pool(p_month_id text, p_limit integer default 50)
returns table (
  rank integer,
  profile_id uuid,
  display_name text,
  score integer,
  tickets integer,
  odds numeric,
  already_won boolean
)
language sql
stable
security definer
set search_path = public
as $$
  with ranked as (
    select
      ms.profile_id,
      ms.score,
      row_number() over (order by ms.score desc, ms.updated_at desc, ms.profile_id)::integer as rank
    from public.monthly_stats ms
    where ms.month_id = p_month_id and ms.score > 0
  ),
  pooled as (
    select
      r.*,
      case
        when r.rank = 1 then 8
        when r.rank = 2 then 5
        when r.rank = 3 then 3
        when r.rank between 4 and 10 then 2
        when r.rank between 11 and 50 then 1
        else 0
      end as tickets,
      exists (
        select 1 from public.prize_winners w
        where w.month_id = p_month_id and w.profile_id = r.profile_id
      ) as already_won
    from ranked r
  ),
  total as (
    select coalesce(sum(tickets), 0)::numeric as t
    from pooled where tickets > 0 and not already_won
  )
  select
    p.rank,
    p.profile_id,
    coalesce(nullif(pr.display_name, ''), '익명'),
    p.score,
    p.tickets,
    case when (select t from total) > 0 and not p.already_won
      then round(p.tickets * 100 / (select t from total), 2) else 0 end,
    p.already_won
  from pooled p
  join public.profiles pr on pr.id = p.profile_id
  where public.is_admin() and p.tickets > 0
  order by p.rank
  limit least(greatest(coalesce(p_limit, 50), 1), 50)
$$;

-- ---------------------------------------------------------------------------
-- 권한
-- ---------------------------------------------------------------------------

revoke all on function public.admin_run_monthly_draw(text) from public, anon;
revoke all on function public.admin_expire_stale_winners() from public, anon;
revoke all on function public.mark_winner_notified(bigint, boolean) from public, anon;
revoke all on function public.get_prize_winners(text, integer) from public, anon;
revoke all on function public.preview_draw_pool(text, integer) from public, anon;

grant execute on function public.admin_run_monthly_draw(text) to authenticated;
grant execute on function public.admin_expire_stale_winners() to authenticated;
grant execute on function public.mark_winner_notified(bigint, boolean) to authenticated;
grant execute on function public.get_prize_winners(text, integer) to authenticated;
grant execute on function public.preview_draw_pool(text, integer) to authenticated;

notify pgrst, 'reload schema';
