// 버그 찾기 14차(2026-10-31)
import { describe, it, expect } from "vitest";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { precacheList } from "../config/sw-plugin.js";
import { pdfToolFailMessage, mergeRetryLabel, mergeGoLabel, needsKoFont } from "../src/lib.js";
import { JL_CORE } from "../src/font-core.js";

const read = (f: string) => fs.readFileSync(new URL("../" + f, import.meta.url), "utf8");

describe("서비스 워커 미리 저장 목록", () => {
  it("홈 화면 아이콘(icon.png·apple-touch-icon.png)은 첫 방문에 미리 받지 않아요 — 페이지가 쓰는 파비콘은 그대로", () => {
    const dir = fs.mkdtempSync(path.join(os.tmpdir(), "jms-sw14-"));
    try {
      for (const f of ["index.html", "_headers", "_redirects", "sw.js", "assets/icon.png", "assets/apple-touch-icon.png", "assets/favicon.png", "assets/icon.svg", "assets/og.png", "js/index-abc.js"]) {
        fs.mkdirSync(path.dirname(path.join(dir, f)), { recursive: true });
        fs.writeFileSync(path.join(dir, f), "x");
      }
      const list = precacheList(dir);
      expect(list).toEqual(["./assets/favicon.png", "./assets/icon.svg", "./", "./js/index-abc.js"]);
      // Cloudflare 설정 파일이 목록에 들어가면 404 로 설치가 통째로 실패해요(다른 서비스에서 나온 버그)
      expect(list.some((u) => /_headers|_redirects/.test(u))).toBe(false);
    } finally { fs.rmSync(dir, { recursive: true, force: true }); }
  });
  it("page 가 쓰는 아이콘은 index.html 이 링크하는 favicon.png·icon.svg 뿐이에요(apple-touch-icon 은 iOS 가 홈 화면에 둘 때만 받아요)", () => {
    const html = read("index.html");
    expect(html).toMatch(/<link rel="icon" href="\/assets\/favicon\.png"/);
    expect(html).toMatch(/<link rel="icon" href="\/assets\/icon\.svg"/);
    expect(html).not.toMatch(/src="\/assets\/icon\.png"/);
  });
});

describe("HWP 내보내기 '쪽 고르기' 칸", () => {
  it("글자 자판(inputmode text) — numeric 이면 아이폰 숫자 자판에 '-'·','가 없어서 '1-40'을 못 넣었어요", () => {
    const src = read("src/tools-hwp.ts");
    const line = src.split("\n").find((l) => l.includes('"aria-label": "저장할 쪽"')) ?? "";
    expect(line).toMatch(/inputmode: "text"/);
    expect(line).not.toMatch(/inputmode: "numeric"/);
    // PDF 나누기 범위 칸도 같아요
    expect(read("src/tools-pdf.ts")).toMatch(/"aria-label": "페이지 범위"/);
    expect(read("src/tools-pdf.ts").split("\n").find((l) => l.includes('"aria-label": "페이지 범위"'))).toMatch(/inputmode: "text"/);
  });
});

describe("PDF 도구를 받지 못했을 때(인터넷 끊김)", () => {
  it("끊겼으면 연결을 보라고, 이어져 있으면 새로 고치라고 해요", () => {
    expect(pdfToolFailMessage(false)).toBe("PDF 도구를 받지 못했어요. 인터넷 연결을 확인하고 다시 해 주세요.");
    expect(pdfToolFailMessage(true)).toMatch(/새로고침/);
  });
  it("합치기는 파일 탓('못 읽은 PDF')으로 세지 않고 '다시 해 보기'로 쪽수를 다시 세요", () => {
    expect(mergeRetryLabel(2)).toBe("다시 해 보기");
    expect(mergeRetryLabel(0)).toBeNull();
    expect(mergeGoLabel(2, 0, 5)).toBe("2개 합치기 (5쪽)");
    const src = read("src/tools-pdf.ts");
    const merge = src.slice(src.indexOf("export function mountMerge"), src.indexOf("/* ═════════ PDF 하나를 열어"));
    expect(merge).toMatch(/if \(e instanceof PdfToolError\) \{ it\.toolFail = true;[^}]*\} else it\.error = errMsg\(e\);/);
    expect(merge).toMatch(/const bad = files\.filter\(\(f\) => f\.error\)\.length;/);
    expect(merge).toMatch(/addEventListener\("online", onOnline\)/);
    expect(merge).toMatch(/unmount: \(\) => removeEventListener\("online", onOnline\)/);
    expect(read("src/ui.ts")).toMatch(/p\.reject\(new PdfToolError\(msg\)\)/);
  });
});

describe("신분증 가리기 워터마크 글꼴", () => {
  it("화면 코드의 첫 파일 글자 목록은 dev/fonts-chars.json 과 같아요(npm run fonts 가 같이 써요)", () => {
    const saved = JSON.parse(read("dev/fonts-chars.json")) as { core: string };
    expect(JL_CORE).toBe(saved.core);
    expect(read("dev/fonts.mjs")).toMatch(/src\/font-core\.ts/);
  });
  it("기본 워터마크(제출용 · 날짜 · 다른 용도 사용 금지)는 첫 파일로 다 그려서 한글 더 파일(370KB)을 받지 않아요", () => {
    expect(needsKoFont("제출용2026.10.31다른 용도 사용 금지", JL_CORE)).toBe(false);
    expect(needsKoFont("OO은행 제출용", JL_CORE)).toBe(false);
  });
  it("첫 파일에 없는 한글·악센트 로마자가 있으면 받아요", () => {
    const rare = [..."똠뷁쀍햏됬"].find((c) => !JL_CORE.includes(c)) as string;
    expect(rare).toBeTruthy();
    expect(needsKoFont(`${rare}은행 제출용`, JL_CORE)).toBe(true);
    expect(needsKoFont("Café", JL_CORE)).toBe(!JL_CORE.includes("é"));
    expect(needsKoFont("ABC 123", JL_CORE)).toBe(false);
  });
  it("가리기는 두 이름을 늘 같이 불러오지 않아요(첫 파일에 다 있으면 JL Sans 만)", () => {
    const src = read("src/tools-mask.ts");
    expect(src).not.toMatch(/document\.fonts\.load\(`800 40px "JL Sans", "JL Sans Ko"`/);
    expect(src).toMatch(/needsKoFont\(text, core\)/);
    expect(src).toMatch(/import\("\.\/font-core\.js"\)/);
  });
});

describe("첫 글꼴에 넣을 화면 글자 모으기(dev/font-chars.mjs)", () => {
  it("문자열 \"image/*\" 의 '/*' 를 주석 시작으로 보지 않아요 — 가리기의 '빨강·파랑'·배경 지우기의 '흰'이 첫 글꼴에서 빠졌어요", async () => {
    const m = await import("../dev/font-chars.mjs");
    expect(m.stripComments(`a("image/*,.heic") /* 주석 */ b("빨강") /** 독 */\nx // 줄 주석\n`)).toBe(`a("image/*,.heic")  b("빨강") \nx \n`);
    const site = m.siteChars(new URL("..", import.meta.url).pathname);
    for (const c of "빨강랑좌락히덮밑던흰") expect(site.has(c), c).toBe(true);
    for (const c of "빨강랑좌락히덮밑던흰") expect(JL_CORE.includes(c), c).toBe(true);
  });
});
