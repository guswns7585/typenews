-- 추첨 순간의 최종 순위와 응모권 풀을 회차별로 영구 보존한다.
--
-- 기존 prize_winners에는 당첨자 정보만 남는다. 당첨되지 않은 후보와 각 후보의
-- 응모권이 사라지므로, 나중에 "누가 어떤 확률로 후보였는지"를 재현할 수 없었다.
-- 이 마이그레이션부터 run_monthly_draw는 상위 50명의 풀을 먼저 고정하고,
-- 그 스냅샷만을 사용해 당첨자를 뽑는다.

create table if not exists public.prize_draw_pool_entries (
  draw_id bigint not null references public.prize_draws(id) on delete cascade,
  rank_at_draw integer not null check (rank_at_draw between 1 and 50),
  -- 계정이 삭제돼도 추첨 근거는 남긴다. 닉네임도 별도로 스냅샷한다.
  profile_id uuid references public.profiles(id) on delete set null,
  display_name_at_draw text not null,
  score_at_draw integer not null check (score_at_draw > 0),
  tickets_at_draw integer not null check (tickets_at_draw in (1, 2, 3, 5, 8)),
  eligible_at_draw boolean not null,
  exclusion_reason text check (exclusion_reason in ('already_won')),
  -- 실제 선택된 행에만 채운다. 선택 순서와 당시 남아 있던 응모권 합계로
  -- 여러 경품을 연속 추첨했을 때의 정확한 확률도 재현할 수 있다.
  selected_order integer check (selected_order > 0),
  tickets_available_at_pick integer check (tickets_available_at_pick > 0),
  selected_prize_id bigint references public.event_prizes(id) on delete set null,
  selected_prize_name text,
  winner_id bigint references public.prize_winners(id) on delete set null,
  created_at timestamptz not null default now(),
  primary key (draw_id, rank_at_draw),
  unique (draw_id, profile_id),
  unique (draw_id, selected_order),
  check (
    (eligible_at_draw and exclusion_reason is null)
    or (not eligible_at_draw and exclusion_reason is not null)
  ),
  check (
    (
      selected_order is null
      and tickets_available_at_pick is null
      and selected_prize_id is null
      and selected_prize_name is null
      and winner_id is null
    )
    or (
      eligible_at_draw
      and selected_order is not null
      and tickets_available_at_pick is not null
      and selected_prize_name is not null
    )
  )
);

create index if not exists prize_draw_pool_entries_profile_idx
  on public.prize_draw_pool_entries (profile_id, draw_id desc);

comment on table public.prize_draw_pool_entries is
  '추첨 회차별 상위 50명 순위·점수·응모권·선택 순서 스냅샷. 추첨 감사 근거이므로 지우지 않는다.';

-- ---------------------------------------------------------------------------
-- 스냅샷을 고정한 뒤 그 안에서만 뽑는다
-- ---------------------------------------------------------------------------

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
declare
  v_round integer;
  v_draw_id bigint;
  v_candidates integer;
  v_total integer;
  v_available_total integer;
  v_prize record;
  v_pick record;
  v_winner_id bigint;
  v_pick_order integer := 0;
  v_deadline timestamptz;
begin
  if p_month_id !~ '^[0-9]{6}$' then
    raise exception '잘못된 month_id입니다';
  end if;

  /* cron과 관리자 수동 실행이 겹쳐도 한 달 추첨은 한 트랜잭션씩만 돈다. */
  perform pg_advisory_xact_lock(
    hashtextextended('typenews:prize-draw:' || p_month_id, 0)
  );

  v_deadline := (
    date_trunc('day', now() at time zone 'Asia/Seoul')
    + interval '2 days' + interval '23 hours 50 minutes'
  ) at time zone 'Asia/Seoul';

  -- 아직 주인이 없는 활성 경품이 없으면 빈 결과로 끝낸다.
  if not exists (
    select 1
    from public.event_prizes p
    where p.enabled
      and not exists (
        select 1
        from public.prize_winners w
        where w.month_id = p_month_id
          and w.prize_id = p.id
          and w.status in ('pending', 'confirmed')
      )
  ) then
    return;
  end if;

  select coalesce(max(d.round), 0) + 1
  into v_round
  from public.prize_draws d
  where d.month_id = p_month_id;

  /* 먼저 회차를 만든 뒤 상위 50명을 한 번만 계산해 고정한다.
     candidate_count/total_tickets는 스냅샷을 넣은 뒤 실제 행에서 계산한다. */
  insert into public.prize_draws (
    month_id, candidate_count, total_tickets, round, note
  )
  values (p_month_id, 0, 0, v_round, p_note)
  returning id into v_draw_id;

  with ranked as (
    select
      ms.profile_id,
      coalesce(nullif(ms.nickname, ''), nullif(p.display_name, ''), '익명') as display_name,
      ms.score,
      row_number() over (
        /* get_monthly_ranking과 같은 동점 순서. profile_id는 완전 동률의 최종 고정값이다. */
        order by ms.score desc, ms.updated_at desc, p.created_at asc, ms.profile_id
      )::integer as rank
    from public.monthly_stats ms
    join public.profiles p on p.id = ms.profile_id
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
        select 1
        from public.prize_winners w
        where w.month_id = p_month_id and w.profile_id = r.profile_id
      ) as already_won
    from ranked r
    where r.rank <= 50
  )
  insert into public.prize_draw_pool_entries (
    draw_id, rank_at_draw, profile_id, display_name_at_draw,
    score_at_draw, tickets_at_draw, eligible_at_draw, exclusion_reason
  )
  select
    v_draw_id,
    p.rank,
    p.profile_id,
    p.display_name,
    p.score,
    p.tickets,
    not p.already_won,
    case when p.already_won then 'already_won' end
  from pooled p;

  select
    count(*) filter (where e.eligible_at_draw)::integer,
    coalesce(sum(e.tickets_at_draw) filter (where e.eligible_at_draw), 0)::integer
  into v_candidates, v_total
  from public.prize_draw_pool_entries e
  where e.draw_id = v_draw_id;

  if v_candidates = 0 then
    -- 예외가 현재 트랜잭션의 draw와 snapshot insert를 함께 되돌린다.
    raise exception '추첨할 후보가 없습니다 (month_id=%)', p_month_id;
  end if;

  update public.prize_draws
  set candidate_count = v_candidates, total_tickets = v_total
  where id = v_draw_id;

  for v_prize in
    select p.id, p.name, p.sponsor
    from public.event_prizes p
    where p.enabled
      and not exists (
        select 1
        from public.prize_winners w
        where w.month_id = p_month_id
          and w.prize_id = p.id
          and w.status in ('pending', 'confirmed')
      )
    order by p.sort_order, p.id
  loop
    select coalesce(sum(e.tickets_at_draw), 0)::integer
    into v_available_total
    from public.prize_draw_pool_entries e
    where e.draw_id = v_draw_id
      and e.eligible_at_draw
      and e.selected_order is null;

    v_pick := null;
    select
      e.profile_id,
      e.score_at_draw as score,
      e.rank_at_draw as rank,
      e.tickets_at_draw as tickets
    into v_pick
    from public.prize_draw_pool_entries e
    where e.draw_id = v_draw_id
      and e.eligible_at_draw
      and e.selected_order is null
      and e.profile_id is not null
    order by -ln(1 - random()) / e.tickets_at_draw
    limit 1;

    -- 후보가 경품 수보다 적으면 남은 경품은 다음 기회로 넘긴다.
    exit when v_pick is null;
    v_pick_order := v_pick_order + 1;

    insert into public.prize_winners (
      draw_id, month_id, profile_id, prize_id, prize_name, prize_sponsor,
      score_at_draw, rank_at_draw, tickets_at_draw, total_tickets_at_draw, respond_by
    )
    values (
      v_draw_id, p_month_id, v_pick.profile_id, v_prize.id, v_prize.name, v_prize.sponsor,
      v_pick.score, v_pick.rank, v_pick.tickets, v_available_total, v_deadline
    )
    returning id into v_winner_id;

    update public.prize_draw_pool_entries e
    set
      selected_order = v_pick_order,
      tickets_available_at_pick = v_available_total,
      selected_prize_id = v_prize.id,
      selected_prize_name = v_prize.name,
      winner_id = v_winner_id
    where e.draw_id = v_draw_id and e.profile_id = v_pick.profile_id;

    winner_id := v_winner_id;
    profile_id := v_pick.profile_id;
    prize_name := v_prize.name;
    rank_at_draw := v_pick.rank;
    tickets_at_draw := v_pick.tickets;
    return next;
  end loop;
end;
$$;

comment on function public.run_monthly_draw(text, text) is
  '월간 순위·응모권 풀을 회차별로 고정한 뒤 가중 추첨한다. 동일 월 동시 실행은 advisory lock으로 직렬화한다.';

-- ---------------------------------------------------------------------------
-- 관리자 감사 조회
-- ---------------------------------------------------------------------------

create or replace function public.get_prize_draw_audit(
  p_month_id text,
  p_round integer default null
)
returns table (
  draw_id bigint,
  month_id text,
  round integer,
  drawn_at timestamptz,
  note text,
  candidate_count integer,
  total_tickets integer,
  rank_at_draw integer,
  profile_id uuid,
  display_name_at_draw text,
  score_at_draw integer,
  tickets_at_draw integer,
  eligible_at_draw boolean,
  exclusion_reason text,
  selected_order integer,
  tickets_available_at_pick integer,
  selection_odds numeric,
  prize_name text
)
language sql
stable
security definer
set search_path = public
as $$
  select
    d.id,
    d.month_id,
    d.round,
    d.drawn_at,
    d.note,
    d.candidate_count,
    d.total_tickets,
    e.rank_at_draw,
    e.profile_id,
    e.display_name_at_draw,
    e.score_at_draw,
    e.tickets_at_draw,
    e.eligible_at_draw,
    e.exclusion_reason,
    e.selected_order,
    e.tickets_available_at_pick,
    case
      when e.selected_order is not null and e.tickets_available_at_pick > 0
        then round(e.tickets_at_draw::numeric * 100 / e.tickets_available_at_pick, 2)
      else null
    end,
    e.selected_prize_name
  from public.prize_draws d
  join public.prize_draw_pool_entries e on e.draw_id = d.id
  where public.is_admin()
    and d.month_id = p_month_id
    and (p_round is null or d.round = p_round)
  order by d.round, e.rank_at_draw
$$;

alter table public.prize_draw_pool_entries enable row level security;

drop policy if exists "prize_draw_pool_entries_admin" on public.prize_draw_pool_entries;
create policy "prize_draw_pool_entries_admin"
on public.prize_draw_pool_entries for select
to authenticated
using (public.is_admin());

revoke all on public.prize_draw_pool_entries from anon, authenticated;
grant select on public.prize_draw_pool_entries to authenticated;

revoke all on function public.run_monthly_draw(text, text)
  from public, anon, authenticated;
revoke all on function public.get_prize_draw_audit(text, integer)
  from public, anon;
grant execute on function public.get_prize_draw_audit(text, integer)
  to authenticated;

notify pgrst, 'reload schema';

-- 적용 후 확인:
--   select * from public.get_prize_draw_audit('202607', null);
-- 0030 적용 전 실행된 과거 추첨은 당시 후보 풀을 정확히 복원할 수 없어 소급 생성하지 않는다.
