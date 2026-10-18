import { defineConfig } from "vitest/config";
import { swPlugin } from "./config/sw-plugin.js";

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
  plugins: [swPlugin()],
  build: {
    assetsDir: "js",
    modulePreload: { polyfill: false },
    cssMinify: false,
  },
  worker: {
    format: "es",
    rollupOptions: { external: ["vendor:pdf-lib", "vendor:rhwp"], output: { paths: { "vendor:pdf-lib": PDF_LIB, "vendor:rhwp": RHWP } } },
  },
  test: { include: ["test/**/*.test.ts"] },
});
