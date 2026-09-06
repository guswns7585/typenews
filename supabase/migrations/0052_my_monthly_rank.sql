-- Return the signed-in user's rank even when they are outside the public top 50.
-- This is read-only and uses the exact ordering from get_monthly_ranking.

create or replace function public.get_my_monthly_rank(p_month_id text)
returns table (
  profile_id uuid,
  display_name text,
  score integer,
  rank integer,
  participant_count integer,
  photo_path text,
  thumbnail_path text,
  photo_updated_at timestamptz
)
language plpgsql
stable
security definer
set search_path = public
as $$
declare
  v_profile_id uuid := public.current_profile_id();
begin
  if v_profile_id is null then
    raise exception 'Not authenticated';
  end if;

  return query
  with ranked as (
    select
      ms.profile_id,
      coalesce(nullif(ms.nickname, ''), nullif(p.display_name, ''), '익명') as display_name,
      ms.score,
      row_number() over (
        order by ms.score desc, ms.updated_at desc, p.created_at asc
      )::integer as rank,
      count(*) over ()::integer as participant_count
    from public.monthly_stats ms
    join public.profiles p on p.id = ms.profile_id
    where ms.month_id = p_month_id
  )
  select
    p.id,
    coalesce(r.display_name, nullif(p.display_name, ''), '익명'),
    coalesce(r.score, 0),
    r.rank,
    coalesce(
      r.participant_count,
      (select count(*)::integer from public.monthly_stats ms where ms.month_id = p_month_id)
    ),
    pp.photo_path,
    pp.thumbnail_path,
    pp.updated_at
  from public.profiles p
  left join ranked r on r.profile_id = p.id
  left join public.public_profiles pp on pp.profile_id = p.id
  where p.id = v_profile_id;
end;
$$;

revoke all on function public.get_my_monthly_rank(text) from public, anon;
grant execute on function public.get_my_monthly_rank(text) to authenticated;

notify pgrst, 'reload schema';
