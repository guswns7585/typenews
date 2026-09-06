-- RSS에서 목록 구분자로 쓰이는 가운데점 계열도 클라이언트와 동일하게
-- "특수문자 무시" 대상으로 처리한다. 점수 산식과 다른 옵션의 동작은 유지한다.
create or replace function public.sentence_score(
  p_text text,
  p_ignore_punctuation boolean default false,
  p_ignore_numbers boolean default false,
  p_ignore_english boolean default false,
  p_ignore_symbols boolean default false
)
returns integer
language sql
immutable
parallel safe
as $fn$
  select coalesce(sum(public.keystrokes_for_char(ch)), 0)::integer
  from regexp_split_to_table(coalesce(p_text, ''), '') as ch
  where not (
       (coalesce(p_ignore_punctuation, false) and ch ~ '[.,!?''"“”‘’~]')
    or (coalesce(p_ignore_numbers, false)     and ch ~ '[0-9]')
    or (coalesce(p_ignore_english, false)     and ch ~ '[A-Za-zÀ-ɏ]')
    or (coalesce(p_ignore_symbols, false)     and ch ~ '[!@#$%^&*()_+={}|\\:;<>?/~\[\]-··•‧∙⋅・ㆍ･]')
  )
$fn$;

comment on function public.sentence_score(text, boolean, boolean, boolean, boolean) is
  '문장을 끝냈을 때 받는 점수. frontend typing-workspace.tsx의 scoreForSentence와 같은 값을 내야 한다.';
