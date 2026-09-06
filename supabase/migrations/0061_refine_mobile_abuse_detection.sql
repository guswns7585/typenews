-- Reduce mobile false positives in integrity signals.
--
-- Mobile browsers and IMEs do not always emit composition/key events like
-- desktop browsers. Store a coarse device class and use it to make the noisy
-- rules stricter while keeping server-side score verification unchanged.

alter table public.typing_sessions
  add column if not exists device_class text;

alter table public.typing_sessions
  drop constraint if exists typing_sessions_device_class_check;

alter table public.typing_sessions
  add constraint typing_sessions_device_class_check
  check (device_class is null or device_class in ('desktop', 'tablet', 'mobile'));

comment on column public.typing_sessions.device_class is
  'Coarse client device class reported by the typing integrity tracker.';

create or replace function public.evaluate_session_signals(p_session_id bigint)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  s public.typing_sessions;
  v_avg_cpm numeric;
  v_cpm_stddev numeric;
  v_avg_accuracy numeric;
  v_avg_interval numeric;
  v_interval_stddev numeric;
  v_interval_cv numeric;
  v_composition_ratio numeric;
  v_session_ms numeric;
  v_device_class text;
  v_is_mobile boolean;
  v_key_char_ratio numeric;
  v_ime_sentence_threshold integer;
  v_ime_ratio_threshold numeric;
  v_ime_severity smallint;
  v_key_sentence_threshold integer;
  v_key_divisor integer;
  v_key_severity smallint;
  v_no_correction_sentence_threshold integer;
  v_no_correction_severity smallint;
  v_speed_spike_threshold integer;
  v_flat_sentence_threshold integer;
begin
  select * into s from public.typing_sessions where id = p_session_id;
  if not found or s.sentence_count = 0 then
    return;
  end if;

  v_device_class := coalesce(
    nullif(s.device_class, ''),
    case
      when coalesce(s.user_agent, '') ~* '(Mobile|Android|iPhone|iPad|iPod)' then 'mobile'
      else 'desktop'
    end
  );
  v_is_mobile := v_device_class in ('mobile', 'tablet');
  v_ime_sentence_threshold := case when v_is_mobile then 20 else 10 end;
  v_ime_ratio_threshold := case when v_is_mobile then 0.02 else 0.10 end;
  v_ime_severity := (case when v_is_mobile then 2 else 3 end)::smallint;
  v_key_sentence_threshold := case when v_is_mobile then 20 else 10 end;
  v_key_divisor := case when v_is_mobile then 8 else 4 end;
  v_key_severity := (case when v_is_mobile then 2 else 3 end)::smallint;
  v_no_correction_sentence_threshold := case when v_is_mobile then 80 else 50 end;
  v_no_correction_severity := (case when v_is_mobile then 1 else 2 end)::smallint;
  v_speed_spike_threshold := case when v_is_mobile then 1500 else 1200 end;
  v_flat_sentence_threshold := case when v_is_mobile then 50 else 30 end;

  v_avg_cpm := s.cpm_sum::numeric / s.sentence_count;
  v_avg_accuracy := s.accuracy_sum::numeric / s.sentence_count;
  v_cpm_stddev := sqrt(greatest(s.cpm_sq_sum / s.sentence_count - v_avg_cpm ^ 2, 0));
  v_session_ms := extract(epoch from (s.last_seen_at - s.started_at)) * 1000;
  v_key_char_ratio := case
    when s.typed_chars > 0 then s.keystroke_count::numeric / s.typed_chars
    else null
  end;

  if s.keystroke_count >= 2 then
    v_avg_interval := s.interval_sum::numeric / s.keystroke_count;
    v_interval_stddev := sqrt(greatest(s.interval_sq_sum / s.keystroke_count - v_avg_interval ^ 2, 0));
    v_interval_cv := case when v_avg_interval > 0 then v_interval_stddev / v_avg_interval end;
  end if;

  if s.hangul_sentence_count > 0 then
    v_composition_ratio := s.composed_sentence_count::numeric / s.hangul_sentence_count;
  end if;

  -- Desktop IME composition is a strong signal. On mobile/tablet it is only a
  -- signal when another input-integrity clue appears with it.
  if s.hangul_sentence_count >= v_ime_sentence_threshold
     and coalesce(v_composition_ratio, 0) < v_ime_ratio_threshold
     and (
       not v_is_mobile
       or s.keystroke_count < s.typed_chars / 2
       or s.paste_attempts >= 5
       or s.blurred_input_count >= 10
    ) then
    perform public.raise_abuse_signal(
      s.profile_id, s.id, 'NO_IME_COMPOSITION', v_ime_severity,
      jsonb_build_object(
        'device_class', v_device_class,
        'hangul_sentences', s.hangul_sentence_count,
        'composed_sentences', s.composed_sentence_count,
        'ratio', round(coalesce(v_composition_ratio, 0), 3),
        'keystroke_char_ratio', round(coalesce(v_key_char_ratio, 0), 3),
        'paste_attempts', s.paste_attempts,
        'blurred_inputs', s.blurred_input_count
      )
    );
  end if;

  -- Mobile virtual keyboards can under-report keydown events, so require an
  -- extra clue before treating low key events as suspicious on mobile/tablet.
  if s.sentence_count >= v_key_sentence_threshold
     and s.keystroke_count < s.typed_chars / v_key_divisor
     and (
       not v_is_mobile
       or s.paste_attempts >= 5
       or s.blurred_input_count >= 10
    ) then
    perform public.raise_abuse_signal(
      s.profile_id, s.id, 'NO_KEY_EVENTS', v_key_severity,
      jsonb_build_object(
        'device_class', v_device_class,
        'sentences', s.sentence_count,
        'keystrokes', s.keystroke_count,
        'typed_chars', s.typed_chars,
        'keystroke_char_ratio', round(coalesce(v_key_char_ratio, 0), 3)
      )
    );
  end if;

  if s.blurred_input_count >= 10 then
    perform public.raise_abuse_signal(
      s.profile_id, s.id, 'BACKGROUND_INPUT', 3::smallint,
      jsonb_build_object(
        'device_class', v_device_class,
        'blurred_inputs', s.blurred_input_count
      )
    );
  end if;

  if (
       not v_is_mobile
       and s.keystroke_count >= 200
       and v_interval_cv is not null
       and v_interval_cv < 0.15
     ) or (
       v_is_mobile
       and s.keystroke_count >= 500
       and v_interval_cv is not null
       and v_interval_cv < 0.08
     ) then
    perform public.raise_abuse_signal(
      s.profile_id, s.id, 'UNIFORM_KEY_RHYTHM', 3::smallint,
      jsonb_build_object(
        'device_class', v_device_class,
        'keystrokes', s.keystroke_count,
        'avg_interval_ms', round(v_avg_interval, 1),
        'interval_cv', round(v_interval_cv, 3)
      )
    );
  end if;

  if s.sentence_count >= v_no_correction_sentence_threshold
     and s.typed_chars >= 1000
     and s.backspace_count = 0
     and v_avg_accuracy >= 99.5 then
    perform public.raise_abuse_signal(
      s.profile_id, s.id, 'NO_CORRECTION', v_no_correction_severity,
      jsonb_build_object(
        'device_class', v_device_class,
        'sentences', s.sentence_count,
        'typed_chars', s.typed_chars,
        'avg_accuracy', round(v_avg_accuracy, 1)
      )
    );
  end if;

  if s.cpm_max > v_speed_spike_threshold
     and v_avg_accuracy >= 98 then
    perform public.raise_abuse_signal(
      s.profile_id, s.id, 'SPEED_SPIKE', 2::smallint,
      jsonb_build_object(
        'device_class', v_device_class,
        'max_cpm', s.cpm_max,
        'avg_accuracy', round(v_avg_accuracy, 1)
      )
    );
  end if;

  -- The previous flat-CPM rule fired on too little evidence. Keep it as a weak
  -- consistency clue only after a longer, faster, high-accuracy session.
  if s.sentence_count >= v_flat_sentence_threshold
     and s.active_ms >= 10 * 60 * 1000
     and v_avg_accuracy >= 98
     and v_avg_cpm >= 350
     and (
       v_cpm_stddev < 25
       or (v_cpm_stddev < 35 and v_avg_cpm >= 500)
     ) then
    perform public.raise_abuse_signal(
      s.profile_id, s.id, 'FLAT_CPM_VARIANCE', 1::smallint,
      jsonb_build_object(
        'device_class', v_device_class,
        'sentences', s.sentence_count,
        'active_minutes', round(s.active_ms::numeric / 60000, 1),
        'avg_cpm', round(v_avg_cpm, 1),
        'cpm_stddev', round(v_cpm_stddev, 1),
        'avg_accuracy', round(v_avg_accuracy, 1)
      )
    );
  end if;

  if s.paste_attempts >= 5 then
    perform public.raise_abuse_signal(
      s.profile_id, s.id, 'PASTE_ATTEMPT', 1::smallint,
      jsonb_build_object(
        'device_class', v_device_class,
        'attempts', s.paste_attempts
      )
    );
  end if;

  -- Use active typing time, not wall-clock tab-open time, for marathon checks.
  if s.active_ms >= 5 * 60 * 60 * 1000
     and s.sentence_count >= 200
     and v_avg_accuracy >= 95 then
    perform public.raise_abuse_signal(
      s.profile_id, s.id, 'MARATHON_SESSION', 1::smallint,
      jsonb_build_object(
        'device_class', v_device_class,
        'active_hours', round(s.active_ms::numeric / 3600000, 1),
        'wall_hours', round(v_session_ms / 3600000, 1),
        'sentences', s.sentence_count,
        'avg_accuracy', round(v_avg_accuracy, 1)
      )
    );
  end if;
end;
$$;

create or replace function public.report_typing_session(
  p_session_key uuid,
  p_started_at timestamptz,
  p_metrics jsonb
)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  v_profile_id uuid;
  v_session_id bigint;
  v_sentence_count integer;
  v_device_class text;
begin
  if auth.uid() is null then
    return;
  end if;

  select public.current_profile_id() into v_profile_id;
  if v_profile_id is null then
    return;
  end if;

  v_sentence_count := least(greatest(coalesce((p_metrics ->> 'sentenceCount')::integer, 0), 0), 100000);
  if v_sentence_count = 0 then
    return;
  end if;

  v_device_class := lower(nullif(p_metrics ->> 'deviceClass', ''));
  if v_device_class not in ('desktop', 'tablet', 'mobile') then
    v_device_class := null;
  end if;

  insert into public.typing_sessions as ts (
    profile_id, session_key, started_at, last_seen_at,
    sentence_count, typed_chars, active_ms,
    cpm_sum, cpm_sq_sum, cpm_max, accuracy_sum,
    backspace_count, paste_attempts, blurred_input_count,
    hangul_sentence_count, composed_sentence_count,
    keystroke_count, interval_sum, interval_sq_sum,
    user_agent, device_class
  )
  values (
    v_profile_id,
    p_session_key,
    least(coalesce(p_started_at, now()), now()),
    now(),
    v_sentence_count,
    least(greatest(coalesce((p_metrics ->> 'typedChars')::bigint, 0), 0), 100000000),
    least(greatest(coalesce((p_metrics ->> 'activeMs')::bigint, 0), 0), 86400000),
    least(greatest(coalesce((p_metrics ->> 'cpmSum')::bigint, 0), 0), 500000000),
    least(greatest(coalesce((p_metrics ->> 'cpmSqSum')::numeric, 0), 0), 1e15),
    least(greatest(coalesce((p_metrics ->> 'cpmMax')::integer, 0), 0), 100000),
    least(greatest(coalesce((p_metrics ->> 'accuracySum')::bigint, 0), 0), 10000000),
    least(greatest(coalesce((p_metrics ->> 'backspaceCount')::integer, 0), 0), 10000000),
    least(greatest(coalesce((p_metrics ->> 'pasteAttempts')::integer, 0), 0), 1000000),
    least(greatest(coalesce((p_metrics ->> 'blurredInputCount')::integer, 0), 0), 1000000),
    least(greatest(coalesce((p_metrics ->> 'hangulSentenceCount')::integer, 0), 0), 100000),
    least(greatest(coalesce((p_metrics ->> 'composedSentenceCount')::integer, 0), 0), 100000),
    least(greatest(coalesce((p_metrics ->> 'keystrokeCount')::integer, 0), 0), 100000000),
    least(greatest(coalesce((p_metrics ->> 'intervalSum')::bigint, 0), 0), 86400000),
    least(greatest(coalesce((p_metrics ->> 'intervalSqSum')::numeric, 0), 0), 1e15),
    left(coalesce(p_metrics ->> 'userAgent', ''), 300),
    v_device_class
  )
  on conflict (profile_id, session_key) do update
  set
    last_seen_at = now(),
    sentence_count = greatest(ts.sentence_count, excluded.sentence_count),
    typed_chars = greatest(ts.typed_chars, excluded.typed_chars),
    active_ms = greatest(ts.active_ms, excluded.active_ms),
    cpm_sum = greatest(ts.cpm_sum, excluded.cpm_sum),
    cpm_sq_sum = greatest(ts.cpm_sq_sum, excluded.cpm_sq_sum),
    cpm_max = greatest(ts.cpm_max, excluded.cpm_max),
    accuracy_sum = greatest(ts.accuracy_sum, excluded.accuracy_sum),
    backspace_count = greatest(ts.backspace_count, excluded.backspace_count),
    paste_attempts = greatest(ts.paste_attempts, excluded.paste_attempts),
    blurred_input_count = greatest(ts.blurred_input_count, excluded.blurred_input_count),
    hangul_sentence_count = greatest(ts.hangul_sentence_count, excluded.hangul_sentence_count),
    composed_sentence_count = greatest(ts.composed_sentence_count, excluded.composed_sentence_count),
    keystroke_count = greatest(ts.keystroke_count, excluded.keystroke_count),
    interval_sum = greatest(ts.interval_sum, excluded.interval_sum),
    interval_sq_sum = greatest(ts.interval_sq_sum, excluded.interval_sq_sum),
    user_agent = coalesce(nullif(excluded.user_agent, ''), ts.user_agent),
    device_class = coalesce(excluded.device_class, ts.device_class)
  returning ts.id into v_session_id;

  perform public.evaluate_session_signals(v_session_id);
  perform public.evaluate_server_side_signals(v_profile_id);
end;
$$;

revoke all on function public.evaluate_session_signals(bigint) from public, anon, authenticated;
revoke all on function public.evaluate_server_side_signals(uuid) from public, anon, authenticated;
revoke all on function public.report_typing_session(uuid, timestamptz, jsonb) from public, anon;
grant execute on function public.report_typing_session(uuid, timestamptz, jsonb) to authenticated;

notify pgrst, 'reload schema';
