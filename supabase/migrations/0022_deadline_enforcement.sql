-- 기한을 실제로 강제한다.
--
-- 무엇이 잘못됐나
--   submit_winner_address는 status가 'expired'일 때만 거절했다. 그런데 만료 처리는
--   expire_stale_winners(cron)가 해준다. cron이 없거나 아직 안 돌았으면 기한이
--   지나도 status는 'pending'이라 **늦은 제출이 성공하고 'confirmed'가 된다.**
--   당첨자는 "주소 보냈는데 왜 경품이 안 오냐"고 묻게 된다.
--
--   get_my_pending_prize도 마찬가지로 기한이 지난 pending을 계속 돌려줬다.
--   그래서 배너가 "3일까지 입력해 주세요"를 기한 뒤에도 보여줬다.
--
-- 어떻게 고치나
--   상태가 아니라 **시각**을 본다. cron이 늦게 돌든 안 돌든 결과가 같아진다.
--     - 배너: pending은 기한 안에서만 보인다
--     - 제출: 기한을 넘긴 pending은 거절한다
--   이미 접수된(confirmed) 건은 기한 뒤에도 수정할 수 있게 둔다. 오타를 고치려는
--   사람을 막을 이유가 없고, 이미 기한 안에 응답한 사람이다.

-- ---------------------------------------------------------------------------
-- 배너: 기한이 지난 pending은 내보내지 않는다
-- ---------------------------------------------------------------------------

create or replace function public.get_my_pending_prize()
returns table (
  winner_id bigint,
  month_id text,
  prize_name text,
  prize_sponsor text,
  respond_by timestamptz,
  status text,
  has_address boolean
)
language sql
stable
security definer
set search_path = public
as $$
  select
    w.id,
    w.month_id,
    w.prize_name,
    w.prize_sponsor,
    w.respond_by,
    w.status,
    exists (select 1 from public.winner_addresses a where a.winner_id = w.id)
  from public.prize_winners w
  where w.profile_id = public.current_profile_id()
    and (
      -- 아직 응답하지 않았다면 기한 안에서만 보여준다.
      -- 기한이 지난 뒤에도 "입력해 주세요"가 떠 있으면 늦게 보내고 기다리게 된다.
      (w.status = 'pending' and w.respond_by > now())
      -- 접수된 건은 발송을 기다리는 동안 계속 보여준다. 주소 수정도 여기서 한다.
      or (w.status = 'confirmed' and w.respond_by > now() - interval '30 days')
    )
  order by w.created_at desc
  limit 1
$$;

-- ---------------------------------------------------------------------------
-- 제출: 기한을 넘긴 첫 제출은 거절한다
-- ---------------------------------------------------------------------------

create or replace function public.submit_winner_address(
  p_winner_id bigint,
  p_recipient text,
  p_phone text,
  p_postal_code text,
  p_address1 text,
  p_address2 text default null,
  p_memo text default null
)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  v_profile_id uuid;
  v_winner public.prize_winners;
begin
  if auth.uid() is null then
    raise exception 'Not authenticated';
  end if;

  select public.current_profile_id() into v_profile_id;

  select * into v_winner from public.prize_winners where id = p_winner_id;
  if not found or v_winner.profile_id <> v_profile_id then
    -- 남의 당첨인지 없는 당첨인지 구분해주지 않는다.
    raise exception '해당 당첨 내역을 찾을 수 없습니다';
  end if;

  if v_winner.status = 'expired' then
    raise exception '입력 기간이 지났습니다';
  end if;
  if v_winner.status = 'voided' then
    raise exception '취소된 당첨입니다';
  end if;

  /* ⚠️ 상태가 아니라 시각으로 판단한다.
     만료 처리(expire_stale_winners)는 cron이 해주는데, 아직 안 돌았으면 기한이
     지나도 status는 'pending'이다. 그 틈으로 늦은 제출이 통과하면 안 된다.
     이미 접수된(confirmed) 건의 수정은 기한 뒤에도 허용한다. */
  if v_winner.status = 'pending' and v_winner.respond_by < now() then
    raise exception '입력 기간이 지났습니다';
  end if;

  if btrim(coalesce(p_recipient, '')) = ''
     or btrim(coalesce(p_phone, '')) = ''
     or btrim(coalesce(p_postal_code, '')) = ''
     or btrim(coalesce(p_address1, '')) = ''
  then
    raise exception '받는 분, 연락처, 우편번호, 주소는 필수입니다';
  end if;

  insert into public.winner_addresses
    (winner_id, recipient, phone, postal_code, address1, address2, memo)
  values (
    p_winner_id, btrim(p_recipient), btrim(p_phone), btrim(p_postal_code),
    btrim(p_address1), nullif(btrim(coalesce(p_address2, '')), ''),
    nullif(btrim(coalesce(p_memo, '')), '')
  )
  on conflict (winner_id) do update set
    recipient = excluded.recipient,
    phone = excluded.phone,
    postal_code = excluded.postal_code,
    address1 = excluded.address1,
    address2 = excluded.address2,
    memo = excluded.memo;

  update public.prize_winners
  set status = 'confirmed', responded_at = coalesce(responded_at, now()), response_channel = 'site'
  where id = p_winner_id;
end;
$$;

notify pgrst, 'reload schema';
