// 버그 찾기 4차(2026-10-20) — 사람처럼 눌러 보며 찾은 것
import { describe, expect, it, vi } from "vitest";
import { readFileSync } from "node:fs";
import { once } from "../src/ui";

const read = (f: string) => readFileSync(new URL(`../${f}`, import.meta.url), "utf8");

describe("내려받기·ZIP·보내기 두 번 누르기", () => {
  it("일이 끝나고 1초까지는 다시 하지 않아요(같은 파일이 두 번 받아졌어요)", async () => {
    vi.useFakeTimers();
    try {
      const fn = vi.fn();
      const go = once(fn);
      await go(); await go(); await go();
      expect(fn).toHaveBeenCalledTimes(1);
      vi.advanceTimersByTime(999);
      await go();
      expect(fn).toHaveBeenCalledTimes(1);
      vi.advanceTimersByTime(1);
      await go();
      expect(fn).toHaveBeenCalledTimes(2);
    } finally { vi.useRealTimers(); }
  });

  it("오래 걸리는 일(ZIP 묶기·공유 창)은 끝날 때까지 기다린 뒤 1초", async () => {
    vi.useFakeTimers();
    try {
      let done!: () => void;
      const fn = vi.fn(() => new Promise<void>((r) => { done = r; }));
      const go = once(fn);
      const first = go();
      await go();
      expect(fn).toHaveBeenCalledTimes(1);
      done(); await first;
      vi.advanceTimersByTime(1000);
      void go();
      expect(fn).toHaveBeenCalledTimes(2);
    } finally { vi.useRealTimers(); }
  });

  it("모든 결과의 내려받기, 사진 ZIP, HWP 쪽 그림 보내기에 써요", () => {
    expect(read("src/ui.ts")).toMatch(/onclick: once\(\(\) => download\(blob, name\)\)/);
    expect(read("src/tools-img.ts").match(/onclick: once\(async \(\) => \{ zipBtn\.disabled = true;/g)).toHaveLength(2);
    expect(read("src/tools-hwp.ts")).toMatch(/onclick: once\(async \(\) => \{\n\s+const r = await shareFiles\(files\);/);
  });
});

describe("초점이 문서 맨 앞으로 빠지지 않아요", () => {
  it("'다른 PDF·파일·사진'·'모두 지우기'로 작업 칸이 닫히면 파일 넣는 곳으로", () => {
    expect(read("src/tools-pdf.ts").match(/onclick: \(\) => \{ reset\(\); focusIfLost\(dz\); \} \}, "다른 PDF"\)/g)).toHaveLength(3);
    expect(read("src/tools-pdf.ts")).toMatch(/files = \[\]; out\.replaceChildren\(\); render\(\); focusIfLost\(dz\);/);
    expect(read("src/tools-img.ts").match(/list\.clear\(\); focusIfLost\(dz\);/g)).toHaveLength(3);
    expect(read("src/tools-mask.ts")).toMatch(/reset\(\); focusIfLost\(dz\); \} \}, "다른 파일"/);
    expect(read("src/tools-bg.ts")).toMatch(/reset\(\); focusIfLost\(dz\); \} \}, "다른 사진"/);
    expect(read("src/tools-hwp.ts").match(/reset\(true\); focusIfLost\(dz\); \} \}, "다른 파일"/g)).toHaveLength(2);
  });
  it("파일을 넣어 파일 넣는 곳이 숨으면 파일 줄로", () => {
    expect(read("src/tools-pdf.ts").match(/focusIfLost\(fileLine\);/g)).toHaveLength(3);
    expect(read("src/tools-mask.ts")).toMatch(/focusIfLost\(fileLine\);/);
    expect(read("src/tools-hwp.ts")).toMatch(/focusIfLost\(fileLine\);/);
    expect(read("src/tools-bg.ts")).toMatch(/focusIfLost\(document\.getElementById\("bg-file"\)\)/);
  });
  it("꺼지는 단추(마지막 되돌리기·모두 지우기·끝 쪽)의 초점은 옆 단추로", () => {
    const m = read("src/tools-mask.ts");
    expect(m).toMatch(/setDisabledKeepingFocus\(undoBtn, undoOff, \(\) => \(clearOff \? canvas : clearBtn\)\);/);
    expect(m).toMatch(/setDisabledKeepingFocus\(nextBtn, nextOff, \(\) => \(prevOff \? canvas : prevBtn\)\);/);
    expect(read("src/tools-hwp.ts")).toMatch(/setDisabledKeepingFocus\(nextBtn, nextOff, \(\) => \(prevOff \? pageIn : prevBtn\)\);/);
  });
  it("'다른 형식으로 저장'·첫 화면 '그만두기'", () => {
    expect(read("src/tools-hwp.ts")).toMatch(/focusIfLost\(fmtGroup\.querySelector<HTMLElement>\('\[aria-checked="true"\]'\)\);/);
    expect(read("src/app.ts")).toMatch(/box\.hidden = true; focusIfLost\(\$id\("tool-grid"\)\.querySelector<HTMLElement>\("a"\)\);/);
  });
});

describe("이미지 도구 — 목록·설정을 바꾸면 옛 결과를 걷어요", () => {
  it("사진을 더하거나 빼거나 옮기면(합치기와 같게)", () => {
    const s = read("src/tools-img.ts");
    expect(s).toMatch(/if \(created\.length\) api\.onEdit\(\);/);
    expect(s).toMatch(/remove\(i: number\) \{[^}]*api\.onEdit\(\); api\.render\(\); \}/);
    expect(s).toMatch(/move\(from: number, to: number\) \{ items = moveItem\(items, from, to\); api\.onEdit\(\); api\.render\(\); \}/);
    expect(s.match(/list\.onEdit = \(\) => out\.replaceChildren\(\);/g)).toHaveLength(3);
  });
  it("쪽 크기·여백, 형식·화질·최대 크기를 바꿔도", () => {
    const s = read("src/tools-img.ts");
    expect(s).toMatch(/\(v\) => \{ pageSize = v; out\.replaceChildren\(\); \}/);
    expect(s).toMatch(/\(v\) => \{ margin = v; out\.replaceChildren\(\); \}/);
    expect(s).toMatch(/writePref\(PREF\.imgFmt, v\); syncQ\(\); out\.replaceChildren\(\);/);
    expect(s).toMatch(/qVal\.textContent = `\$\{quality\}%`; out\.replaceChildren\(\);/);
  });
});

describe("여는 중에 다른 파일을 고르면", () => {
  it("신분증 가리기: 두 파일의 쪽이 한 문서로 섞이지 않아요(다 열린 뒤에만 pages 로, 옛 열기는 버려요)", () => {
    const m = read("src/tools-mask.ts");
    expect(m).toMatch(/function reset\(\): void \{\n\s+loadGen\+\+;/);
    expect(m).toMatch(/const opened: Page\[\] = \[\];/);
    expect(m).toMatch(/if \(stale\(\)\) \{ r\.canvas\.width = r\.canvas\.height = 0; return; \}\n\s+opened\.push/);
    expect(m).toMatch(/pages = opened;/);
    expect(m).not.toMatch(/pages\.push\(/);
  });
  it("나누기·정리·줄이기·배경 지우기: 나중에 고른 파일이 이겨요", () => {
    const p = read("src/tools-pdf.ts");
    expect(p.match(/function reset\(\) \{\n\s+loadGen\+\+;/g)).toHaveLength(3);
    expect(p.match(/if \(g !== loadGen\) \{ o\.doc\.destroy\?\.\(\); return; \}/g)).toHaveLength(2);
    expect(p.match(/finally \{ if \(g === loadGen\) prog\.hide\(\); \}/g)).toHaveLength(3);
    const b = read("src/tools-bg.ts");
    expect(b).toMatch(/if \(g !== loadGen\) \{ img\.close\(\); return; \}/);
  });
});
