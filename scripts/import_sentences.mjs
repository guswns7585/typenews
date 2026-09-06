/**
 * frontend/public/*.json 의 문장을 sentences 테이블로 옮긴다.
 *
 *   node scripts/import_sentences.mjs           # 무엇이 들어갈지만 보여준다
 *   node scripts/import_sentences.mjs --apply   # 실제로 넣는다
 *
 * 서비스 롤 키를 쓰므로 RLS를 우회한다. frontend/.env 에서 읽는다.
 *
 * ── is_meme 을 정하는 방법 ──────────────────────────────────────────────
 * 파일들이 엄격한 상위집합 관계가 아니다. 실측하면 이렇다.
 *
 *   kor.json 476 / kor_stream.json 461  → kor에만 23, stream에만 4
 *   kor_long.json 123 / kor_long_stream.json 121
 *   kor_meme.json 29 → 코드에서 참조하지 않는 미사용 파일
 *
 * 그래서 "밈 목록"을 따로 믿지 않고 **지금 동작을 그대로 보존하는 규칙**을 쓴다.
 * localFileName()이 M 버튼(useStreaming)에 따라 stream 파일과 기본 파일을
 * 갈아 쓰므로, 사용자가 보는 것은 결국 이 둘의 차이다.
 *
 *   is_meme = (기본 파일에 있고 stream 파일에는 없다)
 *
 * 이렇게 넣으면 M을 켠 사용자는 stream 파일과 똑같은 묶음을, 끈 사용자는
 * 기본 파일과 똑같은 묶음을 받는다. 화면이 달라지지 않는다.
 */
import { readFileSync } from "node:fs";
import path from "node:path";

const ROOT = path.resolve(import.meta.dirname, "..");
const PUBLIC_DIR = path.join(ROOT, "frontend", "public");
const APPLY = process.argv.includes("--apply");

function loadEnv() {
  const text = readFileSync(path.join(ROOT, "frontend", ".env"), "utf8");
  const env = {};
  for (const line of text.split(/\r?\n/)) {
    if (!line.includes("=") || line.trim().startsWith("#")) continue;
    const i = line.indexOf("=");
    env[line.slice(0, i).trim()] = line
      .slice(i + 1)
      .trim()
      .replace(/^["']|["']$/g, "");
  }
  if (!env.SUPABASE_URL || !env.SUPABASE_SERVICE_ROLE_KEY) {
    throw new Error("frontend/.env 에 SUPABASE_URL / SUPABASE_SERVICE_ROLE_KEY 가 필요합니다");
  }
  return env;
}

const readJson = (name) =>
  JSON.parse(readFileSync(path.join(PUBLIC_DIR, name), "utf8")).map(String).map((t) => t.trim());

/**
 * (language, mode) 별로 기본 파일과 stream 파일을 짝지운다.
 * stream이 없는 묶음은 밈 구분이 없다 (영어 전체, 단어 모드).
 * localFileName() 과 같은 매핑이어야 한다.
 */
const GROUPS = [
  { language: "kor", mode: "short", base: "kor.json", stream: "kor_stream.json" },
  { language: "kor", mode: "long", base: "kor_long.json", stream: "kor_long_stream.json" },
  { language: "kor", mode: "word", base: "kor_words.json", stream: null },
  { language: "eng", mode: "short", base: "eng.json", stream: null },
  { language: "eng", mode: "long", base: "eng_long.json", stream: null },
  { language: "eng", mode: "word", base: "eng_words.json", stream: null },
];

function buildRows() {
  const rows = [];
  const report = [];

  for (const group of GROUPS) {
    const base = readJson(group.base);
    const stream = group.stream ? readJson(group.stream) : null;
    const streamSet = stream ? new Set(stream) : null;

    // 두 파일의 합집합이 전체 문장이다. stream에만 있는 문장도 빠뜨리지 않는다.
    const all = new Map();
    for (const text of base) all.set(text, streamSet ? !streamSet.has(text) : false);
    if (stream) for (const text of stream) if (!all.has(text)) all.set(text, false);

    let memes = 0;
    for (const [text, isMeme] of all) {
      // 서버 제약과 같은 조건. 넘치면 넣지 않고 보고한다.
      if (text.length < 1 || text.length > 400) continue;
      if (isMeme) memes += 1;
      rows.push({ language: group.language, mode: group.mode, text, is_meme: isMeme, enabled: true });
    }

    /* 파일 안에 같은 문장이 여러 번 들어 있다. 지금은 그 문장이 그만큼 자주
       뽑히는데, Map으로 합치면서 한 번씩만 남는다. 의도한 변경이다. */
    const rawTotal = base.length + (stream?.length ?? 0);
    report.push({
      묶음: `${group.language}/${group.mode}`,
      기본: base.length,
      stream: stream ? stream.length : "—",
      "고유(넣을 수)": all.size,
      "중복 제거": rawTotal - all.size,
      밈: memes,
    });
  }

  return { rows, report };
}

async function main() {
  const env = loadEnv();
  const { rows, report } = buildRows();

  console.table(report);
  const tooLong = GROUPS.flatMap((g) => readJson(g.base)).filter((t) => t.length > 400).length;
  console.log(`총 ${rows.length}문장 (밈 ${rows.filter((r) => r.is_meme).length})`);
  if (tooLong) console.log(`⚠️ 400자를 넘어 제외된 문장 ${tooLong}건`);

  if (!APPLY) {
    console.log("\n--apply 를 붙이면 실제로 넣습니다. 지금은 아무것도 바꾸지 않았습니다.");
    return;
  }

  const headers = {
    apikey: env.SUPABASE_SERVICE_ROLE_KEY,
    authorization: `Bearer ${env.SUPABASE_SERVICE_ROLE_KEY}`,
    "content-type": "application/json",
    // 유니크 인덱스(0017)에 걸리는 행은 조용히 넘긴다. 다시 돌려도 안전하다.
    prefer: "resolution=ignore-duplicates,return=minimal",
  };

  const BATCH = 200;
  let inserted = 0;
  for (let i = 0; i < rows.length; i += BATCH) {
    const chunk = rows.slice(i, i + BATCH);
    const response = await fetch(`${env.SUPABASE_URL}/rest/v1/sentences`, {
      method: "POST",
      headers,
      body: JSON.stringify(chunk),
    });
    if (!response.ok) {
      console.error(`실패 (${i}~${i + chunk.length}):`, response.status, await response.text());
      process.exitCode = 1;
      return;
    }
    inserted += chunk.length;
    console.log(`  ${inserted}/${rows.length}`);
  }

  // 실제로 몇 행이 됐는지 확인한다. 중복 무시 때문에 넣은 수와 다를 수 있다.
  const check = await fetch(`${env.SUPABASE_URL}/rest/v1/sentences?select=id&limit=0`, {
    headers: { ...headers, prefer: "count=exact" },
  });
  console.log("\nsentences 총 행 수:", (check.headers.get("content-range") ?? "").split("/")[1]);
}

await main();
