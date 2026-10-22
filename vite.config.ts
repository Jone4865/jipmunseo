import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { defineConfig } from "vitest/config";
import { swPlugin } from "./config/sw-plugin.js";
import { toolGridHtml } from "./src/tool-list.js";

const GRID = '<div class="tools" id="tool-grid"></div>';
/** 첫 화면 작업대의 도구 칸을 index.html 에 미리 넣어요 — 느린 망에서 화면 JS 를 받기 전에도 도구를 보고 누를 수 있게(QA 6바퀴) */
function toolGridPlugin() {
  return {
    name: "jms-tool-grid",
    transformIndexHtml(html: string) {
      if (!html.includes(GRID)) return html;
      return html.replace(GRID, `<div class="tools" id="tool-grid">${toolGridHtml()}</div>`);
    },
  };
}

/** 안내 페이지(/hwp)의 작은 화면 코드(src/hwp-page.ts — 'HWP 파일 열기'에서 바로 파일 고르기, QA 8바퀴).
 *  public/hwp.html 은 Vite 가 손대지 않아서, 빌드한 dist/hwp.html 의 자리표시 주소를 해시 붙은 이름으로 바꿔요(서비스 워커 목록보다 먼저) */
export const HWP_PAGE_SRC = "/js/hwp-page.js";
function hwpPagePlugin() {
  return {
    name: "jms-hwp-page",
    apply: "build" as const,
    writeBundle(opts: { dir?: string }, bundle: Record<string, { type: string; isEntry?: boolean; name?: string; fileName: string }>) {
      const chunk = Object.values(bundle).find((c) => c.type === "chunk" && c.isEntry && c.name === "hwp-page");
      if (!chunk || !opts.dir) throw new Error("hwp-page 묶음을 못 찾았어요");
      const f = path.join(opts.dir, "hwp.html");
      const html = fs.readFileSync(f, "utf8");
      if (html.split(`src="${HWP_PAGE_SRC}"`).length !== 2) throw new Error(`hwp.html 에서 ${HWP_PAGE_SRC} 를 한 번만 찾아야 해요`);
      fs.writeFileSync(f, html.replace(`src="${HWP_PAGE_SRC}"`, `src="/${chunk.fileName}"`));
    },
  };
}

// public/ 의 vendor·css·assets·_headers 는 손대지 않고 그대로 dist/ 로 복사돼요 (같은 주소 유지).
// 우리 코드는 dist/js/ 로 묶여요.
//  - 화면 쪽 vendor 라이브러리는 vendorImport("/vendor/…") 로 처음 쓸 때 그 주소 그대로 불러와요 (@vite-ignore).
//  - PDF 워커의 pdf-lib 은 "vendor:pdf-lib" 별칭으로 import 하고, 빌드 결과에는 예전과 같은
//    import … from "/vendor/pdf-lib-1.17.1.esm.min.js" 로 남겨요 (다시 묶지 않음, CSP 로 고친 빌드 그대로).
//  - 한글 문서 보기 워커의 rhwp 도 같은 방식: "vendor:rhwp" → /vendor/rhwp-0.8.7/rhwp.js (WASM·글꼴도 같은 버전 폴더)
const PDF_LIB = "/vendor/pdf-lib-1.17.1.esm.min.js";
const RHWP = "/vendor/rhwp-0.8.7/rhwp.js";
export default defineConfig({
  // 서비스 워커(dist/sw.js — 인터넷 없이 다시 열기, 한 번 쓴 도구의 vendor 저장). 빌드할 때만 만들어요
  plugins: [toolGridPlugin(), hwpPagePlugin(), swPlugin()],
  build: {
    assetsDir: "js",
    modulePreload: { polyfill: false },
    cssMinify: false,
    rollupOptions: { input: { index: fileURLToPath(new URL("./index.html", import.meta.url)), "hwp-page": fileURLToPath(new URL("./src/hwp-page.ts", import.meta.url)) } },
  },
  worker: {
    format: "es",
    rollupOptions: { external: ["vendor:pdf-lib", "vendor:rhwp"], output: { paths: { "vendor:pdf-lib": PDF_LIB, "vendor:rhwp": RHWP } } },
  },
  test: { include: ["test/**/*.test.ts"] },
});
