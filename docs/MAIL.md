# 당첨 안내 메일 세팅

`0036` 적용은 끝났다. 여기서부터는 **Brevo·DNS·Vercel 설정**이라 코드가 아니라 손으로 한다.

## 세팅 완료 (2026-07-29)

**메일 자동 발송은 켜져 있고 동작 가능한 상태다.** 아래 1~8단계는 전부 끝났다.
남은 것은 `draws_enabled`뿐이고 그것은 운영 전환 때 켠다.

| | |
|---|---|
| `0036` 함수 넷 | ✅ 있음 |
| DNS 인증 레코드 4개 | ✅ 전부 확인 (`check-mail-dns.ps1`) |
| Vercel 환경변수 5개 | ✅ 전부 등록 |
| Vercel 배포 · Cron 등록 | ✅ 크론 라우트 살아 있음, 무인증 401 |
| 실제 발신 테스트 | ✅ 받은편지함 도착, `타입뉴스 <noreply@typenews.kr>`, **주소 푸터 없음** |
| `CRON_SECRET` 재발급 | ✅ 옛 값으로 호출하면 401 |
| **`winner_mail_enabled`** | ✅ **true (자동 발송 켜짐)** |
| `draws_enabled` | **false (추첨 잠금)** ← 운영 전환 때 켠다 |
| pending 당첨자 | 0명 |

⚠️ **`draws_enabled`가 꺼져 있으면 당첨자가 생기지 않으므로 메일도 나가지 않는다.**
메일이 안 온다고 메일 설정을 뒤지기 전에 이 플래그부터 볼 것.

⚠️ 두 플래그는 **한 표의 다른 컬럼**이다. UPDATE 문을 복사할 때 컬럼 이름을
반드시 확인할 것. 2026-07-29에 실제로 `draws_enabled`를 잘못 켠 적이 있다.

---

## 순서 한눈에

```
1. Brevo 가입                     10분
2. 도메인 인증 (DNS 4줄)          15분 + 전파 대기
3. API 키 발급                     2분
4. Vercel 환경변수 5개             5분
5. 배포                            3분
6. 발신 테스트 (Brevo 직접)        2분   ← 여기서 도달률을 확인한다
7. 크론 라우트 스모크 테스트       1분
8. 스위치 켜기                     10초
```

**6번까지 끝내고 실제 수신을 확인한 뒤에 8번을 한다.** 순서를 건너뛰면 당첨자에게
안 가는 메일을 "보냈다"고 표시해버린다.

---

## 1. Brevo 가입

[brevo.com](https://www.brevo.com) 가입. 무료 플랜이 **하루 300통**이라 우리 용도
(월 3~10통)에는 넉넉하다. 신용카드 필요 없다.

### 회사명·주소를 물어보는데 — 개인도 그냥 쓰면 된다

Brevo에 "개인 플랜"이 따로 있는 것이 아니다. **무료 플랜이 곧 개인용 진입 플랜**이고,
회사명·주소 칸은 요금제가 아니라 계정 정보다. 사업자등록번호는 묻지 않는다.

| 칸 | 넣을 것 |
|---|---|
| Company name | `타입뉴스` (또는 본인 이름) |
| Address | 실제 거주지. 사서함도 된다 |
| Website | `https://typenews.kr` |
| Number of contacts / team | 가장 작은 구간 |
| "Do you sell products online?" | 아니오 |

왜 받느냐 — 상업성 메일에 발신자의 물리적 주소를 넣도록 하는 법(미국 CAN-SPAM 등)
때문에 메일 서비스들이 계정 단위로 주소를 받아둔다. 발신자를 검증해 스팸 발송을
거르는 목적도 있다.

⚠️ **그 주소가 메일에 찍히는지는 별개 문제다.** 주소 푸터가 붙는 것은 보통
**마케팅 캠페인**이고, 우리가 쓰는 것은 트랜잭션 API(`v3/smtp/email`)다.
당첨 안내는 이벤트에 응모한 사람에게 보내는 거래성 안내라 광고성 정보로 보지 않는다.
**확실한 것은 6번 테스트 발송에서 눈으로 확인하는 것이다** — 받은 메일 하단에
주소가 붙는지 보면 된다. 붙는다면 그때 다른 서비스(Resend 등)로 옮기면 되고,
발송 코드는 `lib/mail/brevo.ts` 한 파일이라 교체 비용이 작다.

### 계정 검토

가입 직후에는 발송이 잠겨 있을 수 있다. Brevo가 계정을 검토하는 절차인데,
용도를 적으면 보통 하루 안에 풀린다. **8월 1일 직전에 시작하지 말 것.**

---

## 2. 도메인 인증 — DNS 4줄

### 어디에 있나

**우측 상단 계정 이름(드롭다운) → Settings → Senders, Domains, IPs → Domains 탭**
→ **Add a domain** → `typenews.kr` → **Authenticate**

- 좌측 사이드바가 아니라 **우측 상단 계정 메뉴** 안이다. 톱니바퀴로 보이기도 한다
- 메뉴 이름이 바뀌었다. 예전 이름 "Senders, Domains **& Dedicated IPs**"로 찾으면 없다
- 같은 화면의 **Senders** 탭은 개인 메일 주소 하나만 인증하는 예전 방식이다.
  도메인이 있는 지금은 **Domains** 탭이 맞다
- 바로 가기: `https://app.brevo.com/senders/domain/list`

### 화면에 레코드가 7개 뜨는데 4개만 넣으면 된다

Brevo가 보여주는 목록과 우리가 넣을 것.

| 항목 | 넣나 | 무엇인가 |
|---|---|---|
| **Brevo code** | ✅ 필수 | 이 도메인이 우리 것임을 증명 |
| **DKIM 1 record** | ✅ 필수 | 메일 서명 |
| **DKIM 2 record** | ✅ 필수 | 서명 키 교체용. 둘 다 있어야 인증된다 |
| **DMARC record** | ✅ 필수 | 인증 정책 |
| Branded record | ⬜ 선택 | 추적·반송 주소를 우리 도메인으로 바꾸는 브랜딩 |
| Image Redirection Record | ⬜ 선택 | 이미지·열람 추적을 우리 도메인으로 |
| Redirection Record | ⬜ 선택 | 링크 클릭 추적을 우리 도메인으로 |

아래 셋은 **Branded Domain** 기능이다. 메일 안의 추적 링크와 이미지 주소를 Brevo
도메인 대신 `typenews.kr`로 보이게 하는 것이라 인증·발송에는 필요 없다.

**특히 우리에게는 쓸모가 없다.** 당첨 안내는 `textContent` 평문이라
**링크도 이미지도 추적 픽셀도 없다.** 브랜딩할 대상 자체가 없다.
나중에 HTML 캠페인을 보내게 되면 그때 추가하면 된다. 순서 제약은 없다.

**SPF와 MX는 아예 목록에 없거나 있어도 넣지 않는다** — 전용 IP를 쓸 때만 필요하다.

⚠️ **DKIM은 계정에 따라 TXT 1개 또는 CNAME 2개로 나온다.**
CNAME 2개(DKIM 1 / DKIM 2)로 나왔다면 가비아에서도 타입을 **CNAME**으로 골라야 한다.
호스트·값은 **화면에 나온 것을 그대로** 쓴다. 계정마다 다르므로 이 문서의 예시를
베끼면 안 된다.

각 레코드 옆의 **Required / Optional** 표시가 이 문서보다 정확하다.
**Verify를 눌러 필수 항목만 초록색이 되면 인증은 끝난 것이고**, 선택 항목이
회색으로 남아 있어도 발송에는 지장이 없다.

### Brevo 쪽 — 화면 순서

1. **Domains** 탭에서 **Add a domain**
2. `typenews.kr` 입력 (`https://`나 `www.` 없이 도메인만) → 다음
3. 설정 방식을 물으면 **Manual configuration**(수동)을 고른다.
   가비아는 자동 연동 대상이 아니다
4. 레코드 3개가 표로 뜬다. 각 줄에 **복사 버튼**이 있다.
   **이 창을 닫지 말고** 다른 탭에서 가비아를 연다
5. 아래 가비아 작업을 끝낸 뒤 이 화면으로 돌아와 **Verify / Authenticate** 를 누른다

### 가비아 쪽 — 화면 순서

1. [가비아](https://www.gabia.com) 로그인 → **My가비아**
2. **서비스 관리 → 도메인** → `typenews.kr` 오른쪽 **관리** 또는 **DNS 관리**
3. **DNS 정보 → DNS 관리 → 설정**
4. 지금 있는 레코드 목록이 보인다. `A / @ / 199.36.158.100`,
   `TXT / @ / hosting-site=typenews-dbe9c`, `CNAME / www / typenews.kr`
5. **레코드 추가**를 눌러 한 줄씩 넣는다

| 가비아 칸 | Brevo code | DKIM 1 · DKIM 2 | DMARC |
|---|---|---|---|
| 타입 | `TXT` | **화면 그대로** (CNAME이면 CNAME) | `TXT` |
| 호스트 | 화면 그대로 (보통 `@`) | **화면 그대로** | `_dmarc` |
| 값/위치 | `brevo-code:...` | **화면 그대로** | `v=DMARC1; p=none; ...` |
| TTL | `300` | `300` | `300` |

6. 네 줄을 다 넣고 **저장 / 적용**을 누른다

**CNAME 값은 반드시 점(`.`)으로 끝나야 한다.** 가비아가 요구한다.

```
xxxxx.dkim.brevo.com     →  xxxxx.dkim.brevo.com.
```

점이 없으면 가비아가 뒤에 `typenews.kr`을 붙여 `xxxxx.dkim.brevo.com.typenews.kr`이
된다. TXT 값에는 붙이지 않는다. 호스트 칸에도 붙이지 않는다.
복사한 값이 이미 점으로 끝나 있으면 그대로 둔다.

**TTL은 설정하는 동안 `300`으로 둔다.** 값을 잘못 넣으면 고친 값이 퍼지는 데
TTL만큼 걸린다. `3600`이면 오타 하나에 한 시간을 기다렸다 Verify를 다시 눌러야 한다.
**인증이 초록색이 된 뒤에 `3600`으로 올린다** — 이 레코드들은 그 뒤로 거의 안 바뀐다.
가비아가 `300`을 받지 않으면 고를 수 있는 가장 작은 값으로 한다.

⚠️ **주의 다섯**

1. **기존 TXT를 지우지 말 것.** `hosting-site=typenews-dbe9c`는 Firebase Hosting
   소유 확인용이다. TXT는 같은 호스트에 여러 개가 공존하므로 **추가**만 한다.
   덮어쓰면 Firebase로 되돌아갈 길이 막힌다
2. **호스트에 도메인을 붙이지 말 것.** `mail._domainkey.typenews.kr`이 아니라
   `mail._domainkey`다. 가비아가 뒤에 도메인을 자동으로 붙인다.
   (붙여서 넣으면 `mail._domainkey.typenews.kr.typenews.kr`이 된다)
3. **값에 큰따옴표를 넣지 말 것.** 어떤 문서는 `"v=DMARC1..."`처럼 따옴표를 보여주는데
   가비아 입력칸에는 따옴표 없이 안쪽 내용만 넣는다
4. **DKIM 값은 아주 길다.** 복사할 때 끝이 잘리지 않았는지 확인한다.
   앞뒤 공백이나 줄바꿈이 섞이면 인증에 실패한다
5. **DMARC는 도메인당 하나만 둔다.** 이미 `_dmarc`가 있으면 새로 만들지 말고 고친다.
   그리고 **`p=none`으로 시작한다** — 처음부터 `p=reject`면 설정이 조금만 어긋나도
   메일이 전부 반송된다. 몇 주 지켜본 뒤에 올린다

### 확인

호스트 이름을 외울 필요 없이 스크립트가 후보를 훑는다.

```powershell
.\scripts\check-mail-dns.ps1
```

루트 TXT에는 `hosting-site=...`와 `brevo-code:...`가 **둘 다** 보여야 한다.
하나만 보이면 덮어쓴 것이다.

DKIM 값이 여러 줄로 나오는 것은 **정상**이다. CNAME 체인을 따라간 것이라
`brevo1._domainkey` → `b1....dkim.brevo.com` → `brevo5.dkim.brevo.com` 순으로
가서 마지막에 실제 키(`k=rsa;p=...`)가 나온다. **키까지 나오면 끝까지 연결된 것이다.**
값 끝에 `.typenews.kr`이 덧붙어 있으면 CNAME 값의 점을 빠뜨린 것이다.

2026-07-29 확인 결과 (참고용 — 값은 계정마다 다르다)

```
brevo-code:41ce517b...                          ✅
hosting-site=typenews-dbe9c                     ✅ (Firebase 것, 살아 있음)
_dmarc  v=DMARC1; p=none; rua=mailto:rua@dmarc.brevo.com   ✅
brevo1._domainkey → b1.typenews-kr.dkim.brevo.com → k=rsa;p=...  ✅
brevo2._domainkey → b2.typenews-kr.dkim.brevo.com → k=rsa;p=...  ✅
```

Brevo 화면의 **Verify**가 초록색이 되면 끝이다. 전파에 최대 TTL(현재 1800초)만큼
걸리니 바로 안 되면 30분 뒤에 다시 누른다.

### 인증 후

도메인이 인증되면 `@typenews.kr`의 아무 주소로나 보낼 수 있다.
그래도 발송이 "sender not valid"로 거절되면 같은 화면의 **Senders** 탭에서
`noreply@typenews.kr`을 추가한다.

---

## 3. API 키

Brevo → 우측 상단 계정 → **SMTP & API** → **API Keys** → **Generate a new API key**

이름은 아무거나(`typenews-vercel`). **한 번만 보여주므로 그 자리에서 복사한다.**

---

## 4. Vercel 환경변수

Vercel → 프로젝트 → **Settings → Environment Variables**.
전부 **Production**에 넣는다(원하면 Preview도).

| 이름 | 값 |
|---|---|
| `BREVO_API_KEY` | 3번에서 받은 키 |
| `BREVO_SENDER_EMAIL` | `noreply@typenews.kr` |
| `BREVO_SENDER_NAME` | `타입뉴스` |
| `CRON_SECRET` | 아래에서 만든 무작위 문자열 |
| `SUPABASE_SERVICE_ROLE_KEY` | Supabase → Settings → API의 `service_role` 키 |

`CRON_SECRET` 만들기 (아무 값이나 되지만 길고 무작위여야 한다):

```powershell
-join ((1..32) | ForEach-Object { '{0:x2}' -f (Get-Random -Max 256) })
```

⚠️ **다섯 개 모두 `NEXT_PUBLIC_`을 붙이면 안 된다.** 붙이는 순간 브라우저 번들에
값이 들어가고, `BREVO_API_KEY`가 새면 누구든 우리 이름으로 메일을 보낼 수 있다.
`SUPABASE_SERVICE_ROLE_KEY`가 새면 DB 전체가 열린다.

> `CRON_SECRET`은 Vercel이 알아서 쓴다. 이 이름으로 등록해두면 크론이 라우트를
> 부를 때 `Authorization: Bearer <값>` 헤더에 실어 보낸다. 우리 라우트는 그것을
> 대조한다. 없으면 503을 돌려주고 **한 통도 보내지 않는다.**

---

## 5. 배포

```bash
cd frontend && npx vercel --prod
```

`frontend/vercel.json`의 크론은 **배포할 때 등록된다.** 배포 후
Vercel → 프로젝트 → **Settings → Cron Jobs**에 아래가 보여야 한다.

```
/api/cron/send-winner-mails    30 15 * * *
```

`30 15 * * *`는 UTC라 **00:30 KST**다. 추첨(00:00)과 무응답 재추첨(00:05)이
모두 끝난 뒤다.

> Hobby 플랜은 크론이 **하루 한 번**이고 시각이 대략적이다(그 시간대 안에서 실행).
> Pro면 `vercel.json`의 `schedule`을 `*/15 * * * *`로 바꿔 15분마다 돌 수 있다.
> 크론은 **Production 배포에서만** 돈다.

---

## 6. 발신 테스트 — 가장 중요한 단계

**우리 앱을 거치지 않고 Brevo만 시험한다.** 이렇게 해야 문제가 생겼을 때
"Brevo 설정 문제"인지 "우리 코드 문제"인지 바로 갈린다.

⚠️ PowerShell에서 `curl`은 `Invoke-WebRequest`의 별칭이라 `-i`가 `-InFile`로
해석되어 실패한다. **`curl.exe`라고 쓰거나** 아래 PowerShell 버전을 쓴다.

```powershell
$body = @{
  sender      = @{ name = "타입뉴스"; email = "noreply@typenews.kr" }
  to          = @(@{ email = "recipient@example.com" })
  subject     = "타입뉴스 발신 테스트"
  textContent = "받은편지함에 도착했다면 도메인 인증까지 끝난 것입니다."
} | ConvertTo-Json -Depth 5

Invoke-RestMethod -Uri "https://api.brevo.com/v3/smtp/email" -Method Post `
  -Headers @{ "api-key" = "여기에_API_키"; "content-type" = "application/json" } `
  -Body ([System.Text.Encoding]::UTF8.GetBytes($body))
```

`-Body`에 바이트 배열을 넘기는 이유는, 문자열로 주면 PowerShell 5.1이 UTF-8로
보내지 않아 한글이 깨지기 때문이다.

확인할 것

- [ ] `{"messageId":"..."}` 가 돌아오는가 (실패하면 여기서 키·발신주소 문제)
- [ ] **받은편지함**에 왔는가, 아니면 **스팸함**인가
- [ ] 보낸 사람이 `타입뉴스 <noreply@typenews.kr>`로 보이는가
- [ ] Gmail에서 메일 → 점 세 개 → **원본 보기** → `SPF: PASS`, `DKIM: PASS`
- [ ] **본문 아래에 가입할 때 넣은 주소가 붙어 있는가** — 트랜잭션 메일에는
      안 붙는 것이 정상이다. 붙어 있다면 당첨자에게 집 주소가 나가는 것이므로
      다른 서비스로 옮길지 판단한다 (1번 참고)

**스팸함에 갔다면 8번(스위치 켜기)으로 넘어가지 말 것.** 당첨자 절반이 못 받는다.
DKIM/SPF가 PASS인지 먼저 확인하고, PASS인데도 스팸이면 며칠 발송 이력이 쌓이면서
좋아진다. 그동안은 수동 발송으로 버틴다.

---

## 7. 크론 라우트 스모크 테스트

지금은 pending 당첨자가 0명이라 **메일이 나가지 않는다.** 라우트가 살아 있는지만 본다.

```powershell
curl.exe -s -i -H "Authorization: Bearer 여기에_CRON_SECRET" https://typenews-vercel.vercel.app/api/cron/send-winner-mails
```

⚠️ `curl`이 아니라 **`curl.exe`** 다. PowerShell에서 `curl`은 `Invoke-WebRequest`의
별칭이라 `-i`가 `-InFile`로 해석되어 실패한다.

| 응답 | 뜻 |
|---|---|
| `{"ok":true,"sent":0,"failed":0}` | 정상. 보낼 사람이 없거나 스위치가 꺼져 있다 |
| `401` | `CRON_SECRET`이 다르다 |
| `503 CRON_SECRET이 설정되지 않았습니다` | Vercel 환경변수 누락 또는 재배포 안 함 |
| `503 BREVO_API_KEY...` | Brevo 환경변수 누락 |

헤더 없이 부르면 401이 나와야 한다. **그것도 확인할 것** — 아무나 부를 수 있으면 안 된다.

> 2026-07-29 확인: 인증 없이 401, 틀린 토큰으로 401, 올바른 토큰으로
> `{"ok":true,"sent":0,"failed":0}`. **환경변수 다섯 개가 모두 등록된 상태다** —
> 이 응답이 나오려면 인증 → Brevo 설정 확인 → service_role RPC 호출까지 다 통과해야 한다.

⚠️ **`CRON_SECRET`을 어딘가에 붙여넣었다면 새로 발급할 것.** 이 값을 아는 사람은
발송을 임의로 트리거할 수 있다. 자동 발송을 켜기 전에 바꾸고 재배포한다.

---

## 8. 스위치 켜기

6번에서 실제 수신을 확인했고 7번이 `ok:true`면 이제 켠다.
**Supabase 대시보드 → 좌측 사이드바 → SQL Editor.**

```sql
update public.operational_controls
set winner_mail_enabled = true, updated_at = now()
where singleton;
```

확인:

```sql
select draws_enabled, winner_mail_enabled, updated_at
from public.operational_controls;
```

멈출 때는 `true`를 `false`로 바꿔 같은 UPDATE를 돌린다.
이미 나간 메일은 되돌릴 수 없지만 그 뒤로는 한 통도 나가지 않는다.

### ⚠️ SQL Editor에서 `set_winner_mail_enabled()`를 부르면 실패한다

```
ERROR: Admin only
```

`set_winner_mail_enabled`와 `set_draws_enabled`는 `is_admin()`을 검사한다.
`is_admin()`은 `auth.uid()`로 로그인 사용자를 찾는데, SQL Editor에는 JWT가 없어
`auth.uid()`가 NULL이다. **이 함수들은 관리자 화면(브라우저)에서 부르라고 만든 것**이고,
SQL Editor에서는 위처럼 표를 직접 고친다.

같은 이유로 **`select public.get_winner_mail_enabled();` 로 확인하면 안 된다.**
이 함수도 관리자가 아니면 무조건 `false`를 돌려주므로, 제대로 켰는데도
`false`로 보여 "안 켜졌다"고 오해하게 된다. 위의 `select ... from
operational_controls`나 관리자 화면의 배지로 확인한다.

---

## 실제로 도는 모습

```
1일 00:00 KST  pg_cron이 추첨 → prize_winners에 pending 3건 (notified_at = null)
1일 00:30 KST  Vercel Cron → /api/cron/send-winner-mails
               claim_winner_mails가 3건을 집으면서 notified_at을 찍는다
               Brevo로 3통 발송
               관리자 화면 "메일" 칸이 "발송 <시각>"으로 바뀐다
4일 00:05 KST  무응답 만료 + 재추첨 → 새 pending 발생
4일 00:30 KST  새 당첨자에게 자동 발송
```

발송에 실패한 건은 `release_winner_mail`로 잠금이 풀려 **다음 날 다시 시도**된다.

---

## 문제가 생기면

| 증상 | 볼 곳 |
|---|---|
| 메일이 안 나간다 | Vercel → Deployments → Functions 로그. `당첨 안내 메일: N통 발송` 이 찍히는지 |
| 크론이 안 돈다 | Vercel → Settings → Cron Jobs에 등록됐는지. Production 배포인지 |
| 다 "발송함"인데 안 왔다 | Brevo → Statistics → Email에서 실제 발송·반송 이력 |
| 스팸함에 간다 | Gmail 원본 보기에서 SPF/DKIM. `_dmarc`를 `p=none`으로 두고 이력을 쌓는다 |
| 같은 사람에게 두 번 왔다 | 있으면 안 된다. `claim_winner_mails`가 막는다. 관리자가 수동으로 또 눌렀는지 확인 |

발송 여부는 `prize_winners.notified_at`이 유일한 기준이다.

```sql
select id, month_id, prize_name, status, notified_at, respond_by
from prize_winners order by created_at desc;
```

---

## "수신 거부"가 붙는 것에 대해

받은 메일의 보낸사람 옆에 Gmail이 **수신 거부**를 그려준다. 없앨 수 없고,
없애려고 해서도 안 된다.

2024년 2월부터 Gmail·Yahoo가 **모든 발신자에게 `List-Unsubscribe` 헤더를 요구**한다.
Brevo는 그래서 트랜잭션 메일에도 이 헤더를 항상 넣는다. 빼면 오히려 스팸 판정이
나빠진다. (대안인 `List-Help` 헤더는 Enterprise 플랜에서만 쓸 수 있다.)

**남는 위험** — 당첨자가 이걸 누르면 그 뒤 우리 안내 메일을 못 받는다.
대비는 둘이다.

1. **사이트 당첨 배너가 별도 경로다.** 로그인하면 보이므로 메일이 유일한 통로가 아니다
2. 발송이 거절되면 `release_winner_mail`로 잠금이 풀려 관리자 화면에 **미발송**으로
   남는다. 관리자가 다른 방법으로 연락할 수 있다

⚠️ 다만 Brevo가 차단된 수신자에 대해 **오류 없이 접수만 하고 배달하지 않을** 가능성이
있다. 그때는 화면에 "발송함"으로 뜨는데 실제로는 안 간 상태가 된다.
"메일 못 받았다"는 문의가 오면 **Brevo → Statistics → Email에서 실제 배달 여부를
먼저 확인할 것.** `notified_at`만 믿으면 안 된다.

## 알아둘 것

- **메일이 유일한 통로가 아니다.** 로그인하면 사이트 상단에 당첨 배너가 뜬다.
  메일이 실패해도 사용자가 알 방법은 남아 있다
- **`draws_enabled`가 아직 false다.** 추첨이 안 돌면 당첨자도 없고 메일도 없다.
  최종 데이터 이관과 운영 전환을 마친 뒤에 켠다 (`0031`)
- 관리자 화면의 **"메일 내용 → 메일 보내기"** 수동 경로는 스위치와 무관하게 항상 동작한다.
  자동화를 켜기 전에도, 자동 발송이 실패했을 때도 이걸로 보낼 수 있다
