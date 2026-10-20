// 버그 찾기 3차(2026-10-19) — 실제로 눌러 보며 찾은 것
import fs from "node:fs";
import { test } from "vitest";
import assert from "node:assert/strict";
import { parseRanges } from "../src/lib.js";

const read = (f: string) => fs.readFileSync(f, "utf8");

test("쪽 범위: 전각 숫자·빼기도 받고, 못 읽으면 조사 없이 안내", () => {
  assert.deepEqual(parseRanges("５", 10), [[4]]);
  assert.deepEqual(parseRanges("２－３", 10), [[1, 2]]);
  assert.throws(() => parseRanges("가", 10), (e: Error) => /"가" — 쪽 번호로 읽지 못했어요/.test(e.message) && !/을\(를\)/.test(e.message));
});

test("세그먼트 단추는 한 번만 만들고 눌린 모양만 바꿔요(키보드 초점이 남게)", () => {
  const ui = read("src/ui.ts");
  const seg = ui.slice(ui.indexOf("export function seg<T>"), ui.indexOf("/* ───── 파일 검사"));
  assert.ok(!/render\(\)/.test(seg), "누를 때마다 단추를 새로 만들지 않아요");
  assert.match(seg, /el\.setValue = \(v\) => \{ value = v; sync\(\); \}/);
  assert.match(seg, /b\.disabled = !!o\.disabled/); // 이미지 형식처럼 나중에 꺼지는 칸도 반영
});

test("목록 단추(위로·아래로·빼기·돌리기)는 다시 그린 뒤 같은 항목의 단추로 초점을 돌려요", () => {
  assert.match(read("src/ui.ts"), /export function rowAction/);
  const pdf = read("src/tools-pdf.ts"), img = read("src/tools-img.ts");
  assert.equal((pdf.match(/rowAction\(listEl, "\.fitem"/g) || []).length, 3);
  assert.equal((pdf.match(/rowAction\(grid, "\.thumb"/g) || []).length, 5);
  assert.equal((img.match(/rowAction\(el, "\.fitem"/g) || []).length, 3);
  // HWP 내보내기 형식 카드도 다시 그린 뒤 고른 카드에 초점
  assert.match(read("src/tools-hwp.ts"), /if \(hadFocus\) \(fmtGroup\.querySelector/);
});

test("합치기·정리: 목록을 바꾸면 지난 결과를 걷어요", () => {
  const pdf = read("src/tools-pdf.ts");
  assert.match(pdf, /const relist = \(\) => \{ out\.replaceChildren\(\); render\(\); \};/);
  assert.match(pdf, /const edit = \(\) => \{ out\.replaceChildren\(\); render\(\); \};/);
});

test("나누기: 범위 칸이 틀린 채로는 만들지 않아요", () => {
  assert.match(read("src/tools-pdf.ts"), /go\.disabled = badRange \|\| !sel\.size \|\| n < 1;/);
});

test("가리기 되돌리기는 마지막에 한 일을 되돌려요(톡 지우기·모두 지우기도)", () => {
  const m = read("src/tools-mask.ts");
  assert.match(m, /history: Rect\[\]\[\]/);
  assert.match(m, /p\.history\.push\(\[\.\.\.p\.masks\]\); p\.masks\.splice\(i, 1\)/);
  assert.match(m, /p\.history\.push\(p\.masks\); p\.masks = \[\]/);
  // 버그 4차: 끄기 전에 초점을 옆 단추로 넘기는 도우미로 바꿨어요(되돌릴 게 없으면 꺼요는 그대로)
  assert.match(m, /const undoOff = !page\(\)\?\.history\.length/);
  assert.match(m, /setDisabledKeepingFocus\(undoBtn, undoOff,/);
});

test("첫 화면 도구 고르기 단추는 화살표를 한 덩어리로, 찾은 정보 칩은 잘리지 않게", () => {
  assert.match(read("src/app.ts"), /h\("span", \{\}, \.\.\.arrowed\(byId\[id\]\.title\)\)/);
  assert.match(read("public/css/style.css"), /\.chips \.chip \{ white-space: normal; overflow-wrap: anywhere; \}/);
});
