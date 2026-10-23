// QA 8바퀴(2026-10-23): 안내 페이지(/hwp)에서 바로 파일 고르기, 첫 화면 도구 설명에 '용량 맞추기'
import { describe, it, expect } from "vitest";
import fs from "node:fs";
import { handoffTarget, HANDOFF_DB, HANDOFF_FLAG, HANDOFF_MAX_AGE } from "../src/handoff.js";
import { GUIDE_PAGE_SRC as HWP_PAGE_SRC } from "../vite.config.js";
import { TOOL_INFO } from "../src/tool-list.js";

const read = (f: string) => fs.readFileSync(new URL("../" + f, import.meta.url), "utf8");

describe("/hwp 에서 고른 파일을 도구로 넘기기", () => {
  it("한글 문서 한 개면 HWP 보기로, 그 밖은 첫 화면의 도구 고르기로", () => {
    expect(handoffTarget([{ name: "공고문.hwp" }])).toEqual({ tool: "hwp-view", url: "/#hwp-view" });
    expect(handoffTarget([{ name: "보도자료.HWPX" }])).toEqual({ tool: "hwp-view", url: "/#hwp-view" });
    expect(handoffTarget([{ name: "계약서.pdf" }])).toEqual({ tool: "", url: "/" });
    expect(handoffTarget([{ name: "a.hwp" }, { name: "b.hwp" }])).toEqual({ tool: "", url: "/" });
    expect(handoffTarget([{ name: "hwp" }])).toEqual({ tool: "", url: "/" });
  });

  it("안내 페이지의 'HWP 파일 열기' 두 곳이 고르기 단추이고, 코드가 없어도 링크로 도구가 열려요", () => {
    const html = read("public/hwp.html");
    expect(html.match(/<a class="btn primary big" href="\/#hwp-view" data-pick="hwp-view">HWP 파일 열기<\/a>/g)).toHaveLength(2);
    expect(html.split(`<script type="module" src="${HWP_PAGE_SRC}"></script>`)).toHaveLength(2);
  });

  it("첫 화면은 표시가 있을 때만 넘기기 코드를 받고, 남은 저장소는 꺼내지 않고 지워요", () => {
    const app = read("src/app.ts");
    expect(app).toContain(`sessionStorage.getItem("${HANDOFF_FLAG}")`);
    expect(app).toContain(`d.name === "${HANDOFF_DB}"`);
    expect(app).not.toMatch(/^import[^\n]*handoff/m); // 정적으로 불러오면 첫 화면 묶음에 들어가요
    expect(app).toMatch(/import\("\.\/handoff\.js"\)\.then\(\(m\) => m\.clearHandoff\(\)\)/);
    expect(HANDOFF_MAX_AGE).toBeLessThanOrEqual(5 * 60 * 1000);
  });

  it("이미 그 도구가 열려 있으면 주소가 같아도 지금 칸에 넣어요(openWith)", () => {
    const app = read("src/app.ts");
    expect(app).toMatch(/function openWith\(id: string, files: File\[\]\)/);
    expect(app).toMatch(/if \(ids\.length === 1\) \{ openWith\(ids\[0\], files\); return; \}/);
    expect(app).not.toMatch(/handoff = files; location\.hash = ids\[0\]/);
  });

  it("처리방침에 잠깐 두는 곳(IndexedDB)과 지우는 때를 적어요", () => {
    const pv = read("public/privacy.html");
    expect(pv).toMatch(/2026년 10월 2\d일부터 적용/); // 판이 바뀌면 qa9 가 봐요
    expect(pv).toMatch(/안내 페이지\(\/hwp[^)]*\)에서 파일을 고르면[^<]*IndexedDB[^<]*꺼내자마자 지워요/);
  });
});

describe("첫 화면 도구 설명", () => {
  it("PDF 용량 줄이기·이미지 압축 설명에 맞출 수 있는 용량을 적어요", () => {
    const by = Object.fromEntries(TOOL_INFO.map((t) => [t.id, t.desc]));
    expect(by["pdf-compress"]).toMatch(/2MB·5MB 같은 제출 용량에 맞춰요/);
    expect(by["img-compress"]).toMatch(/200KB 이하처럼 장마다 용량도 맞춰요/);
  });
});
