-- 개인 타이핑 통계를 연습 목적별로 분리한다.
-- 랭킹·이벤트 점수와 관리자 이용분석은 기존 집계를 계속 사용한다.

begin;

create table if not exists public.typing_practice_profiles (
  id uuid primary key default gen_random_uuid(),
  owner_profile_id uuid not null references public.profiles(id) on delete cascade,
  name text not null check (char_length(btrim(name)) between 1 and 20),
  generation integer not null default 1 check (generation between 1 and 1000000),
  is_default boolean not null default false,
  archived boolean not null default false,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create unique index if not exists typing_practice_profiles_default_idx
  on public.typing_practice_profiles (owner_profile_id) where is_default;
create unique index if not exists typing_practice_profiles_name_idx
  on public.typing_practice_profiles (owner_profile_id, lower(btrim(name))) where not archived;

insert into public.typing_practice_profiles (owner_profile_id, name, is_default)
select p.id, '기본', true from public.profiles p
where not exists (
  select 1 from public.typing_practice_profiles t where t.owner_profile_id = p.id and t.is_default
);

create table if not exists public.typing_practice_metric_sessions (
  owner_profile_id uuid not null references public.profiles(id) on delete cascade,
  practice_profile_id uuid not null references public.typing_practice_profiles(id) on delete cascade,
  generation integer not null,
  session_key uuid not null,
  day date not null,
  mode text not null check (mode in ('short', 'long', 'word', 'news')),
  language text not null check (language in ('kor', 'eng')),
  category text not null default '',
  device_class text not null check (device_class in ('desktop', 'tablet', 'mobile')),
  activity_hour smallint not null check (activity_hour between 0 and 23),
  starts integer not null default 0,
  completions integer not null default 0,
  passed integer not null default 0,
  typed_chars bigint not null default 0,
  active_ms bigint not null default 0,
  cpm_sum bigint not null default 0,
  accuracy_sum bigint not null default 0,
  backspaces integer not null default 0,
  mistakes integer not null default 0,
  long_pauses integer not null default 0,
  news_completed integer not null default 0,
  updated_at timestamptz not null default now(),
  primary key (owner_profile_id, practice_profile_id, generation, session_key, day, mode, language, category, device_class, activity_hour)
);

create table if not exists public.user_practice_daily_metrics (
  owner_profile_id uuid not null references public.profiles(id) on delete cascade,
  practice_profile_id uuid not null references public.typing_practice_profiles(id) on delete cascade,
  generation integer not null,
  day date not null,
  mode text not null check (mode in ('short', 'long', 'word', 'news')),
  language text not null check (language in ('kor', 'eng')),
  category text not null default '',
  starts bigint not null default 0,
  completions bigint not null default 0,
  passed bigint not null default 0,
  typed_chars bigint not null default 0,
  active_ms bigint not null default 0,
  cpm_sum bigint not null default 0,
  accuracy_sum bigint not null default 0,
  backspaces bigint not null default 0,
  mistakes bigint not null default 0,
  long_pauses bigint not null default 0,
  news_completed bigint not null default 0,
  updated_at timestamptz not null default now(),
  primary key (owner_profile_id, practice_profile_id, generation, day, mode, language, category)
);
create index if not exists user_practice_daily_metrics_lookup_idx
  on public.user_practice_daily_metrics (owner_profile_id, practice_profile_id, generation, day desc);

create table if not exists public.user_practice_legacy_daily (
  owner_profile_id uuid not null references public.profiles(id) on delete cascade,
  practice_profile_id uuid not null references public.typing_practice_profiles(id) on delete cascade,
  generation integer not null default 1,
  day date not null,
  starts bigint not null default 0,
  completions bigint not null default 0,
  passed bigint not null default 0,
  typed_chars bigint not null default 0,
  active_ms bigint not null default 0,
  cpm_sum bigint not null default 0,
  accuracy_sum bigint not null default 0,
  backspaces bigint not null default 0,
  mistakes bigint not null default 0,
  long_pauses bigint not null default 0,
  news_completed bigint not null default 0,
  mode_breakdown jsonb not null default '{}'::jsonb,
  primary key (owner_profile_id, practice_profile_id, generation, day)
);

insert into public.user_practice_legacy_daily (
  owner_profile_id, practice_profile_id, generation, day, starts, completions, passed,
  typed_chars, active_ms, cpm_sum, accuracy_sum, backspaces, mistakes, long_pauses,
  news_completed, mode_breakdown
)
select d.profile_id, p.id, 1, d.day, d.starts, d.completions, d.passed,
  d.typed_chars, d.active_ms, d.cpm_sum, d.accuracy_sum, d.backspaces, d.mistakes,
  d.long_pauses, d.news_completed, d.mode_breakdown
from public.user_daily_typing_analytics d
join public.typing_practice_profiles p on p.owner_profile_id = d.profile_id and p.is_default
where d.day < (now() at time zone 'Asia/Seoul')::date
on conflict do nothing;

create table if not exists public.typing_practice_weakness_sessions (
  owner_profile_id uuid not null references public.profiles(id) on delete cascade,
  practice_profile_id uuid not null references public.typing_practice_profiles(id) on delete cascade,
  generation integer not null,
  session_key uuid not null,
  day date not null,
  sentence_id bigint not null references public.sentences(id) on delete cascade,
  char_index integer not null check (char_index between 0 and 4000),
  mistake_count integer not null default 0,
  correction_count integer not null default 0,
  updated_at timestamptz not null default now(),
  primary key (owner_profile_id, practice_profile_id, generation, session_key, day, sentence_id, char_index)
);

create table if not exists public.user_practice_weaknesses (
  owner_profile_id uuid not null references public.profiles(id) on delete cascade,
  practice_profile_id uuid not null references public.typing_practice_profiles(id) on delete cascade,
  generation integer not null,
  sentence_id bigint not null references public.sentences(id) on delete cascade,
  char_index integer not null check (char_index between 0 and 4000),
  mistake_count bigint not null default 0,
  correction_count bigint not null default 0,
  last_seen_at timestamptz not null default now(),
  primary key (owner_profile_id, practice_profile_id, generation, sentence_id, char_index)
);
create index if not exists user_practice_weaknesses_rank_idx
  on public.user_practice_weaknesses (owner_profile_id, practice_profile_id, generation, mistake_count desc, last_seen_at desc);

insert into public.user_practice_weaknesses (
  owner_profile_id, practice_profile_id, generation, sentence_id, char_index,
  mistake_count, correction_count, last_seen_at
)
select w.profile_id, p.id, 1, w.sentence_id, w.char_index,
  w.mistake_count, w.correction_count, w.last_seen_at
from public.user_typing_weaknesses w
join public.typing_practice_profiles p on p.owner_profile_id = w.profile_id and p.is_default
on conflict do nothing;

create table if not exists public.typing_practice_key_sessions (
  owner_profile_id uuid not null references public.profiles(id) on delete cascade,
  practice_profile_id uuid not null references public.typing_practice_profiles(id) on delete cascade,
  generation integer not null,
  session_key uuid not null,
  day date not null,
  key_counts jsonb not null default '{}'::jsonb,
  updated_at timestamptz not null default now(),
  primary key (owner_profile_id, practice_profile_id, generation, session_key, day)
);

create table if not exists public.user_practice_daily_key_usage (
  owner_profile_id uuid not null references public.profiles(id) on delete cascade,
  practice_profile_id uuid not null references public.typing_practice_profiles(id) on delete cascade,
  generation integer not null,
  day date not null,
  key_counts jsonb not null default '{}'::jsonb,
  updated_at timestamptz not null default now(),
  primary key (owner_profile_id, practice_profile_id, generation, day)
);
create index if not exists user_practice_daily_key_usage_lookup_idx
  on public.user_practice_daily_key_usage (owner_profile_id, practice_profile_id, generation, day desc);

create table if not exists public.user_practice_legacy_key_totals (
  owner_profile_id uuid not null references public.profiles(id) on delete cascade,
  practice_profile_id uuid not null references public.typing_practice_profiles(id) on delete cascade,
  generation integer not null default 1,
  baseline_day date not null default (now() at time zone 'Asia/Seoul')::date,
  key_counts jsonb not null default '{}'::jsonb,
  primary key (owner_profile_id, practice_profile_id, generation)
);

insert into public.user_practice_daily_key_usage (
  owner_profile_id, practice_profile_id, generation, day, key_counts
)
select k.profile_id, p.id, 1, k.day, k.key_counts
from public.user_daily_key_usage k
join public.typing_practice_profiles p on p.owner_profile_id = k.profile_id and p.is_default
where k.day < (now() at time zone 'Asia/Seoul')::date
on conflict do nothing;

insert into public.user_practice_legacy_key_totals (
  owner_profile_id, practice_profile_id, generation, key_counts
)
select k.profile_id, p.id, 1, k.key_counts
from public.user_key_usage_totals k
join public.typing_practice_profiles p on p.owner_profile_id = k.profile_id and p.is_default
on conflict do nothing;

create or replace function public.ensure_my_typing_practice_profile()
returns uuid
language plpgsql
security definer
set search_path = public
as $$
declare
  v_owner uuid := public.current_profile_id();
  v_id uuid;
begin
  if auth.uid() is null or v_owner is null then return null; end if;
  select id into v_id from public.typing_practice_profiles
  where owner_profile_id = v_owner and is_default limit 1;
  if v_id is null then
    insert into public.typing_practice_profiles (owner_profile_id, name, is_default)
    values (v_owner, '기본', true) returning id into v_id;
  end if;
  return v_id;
end;
$$;

create or replace function public.get_my_typing_practice_profiles()
returns table (id uuid, name text, generation integer, is_default boolean, archived boolean)
language plpgsql
security definer
set search_path = public
as $$
declare v_owner uuid := public.current_profile_id();
begin
  if auth.uid() is null or v_owner is null then return; end if;
  perform public.ensure_my_typing_practice_profile();
  return query select p.id, p.name, p.generation, p.is_default, p.archived
  from public.typing_practice_profiles p
  where p.owner_profile_id = v_owner
  order by p.archived, p.is_default desc, p.created_at;
end;
$$;

create or replace function public.create_my_typing_practice_profile(p_name text)
returns uuid
language plpgsql
security definer
set search_path = public
as $$
declare v_owner uuid := public.current_profile_id(); v_id uuid; v_name text := btrim(coalesce(p_name, ''));
begin
  if auth.uid() is null or v_owner is null then raise exception 'authentication required'; end if;
  if char_length(v_name) not between 1 and 20 then raise exception 'invalid profile name'; end if;
  if (select count(*) from public.typing_practice_profiles where owner_profile_id = v_owner and not archived) >= 5 then
    raise exception 'practice profile limit reached';
  end if;
  insert into public.typing_practice_profiles (owner_profile_id, name)
  values (v_owner, v_name) returning id into v_id;
  return v_id;
end;
$$;

create or replace function public.rename_my_typing_practice_profile(p_profile_id uuid, p_name text)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare v_owner uuid := public.current_profile_id(); v_name text := btrim(coalesce(p_name, ''));
begin
  if auth.uid() is null or v_owner is null then raise exception 'authentication required'; end if;
  if char_length(v_name) not between 1 and 20 then raise exception 'invalid profile name'; end if;
  update public.typing_practice_profiles set name = v_name, updated_at = now()
  where id = p_profile_id and owner_profile_id = v_owner and not archived;
  if not found then raise exception 'practice profile not found'; end if;
end;
$$;

create or replace function public.reset_my_typing_practice_profile(p_profile_id uuid)
returns integer
language plpgsql
security definer
set search_path = public
as $$
declare v_owner uuid := public.current_profile_id(); v_generation integer;
begin
  if auth.uid() is null or v_owner is null then raise exception 'authentication required'; end if;
  update public.typing_practice_profiles
  set generation = generation + 1, updated_at = now()
  where id = p_profile_id and owner_profile_id = v_owner and not archived
  returning generation into v_generation;
  if v_generation is null then raise exception 'practice profile not found'; end if;
  return v_generation;
end;
$$;

create or replace function public.archive_my_typing_practice_profile(p_profile_id uuid)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare v_owner uuid := public.current_profile_id();
begin
  if auth.uid() is null or v_owner is null then raise exception 'authentication required'; end if;
  update public.typing_practice_profiles set archived = true, updated_at = now()
  where id = p_profile_id and owner_profile_id = v_owner and not is_default and not archived;
  if not found then raise exception '기본 프로필은 보관할 수 없습니다.'; end if;
end;
$$;

create or replace function public.restore_my_typing_practice_profile(p_profile_id uuid)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare v_owner uuid := public.current_profile_id();
begin
  if auth.uid() is null or v_owner is null then raise exception 'authentication required'; end if;
  if (select count(*) from public.typing_practice_profiles where owner_profile_id = v_owner and not archived) >= 5 then
    raise exception 'practice profile limit reached';
  end if;
  update public.typing_practice_profiles set archived = false, updated_at = now()
  where id = p_profile_id and owner_profile_id = v_owner and archived;
  if not found then raise exception 'practice profile not found'; end if;
end;
$$;

create or replace function public.report_typing_analytics_v3(
  p_session_key uuid,
  p_practice_profile_id uuid,
  p_practice_generation integer,
  p_buckets jsonb default '[]'::jsonb,
  p_weaknesses jsonb default '[]'::jsonb,
  p_key_usage jsonb default '[]'::jsonb
)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  v_owner uuid := public.current_profile_id();
  v_today date := (now() at time zone 'Asia/Seoul')::date;
  v_item jsonb; v_day date; v_mode text; v_language text; v_category text; v_device text; v_hour integer;
  v_starts bigint; v_completions bigint; v_passed bigint; v_typed bigint; v_active bigint;
  v_cpm bigint; v_accuracy bigint; v_backspaces bigint; v_mistakes bigint; v_pauses bigint; v_news bigint;
  v_prev public.typing_practice_metric_sessions%rowtype;
  v_sentence_id bigint; v_char_index integer; v_mistake_count integer; v_correction_count integer;
  v_weak_prev public.typing_practice_weakness_sessions%rowtype;
  v_counts jsonb; v_previous_counts jsonb; v_delta_counts jsonb;
begin
  perform public.report_typing_analytics_v2(p_session_key, p_buckets, p_weaknesses, p_key_usage);
  if auth.uid() is null or v_owner is null then raise exception 'authentication required'; end if;
  if not exists (
    select 1 from public.typing_practice_profiles p
    where p.id = p_practice_profile_id and p.owner_profile_id = v_owner
      and p.generation = p_practice_generation and not p.archived
  ) then raise exception 'invalid practice profile'; end if;

  for v_item in select value from jsonb_array_elements(coalesce(p_buckets, '[]'::jsonb)) loop
    v_day := coalesce((v_item ->> 'day')::date, v_today);
    v_mode := v_item ->> 'mode'; v_language := v_item ->> 'language';
    v_category := left(regexp_replace(coalesce(v_item ->> 'category', ''), '[^a-z+_-]', '', 'g'), 40);
    v_device := v_item ->> 'deviceClass'; v_hour := least(greatest(coalesce((v_item ->> 'hour')::integer, 0), 0), 23);
    if v_day not between v_today - 1 and v_today or v_mode not in ('short','long','word','news')
      or v_language not in ('kor','eng') or v_device not in ('desktop','tablet','mobile') then continue; end if;
    v_starts := least(greatest(coalesce((v_item ->> 'starts')::bigint,0),0),10000);
    v_completions := least(greatest(coalesce((v_item ->> 'completions')::bigint,0),0),10000);
    v_passed := least(greatest(coalesce((v_item ->> 'passed')::bigint,0),0),10000);
    v_typed := least(greatest(coalesce((v_item ->> 'typedChars')::bigint,0),0),10000000);
    v_active := least(greatest(coalesce((v_item ->> 'activeMs')::bigint,0),0),86400000);
    v_cpm := least(greatest(coalesce((v_item ->> 'cpmSum')::bigint,0),0),10000000);
    v_accuracy := least(greatest(coalesce((v_item ->> 'accuracySum')::bigint,0),0),1000000);
    v_backspaces := least(greatest(coalesce((v_item ->> 'backspaces')::bigint,0),0),1000000);
    v_mistakes := least(greatest(coalesce((v_item ->> 'mistakes')::bigint,0),0),1000000);
    v_pauses := least(greatest(coalesce((v_item ->> 'longPauses')::bigint,0),0),100000);
    v_news := least(greatest(coalesce((v_item ->> 'newsCompleted')::bigint,0),0),10000);

    insert into public.typing_practice_metric_sessions (
      owner_profile_id, practice_profile_id, generation, session_key, day, mode, language, category, device_class, activity_hour
    ) values (v_owner, p_practice_profile_id, p_practice_generation, p_session_key, v_day, v_mode, v_language, v_category, v_device, v_hour)
    on conflict do nothing;
    select * into v_prev from public.typing_practice_metric_sessions
    where owner_profile_id=v_owner and practice_profile_id=p_practice_profile_id and generation=p_practice_generation
      and session_key=p_session_key and day=v_day and mode=v_mode and language=v_language and category=v_category
      and device_class=v_device and activity_hour=v_hour for update;

    insert into public.user_practice_daily_metrics as d (
      owner_profile_id, practice_profile_id, generation, day, mode, language, category,
      starts, completions, passed, typed_chars, active_ms, cpm_sum, accuracy_sum,
      backspaces, mistakes, long_pauses, news_completed
    ) values (
      v_owner, p_practice_profile_id, p_practice_generation, v_day, v_mode, v_language, v_category,
      greatest(v_starts-v_prev.starts,0), greatest(v_completions-v_prev.completions,0),
      greatest(v_passed-v_prev.passed,0), greatest(v_typed-v_prev.typed_chars,0),
      greatest(v_active-v_prev.active_ms,0), greatest(v_cpm-v_prev.cpm_sum,0),
      greatest(v_accuracy-v_prev.accuracy_sum,0), greatest(v_backspaces-v_prev.backspaces,0),
      greatest(v_mistakes-v_prev.mistakes,0), greatest(v_pauses-v_prev.long_pauses,0),
      greatest(v_news-v_prev.news_completed,0)
    ) on conflict (owner_profile_id, practice_profile_id, generation, day, mode, language, category)
    do update set starts=d.starts+excluded.starts, completions=d.completions+excluded.completions,
      passed=d.passed+excluded.passed, typed_chars=d.typed_chars+excluded.typed_chars,
      active_ms=d.active_ms+excluded.active_ms, cpm_sum=d.cpm_sum+excluded.cpm_sum,
      accuracy_sum=d.accuracy_sum+excluded.accuracy_sum, backspaces=d.backspaces+excluded.backspaces,
      mistakes=d.mistakes+excluded.mistakes, long_pauses=d.long_pauses+excluded.long_pauses,
      news_completed=d.news_completed+excluded.news_completed, updated_at=now();
    update public.typing_practice_metric_sessions set starts=greatest(starts,v_starts), completions=greatest(completions,v_completions),
      passed=greatest(passed,v_passed), typed_chars=greatest(typed_chars,v_typed), active_ms=greatest(active_ms,v_active),
      cpm_sum=greatest(cpm_sum,v_cpm), accuracy_sum=greatest(accuracy_sum,v_accuracy), backspaces=greatest(backspaces,v_backspaces),
      mistakes=greatest(mistakes,v_mistakes), long_pauses=greatest(long_pauses,v_pauses), news_completed=greatest(news_completed,v_news), updated_at=now()
    where owner_profile_id=v_owner and practice_profile_id=p_practice_profile_id and generation=p_practice_generation
      and session_key=p_session_key and day=v_day and mode=v_mode and language=v_language and category=v_category
      and device_class=v_device and activity_hour=v_hour;
  end loop;

  for v_item in select value from jsonb_array_elements(coalesce(p_weaknesses,'[]'::jsonb)) loop
    v_day := coalesce((v_item ->> 'day')::date,v_today); v_sentence_id := (v_item ->> 'sentenceId')::bigint;
    v_char_index := (v_item ->> 'charIndex')::integer;
    if v_day not between v_today-1 and v_today or v_sentence_id is null or v_char_index not between 0 and 4000 then continue; end if;
    v_mistake_count := least(greatest(coalesce((v_item ->> 'mistakeCount')::integer,0),0),10000);
    v_correction_count := least(greatest(coalesce((v_item ->> 'correctionCount')::integer,0),0),10000);
    insert into public.typing_practice_weakness_sessions (owner_profile_id,practice_profile_id,generation,session_key,day,sentence_id,char_index)
    values (v_owner,p_practice_profile_id,p_practice_generation,p_session_key,v_day,v_sentence_id,v_char_index) on conflict do nothing;
    select * into v_weak_prev from public.typing_practice_weakness_sessions
    where owner_profile_id=v_owner and practice_profile_id=p_practice_profile_id and generation=p_practice_generation
      and session_key=p_session_key and day=v_day and sentence_id=v_sentence_id and char_index=v_char_index for update;
    insert into public.user_practice_weaknesses as w (owner_profile_id,practice_profile_id,generation,sentence_id,char_index,mistake_count,correction_count,last_seen_at)
    values (v_owner,p_practice_profile_id,p_practice_generation,v_sentence_id,v_char_index,
      greatest(v_mistake_count-v_weak_prev.mistake_count,0), greatest(v_correction_count-v_weak_prev.correction_count,0),now())
    on conflict (owner_profile_id,practice_profile_id,generation,sentence_id,char_index) do update
      set mistake_count=w.mistake_count+excluded.mistake_count, correction_count=w.correction_count+excluded.correction_count, last_seen_at=now();
    update public.typing_practice_weakness_sessions set mistake_count=greatest(mistake_count,v_mistake_count),
      correction_count=greatest(correction_count,v_correction_count),updated_at=now()
    where owner_profile_id=v_owner and practice_profile_id=p_practice_profile_id and generation=p_practice_generation
      and session_key=p_session_key and day=v_day and sentence_id=v_sentence_id and char_index=v_char_index;
  end loop;

  for v_item in select value from jsonb_array_elements(coalesce(p_key_usage,'[]'::jsonb)) loop
    v_day := (v_item ->> 'day')::date; v_counts := coalesce(v_item -> 'counts','{}'::jsonb);
    if v_day not between v_today-2 and v_today+1 or jsonb_typeof(v_counts)<>'object' then continue; end if;
    insert into public.typing_practice_key_sessions (owner_profile_id,practice_profile_id,generation,session_key,day)
    values (v_owner,p_practice_profile_id,p_practice_generation,p_session_key,v_day) on conflict do nothing;
    select key_counts into v_previous_counts from public.typing_practice_key_sessions
    where owner_profile_id=v_owner and practice_profile_id=p_practice_profile_id and generation=p_practice_generation
      and session_key=p_session_key and day=v_day for update;
    select coalesce(jsonb_object_agg(key_code,to_jsonb(key_delta)),'{}'::jsonb) into v_delta_counts
    from (select e.key key_code,greatest((e.value#>>'{}')::bigint-coalesce((v_previous_counts->>e.key)::bigint,0),0) key_delta
      from jsonb_each(v_counts)e) x where key_delta>0;
    update public.typing_practice_key_sessions set key_counts=v_counts,updated_at=now()
    where owner_profile_id=v_owner and practice_profile_id=p_practice_profile_id and generation=p_practice_generation
      and session_key=p_session_key and day=v_day;
    if v_delta_counts<>'{}'::jsonb then
      insert into public.user_practice_daily_key_usage as k (owner_profile_id,practice_profile_id,generation,day,key_counts)
      values(v_owner,p_practice_profile_id,p_practice_generation,v_day,v_delta_counts)
      on conflict(owner_profile_id,practice_profile_id,generation,day) do update
      set key_counts=public.add_key_counts(k.key_counts,excluded.key_counts),updated_at=now();
    end if;
  end loop;

  delete from public.typing_practice_metric_sessions where owner_profile_id=v_owner and updated_at<now()-interval '3 days';
  delete from public.typing_practice_weakness_sessions where owner_profile_id=v_owner and updated_at<now()-interval '3 days';
  delete from public.typing_practice_key_sessions where owner_profile_id=v_owner and updated_at<now()-interval '3 days';
end;
$$;

create or replace function public.get_my_practice_typing_analytics(p_practice_profile_id uuid,p_generation integer,p_days integer default 30)
returns jsonb
language plpgsql
stable
security definer
set search_path=public
as $$
declare v_owner uuid:=public.current_profile_id(); v_days integer:=least(greatest(coalesce(p_days,30),7),45);
  v_today date:=(now() at time zone 'Asia/Seoul')::date; v_current date; v_previous date; v_result jsonb;
begin
  if auth.uid() is null or v_owner is null or not exists(select 1 from public.typing_practice_profiles where id=p_practice_profile_id and owner_profile_id=v_owner and generation=p_generation) then return null; end if;
  v_current:=v_today-v_days+1; v_previous:=v_current-v_days;
  with metric_daily as (
    select day,sum(starts) starts,sum(completions) completions,sum(passed) passed,sum(typed_chars) typed_chars,
      sum(active_ms) active_ms,sum(cpm_sum)cpm_sum,sum(accuracy_sum)accuracy_sum,sum(backspaces)backspaces,
      sum(mistakes)mistakes,sum(long_pauses)long_pauses,sum(news_completed)news_completed
    from public.user_practice_daily_metrics where owner_profile_id=v_owner and practice_profile_id=p_practice_profile_id and generation=p_generation and day>=v_previous group by day
  ), legacy_daily as (
    select day,starts,completions,passed,typed_chars,active_ms,cpm_sum,accuracy_sum,backspaces,mistakes,long_pauses,news_completed
    from public.user_practice_legacy_daily where owner_profile_id=v_owner and practice_profile_id=p_practice_profile_id and generation=p_generation and day>=v_previous
  ), daily as (select * from metric_daily union all select * from legacy_daily), combined as (
    select day,sum(starts)starts,sum(completions)completions,sum(passed)passed,sum(typed_chars)typed_chars,sum(active_ms)active_ms,
      sum(cpm_sum)cpm_sum,sum(accuracy_sum)accuracy_sum,sum(backspaces)backspaces,sum(mistakes)mistakes,sum(long_pauses)long_pauses,sum(news_completed)news_completed
    from daily group by day
  ), current_totals as (
    select coalesce(sum(starts),0)starts,coalesce(sum(completions),0)completions,coalesce(sum(passed),0)passed,
      coalesce(sum(typed_chars),0)typed_chars,coalesce(sum(active_ms),0)active_ms,coalesce(sum(cpm_sum),0)cpm_sum,
      coalesce(sum(accuracy_sum),0)accuracy_sum,coalesce(sum(backspaces),0)backspaces,coalesce(sum(mistakes),0)mistakes,
      coalesce(sum(long_pauses),0)long_pauses,coalesce(sum(news_completed),0)news_completed,count(*) active_days
    from combined where day>=v_current
  ), previous_totals as (
    select coalesce(sum(completions),0)completions,coalesce(sum(typed_chars),0)typed_chars,coalesce(sum(cpm_sum),0)cpm_sum,coalesce(sum(accuracy_sum),0)accuracy_sum
    from combined where day>=v_previous and day<v_current
  ), profile_modes as (
    select language,mode,sum(completions)completions,sum(typed_chars)typed_chars,sum(cpm_sum)cpm_sum,sum(accuracy_sum)accuracy_sum
    from public.user_practice_daily_metrics where owner_profile_id=v_owner and practice_profile_id=p_practice_profile_id and generation=p_generation and day>=v_current group by language,mode
  ), legacy_modes as (
    select split_part(e.key,':',1)language,split_part(e.key,':',2)mode,sum(coalesce((e.value->>1)::bigint,0))completions,
      sum(coalesce((e.value->>3)::bigint,0))typed_chars,sum(coalesce((e.value->>5)::bigint,0))cpm_sum,sum(coalesce((e.value->>6)::bigint,0))accuracy_sum
    from public.user_practice_legacy_daily l cross join lateral jsonb_each(l.mode_breakdown)e
    where l.owner_profile_id=v_owner and l.practice_profile_id=p_practice_profile_id and l.generation=p_generation and l.day>=v_current group by 1,2
  ), modes as (select * from profile_modes union all select * from legacy_modes), combined_modes as (
    select language,mode,sum(completions)completions,sum(typed_chars)typed_chars,sum(cpm_sum)cpm_sum,sum(accuracy_sum)accuracy_sum from modes group by language,mode
  ), active_days as (select distinct day from combined where day>=v_today-89 and day<=v_today), numbered as (
    select day,day+row_number()over(order by day desc)::integer grp from active_days
  ), latest as (
    select max(day) as latest_day from active_days
  ), streak as (
    select case when l.latest_day >= v_today - 1
      then count(*) filter (where n.grp = l.latest_day + 1)
      else 0 end as value
    from numbered n cross join latest l
    group by l.latest_day
  ) select jsonb_build_object('days',v_days,'summary',jsonb_build_object('starts',c.starts,'completions',c.completions,'passed',c.passed,
    'typedChars',c.typed_chars,'activeMs',c.active_ms,'avgCpm',case when c.completions>0 then round(c.cpm_sum::numeric/c.completions,1)else 0 end,
    'avgAccuracy',case when c.completions>0 then round(c.accuracy_sum::numeric/c.completions,1)else 0 end,'backspaces',c.backspaces,
    'mistakes',c.mistakes,'longPauses',c.long_pauses,'newsCompleted',c.news_completed,'activeDays',c.active_days,'streak',coalesce((select value from streak),0)),
    'comparison',jsonb_build_object('typedChars',case when p.typed_chars>0 then round((c.typed_chars-p.typed_chars)::numeric*100/p.typed_chars,1)else null end,
      'completions',case when p.completions>0 then round((c.completions-p.completions)::numeric*100/p.completions,1)else null end,
      'avgCpm',case when p.completions>0 and c.completions>0 then round(c.cpm_sum::numeric/c.completions-p.cpm_sum::numeric/p.completions,1)else null end,
      'avgAccuracy',case when p.completions>0 and c.completions>0 then round(c.accuracy_sum::numeric/c.completions-p.accuracy_sum::numeric/p.completions,1)else null end),
    'daily',coalesce((select jsonb_agg(jsonb_build_object('day',d.day,'typedChars',d.typed_chars,'completions',d.completions,
      'avgCpm',case when d.completions>0 then round(d.cpm_sum::numeric/d.completions,1)else 0 end,'avgAccuracy',case when d.completions>0 then round(d.accuracy_sum::numeric/d.completions,1)else 0 end)order by d.day)from combined d where d.day>=v_current),'[]'::jsonb),
    'modes',coalesce((select jsonb_agg(jsonb_build_object('language',m.language,'mode',m.mode,'completions',m.completions,'typedChars',m.typed_chars,
      'avgCpm',case when m.completions>0 then round(m.cpm_sum::numeric/m.completions,1)else 0 end,'avgAccuracy',case when m.completions>0 then round(m.accuracy_sum::numeric/m.completions,1)else 0 end)order by m.completions desc)from combined_modes m),'[]'::jsonb))
  into v_result from current_totals c cross join previous_totals p; return v_result;
end;
$$;

create or replace function public.get_my_practice_weaknesses(p_practice_profile_id uuid,p_generation integer,p_limit integer default 12)
returns table(sentence_id bigint,sentence_text text,char_index integer,target_character text,mistake_count bigint,correction_count bigint)
language sql stable security definer set search_path=public as $$
  select w.sentence_id,s.text,w.char_index,substr(s.text,w.char_index+1,1),w.mistake_count,w.correction_count
  from public.user_practice_weaknesses w join public.sentences s on s.id=w.sentence_id
  where auth.uid()is not null and w.owner_profile_id=public.current_profile_id() and w.practice_profile_id=p_practice_profile_id and w.generation=p_generation
  order by w.mistake_count desc,w.last_seen_at desc limit least(greatest(coalesce(p_limit,12),1),30)
$$;

create or replace function public.get_my_practice_key_usage(p_practice_profile_id uuid,p_generation integer,p_days integer default 30)
returns jsonb language plpgsql stable security definer set search_path=public as $$
declare v_owner uuid:=public.current_profile_id();v_days integer:=least(greatest(coalesce(p_days,30),7),90);v_cutoff date:=(now()at time zone'Asia/Seoul')::date-v_days+1;v_recent jsonb;v_total jsonb;
begin
  if auth.uid()is null or v_owner is null then return null;end if;
  select coalesce(jsonb_object_agg(code,to_jsonb(total)),'{}'::jsonb)into v_recent from(
    select e.key code,sum((e.value#>>'{}')::bigint)::bigint total from public.user_practice_daily_key_usage k cross join lateral jsonb_each(k.key_counts)e
    where k.owner_profile_id=v_owner and k.practice_profile_id=p_practice_profile_id and k.generation=p_generation and k.day>=v_cutoff group by e.key)x;
  select coalesce(jsonb_object_agg(code,to_jsonb(total)),'{}'::jsonb)into v_total from(
    select code,sum(value)::bigint total from(
      select e.key code,(e.value#>>'{}')::bigint value
      from public.user_practice_legacy_key_totals l cross join lateral jsonb_each(l.key_counts)e
      where l.owner_profile_id=v_owner and l.practice_profile_id=p_practice_profile_id and l.generation=p_generation
      union all
      select e.key,(e.value#>>'{}')::bigint
      from public.user_practice_daily_key_usage k cross join lateral jsonb_each(k.key_counts)e
      where k.owner_profile_id=v_owner and k.practice_profile_id=p_practice_profile_id and k.generation=p_generation
        and k.day>=coalesce((select baseline_day from public.user_practice_legacy_key_totals l where l.owner_profile_id=v_owner and l.practice_profile_id=p_practice_profile_id and l.generation=p_generation),'-infinity'::date)
    )values_by_key group by code
  )x;
  return jsonb_build_object('days',v_days,'recent',coalesce(v_recent,'{}'::jsonb),'total',coalesce(v_total,'{}'::jsonb));
end;$$;

alter table public.typing_practice_profiles enable row level security;
alter table public.typing_practice_metric_sessions enable row level security;
alter table public.user_practice_daily_metrics enable row level security;
alter table public.user_practice_legacy_daily enable row level security;
alter table public.typing_practice_weakness_sessions enable row level security;
alter table public.user_practice_weaknesses enable row level security;
alter table public.typing_practice_key_sessions enable row level security;
alter table public.user_practice_daily_key_usage enable row level security;
alter table public.user_practice_legacy_key_totals enable row level security;

revoke all on public.typing_practice_profiles,public.typing_practice_metric_sessions,public.user_practice_daily_metrics,
  public.user_practice_legacy_daily,public.typing_practice_weakness_sessions,public.user_practice_weaknesses,
  public.typing_practice_key_sessions,public.user_practice_daily_key_usage,public.user_practice_legacy_key_totals from anon,authenticated;
revoke all on function public.ensure_my_typing_practice_profile() from public,anon,authenticated;
revoke all on function public.get_my_typing_practice_profiles() from public,anon;
revoke all on function public.create_my_typing_practice_profile(text) from public,anon;
revoke all on function public.rename_my_typing_practice_profile(uuid,text) from public,anon;
revoke all on function public.reset_my_typing_practice_profile(uuid) from public,anon;
revoke all on function public.archive_my_typing_practice_profile(uuid) from public,anon;
revoke all on function public.restore_my_typing_practice_profile(uuid) from public,anon;
revoke all on function public.report_typing_analytics_v3(uuid,uuid,integer,jsonb,jsonb,jsonb) from public,anon;
revoke all on function public.get_my_practice_typing_analytics(uuid,integer,integer) from public,anon;
revoke all on function public.get_my_practice_weaknesses(uuid,integer,integer) from public,anon;
revoke all on function public.get_my_practice_key_usage(uuid,integer,integer) from public,anon;
grant execute on function public.get_my_typing_practice_profiles(),public.create_my_typing_practice_profile(text),
  public.rename_my_typing_practice_profile(uuid,text),public.reset_my_typing_practice_profile(uuid),
  public.archive_my_typing_practice_profile(uuid),public.restore_my_typing_practice_profile(uuid),
  public.report_typing_analytics_v3(uuid,uuid,integer,jsonb,jsonb,jsonb),
  public.get_my_practice_typing_analytics(uuid,integer,integer),public.get_my_practice_weaknesses(uuid,integer,integer),
  public.get_my_practice_key_usage(uuid,integer,integer) to authenticated;

notify pgrst,'reload schema';
commit;
