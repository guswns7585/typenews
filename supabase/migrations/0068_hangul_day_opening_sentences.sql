-- 매년 한글날에만 한국어 단문·장문·단어 첫 글로 보여줄 항목.
-- 프론트엔드가 10월 9일 외에는 이 항목들을 문장 풀에서 제외한다.
insert into public.sentences (language, mode, text, is_meme, enabled)
select 'kor', 'short',
  '한글은 우리말을 소리대로 적을 수 있도록 세종대왕이 만든 문자다.',
  false, true
where not exists (
  select 1 from public.sentences
  where language = 'kor'
    and mode = 'short'
    and text = '한글은 우리말을 소리대로 적을 수 있도록 세종대왕이 만든 문자다.'
);

insert into public.sentences (language, mode, text, is_meme, enabled)
select 'kor', 'long',
  '세종대왕은 백성이 말하고자 하는 바가 있어도 글로 뜻을 펴지 못하는 일을 안타깝게 여겨 훈민정음을 만들었다. 배우기 쉬운 글자는 지식을 나누는 문턱을 낮췄고, 오늘날 한글은 누구나 자신의 생각을 또렷하게 기록하고 전하는 바탕이 되었다.',
  false, true
where not exists (
  select 1 from public.sentences
  where language = 'kor'
    and mode = 'long'
    and text = '세종대왕은 백성이 말하고자 하는 바가 있어도 글로 뜻을 펴지 못하는 일을 안타깝게 여겨 훈민정음을 만들었다. 배우기 쉬운 글자는 지식을 나누는 문턱을 낮췄고, 오늘날 한글은 누구나 자신의 생각을 또렷하게 기록하고 전하는 바탕이 되었다.'
);

insert into public.sentences (language, mode, text, is_meme, enabled)
select 'kor', 'word', word, false, true
from (values ('한글날'), ('세종대왕')) as holiday_words(word)
where not exists (
  select 1 from public.sentences
  where language = 'kor'
    and mode = 'word'
    and text = holiday_words.word
);
