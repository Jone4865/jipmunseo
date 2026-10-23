// 버그 찾기 10차(2026-10-23) — QA 8바퀴에서 넣은 '/hwp 에서 바로 파일 고르기'를 실제 화면에서 눌러 보며 찾은 것
import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import { handoffFailUrl } from "../src/handoff.js";

const read = (f: string) => readFileSync(new URL(`../${f}`, import.meta.url), "utf8");

describe("/hwp 에서 고른 파일을 넘기지 못했을 때(사이트 저장소가 막힌 브라우저)", () => {
  it("도구 주소에 표시를 달아 가요 — 예전에는 고른 파일이 말없이 사라지고 빈 HWP 보기만 열렸어요", () => {
    expect(handoffFailUrl("/#hwp-view")).toBe("/?handoff=0#hwp-view");
    expect(handoffFailUrl("/")).toBe("/?handoff=0");
  });
  it("안내 페이지는 넘기기에 실패하면 그 주소로, 첫 화면은 표시를 보면 '다시 골라 주세요'를 알리고 주소에서 걷어요", () => {
    expect(read("src/guide-page.ts")).toContain("(await putHandoff(tool, files)) ? url : handoffFailUrl(url)");
    const app = read("src/app.ts");
    expect(app).toContain('new URLSearchParams(location.search).get("handoff") === "0"');
    expect(app).toMatch(/history\.replaceState\(history\.state, "", location\.pathname \+ location\.hash\);[^\n]*\n\s*toast\("파일을 넘겨받지 못했어요/);
  });
});
