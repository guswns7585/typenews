/**
 * 0024를 적용한 뒤, 서버의 sentence_score()가 프론트엔드와 같은 값을 내는지
 * 실제 Postgres로 확인한다. 읽기 전용이다.
 *
 * 왜 필요한가
 *   SQL을 JS로 흉내 내어 맞춰보는 것까지는 적용 전에도 할 수 있지만, Postgres의
 *   정규식 엔진과 정수 나눗셈이 정말 같게 도는지는 돌려봐야 안다. 한 글자라도
 *   다르게 세면 섀도 검산이 전원을 불일치로 잡는다.
 *
 * 쓰는 법
 *   node scripts/verify-score-port.mjs
 *
 * 필요한 것
 *   frontend/.env 의 SUPABASE_URL / SUPABASE_SERVICE_ROLE_KEY
 *   (sentence_score는 authenticated에게 막혀 있어 service_role로만 부를 수 있다)
 */
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";

const here = dirname(fileURLToPath(import.meta.url));
const root = join(here, "..");

const envText = readFileSync(join(root, "frontend", ".env"), "utf8");
const env = {};
for (const line of envText.split(/\r?\n/)) {
  if (!line.includes("=") || line.trim().startsWith("#")) continue;
  const i = line.indexOf("=");
  env[line.slice(0, i).trim()] = line.slice(i + 1).trim().replace(/^["']|["']$/g, "");
}

const URL_BASE = env.SUPABASE_URL;
const KEY = env.SUPABASE_SERVICE_ROLE_KEY;
if (!URL_BASE || !KEY) {
  console.error("frontend/.env에 SUPABASE_URL / SUPABASE_SERVICE_ROLE_KEY가 필요합니다.");
  process.exit(1);
}
const H = { apikey: KEY, authorization: `Bearer ${KEY}`, "content-type": "application/json" };

// ── 프론트엔드와 같은 계산 (keystrokes.ts / alignment.ts를 옮긴 것) ────────
// ⚠️ 이 파일이 세 번째 구현이 되지 않도록, 값이 어긋나면 여기가 아니라
//    keystrokes.ts와 0024를 함께 본다.

const MEDIAL_STROKES = [1, 1, 1, 1, 1, 1, 1, 1, 1, 2, 2, 2, 1, 1, 2, 2, 2, 1, 1, 2, 1];
const FINAL_STROKES = [
  0, 1, 1, 2, 1, 2, 2, 1, 1, 2, 2, 2, 2, 2, 2, 2, 1, 1, 2, 1, 1, 1, 1, 1, 1, 1, 1, 1,
];
const TWO_STROKE_JAMO = new Set([..."ㄳㄵㄶㄺㄻㄼㄽㄾㄿㅀㅄㅘㅙㅚㅝㅞㅟㅢ"]);

function keystrokesForCharacter(character) {
  if (!character || character === " ") return 0;
  const code = character.codePointAt(0);
  if (code >= 0xac00 && code <= 0xd7a3) {
    const offset = code - 0xac00;
    return (
      1 +
      MEDIAL_STROKES[Math.floor((offset % 588) / 28)] +
      FINAL_STROKES[offset % 28]
    );
  }
  if (code >= 0x3131 && code <= 0x3163) return TWO_STROKE_JAMO.has(character) ? 2 : 1;
  if (code < 0x20) return 0;
  return 1;
}

const PUNCTUATION = /[.,!?'"“”‘’~]/;
const NUMBER = /[0-9]/;
const LATIN = /\p{Script=Latin}/u;
const SYMBOL = /[!@#$%^&*()_\-+={}[\]|\\:;<>?/~··•‧∙⋅・ㆍ･]/;

function scoreForSentence(text, o) {
  let total = 0;
  for (const ch of text) {
    if (
      (o.punctuation && PUNCTUATION.test(ch)) ||
      (o.english && LATIN.test(ch)) ||
      (o.numbers && NUMBER.test(ch)) ||
      (o.symbols && SYMBOL.test(ch))
    ) {
      continue;
    }
    total += keystrokesForCharacter(ch);
  }
  return total;
}

// ── 문장 읽기 ─────────────────────────────────────────────────────────────
const rows = [];
for (let from = 0; ; from += 1000) {
  const res = await fetch(`${URL_BASE}/rest/v1/sentences?select=id,text&order=id`, {
    headers: { ...H, range: `${from}-${from + 999}` },
  });
  const page = await res.json();
  if (!Array.isArray(page)) {
    console.error("문장 조회 실패", res.status, page);
    process.exit(1);
  }
  rows.push(...page);
  if (page.length < 1000) break;
}
console.log(`문장 ${rows.length}개`);

// ── 서버 계산과 대조 ──────────────────────────────────────────────────────
// 무시 옵션 네 개의 모든 조합(16가지)을 본다. 조합마다 한 번만 왕복한다.
const COMBOS = [];
for (let mask = 0; mask < 16; mask += 1) {
  COMBOS.push({
    punctuation: Boolean(mask & 1),
    numbers: Boolean(mask & 2),
    english: Boolean(mask & 4),
    symbols: Boolean(mask & 8),
  });
}

/**
 * ⚠️ PostgREST는 RPC 응답도 db-max-rows(기본 1,000행)에서 자른다.
 *    페이징하지 않으면 1,000번째 뒤의 문장이 전부 undefined로 와서
 *    "불일치"로 보인다. 실제로 그렇게 한 번 속았다.
 *
 * ⚠️ RPC(POST)에는 Range 헤더가 먹지 않는다. 같은 1,000행이 계속 돌아와
 *    무한 루프가 된다. 집합을 돌려주는 함수는 쿼리 파라미터 limit/offset을 쓴다.
 */
async function serverScores(o) {
  const scores = new Map();
  const PAGE = 1000;
  const body = JSON.stringify({
    p_ignore_punctuation: o.punctuation,
    p_ignore_numbers: o.numbers,
    p_ignore_english: o.english,
    p_ignore_symbols: o.symbols,
  });

  for (let offset = 0; ; offset += PAGE) {
    const res = await fetch(
      `${URL_BASE}/rest/v1/rpc/sentence_scores?limit=${PAGE}&offset=${offset}`,
      { method: "POST", headers: H, body },
    );
    const page = await res.json().catch(() => null);
    if (!res.ok) {
      console.error(`\nsentence_scores 실패 ${res.status}`, JSON.stringify(page));
      console.error("0024를 적용하지 않았거나 service_role에 권한이 없습니다.");
      process.exit(1);
    }
    if (!Array.isArray(page)) {
      console.error("\n예상과 다른 응답", JSON.stringify(page));
      process.exit(1);
    }

    const before = scores.size;
    for (const row of page) scores.set(row.id, row.score);
    // 같은 페이지가 다시 오면(=페이징이 안 먹으면) 여기서 멈춘다. 무한 루프 방지.
    if (page.length < PAGE || scores.size === before) break;
  }

  return scores;
}

const textById = new Map(rows.map((row) => [row.id, row.text]));
let failures = 0;
let checked = 0;

for (const combo of COMBOS) {
  const label =
    Object.entries(combo)
      .filter(([, on]) => on)
      .map(([k]) => k)
      .join("+") || "(무시 없음)";

  const server = await serverScores(combo);
  if (server.size !== textById.size) {
    console.error(
      `\n서버가 ${server.size}개만 돌려줬습니다 (문장은 ${textById.size}개). 페이징이 끊겼습니다.`,
    );
    process.exit(1);
  }
  for (const [id, text] of textById) {
    const client = scoreForSentence(text, combo);
    const actual = server.get(id);
    checked += 1;
    if (actual !== client) {
      failures += 1;
      if (failures <= 10) {
        console.log(
          `  ✗ id=${id} [${label}] 서버=${actual} 클라이언트=${client}`,
          JSON.stringify(text.slice(0, 40)),
        );
      }
    }
  }
  console.log(`  ${label} 확인`);
}

console.log("");
console.log(`대조 ${checked.toLocaleString("ko-KR")}건 — 불일치 ${failures}건`);
console.log(failures === 0 ? "✅ 서버와 클라이언트의 점수 계산이 같습니다." : "❌ 다릅니다. 전환하면 안 됩니다.");
process.exit(failures === 0 ? 0 : 1);
