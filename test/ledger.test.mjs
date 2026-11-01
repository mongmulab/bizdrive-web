// cd web && node --test  —— 앱(Kotlin)이 만든 QR 글자를 이 페이지가 같은 값으로 푸는지 고정한다.
// 같은 VECTOR 를 core 의 QrContractTest 도 푼다. 한쪽 형식이 바뀌면 둘 중 하나가 깨진다.
import { test } from "node:test";
import assert from "node:assert/strict";
import { decode, toCsv, summarize, km, dateLabel, fiscalYearOf } from "../ledger.js";

export const VECTOR =
  "Y-R5s3PL6w29EJLL0NzM3MTAwMzAjO_N1JY3c7e8mbHkdXengimnodGrDQ3GJqZmjK_4uZnY3sxofDO9lfPVzoY3s7a8WdDCwAlU_Lqn4fWyNczMjF86-GtqahgYmJkYjjEdAxEMLAx3GDU0gEIA";

test("앱이 만든 QR 을 같은 값으로 푼다", async () => {
  const l = await decode(VECTOR);
  assert.deepEqual(l.profile, { companyName: "카밍카밍", bizRegNo: "1767400606", model: "아이오닉 5", plateNo: "12가3456", fiscalYearStartMonth: 1 });
  assert.equal(l.year, 2026);
  assert.equal(l.month, 11);
  assert.deepEqual(l.drivers, [{ dept: "영업", name: "김운전" }, { dept: "", name: "이대리" }]);
  assert.equal(l.rows.length, 3);
  assert.deepEqual(l.rows[0], { day: 3, driver: l.drivers[0], start: 123450, end: 123574, distance: 124, commute: 124, business: 0, unclassified: false, gap: false });
  assert.equal(l.rows[1].driver.name, "이대리");
  assert.equal(l.rows[1].start, 123574);
  assert.equal(l.rows[2].driver, null);
  assert.equal(l.rows[2].start, 124010); // 앞 행 끝에서 거꾸로 이어 붙인 값(zigzag)
  assert.equal(l.rows[2].gap, true);
  assert.equal(l.rows[2].unclassified, true);
});

test("서식 CSV 는 BOM·칸 순서·합계를 앱과 같게 쓴다", async () => {
  const csv = toCsv([await decode(VECTOR)]);
  assert.ok(csv.startsWith("﻿업무용승용차 운행기록부\r\n"));
  assert.ok(csv.includes("2026-11-03(화),영업,김운전,12345.0,12357.4,12.4,12.4,0.0,\r\n"));
  assert.ok(csv.includes("2026-11-04(수),,미지정,12401.0,12405.0,4.0,0.0,0.0,미기록 구간 · 미분류 포함\r\n"));
  assert.ok(csv.includes("업무사용비율(%),91.84\r\n"));
});

test("수식으로 시작하는 글은 엑셀이 수식으로 읽지 않게 막는다", async () => {
  const l = await decode(VECTOR);
  l.profile.companyName = '=HYPERLINK("http://x","y")';
  l.drivers[0].name = "@SUM(A1)";
  l.drivers[0].dept = "-부서";
  const csv = toCsv([l]);
  assert.ok(csv.includes(`"'=HYPERLINK(""http://x"",""y"")"`), csv);
  assert.ok(csv.includes(",'-부서,'@SUM(A1),"), csv);
  assert.ok(csv.includes(",12345.0,12357.4,"), "숫자 칸은 그대로");
});

test("합계와 비율", () => {
  assert.deepEqual(summarize([]), { total: 0, commute: 0, business: 0, use: 0, ratio: 0 });
  assert.equal(km(5), "0.5");
  assert.equal(dateLabel(2024, 2, 29), "2024-02-29(목)");
});

test("사업연도: 시작 월 앞의 달은 전년도에 속한다", () => {
  assert.equal(fiscalYearOf(2026, 11, 1).label, "2026.01 ~ 2026.12");
  assert.equal(fiscalYearOf(2026, 2, 4).label, "2025.04 ~ 2026.03");
  assert.equal(fiscalYearOf(2026, 4, 4).key, "2026-04");
});

test("손상된 글자는 알아들을 수 있는 말로 실패한다", async () => {
  await assert.rejects(decode("AAAA"));
  await assert.rejects(decode(VECTOR.slice(0, 20)));
});
