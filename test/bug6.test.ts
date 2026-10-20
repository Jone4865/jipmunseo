// 버그 찾기 6차(2026-10-21) — 실제 손가락·마우스로 눌러 보며 찾은 것
import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import { makeTapGuard, TAP_SLOP_PX } from "../src/tap";
import { noToolMessage, toolsForFiles } from "../src/lib";

const read = (f: string) => readFileSync(new URL(`../${f}`, import.meta.url), "utf8");

describe("마지막 줄 빼기를 두 번 톡톡 — 누른 자리 둘레도 걸러요", () => {
  const inside = { id: "row" } as unknown as Node, outside = { id: "bar" } as unknown as Node;
  const list = { contains: (n: Node | null) => n === inside };
  it("목록이 짧아져 그 자리로 올라온 '합치기'·다른 도구 링크는 0.4초·0.8초 두 번째 누름을 받지 않아요", () => {
    let t = 0;
    const g = makeTapGuard(() => t);
    g.hold(900, list, { x: 320, y: 500 });
    for (const at of [400, 800]) {
      t = at;
      expect(g.blocks({ isTrusted: true, detail: 1, target: outside, clientX: 322, clientY: 497 })).toBe(true);
    }
    t = 900;
    expect(g.blocks({ isTrusted: true, detail: 1, target: outside, clientX: 320, clientY: 500 })).toBe(false);
  });
  it("다른 자리의 목록 밖 단추('이름순'·멀리 있는 '합치기')와 자판은 바로 받아요", () => {
    let t = 0;
    const g = makeTapGuard(() => t);
    g.hold(900, list, { x: 320, y: 500 });
    t = 300;
    expect(g.blocks({ isTrusted: true, detail: 1, target: outside, clientX: 320, clientY: 500 + TAP_SLOP_PX + 20 })).toBe(false);
    expect(g.blocks({ isTrusted: true, detail: 1, target: outside, clientX: 180, clientY: 380 })).toBe(false);
    expect(g.blocks({ isTrusted: true, detail: 0, target: outside, clientX: 320, clientY: 500 })).toBe(false);
    expect(g.active()).toBe(false); // 화면 전체는 막지 않아요
  });
  it("목록 단추는 누른 자리를 넘겨요(ui.ts rowAction)", () => {
    expect(read("src/ui.ts")).toMatch(/holdTaps\(undefined, container, at\)/);
    expect(read("src/tap.ts")).toMatch(/taps\.active\(e\.target, e\.clientX, e\.clientY\)/);
  });
});

describe("첫 화면에 놓은 파일을 쓸 도구가 없을 때 알림", () => {
  it("맞는 파일인데 섞였거나 HWP 여러 개면 그렇게 알려요", () => {
    const hwp = { name: "a.hwp" }, hwpx = { name: "b.HWPX" }, pdf = { name: "c.pdf", type: "application/pdf" }, jpg = { name: "d.jpg", type: "image/jpeg" };
    for (const fs of [[hwp, hwpx], [hwp, pdf], [pdf, jpg], [{ name: "e.json" }]]) expect(toolsForFiles(fs)).toEqual([]);
    expect(noToolMessage([hwp, hwpx])).toBe("한글 문서는 한 번에 하나씩 열 수 있어요");
    expect(noToolMessage([hwp, pdf])).toBe("종류가 다른 파일이 섞여 있어요. 한 종류씩 넣어 주세요");
    expect(noToolMessage([pdf, jpg])).toBe("종류가 다른 파일이 섞여 있어요. 한 종류씩 넣어 주세요");
    expect(noToolMessage([{ name: "e.json" }])).toBe("이 파일을 쓰는 도구가 없어요. HWP·PDF·사진 파일을 넣어 주세요");
    expect(noToolMessage([pdf, { name: "e.zip" }])).toBe("이 파일을 쓰는 도구가 없어요. HWP·PDF·사진 파일을 넣어 주세요");
    expect(read("src/app.ts")).toMatch(/toast\(noToolMessage\(files\)\)/);
  });
});

describe("이미지 압축 최대 크기 칸", () => {
  it("칸에 남는 값·기억하는 값·쓰는 값이 같아요('0.5'를 넣으면 1×1 그림이 나왔어요)", () => {
    const s = read("src/tools-img.ts");
    expect(s).toMatch(/const saveMax = \(\) => \{ maxW\.value = sizePref\(maxW\.value\); maxH\.value = sizePref\(maxH\.value\);/);
    expect(s).toMatch(/const mw = Number\(sizePref\(maxW\.value\)\) \|\| 0, mh = Number\(sizePref\(maxH\.value\)\) \|\| 0;/);
  });
});

describe("좁은 화면 결과 줄", () => {
  it("600px 아래에서는 '내려받기'가 다음 줄로 내려가 파일 이름·크기가 네 줄로 꺾이지 않아요", () => {
    const css = read("public/css/style.css");
    const narrow = css.slice(css.indexOf("@media (max-width: 600px)"));
    expect(narrow).toMatch(/\.ritem \{ flex-wrap: wrap; \}\s*\.ritem > \.fmeta \{ flex: 1 1 160px; \}\s*\.ritem > \.btn \{ margin-left: auto; \}/);
  });
});
