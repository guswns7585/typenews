-- 서버가 점수를 직접 계산해 클라이언트가 보낸 값과 대조한다 (섀도 모드).
--
-- 무엇이 문제인가
--   record_typing_result는 p_score를 그대로 믿는다. 검사라고는 "600 이하",
--   "초당 20타 이하", "시간당 60,000점 이하"뿐이다. 콘솔에서
--     supabase.rpc('record_typing_result', { ..., p_score: 600, ... })
--   를 반복하면 상한 안에서 얼마든지 부풀릴 수 있다. 정직한 상위 사용자의
--   문장당 평균이 약 21타이므로 문장당 600은 29배다.
--
-- 왜 이제 고칠 수 있나
--   문장 1,478개가 sentences 표에 들어왔다. 클라이언트가 어떤 문장을 쳤는지
--   (sentence_id) 알려주면 서버가 그 원문으로 타수를 다시 셀 수 있다.
--
-- 왜 바로 막지 않고 섀도부터인가
--   무시 옵션(문장부호·숫자·영어·특수문자) 넷을 SQL로 다시 구현하는 일이다.
--   한 글자라도 다르게 세면 **정직한 사용자 전원의 점수가 어긋난다.** 그것도
--   이벤트 진행 중에. 그래서 이 마이그레이션은 계산하고 기록만 한다.
--   적립은 여전히 클라이언트 값 그대로다. score_verifications에서 불일치가
--   0에 수렴하는 것을 확인한 뒤에 강제 전환한다(아래 "전환 방법").
--
-- 무엇까지 막히나 (전환 후 기준)
--   제출 하나의 상한이 "실제로 존재하는 문장의 타수"가 된다. 600 고정이 아니라
--   그 문장의 길이다. 다만 존재하는 가장 긴 문장을 반복 제출하는 것은 여전히
--   가능하다. 그쪽은 시간당 상한과 IMPOSSIBLE_SPEED가 맡는다.
--
--   ⚠️ 클라이언트가 무시 옵션을 거짓말해도 이득이 없다. 옵션을 전부 끈 것으로
--      속이면 기대 점수가 **올라가지만**, 그 값은 그 문장을 한 글자도 빼놓지 않고
--      다 쳤을 때의 점수다. 즉 거짓말의 상한이 곧 정직한 최대치다.
--
-- 검산 대상이 아닌 것
--   단어 모드(10개를 묶어 보낸다)와 뉴스 모드(RSS라 DB에 원문이 없다)는
--   sentence_id가 없다. unverified로만 센다.

-- ---------------------------------------------------------------------------
-- 1. 글자 하나의 타수 — keystrokes.ts의 keystrokesForCharacter와 같아야 한다
-- ---------------------------------------------------------------------------
--
-- 두벌식 기준. 한글 음절은 초성·중성·종성으로 풀어 실제 누르는 키 수를 센다.
-- 겹받침(ㄳ ㄺ ㅄ…)과 복합모음(ㅘ ㅙ ㅢ…)은 2타, 쌍자음(ㄲ ㄸ ㅃ ㅆ ㅉ)과
-- ㅒ ㅖ는 Shift 조합이라 1타. 공백은 0타. 나머지는 1타.
--
-- ⚠️ 이 함수와 frontend/features/typing-engine/keystrokes.ts는 한 쌍이다.
--    한쪽만 고치면 전원의 점수가 어긋난다.

create or replace function public.keystrokes_for_char(p_char text)
returns integer
language sql
immutable
parallel safe
as $fn$
  select case
    -- 공백과 제어 문자는 세지 않는다
    when p_char = ' ' then 0
    when ascii(p_char) < 32 then 0

    -- 한글 음절 U+AC00~U+D7A3
    when ascii(p_char) between 44032 and 55203 then
      /* 초성 19개는 전부 1타 (쌍자음도 Shift 조합이라 1타) */
      1
      /* 중성 ㅏㅐㅑㅒㅓㅔㅕㅖㅗㅘㅙㅚㅛㅜㅝㅞㅟㅠㅡㅢㅣ */
      + (array[1,1,1,1,1,1,1,1,1,2,2,2,1,1,2,2,2,1,1,2,1])
        [((ascii(p_char) - 44032) % 588) / 28 + 1]
      /* 종성 없음, ㄱㄲㄳㄴㄵㄶㄷㄹㄺㄻㄼㄽㄾㄿㅀㅁㅂㅄㅅㅆㅇㅈㅊㅋㅌㅍㅎ */
      + (array[0,1,1,2,1,2,2,1,1,2,2,2,2,2,2,2,1,1,2,1,1,1,1,1,1,1,1,1])
        [(ascii(p_char) - 44032) % 28 + 1]

    -- 낱자로 쓰인 호환 자모 U+3131~U+3163 (ㅋㅋㅋ, ㅠㅠ 같은 입력)
    when ascii(p_char) between 12593 and 12643 then
      case
        when p_char in ('ㄳ','ㄵ','ㄶ','ㄺ','ㄻ','ㄼ','ㄽ','ㄾ','ㄿ','ㅀ','ㅄ',
                        'ㅘ','ㅙ','ㅚ','ㅝ','ㅞ','ㅟ','ㅢ') then 2
        else 1
      end

    else 1
  end
$fn$;

comment on function public.keystrokes_for_char(text) is
  'frontend/features/typing-engine/keystrokes.ts의 keystrokesForCharacter와 반드시 같은 값을 낸다.';

-- ---------------------------------------------------------------------------
-- 2. 문장 하나의 점수 — alignment.ts의 isIgnoredCharacter + scoreForSentence
-- ---------------------------------------------------------------------------
--
-- 무시 옵션으로 걸러진 글자는 빼고 나머지 타수를 더한다.
-- 문자 클래스는 alignment.ts의 정규식을 그대로 옮긴 것이다.
--   PUNCTUATION /[.,!?'"“”‘’~]/
--   NUMBER      /[0-9]/
--   LATIN       /\p{Script=Latin}/u   → Postgres에는 스크립트 속성이 없어
--                                       A-Z a-z + 라틴 확장(À-ɏ)으로 옮긴다.
--                                       우리 문장에 그 밖의 라틴 문자는 없다.
--   SYMBOL      /[!@#$%^&*()_\-+={}[\]|\\:;<>?/~]/

create or replace function public.sentence_score(
  p_text text,
  p_ignore_punctuation boolean default false,
  p_ignore_numbers boolean default false,
  p_ignore_english boolean default false,
  p_ignore_symbols boolean default false
)
returns integer
language sql
immutable
parallel safe
as $fn$
  select coalesce(sum(public.keystrokes_for_char(ch)), 0)::integer
  from regexp_split_to_table(coalesce(p_text, ''), '') as ch
  where not (
       (coalesce(p_ignore_punctuation, false) and ch ~ '[.,!?''"“”‘’~]')
    or (coalesce(p_ignore_numbers, false)     and ch ~ '[0-9]')
    or (coalesce(p_ignore_english, false)     and ch ~ '[A-Za-zÀ-ɏ]')
    or (coalesce(p_ignore_symbols, false)     and ch ~ '[!@#$%^&*()_+={}|\\:;<>?/~\[\]-]')
  )
$fn$;

comment on function public.sentence_score(text, boolean, boolean, boolean, boolean) is
  '문장을 끝냈을 때 받는 점수. frontend typing-workspace.tsx의 scoreForSentence와 같은 값을 내야 한다.';

/* 표 전체를 한 번에 계산해 돌려준다. scripts/verify-score-port.mjs가 이것으로
   1,478문장 × 옵션 16조합을 대조한다. 문장마다 왕복하면 2만 번이 넘는다. */
create or replace function public.sentence_scores(
  p_ignore_punctuation boolean default false,
  p_ignore_numbers boolean default false,
  p_ignore_english boolean default false,
  p_ignore_symbols boolean default false
)
returns table (id bigint, score integer)
language sql
stable
as $fn$
  select
    s.id,
    public.sentence_score(
      s.text, p_ignore_punctuation, p_ignore_numbers, p_ignore_english, p_ignore_symbols
    )
  from public.sentences s
  order by s.id
$fn$;

revoke all on function public.keystrokes_for_char(text) from public, anon, authenticated;
revoke all on function public.sentence_score(text, boolean, boolean, boolean, boolean)
  from public, anon, authenticated;
revoke all on function public.sentence_scores(boolean, boolean, boolean, boolean)
  from public, anon, authenticated;

-- ---------------------------------------------------------------------------
-- 3. 검산 결과를 모아 두는 곳
-- ---------------------------------------------------------------------------
--
-- 제출마다 한 행씩 쌓으면 typing_results와 같은 문제가 생긴다.
-- 사용자·날짜당 한 행으로 누적한다. 활성 100명이면 하루 100행이다.

create table if not exists public.score_verifications (
  profile_id uuid not null references public.profiles(id) on delete cascade,
  -- Asia/Seoul 기준 날짜. 수렴 여부를 날짜별로 봐야 한다.
  day date not null,

  -- sentence_id가 있어서 실제로 대조한 제출 수
  checked integer not null default 0 check (checked >= 0),
  -- 그중 서버 계산과 값이 다른 제출 수
  mismatched integer not null default 0 check (mismatched >= 0),
  -- 그중 클라이언트가 더 크게 부른 제출 수. 이쪽만 부정행위가 될 수 있다.
  over_reported integer not null default 0 check (over_reported >= 0),
  -- 단어·뉴스 모드처럼 대조할 원문이 없는 제출 수
  unverified integer not null default 0 check (unverified >= 0),

  -- 차이의 절댓값 합. 평균 오차를 보려면 필요하다.
  abs_delta_sum bigint not null default 0 check (abs_delta_sum >= 0),
  -- 가장 크게 부풀린 폭
  max_over integer not null default 0 check (max_over >= 0),

  updated_at timestamptz not null default now(),
  primary key (profile_id, day)
);

comment on table public.score_verifications is
  '섀도 모드 검산 집계. 적립에는 영향을 주지 않는다. 불일치가 0에 수렴하면 강제 전환한다.';

alter table public.score_verifications enable row level security;

-- 어떤 검사가 도는지 알면 회피가 쉬워진다. 본인도 볼 수 없다.
drop policy if exists "score_verifications_admin_select" on public.score_verifications;
create policy "score_verifications_admin_select"
on public.score_verifications for select
to authenticated
using (public.is_admin());

revoke all on public.score_verifications from anon, authenticated;
grant select on public.score_verifications to authenticated;

-- ---------------------------------------------------------------------------
-- 4. 적립 함수 — 인자 둘을 더하고, 검산을 붙인다
-- ---------------------------------------------------------------------------
--
-- 기존 로직은 한 줄도 바꾸지 않았다. 통과 처리 뒤에 검산 블록만 붙는다.
-- 새 인자에 기본값이 있어 배포된 구 클라이언트(7-인자 호출)도 그대로 동작한다.

create or replace function public.record_typing_result(
  p_month_id text,
  p_mode text,
  p_accuracy integer,
  p_cpm integer,
  p_score integer,
  p_elapsed_ms integer,
  p_items integer default 1,
  -- 이 제출에서 친 문장. 단어·뉴스 모드는 null.
  p_sentence_id bigint default null,
  -- 켜져 있던 무시 옵션. {"punctuation":true,"numbers":false,...}
  p_options jsonb default null
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
     모드별 정확한 수는 typing_mode_counts가 담당한다. */
  update public.profiles
  set
    total_typing_count = total_typing_count + 1,
    max_cpm = greatest(max_cpm, p_cpm)
  where id = v_profile_id;

  -- ---- 여기서부터 섀도 검산. 위의 적립에는 영향을 주지 않는다 ----

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
    -- 없는 문장 번호다. 관리자가 방금 지웠거나, 지어낸 번호거나.
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

  /* 워치리스트에는 "옮기다 틀린 것"으로는 설명되지 않는 크기만 올린다.
     포팅 오차는 몇 타 단위다. 두 배 이상이면서 50타 넘게 차이 나는 것은
     계산이 어긋난 것이 아니라 값을 지어낸 것이다. */
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

comment on function public.record_typing_result(text, text, integer, integer, integer, integer, integer, bigint, jsonb) is
  'p_month_id는 하위 호환용이며 사용하지 않는다. 달은 서버가 Asia/Seoul 기준으로 정한다. p_sentence_id/p_options는 섀도 검산용이며 적립에는 영향이 없다.';

-- 7-인자 구버전을 남겨두면 PostgREST가 어느 함수인지 정하지 못한다(PGRST203).
-- 새 함수의 기본값이 구 호출을 그대로 받는다.
drop function if exists public.record_typing_result(text, text, integer, integer, integer, integer, integer);

grant execute on function public.record_typing_result(
  text, text, integer, integer, integer, integer, integer, bigint, jsonb
) to authenticated;

-- ---------------------------------------------------------------------------
-- 5. 수렴을 확인하는 관리자 조회
-- ---------------------------------------------------------------------------
--
-- 이 값들이 며칠째 mismatched = 0 이면 강제 전환해도 된다.

create or replace function public.get_score_verification_summary(
  p_days integer default 14
)
returns table (
  day date,
  profiles integer,
  checked bigint,
  mismatched bigint,
  over_reported bigint,
  unverified bigint,
  mismatch_rate numeric,
  avg_abs_delta numeric,
  max_over integer
)
language sql
stable
security definer
set search_path = public
as $$
  select
    v.day,
    count(*)::integer,
    sum(v.checked),
    sum(v.mismatched),
    sum(v.over_reported),
    sum(v.unverified),
    case when sum(v.checked) > 0
      then round(sum(v.mismatched)::numeric / sum(v.checked) * 100, 2)
    end,
    case when sum(v.checked) > 0
      then round(sum(v.abs_delta_sum)::numeric / sum(v.checked), 2)
    end,
    max(v.max_over)
  from public.score_verifications v
  where v.day > ((now() at time zone 'Asia/Seoul')::date
                 - greatest(coalesce(p_days, 14), 1))
    and public.is_admin()
  group by v.day
  order by v.day desc
$$;

grant execute on function public.get_score_verification_summary(integer) to authenticated;

-- ---------------------------------------------------------------------------
-- 전환 방법 (불일치가 0에 수렴한 뒤)
-- ---------------------------------------------------------------------------
--
-- 위 4번의 검산 블록을 적립 **앞으로** 옮기고, p_score 대신 v_expected를 적립한다.
-- 그때 정해야 할 것 둘:
--   1) sentence_id가 없는 제출(단어·뉴스)을 어떻게 할 것인가.
--      단어 모드는 묶음이라 문장 번호 배열을 받도록 클라이언트를 먼저 고쳐야 한다.
--      뉴스는 원문이 DB에 없어서 끝내 검산할 수 없다. 뉴스만 상한을 따로 두는 편이 낫다.
--   2) 옛 클라이언트가 캐시에 남아 sentence_id 없이 보내는 기간을 얼마나 봐줄 것인가.
--
-- 지금 당장 하지 않는 이유는 문서 맨 위에 적어두었다.

notify pgrst, 'reload schema';
