// QA 11바퀴(2026-10-24): 처음 온 사람의 막힘 — 첫 화면에서 바로 파일 고르기, 못 연 파일에 남던 '여는 중…' 막대
import { describe, it, expect } from "vitest";
import fs from "node:fs";
import { toolsForFiles } from "../src/lib.js";

const read = (f: string) => fs.readFileSync(new URL("../" + f, import.meta.url), "utf8");

describe("첫 화면에서 바로 파일 고르기", () => {
  it("index.html 에 단추가 들어갈 자리(#hero-start)가 있어요", () => {
    expect(read("index.html")).toMatch(/id="hero-start"/);
  });

  it("단추는 화면 코드가 만들어요(코드를 못 받으면 눌리지 않는 단추가 남지 않게)", () => {
    const html = read("index.html");
    expect(html).toMatch(/<div class="hero-start" id="hero-start"><\/div>/);
    expect(html).not.toMatch(/파일 고르기/);
    const app = read("src/app.ts");
    expect(app).toMatch(/function mountHeroStart\(\)/);
    expect(app).toMatch(/mountHeroStart\(\);/);
  });

  it("고른 파일은 끌어다 놓았을 때와 같은 길(offerTools)로 가요", () => {
    const app = read("src/app.ts");
    const fn = app.slice(app.indexOf("function mountHeroStart()"), app.indexOf("/* 첫 화면에 떨어뜨린 파일"));
    expect(fn).toMatch(/offerTools\(fs\)/);
    // 파일 칸은 집문서가 다루는 종류를 모두 받아요(한글·PDF·사진)
    expect(fn).toMatch(/\.hwp,\.hwpx/);
    expect(fn).toMatch(/application\/pdf/);
    expect(fn).toMatch(/image\/\*/);
  });

  it("한글 문서 하나는 도구를 고르지 않고 바로 HWP 보기로 가요(누르는 수 1번)", () => {
    expect(toolsForFiles([{ name: "계약서.hwp" }])).toEqual(["hwp-view"]);
    expect(toolsForFiles([{ name: "원서.hwpx" }])).toEqual(["hwp-view"]);
    // PDF 여러 개도 합치기 하나뿐이라 바로 열려요
    expect(toolsForFiles([{ name: "a.pdf", type: "application/pdf" }, { name: "b.pdf", type: "application/pdf" }])).toEqual(["pdf-merge"]);
  });

  it("빈 칸이면 자리를 차지하지 않아요(:empty)", () => {
    expect(read("public/css/style.css")).toMatch(/\.hero-start:empty \{ display: none; \}/);
  });
});

describe("첫 화면 매트(768 폭)", () => {
  it("한 줄로 쌓일 때 가운데로 — 오른쪽이 비어 있지 않게(폭을 지정해야 aspect-ratio 가 0 으로 줄지 않아요)", () => {
    expect(read("public/css/style.css")).toMatch(/\.hero-desk \{ width: 100%; max-width: 520px; margin-inline: auto; \}/);
  });
});

describe("못 연 파일 — '여는 중…' 막대가 남지 않아요", () => {
  // reset() 이 loadGen 을 올려서 finally 의 prog.hide() 가 건너뛰어졌고, reset() 안의 err.hide() 가 방금 띄운 까닭까지 지웠어요
  // → 깨진 PDF·사진을 넣으면 끝나지 않는 진행 막대만 보이고 왜 안 되는지는 어디에도 없었어요
  it("PDF 나누기·회전·용량 줄이기는 걷어낸 뒤에 까닭을 띄워요", () => {
    const src = read("src/tools-pdf.ts");
    const bad = src.match(/err\.show\(errMsg\(e\)\); reset\(\);/g) ?? [];
    expect(bad).toHaveLength(0);
    const good = src.match(/catch \(e\) \{ if \(g === loadGen\) \{ reset\(\); prog\.hide\(\); err\.show\(errMsg\(e\)\); \} \}/g) ?? [];
    expect(good).toHaveLength(3);
  });

  it("신분증 가리기도 같아요", () => {
    const src = read("src/tools-mask.ts");
    expect(src).not.toMatch(/err\.show\(errMsg\(e\)\); reset\(\);/);
    expect(src).toMatch(/catch \(e\) \{ if \(stale\(\)\) return; reset\(\); prog\.hide\(\); err\.show\(errMsg\(e\)\); \}/);
  });
});
