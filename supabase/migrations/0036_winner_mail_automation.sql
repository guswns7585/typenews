-- 당첨 안내 메일을 사람 손 없이 내보낸다.
--
-- 왜 이제 되나
--   메일을 자동으로 보내려면 우리 도메인으로 발신해야 하고, 그러려면 DNS에
--   SPF/DKIM을 넣어야 한다. typenews.kr이 선물받은 도메인이라 DNS를 못 만졌다.
--   2026-07-28에 소유권을 이전받아 막힌 것이 풀렸다. (docs/DOMAIN.md)
--
-- 이 마이그레이션이 하는 일
--   메일 본문을 만들고 보내는 일은 Vercel 라우트가 한다 — 문안이 TypeScript
--   한 곳에만 있어야 하기 때문이다(SQL로 다시 옮겨 적으면 두 벌이 된다).
--   DB는 **누구에게 보낼지 정하고, 두 번 보내지 않게 잠그는 일**만 한다.
--
-- 안전장치 셋
--   1. 운영 플래그 — 0031의 draws_enabled와 같은 방식. 기본값 false.
--      켜기 전에는 자동 발송이 한 통도 나가지 않는다
--   2. 클레임 — 보낼 대상을 고르는 순간 notified_at을 찍어 잠근다.
--      cron이 겹쳐 돌아도 같은 사람에게 두 번 가지 않는다
--   3. 되돌리기 — 발송에 실패하면 라우트가 release_winner_mail로 잠금을 푼다.
--      다음 회차가 다시 집는다

alter table public.operational_controls
  add column if not exists winner_mail_enabled boolean not null default false;

comment on column public.operational_controls.winner_mail_enabled is
  '당첨 안내 메일 자동 발송 스위치. 기본값 false. 관리자가 Brevo 도메인 인증을 마친 뒤 켠다.';

-- ---------------------------------------------------------------------------
-- 스위치
-- ---------------------------------------------------------------------------

create or replace function public.get_winner_mail_enabled()
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select case
    when public.is_admin() then coalesce(
      (select c.winner_mail_enabled from public.operational_controls c where c.singleton),
      false
    )
    else false
  end
$$;

create or replace function public.set_winner_mail_enabled(p_enabled boolean)
returns boolean
language plpgsql
security definer
set search_path = public
as $$
begin
  if not public.is_admin() then
    raise exception 'Admin only';
  end if;

  insert into public.operational_controls (singleton, winner_mail_enabled, updated_at, updated_by)
  values (true, coalesce(p_enabled, false), now(), public.current_profile_id())
  on conflict (singleton) do update set
    winner_mail_enabled = excluded.winner_mail_enabled,
    updated_at = excluded.updated_at,
    updated_by = excluded.updated_by;

  return coalesce(p_enabled, false);
end;
$$;

revoke all on function public.get_winner_mail_enabled() from public, anon;
revoke all on function public.set_winner_mail_enabled(boolean) from public, anon;
grant execute on function public.get_winner_mail_enabled() to authenticated;
grant execute on function public.set_winner_mail_enabled(boolean) to authenticated;

-- ---------------------------------------------------------------------------
-- 보낼 대상을 집어 잠근다
-- ---------------------------------------------------------------------------
--
-- ⚠️ 고르는 것과 잠그는 것이 한 문장이어야 한다.
--    "고른 뒤에 표시"로 나누면 그 사이에 다른 회차가 같은 사람을 집어
--    같은 메일이 두 번 나간다. `for update ... skip locked`로 이미 다른
--    트랜잭션이 집은 행은 건너뛴다.
--
-- 조건
--   status='pending'      아직 회신을 기다리는 사람만. 확정·만료·취소는 제외
--   notified_at is null   아직 안 보낸 사람만
--   respond_by > now()    기한이 이미 지난 사람에게 "회신해주세요"를 보내지 않는다
--   email이 있음          이관 과정에서 이메일 없는 프로필이 19명 있다

create or replace function public.claim_winner_mails(p_limit integer default 20)
returns table (
  winner_id bigint,
  display_name text,
  email text,
  prize_name text,
  prize_sponsor text,
  respond_by timestamptz
)
language plpgsql
security definer
set search_path = public
as $$
declare
  -- 한 번에 너무 많이 나가지 않게 막는다. 잘못 돌아도 피해가 20통에서 멈춘다.
  v_limit integer := least(greatest(coalesce(p_limit, 20), 1), 100);
begin
  if not coalesce(
    (select c.winner_mail_enabled from public.operational_controls c where c.singleton),
    false
  ) then
    return;
  end if;

  return query
  with picked as (
    select w.id
    from public.prize_winners w
    join public.profiles p on p.id = w.profile_id
    where w.status = 'pending'
      and w.notified_at is null
      and w.respond_by > now()
      and coalesce(p.email::text, '') <> ''
    order by w.created_at
    limit v_limit
    for update of w skip locked
  ),
  marked as (
    update public.prize_winners w
    set notified_at = now()
    from picked
    where w.id = picked.id
    returning w.id, w.profile_id, w.prize_name, w.prize_sponsor, w.respond_by
  )
  select
    m.id,
    coalesce(nullif(p.display_name, ''), '익명'),
    p.email::text,
    m.prize_name,
    m.prize_sponsor,
    m.respond_by
  from marked m
  join public.profiles p on p.id = m.profile_id;
end;
$$;

comment on function public.claim_winner_mails(integer) is
  '보낼 당첨자를 집으면서 동시에 notified_at을 찍어 잠근다. Vercel 크론 라우트만 호출한다.';

-- ---------------------------------------------------------------------------
-- 실패하면 잠금을 푼다
-- ---------------------------------------------------------------------------

create or replace function public.release_winner_mail(p_winner_id bigint)
returns void
language sql
security definer
set search_path = public
as $$
  update public.prize_winners
  set notified_at = null
  where id = p_winner_id and status = 'pending';
$$;

comment on function public.release_winner_mail(bigint) is
  '발송에 실패했을 때 클레임을 되돌린다. 다음 회차가 다시 집는다.';

-- 브라우저에는 열지 않는다. service_role(Vercel 서버)만 부른다.
revoke all on function public.claim_winner_mails(integer) from public, anon, authenticated;
revoke all on function public.release_winner_mail(bigint) from public, anon, authenticated;

-- ---------------------------------------------------------------------------
-- 켜기 전에
-- ---------------------------------------------------------------------------
--
--   1) Brevo에서 typenews.kr 도메인 인증(SPF/DKIM)을 끝낸다 — docs/DOMAIN.md
--   2) Vercel에 BREVO_API_KEY / BREVO_SENDER_EMAIL / BREVO_SENDER_NAME /
--      CRON_SECRET / SUPABASE_SERVICE_ROLE_KEY 를 등록하고 배포한다
--   3) 관리자 화면에서 본인 계정으로 "메일 보내기"를 한 번 눌러 실제 수신을 확인한다
--      (스팸함도 볼 것)
--   4) 그다음에 켠다. ⚠️ SQL Editor에서는 아래 함수가 아니라 표를 직접 고친다 —
--      set_winner_mail_enabled()는 is_admin()을 검사하는데 SQL Editor에는 JWT가
--      없어 auth.uid()가 NULL이라 'Admin only'로 실패한다. 그 함수는 관리자
--      화면(브라우저)에서 부르라고 만든 것이다.
--
--        update public.operational_controls
--        set winner_mail_enabled = true, updated_at = now()
--        where singleton;
--
--   상태 확인 (get_winner_mail_enabled()도 같은 이유로 SQL Editor에서는 항상
--   false를 돌려주므로 표를 직접 읽는다):
--
--        select draws_enabled, winner_mail_enabled from public.operational_controls;
--
--   급히 멈춰야 하면 같은 UPDATE를 false로 돌린다.
--   이미 나간 메일은 되돌릴 수 없지만 그 뒤로는 한 통도 나가지 않는다.

notify pgrst, 'reload schema';
