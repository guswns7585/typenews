# Frontend Architecture

## 경계

`app/`은 라우팅과 서버 경계를 담당하고, 화면이 길어지면 `components/<feature>/`로 조합을 분리합니다. 타이핑 계산·콘텐츠 선택처럼 DOM이 필요 없는 코드는 `features/`에 둡니다.

- `features/typing-engine/`: 입력과 원문의 정렬(`alignment.ts`), 속도·정확도 계산(`metrics.ts`). 판정 규칙은 전부 여기 모여 있고 컴포넌트는 결과만 그립니다.
- `features/content/`: 문장·뉴스 로딩과 정제.
- `features/integrity/`: 부정행위 탐지용 행동 집계. 자세한 설계는 `supabase/docs/abuse-detection.md`.

## 상태 소유권

- `useTypingStore`: 현재 문장, 입력, 모드, 세션 카운트
- `useSettingsStore`: 사용자별 타이핑 옵션과 UI 설정
- Supabase: 로그인 사용자, 프로필, 월간 점수, 랭킹의 영속 상태

탐지 관련 상태는 Zustand에 두지 않습니다. `features/integrity/behavior-tracker.ts`가 모듈 싱글턴으로 집계만 들고 있다가 서버로 올리고, 결과(`abuse_signals`)는 관리자만 조회할 수 있습니다.

## 데이터 흐름

1. Google 로그인 후 `link_current_google_identity()`가 Firebase Google `sub`와 기존 `profiles`를 연결합니다.
2. 타이핑 완료 이벤트는 서버 측 점수 RPC로 보냅니다.
3. 클라이언트는 프로필·월간 점수·랭킹만 읽고, RLS가 본인 데이터 범위를 보장합니다.

## 컴포넌트 규칙

- 페이지 파일은 데이터 경계와 화면 조립만 담당합니다.
- 하나의 컴포넌트가 두 개 이상의 독립 기능을 가지면 기능별 하위 컴포넌트로 나눕니다.
- 브라우저 API·Zustand·이벤트는 `'use client'` 컴포넌트에만 둡니다.
