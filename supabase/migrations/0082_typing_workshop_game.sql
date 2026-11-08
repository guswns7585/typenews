begin;

create table if not exists public.typing_game_items (
  id text primary key,
  name_ko text not null,
  name_en text not null,
  description_ko text not null default '',
  description_en text not null default '',
  category text not null check (category in ('tool', 'companion', 'banner', 'archive_theme')),
  rarity text not null check (rarity in ('common', 'rare', 'epic', 'legendary')),
  draw_weight integer not null check (draw_weight > 0),
  active_bonus_bps integer not null default 0 check (active_bonus_bps between 0 and 2500),
  passive_ink_per_hour integer not null default 0 check (passive_ink_per_hour between 0 and 1000),
  cosmetic_data jsonb not null default '{}'::jsonb,
  enabled boolean not null default true,
  sort_order integer not null default 0,
  created_at timestamptz not null default now()
);

create table if not exists public.typing_game_wallets (
  profile_id uuid primary key references public.profiles(id) on delete cascade,
  ink bigint not null default 0 check (ink >= 0),
  lifetime_ink bigint not null default 0 check (lifetime_ink >= 0),
  ink_dust integer not null default 0 check (ink_dust between 0 and 999),
  pity_count integer not null default 0 check (pity_count between 0 and 19),
  passive_claimed_at timestamptz not null default now(),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.typing_game_inventory (
  profile_id uuid not null references public.profiles(id) on delete cascade,
  item_id text not null references public.typing_game_items(id) on delete restrict,
  quantity integer not null default 1 check (quantity between 1 and 9999),
  first_obtained_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  primary key (profile_id, item_id)
);

create table if not exists public.typing_game_draws (
  id uuid primary key default gen_random_uuid(),
  profile_id uuid not null references public.profiles(id) on delete cascade,
  item_id text not null references public.typing_game_items(id) on delete restrict,
  ink_cost integer not null check (ink_cost > 0),
  pity_before integer not null check (pity_before between 0 and 19),
  created_at timestamptz not null default now()
);

create index if not exists typing_game_draws_profile_created_idx
  on public.typing_game_draws(profile_id, created_at desc);

alter table public.typing_game_items enable row level security;
alter table public.typing_game_wallets enable row level security;
alter table public.typing_game_inventory enable row level security;
alter table public.typing_game_draws enable row level security;

drop policy if exists "typing_game_items_read" on public.typing_game_items;
create policy "typing_game_items_read"
on public.typing_game_items for select
to anon, authenticated
using (enabled);

drop policy if exists "typing_game_wallet_read_own" on public.typing_game_wallets;
create policy "typing_game_wallet_read_own"
on public.typing_game_wallets for select
to authenticated
using (profile_id = public.current_profile_id());

drop policy if exists "typing_game_inventory_read_own" on public.typing_game_inventory;
create policy "typing_game_inventory_read_own"
on public.typing_game_inventory for select
to authenticated
using (profile_id = public.current_profile_id());

drop policy if exists "typing_game_draws_read_own" on public.typing_game_draws;
create policy "typing_game_draws_read_own"
on public.typing_game_draws for select
to authenticated
using (profile_id = public.current_profile_id());

revoke all on public.typing_game_items, public.typing_game_wallets,
  public.typing_game_inventory, public.typing_game_draws from public, anon, authenticated;
grant select on public.typing_game_items to anon, authenticated;
grant select on public.typing_game_wallets, public.typing_game_inventory,
  public.typing_game_draws to authenticated;

insert into public.typing_game_items (
  id, name_ko, name_en, description_ko, description_en, category, rarity,
  draw_weight, active_bonus_bps, passive_ink_per_hour, sort_order
)
values
  ('pencil_stub', '몽당연필', 'Pencil Stub', '아직은 쓸 만하다.', 'Still has a few lines left.', 'tool', 'common', 2600, 50, 0, 10),
  ('ink_bottle', '작은 잉크병', 'Small Ink Bottle', '책상 한쪽을 지키는 기본 잉크병.', 'A small bottle for the corner of the desk.', 'tool', 'common', 2400, 0, 3, 20),
  ('paperweight', '유리 문진', 'Glass Paperweight', '날아가는 원고를 붙잡아 둔다.', 'Keeps loose drafts in place.', 'tool', 'common', 2100, 75, 0, 30),
  ('desk_snail', '원고 달팽이', 'Draft Snail', '느리지만 밤새 원고를 옮긴다.', 'Slowly carries drafts through the night.', 'companion', 'common', 1800, 0, 5, 40),
  ('brass_nib', '황동 펜촉', 'Brass Nib', '손에 익을수록 매끄럽다.', 'Gets smoother the longer it is used.', 'tool', 'rare', 720, 175, 0, 50),
  ('proofreader_cat', '교정 보는 고양이', 'Proofreader Cat', '오탈자를 발견하면 꼬리를 친다.', 'Flicks its tail whenever it spots a typo.', 'companion', 'rare', 620, 0, 12, 60),
  ('night_lamp', '심야 편집등', 'Night Editor Lamp', '늦은 시간에도 공방을 밝힌다.', 'Keeps the workshop lit after midnight.', 'tool', 'rare', 520, 100, 8, 70),
  ('blue_editor_banner', '푸른 편집실 명패', 'Blue Editor Banner', '이벤트 이름표에 쓸 수 있는 푸른 명패.', 'A blue nameplate for the event board.', 'banner', 'rare', 380, 0, 0, 80),
  ('clockwork_typewriter', '태엽 타자기', 'Clockwork Typewriter', '키가 혼자 움직이며 잉크를 만든다.', 'Its keys move on their own to make ink.', 'tool', 'epic', 190, 350, 20, 90),
  ('paper_bird', '원고지 새', 'Manuscript Bird', '완성된 문장을 물고 공방을 돈다.', 'Circles the workshop with a finished line.', 'companion', 'epic', 150, 150, 24, 100),
  ('archive_nocturne', '아카이브 녹턴', 'Archive Nocturne', '개인 아카이브에 적용할 수 있는 짙은 밤색 테마.', 'A deep night theme for a personal archive.', 'archive_theme', 'epic', 110, 0, 0, 110),
  ('golden_press', '황금 윤전기', 'Golden Press', '한밤중에도 쉬지 않고 돌아가는 작은 윤전기.', 'A tiny press that keeps turning all night.', 'tool', 'legendary', 25, 700, 60, 120)
on conflict (id) do update set
  name_ko = excluded.name_ko,
  name_en = excluded.name_en,
  description_ko = excluded.description_ko,
  description_en = excluded.description_en,
  category = excluded.category,
  rarity = excluded.rarity,
  draw_weight = excluded.draw_weight,
  active_bonus_bps = excluded.active_bonus_bps,
  passive_ink_per_hour = excluded.passive_ink_per_hour,
  sort_order = excluded.sort_order;

create or replace function public.award_typing_game_ink()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  v_bonus_bps integer := 0;
  v_dust bigint;
  v_total_dust bigint;
  v_earned bigint;
begin
  select coalesce(sum(i.quantity * item.active_bonus_bps), 0)
  into v_bonus_bps
  from public.typing_game_inventory i
  join public.typing_game_items item on item.id = i.item_id and item.enabled
  where i.profile_id = new.profile_id;

  v_bonus_bps := least(v_bonus_bps, 5000);
  v_dust := floor(new.score::numeric * 100 * (10000 + v_bonus_bps) / 10000)::bigint;

  insert into public.typing_game_wallets (profile_id)
  values (new.profile_id)
  on conflict (profile_id) do nothing;

  select ink_dust + v_dust
  into v_total_dust
  from public.typing_game_wallets
  where profile_id = new.profile_id
  for update;

  v_earned := v_total_dust / 1000;
  update public.typing_game_wallets
  set ink = ink + v_earned,
      lifetime_ink = lifetime_ink + v_earned,
      ink_dust = (v_total_dust % 1000)::integer,
      updated_at = now()
  where profile_id = new.profile_id;

  return new;
end;
$$;

drop trigger if exists typing_results_award_game_ink on public.typing_results;
create trigger typing_results_award_game_ink
after insert on public.typing_results
for each row execute function public.award_typing_game_ink();

create or replace function public.get_my_typing_game_state()
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_profile_id uuid := public.current_profile_id();
  v_wallet public.typing_game_wallets;
  v_passive_per_hour integer := 0;
  v_claimable bigint := 0;
begin
  if v_profile_id is null then raise exception 'Not authenticated'; end if;

  insert into public.typing_game_wallets (profile_id)
  values (v_profile_id)
  on conflict (profile_id) do nothing;

  select * into v_wallet
  from public.typing_game_wallets
  where profile_id = v_profile_id;

  select coalesce(sum(inv.quantity * item.passive_ink_per_hour), 0)
  into v_passive_per_hour
  from public.typing_game_inventory inv
  join public.typing_game_items item on item.id = inv.item_id and item.enabled
  where inv.profile_id = v_profile_id;

  v_passive_per_hour := least(v_passive_per_hour, 10000);
  v_claimable := floor(
    least(extract(epoch from (now() - v_wallet.passive_claimed_at)), 28800)
    * v_passive_per_hour / 3600
  );

  return jsonb_build_object(
    'wallet', jsonb_build_object(
      'ink', v_wallet.ink,
      'lifetimeInk', v_wallet.lifetime_ink,
      'pityCount', v_wallet.pity_count,
      'passivePerHour', v_passive_per_hour,
      'claimableInk', greatest(v_claimable, 0),
      'passiveClaimedAt', v_wallet.passive_claimed_at
    ),
    'inventory', coalesce((
      select jsonb_agg(jsonb_build_object(
        'id', item.id,
        'nameKo', item.name_ko,
        'nameEn', item.name_en,
        'descriptionKo', item.description_ko,
        'descriptionEn', item.description_en,
        'category', item.category,
        'rarity', item.rarity,
        'quantity', inv.quantity,
        'activeBonusBps', item.active_bonus_bps,
        'passiveInkPerHour', item.passive_ink_per_hour
      ) order by item.sort_order)
      from public.typing_game_inventory inv
      join public.typing_game_items item on item.id = inv.item_id
      where inv.profile_id = v_profile_id
    ), '[]'::jsonb),
    'catalog', coalesce((
      select jsonb_agg(jsonb_build_object(
        'id', id,
        'nameKo', name_ko,
        'nameEn', name_en,
        'descriptionKo', description_ko,
        'descriptionEn', description_en,
        'category', category,
        'rarity', rarity,
        'activeBonusBps', active_bonus_bps,
        'passiveInkPerHour', passive_ink_per_hour
      ) order by sort_order)
      from public.typing_game_items
      where enabled
    ), '[]'::jsonb)
  );
end;
$$;

create or replace function public.claim_typing_game_passive_ink()
returns bigint
language plpgsql
security definer
set search_path = public
as $$
declare
  v_profile_id uuid := public.current_profile_id();
  v_wallet public.typing_game_wallets;
  v_passive_per_hour integer := 0;
  v_claimable bigint := 0;
begin
  if v_profile_id is null then raise exception 'Not authenticated'; end if;

  insert into public.typing_game_wallets (profile_id)
  values (v_profile_id)
  on conflict (profile_id) do nothing;

  select * into v_wallet
  from public.typing_game_wallets
  where profile_id = v_profile_id
  for update;

  select coalesce(sum(inv.quantity * item.passive_ink_per_hour), 0)
  into v_passive_per_hour
  from public.typing_game_inventory inv
  join public.typing_game_items item on item.id = inv.item_id and item.enabled
  where inv.profile_id = v_profile_id;

  v_passive_per_hour := least(v_passive_per_hour, 10000);
  v_claimable := greatest(floor(
    least(extract(epoch from (now() - v_wallet.passive_claimed_at)), 28800)
    * v_passive_per_hour / 3600
  ), 0);

  update public.typing_game_wallets
  set ink = ink + v_claimable,
      lifetime_ink = lifetime_ink + v_claimable,
      passive_claimed_at = now(),
      updated_at = now()
  where profile_id = v_profile_id;

  return v_claimable;
end;
$$;

create or replace function public.draw_typing_game_items(p_count integer default 1)
returns table (
  draw_index integer,
  item_id text,
  name_ko text,
  name_en text,
  rarity text,
  quantity_owned integer
)
language plpgsql
security definer
set search_path = public
as $$
declare
  c_draw_cost constant integer := 600;
  v_profile_id uuid := public.current_profile_id();
  v_wallet public.typing_game_wallets;
  v_item public.typing_game_items;
  v_total_weight integer;
  v_roll numeric;
  v_pity_before integer;
  v_owned integer;
  v_index integer;
begin
  if v_profile_id is null then raise exception 'Not authenticated'; end if;
  if p_count not in (1, 10) then raise exception 'Draw count must be 1 or 10'; end if;

  insert into public.typing_game_wallets (profile_id)
  values (v_profile_id)
  on conflict (profile_id) do nothing;

  select * into v_wallet
  from public.typing_game_wallets
  where profile_id = v_profile_id
  for update;

  if v_wallet.ink < c_draw_cost * p_count then raise exception 'Not enough ink'; end if;
  update public.typing_game_wallets
  set ink = ink - c_draw_cost * p_count, updated_at = now()
  where profile_id = v_profile_id;

  for v_index in 1..p_count loop
    v_pity_before := v_wallet.pity_count;

    select sum(draw_weight) into v_total_weight
    from public.typing_game_items
    where enabled and (v_pity_before < 19 or rarity in ('rare', 'epic', 'legendary'));
    v_roll := random() * v_total_weight;

    select item.* into v_item
    from public.typing_game_items item
    where item.enabled
      and (v_pity_before < 19 or item.rarity in ('rare', 'epic', 'legendary'))
      and (
        select coalesce(sum(candidate.draw_weight), 0)
        from public.typing_game_items candidate
        where candidate.enabled
          and (v_pity_before < 19 or candidate.rarity in ('rare', 'epic', 'legendary'))
          and (candidate.sort_order < item.sort_order or (candidate.sort_order = item.sort_order and candidate.id <= item.id))
      ) > v_roll
    order by item.sort_order, item.id
    limit 1;

    if v_item.id is null then raise exception 'No game item available'; end if;

    insert into public.typing_game_inventory (profile_id, item_id, quantity)
    values (v_profile_id, v_item.id, 1)
    on conflict (profile_id, item_id) do update
    set quantity = public.typing_game_inventory.quantity + 1,
        updated_at = now()
    returning quantity into v_owned;

    insert into public.typing_game_draws (profile_id, item_id, ink_cost, pity_before)
    values (v_profile_id, v_item.id, c_draw_cost, v_pity_before);

    if v_item.rarity in ('rare', 'epic', 'legendary') then
      v_wallet.pity_count := 0;
    else
      v_wallet.pity_count := least(v_wallet.pity_count + 1, 19);
    end if;

    draw_index := v_index;
    item_id := v_item.id;
    name_ko := v_item.name_ko;
    name_en := v_item.name_en;
    rarity := v_item.rarity;
    quantity_owned := v_owned;
    return next;
  end loop;

  update public.typing_game_wallets
  set pity_count = v_wallet.pity_count, updated_at = now()
  where profile_id = v_profile_id;
end;
$$;

revoke all on function public.award_typing_game_ink() from public, anon, authenticated;
revoke all on function public.get_my_typing_game_state() from public, anon;
revoke all on function public.claim_typing_game_passive_ink() from public, anon;
revoke all on function public.draw_typing_game_items(integer) from public, anon;
grant execute on function public.get_my_typing_game_state() to authenticated;
grant execute on function public.claim_typing_game_passive_ink() to authenticated;
grant execute on function public.draw_typing_game_items(integer) to authenticated;

notify pgrst, 'reload schema';

commit;
