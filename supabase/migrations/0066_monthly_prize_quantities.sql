-- A prize can have more than one winner without creating duplicate prize cards.
-- The plan is month-specific so changing September's sponsors cannot reopen
-- additional slots in an earlier draw.
create table if not exists public.monthly_prize_plan (
  month_id text not null check (month_id ~ '^[0-9]{6}$'),
  prize_id bigint not null references public.event_prizes(id) on delete restrict,
  winner_count integer not null check (winner_count between 1 and 50),
  primary key (month_id, prize_id)
);

alter table public.monthly_prize_plan enable row level security;
revoke all on public.monthly_prize_plan from anon, authenticated;

update public.event_prizes
set sponsor = '샌던아트'
where name = '포피즈' and sponsor is null;

update public.event_prizes
set sponsor = '키피스룸'
where name = '햄찌 키캡 (랜덤)' and sponsor is null;

-- This was an August prize, not one of September's five slots.
update public.event_prizes
set enabled = false
where name = 'HMX KD400 스위치';

insert into public.event_prizes
  (name, full_name, sponsor, image_url, link_url, sort_order, enabled)
select v.name, v.full_name, '펀키스', v.image_url,
  'https://smartstore.naver.com/funkeys', v.sort_order, true
from (values
  ('FL CMMK V2 스테빌라이저 2명',
   'FL CMMK 무보강용 스테빌라이저 V2 2개 (색상 랜덤)',
   '/stabv2.jpg', 3),
  ('80Retros GAME1989- 40s kit',
   '80Retros GAME1989 Heritage PBT 이중사출 체리 프로파일 키캡 세트 - 40s kit',
   '/80Retros.jpg', 4)
) as v(name, full_name, image_url, sort_order)
where not exists (
  select 1 from public.event_prizes p
  where p.name = v.name and p.sponsor = '펀키스'
);

update public.event_prizes
set image_url = '/stabv2.jpg'
where name = 'FL CMMK V2 스테빌라이저 2명'
  and image_url = 'stabv2.jpg';

-- September 2026: Sandun Art 1, Keypiece Room 1, Funkeys keycaps 1,
-- Funkeys stabilizers 2. The older Funkeys switch is disabled in the catalog.
insert into public.monthly_prize_plan (month_id, prize_id, winner_count)
select '202609', p.id,
  case when p.name = 'FL CMMK V2 스테빌라이저 2명' then 2 else 1 end
from public.event_prizes p
where p.enabled and (
  (p.name = '포피즈' and p.sponsor = '샌던아트') or
  (p.name = '햄찌 키캡 (랜덤)' and p.sponsor = '키피스룸') or
  (p.name = 'FL CMMK V2 스테빌라이저 2명' and p.sponsor = '펀키스') or
  (p.name = '80Retros GAME1989- 40s kit' and p.sponsor = '펀키스')
)
on conflict (month_id, prize_id) do update
set winner_count = excluded.winner_count;

do $$
begin
  if (select count(*) from public.monthly_prize_plan where month_id = '202609') <> 4
     or (select sum(winner_count) from public.monthly_prize_plan where month_id = '202609') <> 5 then
    raise exception '202609 prize plan must have four prizes and five winners';
  end if;
end;
$$;

-- An expired winner may be restored only while that prize has a free slot.
create or replace function public.mark_winner_responded(
  p_winner_id bigint,
  p_channel text default 'email',
  p_note text default null
)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  v_winner public.prize_winners;
  v_limit integer;
  v_active integer;
begin
  if not public.is_admin() then
    raise exception 'Admin only';
  end if;
  if p_channel not in ('email', 'manual') then
    raise exception '경로는 email 또는 manual이어야 합니다';
  end if;

  select * into v_winner from public.prize_winners where id = p_winner_id;
  if not found or v_winner.status not in ('pending', 'expired') then
    raise exception '처리할 수 있는 당첨이 아닙니다';
  end if;

  perform pg_advisory_xact_lock(
    hashtextextended('typenews:prize-draw:' || v_winner.month_id, 0)
  );

  select * into v_winner from public.prize_winners
  where id = p_winner_id for update;
  if v_winner.status not in ('pending', 'expired') then
    raise exception '처리할 수 있는 당첨이 아닙니다';
  end if;

  if v_winner.status = 'expired' then
    select coalesce((
      select mp.winner_count from public.monthly_prize_plan mp
      where mp.month_id = v_winner.month_id and mp.prize_id = v_winner.prize_id
    ), 1) into v_limit;

    select count(*)::integer into v_active
    from public.prize_winners w
    where w.month_id = v_winner.month_id
      and w.prize_id = v_winner.prize_id
      and w.id <> v_winner.id
      and w.status in ('pending', 'confirmed');

    if v_active >= v_limit then
      raise exception '이 경품(%)의 당첨 자리 %개가 이미 채워졌습니다. 옛 당첨자를 되살리려면 다른 당첨을 먼저 취소하세요',
        v_winner.prize_name, v_limit;
    end if;
  end if;

  update public.prize_winners
  set status = 'confirmed',
    responded_at = coalesce(responded_at, now()),
    response_channel = p_channel,
    response_note = nullif(btrim(coalesce(p_note, '')), '')
  where id = p_winner_id;
end;
$$;

create or replace function public.get_prize_winners(
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
  prize_taken boolean,
  created_at timestamptz
)
language sql
stable
security definer
set search_path = public
as $$
  select w.id, w.month_id,
    coalesce(nullif(p.display_name, ''), '익명'), p.email::text,
    w.prize_name, w.prize_sponsor, w.score_at_draw, w.rank_at_draw,
    w.tickets_at_draw,
    case when w.total_tickets_at_draw > 0
      then round(w.tickets_at_draw::numeric * 100 / w.total_tickets_at_draw, 2)
      else 0 end,
    w.status, w.respond_by, w.notified_at, w.response_channel,
    w.response_note,
    exists (select 1 from public.winner_addresses a where a.winner_id = w.id),
    (
      select count(*) from public.prize_winners other
      where other.month_id = w.month_id and other.prize_id = w.prize_id
        and other.id <> w.id and other.status in ('pending', 'confirmed')
    ) >= coalesce((
      select mp.winner_count from public.monthly_prize_plan mp
      where mp.month_id = w.month_id and mp.prize_id = w.prize_id
    ), 1),
    w.created_at
  from public.prize_winners w
  join public.profiles p on p.id = w.profile_id
  where public.is_admin()
    and (p_month_id is null or w.month_id = p_month_id)
  order by w.created_at desc
  limit least(greatest(coalesce(p_limit, 100), 1), 500)
$$;

create or replace function public.get_monthly_prize_plan(p_month_id text)
returns table (
  prize_id bigint,
  prize_name text,
  prize_sponsor text,
  winner_count integer,
  drawn_count integer,
  remaining_count integer
)
language sql
stable
security definer
set search_path = public
as $$
  with plan_exists as (
    select exists (
      select 1 from public.monthly_prize_plan mp
      where mp.month_id = p_month_id
    ) as configured
  )
  select p.id, p.name, p.sponsor,
    coalesce(mp.winner_count, 1), won.drawn,
    greatest(coalesce(mp.winner_count, 1) - won.drawn, 0)
  from public.event_prizes p
  cross join plan_exists pe
  left join public.monthly_prize_plan mp
    on mp.prize_id = p.id and mp.month_id = p_month_id
  cross join lateral (
    select count(*)::integer as drawn
    from public.prize_winners w
    where w.month_id = p_month_id and w.prize_id = p.id
      and w.status in ('pending', 'confirmed')
  ) won
  where public.is_admin() and p.enabled
    and (not pe.configured or mp.prize_id is not null)
  order by p.sort_order, p.id
$$;

-- 0031 renamed the audited implementation to run_monthly_draw_unchecked.
-- Keep its public gate, ticket weights and snapshot format unchanged.
create or replace function public.run_monthly_draw_unchecked(
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
  v_has_plan boolean;
  v_prize record;
  v_pick record;
  v_winner_id bigint;
  v_pick_order integer := 0;
  v_deadline timestamptz;
begin
  if p_month_id !~ '^[0-9]{6}$' then
    raise exception '잘못된 month_id입니다';
  end if;

  perform pg_advisory_xact_lock(
    hashtextextended('typenews:prize-draw:' || p_month_id, 0)
  );

  select exists (
    select 1 from public.monthly_prize_plan mp where mp.month_id = p_month_id
  ) into v_has_plan;

  v_deadline := (
    date_trunc('day', now() at time zone 'Asia/Seoul')
    + interval '2 days' + interval '23 hours 50 minutes'
  ) at time zone 'Asia/Seoul';

  if not exists (
    select 1
    from public.event_prizes p
    left join public.monthly_prize_plan mp
      on mp.prize_id = p.id and mp.month_id = p_month_id
    where p.enabled
      and (not v_has_plan or mp.prize_id is not null)
      and coalesce(mp.winner_count, 1) > (
        select count(*) from public.prize_winners w
        where w.month_id = p_month_id and w.prize_id = p.id
          and w.status in ('pending', 'confirmed')
      )
  ) then
    return;
  end if;

  select coalesce(max(d.round), 0) + 1 into v_round
  from public.prize_draws d where d.month_id = p_month_id;

  insert into public.prize_draws (
    month_id, candidate_count, total_tickets, round, note
  ) values (p_month_id, 0, 0, v_round, p_note)
  returning id into v_draw_id;

  with ranked as (
    select ms.profile_id,
      coalesce(nullif(ms.nickname, ''), nullif(p.display_name, ''), '익명') as display_name,
      ms.score,
      row_number() over (
        order by ms.score desc, ms.updated_at desc, p.created_at asc, ms.profile_id
      )::integer as rank
    from public.monthly_stats ms
    join public.profiles p on p.id = ms.profile_id
    where ms.month_id = p_month_id and ms.score > 0
  ), pooled as (
    select r.*,
      case when r.rank = 1 then 8
           when r.rank = 2 then 5
           when r.rank = 3 then 3
           when r.rank between 4 and 10 then 2
           when r.rank between 11 and 50 then 1
           else 0 end as tickets,
      exists (
        select 1 from public.prize_winners w
        where w.month_id = p_month_id and w.profile_id = r.profile_id
      ) as already_won
    from ranked r where r.rank <= 50
  )
  insert into public.prize_draw_pool_entries (
    draw_id, rank_at_draw, profile_id, display_name_at_draw,
    score_at_draw, tickets_at_draw, eligible_at_draw, exclusion_reason
  )
  select v_draw_id, p.rank, p.profile_id, p.display_name, p.score, p.tickets,
    not p.already_won, case when p.already_won then 'already_won' end
  from pooled p;

  select count(*) filter (where e.eligible_at_draw)::integer,
    coalesce(sum(e.tickets_at_draw) filter (where e.eligible_at_draw), 0)::integer
  into v_candidates, v_total
  from public.prize_draw_pool_entries e where e.draw_id = v_draw_id;

  if v_candidates = 0 then
    raise exception '추첨할 후보가 없습니다 (month_id=%)', p_month_id;
  end if;

  update public.prize_draws
  set candidate_count = v_candidates, total_tickets = v_total
  where id = v_draw_id;

  for v_prize in
    select p.id, p.name, p.sponsor
    from public.event_prizes p
    left join public.monthly_prize_plan mp
      on mp.prize_id = p.id and mp.month_id = p_month_id
    cross join lateral generate_series(
      1,
      greatest(coalesce(mp.winner_count, 1) - (
        select count(*)::integer from public.prize_winners w
        where w.month_id = p_month_id and w.prize_id = p.id
          and w.status in ('pending', 'confirmed')
      ), 0)
    ) as slot_number
    where p.enabled and (not v_has_plan or mp.prize_id is not null)
    order by p.sort_order, p.id, slot_number
  loop
    select coalesce(sum(e.tickets_at_draw), 0)::integer
    into v_available_total
    from public.prize_draw_pool_entries e
    where e.draw_id = v_draw_id and e.eligible_at_draw
      and e.selected_order is null;

    v_pick := null;
    select e.profile_id, e.score_at_draw as score,
      e.rank_at_draw as rank, e.tickets_at_draw as tickets
    into v_pick
    from public.prize_draw_pool_entries e
    where e.draw_id = v_draw_id and e.eligible_at_draw
      and e.selected_order is null and e.profile_id is not null
    order by -ln(1 - random()) / e.tickets_at_draw
    limit 1;

    exit when v_pick is null;
    v_pick_order := v_pick_order + 1;

    insert into public.prize_winners (
      draw_id, month_id, profile_id, prize_id, prize_name, prize_sponsor,
      score_at_draw, rank_at_draw, tickets_at_draw, total_tickets_at_draw, respond_by
    ) values (
      v_draw_id, p_month_id, v_pick.profile_id, v_prize.id, v_prize.name, v_prize.sponsor,
      v_pick.score, v_pick.rank, v_pick.tickets, v_available_total, v_deadline
    ) returning id into v_winner_id;

    update public.prize_draw_pool_entries e
    set selected_order = v_pick_order,
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

revoke all on public.monthly_prize_plan from public, anon, authenticated;
revoke all on function public.mark_winner_responded(bigint, text, text) from public, anon;
grant execute on function public.mark_winner_responded(bigint, text, text) to authenticated;
revoke all on function public.get_prize_winners(text, integer) from public, anon;
grant execute on function public.get_prize_winners(text, integer) to authenticated;
revoke all on function public.get_monthly_prize_plan(text) from public, anon;
grant execute on function public.get_monthly_prize_plan(text) to authenticated;
revoke all on function public.run_monthly_draw_unchecked(text, text)
  from public, anon, authenticated;

notify pgrst, 'reload schema';
