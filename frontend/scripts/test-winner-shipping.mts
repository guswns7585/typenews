import assert from "node:assert/strict";
import {
  groupSponsorShipping,
  sponsorShippingMessage,
  sponsorShippingTsv,
  type SponsorShippingRow,
} from "../components/admin/winner-shipping";

const rows: SponsorShippingRow[] = [
  {
    winner_id: 2,
    month_id: "202607",
    prize_name: "B 경품",
    prize_sponsor: "협찬사 나",
    recipient: "홍 길동",
    phone: "010-2222-3333",
    postal_code: "12345",
    address1: "서울시\n중구",
    address2: "101호",
    memo: "문 앞\t보관",
  },
  {
    winner_id: 1,
    month_id: "202607",
    prize_name: "A 경품",
    prize_sponsor: "협찬사 나",
    recipient: "=FORMULA",
    phone: "010-1111-2222",
    postal_code: "54321",
    address1: "부산시 해운대구",
    address2: null,
    memo: null,
  },
  {
    winner_id: 3,
    month_id: "202607",
    prize_name: "미지정 경품",
    prize_sponsor: null,
    recipient: "김타입",
    phone: "010-0000-0000",
    postal_code: "00000",
    address1: "대전시",
    address2: null,
    memo: null,
  },
];

const groups = groupSponsorShipping(rows);
assert.equal(groups.length, 2);
assert.equal(groups[0].sponsor, "협찬사 나");
assert.deepEqual(groups[0].rows.map((row) => row.winner_id), [1, 2]);
assert.equal(groups[1].sponsorMissing, true);

const message = sponsorShippingMessage("202607", groups[0]);
assert.match(message, /총 2건/);
assert.match(message, /주소: \(12345\) 서울시 중구 101호/);
assert.match(message, /배송 메모: 없음/);

const tsv = sponsorShippingTsv(groups[0]);
assert.match(tsv, /^경품\t받는 분\t연락처/);
assert.match(tsv, /'\=FORMULA/);
assert.doesNotMatch(tsv, /서울시\n중구/);

console.log("winner shipping tests passed");
