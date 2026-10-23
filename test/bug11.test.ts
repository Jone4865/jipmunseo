// 버그 찾기 11차(2026-10-23) — QA 9바퀴에서 넣은 PDF 안내 페이지(/pdf-compress·/pdf-merge)를 실제 화면에서 눌러 보며 찾은 것
import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import { handoffTarget } from "../src/handoff.js";

const read = (f: string) => readFileSync(new URL(`../${f}`, import.meta.url), "utf8");

describe("PDF 합치기 안내 페이지에 PDF 와 다른 파일을 같이 넣었을 때", () => {
  it("합치기 도구로 가요 — 예전에는 첫 화면으로 가서 고른 PDF 까지 버렸어요(도구가 맞지 않는 파일만 빼요)", () => {
    expect(handoffTarget([{ name: "a.pdf" }, { name: "b.jpg" }], "pdf-merge")).toEqual({ tool: "pdf-merge", url: "/#pdf-merge" });
    expect(handoffTarget([{ name: "신청서.hwp" }, { name: "등본.pdf" }, { name: "c.pdf" }], "pdf-merge")).toEqual({ tool: "pdf-merge", url: "/#pdf-merge" });
  });
  it("PDF 가 하나도 없으면 예전처럼 HWP 보기나 첫 화면 도구 고르기로", () => {
    expect(handoffTarget([{ name: "공고.hwp" }], "pdf-merge")).toEqual({ tool: "hwp-view", url: "/#hwp-view" });
    expect(handoffTarget([{ name: "a.jpg" }, { name: "b.png" }], "pdf-merge")).toEqual({ tool: "", url: "/" });
  });
});

describe("안내 페이지 HTML", () => {
  it("여는 div 와 닫는 div 수가 같아요 — 두 PDF 페이지 끝에 닫는 div 가 하나 더 있었어요", () => {
    for (const f of ["public/hwp.html", "public/pdf-compress.html", "public/pdf-merge.html"]) {
      const html = read(f);
      expect([f, (html.match(/<div[\s>]/g) || []).length]).toEqual([f, (html.match(/<\/div>/g) || []).length]);
    }
  });
});
