// QA 3바퀴(2026-10-19) — 휴대폰으로 실제로 눌러 보며 찾은 것
import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import { dropText } from "../src/ui";

const read = (f: string) => readFileSync(new URL(`../${f}`, import.meta.url), "utf8");

describe("손가락 화면의 파일 넣는 곳", () => {
  it("끌어다 놓을 수 없으니 '…을 골라 주세요'로, '눌러서 고르기'·'붙여넣기'는 빼요", () => {
    expect(dropText("PDF 파일을 여기에 끌어다 놓으세요", "또는 눌러서 고르기 · 여러 개 한꺼번에 가능", true)).toEqual({ title: "PDF 파일을 골라 주세요", sub: "여러 개 한꺼번에 가능" });
    expect(dropText("나눌 PDF 하나를 끌어다 놓으세요", "또는 눌러서 고르기", true)).toEqual({ title: "나눌 PDF 하나를 골라 주세요", sub: "" });
    expect(dropText("사진을 여기에 끌어다 놓으세요", "JPG · PNG · WebP · HEIC · 눌러서 고르기 · 붙여넣기(Ctrl+V)도 돼요", true)).toEqual({ title: "사진을 골라 주세요", sub: "JPG · PNG · WebP · HEIC" });
    expect(dropText("정보를 지울 사진을 끌어다 놓으세요", "여러 장 가능 · JPG · PNG · WebP · HEIC · 붙여넣기도 돼요", true)).toEqual({ title: "정보를 지울 사진을 골라 주세요", sub: "여러 장 가능 · JPG · PNG · WebP · HEIC" });
    expect(dropText("HWP·HWPX 파일을 끌어다 놓으세요", "한글 문서 · .hwp · .hwpx · 100MB까지", true)).toEqual({ title: "HWP·HWPX 파일을 골라 주세요", sub: "한글 문서 · .hwp · .hwpx · 100MB까지" });
  });

  it("마우스 화면은 그대로", () => {
    expect(dropText("PDF 파일을 여기에 끌어다 놓으세요", "또는 눌러서 고르기 · 여러 개 한꺼번에 가능", false)).toEqual({ title: "PDF 파일을 여기에 끌어다 놓으세요", sub: "또는 눌러서 고르기 · 여러 개 한꺼번에 가능" });
  });

  it("모든 도구의 제목이 '끌어다 놓으세요'로 끝나서 바뀌어요(새 도구도 같은 꼴로)", () => {
    for (const f of ["src/tools-pdf.ts", "src/tools-img.ts", "src/tools-mask.ts", "src/tools-bg.ts", "src/tools-hwp.ts"]) {
      for (const m of read(f).matchAll(/title: "([^"]+)"/g)) {
        if (!/놓으세요$/.test(m[1])) continue;
        expect(dropText(m[1], "", true).title).toMatch(/골라 주세요$/);
      }
    }
  });

  it("빈 설명 줄은 그리지 않아요", () => {
    expect(read("src/ui.ts")).toMatch(/sub \? h\("div", \{ class: "drop-sub" \}, sub\) : null,/);
  });
});

describe("손가락 화면 누르는 자리", () => {
  it("목록의 위로·아래로·빼기와 작은 단추가 44px", () => {
    expect(read("public/css/style.css")).toMatch(/@media \(pointer: coarse\) \{ \.fbtns \.icon-btn \{ width: 44px; height: 44px; \} \.btn\.sm \{ min-height: 44px; \}/);
  });
});
