-- 현재 이벤트 경품을 event_prizes에 넣는다.
--
-- event-content.tsx가 이 표를 읽고, 비어 있으면 코드에 있는 폴백 목록을 쓴다.
-- 표를 채우면 관리자 페이지에서 수정할 수 있게 된다.
--
-- ⚠️ 이름은 협찬처와 합의된 표기다. 임의로 바꾸지 말 것.
--    HMX 스위치는 이름이 길어 카드에서 줄여 쓰고 full_name에 원래 표기를 둔다.
--    이미지가 없으면 image_url을 null로 두면 화면에 "준비 중"으로 나온다.
--
-- 여러 번 실행해도 중복이 생기지 않게 name으로 판단한다. 이미 관리자 화면에서
-- 손으로 넣었다면 그 행을 건드리지 않는다.

insert into public.event_prizes (name, full_name, image_url, link_url, sort_order, enabled)
select v.name, v.full_name, v.image_url, v.link_url, v.sort_order, true
from (
  values
    ('포피즈', null::text, '/pride.jpg', 'https://smartstore.naver.com/sandunart', 1),
    ('햄찌 키캡 (랜덤)', null::text, '/prize.jpg', 'https://smartstore.naver.com/keypiece', 2),
    ('HMX KD400 스위치', '80Retros x HMX KD400 40gf 35개입 x 3개', null::text, null::text, 3)
) as v(name, full_name, image_url, link_url, sort_order)
where not exists (
  select 1 from public.event_prizes p where p.name = v.name
);

-- 확인용
select id, name, coalesce(image_url, '(이미지 없음)') as image, sort_order, enabled
from public.event_prizes
order by sort_order, id;
