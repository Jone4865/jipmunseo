// QA 7바퀴(2026-10-22): 글꼴을 이 사이트에 직접 두기(dev/fonts.mjs) — 화면 문구에 새 글자가 생기면 `npm run fonts` 를 잊지 않게
import { test } from "vitest";
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { siteChars, basicChars } from "../dev/font-chars.mjs";
import { readWoff2Names } from "../dev/font-names.mjs";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const read = (f: string) => fs.readFileSync(path.join(root, f), "utf8");
const saved = JSON.parse(read("dev/fonts-chars.json")) as { core: string; missing: string; files: Record<string, string> };
const PAGES = ["index.html", "public/hwp.html", "public/pdf-compress.html", "public/pdf-merge.html", "public/privacy.html", "public/licenses.html", "public/404.html"];

test("화면 문구의 글자가 모두 줄인 글꼴(첫 파일)에 있어요 — 없으면 npm run fonts", () => {
  const have = new Set([...saved.core, ...saved.missing]);
  const lost = [...new Set([...siteChars(root), ...basicChars()])].filter((c) => !have.has(c));
  assert.deepEqual(lost, [], `줄인 글꼴에 없는 글자: ${lost.join("")} — npm run fonts`);
  assert.ok([...saved.missing].every((c) => !/[가-힣]/.test(c)), "Pretendard 에 없는 한글은 없어야 해요");
});

test("CSS·라이선스 페이지가 만든 파일 이름(해시)을 그대로 쓰고, 바깥 글꼴은 받지 않아요", () => {
  for (const f of Object.values(saved.files)) assert.ok(fs.existsSync(path.join(root, "public/fonts", f)), f);
  for (const f of ["public/css/style.css", "public/licenses.html"]) {
    const s = read(f);
    assert.ok(s.includes(`url(/fonts/${saved.files["jl-sans"]})`), f);
    // 한글 더는 다른 이름 + 한글 범위로 — 같은 이름에 범위를 겹치면 첫 화면에서 같이 받아요
    assert.ok(s.includes(`font-family:"JL Sans Ko"`) && s.includes(`url(/fonts/${saved.files["jl-sans-ko"]})`) && s.includes("unicode-range:U+A1-17F,U+3131-318E,U+AC00-D7A3"), f);
    assert.match(s, /font-family: "JL Sans", "JL Sans Ko", -apple-system/);
  }
  // preload 는 두지 않아요(느린 망에서 첫 그림이 늦어졌어요, dev/fonts.mjs)
  for (const f of PAGES) assert.doesNotMatch(read(f), /rel="preload"[^>]*woff2/, f);
  const all = PAGES.map(read).join("") + read("public/_headers") + read("config/sw.js") + read("src/tools-mask.ts");
  assert.doesNotMatch(all, /cdn\.jsdelivr|Pretendard Variable/);
  assert.match(read("public/_headers"), /\/fonts\/\*\n {2}Cache-Control: public, max-age=31536000, immutable/);
  assert.match(read("public/_headers"), /font-src 'self';/);
  assert.match(read("src/tools-mask.ts"), /document\.fonts\.load\(`800 40px "JL Sans", "JL Sans Ko"`, text\)/);
});

test("예약 글꼴 이름(Pretendard)은 줄인 판에 쓰지 않아요 — 저작권·라이선스 칸은 그대로, 고지에 원래 이름", async () => {
  for (const k of ["jl-sans", "jl-sans-ko"]) {
    const names = await readWoff2Names(path.join(root, "public/fonts", saved.files[k]!));
    for (const n of names.filter((r) => [1, 3, 4, 6, 16, 17, 25].includes(r.nameID) || r.nameID >= 256)) assert.doesNotMatch(n.string, /Pretendard/, `${k} name ${n.nameID}`);
    assert.ok(names.some((r) => r.nameID === 1 && r.string === "JL Sans"));
    assert.ok(names.some((r) => r.nameID === 0 && /Kil Hyung-jin/.test(r.string)));
    assert.ok(names.some((r) => r.nameID === 13 && /Open Font License/.test(r.string)));
  }
  assert.match(read("public/licenses.html"), /JL Sans \(Pretendard 1\.3\.9를 줄인 판\)<small>Copyright \(c\) 2021 Kil Hyung-jin, with Reserved Font Name Pretendard/);
  assert.match(read("public/third-party-licenses.txt"), /A10\. JL Sans \(a subset of Pretendard 1\.3\.9\) - SIL OFL 1\.1 \(MODIFIED\)/);
});
