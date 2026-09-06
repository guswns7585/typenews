# Google 로그인 설정

## ⚠️ 먼저 읽을 것 — Firebase 프로젝트를 삭제하지 마세요

Vercel 로그인이 쓰는 **Google OAuth 클라이언트가 `typenews-dbe9c` Google Cloud 프로젝트 안에 있습니다.**

Firebase 프로젝트는 Google Cloud 프로젝트 위에 얹힌 것이라, Firebase 콘솔에서 "프로젝트 삭제"를 누르면 **Google Cloud 프로젝트까지 함께 삭제되고 OAuth 클라이언트도 사라집니다.** 그 순간 Vercel 로그인이 죽습니다.

서버 이관이 끝난 뒤 Firebase를 정리할 때는 이렇게 하세요.

- ✅ Firestore 데이터 삭제, Hosting 해제, Firebase Auth 사용 중지
- ❌ **GCP 프로젝트 `typenews-dbe9c` 자체 삭제 금지**

빈 GCP 프로젝트는 비용이 발생하지 않습니다. 껍데기로 남겨두면 됩니다.

> 원래는 인증 전용 GCP 프로젝트를 따로 만들어 독립시키는 편이 깔끔하지만,
> 계정의 프로젝트 생성 한도에 걸려 기존 프로젝트를 재사용하고 있습니다.
> 한도가 풀리면 아래 "인증 프로젝트 분리"를 참고해 옮길 수 있습니다.

## 현재 구성

| 항목 | 값 |
|---|---|
| Supabase 프로젝트 | `iuujbgblvwduehktabbw` |
| OAuth 클라이언트 위치 | GCP 프로젝트 `typenews-dbe9c` |
| Supabase 콜백 URL | `https://iuujbgblvwduehktabbw.supabase.co/auth/v1/callback` |
| Firebase 콜백 URL (운영 중, 건드리지 말 것) | `https://typenews-dbe9c.firebaseapp.com/__/auth/handler` |

Firebase용과 Supabase용은 **서로 다른 OAuth 클라이언트**입니다. redirect URI는 클라이언트별 목록이라 서로 간섭하지 않습니다.

## Supabase 쪽 설정

Authentication → Sign In / Providers → Google → Enable → Client ID / Secret 입력

Authentication → URL Configuration

- Site URL: `https://typenews-vercel.vercel.app`
- Redirect URLs: `https://typenews-vercel.vercel.app/**`, `http://localhost:3000/**`

## 기존 계정 연결 방식

`link_current_google_identity()`는 `supabase_user_id` → `google_sub` → `email` 순으로 기존 프로필을 찾습니다.

Firestore 이관 시 Firebase Auth export를 쓰지 않아서 **`google_sub`이 866명 전부 비어 있습니다.** 실질적으로 **email 매칭만 동작합니다.**

- email 있음: 847 / 866 → 로그인하면 기존 기록에 연결됨
- email 없음: 19 → 연결 실패, 새 프로필 생성

### email 없는 19명은 복구할 것이 없습니다 (2026-07-26 확인)

로컬 Firestore 백업(`backups/firebase-20260722T213225/firestore/*.jsonl`)에서 19명을
전수 확인한 결과 **전원 빈 껍데기**입니다.

| 항목 | 19명 전원 |
|---|---|
| `displayName` | null |
| `maxCPM` | 0 |
| `totalTypingCount` | 0 |
| `monthlyStats` 문서 | 0건 |
| 문서에 있는 키 | `maxCPM`, `preferences` 뿐 |

로그인만 하고 문장을 한 번도 완료하지 않은 계정들입니다. 연결에 실패해도 잃는 기록이
없으므로 **`firebase auth:export` 복구 절차는 돌릴 필요가 없습니다.**

하위 `monthlyStats` 문서에서 email을 건질 수 있는 사람도 0명이라, 애초에 복구할 단서도 없습니다.

다시 세어볼 때 쓴 방법:

```
backups/firebase-20260722T213225/firestore/*.jsonl 을 줄 단위로 파싱해
parent_path == "users" 인 문서 중 data.email 이 비어 있는 것을 고른다.
```

## 인증 프로젝트 분리 (나중에)

GCP 프로젝트 생성 한도가 풀리면 인증을 독립시킬 수 있습니다.

1. 새 GCP 프로젝트 생성 → OAuth consent screen(External, 스코프는 `email`/`profile`/`openid`만) 구성
   - 기본 스코프만 쓰면 Google 심사가 필요 없습니다
   - Authorized domains에 `supabase.co`, `typenews.kr` 추가
2. Web application 클라이언트 생성, redirect URI에 Supabase 콜백 등록
3. Supabase Google provider의 Client ID / Secret 교체

**전환 비용은 낮습니다.** 계정 연결이 email 매칭으로 이뤄지므로, 클라이언트를 갈아끼워도 사용자는 다시 로그인하면 기존 프로필에 그대로 붙습니다.
