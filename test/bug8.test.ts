// 버그 찾기 8차(2026-10-22) — 실제 화면에서 눌러 보며 찾은 것
import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import { woff2Chars } from "../dev/font-chars.mjs";

const read = (f: string) => readFileSync(new URL(`../${f}`, import.meta.url), "utf8");
const files = (JSON.parse(read("dev/fonts-chars.json")) as { files: Record<string, string> }).files;
const charsOf = (name: string) => woff2Chars(new URL(`../public/fonts/${name}`, import.meta.url));

describe("파일 이름의 악센트 로마자(Café·Zoë)도 JL Sans 로", () => {
  it("한글 더 파일에 é·ë·ü·ñ·ł 이 있고, CSS 범위도 그 글자를 덮어요 — 예전에는 그 글자만 Helvetica 로 가늘게 그려졌어요", async () => {
    const ko = await charsOf(files["jl-sans-ko"]!);
    for (const c of "éëüñłÉÖ") expect(ko.has(c.codePointAt(0)!), c).toBe(true);
    for (const f of ["public/css/style.css", "public/licenses.html"]) expect(read(f)).toContain("unicode-range:U+A1-17F,U+3131-318E,U+AC00-D7A3");
  });
  it("용량 '1.39 KB' 사이 줄바꿈 없는 칸(U+A0)은 첫 파일에 있어요 — 한글 더 파일을 괜히 받지 않게", async () => {
    expect((await charsOf(files["jl-sans"]!)).has(0xa0)).toBe(true);
  });
});

it("라이선스 화면의 고지문(.txt) 링크는 새 창 — 홈 화면 앱에서 같은 창으로 열면 돌아올 단추가 없어요", () => {
  expect(read("public/licenses.html")).toMatch(/<a href="\/third-party-licenses\.txt" target="_blank" rel="noopener">/);
});
