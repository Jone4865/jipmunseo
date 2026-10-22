// 벤치마킹(2026-10-22): 목표 용량에 맞추기(BentoPDF), 결과로 이어서 다른 도구(iLovePDF·Smallpdf)
import { test } from "vitest";
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { fitToSize, parseTargetMb, mbToBytes, nextToolsFor, pickNextSource, FIT_STEPS, FIT_TARGETS_MB, imgFitSteps, kbPref } from "../src/lib.js";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const read = (f: string) => fs.readFileSync(path.join(root, f), "utf8");

/** 단계 이름 → 결과 크기 표로 가짜 줄이기 */
function fake(sizes: Record<string, number>) {
  const tried: string[] = [];
  return { tried, run: async (s: string) => { tried.push(s); return { size: sizes[s], out: s }; } };
}

test("목표 안에 드는 것 중 가장 덜 줄인 단계를 골라요 — 가장 센 단계를 먼저 해 보고 들어오면 약한 것부터", async () => {
  const f = fake({ a1: 900, a2: 600, a3: 400, b1: 300, b2: 200 });
  const r = await fitToSize([["a1", "a2", "a3"], ["b1", "b2"]], 700, f.run);
  assert.equal(r.step, "a2"); assert.equal(r.fits, true); assert.equal(r.group, 0);
  assert.deepEqual(f.tried, ["a3", "a1", "a2"]);
  assert.equal(r.tries, 3);
});

test("앞 묶음(사진만 줄이기)의 가장 센 단계로도 넘치면 그 묶음은 건너뛰고 다음 묶음(쪽을 그림으로)으로", async () => {
  const f = fake({ a1: 900, a2: 800, a3: 750, b1: 500, b2: 300 });
  const r = await fitToSize([["a1", "a2", "a3"], ["b1", "b2"]], 600, f.run);
  assert.equal(r.step, "b1"); assert.equal(r.group, 1); assert.equal(r.fits, true);
  assert.deepEqual(f.tried, ["a3", "b2", "b1"]);
});

test("어느 것도 목표에 못 들면 가장 작았던 결과를 fits:false 로", async () => {
  const f = fake({ a1: 900, a2: 800, b1: 700, b2: 650 });
  const r = await fitToSize([["a1", "a2"], ["b1", "b2"]], 100, f.run);
  assert.equal(r.fits, false); assert.equal(r.step, "b2"); assert.equal(r.size, 650);
});

test("가장 약한 단계로도 들어오면 그걸 — 목표가 원본보다 커도 쓸데없이 화질을 버리지 않아요", async () => {
  const f = fake({ a1: 90, a2: 80, a3: 70 });
  const r = await fitToSize([["a1", "a2", "a3"]], 1000, f.run);
  assert.equal(r.step, "a1"); assert.deepEqual(f.tried, ["a3", "a1"]);
});

test("목표 칸: 0.1~500MB, 소수 한 자리, 쉼표 소수점도", () => {
  assert.equal(parseTargetMb("5"), 5);
  assert.equal(parseTargetMb(" 1.5 "), 1.5);
  assert.equal(parseTargetMb("2,5"), 2.5);
  assert.equal(parseTargetMb("0.04"), null);
  assert.equal(parseTargetMb("0"), null);
  assert.equal(parseTargetMb("501"), null);
  assert.equal(parseTargetMb("abc"), null);
  assert.equal(parseTargetMb(""), null);
  assert.equal(parseTargetMb(null), null);
  // 1000² 로 세요 — 1024² 로 세는 사이트에서도 넘지 않게
  assert.equal(mbToBytes(5), 5_000_000);
  assert.ok(mbToBytes(5) < 5 * 1024 * 1024);
});

test("맞추기 단계는 앞에서 뒤로 갈수록 작아져요(긴 변·dpi·화질이 줄기만 해요)", () => {
  for (const steps of Object.values(FIT_STEPS)) {
    for (let i = 1; i < steps.length; i++) {
      assert.ok(steps[i].quality <= steps[i - 1].quality);
      assert.ok(steps[i].maxSide <= steps[i - 1].maxSide && steps[i].dpi <= steps[i - 1].dpi);
    }
  }
  assert.deepEqual([...FIT_TARGETS_MB], [1, 2, 5, 10]);
});

test("이어서 쓸 도구: PDF 는 줄이기·합치기·가리기·나누기·회전, 사진은 PDF로·압축·가리기·정보 지우기 — 지금 도구는 빼요", () => {
  assert.deepEqual(nextToolsFor({ name: "a-합침.pdf" }, "pdf-merge"), ["pdf-compress", "id-mask", "pdf-split", "pdf-organize"]);
  assert.deepEqual(nextToolsFor({ name: "계약서.pdf", type: "application/pdf" }, "hwp-view"), ["pdf-compress", "pdf-merge", "id-mask", "pdf-split", "pdf-organize"]);
  assert.deepEqual(nextToolsFor({ name: "얼굴.png", type: "image/png" }, "bg-remove"), ["img-to-pdf", "img-compress", "id-mask", "exif-clean"]);
  assert.deepEqual(nextToolsFor({ name: "쪽.zip" }, "hwp-view"), []);
  assert.deepEqual(nextToolsFor({ name: "문서.docx" }, "hwp-view"), []);
});

test("넘길 결과 고르기: PDF 가 하나면 그것(가리기 JPG+PDF), 여러 개(나누기)·사진 여러 장이면 넘기지 않아요", () => {
  assert.equal(pickNextSource([{ name: "a-사본.jpg" }, { name: "a-사본.pdf" }])?.name, "a-사본.pdf");
  assert.equal(pickNextSource([{ name: "1.pdf" }, { name: "2.pdf" }]), null);
  assert.equal(pickNextSource([{ name: "1.jpg" }, { name: "2.jpg" }]), null);
  assert.equal(pickNextSource([{ name: "1.webp", type: "image/webp" }])?.name, "1.webp");
  assert.equal(pickNextSource([{ name: "쪽-12장.zip" }]), null);
  assert.equal(pickNextSource([]), null);
});

test("결과 줄이 파일을 기억하고, 결과가 그려지거나 줄이 붙을 때 '이 파일로 이어서' 줄을 다시 봐요", () => {
  const ui = read("src/ui.ts"), app = read("src/app.ts");
  assert.match(ui, /resultFiles\.set\(row, \{ name, blob \}\)/);
  assert.match(app, /addNextRow\(res as HTMLElement, shownTool\)/);
  assert.match(app, /for \(const res of grown\) addNextRow\(res, shownTool\)/);
  assert.match(app, /handoff = \[new File\(\[src\.blob\], src\.name/);
  const pdf = read("src/tools-pdf.ts");
  assert.match(pdf, /\{ value: "fit", label: "용량 맞추기" \}/);
  assert.match(pdf, /writePref\(PREF\.pdfTarget, String\(n\)\)/);
  assert.match(read("public/privacy.html"), /방법·정도·목표 용량/);
});

test("사진 용량 한도: 고른 화질부터 10씩 40까지 낮추고, 그래도 넘치면 크기를 줄여요(PNG 는 크기만)", async () => {
  assert.deepEqual(imgFitSteps(80, true)[0].map((s) => s.quality), [80, 70, 60, 50, 40]);
  assert.deepEqual(imgFitSteps(35, true)[0].map((s) => s.quality), [35]);
  assert.ok(imgFitSteps(80, true)[1].every((s) => s.quality === 70 && s.scale < 1));
  assert.deepEqual(imgFitSteps(90, false)[0], [{ quality: 90, scale: 1 }]);
  // 크기 = 화질 × 넓이 로 흉내: 200KB 한도면 크기 그대로 화질 50
  const r = await fitToSize(imgFitSteps(80, true), 200_000, async (s) => ({ size: s.quality * 4000 * s.scale * s.scale, out: s }));
  assert.deepEqual(r.out, { quality: 50, scale: 1 }); assert.equal(r.fits, true);
  assert.equal(kbPref("200"), "200"); assert.equal(kbPref(" 1000 "), "1000");
  assert.equal(kbPref("5"), ""); assert.equal(kbPref("0.5"), ""); assert.equal(kbPref("abc"), ""); assert.equal(kbPref(""), ""); assert.equal(kbPref("60000"), "");
  const img = read("src/tools-img.ts");
  assert.match(img, /writePref\(PREF\.imgMaxKb, maxKb\.value\)/);
  assert.match(read("public/privacy.html"), /저장 형식·화질·최대 크기·용량 한도/);
});
