import { test } from "vitest";
import assert from "node:assert/strict";
import {
  parseRanges, rangesToSet, formatRanges, formatSize, savedPercent, baseName, safeName,
  outName, uniqueNames, moveItem, fitWithin, normRotation, extFor, kindOf, layoutImage, mmToPt, formatCoord, toolsForFiles,
} from "../src/lib.js";
import { pushRecent, parseRecent, pickPref, intPref, sizePref } from "../src/prefs.js";

test("parseRanges: 기본", () => {
  assert.deepEqual(parseRanges("1-3, 5, 8-10", 10), [[0, 1, 2], [4], [7, 8, 9]]);
  assert.deepEqual(parseRanges("2", 3), [[1]]);
});
test("parseRanges: 공백·전각 쉼표·물결표·열린 범위·역순", () => {
  assert.deepEqual(parseRanges(" 1 - 2 ，4~5 ", 6), [[0, 1], [3, 4]]);
  assert.deepEqual(parseRanges("8-", 10), [[7, 8, 9]]);
  assert.deepEqual(parseRanges("-2", 10), [[0, 1]]);
  assert.deepEqual(parseRanges("3-1", 5), [[2, 1, 0]]);
  assert.deepEqual(parseRanges("1,,2,", 5), [[0], [1]]);
});
test("parseRanges: 오류", () => {
  assert.throws(() => parseRanges("", 5), /입력/);
  assert.throws(() => parseRanges("0", 5), /1부터 5/);
  assert.throws(() => parseRanges("4-9", 5), /1부터 5/);
  assert.throws(() => parseRanges("a-b", 5), /읽지 못했어요/);
  assert.throws(() => parseRanges("1-2-3", 5), /읽지 못했어요/);
  assert.throws(() => parseRanges("-", 5), /읽지 못했어요/);
  assert.throws(() => parseRanges("1", 0), /페이지가 없어요/);
});
test("rangesToSet / formatRanges", () => {
  assert.deepEqual(rangesToSet([[2, 1], [1, 5]]), [1, 2, 5]);
  assert.equal(formatRanges([0, 1, 2, 4, 7, 8, 9]), "1-3, 5, 8-10");
  assert.equal(formatRanges([]), "");
  assert.equal(formatRanges([3, 3, 1]), "2, 4");
});
test("formatSize", () => {
  assert.equal(formatSize(0), "0 B");
  assert.equal(formatSize(1023), "1023 B");
  assert.equal(formatSize(1024), "1 KB");
  assert.equal(formatSize(1536), "1.5 KB");
  assert.equal(formatSize(10 * 1024 * 1024), "10 MB");
  assert.equal(formatSize(123.4 * 1024 * 1024), "123 MB");
  assert.equal(formatSize(1.25 * 1024 ** 3), "1.25 GB");
  assert.equal(formatSize(-1), "-");
});
test("savedPercent", () => {
  assert.equal(savedPercent(1000, 250), 75);
  assert.equal(savedPercent(1000, 1200), -20);
  assert.equal(savedPercent(0, 10), 0);
  // 거의 다 줄어도 100% 가 아니고, 조금 커져도 0% 줄었다고 하지 않아요
  assert.equal(savedPercent(1000, 4), 99);
  assert.equal(savedPercent(1000, 1003), -1);
  assert.equal(savedPercent(1000, 1000), 0);
  assert.equal(savedPercent(1000, 996), 0);
});
test("baseName / safeName / outName", () => {
  assert.equal(baseName("보고서.final.PDF"), "보고서.final");
  assert.equal(baseName("/a/b/사진.jpg"), "사진");
  assert.equal(baseName(".hidden"), ".hidden");
  assert.equal(baseName(""), "파일");
  assert.equal(safeName('a:b/c*?"d'), "a_b_c_d");
  assert.equal(safeName("  ..이름.  "), "이름");
  assert.equal(outName("보고서.pdf", "합침", "pdf"), "보고서-합침.pdf");
  assert.equal(outName("IMG_0001.HEIC", "", ".jpg"), "IMG_0001.jpg");
  assert.equal(outName("a?.png", "정보삭제", "png"), "a_-정보삭제.png");
});
test("uniqueNames", () => {
  assert.deepEqual(uniqueNames(["a.jpg", "b.jpg", "A.jpg", "a.jpg"]), ["a.jpg", "b.jpg", "A (2).jpg", "a (3).jpg"]);
  assert.deepEqual(uniqueNames(["x", "x"]), ["x", "x (2)"]);
});
test("moveItem (순서 바꾸기)", () => {
  assert.deepEqual(moveItem([1, 2, 3, 4], 0, 2), [2, 3, 1, 4]);
  assert.deepEqual(moveItem([1, 2, 3, 4], 3, 0), [4, 1, 2, 3]);
  assert.deepEqual(moveItem([1, 2, 3], 1, 99), [1, 3, 2]);
  assert.deepEqual(moveItem([1, 2, 3], 0, -5), [1, 2, 3]);
  assert.deepEqual(moveItem([1, 2, 3], 7, 0), [1, 2, 3]);
  const src = [1, 2];
  moveItem(src, 0, 1);
  assert.deepEqual(src, [1, 2], "원본은 그대로");
});
test("fitWithin", () => {
  assert.deepEqual(fitWithin(4000, 3000, 2000, 0), { width: 2000, height: 1500, scaled: true });
  assert.deepEqual(fitWithin(4000, 3000, 0, 1000), { width: 1333, height: 1000, scaled: true });
  assert.deepEqual(fitWithin(800, 600, 2000, 2000), { width: 800, height: 600, scaled: false });
  assert.deepEqual(fitWithin(3000, 4000, 1000, 1000), { width: 750, height: 1000, scaled: true });
});
test("normRotation / extFor / kindOf", () => {
  assert.equal(normRotation(-90), 270);
  assert.equal(normRotation(450), 90);
  assert.equal(normRotation(360), 0);
  assert.equal(extFor("image/jpeg"), "jpg");
  assert.equal(extFor("image/avif"), "avif");
  assert.equal(kindOf({ name: "a.PDF", type: "" }), "pdf");
  assert.equal(kindOf({ name: "IMG.HEIC", type: "" }), "heic");
  assert.equal(kindOf({ name: "x", type: "image/heif" }), "heic");
  assert.equal(kindOf({ name: "x.webp", type: "" }), "image");
  assert.equal(kindOf({ name: "x.txt", type: "text/plain" }), "other");
});
test("layoutImage / mmToPt", () => {
  const a = layoutImage(1000, 2000, "a4", 0);
  assert.equal(a.pageW, 595.28);
  assert.ok(Math.abs(a.h - 841.89) < 1e-6);
  assert.ok(Math.abs(a.x - (595.28 - a.w) / 2) < 1e-6);
  const l = layoutImage(2000, 1000, "a4", mmToPt(10));
  assert.equal(l.pageW, 841.89, "가로 사진은 가로 A4");
  assert.ok(l.w <= 841.89 - 2 * mmToPt(10) + 1e-6);
  const o = layoutImage(800, 600, "original", 10);
  assert.deepEqual([o.pageW, o.pageH, o.x, o.w], [620, 470, 10, 600]);
  assert.ok(Math.abs(mmToPt(25.4) - 72) < 1e-9);
});
test("formatCoord", () => {
  assert.equal(formatCoord(37.5665, 126.978), "37.56650°N, 126.97800°E");
  assert.equal(formatCoord(-33.8688, -151.2093), "33.86880°S, 151.20930°W");
  assert.equal(formatCoord(NaN, 1), "");
});

test("toolsForFiles: 첫 화면에 떨어뜨린 파일로 쓸 도구", () => {
  assert.deepEqual(toolsForFiles([{ name: "공고문.hwp" }]), ["hwp-view"]);
  assert.deepEqual(toolsForFiles([{ name: "서식.HWPX" }]), ["hwp-view"]);
  assert.deepEqual(toolsForFiles([{ name: "a.hwp" }, { name: "b.hwp" }]), []); // 한 번에 하나만 열어요
  assert.deepEqual(toolsForFiles([{ name: "계약서.pdf", type: "application/pdf" }])[0], "pdf-compress");
  assert.deepEqual(toolsForFiles([{ name: "a.pdf" }, { name: "b.pdf" }]), ["pdf-merge"]);
  assert.ok(toolsForFiles([{ name: "신분증.jpg", type: "image/jpeg" }]).includes("id-mask"));
  assert.deepEqual(toolsForFiles([{ name: "a.jpg" }, { name: "b.heic" }]), ["img-to-pdf", "img-compress", "exif-clean"]);
  assert.deepEqual(toolsForFiles([{ name: "a.pdf" }, { name: "b.jpg" }]), []);
  assert.deepEqual(toolsForFiles([{ name: "메모.txt", type: "text/plain" }]), []);
  assert.deepEqual(toolsForFiles([]), []);
});

test("prefs: 최근 도구·기억한 값 읽기", () => {
  assert.deepEqual(pushRecent([], "pdf-merge"), ["pdf-merge"]);
  assert.deepEqual(pushRecent(["a", "b", "c"], "b"), ["b", "a", "c"]);
  assert.deepEqual(pushRecent(["a", "b", "c"], "d"), ["d", "a", "b"]);
  const known = new Set(["a", "b", "c", "d"]);
  assert.deepEqual(parseRecent('["b","x","b","a","c","d"]', known), ["b", "a", "c"]);
  assert.deepEqual(parseRecent("깨진 값", known), []);
  assert.deepEqual(parseRecent('{"a":1}', known), []);
  assert.deepEqual(parseRecent(null, known), []);
  assert.equal(pickPref("raster", ["images", "raster"], "images"), "raster");
  assert.equal(pickPref("뭔가", ["images", "raster"], "images"), "images");
  assert.equal(pickPref(null, ["images", "raster"], "images"), "images");
  assert.equal(intPref("65", 10, 100, 80), 65);
  assert.equal(intPref("5", 10, 100, 80), 80);
  assert.equal(intPref("", 10, 100, 80), 80);
  assert.equal(intPref("7.5", 1, 10, 3), 3);
  assert.equal(sizePref("1280"), "1280");
  assert.equal(sizePref(""), "");
  assert.equal(sizePref("-3"), "");
  assert.equal(sizePref(null), "");
});
