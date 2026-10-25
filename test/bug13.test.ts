// 버그 찾기 13차(2026-10-25)
import { describe, it, expect } from "vitest";
import fs from "node:fs";
// @ts-expect-error -- vendor 번들이라 타입 파일이 없어요
import * as PLraw from "../public/vendor/pdf-lib-1.17.1.esm.min.js";

const PL = PLraw as typeof import("vendor:pdf-lib");
const read = (f: string) => fs.readFileSync(new URL("../" + f, import.meta.url), "utf8");

describe("머리만 PDF 이고 몸이 깨진 파일", () => {
  const broken = new TextEncoder().encode("%PDF-1.4\ngarbage not a pdf\n");
  it("pdf-lib 은 열기는 통과하고 쪽 목록을 볼 때 영어 오류를 던져요(그래서 열 때 쪽 수까지 읽어야 해요)", async () => {
    const d = await PL.PDFDocument.load(broken.buffer, { updateMetadata: false });
    expect(() => d.getPageCount()).toThrow(/Pages/);
  });
  it("워커의 load 가 쪽 수까지 읽어 '읽지 못했어요' 안내로 바꿔요(합치기 줄·용량 줄이기에 'Cannot read properties…'가 나왔어요)", () => {
    const src = read("src/pdf-worker.ts");
    const body = src.slice(src.indexOf("async function load("), src.indexOf("// 새로 만드는 PDF"));
    expect(body).toMatch(/try \{[\s\S]*PDFDocument\.load\([\s\S]*d\.getPageCount\(\);[\s\S]*\} catch/);
    expect(body).toMatch(/PDF를 읽지 못했어요/);
  });
});

describe("첫 화면 '파일 고르기'", () => {
  it("accept 를 두지 않아요 — 휴대폰 선택기가 .hwp 를 회색으로 막지 않게(HWP 보기·/hwp 와 같아요)", () => {
    const src = read("src/app.ts");
    const fn = src.slice(src.indexOf("function mountHeroStart"), src.indexOf("function offerTools"));
    expect(fn).toMatch(/h\("input", \{ type: "file", multiple: true/);
    expect(fn).not.toMatch(/accept:/);
  });
});

describe("indexedDB 를 읽기만 해도 던지는 브라우저(사이트 데이터를 막은 Firefox)", () => {
  it("첫 화면 코드가 남은 넘기기 저장소를 볼 때 던져도 멈추지 않아요(멈추면 HWP 보기·끌어다 놓기·서비스 워커가 다 빠져요)", () => {
    const src = read("src/app.ts");
    expect(src).toMatch(/try \{\n\s*\(indexedDB as IDBFactory[^\n]*\.databases\?\.\(\)[\s\S]*?\.catch\(\(\) => \{\}\);\n\s*\} catch \{\}/);
    // 맨 위 코드에서 indexedDB 를 try 밖에서 읽는 곳이 없어요
    const lines = src.split("\n").filter((l) => /\bindexedDB\b/.test(l) && !/^\s*(\/\/|\*)/.test(l));
    expect(lines.length).toBe(1);
  });
});
