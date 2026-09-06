-- 같은 제출이 두 번 적립되지 않게 한다.
--
-- 왜 필요한가 (두 방향에서)
--
--   1. 부정행위 — 지금은 같은 값을 반복해 보내면 상한에 걸릴 때까지 계속 쌓인다.
--      `for (let i=0;i<100;i++) supabase.rpc('record_typing_result', {...})`
--      한 줄이면 된다.
--
--   2. 정직한 사용자 — 점수 전송이 실패했을 때 다시 보내려면, 서버가 "이건 아까
--      그거다"를 알아야 한다. 그게 없으면 재전송이 곧 중복 적립이라 재시도를
--      만들 수가 없다. **이 마이그레이션은 재전송 큐의 전제 조건이다.**
--
-- 어떻게
--   클라이언트가 제출마다 UUID를 만들어 함께 보낸다. 같은 키가 이미 있으면
--   아무것도 하지 않고 조용히 끝낸다(성공으로 응답한다 — 재시도가 성공으로
--   보여야 큐에서 지울 수 있다).
--
-- ⚠️ 키가 없는 호출은 예전처럼 그대로 적립된다. 구 클라이언트가 캐시에 남아
--    있는 동안에도 점수를 잃지 않아야 하기 때문이다. 배포가 끝나고 며칠 뒤
--    키 없는 호출이 0으로 수렴하면 그때 필수로 바꿀 수 있다.
--
-- ⚠️ 0026의 롤업이 14일 뒤 원시행을 지우므로 그보다 오래된 키는 다시 통과한다.
--    재전송 큐가 7일에서 버리므로 현실적으로 겹치지 않는다.

alter table public.typing_results
  add column if not exists submission_key uuid;

comment on column public.typing_results.submission_key is
  '클라이언트가 제출마다 만든 고유 키. 같은 키는 한 번만 적립된다. 구 클라이언트는 null.';

-- 부분 유니크. null은 몇 개든 허용된다(키 없는 구 호출).
create unique index if not exists typing_results_submission_key_idx
  on public.typing_results (profile_id, submission_key)
  where submission_key is not null;

-- ---------------------------------------------------------------------------
-- 적립 함수
-- ---------------------------------------------------------------------------
--
-- 0024와 같되 p_submission_key가 붙고, 그 키로 두 겹의 방어를 한다.
--   1) 먼저 있는지 본다 — 흔한 경우(재전송)를 가볍게 처리한다
--   2) insert를 예외 블록으로 감싼다 — 두 탭이 같은 순간에 보낸 경우까지 막는다
--      insert가 typing_results 먼저라서, 여기서 걸리면 monthly_stats는 손대지 않는다

create or replace function public.record_typing_result(
  p_month_id text,
  p_mode text,
  p_accuracy integer,
  p_cpm integer,
  p_score integer,
  p_elapsed_ms integer,
  p_items integer default 1,
  p_sentence_id bigint default null,
  p_options jsonb default null,
  -- 이 제출의 고유 키. 같은 키는 한 번만 적립된다.
  p_submission_key uuid default null
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
  v_items integer := least(greatest(coalesce(p_items, 1), 1), 50);

  v_profile_id uuid;
  v_recent_score integer;

  v_text text;
  v_expected integer;
  v_delta integer;
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

  /* 이미 적립한 제출이면 조용히 끝낸다.
     오류가 아니라 성공으로 돌려줘야 재전송 큐가 이 항목을 지운다. */
  if p_submission_key is not null and exists (
    select 1 from public.typing_results tr
    where tr.profile_id = v_profile_id and tr.submission_key = p_submission_key
  ) then
    return;
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

  begin
    insert into public.typing_results (
      profile_id, month_id, mode, accuracy, cpm, score, elapsed_ms, submission_key
    )
    values (
      v_profile_id, v_month_id, p_mode, p_accuracy, p_cpm, p_score, p_elapsed_ms, p_submission_key
    );
  exception when unique_violation then
    /* 같은 키가 같은 순간에 두 번 들어왔다(탭 둘, 또는 재전송과 원본이 겹침).
       이 블록의 insert만 되돌아가고 아래 적립은 실행되지 않는다. */
    return;
  end;

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

  update public.profiles
  set
    total_typing_count = total_typing_count + 1,
    max_cpm = greatest(max_cpm, p_cpm)
  where id = v_profile_id;

  -- ---- 섀도 검산 (0024). 적립에는 영향을 주지 않는다 ----

  if p_sentence_id is null then
    insert into public.score_verifications (profile_id, day, unverified)
    values (v_profile_id, (now() at time zone 'Asia/Seoul')::date, 1)
    on conflict (profile_id, day) do update set
      unverified = public.score_verifications.unverified + 1,
      updated_at = now();
    return;
  end if;

  select s.text into v_text from public.sentences s where s.id = p_sentence_id;
  if v_text is null then
    insert into public.score_verifications (profile_id, day, unverified)
    values (v_profile_id, (now() at time zone 'Asia/Seoul')::date, 1)
    on conflict (profile_id, day) do update set
      unverified = public.score_verifications.unverified + 1,
      updated_at = now();
    return;
  end if;

  v_expected := public.sentence_score(
    v_text,
    coalesce((p_options ->> 'punctuation')::boolean, false),
    coalesce((p_options ->> 'numbers')::boolean, false),
    coalesce((p_options ->> 'english')::boolean, false),
    coalesce((p_options ->> 'symbols')::boolean, false)
  );
  v_delta := p_score - v_expected;

  insert into public.score_verifications (
    profile_id, day, checked, mismatched, over_reported, abs_delta_sum, max_over
  )
  values (
    v_profile_id,
    (now() at time zone 'Asia/Seoul')::date,
    1,
    case when v_delta <> 0 then 1 else 0 end,
    case when v_delta > 0 then 1 else 0 end,
    abs(v_delta),
    greatest(v_delta, 0)
  )
  on conflict (profile_id, day) do update set
    checked = public.score_verifications.checked + 1,
    mismatched = public.score_verifications.mismatched + case when v_delta <> 0 then 1 else 0 end,
    over_reported = public.score_verifications.over_reported + case when v_delta > 0 then 1 else 0 end,
    abs_delta_sum = public.score_verifications.abs_delta_sum + abs(v_delta),
    max_over = greatest(public.score_verifications.max_over, v_delta),
    updated_at = now();

  if v_delta >= 50 and p_score >= v_expected * 2 then
    perform public.raise_abuse_signal(
      v_profile_id, null, 'SCORE_MISMATCH', 2,
      jsonb_build_object(
        'claimed', p_score,
        'expected', v_expected,
        'sentence_id', p_sentence_id,
        'mode', p_mode
      )
    );
  end if;
end;
$$;

comment on function public.record_typing_result(
  text, text, integer, integer, integer, integer, integer, bigint, jsonb, uuid
) is
  'p_month_id는 하위 호환용이며 사용하지 않는다. p_submission_key가 있으면 같은 키는 한 번만 적립된다.';

-- 9-인자 구버전을 남겨두면 PostgREST가 어느 함수인지 정하지 못한다(PGRST203).
drop function if exists public.record_typing_result(
  text, text, integer, integer, integer, integer, integer, bigint, jsonb
);

grant execute on function public.record_typing_result(
  text, text, integer, integer, integer, integer, integer, bigint, jsonb, uuid
) to authenticated;

-- ---------------------------------------------------------------------------
-- 확인
-- ---------------------------------------------------------------------------
--
--   -- 키 없이 들어오는 제출이 아직 얼마나 되는지 (구 클라이언트 잔존 확인)
--   select
--     count(*) filter (where submission_key is null) as 키없음,
--     count(*) filter (where submission_key is not null) as 키있음
--   from public.typing_results
--   where created_at > now() - interval '1 day';

notify pgrst, 'reload schema';
