export type SponsorShippingRow = {
  winner_id: number;
  month_id: string;
  prize_name: string;
  prize_sponsor: string | null;
  recipient: string;
  phone: string;
  postal_code: string;
  address1: string;
  address2: string | null;
  memo: string | null;
};

export type SponsorShippingGroup = {
  sponsor: string;
  sponsorMissing: boolean;
  rows: SponsorShippingRow[];
};

const MISSING_SPONSOR = "협찬사 미지정";

function oneLine(value: string | null | undefined) {
  return (value ?? "").replace(/[\t\r\n]+/g, " ").replace(/\s{2,}/g, " ").trim();
}

function spreadsheetCell(value: string | null | undefined) {
  const clean = oneLine(value);
  return /^[=+\-@]/.test(clean) ? `'${clean}` : clean;
}

function fullAddress(row: SponsorShippingRow) {
  return [oneLine(row.address1), oneLine(row.address2)].filter(Boolean).join(" ");
}

export function groupSponsorShipping(rows: SponsorShippingRow[]): SponsorShippingGroup[] {
  const groups = new Map<string, SponsorShippingGroup>();

  for (const row of rows) {
    const rawSponsor = oneLine(row.prize_sponsor);
    const sponsor = rawSponsor || MISSING_SPONSOR;
    const groupKey = rawSponsor ? `sponsor:${rawSponsor}` : "missing";
    const existing = groups.get(groupKey);
    if (existing) {
      existing.rows.push(row);
    } else {
      groups.set(groupKey, {
        sponsor,
        sponsorMissing: !rawSponsor,
        rows: [row],
      });
    }
  }

  return [...groups.values()]
    .map((group) => ({
      ...group,
      rows: [...group.rows].sort(
        (a, b) =>
          oneLine(a.prize_name).localeCompare(oneLine(b.prize_name), "ko") ||
          a.winner_id - b.winner_id,
      ),
    }))
    .sort((a, b) => {
      if (a.sponsorMissing !== b.sponsorMissing) return a.sponsorMissing ? 1 : -1;
      return a.sponsor.localeCompare(b.sponsor, "ko");
    });
}

export function sponsorShippingMessage(monthId: string, group: SponsorShippingGroup) {
  const entries = group.rows.map((row, index) => {
    const memo = oneLine(row.memo) || "없음";
    return `${index + 1}. ${oneLine(row.prize_name)}
받는 분: ${oneLine(row.recipient)}
연락처: ${oneLine(row.phone)}
주소: (${oneLine(row.postal_code)}) ${fullAddress(row)}
배송 메모: ${memo}`;
  });

  return `[TypeNews ${oneLine(monthId)} 경품 배송 명단]
협찬사: ${group.sponsor}
총 ${group.rows.length}건

${entries.join("\n\n")}`;
}

export function sponsorShippingTsv(group: SponsorShippingGroup) {
  const header = ["경품", "받는 분", "연락처", "우편번호", "주소", "상세 주소", "배송 메모"];
  const rows = group.rows.map((row) =>
    [
      row.prize_name,
      row.recipient,
      row.phone,
      row.postal_code,
      row.address1,
      row.address2,
      row.memo,
    ]
      .map(spreadsheetCell)
      .join("\t"),
  );
  return [header.join("\t"), ...rows].join("\n");
}
