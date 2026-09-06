-- Admin-only shipping list for handing fulfilled winner addresses to each sponsor.
-- The frontend loads this only on explicit request and groups the result by sponsor.

create or replace function public.get_sponsor_shipping_list(p_month_id text)
returns table (
  winner_id bigint,
  month_id text,
  prize_name text,
  prize_sponsor text,
  recipient text,
  phone text,
  postal_code text,
  address1 text,
  address2 text,
  memo text
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
    a.recipient,
    a.phone,
    a.postal_code,
    a.address1,
    a.address2,
    a.memo
  from public.prize_winners w
  join public.winner_addresses a on a.winner_id = w.id
  where public.is_admin()
    and p_month_id ~ '^[0-9]{6}$'
    and w.month_id = p_month_id
    and w.status = 'confirmed'
  order by coalesce(nullif(btrim(w.prize_sponsor), ''), chr(127)), w.prize_name, w.id
  limit 500
$$;

comment on function public.get_sponsor_shipping_list(text) is
  '관리자가 확정 당첨자의 배송지를 월별·협찬사별 전달 명단으로 조회한다.';

revoke all on function public.get_sponsor_shipping_list(text) from public, anon;
grant execute on function public.get_sponsor_shipping_list(text) to authenticated;

notify pgrst, 'reload schema';
