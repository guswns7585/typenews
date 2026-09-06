-- run_monthly_draw에서 임시 테이블을 걷어낸다.
--
-- 무엇이 잘못됐나
--   0019는 후보 풀을 임시 테이블(draw_pool)에 담고 `delete from draw_pool;`로
--   비웠다. WHERE 절이 없는 DELETE다.
--   Supabase는 API 역할 세션에 pg-safeupdate를 걸어두기 때문에 그 문장이
--   `21000: DELETE requires a WHERE clause`로 막힌다.
--   → 관리자 화면의 추첨 버튼이 항상 실패한다. (pg_cron은 postgres 역할이라
--     그 안전장치가 없어 통과한다. 그래서 더 늦게 발견될 뻔했다.)
--
-- 어떻게 고치나
--   임시 테이블을 쓴 이유는 "등수를 한 번만 매기기" 위해서였다. 그런데 등수를
--   **그 달 참가자 전체**에 대해 매기고 당첨자는 바깥에서 걸러내면 같은 결과를
--   얻는다. 앞사람이 빠져도 등수가 밀려 올라가지 않는다.
--   임시 테이블도, WHERE 없는 DELETE도 사라진다.
--
-- 동작 규칙은 0019와 동일하다.
--   1등 8장 / 2등 5장 / 3등 3장 / 4~10등 2장 / 11~50등 1장 / 51등~ 후보 아님
--   그 달에 한 번이라도 뽑힌 사람(만료·취소 포함)은 제외
--   회신 기한 = 추첨일 + 2일의 23:50 (KST)

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
  v_prize record;
  v_pick record;
  v_winner_id bigint;
  v_deadline timestamptz;
begin
  if p_month_id !~ '^[0-9]{6}$' then
    raise exception '잘못된 month_id입니다';
  end if;

  /* 회신 기한: 추첨일 + 2일의 23:50 (KST).
     1일 00:00 추첨 → 3일 23:50, 4일 재추첨 → 6일 23:50. */
  v_deadline := (
    date_trunc('day', now() at time zone 'Asia/Seoul')
    + interval '2 days' + interval '23 hours 50 minutes'
  ) at time zone 'Asia/Seoul';

  -- 아직 주인이 없는 경품만 대상이다.
  if not exists (
    select 1 from public.event_prizes p
    where p.enabled
      and not exists (
        select 1 from public.prize_winners w
        where w.month_id = p_month_id
          and w.prize_id = p.id
          and w.status in ('pending', 'confirmed')
      )
  ) then
    return;
  end if;

  select coalesce(max(d.round), 0) + 1 into v_round
  from public.prize_draws d where d.month_id = p_month_id;

  /* 후보 수와 응모권 합계.
     등수는 그 달 참가자 **전체**에 대해 매긴다(안쪽 subquery에 당첨자 필터를
     넣지 않는다). 그래야 재추첨에서도 등수가 그대로 유지된다. */
  select count(*)::integer, coalesce(sum(t.tickets), 0)::integer
  into v_candidates, v_total
  from (
    select
      case
        when r.rank = 1 then 8
        when r.rank = 2 then 5
        when r.rank = 3 then 3
        when r.rank between 4 and 10 then 2
        when r.rank between 11 and 50 then 1
        else 0
      end as tickets
    from (
      select
        ms.profile_id,
        row_number() over (
          order by ms.score desc, ms.updated_at desc, ms.profile_id
        )::integer as rank
      from public.monthly_stats ms
      where ms.month_id = p_month_id and ms.score > 0
    ) r
    where not exists (
      select 1 from public.prize_winners w
      where w.month_id = p_month_id and w.profile_id = r.profile_id
    )
  ) t
  where t.tickets > 0;

  if v_candidates = 0 then
    raise exception '추첨할 후보가 없습니다 (month_id=%)', p_month_id;
  end if;

  insert into public.prize_draws (month_id, candidate_count, total_tickets, round, note)
  values (p_month_id, v_candidates, v_total, v_round, p_note)
  returning id into v_draw_id;

  for v_prize in
    select p.id, p.name, p.sponsor
    from public.event_prizes p
    where p.enabled
      and not exists (
        select 1 from public.prize_winners w
        where w.month_id = p_month_id
          and w.prize_id = p.id
          and w.status in ('pending', 'confirmed')
      )
    order by p.sort_order, p.id
  loop
    /* 응모권 수에 비례해 한 명. 방금 넣은 당첨자는 not exists가 걸러내므로
       다음 바퀴에서 자동으로 빠진다.
       random()은 [0,1)이라 0이 나올 수 있고 ln(0)은 오류다. 1-random()을 쓴다. */
    v_pick := null;
    select r.profile_id, r.score, r.rank, r.tickets
    into v_pick
    from (
      select
        ms.profile_id,
        ms.score,
        row_number() over (
          order by ms.score desc, ms.updated_at desc, ms.profile_id
        )::integer as rank
      from public.monthly_stats ms
      where ms.month_id = p_month_id and ms.score > 0
    ) base
    cross join lateral (
      select
        base.profile_id,
        base.score,
        base.rank,
        case
          when base.rank = 1 then 8
          when base.rank = 2 then 5
          when base.rank = 3 then 3
          when base.rank between 4 and 10 then 2
          when base.rank between 11 and 50 then 1
          else 0
        end as tickets
    ) r
    where r.tickets > 0
      and not exists (
        select 1 from public.prize_winners w
        where w.month_id = p_month_id and w.profile_id = r.profile_id
      )
    order by -ln(1 - random()) / r.tickets
    limit 1;

    -- 후보가 경품 수보다 적으면 남은 경품은 다음 기회로 넘긴다.
    exit when v_pick is null;

    insert into public.prize_winners (
      draw_id, month_id, profile_id, prize_id, prize_name, prize_sponsor,
      score_at_draw, rank_at_draw, tickets_at_draw, total_tickets_at_draw, respond_by
    )
    values (
      v_draw_id, p_month_id, v_pick.profile_id, v_prize.id, v_prize.name, v_prize.sponsor,
      v_pick.score, v_pick.rank, v_pick.tickets, v_total, v_deadline
    )
    returning id into v_winner_id;

    /* OUT 파라미터에 직접 RETURNING 하지 않는다. 컬럼 이름과 같아 모호해진다. */
    winner_id := v_winner_id;
    profile_id := v_pick.profile_id;
    prize_name := v_prize.name;
    rank_at_draw := v_pick.rank;
    tickets_at_draw := v_pick.tickets;
    return next;
  end loop;
end;
$$;

notify pgrst, 'reload schema';
