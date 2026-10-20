// QA 4바퀴(2026-10-20) — 휴대폰·데스크톱에서 실제로 눌러 보며 찾은 것
import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import { makeTapGuard, TAP_HOLD_MS } from "../src/tap";

const read = (f: string) => readFileSync(new URL(`../${f}`, import.meta.url), "utf8");

describe("두 번 톡톡 거르기(tap.ts)", () => {
  it("화면이 바뀐 뒤 0.9초 동안 손가락·마우스 누름만 걸러요 — 0.4초·0.8초 간격 둘 다", () => {
    let t = 1000;
    const g = makeTapGuard(() => t);
    const tap = { isTrusted: true, detail: 1 };
    expect(g.blocks(tap)).toBe(false);
    g.hold();
    t += 400; expect(g.blocks(tap)).toBe(true);
    t += 400; expect(g.blocks(tap)).toBe(true);
    expect(g.blocks({ isTrusted: true, detail: 0 })).toBe(false); // 자판 Enter·Space 는 그대로
    expect(g.blocks({ isTrusted: false, detail: 1 })).toBe(false); // 스크립트 누름도 그대로
    t = 1000 + TAP_HOLD_MS; expect(g.blocks(tap)).toBe(false); // 보고 누르는 다음 동작은 받아요
  });
  it("더 길게 잡힌 것은 짧은 hold 가 줄이지 않아요", () => {
    let t = 0;
    const g = makeTapGuard(() => t);
    g.hold(2000); g.hold(100);
    t = 1500; expect(g.active()).toBe(true);
  });
  it("줄이 옮겨지거나 빠질 때, 화면이 바뀔 때, 작업 칸이 닫힐 때 걸어요", () => {
    expect(read("src/ui.ts")).toMatch(/const to = act\(\);[\s\S]{0,500}holdTaps\(undefined, container, at\);/);
    expect(read("src/app.ts")).toMatch(/installTapGuard\(document\);/);
    expect(read("src/app.ts")).toMatch(/if \(!first\) holdTaps\(\);/);
    expect(read("src/tools-pdf.ts").match(/reset\(\); holdTaps\(\); focusIfLost\(dz\);/g)).toHaveLength(3);
    expect(read("src/tools-img.ts").match(/list\.clear\(\); holdTaps\(\);/g)).toHaveLength(3);
    expect(read("src/tools-hwp.ts").match(/reset\(true\); holdTaps\(\);/g)).toHaveLength(2);
    expect(read("src/tools-hwp.ts")).toMatch(/toggleExport\(\);\s*\/\/[^\n]*\n\s*holdTaps\(\);/);
    // 가리기 되돌리기·모두 지우기는 단추 자리가 그대로라 거르지 않아요(버그 5차 — 연달아 되돌리기가 막혔어요)
    expect(read("src/tools-mask.ts").match(/holdTaps\(\); changed\(\);/g)).toBeNull();
  });
});

describe("화면 밖에 생기던 진행 표시·결과·내보내기 칸", () => {
  it("결과가 생기면 보이게 내리고, 초점을 잃었으면 내려받기 단추로", () => {
    const app = read("src/app.ts");
    expect(app).toMatch(/revealIfBelow\(res as HTMLElement\);\s*focusIfLost\(res\?\.querySelector<HTMLElement>\("button\.primary"\) \?\? null\);/);
    expect(read("src/ui.ts")).toMatch(/const was = el\.hidden;\s*el\.hidden = false;\s*if \(was\) revealIfBelow\(el\);/);
    expect(read("src/tools-hwp.ts")).toMatch(/exportBox\.getBoundingClientRect\(\)\.top > window\.innerHeight \* 0\.7/);
  });
});

describe("HWP 보기", () => {
  it("쪽 아래에도 앞 쪽·뒤 쪽 — 넘기면 쪽 맨 위로", () => {
    const s = read("src/tools-hwp.ts");
    expect(s).toMatch(/stage, pager2, chartNote/);
    expect(s).toMatch(/pager\.hidden = pager2\.hidden = d\.info\.pages < 2;/);
    expect(s).toMatch(/bar\.scrollIntoView\(\{ block: "start"/);
  });
  it("쪽 번호 칸 Enter 는 마우스 화면에서 칸을 놓지 않아요(초점이 문서 맨 앞으로 빠지던 것)", () => {
    expect(read("src/tools-hwp.ts")).toMatch(/if \(touchFirst\(\)\) \{ pageIn\.blur\(\); return; \}[\s\S]{0,140}pageIn\.select\(\);/);
  });
});

describe("그 밖에", () => {
  it("나누기: 방법·저장 방식·고른 쪽이 바뀌면 옛 결과를 걷어요", () => {
    const s = read("src/tools-pdf.ts");
    expect(s).toMatch(/mode = v; out\.replaceChildren\(\); update\(\);/);
    expect(s).toMatch(/keep = v; out\.replaceChildren\(\); update\(\);/);
    expect(s).toMatch(/function syncSel\(writeInput: boolean\): void \{\s*out\.replaceChildren\(\);/);
  });
  it("배경 지우기: 못 지웠으면 '다시 지우기'가 아니라 '다시 해 보기'", () => {
    expect(read("src/tools-bg.ts")).toMatch(/go\.textContent = outBlob \? "다시 지우기" : "다시 해 보기";/);
  });
  it("손가락 화면: 순서 안내는 화살표 단추만, 손잡이 숨김, 썸네일·세그먼트 단추 44px(기본 규칙보다 뒤에)", async () => {
    const { moveHint } = await import("../src/tools-pdf");
    expect(moveHint("끌어서 놓거나 화살표 단추로", "화살표 단추로", true)).toBe("화살표 단추로");
    expect(moveHint("끌어서 놓거나 화살표 단추로", "화살표 단추로", false)).toBe("끌어서 놓거나 화살표 단추로");
    const css = read("public/css/style.css");
    const late = css.indexOf("@media (pointer: coarse) { .tbtns .icon-btn { height: 44px; } .seg button { min-height: 44px; } }");
    expect(late).toBeGreaterThan(css.indexOf(".tbtns .icon-btn { width: 36px"));
    expect(late).toBeGreaterThan(css.indexOf(".seg button { min-height: 40px"));
    expect(css).toMatch(/@media \(hover: none\) and \(pointer: coarse\) \{ \.handle \{ display: none; \} \}/);
  });
  it("손가락 화면에서 누른 뒤 hover 모양이 남지 않게 hover 는 마우스 화면에만", () => {
    const css = read("public/css/style.css");
    for (const line of css.split("\n").filter((l) => l.includes(":hover"))) expect(line.startsWith("@media (hover: hover) {")).toBe(true);
  });
  it("도구 코드를 못 받으면 새로 고침 단추", () => {
    expect(read("src/app.ts")).toMatch(/loadFailBox\(navigator\.onLine !== false\)/);
    expect(read("src/app.ts")).toMatch(/onclick: \(\) => location\.reload\(\) \}, "새로 고침"/);
  });
});

/* 서비스 워커: 새 버전이 깔려도 바로 앞 버전의 JS 를 한 세대 남겨요 — 배포 전에 열어 둔 화면이 HWP 보기·PDF 워커 코드를 늦게 불러도 열려요 */
describe("서비스 워커 — 앞 버전 JS 한 세대", () => {
  type Store = Map<string, Response>;
  function fakeCaches() {
    const all = new Map<string, Store>();
    const cacheOf = (name: string) => {
      if (!all.has(name)) all.set(name, new Map());
      const m = all.get(name) as Store;
      return {
        keys: async () => [...m.keys()].map((u) => new Request(u)),
        match: async (r: Request | string) => m.get(typeof r === "string" ? new URL(r, "https://x.test/").href : r.url)?.clone(),
        put: async (r: Request, res: Response) => { m.set(r.url, res); },
        addAll: async () => {},
      };
    };
    return {
      all,
      api: {
        open: async (n: string) => cacheOf(n),
        keys: async () => [...all.keys()],
        delete: async (n: string) => all.delete(n),
      },
    };
  }
  async function activate(version: string, fc: ReturnType<typeof fakeCaches>) {
    const code = read("config/sw.js").replace("__SW_VERSION__", JSON.stringify(version)).replace("__SW_PRECACHE__", "[]");
    const handlers: Record<string, (e: unknown) => void> = {};
    const self = { addEventListener: (t: string, f: (e: unknown) => void) => { handlers[t] = f; }, skipWaiting: () => {}, clients: { claim: async () => {} } };
    new Function("self", "caches", "location", code)(self, fc.api, { origin: "https://x.test" });
    let p: Promise<unknown> = Promise.resolve();
    handlers.activate({ waitUntil: (x: Promise<unknown>) => { p = x; } });
    await p;
  }
  it("앞 버전 캐시의 /js/* 만 jms-prev 로 옮기고, 두 세대 전 것은 버려요", async () => {
    const fc = fakeCaches();
    const a = await fc.api.open("jms-v1-aaa");
    await a.put(new Request("https://x.test/js/tools-hwp-A.js"), new Response("A"));
    await a.put(new Request("https://x.test/css/style.A.css"), new Response("css"));
    await (await fc.api.open("jms-v1-bbb")).put(new Request("https://x.test/js/index-B.js"), new Response("B"));
    await activate("jms-v1-bbb", fc);
    expect([...fc.all.keys()].sort()).toEqual(["jms-prev", "jms-v1-bbb"]);
    expect([...(fc.all.get("jms-prev") as Store).keys()]).toEqual(["https://x.test/js/tools-hwp-A.js"]);
    // 다음 배포: B 의 JS 가 남고 A 의 것은 빠져요
    await (await fc.api.open("jms-v1-ccc")).put(new Request("https://x.test/js/index-C.js"), new Response("C"));
    await activate("jms-v1-ccc", fc);
    expect([...(fc.all.get("jms-prev") as Store).keys()]).toEqual(["https://x.test/js/index-B.js"]);
  });
  it("저장해 둔 게 없을 때 화면 JS 는 jms-prev 에서도 찾아요", () => {
    expect(read("config/sw.js")).toMatch(/url\.pathname\.startsWith\('\/js\/'\) \? await caches\.open\(PREV\)/);
  });
});
