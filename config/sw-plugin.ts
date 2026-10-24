// 빌드가 끝나면 config/sw.js 에 미리 저장 목록·버전을 채워 dist/sw.js 로 써요(갓생·밑줄·단골지도와 같은 방식).
// 목록은 실제 dist 파일에서 만들어서 해시가 바뀐 JS 이름을 손으로 고칠 일이 없어요.
import { createHash } from "node:crypto";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import type { Plugin } from "vite";

/** 미리 받지 않는 것: 서비스 워커 자신·서버 설정·검색용 파일·공유 그림·라이선스 원문, vendor(23MB — 그 도구를 한 번 쓰면 저장해요), 없는 주소 화면,
 *  한글 더 글꼴(jl-sans-ko 349KB — 파일 이름·워터마크에 첫 글꼴에 없는 한글이 나올 때만 받고, 받으면 저장해요) */
const SKIP = /^(test\/.*|sw\.js|_headers|_redirects|404\.html|robots\.txt|sitemap\.xml|third-party-licenses\.txt|assets\/og\.(png|svg)|vendor\/.*|fonts\/jl-sans-ko\.[0-9a-f]{10}\.woff2)$/;
/** Cloudflare Pages 는 index.html → /, hwp.html → /hwp 처럼 확장자 없는 주소로 보내서 그 주소로 저장해요 */
const PAGE_KEY: Record<string, string> = { "index.html": "./", "hwp.html": "./hwp", "pdf-compress.html": "./pdf-compress", "pdf-merge.html": "./pdf-merge", "privacy.html": "./privacy", "licenses.html": "./licenses" };

export function precacheList(dir: string): string[] {
  const files = (fs.readdirSync(dir, { recursive: true, encoding: "utf8" }) as string[])
    .map((f) => f.split(path.sep).join("/"))
    .filter((f) => !SKIP.test(f) && fs.statSync(path.join(dir, f)).isFile())
    .sort();
  return files.map((f) => PAGE_KEY[f] ?? "./" + f);
}

/**
 * css/style.css 이름에 내용 해시를 붙여요(css/style.<해시>.css) — 서비스 워커 목록을 만들기 전에.
 * 페이지는 네트워크 우선인데 같은 출처 파일은 저장본 먼저라, 배포 뒤 처음 열면 이미 깔린 서비스 워커가 옛 style.css 를
 * 새 HTML·JS 에 붙여요(SOS수첩에서 실제로 아이콘이 300px 로 커짐, world-sos 83b201c). 이름이 바뀌면 옛 저장본에 없으니 새 파일을 받아요.
 * public/ 의 안내 페이지(hwp·privacy·404)는 Vite 가 손대지 않아서 결과 HTML 을 모두 고쳐요. JS 는 원래 이름에 해시가 있어요.
 */
export function hashStyles(dir: string): string | null {
  const src = path.join(dir, "css", "style.css");
  if (!fs.existsSync(src)) return null;
  const name = `style.${createHash("sha256").update(fs.readFileSync(src)).digest("hex").slice(0, 10)}.css`;
  fs.renameSync(src, path.join(dir, "css", name));
  for (const page of fs.readdirSync(dir).filter((f) => f.endsWith(".html"))) {
    const f = path.join(dir, page);
    fs.writeFileSync(f, fs.readFileSync(f, "utf8").replace(/href="\/css\/style\.css"/g, `href="/css/${name}"`));
  }
  if (!fs.readFileSync(path.join(dir, "index.html"), "utf8").includes(`href="/css/${name}"`)) throw new Error("index.html 에서 css/style.css 링크를 못 찾았어요");
  return name;
}

export function swPlugin(): Plugin {
  let outDir = "dist";
  return {
    name: "jipmunseo-sw",
    apply: "build",
    configResolved(c) { outDir = path.resolve(c.root, c.build.outDir); },
    closeBundle() {
      hashStyles(outDir); // 목록보다 먼저(바뀐 이름이 목록에 들어가게)
      const list = precacheList(outDir);
      const hash = createHash("sha256");
      for (const k of list) {
        const file = Object.entries(PAGE_KEY).find(([, v]) => v === k)?.[0] ?? k.slice(2);
        hash.update(k).update(fs.readFileSync(path.join(outDir, file)));
      }
      const version = "jms-v1-" + hash.digest("hex").slice(0, 10);
      let code = fs.readFileSync(fileURLToPath(new URL("./sw.js", import.meta.url)), "utf8");
      const V = "const VERSION = __SW_VERSION__;", P = "const CORE = __SW_PRECACHE__;";
      if (code.split(V).length !== 2 || code.split(P).length !== 2) throw new Error("sw.js 자리표시자를 못 찾았어요");
      code = code.replace(V, `const VERSION = ${JSON.stringify(version)};`).replace(P, `const CORE = ${JSON.stringify(list)};`);
      if (/__SW_/.test(code) || /^\s*(import|export)\b/m.test(code)) throw new Error("sw.js 에 자리표시자나 import/export 가 남았어요(클래식 서비스 워커여야 해요)");
      fs.writeFileSync(path.join(outDir, "sw.js"), code);
    },
  };
}
