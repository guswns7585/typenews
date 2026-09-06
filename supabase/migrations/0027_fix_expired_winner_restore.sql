-- 만료된 당첨을 되살릴 때 같은 경품에 이미 다른 주인이 생겼는지 확인한다.
--
-- 무엇이 문제였나
--   mark_winner_responded는 status in ('pending', 'expired')이면 무조건
--   'confirmed'로 바꿨다. 'expired'를 허용한 것은 이유가 있다 — 기한 직전에
--   메일로 주소를 보낸 사람을 살려주기 위해서다.
--
--   그런데 만료 뒤에는 **재추첨이 돌아 그 경품에 새 주인이 생긴다.**
--   그 상태에서 관리자가 옛 당첨자의 "메일로 받음"을 누르면
--
--       포피즈 → A (expired → confirmed)   ← 되살아남
--       포피즈 → B (pending, 재추첨 당첨)   ← 그대로
--
--   경품 하나에 당첨자가 둘이 된다. prize_winners의 유니크는
--   (month_id, profile_id)라 이것을 막지 못한다. 같은 경품을 두 사람이
--   갖는 것은 제약에 걸리지 않는다.
--
--   관리자 화면도 만료된 건에 그 버튼을 그대로 띄워서 실수를 부추겼다.
--
-- 어떻게 고치나
--   1. 서버 — 되살리려는 경품에 pending/confirmed인 다른 당첨자가 있으면 거절한다.
--   2. 화면 — 그런 행에는 버튼을 아예 띄우지 않는다. 목록에 판단 근거를 실어 보낸다.
--
--   막기만 하고 방법을 안 주면 운영이 막힌다. 정말 옛 당첨자에게 주려면
--   새 당첨자를 먼저 취소(void)하면 된다. 그러면 이 검사가 통과한다.
--   메시지에 그 방법을 적어둔다.

-- ---------------------------------------------------------------------------
-- 1. 되살리기 검사
-- ---------------------------------------------------------------------------

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
  v_other_name text;
begin
  if not public.is_admin() then
    raise exception 'Admin only';
  end if;
  if p_channel not in ('email', 'manual') then
    raise exception '경로는 email 또는 manual이어야 합니다';
  end if;

  select * into v_winner from public.prize_winners where id = p_winner_id;
  if not found then
    raise exception '처리할 수 있는 당첨이 아닙니다';
  end if;

  if v_winner.status not in ('pending', 'expired') then
    raise exception '처리할 수 있는 당첨이 아닙니다';
  end if;

  /* 만료된 건을 되살리는 경우에만 검사한다.
     pending은 아직 그 경품의 주인이므로 볼 것이 없다. */
  if v_winner.status = 'expired' then
    select coalesce(nullif(p.display_name, ''), '익명')
    into v_other_name
    from public.prize_winners w
    join public.profiles p on p.id = w.profile_id
    where w.month_id = v_winner.month_id
      and w.prize_id = v_winner.prize_id
      and w.id <> v_winner.id
      and w.status in ('pending', 'confirmed')
    limit 1;

    if v_other_name is not null then
      raise exception
        '재추첨으로 이미 %님이 이 경품(%)의 당첨자입니다. 옛 당첨자에게 주려면 %님의 당첨을 먼저 취소하세요',
        v_other_name, v_winner.prize_name, v_other_name;
    end if;
  end if;

  update public.prize_winners
  set
    status = 'confirmed',
    responded_at = coalesce(responded_at, now()),
    response_channel = p_channel,
    response_note = nullif(btrim(coalesce(p_note, '')), '')
  where id = p_winner_id;
end;
$$;

comment on function public.mark_winner_responded(bigint, text, text) is
  '메일 등으로 주소를 받았을 때 확인 처리한다. 만료 건은 그 경품에 새 주인이 없을 때만 되살아난다.';

revoke all on function public.mark_winner_responded(bigint, text, text) from public, anon;
grant execute on function public.mark_winner_responded(bigint, text, text) to authenticated;

-- ---------------------------------------------------------------------------
-- 2. 목록에 "이 경품은 이미 남의 것"을 실어 보낸다
-- ---------------------------------------------------------------------------
--
-- ⚠️ 반환 컬럼이 늘어난다. create or replace로는 반환 타입을 못 바꾸므로
--    먼저 지운다. 0014·0020에서 겪었다.

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
  -- 이 경품을 지금 들고 있는 사람이 따로 있는지. 만료 건을 되살릴 수 있는지 판단한다.
  prize_taken boolean,
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
    exists (
      select 1 from public.prize_winners other
      where other.month_id = w.month_id
        and other.prize_id = w.prize_id
        and other.id <> w.id
        and other.status in ('pending', 'confirmed')
    ),
    w.created_at
  from public.prize_winners w
  join public.profiles p on p.id = w.profile_id
  where public.is_admin()
    and (p_month_id is null or w.month_id = p_month_id)
  order by w.created_at desc
  limit least(greatest(coalesce(p_limit, 100), 1), 500)
$$;

revoke all on function public.get_prize_winners(text, integer) from public, anon;
grant execute on function public.get_prize_winners(text, integer) to authenticated;

notify pgrst, 'reload schema';
