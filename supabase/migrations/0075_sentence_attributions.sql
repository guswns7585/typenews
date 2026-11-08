begin;

alter table public.sentences
  add column if not exists source_name text,
  add column if not exists source_url text;

alter table public.sentences
  drop constraint if exists sentences_source_name_length,
  add constraint sentences_source_name_length
    check (source_name is null or char_length(btrim(source_name)) between 1 and 100),
  drop constraint if exists sentences_source_url_length,
  add constraint sentences_source_url_length
    check (source_url is null or char_length(source_url) <= 500),
  drop constraint if exists sentences_source_url_protocol,
  add constraint sentences_source_url_protocol
    check (source_url is null or source_url ~ '^https://');

comment on column public.sentences.source_name is
  '화면에 표시할 문장 제공자, 저자, 화자 또는 작품 출처.';
comment on column public.sentences.source_url is
  '출처를 확인할 수 있는 HTTPS 링크.';

update public.sentences
set source_name = '루습히',
    source_url = 'https://brunch.co.kr/@ruseupi/218'
where id between 4706 and 5405
  and language = 'kor'
  and mode in ('short', 'long')
  and created_by is null;

notify pgrst, 'reload schema';

commit;
