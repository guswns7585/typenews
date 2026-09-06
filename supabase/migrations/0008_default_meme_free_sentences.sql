-- 밈이 빠진 문장 묶음(kor_stream.json)을 기본으로 전환한다.
--
-- 밈은 모두가 아는 것도 아니고 민감한 내용도 있어 기본에서 뺀다.
-- 클라이언트 기본값은 이미 바꿨고 localStorage도 마이그레이션되지만,
-- 로그인하면 서버에 저장된 환경설정이 그것을 덮어쓴다. 그래서 서버 값도
-- 한 번 밀어줘야 기존 사용자에게 실제로 적용된다.
--
-- 이 항목만 바꾼다. 배경·글자 크기 같은 다른 설정은 그대로 둔다.
-- 사용자가 나중에 M 버튼을 끄면 다시 밈 포함 묶음으로 돌아간다.

update public.profiles
set preferences = jsonb_set(preferences, '{ignoreStreaming}', 'true'::jsonb, true)
where preferences is not null
  and jsonb_typeof(preferences) = 'object'
  and coalesce(preferences ->> 'ignoreStreaming', 'false') <> 'true';

-- 몇 명에게 적용됐는지 확인용
select count(*) as meme_free_profiles
from public.profiles
where preferences ->> 'ignoreStreaming' = 'true';
