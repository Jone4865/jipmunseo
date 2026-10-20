// QA 5바퀴(2026-10-20) — 자주 쓰는 사람 눈으로: PDF 40개·사진 50장을 넣고 손가락으로 써 보며 찾은 것
import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import { sortByName, isSortedByName } from "../src/lib";
import { makeTapGuard } from "../src/tap";
import { countUpTarget } from "../src/motion";
import { toastBottom } from "../src/ui";

const read = (f: string) => readFileSync(new URL(`../${f}`, import.meta.url), "utf8");

describe("이름순(합치기·이미지 → PDF)", () => {
  it("숫자는 숫자로 — '스캔 2' 다음 '스캔 10', 한글 먼저(한국어 순서), 대소문자 구분 없이, 같은 이름은 넣은 순서 그대로", () => {
    const names = ["스캔 10.pdf", "스캔 2.pdf", "스캔 1.pdf", "IMG_0010.jpg", "img_0002.jpg", "가.pdf", "스캔 2.pdf"];
    const items = names.map((n, i) => ({ n, i }));
    const out = sortByName(items, (x) => x.n);
    expect(out.map((x) => x.n)).toEqual(["가.pdf", "스캔 1.pdf", "스캔 2.pdf", "스캔 2.pdf", "스캔 10.pdf", "img_0002.jpg", "IMG_0010.jpg"]);
    expect(out.filter((x) => x.n === "스캔 2.pdf").map((x) => x.i)).toEqual([1, 6]);
    expect(isSortedByName(out, (x) => x.n)).toBe(true);
    expect(isSortedByName(items, (x) => x.n)).toBe(false);
    expect(isSortedByName([], (x: string) => x)).toBe(true);
  });
  it("두 도구 모두 목록 머리에 '이름순'이 있고, 줄이 옮겨지면 그 목록 안의 누름만 걸러요", () => {
    expect(read("src/tools-pdf.ts")).toMatch(/files = sortByName\(files, \(f\) => f\.file\.name\); relist\(\); holdTaps\(undefined, listEl\);/);
    expect(read("src/tools-img.ts")).toMatch(/if \(!list\.sortByName\(\)\) \{ toast\("이미 이름 순서예요"\); return; \}\s*holdTaps\(undefined, list\.el\);/);
  });
});

describe("두 번 톡톡 거르기 — 목록 안만(tap.ts scope)", () => {
  const inside = { id: "row" } as unknown as Node, outside = { id: "bar" } as unknown as Node;
  const list = { contains: (n: Node | null) => n === inside };
  it("줄이 옮겨진 뒤 0.4초: 목록 안 누름은 거르고, 바닥에 붙은 '합치기'는 받아요", () => {
    let t = 0;
    const g = makeTapGuard(() => t);
    g.hold(900, list);
    t = 400;
    expect(g.blocks({ isTrusted: true, detail: 1, target: inside })).toBe(true);
    expect(g.blocks({ isTrusted: true, detail: 1, target: outside })).toBe(false);
    expect(g.blocks({ isTrusted: true, detail: 0, target: inside })).toBe(false); // 자판은 그대로
    t = 900;
    expect(g.blocks({ isTrusted: true, detail: 1, target: inside })).toBe(false);
  });
  it("화면이 바뀔 때(scope 없음)는 예전처럼 어디든 걸러요", () => {
    let t = 0;
    const g = makeTapGuard(() => t);
    g.hold();
    t = 800;
    expect(g.blocks({ isTrusted: true, detail: 1, target: outside })).toBe(true);
    expect(g.active()).toBe(true);
  });
});

describe("긴 목록 아래 단추 줄", () => {
  it("합치기·나누기·회전·용량 줄이기·이미지 세 도구의 단추 줄은 화면 아래에 붙어요", () => {
    expect(read("src/tools-pdf.ts").match(/stickyActions\(go\)/g)).toHaveLength(4);
    expect(read("src/tools-img.ts").match(/stickyActions\(go\)/g)).toHaveLength(3);
    expect(read("public/css/style.css")).toMatch(/\.actions\.stick \{ position: sticky; bottom: -1px;/);
  });
  it("알림은 붙은 단추 줄 위로 올라가요", () => {
    expect(toastBottom(null, 844)).toBe("");
    expect(toastBottom(769, 844)).toBe("85px");
    expect(toastBottom(840, 844)).toBe("24px");
  });
  it("일이 끝나면 진행 표시를 바로 숨겨요 — 0.8초 뒤 숨으면 결과·내려받기가 80px 올라갔어요", () => {
    for (const f of ["src/tools-pdf.ts", "src/tools-img.ts", "src/tools-mask.ts", "src/tools-bg.ts", "src/tools-hwp.ts"]) {
      expect(read(f)).not.toMatch(/setTimeout\(\(\) => (\{ if \(!busy\) )?prog\.hide\(\)/);
    }
  });
});

describe("이미지 → PDF 쪽 크기·여백 기억", () => {
  it("고른 값을 저장하고 다음에 그 값으로 시작해요 — 처리방침에도 적어요", () => {
    const s = read("src/tools-img.ts");
    expect(s).toMatch(/pickPref\(readPref\(PREF\.img2pdfSize\), \["a4", "original"\] as const, "a4"\)/);
    expect(s).toMatch(/writePref\(PREF\.img2pdfSize, v\)/);
    expect(s).toMatch(/writePref\(PREF\.img2pdfMargin, v\)/);
    expect(read("public/privacy.html")).toMatch(/이미지 → PDF의 <b>쪽 크기·여백<\/b>/);
  });
});

describe("움직임(anime.js)", () => {
  it("줄인 비율만 세어 올려요", () => {
    expect(countUpTarget("52% 줄었어요")).toBe(52);
    expect(countUpTarget("1% 줄었어요")).toBeNull();
    expect(countUpTarget("3% 커졌어요")).toBeNull();
    expect(countUpTarget("거의 그대로")).toBeNull();
  });
  it("3.2.2 고정, 결과가 나올 때만 따로 받아요(첫 화면 코드에 넣지 않음), 움직임 줄이기면 하지 않아요", () => {
    expect(JSON.parse(read("package.json")).dependencies.animejs).toBe("3.2.2");
    const m = read("src/motion.ts");
    expect(m).toMatch(/import\("animejs\/lib\/anime\.es\.js"\)/);
    expect(m).not.toMatch(/^import .*animejs/m);
    expect(m).toMatch(/if \(reducedMotion\(\)\) return;/);
  });
});
