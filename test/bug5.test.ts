// 버그 찾기 5차(2026-10-20) — 실제 손가락·마우스로 눌러 보며 찾은 것
import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import { rowMoved } from "../src/ui";

const read = (f: string) => readFileSync(new URL(`../${f}`, import.meta.url), "utf8");

describe("정상 연타는 막지 않아요", () => {
  it("줄이 제자리에 남는 동작(돌리기, 마지막 한 쪽 못 지움)은 두 번 톡톡 거르기를 걸지 않아요", () => {
    expect(rowMoved(1, 1, 10, 10)).toBe(false); // 오른쪽으로 돌리기 — 0.4초 간격 두 번에 180°
    expect(rowMoved(0, null, 1, 1)).toBe(false); // '마지막 한 쪽은 지울 수 없어요'
  });
  it("줄이 옮겨지거나 빠지면 걸어요", () => {
    expect(rowMoved(2, 1, 3, 3)).toBe(true); // 위로
    expect(rowMoved(1, 1, 3, 2)).toBe(true); // 빼기 — 같은 자리로 다음 줄이 올라와요
    expect(rowMoved(0, null, 1, 0)).toBe(true); // 마지막 줄 빼기
    expect(rowMoved(-1, 0, 3, 3)).toBe(true); // 어느 줄인지 모르면 거르는 쪽으로
  });
  it("가리기 되돌리기·모두 지우기는 거르지 않아요(0.4초 간격 세 번이 두 번만 되돌려지고, 되돌린 뒤 칠하기가 막혔어요)", () => {
    const m = read("src/tools-mask.ts");
    expect(m).toMatch(/p\.masks = prev; changed\(\);/);
    expect(m).toMatch(/p\.masks = \[\]; changed\(\);/);
  });
});

describe("PDF 합치기 '모두 지우기'", () => {
  it("큰 PDF 쪽수를 세는 동안 지우면 기다리던 파일이 다시 들어오지 않아요", () => {
    const s = read("src/tools-pdf.ts");
    expect(s).toMatch(/onclick: \(\) => \{ gen\+\+; files = \[\];/);
    expect(s).toMatch(/const g = gen;\s*for \(const file of ok\) \{\s*if \(g !== gen\) return;/);
  });
});
