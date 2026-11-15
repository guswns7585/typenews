begin;

alter table public.feedback_submissions
  add column if not exists public_reply text not null default '';

alter table public.feedback_submissions
  drop constraint if exists feedback_submissions_public_reply_length;
alter table public.feedback_submissions
  add constraint feedback_submissions_public_reply_length
  check (char_length(public_reply) <= 3000);

drop function if exists public.get_admin_feedback(text, integer);
create function public.get_admin_feedback(
  p_status text default null,
  p_limit integer default 200
)
returns table (
  feedback_id bigint,
  profile_id uuid,
  display_name text,
  account_email text,
  category text,
  title text,
  body text,
  page_path text,
  user_agent text,
  contact_email text,
  status text,
  admin_reply text,
  public_reply text,
  created_at timestamptz,
  updated_at timestamptz
)
language plpgsql
stable
security definer
set search_path = public
as $$
begin
  if not public.is_admin() then raise exception 'Admin only'; end if;
  if p_status is not null and p_status not in ('received', 'reviewing', 'planned', 'completed', 'declined') then
    raise exception 'Invalid feedback status';
  end if;

  return query
  select
    f.id,
    f.profile_id,
    coalesce(nullif(p.display_name, ''), '비로그인'),
    p.email::text,
    f.category,
    f.title,
    f.body,
    f.page_path,
    f.user_agent,
    f.contact_email::text,
    f.status,
    f.admin_reply,
    f.public_reply,
    f.created_at,
    f.updated_at
  from public.feedback_submissions f
  left join public.profiles p on p.id = f.profile_id
  where p_status is null or f.status = p_status
  order by
    case f.status when 'received' then 0 when 'reviewing' then 1 when 'planned' then 2 else 3 end,
    f.created_at desc,
    f.id desc
  limit least(greatest(coalesce(p_limit, 200), 1), 500);
end;
$$;

create or replace function public.admin_update_feedback(
  p_feedback_id bigint,
  p_status text,
  p_admin_reply text,
  p_public_reply text
)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  v_admin_reply text := btrim(coalesce(p_admin_reply, ''));
  v_public_reply text := btrim(coalesce(p_public_reply, ''));
begin
  if not public.is_admin() then raise exception 'Admin only'; end if;
  if p_status not in ('received', 'reviewing', 'planned', 'completed', 'declined') then
    raise exception 'Invalid feedback status';
  end if;
  if char_length(v_admin_reply) > 3000 or char_length(v_public_reply) > 3000 then
    raise exception '메모와 답변은 3,000자 이하여야 합니다';
  end if;

  update public.feedback_submissions
  set status = p_status,
      admin_reply = v_admin_reply,
      public_reply = v_public_reply,
      reviewed_by = public.current_profile_id(),
      reviewed_at = now()
  where id = p_feedback_id;
  if not found then raise exception 'Feedback not found'; end if;
end;
$$;

create or replace function public.get_my_feedback(p_limit integer default 100)
returns table (
  feedback_id bigint,
  category text,
  title text,
  body text,
  status text,
  public_reply text,
  created_at timestamptz,
  updated_at timestamptz
)
language plpgsql
stable
security definer
set search_path = public
as $$
declare
  v_profile_id uuid := public.current_profile_id();
begin
  if auth.uid() is null or v_profile_id is null then return; end if;

  return query
  select f.id, f.category, f.title, f.body, f.status, f.public_reply, f.created_at, f.updated_at
  from public.feedback_submissions f
  where f.profile_id = v_profile_id
  order by f.created_at desc, f.id desc
  limit least(greatest(coalesce(p_limit, 100), 1), 200);
end;
$$;

revoke all on function public.get_admin_feedback(text, integer) from public, anon;
revoke all on function public.admin_update_feedback(bigint, text, text, text) from public, anon;
revoke all on function public.get_my_feedback(integer) from public, anon;
grant execute on function public.get_admin_feedback(text, integer) to authenticated;
grant execute on function public.admin_update_feedback(bigint, text, text, text) to authenticated;
grant execute on function public.get_my_feedback(integer) to authenticated;

notify pgrst, 'reload schema';

commit;
