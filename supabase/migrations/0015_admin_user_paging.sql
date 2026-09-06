-- 관리자 유저 목록의 상한을 올리고 offset을 준다.
--
-- 0011의 get_admin_users는 상한이 500이었다. 실제 프로필이 866명이라
-- "모든 유저를 확인"이 불가능했다. 화면은 표 안에서 스크롤하므로 한 번에
-- 다 받아도 문제가 없다.
--
-- offset도 함께 둔다. 사용자가 더 늘어나면 나눠 받을 수 있어야 한다.

drop function if exists public.get_admin_users(text, integer);

create or replace function public.get_admin_users(
  p_search text default null,
  p_limit integer default 1000,
  p_offset integer default 0
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
  created_at timestamptz,
  -- 필터를 적용한 전체 건수. 화면이 "지금 몇 명 중 몇 명을 보고 있나"를 알 수 있다.
  total_count bigint
)
language sql
stable
security definer
set search_path = public
as $$
  with q as (
    select lower(btrim(coalesce(p_search, ''))) as term
  ),
  matched as (
    select p.*
    from public.profiles p
    cross join q
    where public.is_admin()
      and (
        q.term = ''
        -- like이 아니라 position이다. 검색어에 %나 _가 들어와도 그냥 글자로 찾는다.
        or position(q.term in lower(coalesce(p.display_name, ''))) > 0
        or position(q.term in lower(coalesce(p.email::text, ''))) > 0
      )
  )
  select
    m.id,
    coalesce(nullif(m.display_name, ''), '익명'),
    m.email::text,
    m.role,
    m.nickname_set,
    m.max_cpm,
    coalesce(ms.score, 0),
    (select count(*)::integer from public.sentence_requests r where r.profile_id = m.id),
    (select count(*)::integer from public.abuse_signals a
      where a.profile_id = m.id and a.reviewed_at is null),
    m.created_at,
    count(*) over ()
  from matched m
  left join public.monthly_stats ms
    on ms.profile_id = m.id
   and ms.month_id = to_char(now() at time zone 'Asia/Seoul', 'YYYYMM')
  order by coalesce(ms.score, 0) desc, m.created_at desc
  limit least(greatest(coalesce(p_limit, 1000), 1), 2000)
  offset greatest(coalesce(p_offset, 0), 0)
$$;

revoke all on function public.get_admin_users(text, integer, integer) from public, anon;
grant execute on function public.get_admin_users(text, integer, integer) to authenticated;

notify pgrst, 'reload schema';
