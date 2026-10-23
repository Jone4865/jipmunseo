// 버그 찾기 12차(2026-10-24): 아래에 붙은 HWP '내보내기'가 화면 밖의 열린 칸을 닫던 것
import { describe, it, expect } from "vitest";
import fs from "node:fs";
import { exportPress } from "../src/lib.js";

const read = (f: string) => fs.readFileSync(new URL("../" + f, import.meta.url), "utf8");

describe("HWP 보기 '내보내기'(아래에 붙은 단추)", () => {
  it("닫혀 있으면 열어요", () => {
    expect(exportPress(false, 0, 844)).toBe("open");
    expect(exportPress(false, 2000, 844)).toBe("open");
  });
  it("열린 칸이 화면 아래 밖이면 닫지 않고 보여 줘요(칸을 연 채 위로 올라가 문서를 보다 다시 누른 것)", () => {
    expect(exportPress(true, 1080, 844)).toBe("show");
    expect(exportPress(true, 1345, 900)).toBe("show");
  });
  it("열린 칸이 보이면 닫아요", () => {
    expect(exportPress(true, 82, 844)).toBe("close");
    expect(exportPress(true, 500, 844)).toBe("close");
  });
  it("단추가 exportPress 로 닫을지 정해요", () => {
    expect(read("src/tools-hwp.ts")).toMatch(/exportPress\(!exportBox\.hidden, exportBox\.getBoundingClientRect\(\)\.top, window\.innerHeight\) !== "show"\) toggleExport\(\)/);
  });
});
