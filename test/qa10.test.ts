// QA 10바퀴(2026-10-24): 덜어내기 — 이어서 줄은 제출 서류 흐름만, 저장 못 하는 형식 단추 숨기기, HWP '내보내기'를 화면 아래에 붙이기
import { describe, it, expect } from "vitest";
import fs from "node:fs";
import { nextToolsFor } from "../src/lib.js";
import { TOOL_INFO } from "../src/tool-list.js";

const read = (f: string) => fs.readFileSync(new URL("../" + f, import.meta.url), "utf8");

describe("결과 아래 '이 파일로 이어서'", () => {
  it("나누기·회전·정보 지우기는 두지 않아요(결과를 만든 도구에서 이미 쪽·순서를 골랐고, 만든 사진엔 정보가 없어요)", () => {
    for (const cur of ["hwp-view", "pdf-merge", "pdf-compress", "img-to-pdf", "id-mask"]) {
      const ids = nextToolsFor({ name: "a.pdf", type: "application/pdf" }, cur);
      expect(ids).not.toContain("pdf-split");
      expect(ids).not.toContain("pdf-organize");
      expect(ids.length).toBeLessThanOrEqual(3);
    }
    for (const cur of ["img-compress", "bg-remove", "exif-clean", "id-mask"]) {
      expect(nextToolsFor({ name: "a.jpg", type: "image/jpeg" }, cur)).not.toContain("exif-clean");
    }
  });
});

describe("이미지 압축 저장 형식", () => {
  it("브라우저가 저장 못 하는 형식은 줄 그은 단추 대신 숨겨요", () => {
    const ui = read("src/ui.ts");
    expect(ui).toMatch(/hidden\?: boolean/);
    expect(ui).toMatch(/b\.hidden = !!o\.hidden/);
    const img = read("src/tools-img.ts");
    expect(img).toMatch(/o\.disabled = true; o\.hidden = true;/);
    expect(img).not.toMatch(/저장을 지원하지 않아요/);
  });
  it("도구 설명에 거의 어디서도 저장 못 하는 AVIF 를 내세우지 않아요", () => {
    const desc = TOOL_INFO.find((t) => t.id === "img-compress")?.desc ?? "";
    expect(desc).not.toMatch(/AVIF로/);
  });
});

describe("HWP 보기 '내보내기'", () => {
  it("다른 도구의 만들기 단추처럼 화면 아래에 붙어요(보기 칸 바로 아래 자식이 되게 감싸는 칸은 display: contents)", () => {
    const src = read("src/tools-hwp.ts");
    expect(src).toMatch(/const exportRow = stickyActions\(exportBtn\)/);
    expect(read("public/css/style.css")).toMatch(/\.hwp-export-area \{ display: contents; \}/);
  });
});
