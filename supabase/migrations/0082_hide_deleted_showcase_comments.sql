begin;

-- Deleted leaf comments should disappear. Keep only a deleted root comment
-- that still has a visible reply so the conversation does not lose context.
create or replace function public.get_showcase_comments(p_item_id uuid)
returns table (
  comment_id bigint,
  parent_id bigint,
  profile_id uuid,
  display_name text,
  profile_thumbnail_path text,
  profile_photo_updated_at timestamptz,
  body text,
  status text,
  is_mine boolean,
  is_admin boolean,
  report_count bigint,
  created_at timestamptz,
  updated_at timestamptz
)
language sql
stable
security definer
set search_path = public
as $$
  select
    c.id,
    c.parent_id,
    c.profile_id,
    coalesce(nullif(p.display_name, ''), '익명'),
    pp.thumbnail_path,
    pp.updated_at,
    case
      when c.status = 'active' then c.body
      when c.status = 'hidden' then '관리자에 의해 숨겨진 댓글입니다.'
      else '삭제된 댓글입니다.'
    end,
    c.status,
    c.profile_id = public.current_profile_id(),
    public.is_admin(),
    case when public.is_admin() then (
      select count(*) from public.keyboard_showcase_comment_reports r
      where r.comment_id = c.id and r.reviewed_at is null
    ) else 0 end,
    c.created_at,
    c.updated_at
  from public.keyboard_showcase_comments c
  join public.profiles p on p.id = c.profile_id
  left join public.public_profiles pp on pp.profile_id = c.profile_id
  where c.item_id = p_item_id
    and (
      c.status <> 'deleted'
      or exists (
        select 1
        from public.keyboard_showcase_comments child
        where child.parent_id = c.id
          and child.status <> 'deleted'
      )
    )
    and exists (
      select 1 from public.keyboard_showcase_items i
      where i.id = p_item_id
        and (i.status = 'published' or i.profile_id = public.current_profile_id() or public.is_admin())
    )
  order by coalesce(c.parent_id, c.id), (c.parent_id is not null), c.created_at, c.id
$$;

revoke all on function public.get_showcase_comments(uuid) from public;
grant execute on function public.get_showcase_comments(uuid) to anon, authenticated;

create or replace function public.admin_get_hidden_showcase_items(p_limit integer default 100)
returns table (
  item_id uuid,
  title text,
  display_name text,
  thumbnail_path text,
  updated_at timestamptz
)
language plpgsql
stable
security definer
set search_path = public
as $$
begin
  if not public.is_admin() then raise exception 'Admin only'; end if;
  return query
  select i.id, i.title, coalesce(nullif(p.display_name, ''), '익명'), i.thumbnail_path, i.updated_at
  from public.keyboard_showcase_items i
  join public.profiles p on p.id = i.profile_id
  where i.status = 'hidden'
  order by i.updated_at desc, i.id desc
  limit least(greatest(coalesce(p_limit, 100), 1), 200);
end;
$$;

revoke all on function public.admin_get_hidden_showcase_items(integer) from public, anon;
grant execute on function public.admin_get_hidden_showcase_items(integer) to authenticated;

notify pgrst, 'reload schema';

commit;
