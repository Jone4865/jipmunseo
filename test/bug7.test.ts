// 버그 찾기 7차(2026-10-21) — 실제 키보드로 눌러 보며 찾은 것
import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import { coveredBy } from "../src/ui";

const read = (f: string) => readFileSync(new URL(`../${f}`, import.meta.url), "utf8");

describe("Tab 초점이 아래에 붙은 단추 줄 밑에 숨지 않게", () => {
  const bar = { top: 725, bottom: 800 };
  it("통째로 가린 '위로' 단추(40px)는 가린 만큼 + 12px 올려요", () => {
    expect(coveredBy({ top: 740, bottom: 780 }, bar)).toBe(67);
  });
  it("반쯤 가린 쪽 칸도 올려요", () => {
    expect(coveredBy({ top: 575, bottom: 800 }, bar)).toBe(87);
  });
  it("줄 위에 다 보이면 그대로", () => {
    expect(coveredBy({ top: 600, bottom: 725 }, bar)).toBe(0);
    expect(coveredBy({ top: 600, bottom: 700 }, bar)).toBe(0);
  });
  it("키보드 초점만 — 손가락·마우스로 누를 때는 화면을 움직이지 않아요(두 번째 누름이 다른 것에 닿지 않게)", () => {
    const ui = read("src/ui.ts");
    expect(ui).toMatch(/matches\(":focus-visible"\)/);
    expect(ui).toMatch(/bar\.contains\(t\)\) return/); // 붙은 줄 안의 단추로 가면 화면을 움직이지 않아요
  });
});
