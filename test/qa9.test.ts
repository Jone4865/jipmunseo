// QA 9바퀴(2026-10-24): 검색용 안내 페이지를 PDF 용량 줄이기(/pdf-compress)·합치기(/pdf-merge)에도 — 그 자리에서 바로 파일 고르기
import { describe, it, expect } from "vitest";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { handoffTarget, GUIDE_TOOLS } from "../src/handoff.js";
import { GUIDE_PAGE_SRC, GUIDE_PAGES } from "../vite.config.js";
import { precacheList } from "../config/sw-plugin.js";

const read = (f: string) => fs.readFileSync(new URL("../" + f, import.meta.url), "utf8");

describe("안내 페이지에서 고른 파일을 그 페이지의 도구로", () => {
  it("용량 줄이기 페이지는 PDF 하나를 용량 줄이기로, 합치기 페이지는 PDF 여러 개를 합치기로", () => {
    expect(handoffTarget([{ name: "지원서.pdf" }], "pdf-compress")).toEqual({ tool: "pdf-compress", url: "/#pdf-compress" });
    expect(handoffTarget([{ name: "scan", type: "application/pdf" }], "pdf-compress")).toEqual({ tool: "pdf-compress", url: "/#pdf-compress" });
    expect(handoffTarget([{ name: "a.pdf" }, { name: "b.PDF" }], "pdf-merge")).toEqual({ tool: "pdf-merge", url: "/#pdf-merge" });
    expect(handoffTarget([{ name: "a.pdf" }], "pdf-merge")).toEqual({ tool: "pdf-merge", url: "/#pdf-merge" }); // 하나여도 합치기에서 더 넣어요
  });

  it("그 도구에 맞지 않는 파일은 예전처럼 HWP 보기나 첫 화면 도구 고르기로", () => {
    expect(handoffTarget([{ name: "공고.hwp" }], "pdf-compress")).toEqual({ tool: "hwp-view", url: "/#hwp-view" });
    expect(handoffTarget([{ name: "a.pdf" }, { name: "b.pdf" }], "pdf-compress")).toEqual({ tool: "", url: "/" });
    expect(handoffTarget([{ name: "a.jpg" }, { name: "b.jpg" }], "pdf-merge")).toEqual({ tool: "", url: "/" });
    expect(handoffTarget([{ name: "계약서.pdf" }])).toEqual({ tool: "", url: "/" }); // /hwp 는 그대로
  });

  it("세 안내 페이지 모두 고르기 단추가 그 도구 주소 링크이고, 화면 코드는 하나예요", () => {
    const slugs: Record<string, string> = { "hwp.html": "hwp-view", "pdf-compress.html": "pdf-compress", "pdf-merge.html": "pdf-merge" };
    expect([...GUIDE_PAGES]).toEqual(Object.keys(slugs));
    for (const page of GUIDE_PAGES) {
      const html = read("public/" + page);
      const tool = slugs[page];
      expect(GUIDE_TOOLS).toContain(tool);
      const picks = html.match(/<a [^>]*data-pick="[^"]*"[^>]*>/g) ?? [];
      expect(picks.length, page).toBe(2);
      for (const a of picks) expect(a, page).toContain(`href="/#${tool}" data-pick="${tool}"`);
      expect(html.split(`<script type="module" src="${GUIDE_PAGE_SRC}"></script>`), page).toHaveLength(2);
      const slug = page.replace(/\.html$/, "");
      expect(html).toContain(`<link rel="canonical" href="https://jipmunseo.pages.dev/${slug}">`);
      expect(read("public/sitemap.xml")).toContain(`<loc>https://jipmunseo.pages.dev/${slug}</loc>`);
      expect(read("config/sw.js")).toContain(`'/${slug}': './${slug}'`);
      expect(read("dev/check-deploy.sh")).toContain(`check /${slug} 200 ^text/html`);
    }
  });

  it("PDF 페이지는 PDF 만 고르게 하고, 합치기만 여러 개", () => {
    const js = read("src/guide-page.ts");
    expect(js).toMatch(/if \(page !== "hwp-view"\) input\.accept = "application\/pdf,\.pdf";/);
    expect(js).toMatch(/input\.multiple = page === "pdf-merge";/);
  });

  it("서비스 워커가 새 안내 페이지를 확장자 없는 주소로 저장해요", () => {
    const dir = fs.mkdtempSync(path.join(os.tmpdir(), "jms-qa9-"));
    for (const f of ["index.html", "hwp.html", "pdf-compress.html", "pdf-merge.html"]) fs.writeFileSync(`${dir}/${f}`, "x");
    expect(precacheList(dir)).toEqual(["./hwp", "./", "./pdf-compress", "./pdf-merge"]);
  });

  it("처리방침이 넘기는 안내 페이지 셋을 적어요", () => {
    const pv = read("public/privacy.html");
    expect(pv).toMatch(/2026년 10월 24일부터 적용/);
    expect(pv).toMatch(/안내 페이지\(\/hwp·\/pdf-compress·\/pdf-merge\)에서 파일을 고르면[^<]*IndexedDB/);
  });
});
