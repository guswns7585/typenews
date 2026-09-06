-- 특수문자 정규식이 소문자 a-z를 통째로 삼키던 것을 고친다.
--
-- 무슨 일이 있었나
--   0046이 가운데점 계열(··•‧∙⋅・ㆍ･)을 특수문자 목록 끝에 붙였다. 그런데
--   원래 목록은 이렇게 끝나고 있었다.
--
--       '[!@#$%^&*()_+={}|\\:;<>?/~\[\]-]'
--                                      ↑ 닫는 괄호 바로 앞이라 리터럴 하이픈
--
--   그 뒤에 문자를 이어 붙이면서 하이픈이 **범위 연산자**가 되어버렸다.
--
--       '[... \[\]-··•‧∙⋅・ㆍ･]'
--              ↑ 이제 "] 부터 · 까지"라는 뜻
--
--   ]는 U+005D, ·는 U+00B7이다. 그 사이에는 **소문자 a-z(U+0061~U+007A)가
--   전부 들어 있다.** 그래서 "특수문자 무시"를 켠 사용자의 영어 문장은
--   서버 검산에서 알파벳이 거의 다 빠진 채 계산됐다.
--
-- 왜 영어에서만 드러났나
--   한글 음절(U+AC00~)과 숫자(U+0030~), 대문자(U+0041~U+005A)는 이 범위 밖이다.
--   영어 문장은 대부분 소문자라 점수가 사실상 남지 않았다. 화면에는 정상 점수가
--   보이는데(클라이언트 정규식은 하이픈을 이스케이프해 멀쩡하다) 서버가
--   자기 계산값으로 덮어쓰므로, 사용자에게는 "점수가 안 오른다"로 보인다.
--
-- 고치는 방법
--   하이픈을 대괄호 맨 끝으로 옮긴다. 그 자리에서는 어떤 정규식 문법에서도
--   범위가 될 수 없다. 이스케이프에 기대는 것보다 안전하다.
--
--   ⚠️ 이 목록에 문자를 더할 때는 **하이픈 앞에** 넣을 것. 뒤에 붙이면 같은
--      사고가 되풀이된다.
--
-- 클라이언트 원본 (features/typing-engine/alignment.ts)
--   const SYMBOL = /[!@#$%^&*()_\-+={}[\]|\\:;<>?/~··•‧∙⋅・ㆍ･]/;

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
    or (coalesce(p_ignore_symbols, false)     and ch ~ '[!@#$%^&*()_+={}|\\:;<>?/~\[\]··•‧∙⋅・ㆍ･-]')
  )
$fn$;

comment on function public.sentence_score(text, boolean, boolean, boolean, boolean) is
  '문장을 끝냈을 때 받는 점수. frontend typing-workspace.tsx의 scoreForSentence와 같은 값을 내야 한다. 특수문자 목록의 하이픈은 반드시 맨 끝에 둔다(0050).';

-- ---------------------------------------------------------------------------
-- 적용 뒤 확인
-- ---------------------------------------------------------------------------
-- 소문자가 살아 있는지. 두 값이 같아야 한다.
--
--   select public.sentence_score('hello world', false, false, false, true)  as 무시켬,
--          public.sentence_score('hello world', false, false, false, false) as 무시끔;
--
-- 고치기 전에는 무시켬이 0이었다(공백 제외 전부 탈락).

notify pgrst, 'reload schema';
