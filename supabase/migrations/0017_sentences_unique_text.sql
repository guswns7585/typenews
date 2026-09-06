-- 같은 문장이 두 번 들어가지 않게 막는다.
--
-- 1,900문장을 JSON에서 옮기는데, 스크립트를 다시 돌리거나 관리자가 실수로
-- 같은 문장을 또 추가하면 그 문장이 두 배로 자주 나온다. 뽑기가 무작위라
-- 눈에 잘 띄지 않아 더 위험하다.
--
-- 언어·모드까지 묶어서 유니크로 둔다. 같은 문장을 단문과 장문 양쪽에 두는 것은
-- 있을 수 있는 일이라 text 단독으로는 걸지 않는다.

-- 이미 중복이 있으면 인덱스 생성이 실패한다. 먼저 정리한다.
-- (지금은 sentences가 비어 있어 아무것도 지우지 않는다)
delete from public.sentences s
where exists (
  select 1 from public.sentences keep
  where keep.language = s.language
    and keep.mode = s.mode
    and btrim(keep.text) = btrim(s.text)
    and keep.id < s.id
);

create unique index if not exists sentences_unique_text_idx
  on public.sentences (language, mode, btrim(text));

notify pgrst, 'reload schema';
