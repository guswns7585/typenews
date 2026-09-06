-- 0032에서 남겨둔 단어·뉴스 점수도 서버 원문으로 강제한다.
--
-- 적용 순서:
--   1) 0033 적용
--   2) SUPABASE_SERVICE_ROLE_KEY가 설정된 새 프런트엔드 배포 및 뉴스 로딩 확인
--   3) 이 파일(0034) 적용
-- 이 순서를 지키면 배포 사이에 정상 사용자의 뉴스 점수가 사라지지 않는다.

do $$
begin
  if to_regprocedure(
    'public.record_typing_result_sentence_enforced(text,text,integer,integer,integer,integer,integer,bigint,jsonb,uuid)'
  ) is null then
    alter function public.record_typing_result(
      text, text, integer, integer, integer, integer, integer, bigint, jsonb, uuid
    ) rename to record_typing_result_sentence_enforced;
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
  v_entries jsonb;
  v_entry_count integer;
  v_matched_count integer;
  v_text text;
  v_server_score integer;
  v_profile_id uuid;
begin
  if p_mode in ('short', 'long') then
    perform public.record_typing_result_sentence_enforced(
      p_month_id, p_mode, p_accuracy, p_cpm, p_score, p_elapsed_ms,
      p_items, p_sentence_id, p_options, p_submission_key
    );
    return;
  end if;

  if p_mode = 'word' then
    v_entries := p_options -> 'wordEntries';
    if v_entries is null or jsonb_typeof(v_entries) <> 'array' then
      return;
    end if;

    v_entry_count := jsonb_array_length(v_entries);
    if v_entry_count < 1 or v_entry_count > 10 or p_items <> v_entry_count then
      return;
    end if;

    /* jsonb_array_elements는 중복 ID도 각각 한 행으로 유지한다. 사용자가 이전 단어로
       돌아가 다시 친 정상 경우도 그대로 점수에 포함된다. 숫자 캐스팅 대신 id::text로
       비교해 조작된 JSON이 SQL 예외를 일으켜 outbox에 영원히 남는 것도 막는다. */
    select count(*), coalesce(sum(public.sentence_score(
      s.text,
      (entry.value #>> '{options,punctuation}') = 'true',
      (entry.value #>> '{options,numbers}') = 'true',
      (entry.value #>> '{options,english}') = 'true',
      (entry.value #>> '{options,symbols}') = 'true'
    )), 0)::integer
    into v_matched_count, v_server_score
    from jsonb_array_elements(v_entries) as entry(value)
    join public.sentences s
      on s.id::text = entry.value ->> 'sentenceId'
     and s.mode = 'word'
     and s.enabled;

    if v_matched_count <> v_entry_count or v_server_score <= 0 then
      return;
    end if;

  elsif p_mode = 'news' then
    select n.body
    into v_text
    from public.news_score_sources n
    where n.id::text = p_options ->> 'newsSourceId'
      and n.expires_at > now();

    if v_text is null then
      return;
    end if;

    v_server_score := public.sentence_score(
      v_text,
      (p_options ->> 'punctuation') = 'true',
      (p_options ->> 'numbers') = 'true',
      (p_options ->> 'english') = 'true',
      (p_options ->> 'symbols') = 'true'
    );
    if v_server_score <= 0 then
      return;
    end if;
  else
    /* Invalid mode 처리와 감사 신호는 검증된 기존 함수가 담당한다. */
    perform public.record_typing_result_unchecked(
      p_month_id, p_mode, p_accuracy, p_cpm, p_score, p_elapsed_ms,
      p_items, p_sentence_id, p_options, p_submission_key
    );
    return;
  end if;

  perform public.record_typing_result_unchecked(
    p_month_id, p_mode, p_accuracy, p_cpm, v_server_score, p_elapsed_ms,
    p_items, null, p_options, p_submission_key
  );

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
  '모든 모드의 점수를 DB 문장 또는 Vercel이 등록한 RSS 원문으로 서버 재계산해 적립한다.';

revoke all on function public.record_typing_result_sentence_enforced(
  text, text, integer, integer, integer, integer, integer, bigint, jsonb, uuid
) from public, anon, authenticated;
revoke all on function public.record_typing_result(
  text, text, integer, integer, integer, integer, integer, bigint, jsonb, uuid
) from public, anon;
grant execute on function public.record_typing_result(
  text, text, integer, integer, integer, integer, integer, bigint, jsonb, uuid
) to authenticated;

notify pgrst, 'reload schema';
