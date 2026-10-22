// 버그 찾기 9차(2026-10-22) — 벤치마킹에서 넣은 '용량 맞추기'·'장마다 용량 한도'를 실제 화면에서 눌러 보며 찾은 것
import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import { kbInput, targetMbInput, overButLooksUnder, mbToBytes, formatSize } from "../src/lib.js";

const read = (f: string) => readFileSync(new URL(`../${f}`, import.meta.url), "utf8");

describe("이미지 압축 '장마다 용량 한도' 칸", () => {
  it("'200KB'·'1,000'·' 300 kb '처럼 단위·쉼표를 붙여 적어도 읽어요 — 예전에는 말없이 칸을 비우고 한도 없이 저장했어요", () => {
    expect(kbInput("200KB")).toBe("200");
    expect(kbInput(" 300 kb ")).toBe("300");
    expect(kbInput("1,000")).toBe("1000");
    expect(kbInput("150k")).toBe("150");
    expect(kbInput("199.6")).toBe("200");
  });
  it("10~50000 밖이면 끝 값으로 고쳐 칸에 남겨요(5 → 10, 60000 → 50000), 0·글자는 한도 없음", () => {
    expect(kbInput("5")).toBe("10");
    expect(kbInput("60000")).toBe("50000");
    expect(kbInput("0")).toBe("");
    expect(kbInput("abc")).toBe("");
    expect(kbInput("")).toBe("");
  });
  it("화면은 칸을 떠날 때와 변환하기를 누를 때 이 값으로 칸을 고쳐 적고, 그 값을 써요", () => {
    const src = read("src/tools-img.ts");
    expect(src).toContain("maxKb.value = kbInput(maxKb.value); writePref");
    expect(src).toContain("maxKb.value = kbInput(maxKb.value); // 칸을 떠나지 않고");
  });
});

describe("PDF 용량 맞추기 목표 칸", () => {
  it("칸에 남는 값 = 쓰는 값: '7.25' → 7.3, '600' → 500, '0.04' → 0.1, '2MB' → 2", () => {
    expect(targetMbInput("7.25")).toBe(7.3);
    expect(targetMbInput("600")).toBe(500);
    expect(targetMbInput("0.04")).toBe(0.1);
    expect(targetMbInput("2MB")).toBe(2);
    expect(targetMbInput("1,5 mb")).toBe(1.5);
    expect(targetMbInput("0")).toBeNull();
    expect(targetMbInput("abc")).toBeNull();
  });
  it("칸을 떠나면 쓰는 값으로 다시 적어요(1·2·5·10MB 는 단추가 눌리고 칸은 비워요) — 예전에는 '0'을 적고 나가면 칸에 '5'가 남고 5MB 단추도 눌려 있었어요", () => {
    const src = read("src/tools-pdf.ts");
    expect(src).toContain('targetIn.addEventListener("change", () => setTarget(targetMbInput(targetIn.value) ?? target));');
    expect(src).toMatch(/targetIn\.value = \(FIT_TARGETS_MB as readonly number\[\]\)\.includes\(n\) \? "" : String\(n\)/);
  });
});

describe("목표는 1000 단위, 크기 표시는 1024 단위", () => {
  it("목표를 조금 넘었는데 화면 숫자로는 목표보다 작아 보이면 그 까닭을 붙여요('1MB 이하로 못 줄였어요' 옆 '996 KB')", () => {
    const limit = mbToBytes(1);
    expect(formatSize(1_020_000)).toBe("996 KB");
    expect(overButLooksUnder(1_020_000, limit, 2)).toContain("1,000,000바이트");
    expect(overButLooksUnder(1_100_000, limit, 2)).toBe(""); // 화면 숫자도 1MB 를 넘어요
    expect(overButLooksUnder(900_000, limit, 2)).toBe(""); // 들어요
    expect(overButLooksUnder(203_000, 200_000, 1)).toContain("1,000바이트");
    expect(overButLooksUnder(210_000, 200_000, 1)).toBe("");
  });
  it("사진이 없는 PDF 를 맞추면 '사진 긴 변 2400px · 화질 82%로 저장'이라고 적지 않아요", () => {
    expect(read("src/tools-pdf.ts")).toContain("noPhotos ? `${goal}에 들어요.`");
  });
});
