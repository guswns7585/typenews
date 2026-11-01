-- November 2026: keep Sandun Art and Keypiece Room, replace the Funkeys
-- building-block set with one ATK R1 SE+ black mouse. Preserve older plans.
begin;

select pg_advisory_xact_lock(hashtextextended('typenews:prize-draw:202611', 0));

do $$
begin
  if exists (select 1 from public.prize_winners where month_id = '202611') then
    raise exception 'November already has draw records; review them before changing its prize plan';
  end if;
end;
$$;

update public.event_prizes
set enabled = false
where sponsor = '펀키스';

insert into public.event_prizes (
  name, full_name, sponsor, image_url, link_url, sort_order, enabled
)
select
  'ATK R1 SE+ 블랙 마우스',
  'ATK R1 SE+ 블랙 마우스',
  '펀키스',
  '/atk-r1-se-plus-black.png',
  'https://smartstore.naver.com/funkeys',
  3,
  true
where not exists (
  select 1 from public.event_prizes
  where name = 'ATK R1 SE+ 블랙 마우스' and sponsor = '펀키스'
);

update public.event_prizes
set full_name = 'ATK R1 SE+ 블랙 마우스',
  image_url = '/atk-r1-se-plus-black.png',
  link_url = 'https://smartstore.naver.com/funkeys',
  sort_order = 3,
  enabled = true
where name = 'ATK R1 SE+ 블랙 마우스' and sponsor = '펀키스';

delete from public.monthly_prize_plan where month_id = '202611';

insert into public.monthly_prize_plan (month_id, prize_id, winner_count)
select '202611', p.id, 1
from public.event_prizes p
where p.enabled and (
  (p.name = '포피즈' and p.sponsor = '샌던아트') or
  (p.name = '햄찌 키캡 (랜덤)' and p.sponsor = '키피스룸') or
  (p.name = 'ATK R1 SE+ 블랙 마우스' and p.sponsor = '펀키스')
);

do $$
begin
  if (select count(*) from public.monthly_prize_plan where month_id = '202611') <> 3
     or (select sum(winner_count) from public.monthly_prize_plan where month_id = '202611') <> 3
     or (select count(*) from public.event_prizes where sponsor = '펀키스' and enabled) <> 1 then
    raise exception '202611 prize plan must have three prizes, three winners and one enabled Funkeys prize';
  end if;
end;
$$;

notify pgrst, 'reload schema';
commit;
