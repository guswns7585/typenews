begin;

create table if not exists public.profile_achievement_definitions (
  id text primary key,
  kind text not null check (kind in ('title', 'badge')),
  name_ko text not null,
  name_en text not null,
  description_ko text not null,
  description_en text not null,
  mark text not null default '',
  metric text not null check (metric in ('completed_count', 'total_score', 'active_days')),
  threshold bigint not null check (threshold > 0),
  sort_order integer not null default 0,
  enabled boolean not null default true,
  created_at timestamptz not null default now()
);

create table if not exists public.profile_achievements (
  profile_id uuid not null references public.profiles(id) on delete cascade,
  achievement_id text not null references public.profile_achievement_definitions(id) on delete cascade,
  unlocked_at timestamptz not null default now(),
  primary key (profile_id, achievement_id)
);

create table if not exists public.profile_decorations (
  profile_id uuid primary key references public.profiles(id) on delete cascade,
  equipped_title_id text references public.profile_achievement_definitions(id) on delete set null,
  equipped_badge_ids text[] not null default '{}'::text[],
  updated_at timestamptz not null default now(),
  constraint profile_decorations_badge_limit check (cardinality(equipped_badge_ids) <= 3)
);

alter table public.profile_achievement_definitions enable row level security;
alter table public.profile_achievements enable row level security;
alter table public.profile_decorations enable row level security;

drop policy if exists "achievement_definitions_read" on public.profile_achievement_definitions;
create policy "achievement_definitions_read"
on public.profile_achievement_definitions for select
to anon, authenticated
using (enabled);

drop policy if exists "profile_achievements_read_own" on public.profile_achievements;
create policy "profile_achievements_read_own"
on public.profile_achievements for select
to authenticated
using (profile_id = public.current_profile_id());

drop policy if exists "profile_decorations_read" on public.profile_decorations;
create policy "profile_decorations_read"
on public.profile_decorations for select
to anon, authenticated
using (true);

revoke all on public.profile_achievement_definitions, public.profile_achievements,
  public.profile_decorations from public, anon, authenticated;
grant select on public.profile_achievement_definitions to anon, authenticated;
grant select on public.profile_achievements to authenticated;
grant select on public.profile_decorations to anon, authenticated;

insert into public.profile_achievement_definitions (
  id, kind, name_ko, name_en, description_ko, description_en, mark, metric, threshold, sort_order
)
values
  ('title_first_line', 'title', '첫 줄을 넘긴', 'First Line', '첫 문장을 완주했습니다.', 'Completed the first prompt.', '', 'completed_count', 1, 10),
  ('badge_first_line', 'badge', '첫 문장', 'First Prompt', '첫 문장을 완주했습니다.', 'Completed the first prompt.', '첫', 'completed_count', 1, 20),
  ('title_regular', 'title', '단골 타자수', 'Regular Typist', '문장 100개를 완주했습니다.', 'Completed 100 prompts.', '', 'completed_count', 100, 30),
  ('badge_10k', 'badge', '일만 타', '10K Strokes', '누적 10,000타를 기록했습니다.', 'Recorded 10,000 strokes.', '1만', 'total_score', 10000, 40),
  ('title_desk_editor', 'title', '편집실 상주자', 'Desk Editor', '문장 1,000개를 완주했습니다.', 'Completed 1,000 prompts.', '', 'completed_count', 1000, 50),
  ('badge_100k', 'badge', '십만 타', '100K Strokes', '누적 100,000타를 기록했습니다.', 'Recorded 100,000 strokes.', '10만', 'total_score', 100000, 60),
  ('title_night_press', 'title', '윤전기를 돌리는', 'Press Operator', '누적 500,000타를 기록했습니다.', 'Recorded 500,000 strokes.', '', 'total_score', 500000, 70),
  ('badge_1m', 'badge', '백만 타', 'Million Strokes', '누적 1,000,000타를 기록했습니다.', 'Recorded 1,000,000 strokes.', '100만', 'total_score', 1000000, 80),
  ('title_everyday', 'title', '매일 원고를 넘기는', 'Daily Copy', '서로 다른 30일에 타이핑했습니다.', 'Typed on 30 different days.', '', 'active_days', 30, 90),
  ('badge_30days', 'badge', '30일 출석', '30 Active Days', '서로 다른 30일에 타이핑했습니다.', 'Typed on 30 different days.', '30일', 'active_days', 30, 100)
on conflict (id) do update set
  kind = excluded.kind,
  name_ko = excluded.name_ko,
  name_en = excluded.name_en,
  description_ko = excluded.description_ko,
  description_en = excluded.description_en,
  mark = excluded.mark,
  metric = excluded.metric,
  threshold = excluded.threshold,
  sort_order = excluded.sort_order,
  enabled = true;

create or replace function public.sync_my_profile_achievements()
returns integer
language plpgsql
security definer
set search_path = public
as $$
declare
  v_profile_id uuid := public.current_profile_id();
  v_completed bigint := 0;
  v_total_score bigint := 0;
  v_active_days bigint := 0;
  v_inserted integer := 0;
begin
  if v_profile_id is null then raise exception 'Not authenticated'; end if;

  select count(*), coalesce(sum(score), 0), count(distinct (created_at at time zone 'Asia/Seoul')::date)
  into v_completed, v_total_score, v_active_days
  from public.typing_results
  where profile_id = v_profile_id;

  insert into public.profile_achievements (profile_id, achievement_id)
  select v_profile_id, d.id
  from public.profile_achievement_definitions d
  where d.enabled
    and case d.metric
      when 'completed_count' then v_completed >= d.threshold
      when 'total_score' then v_total_score >= d.threshold
      when 'active_days' then v_active_days >= d.threshold
      else false
    end
  on conflict do nothing;

  get diagnostics v_inserted = row_count;
  return v_inserted;
end;
$$;

create or replace function public.get_my_profile_achievements()
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_profile_id uuid := public.current_profile_id();
  v_decorations public.profile_decorations;
begin
  if v_profile_id is null then raise exception 'Not authenticated'; end if;
  perform public.sync_my_profile_achievements();

  insert into public.profile_decorations (profile_id)
  values (v_profile_id)
  on conflict (profile_id) do nothing;

  select * into v_decorations
  from public.profile_decorations
  where profile_id = v_profile_id;

  return jsonb_build_object(
    'equippedTitleId', v_decorations.equipped_title_id,
    'equippedBadgeIds', v_decorations.equipped_badge_ids,
    'achievements', coalesce((
      select jsonb_agg(jsonb_build_object(
        'id', d.id,
        'kind', d.kind,
        'nameKo', d.name_ko,
        'nameEn', d.name_en,
        'descriptionKo', d.description_ko,
        'descriptionEn', d.description_en,
        'mark', d.mark,
        'unlockedAt', a.unlocked_at
      ) order by d.sort_order)
      from public.profile_achievements a
      join public.profile_achievement_definitions d on d.id = a.achievement_id and d.enabled
      where a.profile_id = v_profile_id
    ), '[]'::jsonb)
  );
end;
$$;

create or replace function public.update_my_profile_decorations(
  p_title_id text default null,
  p_badge_ids text[] default '{}'
)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  v_profile_id uuid := public.current_profile_id();
  v_badge_ids text[] := coalesce(p_badge_ids, '{}'::text[]);
begin
  if v_profile_id is null then raise exception 'Not authenticated'; end if;
  if cardinality(v_badge_ids) > 3 then raise exception 'Up to three badges can be equipped'; end if;
  if cardinality(v_badge_ids) <> cardinality(array(
    select distinct badge_id from unnest(v_badge_ids) badge_id
  )) then
    raise exception 'Duplicate badges are not allowed';
  end if;

  if p_title_id is not null and not exists (
    select 1
    from public.profile_achievements a
    join public.profile_achievement_definitions d on d.id = a.achievement_id
    where a.profile_id = v_profile_id and d.id = p_title_id and d.kind = 'title' and d.enabled
  ) then raise exception 'Title is not unlocked'; end if;

  if exists (
    select 1
    from unnest(v_badge_ids) badge_id
    where not exists (
      select 1
      from public.profile_achievements a
      join public.profile_achievement_definitions d on d.id = a.achievement_id
      where a.profile_id = v_profile_id and d.id = badge_id and d.kind = 'badge' and d.enabled
    )
  ) then raise exception 'Badge is not unlocked'; end if;

  insert into public.profile_decorations (profile_id, equipped_title_id, equipped_badge_ids)
  values (v_profile_id, p_title_id, v_badge_ids)
  on conflict (profile_id) do update
  set equipped_title_id = excluded.equipped_title_id,
      equipped_badge_ids = excluded.equipped_badge_ids,
      updated_at = now();
end;
$$;

create or replace function public.get_profile_decorations(p_profile_ids uuid[])
returns table (
  profile_id uuid,
  title_id text,
  title_ko text,
  title_en text,
  badges jsonb
)
language sql
stable
security definer
set search_path = public
as $$
  select
    p.id,
    title.id,
    title.name_ko,
    title.name_en,
    coalesce((
      select jsonb_agg(jsonb_build_object(
        'id', badge.id,
        'nameKo', badge.name_ko,
        'nameEn', badge.name_en,
        'mark', badge.mark
      ) order by badge_order.position)
      from unnest(coalesce(decor.equipped_badge_ids, '{}'::text[])) with ordinality badge_order(id, position)
      join public.profile_achievement_definitions badge
        on badge.id = badge_order.id and badge.kind = 'badge' and badge.enabled
    ), '[]'::jsonb)
  from public.profiles p
  left join public.profile_decorations decor on decor.profile_id = p.id
  left join public.profile_achievement_definitions title
    on title.id = decor.equipped_title_id and title.kind = 'title' and title.enabled
  where p.id = any(coalesce(p_profile_ids, '{}'::uuid[]))
$$;

revoke all on function public.sync_my_profile_achievements() from public, anon;
revoke all on function public.get_my_profile_achievements() from public, anon;
revoke all on function public.update_my_profile_decorations(text, text[]) from public, anon;
revoke all on function public.get_profile_decorations(uuid[]) from public;
grant execute on function public.sync_my_profile_achievements() to authenticated;
grant execute on function public.get_my_profile_achievements() to authenticated;
grant execute on function public.update_my_profile_decorations(text, text[]) to authenticated;
grant execute on function public.get_profile_decorations(uuid[]) to anon, authenticated;

notify pgrst, 'reload schema';

commit;
