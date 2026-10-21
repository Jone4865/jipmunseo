// QA 7바퀴(2026-10-22): 처음 쓰는 사람 눈으로 써 보며 고친 것
import { test } from "vitest";
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const read = (f: string) => fs.readFileSync(path.join(root, f), "utf8");

test("화면 코드·CSS 가 쓰는 CSS 변수는 모두 style.css 에 있어요 — 없던 --text 때문에 PDF·배경 지우기의 파일 이름이 흐린 색으로 나왔어요", () => {
  const css = read("public/css/style.css");
  const defined = new Set([...css.matchAll(/(--[\w-]+)\s*:/g)].map((m) => m[1]));
  const files = ["public/css/style.css", "index.html", ...fs.readdirSync(path.join(root, "src")).filter((n) => n.endsWith(".ts")).map((n) => "src/" + n)];
  const missing = files.flatMap((f) => [...read(f).matchAll(/var\((--[\w-]+)/g)].filter((m) => !defined.has(m[1])).map((m) => `${f}: ${m[1]}`));
  assert.deepEqual(missing, []);
});

test("목록 줄의 단추(빼기·위로·돌리기·내려받기)는 그 줄의 파일·쪽 이름을 설명으로 가져요 — 화면 읽기에서 '빼기, 빼기'만 들리던 것", () => {
  const ui = read("src/ui.ts");
  assert.match(ui, /row\.querySelectorAll\("button"\)\.forEach\(\(b\) => b\.setAttribute\("aria-describedby", label\.id\)\)/);
  assert.match(ui, /describeRow\(row, "\.fname"\);\n  return row;/, "결과 줄의 내려받기");
  const pdf = read("src/tools-pdf.ts"), img = read("src/tools-img.ts");
  assert.match(pdf, /describeRows\(listEl, "\.fitem", "\.fname"\)/, "합치기 목록");
  assert.match(pdf, /describeRows\(grid, "\.thumb", "\.tlabel"\)/, "회전·순서 바꾸기 쪽");
  assert.match(pdf, /h\("span", \{ class: "sr" \}, "번째 쪽"\)/);
  assert.match(img, /describeRows\(el, "\.fitem", "\.fname"\)/, "이미지 목록");
});
