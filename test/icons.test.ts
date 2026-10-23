// 아이콘 한 곳(src/icons.ts) · 화면에 시스템 컬러 이모지 없음
import fs from "node:fs";
import path from "node:path";
import { test } from "vitest";
import assert from "node:assert/strict";
import { ICONS } from "../src/icons.js";

const HTML = ["index.html", "public/hwp.html", "public/pdf-compress.html", "public/pdf-merge.html", "public/privacy.html", "public/404.html", "public/licenses.html"];
const SCREEN = [...HTML, "public/css/style.css", ...fs.readdirSync("src").filter((f) => f.endsWith(".ts")).map((f) => path.join("src", f))];

test("정적 HTML 의 커피잔은 icons.ts 의 cup 과 같아요", () => {
  for (const f of ["index.html", "public/hwp.html", "public/pdf-compress.html", "public/pdf-merge.html", "public/privacy.html"]) {
    const html = fs.readFileSync(f, "utf8");
    const svgs = html.match(/<svg class="ic-cup"[\s\S]*?<\/svg>/g) ?? [];
    assert.equal(svgs.length, 1, f);
    // icons.ts 의 ${P} 를 펼친 모양과 같아야 해요
    assert.equal(svgs[0], ICONS.cup, f);
    assert.match(html, /toon\.at\/donate[^>]*><svg class="ic-cup"[\s\S]*?<\/svg>응원하기<\/a>/, f);
  }
});

test("화면 코드에 컬러 이모지(이모지 표시 글자·U+FE0F)가 없어요", () => {
  // 한컴 기호 표(hwp-pua.ts)는 문서 글을 옮기는 표라서, 이모지가 될 수 있는 글자에 U+FE0E 를 붙였는지만 봐요
  const color = /\p{Emoji_Presentation}|\p{Extended_Pictographic}️/u;
  const textEmoji = /(\p{Extended_Pictographic})(?!︎)/gu;
  for (const f of SCREEN) {
    const s = fs.readFileSync(f, "utf8");
    assert.ok(!color.test(s), `${f}: ${color.exec(s)?.[0]}`);
    const loose = [...s.matchAll(textEmoji)].map((m) => m[1]).filter((c) => /\p{Emoji}/u.test(c) && !"©®™".includes(c));
    assert.deepEqual(loose, [], f);
  }
});
