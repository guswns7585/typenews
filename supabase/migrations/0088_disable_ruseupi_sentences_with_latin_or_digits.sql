-- 루습히 공유 문장 중 영문자나 숫자가 섞인 항목은 타자 문장 목록에서 제외한다.
-- 삭제하지 않고 비활성화하여 집계 기록과 문장 ID 참조는 유지한다.
update public.sentences
set enabled = false
where source_name = '루습히'
  and text ~ '[A-Za-z0-9]';
