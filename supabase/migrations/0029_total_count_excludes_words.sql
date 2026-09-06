-- 누적 문장 수가 단어 모드까지 세고 있었다.
--
-- 무엇이 문제인가
--   profiles.total_typing_count는 화면에 **"누적 문장"** 으로 나온다.
--   0006의 주석도 "그대로 누적 문장 수다"라고 못박고 있다.
--   그런데 record_typing_result는 모드를 가리지 않고 제출 1건당 1씩 올렸다.
--   단어 모드는 10개를 모아 한 번에 보내므로, **단어 10개를 치면 "1문장"이 는다.**
--   문장을 한 개도 안 쳐도 누적 문장이 올라간다.
--
-- 왜 typing_mode_counts로 다시 세지 않나 ★
--   그게 맞아 보이지만 실제 데이터가 허락하지 않는다. 2026-07-28 기준
--
--     profiles.total_typing_count 합계 : 2,430,611
--     typing_mode_counts 제출 수 합계  :       163
--
--   기록이 있는 838명 중 **837명이 모드별 집계가 아예 없다.** 전부 Firestore에서
--   이관된 값이고, 그 값은 모드를 구분할 방법이 없다. 모드별 집계로 갈아타면
--   837명이 하루아침에 "0문장"이 된다.
--
-- 그래서
--   이관분은 그대로 두고, **앞으로 단어 모드가 이 값을 올리지 않게** 한다.
--   과거의 단어 모드 몫은 이관 값 안에 섞인 채로 남는다 — 떼어낼 방법이 없다.
--   단어 개수는 typing_mode_counts.word.item_count가 정확히 들고 있고
--   헤더의 모드별 안내에 그대로 나온다.
--
-- 0028과 인자가 같아서 create or replace로 끝난다. drop이 필요 없고 권한도 유지된다.
-- 바뀐 곳은 맨 아래 profiles UPDATE 한 줄뿐이다.

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

  -- 이미 적립한 제출이면 조용히 끝낸다(재전송). 성공으로 응답해야 큐가 지운다.
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
    -- 같은 키가 같은 순간에 두 번 들어왔다. 이 블록만 되돌아가고 적립은 건너뛴다.
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

  /* ★ 바뀐 곳 — 단어 모드는 total_typing_count를 올리지 않는다.
     이 값은 화면에 "누적 문장"으로 나온다. 단어 10개 묶음이 1문장으로 세어지고
     있었다. 단어 개수는 위 typing_mode_counts가 정확히 들고 있다.
     최고 CPM은 모드와 무관하므로 그대로 갱신한다. */
  update public.profiles
  set
    total_typing_count = total_typing_count + case when p_mode = 'word' then 0 else 1 end,
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

comment on column public.profiles.total_typing_count is
  '누적 문장 수. 단어 모드는 세지 않는다(0029). Firestore 이관분에는 과거 단어 모드 몫이 섞여 있으며 분리할 수 없다.';

notify pgrst, 'reload schema';
