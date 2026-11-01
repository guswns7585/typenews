-- October 2026 keeps the Sandun Art and Keypiece Room prizes, while the
-- three previous Funkeys prizes are replaced by one building-block set.
-- Historical September plans and winners keep referencing the old rows.

update public.event_prizes
set enabled = false
where sponsor = '펀키스'
  and name in (
    'HMX KD400 스위치',
    'FL CMMK V2 스테빌라이저 2명',
    '80Retros GAME1989- 40s kit'
  );

insert into public.event_prizes (
  name, full_name, sponsor, image_url, link_url, sort_order, enabled
)
select
  '80Retros x HMX x Pantasy 카페 샵 블럭 세트 (363pcs)',
  '80Retros x HMX x Pantasy 세계최초 키보드 스위치 카페 샵 빌딩 블럭 세트 363pcs - 1개',
  '펀키스',
  '/80retros-hmx-pantasy-cafe.jpg',
  'https://smartstore.naver.com/funkeys',
  3,
  true
where not exists (
  select 1 from public.event_prizes
  where name = '80Retros x HMX x Pantasy 카페 샵 블럭 세트 (363pcs)'
    and sponsor = '펀키스'
);

update public.event_prizes
set full_name = '80Retros x HMX x Pantasy 세계최초 키보드 스위치 카페 샵 빌딩 블럭 세트 363pcs - 1개',
  image_url = '/80retros-hmx-pantasy-cafe.jpg',
  link_url = 'https://smartstore.naver.com/funkeys',
  sort_order = 3,
  enabled = true
where name = '80Retros x HMX x Pantasy 카페 샵 블럭 세트 (363pcs)'
  and sponsor = '펀키스';

-- The month has not been drawn yet, so replacing a partial draft plan is safe.
delete from public.monthly_prize_plan where month_id = '202610';

insert into public.monthly_prize_plan (month_id, prize_id, winner_count)
select '202610', p.id, 1
from public.event_prizes p
where p.enabled and (
  (p.name = '포피즈' and p.sponsor = '샌던아트') or
  (p.name = '햄찌 키캡 (랜덤)' and p.sponsor = '키피스룸') or
  (p.name = '80Retros x HMX x Pantasy 카페 샵 블럭 세트 (363pcs)'
    and p.sponsor = '펀키스')
);

do $$
begin
  if (select count(*) from public.monthly_prize_plan where month_id = '202610') <> 3
     or (select sum(winner_count) from public.monthly_prize_plan where month_id = '202610') <> 3
     or (select count(*) from public.event_prizes where sponsor = '펀키스' and enabled) <> 1 then
    raise exception '202610 prize plan must have three prizes and one enabled Funkeys prize';
  end if;
end;
$$;

notify pgrst, 'reload schema';
