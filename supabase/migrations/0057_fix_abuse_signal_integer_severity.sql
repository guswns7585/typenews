-- Score and integrity RPCs call this helper with integer severity literals.
-- The original helper takes smallint, so PostgreSQL can fail function
-- resolution at runtime before it gets a chance to cast those literals.

create or replace function public.raise_abuse_signal(
  p_profile_id uuid,
  p_session_id bigint,
  p_rule_code text,
  p_severity integer,
  p_evidence jsonb
)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  v_updated integer;
  v_severity smallint := p_severity::smallint;
begin
  update public.abuse_signals
  set
    occurrence_count = occurrence_count + 1,
    severity = v_severity,
    evidence = coalesce(p_evidence, '{}'::jsonb),
    last_seen_at = now(),
    reviewed_at = case when reviewed_at < now() - interval '7 days' then null else reviewed_at end
  where profile_id = p_profile_id
    and rule_code = p_rule_code
    and session_id is not distinct from p_session_id;

  get diagnostics v_updated = row_count;
  if v_updated > 0 then
    return;
  end if;

  insert into public.abuse_signals (profile_id, session_id, rule_code, severity, evidence)
  values (p_profile_id, p_session_id, p_rule_code, v_severity, coalesce(p_evidence, '{}'::jsonb));
exception
  when unique_violation then
    update public.abuse_signals
    set occurrence_count = occurrence_count + 1, last_seen_at = now()
    where profile_id = p_profile_id
      and rule_code = p_rule_code
      and session_id is not distinct from p_session_id;
end;
$$;

revoke all on function public.raise_abuse_signal(uuid, bigint, text, integer, jsonb)
  from public, anon, authenticated;

notify pgrst, 'reload schema';
