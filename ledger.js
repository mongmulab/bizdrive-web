// BizDrive 운행기록 QR → 국세청 「업무용승용차 운행기록부」 서식.
// 형식은 core/.../export/QrPayloadCodec.kt v1 과 같다. 데이터는 URL # 뒤에만 있고 서버로 가지 않는다(D7).

export const VERSION = 1;
const FLAG_UNCLASSIFIED = 1;
const FLAG_GAP = 2;

function b64urlToBytes(s) {
  const b64 = s.replace(/-/g, "+").replace(/_/g, "/") + "===".slice((s.length + 3) % 4);
  const bin = atob(b64);
  const out = new Uint8Array(bin.length);
  for (let i = 0; i < bin.length; i++) out[i] = bin.charCodeAt(i);
  return out;
}

async function inflateRaw(bytes) {
  const stream = new Blob([bytes]).stream().pipeThrough(new DecompressionStream("deflate-raw"));
  return new Uint8Array(await new Response(stream).arrayBuffer());
}

class Reader {
  constructor(b) { this.b = b; this.p = 0; this.utf8 = new TextDecoder("utf-8", { fatal: true }); }
  u8() {
    if (this.p >= this.b.length) throw new Error("데이터가 중간에 끊겼어요");
    return this.b[this.p++];
  }
  // 거리는 0.1 km 정수라 Number 로 충분하다(2^53)
  varint() {
    let result = 0, mul = 1;
    for (let i = 0; i < 10; i++) {
      const x = this.u8();
      result += (x & 0x7f) * mul;
      if ((x & 0x80) === 0) return result;
      mul *= 128;
    }
    throw new Error("숫자 칸이 손상됐어요");
  }
  zigzag() { const v = this.varint(); return v % 2 === 0 ? v / 2 : -(v + 1) / 2; }
  str() {
    const n = this.varint();
    if (this.p + n > this.b.length) throw new Error("데이터가 중간에 끊겼어요");
    const s = this.utf8.decode(this.b.subarray(this.p, this.p + n));
    this.p += n;
    return s;
  }
}

/** QR 글자(# 뒤) → 한 달 원장. 거리는 0.1 km 정수로 둔다 */
export async function decode(text) {
  let bytes;
  try {
    bytes = await inflateRaw(b64urlToBytes(text.trim()));
  } catch {
    // 브라우저 원문 오류("Failed to fetch" 등)는 사람이 읽을 수 없다
    throw new Error("QR 글자가 손상됐거나 일부만 찍혔어요");
  }
  const r = new Reader(bytes);
  const v = r.u8();
  if (v !== VERSION) throw new Error(`이 페이지가 모르는 형식(v${v})이에요. 앱과 페이지를 최신으로 맞춰 주세요`);
  const profile = { companyName: r.str(), bizRegNo: r.str(), model: r.str(), plateNo: r.str(), fiscalYearStartMonth: r.u8() };
  const year = r.varint();
  const month = r.u8();
  const drivers = Array.from({ length: r.varint() }, () => ({ dept: r.str(), name: r.str() }));
  let prevEnd = 0;
  const rows = Array.from({ length: r.varint() }, () => {
    const day = r.u8();
    const di = r.varint();
    const start = prevEnd + r.zigzag();
    const end = start + r.varint();
    const distance = r.varint(), commute = r.varint(), business = r.varint();
    const flags = r.u8();
    prevEnd = end;
    return {
      day, driver: di === 0 ? null : drivers[di - 1] ?? null,
      start, end, distance, commute, business,
      unclassified: (flags & FLAG_UNCLASSIFIED) !== 0, gap: (flags & FLAG_GAP) !== 0,
    };
  });
  return { profile, year, month, drivers, rows };
}

export const km = (tenths) => (tenths / 10).toFixed(1);

const DOW = ["일", "월", "화", "수", "목", "금", "토"];
export function dateLabel(year, month, day) {
  const d = new Date(Date.UTC(year, month - 1, day));
  return `${year}-${String(month).padStart(2, "0")}-${String(day).padStart(2, "0")}(${DOW[d.getUTCDay()]})`;
}

export function note(row) {
  return [row.gap ? "미기록 구간" : "", row.unclassified ? "미분류 포함" : ""].filter(Boolean).join(" · ");
}

/** 원장들의 합계. 업무용 = 출퇴근 + 일반업무, 비율은 소수 2자리 */
export function summarize(ledgers) {
  let total = 0, commute = 0, business = 0;
  for (const l of ledgers) for (const r of l.rows) { total += r.distance; commute += r.commute; business += r.business; }
  const use = commute + business;
  const ratio = total === 0 ? 0 : Math.round((use * 10000) / total) / 100;
  return { total, commute, business, use, ratio };
}

/** 사업연도(시작 월부터 12개월)의 이름. 예: 2026.01 ~ 2026.12 */
export function fiscalYearOf(year, month, startMonth) {
  const startYear = month >= startMonth ? year : year - 1;
  const endMonth = ((startMonth + 10) % 12) + 1;
  const endYear = startMonth === 1 ? startYear : startYear + 1;
  const pad = (m) => String(m).padStart(2, "0");
  return { key: `${startYear}-${pad(startMonth)}`, label: `${startYear}.${pad(startMonth)} ~ ${endYear}.${pad(endMonth)}` };
}

/**
 * CSV 한 칸. 쉼표·따옴표·줄바꿈은 따옴표로 감싼다. 숫자가 아닌 글이 = + - @ 탭으로 시작하면 앞에 ' 를 붙인다 ——
 * QR 은 누구나 만들 수 있어, 상호·이름에 수식을 넣은 QR 을 받아 엑셀로 열면 수식이 돌 수 있다(CSV 수식 주입)
 */
const cell = (v) => {
  let s = String(v);
  if (/^[=+\-@\t\r]/.test(s) && !/^-?\d+(\.\d+)?$/.test(s)) s = "'" + s;
  return /[",\r\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
};

/** 앱의 LedgerCsv 와 같은 칸 순서. 엑셀이 한글을 읽도록 BOM 을 붙인다 */
export function toCsv(ledgers) {
  const sorted = [...ledgers].sort((a, b) => a.year - b.year || a.month - b.month);
  const p = sorted[sorted.length - 1].profile;
  const s = summarize(sorted);
  const first = sorted[0], last = sorted[sorted.length - 1];
  const period = sorted.length === 1 ? `${first.year}년 ${first.month}월`
    : `${first.year}년 ${first.month}월 ~ ${last.year}년 ${last.month}월`;
  const lines = [
    ["업무용승용차 운행기록부"],
    ["기간", period],
    ["법인명", p.companyName, "사업자등록번호", p.bizRegNo],
    ["차종", p.model, "자동차등록번호", p.plateNo],
    [],
    ["사용일자(요일)", "부서", "성명", "주행 전 계기판의 거리(km)", "주행 후 계기판의 거리(km)",
      "주행거리(km)", "출·퇴근용(km)", "일반 업무용(km)", "비고"],
  ];
  for (const l of sorted) for (const r of l.rows) {
    lines.push([dateLabel(l.year, l.month, r.day), r.driver?.dept ?? "", r.driver?.name ?? "미지정",
      km(r.start), km(r.end), km(r.distance), km(r.commute), km(r.business), note(r)]);
  }
  lines.push([], ["총주행거리(km)", km(s.total)], ["업무용 사용거리(km)", km(s.use)], ["업무사용비율(%)", s.ratio.toFixed(2)]);
  return "﻿" + lines.map((l) => l.map(cell).join(",")).join("\r\n") + "\r\n";
}
