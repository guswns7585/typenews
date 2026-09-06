-- 닉네임 변경을 24시간에 한 번으로 제한한다.
--
-- 왜 필요한가
--   랭킹·당첨자 확인·안내 메일이 전부 닉네임 기준이다. 이름을 수시로 바꾸면
--   같은 사람을 추적할 수 없고, 남이 쓰던 이름을 계속 낚아채는 것도 가능하다.
--   0023의 유니크 인덱스는 "동시에 둘"만 막지, 갈아타기를 막지는 못한다.
--
-- 왜 서버에서 막는가
--   화면에서 버튼만 잠그는 것은 방어가 아니다. RPC는 누구나 직접 부를 수 있다.
--   제한은 update_my_display_name() 안에 있어야 우회할 수 없다.
--
-- 최초 설정은 제한하지 않는다 ★
--   nickname_set이 false면 아직 사용자가 이름을 정한 적이 없다는 뜻이다
--   (0010 참고 — display_name에는 구글 계정 이름이 들어 있다). 최초 로그인
--   모달에서 이름을 정하는 그 순간이 여기에 걸리면 가입 자체가 막힌다.
--   그래서 "직접 정한 적이 있는 사람"부터 24시간을 센다.

-- ---------------------------------------------------------------------------
-- 1. 마지막으로 바꾼 시각
-- ---------------------------------------------------------------------------
-- NULL은 "이 제한이 생기기 전"을 뜻한다. 기존 사용자에게 소급 적용하지 않으므로
-- 배포 직후 첫 변경은 누구나 통과하고, 그때부터 24시간이 시작된다.
-- 과거 시각을 만들어 넣지 않는 이유: 우리가 모르는 값을 지어내면 사용자에게는
-- "이유 없이 막힌" 것으로 보인다.

alter table public.profiles
  add column if not exists display_name_changed_at timestamptz;

comment on column public.profiles.display_name_changed_at is
  '닉네임을 마지막으로 바꾼 시각. NULL이면 24시간 제한(0042) 이후로 바꾼 적이 없다.';

-- ---------------------------------------------------------------------------
-- 2. 제한을 넣은 update_my_display_name
-- ---------------------------------------------------------------------------
-- 0023에서 바뀐 것은 (a) 같은 이름 재제출 조기 반환, (b) 24시간 검사,
-- (c) display_name_changed_at 기록 세 가지뿐이다. 나머지는 그대로 옮겼다.

create or replace function public.update_my_display_name(p_display_name text)
returns text
language plpgsql
security definer
set search_path = public
as $$
declare
  v_cooldown constant interval := interval '24 hours';
  v_profile_id uuid;
  v_current text;
  v_nickname_set boolean;
  v_changed_at timestamptz;
  v_available timestamptz;
  v_left interval;
  v_name text := btrim(coalesce(p_display_name, ''));
begin
  if auth.uid() is null then
    raise exception 'Not authenticated';
  end if;

  if char_length(v_name) < 1 or char_length(v_name) > 12 then
    raise exception '닉네임은 1~12자여야 합니다';
  end if;

  /* 보이지 않는 문자로 남을 사칭하거나 줄을 깨뜨리지 못하게 막는다.
     소스에 실제 제어문자를 적으면 문자열이 깨지므로 코드포인트로 조립한다. */
  if v_name ~ ('[' || chr(8203) || chr(8204) || chr(8205) || chr(8206) || chr(8207)
                   || chr(160) || chr(65279) || ']')
     or v_name ~ '[[:cntrl:]]'
  then
    raise exception '사용할 수 없는 문자가 있습니다';
  end if;

  select public.current_profile_id() into v_profile_id;
  if v_profile_id is null then
    raise exception 'Profile not found';
  end if;

  select display_name, nickname_set, display_name_changed_at
  into v_current, v_nickname_set, v_changed_at
  from public.profiles
  where id = v_profile_id;

  /* 같은 이름을 다시 저장하는 것은 변경이 아니다.
     여기서 24시간을 소모시키면, 저장 버튼을 두 번 눌렀다는 이유만으로
     하루를 잠그게 된다. 조용히 성공으로 돌려보낸다. */
  if v_current is not null and v_current = v_name then
    return v_current;
  end if;

  /* 최초 설정(nickname_set = false)은 제한 대상이 아니다. */
  if coalesce(v_nickname_set, false) and v_changed_at is not null then
    v_available := v_changed_at + v_cooldown;
    if now() < v_available then
      v_left := v_available - now();
      raise exception '닉네임은 24시간에 한 번만 바꿀 수 있습니다. %시간 %분 뒤에 다시 시도해 주세요',
        floor(extract(epoch from v_left) / 3600)::int,
        (floor(extract(epoch from v_left) / 60)::int % 60);
    end if;
  end if;

  if exists (
    select 1 from public.profiles
    where display_name_lower = lower(v_name) and id <> v_profile_id
  ) then
    raise exception '이미 사용 중인 닉네임입니다';
  end if;

  begin
    update public.profiles
    set display_name = v_name,
        display_name_lower = lower(v_name),
        nickname_set = true,
        display_name_changed_at = now()
    where id = v_profile_id;
  exception
    when unique_violation then
      -- 위 검사와 update 사이에 다른 사람이 같은 이름을 가져간 경우
      raise exception '이미 사용 중인 닉네임입니다';
  end;

  -- 랭킹은 monthly_stats.nickname을 우선 쓰므로 이번 달 표시도 맞춰준다.
  update public.monthly_stats
  set nickname = v_name
  where profile_id = v_profile_id
    and month_id = to_char(now() at time zone 'Asia/Seoul', 'YYYYMM');

  return v_name;
end;
$$;

comment on function public.update_my_display_name(text) is
  '닉네임을 바꾼다. 최초 설정을 제외하고 24시간에 한 번만 허용한다 (0042).';

grant execute on function public.update_my_display_name(text) to authenticated;

notify pgrst, 'reload schema';
