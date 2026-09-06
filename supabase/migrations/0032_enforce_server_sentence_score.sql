-- 단문·장문 점수는 클라이언트 주장을 적립하지 않고 서버가 원문으로 다시 계산한다.
--
-- 0024~0029는 섀도 모드라 불일치를 기록만 하고 p_score를 그대로 적립했다.
-- SQL 포팅은 1,478문장 × 옵션 16조합에서 불일치 0건을 확인했고, 실제 Vercel
-- 제출도 checked=1 / mismatched=0이었다. 이벤트 전 단문·장문부터 강제한다.
--
-- 단어는 여러 단어를 한 번에 제출하고 뉴스는 RSS 원문이 DB에 없으므로 이번
-- 강제 범위에서 제외한다. 두 모드에는 기존 속도·제출·시간당 상한이 그대로 적용된다.

do $$
begin
  if to_regprocedure(
    'public.record_typing_result_unchecked(text,text,integer,integer,integer,integer,integer,bigint,jsonb,uuid)'
  ) is null then
    alter function public.record_typing_result(
      text, text, integer, integer, integer, integer, integer, bigint, jsonb, uuid
    ) rename to record_typing_result_unchecked;
  end if;
end;
$$;

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
  v_text text;
  v_server_score integer;
  v_profile_id uuid;
begin
  if p_mode not in ('short', 'long') then
    perform public.record_typing_result_unchecked(
      p_month_id, p_mode, p_accuracy, p_cpm, p_score, p_elapsed_ms,
      p_items, p_sentence_id, p_options, p_submission_key
    );
    return;
  end if;

  /* 형식 자체가 말이 안 되는 주장은 기존 함수가 신호를 남기고 거절하게 한다. */
  if p_score is null or p_score <= 0 or p_score > 600 then
    perform public.record_typing_result_unchecked(
      p_month_id, p_mode, p_accuracy, p_cpm, p_score, p_elapsed_ms,
      p_items, p_sentence_id, p_options, p_submission_key
    );
    return;
  end if;

  /* DB 조회 실패로 JSON 폴백을 썼거나 번호를 조작한 제출은 이벤트 점수에 넣지 않는다.
     RPC는 정상 종료해 outbox가 영원히 재시도하지 않게 한다. */
  if p_sentence_id is null then
    return;
  end if;

  select s.text
  into v_text
  from public.sentences s
  where s.id = p_sentence_id
    and s.mode = p_mode
    and s.enabled;

  if v_text is null then
    return;
  end if;

  v_server_score := public.sentence_score(
    v_text,
    coalesce((p_options ->> 'punctuation')::boolean, false),
    coalesce((p_options ->> 'numbers')::boolean, false),
    coalesce((p_options ->> 'english')::boolean, false),
    coalesce((p_options ->> 'symbols')::boolean, false)
  );

  /* 적립·중복 방지·카운터·검산은 검증된 기존 함수가 담당한다.
     p_score만 서버 계산값으로 바꾼다. */
  perform public.record_typing_result_unchecked(
    p_month_id, p_mode, p_accuracy, p_cpm, v_server_score, p_elapsed_ms,
    p_items, p_sentence_id, p_options, p_submission_key
  );

  /* 큰 과다 주장은 적립 여부와 별개로 검토 목록에 남긴다.
     정상 클라이언트의 반올림 차이 같은 작은 값은 신호로 만들지 않는다. */
  if p_score - v_server_score >= 50 and p_score >= v_server_score * 2 then
    select public.current_profile_id() into v_profile_id;
    if v_profile_id is not null then
      perform public.raise_abuse_signal(
        v_profile_id,
        null,
        'SCORE_MISMATCH',
        2,
        jsonb_build_object(
          'claimed', p_score,
          'accepted', v_server_score,
          'sentence_id', p_sentence_id,
          'mode', p_mode,
          'enforced', true
        )
      );
    end if;
  end if;
end;
$$;

comment on function public.record_typing_result(
  text, text, integer, integer, integer, integer, integer, bigint, jsonb, uuid
) is
  '단문·장문은 DB 원문으로 서버 계산한 점수만 적립한다. 단어·뉴스는 기존 상한·탐지 경로를 사용한다.';

revoke all on function public.record_typing_result_unchecked(
  text, text, integer, integer, integer, integer, integer, bigint, jsonb, uuid
) from public, anon, authenticated;
revoke all on function public.record_typing_result(
  text, text, integer, integer, integer, integer, integer, bigint, jsonb, uuid
) from public, anon;
grant execute on function public.record_typing_result(
  text, text, integer, integer, integer, integer, integer, bigint, jsonb, uuid
) to authenticated;

notify pgrst, 'reload schema';

-- 적용 후 단문 한 문장을 정상 입력해 확인:
--   select * from public.get_score_verification_summary(1);
-- checked가 늘고 mismatched/over_reported/abs_delta_sum은 0이어야 한다.
