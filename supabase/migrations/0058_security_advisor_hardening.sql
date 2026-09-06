-- Security Advisor hardening.
--
-- PostgreSQL grants EXECUTE on new functions to PUBLIC by default. Several
-- migrations granted EXECUTE to authenticated users without first revoking the
-- default PUBLIC privilege, so anon could still call private SECURITY DEFINER
-- RPCs. Keep the intentionally public ranking RPC open and tighten the rest.

alter function public.touch_updated_at() set search_path = public;
alter function public.keystrokes_for_char(text) set search_path = public;
alter function public.sentence_score(text, boolean, boolean, boolean, boolean) set search_path = public;
alter function public.sentence_scores(boolean, boolean, boolean, boolean) set search_path = public;

revoke all on function public.current_profile_id() from public, anon;
revoke all on function public.get_abuse_watchlist(integer, integer) from public, anon;
revoke all on function public.get_admin_typing_analytics(integer) from public, anon;
revoke all on function public.get_admin_typing_mode_analytics(integer) from public, anon;
revoke all on function public.get_daily_typing_summary(integer) from public, anon;
revoke all on function public.get_my_typing_summary(text) from public, anon;
revoke all on function public.get_my_typing_weaknesses(integer) from public, anon;
revoke all on function public.get_score_verification_summary(integer) from public, anon;
revoke all on function public.get_sentence_requests(text, integer) from public, anon;
revoke all on function public.is_admin() from public, anon;
revoke all on function public.link_current_google_identity() from public, anon;
revoke all on function public.report_typing_session(uuid, timestamptz, jsonb) from public, anon;
revoke all on function public.review_abuse_signals(uuid, text) from public, anon;
revoke all on function public.review_sentence_request(bigint, boolean, text, text, boolean) from public, anon;
revoke all on function public.submit_sentence_request(text, text, text) from public, anon;
revoke all on function public.update_my_display_name(text) from public, anon;

grant execute on function public.current_profile_id() to authenticated;
grant execute on function public.get_abuse_watchlist(integer, integer) to authenticated;
grant execute on function public.get_admin_typing_analytics(integer) to authenticated;
grant execute on function public.get_admin_typing_mode_analytics(integer) to authenticated;
grant execute on function public.get_daily_typing_summary(integer) to authenticated;
grant execute on function public.get_my_typing_summary(text) to authenticated;
grant execute on function public.get_my_typing_weaknesses(integer) to authenticated;
grant execute on function public.get_score_verification_summary(integer) to authenticated;
grant execute on function public.get_sentence_requests(text, integer) to authenticated;
grant execute on function public.is_admin() to authenticated;
grant execute on function public.link_current_google_identity() to authenticated;
grant execute on function public.report_typing_session(uuid, timestamptz, jsonb) to authenticated;
grant execute on function public.review_abuse_signals(uuid, text) to authenticated;
grant execute on function public.review_sentence_request(bigint, boolean, text, text, boolean) to authenticated;
grant execute on function public.submit_sentence_request(text, text, text) to authenticated;
grant execute on function public.update_my_display_name(text) to authenticated;

notify pgrst, 'reload schema';
