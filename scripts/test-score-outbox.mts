/**
 * 점수 재전송 큐(score-outbox)의 동작 확인.
 *
 *   npx tsx scripts/test-score-outbox.mts
 *
 * 네트워크도 DB도 건드리지 않는다. localStorage만 흉내 내어 실제 모듈을 돌린다.
 * 이 큐가 잘못 동작하면 점수가 사라지거나 두 번 적립되므로, 고칠 때마다 돌릴 것.
 */

// localStorage 흉내. 모듈을 불러오기 **전에** 심어야 한다.
const store = new Map<string, string>();
(globalThis as unknown as { window: unknown }).window = {
  localStorage: {
    getItem: (k: string) => store.get(k) ?? null,
    setItem: (k: string, v: string) => void store.set(k, v),
    removeItem: (k: string) => void store.delete(k),
  },
};

const MODULE = "../frontend/features/scoring/score-outbox.ts";
const outbox = await import(MODULE);
const { enqueue, remove, size, flush, makeSubmissionKey } = outbox;
type PendingScore = import("../frontend/features/scoring/score-outbox.ts").PendingScore;

const STORAGE_KEY = "typenews.score-outbox.v1";

let failures = 0;
function check(label: string, actual: unknown, expected: unknown) {
  const ok = JSON.stringify(actual) === JSON.stringify(expected);
  if (!ok) failures += 1;
  console.log(
    `${ok ? "  ✓" : "  ✗"} ${label}` +
      (ok ? "" : ` — 기대 ${JSON.stringify(expected)}, 실제 ${JSON.stringify(actual)}`),
  );
}

function make(overrides: Partial<PendingScore> = {}): PendingScore {
  return {
    key: makeSubmissionKey(),
    monthId: "202608",
    mode: "short",
    accuracy: 98,
    cpm: 400,
    score: 42,
    elapsedMs: 5000,
    items: 1,
    createdAt: Date.now(),
    ...overrides,
  };
}

console.log("키 형식");
check(
  "uuid 모양",
  /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/.test(makeSubmissionKey()),
  true,
);

console.log("\n담고 지우기");
store.clear();
const a = make();
enqueue(a);
enqueue(make());
check("두 건", size(), 2);
remove(a.key);
check("하나 지움", size(), 1);
remove("없는키");
check("없는 키는 무해", size(), 1);

console.log("\n성공하면 큐가 빈다");
store.clear();
enqueue(make());
enqueue(make());
let result = await flush(async () => "done", "202608");
check("두 건 보냄", result.sent, 2);
check("남은 것 없음", size(), 0);

console.log("\nretry면 남고, 뒤는 건드리지 않는다");
store.clear();
enqueue(make({ score: 1 }));
enqueue(make({ score: 2 }));
enqueue(make({ score: 3 }));
let attempts = 0;
result = await flush(async () => {
  attempts += 1;
  return "retry";
}, "202608");
check("보낸 것 0", result.sent, 0);
check("한 번만 시도", attempts, 1);
check("세 건 그대로", size(), 3);

console.log("\n첫 건 성공 후 둘째에서 막히면 첫 건만 지워진다");
store.clear();
const ok1 = make({ score: 10 });
enqueue(ok1);
enqueue(make({ score: 20 }));
enqueue(make({ score: 30 }));
result = await flush(async (item: PendingScore) => (item.key === ok1.key ? "done" : "retry"), "202608");
check("한 건 보냄", result.sent, 1);
check("두 건 남음", size(), 2);

console.log("\n달이 바뀌면 버린다 (8월 랭킹에 7월 점수가 들어가지 않게)");
store.clear();
enqueue(make({ monthId: "202607", score: 99 }));
enqueue(make({ monthId: "202608", score: 5 }));
attempts = 0;
result = await flush(async () => {
  attempts += 1;
  return "done";
}, "202608");
check("보낸 것 1", result.sent, 1);
check("버린 것 1", result.dropped, 1);
check("지난달 것은 보내지도 않음", attempts, 1);
check("큐 비었음", size(), 0);

console.log("\n오래된 것은 버린다");
store.clear();
enqueue(make({ createdAt: Date.now() - 8 * 24 * 60 * 60 * 1000 }));
result = await flush(async () => "done", "202608");
check("버림", result.dropped, 1);
check("큐 비었음", size(), 0);

console.log("\ndrop은 지우되 보낸 것으로 세지 않는다 (로그인 안 한 상태)");
store.clear();
enqueue(make());
result = await flush(async () => "drop", "202608");
check("sent 0", result.sent, 0);
check("dropped 1", result.dropped, 1);
check("큐 비었음", size(), 0);

console.log("\nsend가 예외를 던져도 큐는 살아남는다");
store.clear();
enqueue(make());
result = await flush(async () => {
  throw new Error("네트워크 끊김");
}, "202608");
check("남아 있음", size(), 1);

console.log("\n상한을 넘으면 오래된 것부터 버린다");
store.clear();
for (let i = 0; i < 250; i += 1) enqueue(make({ score: i }));
check("200건으로 잘림", size(), 200);
const kept = JSON.parse(store.get(STORAGE_KEY)!) as PendingScore[];
check("최근 것이 남음", kept[kept.length - 1].score, 249);
check("오래된 것이 빠짐", kept[0].score, 50);

console.log("\n깨진 저장값을 만나도 죽지 않는다");
store.set(STORAGE_KEY, "{이건 JSON이 아니다");
check("빈 배열로 취급", size(), 0);
store.set(STORAGE_KEY, JSON.stringify([{ 이상한: true }, make()]));
check("형식 안 맞는 항목은 버림", size(), 1);

console.log(failures === 0 ? "\n✅ 전부 통과" : `\n❌ ${failures}건 실패`);
process.exit(failures === 0 ? 0 : 1);
