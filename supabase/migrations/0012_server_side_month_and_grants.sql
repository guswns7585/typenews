-- 이벤트 무결성 보강 두 가지. 정상 사용자에게 보이는 동작은 달라지지 않는다.
--
--   1) 점수가 어느 달로 들어갈지 서버가 정한다
--   2) 0001에서 만든 테이블의 쓰기 권한을 authenticated에서 걷어낸다
--
-- ⚠️ 점수 적립 함수를 건드리므로 이벤트 중 적용에 주의. 다만 아래 변경은
--    "정상 클라이언트가 지금 성공하는 제출"을 거절하지 않는다. 상한이나 새 검사를
--    추가하지 않고, 클라이언트가 보낸 달을 서버 값으로 갈아끼우기만 한다.

-- ---------------------------------------------------------------------------
-- 1) month_id를 서버가 정한다
-- ---------------------------------------------------------------------------
--
-- 전에는 p_month_id를 클라이언트가 보내고 서버는 형식(^[0-9]{6}$)만 봤다.
-- 콘솔에서 p_month_id를 '202608'로 바꿔 보내면 다음 달 랭킹에 점수가 미리 쌓인다.
-- 경품이 걸린 랭킹에서는 치명적이다.
--
-- p_month_id 인자는 지웠을 때 배포된 프론트엔드의 호출이 깨지므로 남겨두고 무시한다.
-- 정상 클라이언트는 어차피 같은 값(Asia/Seoul 기준 현재 월)을 보내고 있었다.
--
-- 클라이언트 값이 서버 값과 다를 때 탐지 신호를 남기지는 않는다. 기기 시계가
-- 며칠씩 틀어진 사용자가 반복해서 워치리스트에 올라오면 이벤트 기간에 관리자가
-- 봐야 할 신호를 가린다. 과거 악용 흔적은 monthly_stats를 직접 조회해 확인한다.

create or replace function public.record_typing_result(
  p_month_id text,
  p_mode text,
  p_accuracy integer,
  p_cpm integer,
  p_score integer,
  p_elapsed_ms integer
)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  -- 문장 데이터 실측 기준. 가장 긴 장문이 277타, 뉴스 본문이 400타 안쪽이다.
  c_max_submission_score constant integer := 600;
  -- 초당 20타 = 1200 CPM. 사람의 최고 기록보다 넉넉히 위다.
  c_max_strokes_per_second constant numeric := 20;
  -- 1시간 누적 상한. 이걸 넘기면 사람이 아니다.
  c_max_hourly_score constant integer := 60000;

  -- 점수가 들어갈 달. 클라이언트가 뭘 보냈든 서버 시계가 정한다.
  v_month_id text := to_char(now() at time zone 'Asia/Seoul', 'YYYYMM');

  v_profile_id uuid;
  v_recent_score integer;
begin
  if auth.uid() is null then
    raise exception 'Not authenticated';
  end if;

  if p_mode not in ('short', 'long', 'word', 'news') then
    raise exception 'Invalid mode';
  end if;

  -- 정확도 미달은 조용히 버린다. 부정행위가 아니라 그냥 못 친 것이다.
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

  -- ---- 여기부터는 사람이 낼 수 없는 값인지 본다 ----
  -- 클라이언트가 보낸 숫자는 위조될 수 있다. 완벽히 막을 수는 없으므로
  -- 물리적으로 불가능한 값을 거르고, 걸리면 탐지 신호를 남긴다.

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

  update public.profiles
  set
    total_typing_count = total_typing_count + 1,
    max_cpm = greatest(max_cpm, p_cpm)
  where id = v_profile_id;
end;
$$;

comment on function public.record_typing_result(text, text, integer, integer, integer, integer) is
  'p_month_id는 하위 호환을 위해 남아 있을 뿐 사용하지 않는다. 점수가 들어갈 달은 서버가 Asia/Seoul 기준으로 정한다.';

grant execute on function public.record_typing_result(text, text, integer, integer, integer, integer) to authenticated;

-- ---------------------------------------------------------------------------
-- 2) 쓰기 권한 정리 (다층 방어)
-- ---------------------------------------------------------------------------
--
-- Supabase는 public 스키마의 기본 권한으로 새 테이블에 anon·authenticated에게
-- ALL을 준다. 0001은 anon에서만 걷어내고 authenticated는 그대로 뒀다.
-- 지금은 RLS에 INSERT/UPDATE/DELETE 정책이 없어서 막히지만, 방어가 한 겹뿐이다.
-- 누군가 실수로 `for all using (true)` 같은 정책을 붙이면 그 순간 점수를 직접
-- 쓸 수 있게 된다.
--
-- 점수·프로필 쓰기는 전부 security definer 함수를 통한다. 그 함수들은 소유자
-- 권한으로 돌기 때문에 여기서 걷어내도 영향이 없다.

revoke insert, update, delete on public.profiles from authenticated;
revoke insert, update, delete on public.monthly_stats from authenticated;
revoke insert, update, delete on public.typing_results from authenticated;

-- 이관 검증용 원본 보관 테이블. 클라이언트가 접근할 이유가 전혀 없다.
-- record_data 안에 이관 당시의 이메일과 문장이 들어 있다.
revoke all on public.suspicious_records from anon, authenticated;

-- 읽기는 유지한다. 본인 행만 보이도록 RLS가 걸려 있다.
grant select on public.profiles to authenticated;
grant select on public.monthly_stats to authenticated;
grant select on public.typing_results to authenticated;

notify pgrst, 'reload schema';
