// QA 2바퀴(2026-10-18): 홈 화면 앱(manifest)·인터넷 없이 다시 열기(서비스 워커)·파일 열기 연결, 화면 읽기, 배경 지우기 안내 문구
import { test } from "vitest";
import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { hashStyles, precacheList } from "../config/sw-plugin.js";
import { sayArrows } from "../src/lib.js";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const read = (f: string) => fs.readFileSync(path.join(root, f), "utf8");

test("서비스 워커 미리 저장 목록: 화면·JS·CSS·아이콘·안내 페이지만, vendor(23MB)·공유 그림·404 는 빼요", () => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), "jms-sw-"));
  try {
    for (const f of ["index.html", "hwp.html", "privacy.html", "licenses.html", "404.html", "_headers", "sw.js", "robots.txt", "sitemap.xml", "third-party-licenses.txt",
      "manifest.webmanifest", "css/style.css", "js/index-abc.js", "js/hwp-worker-abc.js", "assets/icon.png", "assets/og.png", "assets/og.svg",
      "vendor/pdf-lib-1.17.1.esm.min.js", "vendor/rhwp-0.8.7/rhwp_bg.wasm"]) {
      fs.mkdirSync(path.dirname(path.join(dir, f)), { recursive: true });
      fs.writeFileSync(path.join(dir, f), "x");
    }
    assert.deepEqual(precacheList(dir), ["./assets/icon.png", "./css/style.css", "./hwp", "./", "./js/hwp-worker-abc.js", "./js/index-abc.js", "./licenses", "./manifest.webmanifest", "./privacy"]);
  } finally { fs.rmSync(dir, { recursive: true, force: true }); }
});

test("서비스 워커: vendor 는 한 번 쓰면 따로 저장(HTML·부분 응답은 저장 안 함), 화면이 cache: 'reload' 로 다시 받으면 네트워크로", () => {
  const sw = read("config/sw.js");
  assert.match(sw, /const VERSION = __SW_VERSION__;/);
  assert.match(sw, /const CORE = __SW_PRECACHE__;/);
  assert.doesNotMatch(sw, /^\s*(import|export)\b/m, "클래식 서비스 워커");
  assert.match(sw, /if \(r\.status === 200 && !isHtml\(r\)\) c\.put\(req, r\.clone\(\)\)/);
  assert.match(sw, /if \(req\.cache !== 'reload' && req\.cache !== 'no-store'\)/);
  assert.match(sw, /req\.headers\.has\('range'\)/);
  // 다른 출처(배경 지우기 모델 staticimgly.com)는 건드리지 않아요 — 글꼴도 이제 이 사이트 /fonts/ 예요(QA 7바퀴)
  assert.match(sw, /if \(url\.origin !== location\.origin\) return;/);
  const headers = read("public/_headers");
  assert.match(headers, /\/sw\.js\n\s+Cache-Control: no-cache/);
  assert.match(headers, /connect-src 'self' blob: https:\/\/staticimgly\.com;/);
  assert.match(read("vite.config.ts"), /plugins: \[toolGridPlugin\(\), guidePagePlugin\(\), swPlugin\(\)\]/);
  assert.match(read("src/app.ts"), /if \(import\.meta\.env\.PROD && "serviceWorker" in navigator\)/);
});

test("manifest: 홈 화면 바로가기 3개, HWP·PDF 파일 열기 연결", () => {
  const m = JSON.parse(read("public/manifest.webmanifest"));
  assert.equal(m.id, "/");
  assert.equal(m.display, "standalone");
  assert.deepEqual(m.shortcuts.map((s: { url: string }) => s.url), ["/#hwp-view", "/#pdf-merge", "/#id-mask"]);
  const exts = Object.values(m.file_handlers[0].accept as Record<string, string[]>).flat();
  for (const e of [".hwp", ".hwpx", ".pdf"]) assert.ok(exts.includes(e), e);
  for (const f of ["index.html", "public/hwp.html"]) assert.match(read(f), /<link rel="manifest" href="\/manifest\.webmanifest">/);
  assert.match(read("src/app.ts"), /lq\?\.setConsumer\(async \(p\) => \{/);
});

test("화면 읽기: 결과 제목을 읽어 주고, 진행 막대에 이름과 지금 하는 일", () => {
  assert.match(read("index.html"), /<p class="sr" id="sr-status" role="status" aria-live="polite"><\/p>/);
  assert.match(read("src/app.ts"), /const res = n\.matches\("\.result"\) \? n : n\.querySelector\("\.result"\);/);
  const ui = read("src/ui.ts");
  assert.match(ui, /role: "progressbar", "aria-label": "진행 상황"/);
  assert.match(ui, /el\.setAttribute\("aria-valuetext", msg\)/);
});

test("배경 지우기 안내: 56MB 모델을 받는다는 사실은 남기고 '사진은 안 보내요' 같은 안심 문구는 빼요(개인정보 설명은 처리방침에)", () => {
  const bg = read("src/tools-bg.ts");
  assert.match(bg, /처음 한 번 AI 모델\(약 \$\{BG_DOWNLOAD_MB\}MB\)을 받아요/);
  assert.doesNotMatch(bg, /사진은 안 보내요/);
  assert.match(read("public/privacy.html"), /모델만 받고 사진은 보내지 않아요/);
});

test("sayArrows: 결과 제목의 화살표를 '…에서 …로'로", () => {
  assert.equal(sayArrows("3.1 KB→3.1 KB, 거의 그대로"), "3.1 KB에서 3.1 KB로, 거의 그대로");
  assert.equal(sayArrows("3장 끝! 2.1 MB → 1.0 MB , 52% 줄었어요"), "3장 끝! 2.1 MB에서 1.0 MB로, 52% 줄었어요");
  assert.equal(sayArrows("12쪽짜리 PDF가 만들어졌어요"), "12쪽짜리 PDF가 만들어졌어요");
  assert.equal(sayArrows("  배경을   지웠어요 "), "배경을 지웠어요");
});

test("css/style.css 는 이름에 내용 해시 — 배포 뒤 깔려 있던 서비스 워커가 옛 CSS 를 새 화면에 붙이지 않게(버그 찾기 3차)", () => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), "jms-css-"));
  try {
    fs.mkdirSync(path.join(dir, "css"));
    fs.writeFileSync(path.join(dir, "css", "style.css"), "body{color:red}");
    for (const f of ["index.html", "hwp.html", "privacy.html", "404.html"]) fs.writeFileSync(path.join(dir, f), '<link rel="stylesheet" href="/css/style.css">');
    fs.writeFileSync(path.join(dir, "licenses.html"), "<p>css 없음</p>");
    const name = hashStyles(dir)!;
    assert.match(name, /^style\.[0-9a-f]{10}\.css$/);
    assert.ok(!fs.existsSync(path.join(dir, "css", "style.css")), "옛 이름은 남지 않아요");
    for (const f of ["index.html", "hwp.html", "privacy.html", "404.html"]) assert.equal(fs.readFileSync(path.join(dir, f), "utf8"), `<link rel="stylesheet" href="/css/${name}">`, f);
    assert.ok(precacheList(dir).includes(`./css/${name}`));
    assert.match(read("config/sw-plugin.ts"), /hashStyles\(outDir\); \/\/ 목록보다 먼저/);
  } finally { fs.rmSync(dir, { recursive: true, force: true }); }
});
