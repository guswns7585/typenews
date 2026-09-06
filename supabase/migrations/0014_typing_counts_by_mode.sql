-- 누적 문장 수를 모드별로 나눠 센다.
--
-- 왜:
--   profiles.total_typing_count은 모드를 구분하지 않는다. 그런데 단문 1문장(44타),
--   장문 1문장(205타), 뉴스 1문장(약 300타)은 분량이 전혀 다르다. 하나로 합치면
--   "누적 문장 3,000개"가 무엇을 뜻하는지 알 수 없다.
--
--   단어 모드는 더 어긋난다. 클라이언트가 10개를 모아 한 번에 보내므로
--   단어 10개가 1로 세어지고 있었다.
--
-- ⚠️ 점수 계산은 건드리지 않는다. 카운터만 추가한다.
--    record_typing_result에 p_items 인자를 더하지만 기본값이 1이라
--    배포된 6-인자 호출은 그대로 동작한다.

-- ---------------------------------------------------------------------------
-- 모드별 카운터
-- ---------------------------------------------------------------------------
--
-- profiles에 컬럼 4개를 붙이는 대신 별도 테이블로 둔다. profiles는 로그인마다
-- 읽는 테이블이라 폭을 넓히지 않는 편이 낫고, 나중에 모드가 늘어도 스키마가 안 바뀐다.

create table if not exists public.typing_mode_counts (
  profile_id uuid not null references public.profiles(id) on delete cascade,
  mode text not null check (mode in ('short', 'long', 'word', 'news')),
  -- 단어 모드는 단어 개수, 나머지는 문장 개수다.
  item_count integer not null default 0 check (item_count >= 0),
  -- 제출 횟수. 단어 모드는 10개당 1회라 item_count와 다르다.
  submission_count integer not null default 0 check (submission_count >= 0),
  updated_at timestamptz not null default now(),
  primary key (profile_id, mode)
);

comment on column public.typing_mode_counts.item_count is
  '단어 모드는 단어 수, 그 외는 문장 수. 분량이 달라 모드를 합치면 의미가 없다.';

-- 이관: 지금까지의 총합은 모드별로 나눌 수 없다. typing_results에 남아 있는 만큼만
-- 되살린다. 그보다 오래된 것은 profiles.total_typing_count에만 남는다.
insert into public.typing_mode_counts (profile_id, mode, item_count, submission_count)
select
  tr.profile_id,
  tr.mode,
  -- 과거 단어 모드 제출은 배치 크기를 알 수 없다. 클라이언트 상수가 10이었으므로
  -- 그것으로 되살린다. 정확한 값은 아니지만 1로 세는 것보다 실제에 가깝다.
  case when tr.mode = 'word' then count(*) * 10 else count(*) end,
  count(*)
from public.typing_results tr
group by tr.profile_id, tr.mode
on conflict (profile_id, mode) do nothing;

-- ---------------------------------------------------------------------------
-- 적립 함수에 카운터를 더한다
-- ---------------------------------------------------------------------------

create or replace function public.record_typing_result(
  p_month_id text,
  p_mode text,
  p_accuracy integer,
  p_cpm integer,
  p_score integer,
  p_elapsed_ms integer,
  -- 이 제출에 들어 있는 항목 수. 단어 모드는 묶음 크기, 나머지는 1.
  p_items integer default 1
)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  c_max_submission_score constant integer := 600;
  c_max_strokes_per_second constant numeric := 20;
  c_max_hourly_score constant integer := 60000;

  v_month_id text := to_char(now() at time zone 'Asia/Seoul', 'YYYYMM');
  -- 카운터를 부풀리는 데 쓰이지 않게 상한을 둔다. 단어 묶음은 10이다.
  v_items integer := least(greatest(coalesce(p_items, 1), 1), 50);

  v_profile_id uuid;
  v_recent_score integer;
begin
  if auth.uid() is null then
    raise exception 'Not authenticated';
  end if;

  if p_mode not in ('short', 'long', 'word', 'news') then
    raise exception 'Invalid mode';
  end if;

  if p_accuracy < 80 or p_accuracy > 100 then
    return;
  end if;

  if p_cpm < 0 or p_cpm > 5000 then
    return;
  end if;

  select public.current_profile_id() into v_profile_id;
  if v_profile_id is null then
    select id into v_profile_id from public.link_current_google_identity();
  end if;

  if p_score is null or p_score <= 0 or p_score > c_max_submission_score then
    perform public.raise_abuse_signal(
      v_profile_id, null, 'IMPLAUSIBLE_SCORE', 3,
      jsonb_build_object('score', p_score, 'limit', c_max_submission_score, 'mode', p_mode)
    );
    return;
  end if;

  if p_elapsed_ms is null or p_elapsed_ms < 500 or p_elapsed_ms > 3600000 then
    perform public.raise_abuse_signal(
      v_profile_id, null, 'IMPLAUSIBLE_ELAPSED', 3,
      jsonb_build_object('elapsed_ms', p_elapsed_ms, 'score', p_score)
    );
    return;
  end if;

  if p_score > ceil(p_elapsed_ms / 1000.0 * c_max_strokes_per_second) then
    perform public.raise_abuse_signal(
      v_profile_id, null, 'IMPOSSIBLE_SPEED', 3,
      jsonb_build_object(
        'score', p_score,
        'elapsed_ms', p_elapsed_ms,
        'strokes_per_second', round(p_score / (p_elapsed_ms / 1000.0), 1)
      )
    );
    return;
  end if;

  select coalesce(sum(tr.score), 0)
  into v_recent_score
  from public.typing_results tr
  where tr.profile_id = v_profile_id
    and tr.created_at > now() - interval '1 hour';

  if v_recent_score + p_score > c_max_hourly_score then
    perform public.raise_abuse_signal(
      v_profile_id, null, 'HOURLY_SCORE_CAP', 3,
      jsonb_build_object('last_hour_score', v_recent_score, 'limit', c_max_hourly_score)
    );
    return;
  end if;

  -- ---- 통과 ----

  insert into public.typing_results (profile_id, month_id, mode, accuracy, cpm, score, elapsed_ms)
  values (v_profile_id, v_month_id, p_mode, p_accuracy, p_cpm, p_score, p_elapsed_ms);

  insert into public.monthly_stats (profile_id, month_id, score)
  values (v_profile_id, v_month_id, p_score)
  on conflict (profile_id, month_id)
  do update set score = public.monthly_stats.score + p_score;

  insert into public.typing_mode_counts (profile_id, mode, item_count, submission_count)
  values (v_profile_id, p_mode, v_items, 1)
  on conflict (profile_id, mode) do update set
    item_count = public.typing_mode_counts.item_count + v_items,
    submission_count = public.typing_mode_counts.submission_count + 1,
    updated_at = now();

  /* total_typing_count는 예전처럼 제출 1건당 1씩 올린다.
     Firestore에서 이관된 866명의 값이 이 기준으로 쌓여 있어서, 여기서 단어 개수를
     더하기 시작하면 이관분과 신규분의 단위가 달라진다.
     모드별 정확한 수는 위 typing_mode_counts가 담당한다. */
  update public.profiles
  set
    total_typing_count = total_typing_count + 1,
    max_cpm = greatest(max_cpm, p_cpm)
  where id = v_profile_id;
end;
$$;

comment on function public.record_typing_result(text, text, integer, integer, integer, integer, integer) is
  'p_month_id는 하위 호환용이며 사용하지 않는다. 달은 서버가 Asia/Seoul 기준으로 정한다. p_items는 이 제출에 든 항목 수(단어 모드는 묶음 크기).';

-- 6-인자 구버전은 남겨두면 호출이 모호해진다. 새 함수의 기본값이 처리한다.
drop function if exists public.record_typing_result(text, text, integer, integer, integer, integer);

-- ---------------------------------------------------------------------------
-- 조회
-- ---------------------------------------------------------------------------

/* ⚠️ 인자는 그대로(text)인데 돌려주는 컬럼이 3개에서 7개로 늘어난다.
   PostgreSQL은 create or replace로 반환 타입 변경을 허용하지 않으므로
   ("cannot change return type of existing function") 먼저 지워야 한다.
   record_typing_result는 인자 수가 달라져 새 함수가 되므로 이 문제가 없다. */
drop function if exists public.get_my_typing_summary(text);

create function public.get_my_typing_summary(p_month_id text)
returns table (
  total_typing_count integer,
  max_cpm integer,
  monthly_score integer,
  short_count integer,
  long_count integer,
  word_count integer,
  news_count integer
)
language plpgsql
stable
security definer
set search_path = public
as $$
declare
  v_profile_id uuid;
begin
  if auth.uid() is null then
    return query select 0, 0, 0, 0, 0, 0, 0;
    return;
  end if;

  select public.current_profile_id() into v_profile_id;

  if v_profile_id is null then
    return query select 0, 0, 0, 0, 0, 0, 0;
    return;
  end if;

  return query
  select
    p.total_typing_count,
    p.max_cpm,
    coalesce(ms.score, 0),
    coalesce(max(case when c.mode = 'short' then c.item_count end), 0)::integer,
    coalesce(max(case when c.mode = 'long' then c.item_count end), 0)::integer,
    coalesce(max(case when c.mode = 'word' then c.item_count end), 0)::integer,
    coalesce(max(case when c.mode = 'news' then c.item_count end), 0)::integer
  from public.profiles p
  left join public.monthly_stats ms
    on ms.profile_id = p.id
   and ms.month_id = p_month_id
  left join public.typing_mode_counts c on c.profile_id = p.id
  where p.id = v_profile_id
  group by p.total_typing_count, p.max_cpm, ms.score;
end;
$$;

-- ---------------------------------------------------------------------------
-- RLS / 권한
-- ---------------------------------------------------------------------------

alter table public.typing_mode_counts enable row level security;

drop policy if exists "typing_mode_counts_select_own" on public.typing_mode_counts;
create policy "typing_mode_counts_select_own"
on public.typing_mode_counts for select
to authenticated
using (profile_id = public.current_profile_id() or public.is_admin());

revoke all on public.typing_mode_counts from anon, authenticated;
grant select on public.typing_mode_counts to authenticated;

grant execute on function public.record_typing_result(text, text, integer, integer, integer, integer, integer) to authenticated;
grant execute on function public.get_my_typing_summary(text) to authenticated;

notify pgrst, 'reload schema';
