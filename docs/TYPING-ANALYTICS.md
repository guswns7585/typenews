# 타이핑 분석 운영 문서

## 적용 범위

- 점수·랭킹·추첨 경로와 독립된 제품 분석 계층
- 원시 keydown, 타건 timestamp, 사용자가 잘못 입력한 문자열은 저장하지 않음
- 브라우저 누적 집계 후 10회 완료 또는 60초 간격으로 Supabase RPC 호출
- 문장 취약 위치는 `sentence_id + char_index + 횟수`만 저장
- 필사는 사용자 로컬 원문이므로 분석과 점수에서 모두 제외

## 저장 상한

- 세션 버킷: 오늘과 어제만 유지
- 일 통계: 사용자당 하루 한 행, 90일 유지
- 월 통계: 사용자당 월 한 행, 60개월 유지
- 누적 통계: 사용자당 한 행
- 취약 위치: 사용자당 상위 120개 유지

1,000명이 매일 활동하는 보수적인 경우에도 행 수가 모드 수나 문장 수에 직접 비례하지
않는다. 일 통계 약 9만 행, 월 통계 약 6만 행, 취약 위치 최대 12만 행과 이틀치 임시
버킷으로 제한된다. 실제 DB 크기는 활동 빈도와 JSON/인덱스 크기를 SQL Editor에서
주기적으로 확인한다.

## 적용

Supabase Dashboard > SQL Editor에서 다음 파일 전체를 한 번 실행한다.

`supabase/migrations/0054_typing_analytics_foundation.sql`

그다음 파생 통계 화면을 추가하는 아래 파일을 실행한다.

`supabase/migrations/0055_analytics_insights.sql`

관리자 화면에서 수집 지표 전체와 누적 취약 위치를 확인하려면 아래 파일까지 실행한다.

`supabase/migrations/0056_admin_analytics_complete.sql`

그 뒤 프런트엔드를 배포한다. 순서가 반대여도 분석 RPC만 실패하며 점수 적립에는
영향이 없지만, 콘솔 오류를 피하려면 SQL을 먼저 적용한다.

## 적용 직후 확인

```sql
select jobname, schedule, active
from cron.job
where jobname = 'typenews-rollup-analytics';

select
  to_regclass('public.typing_analytics_buckets') as session_buckets,
  to_regclass('public.user_daily_typing_analytics') as daily_stats,
  to_regclass('public.user_typing_weaknesses') as weaknesses;
```

로그인 상태에서 문장 몇 개를 친 뒤 최대 60초 기다리거나 탭을 숨기고 확인한다.

```sql
select count(*) as bucket_rows, max(updated_at) as latest
from public.typing_analytics_buckets;
```

관리자 화면의 `이용 분석` 탭에서는 7/30/90일 일별 통계, DAU/WAU/MAU,
신규·기존 계정, 기기, 시간대, 모드·언어·뉴스 분야별 통계를 확인하고 CSV로
내보낼 수 있다. 점수 인정률, 실제 입력시간, 평균 소요시간, 오타·수정, 긴 정지,
뉴스 완료와 누적 취약 위치 TOP 20도 같은 화면에서 확인한다.
사용자는 설정의 `나의 타이핑 분석`에서 최근 30일 요약,
이전 기간 대비 변화, 연속 활동일, 모드별 기록과 취약 위치를 확인한다.

## 취약 문장 연습 출시 순서

현재 릴리스는 데이터를 수집하고 취약 위치를 보여주는 shadow 단계다. 자동 연습은
다음 조건을 확인한 뒤 연결한다.

1. 최소 1~2주 동안 IME 조합 글자가 오타로 과다 집계되지 않는지 확인
2. 사용자당 상위 120개 제한에서 반복 취약 문장이 안정적으로 남는지 확인
3. 연습 성공 시 우선순위를 낮추는 숙련 규칙과 점수 미적립 경로를 추가
4. 뉴스는 원문 보존 기간이 짧으므로 우선 단문·장문·단어의 DB 문장만 연습에 사용

## DB 용량 점검

```sql
select relname,
       pg_size_pretty(pg_total_relation_size(relid)) as total_size
from pg_catalog.pg_statio_user_tables
where relname in (
  'typing_analytics_buckets',
  'typing_weakness_buckets',
  'user_daily_typing_analytics',
  'user_monthly_typing_analytics',
  'user_typing_analytics_totals',
  'user_typing_weaknesses'
)
order by pg_total_relation_size(relid) desc;
```

임시 버킷이 이틀보다 오래 남으면 cron 실행 이력을 확인하고 수동으로 다음을 실행한다.

```sql
select * from public.rollup_typing_analytics(90, 60);
```
