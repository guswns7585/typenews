# 8월 커트오버 점검

2026-07-26 코드 점검 결과. 대상은 이벤트에 직접 닿는 경로 — 점수, 랭킹, 월 초기화,
로그인, Firebase 이관 데이터.

> **갱신 2026-07-28 — 이 문서는 점검 기록이다. 진행 상황은
> [SESSION-2026-07-28.md](SESSION-2026-07-28.md)가 최신이다.**
>
> 그 뒤로 달라진 것:
> - **DB 실데이터를 확인했다.** 아래 "데이터 확인 필요"는 대부분 해소됐다.
>   `sentences` 1,478행, `event_prizes` 3행, 프로필 869명(닉네임 850, 중복 0),
>   `typing_results` 163행, 당첨 관련 표 0행.
> - **D2(점수 위조)** — `0024`에서 섀도 검산으로 막기 시작했다. 아래 D2 참고.
> - **도메인 계획이 바뀌었다.** `typenews.kr`의 DNS를 통제할 수 없다는 것이
>   드러나 아래 "커트오버 순서"의 6번은 그대로 실행할 수 없다. 대안은
>   SESSION 문서의 "4. 도메인" 항목에 있다.
> - **당첨 자동화**(B1-1)는 `0019`~`0022`로 구현했고, 스케줄러는 `0025`에서 등록한다.

---

## 반드시 고쳐야 하는 것

### A1. 점수가 들어갈 달을 클라이언트가 정한다

`record_typing_result(p_month_id, ...)`의 `p_month_id`는 **클라이언트가 보내는 값**이고,
서버는 `^[0-9]{6}$` 형식만 본다. ([0006](../supabase/migrations/0006_score_by_keystrokes.sql):72)

7월에 `p_month_id: '202608'`로 보내면 8월 랭킹에 점수가 미리 쌓인다.
문장당 상한(600)과 시간당 상한(60,000)은 걸리지만, 그 안에서는 그대로 적립된다.
하루 최대 1,440,000점이고 남은 7월은 5일이다. 경품이 걸린 랭킹에서 이건 치명적이다.

탐지 룰(`UNIFORM_SUBMIT_INTERVAL` 등)은 신호만 남기고 점수를 막지 않는다.

**고치는 방법** — 서버가 직접 계산한다. 인자는 호환을 위해 남겨두고 무시한다.

```sql
-- p_month_id는 받되 쓰지 않는다. 달은 서버 시계가 정한다.
v_month_id := to_char(now() at time zone 'Asia/Seoul', 'YYYYMM');
```

`get_monthly_ranking`, `get_my_typing_summary`는 조회 전용이라 그대로 둬도 된다.

> ⚠️ 점수 로직 변경이라 이벤트 진행 중에는 손대지 않았다. 승인 후 진행.

### A0. 커트오버 순간 로그인된 모든 사용자가 로그아웃된다 (불가피)

세션이 localStorage에 있고(`persistSession: true`, 기본 스토리지) localStorage는
origin별로 분리된다. `typenews.kr`에서는 `typenews-vercel.vercel.app`의 세션을 볼 수 없다.
도메인을 바꾸는 이상 피할 방법이 없다. 공지를 미리 띄울지 판단할 것.

- **점수·기록은 안전하다.** 서버에 있고 email/google_sub으로 다시 연결된다
- **다시 로그인하면 배경·글자 크기도 돌아온다.** `PreferencesSync`가 서버에서 복원한다
- 비로그인 사용자는 로컬 설정(배경·글자 크기·타건음)을 잃는다

### A2. 도메인이 바뀌면 로그인이 끊긴다

[auth-setup.md](../supabase/docs/auth-setup.md)의 현재 설정은 이렇다.

| 항목 | 상태 (2026-07-27) |
|---|---|
| Redirect URLs | ✅ `https://typenews.kr/**` 추가 완료 |
| Site URL | ⏳ 아직 `https://typenews-vercel.vercel.app`. **커트오버 순간에 바꿀 것** |

Site URL을 미리 바꾸지 않는 이유: 이것은 명시적 `redirectTo`가 없을 때의 폴백이라,
지금 바꾸면 폴백이 탈 때 아직 Firebase가 서비스 중인 옛 사이트로 떨어진다.
vercel.app과 localhost 항목은 롤백·개발 대비로 남겨둘 것.

**`www.typenews.kr`을 함께 서비스한다면 `https://www.typenews.kr/**`도 넣어야 한다.**
Vercel에서 www를 apex로 리다이렉트하도록 설정했다면 origin이 항상 apex라 필요 없다.

GCP 쪽은 건드릴 필요 없다. OAuth redirect URI는 Supabase 콜백
(`https://iuujbgblvwduehktabbw.supabase.co/auth/v1/callback`)이고 도메인과 무관하다.

### A3. ~~`NEXT_PUBLIC_SITE_URL`~~ — Production에서 삭제 완료 (2026-07-27)

[auth-button.tsx](../frontend/components/auth/auth-button.tsx)가 이 값을 `redirectTo`에 쓴다.
지우면 `window.location.origin`으로 떨어진다.

**지운 것이 PKCE 문제까지 막는다.** 클라이언트가 `flowType: "pkce"`이고, PKCE는
로그인을 **시작한** origin의 localStorage에 code verifier를 저장한 뒤 **콜백을 받은**
origin에서 읽어 교환한다. 값이 vercel.app으로 박혀 있으면 `typenews.kr`에서 시작한
로그인의 콜백이 vercel.app으로 가서 verifier를 찾지 못하고 교환이 실패한다.
origin을 쓰면 시작과 콜백이 항상 같은 도메인이다.

Preview에는 남겨뒀다. 프리뷰에서 로그인하면 그 값이 가리키는 주소로 튕겨
**로그인은 되지만 프리뷰를 벗어난다.** Redirect URLs에 vercel.app이 있어 실패하지는 않는다.

### A4. ~~`metadataBase`가 없어 OG 이미지가 엉뚱한 도메인으로 나간다~~ (수정 완료)

`next dev`가 경고를 띄우던 항목이다. 설정하지 않으면 Next가 개발에서는 `localhost:3000`,
배포에서는 Vercel이 준 도메인을 기준으로 상대 경로를 절대 URL로 바꾼다.
`openGraph.url`은 이미 `typenews.kr`로 박혀 있는데 이미지 주소만 vercel.app으로
나가는 상태였다.

[layout.tsx](../frontend/app/layout.tsx)에 `metadataBase: new URL("https://typenews.kr")`를
넣었다. 카카오톡·트위터에 링크를 붙였을 때 썸네일이 제 도메인에서 나온다.

---

## 이벤트 운영 전에 정해야 하는 것

### B1. "매월 마지막 날 13:00 마감"이라는 안내가 시스템에 없다

[event-content.tsx](../frontend/components/event/event-content.tsx):95가 그렇게 적어두었지만,
점수는 그 달 마지막 날 23:59:59(KST)까지 계속 쌓인다. 13:00이라는 개념이 코드에 없다.

**13:00 마감 / 24:00 발표는 수동 운영 때 필요했던 여유 시간이다.** 추첨부터 메일까지
사람이 했기 때문에 반나절이 필요했다. 자동화하면 그 이유가 없어진다.

그래서 13:00을 그대로 자동화하면 새 문제가 생긴다. **13:00~23:59에 친 점수가 아무것도
아니게 된다.** 화면의 랭킹은 계속 오르는데 추첨은 이미 끝나 있다. 둘 중 하나를 붙여야 한다.

- 13:00 이후 그 달 점수 적립을 막는다 → 마지막 날 반나절이 반쪽 서비스가 되고
  "왜 점수가 안 오르냐" 문의가 온다
- 그냥 둔다 → 순위가 뒤집혀 보이는데 결과는 다르다. 분쟁 소지

**권하는 쪽: 마감은 말일 23:59:59로 두고, 추첨을 1일 00:10(KST)에 돌린다.**

- 사용자는 마지막 날 온종일 점수를 쌓을 수 있다
- 안내문이 단순해진다 — "말일 자정 마감, 1일 추첨"
- 스냅샷 로직이 필요 없다. 월이 넘어간 뒤에는 `month_id`로 조회한 값이 곧 최종 랭킹이다
- 00:00 정각이 아니라 00:10인 이유는 자정 직전 제출과 겹치지 않게 하려는 것이다

### B1-1. 당첨 자동화를 만들 때 함께 정해야 하는 것

계획: 자동 추첨 → 당첨 메일 → 당첨자에게 3일간 주소 입력 모달·버튼·알림.

> `0031_pre_cutover_safety.sql`에서 운영 전환 전 추첨을 기본 비활성화했다.
> 최종 Firebase 백업 재이관과 검증이 끝난 뒤 `select public.set_draws_enabled(true);`로
> 켠다. 이 플래그는 cron과 관리자 수동 추첨에 함께 적용된다.

붙기 전에 결정이 필요한 부분만 적어둔다.

- **메일 발송 수단이 없다.** Supabase는 인증 메일 외에 트랜잭션 메일을 보내주지 않는다.
  Resend 같은 외부 서비스 + Edge Function이 필요하다
- **스케줄러.** `pg_cron`(+`pg_net`)이나 Vercel Cron 중 하나. 이미 `prune_integrity_data`를
  cron으로 돌리라는 권고가 있어([abuse-detection.md](../supabase/docs/abuse-detection.md))
  `pg_cron`을 켜두면 둘 다 해결된다
- **주소는 개인정보다.** 별도 테이블 + 본인만 읽는 RLS + 배송 후 파기 기준이 필요하다.
  프로필에 컬럼으로 붙이지 말 것 — `profiles`는 랭킹 조회 경로에 있다
- **당첨 상태가 상태 기계다.** 대기 → 주소 입력 완료 → 3일 만료 → 재추첨.
  만료와 재추첨까지 자동이어야 "응답 없으면 무효, 재추첨" 안내를 지킬 수 있다
- **추첨 결과를 저장해야 한다.** 지금은 `monthly_stats`만 있어서 "누가 당첨됐었나"를
  남길 곳이 없다. 재추첨 이력도 함께 남겨야 분쟁에 답할 수 있다
- **가중 추첨의 근거를 남길 것.** `0030_draw_pool_snapshot.sql`에서 회차별 상위 50명의
  점수·순위·응모권·제외 여부와 실제 선택 순서를 저장한다. 추첨도 고정된 스냅샷 안에서만
  실행하므로 나중에 후보 풀과 각 선택 시점의 확률을 재현할 수 있다

### B2. ~~부정행위자의 점수를 취소할 방법이 없다~~ (0013에서 추가)

`adjust_monthly_score(profile_id, month_id, new_score, reason)`으로 감점·영점 처리한다.
사유가 2자 이상이어야 통과하고, 조정 전/후 값과 사유·처리자가 `score_adjustments`에
남는다. 관리자 화면의 유저 표와 워치리스트 양쪽에 "조정" 버튼이 있다.

`counted_for_ranking` 컬럼을 살리는 대신 `monthly_stats`를 직접 조정하는 방식으로 갔다.
랭킹이 그 값만 보기 때문이다. 아래는 원래 문제 설명이다.

<details>
<summary>당시 상황</summary>

`typing_results.counted_for_ranking` 컬럼이 있지만 **어디서도 읽지 않는다.**
([0001](../supabase/migrations/0001_initial_type_news_schema.sql):47, 선언만 있고 사용처 0곳)

랭킹은 `monthly_stats.score`만 본다. 8월 28일에 어뷰저를 잡아도 감점·무효 처리 수단이
없어서 Supabase SQL 편집기에서 직접 UPDATE해야 한다. 관리자 화면에도 없다
(`monthly_stats`는 authenticated에 SELECT만 grant되어 있다).

경품 이벤트를 한 달 더 돌린다면 점수 무효 처리 RPC를 하나 두는 게 맞다.

</details>

### B3. ~~email 없는 프로필 19명~~ — 할 일 없음 (확인 완료)

`link_current_google_identity()`는 `supabase_user_id` → `google_sub` → `email` 순으로 찾는데,
이관 시 Firebase Auth export를 쓰지 않아 **866명 전원 `google_sub`이 비어 있다.**
결국 email 매칭만 동작하고, email이 없는 19명은 로그인해도 새 프로필이 생긴다.

로컬 백업에서 19명을 전수 확인했더니 **전원 빈 껍데기였다.** displayName null,
maxCPM 0, totalTypingCount 0, monthlyStats 0건. 문서에 있는 키가 `maxCPM`과
`preferences` 뿐이다. 로그인만 하고 문장을 한 번도 끝내지 않은 계정들이다.

**잃을 기록이 없으므로 복구 스크립트를 돌릴 이유가 없다.** 근거는
[auth-setup.md](../supabase/docs/auth-setup.md)에 표로 남겼다.

---

## 화면·부하 쪽 문제

### C1. 문장 하나 끝낼 때마다 요약 RPC가 한 번 더 나간다

[header-stats.tsx](../frontend/components/layout/header-stats.tsx):68의 effect 의존성이
`[sessionCount, localMonthlyScore]`다. 문장을 끝낼 때마다 `get_my_typing_summary`가 호출된다.

단어 모드는 점수 전송을 10개씩 묶었는데(좋다) 이 호출은 **단어 하나마다** 나간다.
1~2초에 한 번이다. 동시 사용자가 늘면 Supabase 요청 수가 여기서 제일 먼저 튄다.

낙관적 갱신이 이미 있으니(`localMonthlyScore`) 의존성에서 `sessionCount`를 빼고
10문장마다 또는 30초마다 맞추는 정도로 충분하다.

### C2. 단어 모드에서 이번 달 점수가 뒤로 갔다 온다

같은 파일 72번째 줄이 `summary?.monthly_score ?? localMonthlyScore`다.
단어 모드는 10개를 모아 보내므로 서버 값은 최대 9단어만큼 뒤처져 있고,
`summary`가 들어오면 그 값이 낙관적 갱신을 덮는다. 숫자가 올라갔다 내려간다.

C1을 고치면 호출 빈도가 낮아져 눈에 덜 띄지만, 근본은 서버 값과 로컬 값 중
**큰 쪽을 쓰는 것**이다(`Math.max`). 최고 CPM은 이미 그렇게 하고 있다.

### C3. 단어 모드를 중간에 벗어나면 모아둔 점수가 사라진다

[typing-workspace.tsx](../frontend/components/typing/typing-workspace.tsx):186이
모드·언어가 바뀔 때 배치를 **전송 없이 초기화**한다. 언마운트·탭 종료 시 flush도 없다.

10개를 채우기 전에 벗어나면 최대 9단어분 점수가 버려진다.
`flushSession`처럼 `visibilitychange`와 정리 함수에서 남은 배치를 보내면 된다.

### C4. 월이 바뀌어도 localStorage의 이번 달 점수는 그대로다

[use-ui-store.ts](../frontend/stores/use-ui-store.ts)가 `monthlyScore`를 달 구분 없이
persist한다. 8월 1일에 들어오면 7월 값이 먼저 보이고, 서버 응답이 오면 교체된다.
**비로그인 상태에서는 계속 7월 값이 보인다.**

저장할 때 `month_id`를 같이 넣고 달이 다르면 0으로 시작하면 된다. **미해결.**

### C6. ~~로그아웃해도 직전 계정의 기록이 헤더에 남는다~~ (수정 완료)

기록(`maxCpm`, `monthlyScore`, `lastRecord`)이 localStorage에 있고 로그아웃 시
지워지지 않아서, 헤더의 최고 CPM·이번 달 점수와 직전 문장이 다음 사람에게 그대로 보였다.
공용 PC라면 남의 기록이 노출된다.

`useUiStore.resetRecords()`를 추가하고 [preferences-sync.tsx](../frontend/components/settings/preferences-sync.tsx)에서
`SIGNED_OUT` 이벤트일 때만 호출한다. `INITIAL_SESSION`에도 세션이 없는 상태로 들어오므로
이벤트를 구분해야 한다 — 구분하지 않으면 비로그인 방문자의 기록이 방문마다 날아간다.
배경 같은 표시 설정은 계정과 무관하므로 지우지 않는다.

### C5. 긴 뉴스 본문이 어뷰징으로 잡힐 수 있다

[sentence-picker.ts](../frontend/features/content/sentence-picker.ts):198의 폴백
`cleanText(description)`은 **길이 제한이 없다.** 정상 경로는 80자 × 2문장으로 잘리지만
이 폴백만 통과하면 본문이 그대로 나온다.

600타를 넘기면 `IMPLAUSIBLE_SCORE`(심각도 3)가 붙고 점수도 0이 된다.
정직하게 다 친 사용자가 워치리스트에 올라간다. 폴백에도 같은 상한을 걸면 된다.

---

## D. 개발자 도구로 부정행위가 가능한 경로

콘솔에서 `supabase.rpc(...)`를 직접 부르면 화면을 거치지 않는다. 클라이언트에 있는
어떤 검사도 의미가 없다고 보고 서버만 놓고 봐야 한다.

### D1. ~~점수가 들어갈 달을 고를 수 있다~~ (0012에서 막음)

`p_month_id`를 서버가 `Asia/Seoul` 기준으로 정한다. 인자는 배포된 프론트엔드가
깨지지 않게 남겨두고 무시한다.

### D2. `p_score`를 검증할 방법이 없다 — 남은 가장 큰 구멍 (2026-07-28 섀도 검산 시작)

> **갱신** — 문장 이관이 끝나 `0024`에서 서버가 직접 타수를 계산하기 시작했다.
> 다만 아직 **섀도**다. 계산해서 `score_verifications`에 기록만 하고, 적립은
> 여전히 클라이언트 값이다. 포팅이 한 글자라도 틀리면 정직한 사용자 전원의
> 점수가 어긋나기 때문이다(1,478문장 × 옵션 16조합 = 23,648건 비교로 일치를
> 확인했지만, Postgres 위에서의 확인은 적용 후에 한다).
> 강제 전환 방법과 판단 기준은 `0024` 파일 맨 아래에 있다.
> **아래 본문은 섀도 이전의 기록이다.**

서버는 "이 점수가 실제 문장의 타수인지" 대조할 수 없다. **문장이 클라이언트의
`public/*.json`에 있어서 서버에는 원본이 없다.** 그래서 상한 검사(600타, 초당 20타,
시간당 6만)만으로 버티는 구조다.

상한 안쪽이면 아무 값이나 통과한다. 예를 들어 `p_score: 599, p_elapsed_ms: 30000`은
초당 20타이므로 물리적으로 가능한 값이라 그대로 적립된다.

**닫는 방법은 문장 DB 이관과 같은 작업이다.** 문장이 `sentences` 테이블에 있으면
클라이언트가 `sentence_id`를 보내고 서버가 그 문장의 타수를 직접 계산할 수 있다.
그러면 점수는 위조 불가능해진다. [NEXT-STEPS.md](NEXT-STEPS.md)의 남은 작업 2번이
사실상 이 구멍을 막는 작업이다.

무시 옵션(문장부호·숫자·영어 무시)이 타수를 줄이므로, 서버 계산으로 옮길 때는
그 옵션도 함께 받아 같은 규칙으로 계산해야 한다.

### D3. 시간당 상한은 타이트하다. 없는 것은 **일 상한**이다

먼저 단위 환산. **점수와 CPM은 다른 단위다.** 점수는 자모 단위 실제 타수,
CPM은 한글 1글자를 2타로 고정해 세고 공백도 1타로 센다.

`frontend/public/*.json`의 실제 문장으로 비율을 재봤다.

| 묶음 | 문장 수 | 평균 점수 | 평균 CPM타 | 비율 (점수 ÷ CPM타) |
|---|---|---|---|---|
| kor.json | 476 | 43.9 | 39.5 | 1.110 |
| kor_long.json | 123 | 204.9 | 191.5 | 1.070 |
| eng.json | 192 | 38.6 | 46.3 | 0.834 |
| eng_long.json | 42 | 143.8 | 171.6 | 0.838 |
| **가중 평균** | | | | **1.041** |

한글은 점수가 CPM보다 약 11% 높고, 영어는 오히려 17% 낮다 (영어는 공백이 CPM에는
1타로 잡히지만 점수에서는 0타라서).

**그래서 시간당 60,000점은 한글 단문 기준 약 900 CPM을 한 시간 동안 쉬지 않고
유지해야 나오는 값이다.** (전체 가중 평균으로는 961 CPM, 영어만 치면 1200 CPM)

| 지속 CPM | 1시간 점수 | 상한 대비 |
|---|---|---|
| 300 | 18,729 | 31% |
| 400 | 24,971 | 42% |
| 500 | 31,214 | 52% |
| 600 | 37,457 | 62% |
| 700 | 43,700 | 73% |
| 800 | 49,943 | 83% |
| 900 | 56,186 | 94% |

즉 **"사람이 아니다"의 기준선으로 시간당 상한은 잘 잡혀 있다.** 900 CPM을 1시간
무중단으로 유지하는 사람은 없다. 앞서 이 상한을 "너무 헐렁하다"고 적었던 것은
점수와 CPM을 같은 단위로 착각한 것이었다.

### D3-1. 상위 사용자의 실제 규모 (운영자 실측 기준)

원본 타입뉴스에서 **한 달 약 7,000점**을 달성하는 사용자가 있다. 구 기준은
단문 5문장 = 1점, 장문·뉴스 1문장 = 1점이므로 신 점수로 환산하면 이렇다.

| 주 모드 | 월 문장 수 | 신 점수 (월) | 하루 평균 | 필요 시간 (500 CPM) |
|---|---|---|---|---|
| 단문 | 35,000 | **1,536,000** | 49,600 | 하루 1.5시간 |
| 장문 | 7,000 | **1,435,000** | 46,300 | 하루 1.4시간 |
| 뉴스 | 7,000 | **2,072,000** | 66,800 | 하루 2.3시간 |

모드가 달라도 **월 140만~210만 점**으로 수렴한다. 필요 시간이 하루 1.4~2.3시간으로
나오는데, 실제로 그만큼 치는 사용자가 있다는 뜻이라 환산이 실측과 맞는다.

**점수 자릿수가 약 200배 커진다** (7,000 → 150만). 표시는 `formatScore`가
`1.53M`으로 줄여주므로 화면은 문제없다. `monthly_stats.score`는 integer(최대 21억)라
봇이 한 달을 돌려도(약 4,500만) 넘치지 않는다.

### D3-2. 일 상한은 두지 않기로 했다 (2026-07-27 결정)

봇은 타이핑을 하지 않으므로 시간당 최대치를 24시간 유지할 수 있다.

| | 하루 점수 |
|---|---|
| 봇 (시간당 상한을 24시간 유지) | **1,440,000** |
| 운영자 본인 실측: 단문 3,000문장/일 | **131,672** |
| 상위 사용자 추정 (구 7,000점 페이스) | 46,300 ~ 66,800 |

**일 상한을 두지 않는다.** 하루 3,000문장(500 CPM으로 4시간)을 치는 사용자가 실제로
있기 때문이다. 봇을 의미 있게 묶을 만큼 낮은 일 상한은 이런 몰아치기를 먼저 자른다.
몰아서 치는 것은 부정행위가 아니다.

월 상한도 같은 이유로 보류했다. 구 9,000점 기준으로 잡으면 2,700,000인데, 하루
3,000문장 페이스로 20.5일이면 도달해 그 뒤로 점수가 멈춘다.

### D3-3. 상한 대신 **패턴을 모아서 플래그**한다 (방향)

상한은 "넘으면 거절"이라 오탐의 대가가 크다. 정직한 사용자가 점수를 잃는다.
같은 정보를 **거절 없이 신호로만** 남기면 오탐이 나도 아무도 손해를 보지 않는다.
관리자가 판단해서 처리하면 된다. 워치리스트 UI는 이미 있다.

이 프로젝트에는 그 설계가 이미 있다. `typing_sessions`가 "행 수를 세션 수에만
비례시키고, 합계와 제곱합만 저장해 원시값 없이 평균·표준편차를 복원한다"는 구조다
([abuse-detection.md](../supabase/docs/abuse-detection.md)). 점수에도 같은 방식을 쓴다.

#### 새로 걷을 것은 없다

`typing_results`가 이미 문장마다 `score`, `elapsed_ms`, `mode`, `created_at`을
저장한다. **패턴 분석에 필요한 데이터는 지금도 쌓이고 있다.** 아래 쿼리는 그것을
읽기만 한다.

#### 부담은 실재한다 — 숫자로

행 하나가 인덱스까지 약 136바이트다.

| | 월 행 수 | 월 용량 |
|---|---|---|
| 단문 3,000/일 사용자 1명 | 90,000 | **12.2 MB** |
| 구 7,000점 사용자 1명 (단문) | 35,000 | 4.8 MB |
| 활성 100명 × 300문장/일 | 900,000 | **122 MB** |
| **일 집계로 롤업하면 (사용자당 하루 1행)** | 30 / 사용자 | **4 KB / 사용자** |

Supabase는 Free 500MB, Pro 8GB다. 활성 100명 규모면 Free는 4개월에 찬다.
**행 수 기준 3,000:1로 줄어든다.**

#### 순서

1. **지금 (코드 변경 없음)** — 이미 쌓인 데이터로 분포를 본다. 상한이든 플래그든
   숫자는 여기서 나온다
2. **커트오버 후** — 일 집계 테이블 + 원시행 보존기간(예: 90일). 집계가 남으므로
   원시행을 지워도 패턴 이력은 영구 보존된다
3. **분포가 쌓인 뒤** — 이상치 플래그 룰. "자기 30일 중앙값의 N배 + 전체 상위 N%"
   같은 조건으로 심각도 2 신호만 남긴다. 점수는 그대로 준다

#### 선행 조건은 갖췄다 (0013)

거절하지 않고 플래그만 하는 방식은 **잡은 뒤에 점수를 취소할 수 있어야** 의미가 있다.
`adjust_monthly_score`와 관리자 화면 "조정" 버튼이 그 역할을 한다 (B2).
이제 8월은 **"상한 없음 + 탐지 + 잡으면 조정"** 조합으로 갈 수 있고, 상한 숫자는
실제 분포가 쌓인 뒤에 정하면 된다.

#### 분포 확인 쿼리

```sql
-- 사용자별 하루 적립량 상위. 상한/플래그 기준의 출발점.
select profile_id,
       date_trunc('day', created_at at time zone 'Asia/Seoul')::date as day_kst,
       count(*) as submissions,
       sum(score) as daily_score,
       max(score) as max_one,
       round(avg(score), 1) as avg_one
from typing_results
group by 1, 2
order by daily_score desc
limit 30;

-- 시간당 적립량 상위. 60,000에 얼마나 근접하는지.
select profile_id, date_trunc('hour', created_at) as h, sum(score) as hourly
from typing_results group by 1, 2 order by hourly desc limit 20;

-- 전체 분포 (백분위). 플래그 임계값을 여기서 뽑는다.
select
  percentile_cont(0.50) within group (order by daily) as p50,
  percentile_cont(0.90) within group (order by daily) as p90,
  percentile_cont(0.99) within group (order by daily) as p99,
  max(daily) as max
from (
  select profile_id, date_trunc('day', created_at at time zone 'Asia/Seoul') as d, sum(score) as daily
  from typing_results group by 1, 2
) t;

-- 현재 typing_results 용량 (부담이 실제로 얼마인지)
select count(*) as rows,
       pg_size_pretty(pg_total_relation_size('public.typing_results')) as size,
       min(created_at)::date as since
from typing_results;
```

### D3-3. 시간당 상한은 최상위 고수에게는 여유가 크지 않다

상한은 최근 1시간 합계를 보므로 **지속 속도**가 중요하다.

| 지속 CPM | 시간당 점수 | 상한(60,000) 대비 |
|---|---|---|
| 500 | 32,109 | 54% |
| 600 | 38,531 | 64% |
| 700 | 44,953 | 75% |
| 800 | 51,375 | 86% |
| 900 | 57,797 | **96%** |

실제 상위 사용자는 400~600 CPM대로 추정되어(위 표의 필요 시간 기준) 54~64%다.
안전하다. 다만 **800 CPM 이상을 한 시간 유지하는 사용자가 있으면 상한에 닿는다.**

걸렸을 때의 결과가 가볍지 않다. 점수가 반영되지 않고 `HOURLY_SCORE_CAP` 심각도 3
신호까지 붙는다. **경품을 받을 가능성이 가장 높은 사람이 오탐 대상이 된다.**
일 상한을 추가할 때 시간당 상한을 80,000 정도로 올려 이 위험을 없애는 것도 방법이다.
(일 상한이 있으면 시간당 상한을 느슨하게 둬도 총량이 묶인다)

실측 확인용 쿼리:

```sql
-- 시간당 최고 적립량. 60,000에 얼마나 근접하는지 본다.
select profile_id, date_trunc('hour', created_at) as h, sum(score) as hourly
from typing_results group by 1, 2 order by hourly desc limit 20;

-- 사용자별 하루 최고 적립량. 일 상한을 정하는 근거.
select profile_id, date_trunc('day', created_at at time zone 'Asia/Seoul') as d, sum(score) as daily
from typing_results group by 1, 2 order by daily desc limit 20;
```

### D4. 콘솔 직접 호출은 클라이언트 탐지를 전부 우회한다

`behaviorTracker`가 모으는 IME 조합 횟수·키 이벤트 수·붙여넣기 시도 같은 신호는
전부 클라이언트가 만들어 보낸다. RPC를 직접 부르면 세션 보고를 아예 안 하거나
그럴듯한 값을 지어낼 수 있다.

서버만으로 판정하는 룰은 `UNIFORM_SUBMIT_INTERVAL`(최근 2시간 제출 간격의 변동계수)
하나뿐이다. 제출 간격에 난수를 섞으면 이것도 피한다.

구조적 한계이고, 실질적 해법은 D2(서버가 점수를 계산)다.

### D5. ~~같은 제출을 무한히 재전송할 수 있다~~ (`0028`에서 막음)

멱등성 키가 없다. 같은 `(score, mode, elapsed_ms)`를 반복해 보내도 상한에 걸릴 때까지
계속 적립된다. D2를 하면 "같은 문장을 연달아 몇 번 보냈나"로 판정할 근거가 생긴다.

> **갱신 2026-07-28** — `0028`에서 `typing_results.submission_key`에 부분 유니크를
> 걸고, `record_typing_result`가 같은 키를 조용히 넘기게 했다.
> 같은 장치가 **점수 재전송 큐**의 전제이기도 하다 — 서버가 중복을 알아보지 못하면
> 재시도 자체를 만들 수 없다. 큐는 `features/scoring/score-outbox.ts`.

### D6. 테이블 직접 쓰기는 막혀 있다 (확인함)

`typing_results`·`monthly_stats`에 INSERT/UPDATE 정책이 없어서 RLS가 거절한다.
0012에서 SQL 권한 자체도 걷어냈다. 자세한 건 아래 E3.

### D7. `role`을 스스로 admin으로 바꿀 수 없다 (확인함)

`profiles`에 UPDATE 정책이 없다. 0005에서 위험했던 정책을 명시적으로 제거했고
환경설정은 화이트리스트 RPC로만 저장된다.

---

## E. 개인정보 · 보안

### E1. 이메일 노출 경로는 닫혀 있다 (확인함)

비로그인(`anon`)이 받을 수 있는 것은 이 셋뿐이다.

| 대상 | 내용 |
|---|---|
| `get_monthly_ranking()` | `profile_id`, `display_name`, `score` |
| `sentences` select | 문장 본문 |
| `event_prizes` select | 경품 정보 |

**이메일이 나가는 경로가 없다.** 원본 타입뉴스의 문제는 랭킹에 이메일이 함께 실려
나가던 것이었는데, 새 구조의 랭킹 함수는 이메일 컬럼을 아예 선택하지 않는다.

이메일을 돌려주는 함수는 `get_abuse_watchlist`와 `get_admin_users` 둘뿐이고,
둘 다 본문에서 `public.is_admin()`을 확인한다. 관리자가 아니면 0행이 온다.

`profiles`는 `profiles_select_own` 정책(`supabase_user_id = auth.uid()`)이라
남의 프로필을 읽을 수 없다. 랭킹에 `profile_id`가 노출되지만 그것으로 프로필을
조회할 수는 없다.

### E2. 이메일 사본이 두 곳에 더 있다

`monthly_stats`에 `email` 컬럼과 `raw_data`(Firestore 원본 문서 통째)가 있다.
`scripts/migrate_to_supabase.py`가 이관할 때 넣은 것이고, `raw_data` 안에도 이메일이
들어 있다.

RLS가 본인 행만 열어주므로 지금 새는 것은 아니다. 다만 **필요 없는 사본이다.**
랭킹은 `score`와 `nickname`만 쓴다. 이관 검증이 끝났으면 정리하는 것이 맞다.

```sql
-- 이관 검증이 끝난 뒤에. 되돌릴 수 없으니 백업 확인 먼저.
-- update monthly_stats set raw_data = '{}'::jsonb, email = null;
```

`suspicious_records.record_data`에도 이관 당시의 이메일과 문장이 들어 있다.

### E3. 0001 테이블의 쓰기 권한이 authenticated에 남아 있었다 (0012에서 정리)

Supabase는 `public` 스키마의 기본 권한으로 새 테이블에 `anon`·`authenticated`에게
ALL을 준다. 0009와 0003은 `revoke all ... from anon, authenticated`로 걷어냈지만,
**0001은 `anon`에서만 걷어냈다.**

즉 `profiles`·`monthly_stats`·`typing_results`·`suspicious_records`에 대해
authenticated가 INSERT/UPDATE/DELETE 권한을 들고 있었고, 막고 있던 것은 RLS 정책이
없다는 사실 하나뿐이었다. 누군가 실수로 `for all using (true)` 정책을 붙이면
그 순간 점수를 직접 쓸 수 있게 된다.

0012에서 권한을 명시적으로 회수했다. 쓰기는 전부 security definer 함수를 통하고
그 함수는 소유자 권한으로 돌기 때문에 영향이 없다.

### E4. RSS 본문을 innerHTML로 붙이고 있었다 (수정함, 0033 준비에서 서버 파싱으로 교체)

`extractSummary()`가 SBS의 `content:encoded`를 `div.innerHTML`에 넣었다.
문서에 붙이지 않은 요소라도 `<img onerror>`는 실행될 수 있다. 남의 피드가 우리 페이지
안에서 코드를 실행할 수 있는 상태였다.

처음에는 inert한 `DOMParser` 문서로 바꿨고, 단어·뉴스 점수 강제 작업에서는 RSS 파싱과
본문 정규화 자체를 `/api/news` 서버 라우트로 옮겼다. 브라우저는 서버가 만든 일반 문자열과
검산 원문 UUID만 받으므로 외부 HTML을 파싱하지 않는다.

### E5. ~~RSS 프록시는 두 호스트에 대해 열린 프록시다~~ (수정함)

[/api/rss](../frontend/app/api/rss/route.ts)와 새 `/api/news`가 공통 정책을 쓴다.
SBS는 허용된 섹션 ID와 두 RSS 경로만, BBC는 뉴스 RSS 경로만 허용하며 임의 쿼리는
거절한다. 선언된 크기와 실제 본문 모두 2MB 상한을 검사한다.

### E6. 관리자 잠금은 무제한으로 시도할 수 있다

`/api/admin/unlock`에 시도 횟수 제한이 없다. 다만 이건 오조작 방지용 잠금이고
통과해도 관리자 프로필이 아니면 RLS가 전부 막는다. 실질 위험은 없다.

---

## 확인했고 문제 없는 것

| 항목 | 결과 |
|---|---|
| 월 초기화 | `monthly_stats(profile_id, month_id)` 구조라 **자동이다.** 초기화 작업(cron 등) 불필요 |
| 월 경계 시각 | 제출 시점에 `Asia/Seoul` 기준으로 계산한다. 탭을 열어둔 채 자정을 넘겨도 새 달로 들어간다 |
| 랭킹 동시성 | `on conflict do update set score = score + p_score` — 원자적이다 |
| 점수 직접 조작 | `typing_results`·`monthly_stats`에 INSERT/UPDATE grant가 없다. security definer RPC로만 쓸 수 있다 |
| 권한 상승 | 위험했던 `profiles_update_own_preferences` 정책을 [0005](../supabase/migrations/0005_user_preferences.sql):13에서 제거했다. `role` 자가 변경 불가 |
| 환경설정 저장 | 화이트리스트 방식이라 임의 키가 프로필에 쌓이지 않는다 |
| 탐지 신호 중복 | `raise_abuse_signal`이 `is not distinct from`으로 null 세션까지 맞추고 unique_violation도 잡는다 |
| 세션 텔레메트리 | 누적 스냅샷 + `greatest()` 덮어쓰기라 재전송·중복에 안전하다. RPC 인자 이름도 클라이언트와 일치 |
| CPM 공식 | 이관된 `max_cpm`과 비교 가능하도록 옛 공식(한글 2타 고정)을 유지하고 있다 |
| 랭킹 표시 이름 | `ms.nickname` → `p.display_name` → `익명` 순. 닉네임을 바꾸면 이번 달 표시도 함께 갱신된다 |

---

## 데이터 확인 필요 (SELECT를 돌리지 못했다)

커트오버 전에 Supabase SQL 편집기에서 직접 볼 것.

```sql
-- 1) 8월에 미리 쌓인 점수가 있는지 (A1 악용 흔적)
select month_id, count(*), max(score), sum(score)
from monthly_stats group by month_id order by month_id desc;

-- 2) 7월에 두 기준(문장 수 / 타수)이 섞여 있는지
select month_id, count(*) from typing_results group by month_id;

-- 3) email 없는 프로필이 아직 19명인지
select count(*) from profiles where email is null;

-- 4) 닉네임 중복 (유니크 인덱스가 없다. 이관 데이터에 중복이 있을 수 있다)
select display_name_lower, count(*) from profiles
where display_name_lower is not null
group by 1 having count(*) > 1;

-- 5) 미검토 어뷰징 신호
select rule_code, count(*), max(severity) from abuse_signals
where reviewed_at is null group by 1 order by 2 desc;

-- 6) typing_results 증가 속도 (보존 정책 판단용)
select count(*), min(created_at), max(created_at) from typing_results;
```

`display_name_lower`에 **유니크 인덱스가 없다.** `update_my_display_name`이 조회 후 삽입하는
방식이라 동시 요청이면 같은 닉네임이 둘 생길 수 있다. 4번 결과가 비어 있으면
유니크 인덱스를 걸어두는 것이 좋다.

---

## 커트오버 순서 (8/1 00:00 KST)

### 완료

- ✅ Redirect URLs에 `https://typenews.kr/**` 추가 (A2)
- ✅ Production의 `NEXT_PUBLIC_SITE_URL` 삭제 (A3)
- ✅ `ADMIN_PANEL_PASSWORD` 등록
- ✅ `metadataBase` 설정 (A4)

### 남은 것

> 2026-07-28 기준으로 갱신했다. `0011`~`0022`는 이미 적용됐다.

1. **`www.typenews.kr`을 함께 서비스하는지 확인.** 한다면 Redirect URLs에 추가 (A2)
2. **마이그레이션 적용** — `0023` → `0024` → `0025` → `0026` 순서대로
   Supabase SQL Editor에 붙여넣는다. (`0025`는 pg_cron 확장을 먼저 켜야 하고,
   `0026`은 `0024`가 만든 표를 참조한다.)
3. **`0024` 적용 직후** — `node scripts/verify-score-port.mjs`로 서버와
   클라이언트의 점수 계산이 같은지 확인. 불일치가 있으면 넘어가지 않는다
4. **환경변수 등록** — `BREVO_API_KEY`, `BREVO_SENDER_EMAIL`(단일 발신자 인증 완료된
   주소), `BREVO_SENDER_NAME`. 없으면 메일 발송 버튼만 동작하지 않고 나머지는 그대로다
5. **프론트엔드 배포** — `cd frontend && npx vercel --prod`.
   배포 전에 `next dev`를 끄고 할 것 (같은 `.next`를 쓰면 낡은 CSS가 남는다)
6. **B1 마감 시각** — 말일 23:59 마감 / 1일 00:00 자동 추첨.
   `0025`가 등록되면 자동으로 돌지만, **8월 1일 첫 추첨은 관리자 화면에서 직접
   실행하고 결과를 눈으로 확인할 것.** 자동화는 9월부터 믿는다
7. **7/31 23:00** — 아래 SELECT를 떠서 7월 최종 상태를 기록으로 남긴다.
   특히 `202608`에 미리 쌓인 점수가 있는지 확인
8. **8/1 00:00** — 도메인 전환. ⚠️ **원래 계획이던 "Supabase Site URL을
   `https://typenews.kr`로 변경"은 그대로 실행할 수 없다.** `typenews.kr`의 DNS를
   통제하지 못한다는 것이 그 뒤에 드러났다. 어느 주소로 서비스할지 먼저 정하고
   (SESSION 문서 "4. 도메인"), 정해진 주소에 맞춰 Site URL을 바꾼다.
   점수 기준이 달라지므로 월 중간은 안 된다
9. **전환 직후** — 시크릿 창에서 새 주소로 로그인 → 이번 달 점수 0 확인
   → 문장 하나 완료 → 랭킹에 반영되는지 확인
10. **8/1 중** — `monthly_stats`에 `202608` 행이 정상으로 생기는지 확인,
    `score_verifications`에 `checked`가 쌓이기 시작하는지 확인

기존 사용자는 전환 시점에 전부 로그아웃된다 (A0). 공지 여부를 판단할 것.
