-- 관리자 화면의 유저 관리 탭이 쓸 목록.
--
-- ⚠️ 0009의 인계 문서는 "화면만 만들면 된다"고 적었지만 유저 관리만은 아니었다.
-- profiles의 select 정책은 0001의 profiles_select_own 하나뿐이고 조건이
-- supabase_user_id = auth.uid()다. 관리자가 남의 프로필을 조회하면 0행이 온다.
--
-- 정책에 is_admin()을 더해 테이블을 여는 대신 함수를 둔다. 정책을 넓히면
-- preferences, google_sub, firebase_uid까지 전부 딸려 나온다. 화면에 필요한
-- 것은 이름·이메일·점수 정도다.

create or replace function public.get_admin_users(
  p_search text default null,
  p_limit integer default 100
)
returns table (
  profile_id uuid,
  display_name text,
  email text,
  role text,
  nickname_set boolean,
  max_cpm integer,
  monthly_score integer,
  request_count integer,
  open_signal_count integer,
  created_at timestamptz
)
language sql
stable
security definer
set search_path = public
as $$
  with q as (
    select lower(btrim(coalesce(p_search, ''))) as term
  )
  select
    p.id,
    coalesce(nullif(p.display_name, ''), '익명'),
    p.email::text,
    p.role,
    p.nickname_set,
    p.max_cpm,
    coalesce(ms.score, 0),
    (select count(*)::integer from public.sentence_requests r where r.profile_id = p.id),
    (select count(*)::integer from public.abuse_signals a
      where a.profile_id = p.id and a.reviewed_at is null),
    p.created_at
  from public.profiles p
  cross join q
  left join public.monthly_stats ms
    on ms.profile_id = p.id
   and ms.month_id = to_char(now() at time zone 'Asia/Seoul', 'YYYYMM')
  where public.is_admin()
    and (
      q.term = ''
      -- like이 아니라 position이다. 검색어에 %나 _가 들어와도 그냥 글자로 찾는다.
      or position(q.term in lower(coalesce(p.display_name, ''))) > 0
      or position(q.term in lower(coalesce(p.email::text, ''))) > 0
    )
  order by coalesce(ms.score, 0) desc, p.created_at desc
  limit least(greatest(coalesce(p_limit, 100), 1), 500)
$$;

-- 새 함수는 PUBLIC에 execute가 기본으로 붙는다. 안에서 is_admin()을 보므로
-- 비로그인 호출은 0행을 받지만, 애초에 부를 수 없게 걷어낸다. (0003과 같은 방식)
revoke all on function public.get_admin_users(text, integer) from public, anon;
grant execute on function public.get_admin_users(text, integer) to authenticated;

notify pgrst, 'reload schema';
