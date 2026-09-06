-- 뉴스는 외부 RSS에서 오므로 sentences 표의 ID가 없다. 브라우저가 보낸 본문은
-- 조작할 수 있으므로, Vercel의 서버 라우트가 허용된 RSS를 직접 읽어 정규화한 원문만
-- 이 표에 등록한다. 클라이언트는 UUID만 받고 0034가 이 원문으로 점수를 다시 센다.

create table if not exists public.news_score_sources (
  id uuid primary key default gen_random_uuid(),
  source_feed_url text not null,
  article_url text,
  title text not null,
  body text not null,
  content_hash text not null unique check (content_hash ~ '^[0-9a-f]{64}$'),
  created_at timestamptz not null default now(),
  expires_at timestamptz not null
);

create index if not exists news_score_sources_expires_idx
  on public.news_score_sources (expires_at);

alter table public.news_score_sources enable row level security;

-- 브라우저는 원문 표를 직접 읽거나 쓸 필요가 없다. API 응답으로 받은 UUID는
-- security definer 점수 함수에만 넘긴다. service_role은 Vercel 서버에서만 사용한다.
revoke all on table public.news_score_sources from public, anon, authenticated;
grant select, insert, update, delete on table public.news_score_sources to service_role;

create or replace function public.prune_news_score_sources()
returns integer
language plpgsql
security definer
set search_path = public
as $$
declare
  v_deleted integer;
begin
  delete from public.news_score_sources where expires_at < now() - interval '1 day';
  get diagnostics v_deleted = row_count;
  return v_deleted;
end;
$$;

revoke all on function public.prune_news_score_sources() from public, anon, authenticated;

do $$
declare
  v_job_id bigint;
begin
  for v_job_id in select jobid from cron.job where jobname = 'typenews-prune-news-sources'
  loop
    perform cron.unschedule(v_job_id);
  end loop;
end;
$$;

-- 매일 04:30 KST. 기존 무결성 정리(04:20)와 일 집계(04:40) 사이에 둔다.
select cron.schedule(
  'typenews-prune-news-sources',
  '30 19 * * *',
  $$select public.prune_news_score_sources()$$
);

notify pgrst, 'reload schema';
