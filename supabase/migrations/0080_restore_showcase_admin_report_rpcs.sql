begin;

-- Some projects applied the archive migration before the moderation RPCs were
-- added. Recreate them without changing report or archive data.
drop function if exists public.get_admin_showcase_reports(boolean, integer);

create function public.get_admin_showcase_reports(
  p_reviewed boolean default false,
  p_limit integer default 200
)
returns table (
  report_id bigint,
  item_id uuid,
  item_title text,
  image_path text,
  thumbnail_path text,
  item_status text,
  owner_name text,
  reporter_name text,
  reason text,
  details text,
  created_at timestamptz,
  reviewed_at timestamptz
)
language sql
stable
security definer
set search_path = public
as $$
  select
    r.id,
    i.id,
    i.title,
    i.image_path,
    i.thumbnail_path,
    i.status,
    coalesce(nullif(owner_profile.display_name, ''), '익명'),
    coalesce(nullif(reporter_profile.display_name, ''), '익명'),
    r.reason,
    r.details,
    r.created_at,
    r.reviewed_at
  from public.keyboard_showcase_reports r
  join public.keyboard_showcase_items i on i.id = r.item_id
  join public.profiles owner_profile on owner_profile.id = i.profile_id
  join public.profiles reporter_profile on reporter_profile.id = r.profile_id
  where public.is_admin()
    and ((p_reviewed and r.reviewed_at is not null) or (not p_reviewed and r.reviewed_at is null))
  order by r.created_at desc
  limit least(greatest(coalesce(p_limit, 200), 1), 500)
$$;

drop function if exists public.admin_review_showcase_report(bigint, text);

create function public.admin_review_showcase_report(
  p_report_id bigint,
  p_action text
)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  v_profile_id uuid := public.current_profile_id();
  v_item_id uuid;
  v_action text := lower(btrim(coalesce(p_action, '')));
begin
  if not public.is_admin() or v_profile_id is null then
    raise exception 'Admin only';
  end if;
  if v_action not in ('dismiss', 'hide', 'restore') then
    raise exception 'Invalid report action';
  end if;

  select r.item_id into v_item_id
  from public.keyboard_showcase_reports r
  where r.id = p_report_id;
  if not found then
    raise exception 'Showcase report not found';
  end if;

  if v_action = 'hide' then
    update public.keyboard_showcase_items
    set status = 'hidden'
    where id = v_item_id;
  elsif v_action = 'restore' then
    update public.keyboard_showcase_items
    set status = 'published',
        published_at = coalesce(published_at, now())
    where id = v_item_id
      and image_path is not null;
  end if;

  update public.keyboard_showcase_reports
  set reviewed_at = now(), reviewed_by = v_profile_id
  where id = p_report_id;
end;
$$;

revoke all on function public.get_admin_showcase_reports(boolean, integer) from public, anon;
revoke all on function public.admin_review_showcase_report(bigint, text) from public, anon;
grant execute on function public.get_admin_showcase_reports(boolean, integer) to authenticated;
grant execute on function public.admin_review_showcase_report(bigint, text) to authenticated;

notify pgrst, 'reload schema';

commit;
