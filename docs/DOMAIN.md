# typenews.kr — 커트오버 절차

**2026-07-28: 소유권 이전 완료.** 도메인은 이제 운영자 가비아 계정에 있고 DNS를
직접 바꿀 수 있다. 아래는 8월 1일 전환 절차다.

> 이전 상태(선물받은 도메인이라 관리 권한이 없던 시기)의 협상 방안 세 가지는
> 더 이상 필요 없어 걷어냈다. 필요하면 git 이력에 있다.

---

## 0. 이전받은 직후에 확인할 것 — 먼저 하고 시작

| | 확인 | 왜 |
|---|---|---|
| 1 | My가비아 → 서비스 관리 → 도메인에 `typenews.kr`이 **보이는지** | 이전이 실제로 끝났는지. 신청만 되고 승인이 남아 있을 수 있다 |
| 2 | **만료일**과 **자동 갱신** 설정 | 만료되면 사이트를 통째로 잃는다. 이전받은 김에 자동 갱신을 켜둘 것 |
| 3 | 소유자(등록자) 정보가 본인으로 바뀌었는지 | `.kr`은 KISA 규정이라 관리 연락처가 옛 소유자로 남아 있으면 나중에 갱신·이전에서 막힌다 |
| 4 | 가비아 계정 2단계 인증 | 도메인을 잃는 가장 흔한 경로다 |

[whois.kr](https://whois.kr)에서 `typenews.kr`을 조회하면 만료일과 등록자 정보가 보인다.

---

## 1. 지금 DNS 상태 (2026-07-28 실측, 소유권 이전 후에도 그대로)

| 레코드 | 값 |
|---|---|
| `typenews.kr` A | `199.36.158.100` (Firebase Hosting), **TTL 1800** |
| `www.typenews.kr` CNAME | `typenews.kr` |
| NS | `ns.gabia.co.kr`, `ns1.gabia.co.kr`, `ns.gabia.net` (가비아 기본) |
| TXT | `hosting-site=typenews-dbe9c` (Firebase Hosting 소유 확인) |

```powershell
Resolve-DnsName typenews.kr -Type A -Server 8.8.8.8
```

`-Server 8.8.8.8`을 붙여야 내 PC 캐시가 아니라 바깥에서 보이는 값을 본다.

**네임서버는 가비아 그대로 두는 것을 권한다.** Cloudflare로 옮기면 기능은 늘지만
옮기는 순간 레코드가 전부 대체되어 실수할 여지가 생긴다. 지금 필요한 것은
레코드 두 개를 바꾸는 일뿐이다.

---

## 2. 커트오버 순서

### D-1 (7월 31일) — 준비

**① TTL을 300초로 낮춘다** ← 이걸 먼저 해야 한다

가비아 → My가비아 → 서비스 관리 → 도메인 → `typenews.kr` 관리 → DNS 정보 → DNS 관리.
A 레코드와 www CNAME의 TTL을 `1800` → `300`으로 바꾼다.

> ⚠️ **TTL 변경 자체가 옛 TTL만큼 퍼지는 데 걸린다.** 지금 1800초(30분)이므로
> 전환 최소 1시간 전에는 바꿔둬야 효과가 있다. 이걸 안 하면 잘못됐을 때
> 되돌리는 데도 30분이 걸린다.

**② Vercel에 도메인을 등록하고 값을 받아온다**

1. Vercel → 프로젝트 → Settings → Domains
2. `typenews.kr` 입력 → Add → **Add `www.typenews.kr` 도 함께 추가**
   (Vercel이 www → apex 리다이렉트를 자동으로 걸어준다. apex를 primary로)
3. 화면에 *"Set the following record on your DNS provider"* 와 함께
   **A 레코드에 넣을 IP**와 **www CNAME 값**이 뜬다. 그 값을 적어둔다
4. 아직 DNS를 안 바꿨으므로 "Invalid Configuration"으로 뜬다. **정상이다**

> ⚠️ **IP를 이 문서나 다른 블로그에서 베끼지 말 것.** Vercel의 apex IP는
> 프로젝트·시기에 따라 다르고 바뀐다. 화면이 알려주는 값만 쓴다.
> apex(`@`)에는 CNAME을 쓸 수 없다(DNS 규격). 그래서 apex는 A, www는 CNAME이다.

**③ 프론트엔드를 먼저 배포해둔다**

```bash
cd frontend && npx vercel --prod
```

도메인을 붙이기 전에 `*.vercel.app`에서 정상 동작을 확인해두는 편이 낫다.
전환 당일에 배포 문제까지 겹치면 원인을 가리기 어렵다.

**④ 구 Firebase 사이트 리다이렉트를 *준비만* 해둔다 — 배포는 D-Day에**

⚠️ **미리 배포하면 안 된다.** 리다이렉트를 걸면 그 순간부터 사용자가 새 사이트로
넘어와 Supabase에 점수를 쌓기 시작한다. 그런데 최종 데이터 이관은
`(profile_id, month_id)` 기준 **upsert라 Supabase의 값을 Firebase 값으로 덮어쓴다.**
하루 먼저 배포하면 그날 쌓인 점수가 이관 때 전부 사라진다.

`firebase deploy` 명령까지 준비해두고, **실제 배포는 이관이 끝난 뒤** DNS 전환과
같은 시점에 한다.

`firebase.json`:

```json
{
  "hosting": {
    "public": "public",
    "redirects": [
      {
        "source": "**",
        "destination": "https://typenews-vercel.vercel.app/",
        "type": 302
      }
    ]
  }
}
```

**왜 소유권을 받았는데도 이게 필요한가** — DNS는 즉시 바뀌지 않는다. TTL을 300으로
낮춰도 전환 직후 몇 분에서 몇십 분 동안 **일부 사용자는 여전히 Firebase로 간다.**
그동안 그 사람들이 친 점수는 Firestore로 들어가고 새 랭킹에 반영되지 않는다.
리다이렉트를 미리 걸어두면 그 창이 사라진다.

> ⚠️ **반드시 302다.** 301은 브라우저가 사실상 영구 캐시해서 되돌릴 수 없다.
>
> ⚠️ 목적지는 `typenews.kr`이 아니라 **`vercel.app` 주소**여야 한다.
> `typenews.kr`로 보내면 아직 Firebase로 해석되는 사용자에게 무한 루프가 된다.

### D-Day (8월 1일 00:00 KST 이후) — 전환

⚠️ **순서가 고정돼 있다. 바꾸면 데이터를 잃는다.**

```
7/31 23:59  이벤트 마감 (사용자는 계속 Firebase에서 사용 중)
     ↓
 ①  최종 Firebase → Supabase 이관      ← 아무도 새 사이트를 쓰기 전에
 ②  이관 검증 (행 수, 상위 랭킹 대조)
 ↓
 ③  Firebase 302 리다이렉트 배포 + DNS 전환   ← 여기서부터 Supabase에 유입
 ④  Supabase Site URL 변경
 ⑤  draws_enabled = true
 ⑥  관리자 화면에서 7월 추첨 수동 실행
```

이관 스크립트가 `monthly_stats`를 `(profile_id, month_id)` 기준으로 덮어쓰므로,
**새 사이트 유입은 반드시 이관 뒤여야 한다.** 닉네임·환경설정도 `firebase_uid`
기준으로 덮이므로 같은 이유가 적용된다.

⚠️ **8/1 00:00에 `typenews-prize-draw` cron이 돈다.** 그 시각에 이관이 끝나 있지
않으면 불완전한 데이터로 추첨된다. **`draws_enabled`를 그때는 꺼둔 채로 둔다.**
cron이 그냥 지나가게 두고, 이관·검증을 마친 뒤 켜서 수동으로 추첨한다.
어차피 첫 추첨은 눈으로 확인하는 편이 낫다.

**③ 리다이렉트 배포 + DNS 레코드 변경 (같은 시점에)**

먼저 준비해둔 Firebase 리다이렉트를 배포하고(`firebase deploy --only hosting`),
바로 이어서 DNS를 바꾼다. 둘 사이가 벌어질수록 전파 중 구 사이트에서
점수를 쌓는 사람이 늘어난다.

| 호스트 | 타입 | 바꿀 값 |
|---|---|---|
| `@` | A | Vercel이 알려준 IP (지금은 `199.36.158.100`) |
| `www` | CNAME | Vercel이 알려준 값 (지금은 `typenews.kr`) |

**④ Supabase URL 설정을 바꾼다**

Supabase → Authentication → URL Configuration

- **Site URL** → `https://typenews.kr`
- **Redirect URLs** → `https://typenews.kr/**` (이미 있음),
  www도 쓴다면 `https://www.typenews.kr/**` 추가

> Google OAuth 콘솔은 **건드릴 필요가 없다.** 승인된 리디렉션 URI는
> Supabase 주소(`https://<ref>.supabase.co/auth/v1/callback`)라 도메인과 무관하다.

**⑦ 전파 확인**

```powershell
Resolve-DnsName typenews.kr -Type A -Server 8.8.8.8
Resolve-DnsName typenews.kr -Type A -Server 168.126.63.1
```

두 번째는 KT DNS다. 국내 사용자 다수가 통신사 DNS를 쓰므로 그쪽이 바뀌어야
실제로 전환된 것이다.

**Vercel 인증서**

Vercel Settings → Domains에서 `typenews.kr`이 **Valid Configuration**으로 바뀌고
인증서가 자동 발급된다(Let's Encrypt). 보통 몇 분. 그 전까지는 https 경고가 뜬다.

**⑤ 추첨을 켜고 ⑥ 수동 실행**

```sql
update public.operational_controls
set draws_enabled = true, updated_at = now()
where singleton;
```

⚠️ 컬럼 이름을 확인할 것. 같은 표에 `winner_mail_enabled`가 함께 있다.
그다음 관리자 → 당첨 관리 → `202607 추첨 실행`.
당첨자가 생기면 00:30 KST 크론이 안내 메일을 자동으로 보낸다.
기다리지 않고 바로 보내려면 당첨자별 **메일 보내기** 버튼을 누른다.

### 전환 직후 — 눈으로 확인

1. **시크릿 창**에서 `https://typenews.kr` → 새 사이트가 뜨는지
2. 로그인 → 이번 달 점수 0 확인 (8월이니 0이 맞다)
3. 문장 하나 완료 → 랭킹에 반영되는지
4. `https://www.typenews.kr` → apex로 리다이렉트되는지
5. 이관 검증 — 7월 상위 랭킹이 Firebase와 같은지
6. 추첨 결과가 그럴듯한지 (관리자 화면의 추첨 감사 표)

---

## 3. 되돌리기

문제가 생기면 **A 레코드를 `199.36.158.100`으로 되돌리면** 원래 사이트로 온다.
TTL을 300으로 낮춰뒀다면 5분이면 돌아온다.

⚠️ 단, ④의 리다이렉트를 배포했다면 구 사이트는 새 사이트로 튕긴다.
**진짜로 롤백하려면 리다이렉트도 함께 되돌려야 한다.** 롤백 계획을 세울 때
이 둘이 한 쌍이라는 것을 잊지 말 것.

⚠️ TXT `hosting-site=typenews-dbe9c`는 **지우지 말 것.** Firebase Hosting 소유
확인용이라 지우면 되돌아갈 때 다시 인증해야 한다. Vercel과 충돌하지 않는다.

---

## 4. 메일 발신 인증 (Brevo) — 소유권을 받아서 이제 가능해진 것

당첨 안내 메일을 `noreply@typenews.kr`처럼 **우리 도메인으로** 보내려면 DNS에
레코드를 넣어야 한다. 도메인을 못 만지던 동안에는 "단일 발신자 인증"(개인 메일
주소 하나를 인증해서 그 주소로만 보내기)밖에 못 썼다. 이제 제대로 할 수 있다.

### 왜 하는가

| | 단일 발신자 인증 | 도메인 인증 |
|---|---|---|
| 발신 주소 | 개인 메일 주소 | `noreply@typenews.kr` |
| 스팸함 행 | 잘 감 | 훨씬 덜 감 |
| 신뢰도 | 받는 사람이 낯설어함 | 서비스 메일로 보임 |

경품 안내 메일을 못 받으면 당첨자가 상품을 놓친다. **도달률이 곧 운영 품질이다.**

### 넣을 레코드

Brevo → **Senders, Domains & Dedicated IPs → Domains → Add a domain** →
`typenews.kr` 입력 → **Authenticate this domain**.

그러면 화면이 넣어야 할 레코드를 알려준다. 대략 이런 모양이다.

| 호스트 | 타입 | 용도 |
|---|---|---|
| `@` | TXT | `brevo-code:...` — 이 도메인이 우리 것임을 증명 |
| `mail._domainkey` | TXT | DKIM 서명 |
| `_dmarc` | TXT | DMARC |

**SPF와 MX는 필요 없다.** 전용 IP를 쓸 때만 Brevo가 준다.

⚠️ **값은 Brevo 화면에서 그대로 복사할 것.** DKIM 공개키와 `brevo-code`는
계정마다 다르다. 위 표는 *어떤 레코드가 몇 개 필요한지* 보라고 적어둔 것이다.

⚠️ **기존 TXT(`hosting-site=typenews-dbe9c`)를 지우지 말 것.** Firebase Hosting
소유 확인용이라 지우면 되돌아갈 길이 막힌다. TXT는 여러 개가 공존하니 **추가**한다.

**화면 단위 절차와 나머지 주의사항은 [MAIL.md](MAIL.md) 2번에 있다.**

---

## 5. 커트오버 이후

| | |
|---|---|
| TTL 되돌리기 | 안정되면 `300` → `1800`으로. 조회가 줄어든다. 급하지 않다 |
| Firebase Hosting | 리다이렉트만 남기고 유지. 한 달쯤 뒤 정리 판단 |
| **`typenews-dbe9c` 프로젝트 삭제 금지** | 로그인용 OAuth 클라이언트가 그 안에 있다. `supabase/docs/auth-setup.md` |
| 자동 갱신 | 켜져 있는지 다시 확인 |
