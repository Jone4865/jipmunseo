// QA 6바퀴(2026-10-21) — 한 손 휴대폰 · 화면 읽기·키보드 · 느린 망 눈으로 써 보며 찾은 것
import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import { rowNews } from "../src/lib";
import { TOOL_INFO, toolGridHtml, arrowedHtml } from "../src/tool-list";

const read = (f: string) => readFileSync(new URL(`../${f}`, import.meta.url), "utf8");

describe("목록 단추를 누른 뒤 화면 읽기에 들려줄 말", () => {
  it("파일: 옮기면 몇 번째로 갔는지, 빼면 몇 개 남았는지", () => {
    expect(rowNews({ name: "계약서.pdf", from: 0, to: 1, before: 3, after: 3 })).toBe("계약서.pdf, 2번째로 옮겼어요");
    expect(rowNews({ name: "계약서.pdf", from: 1, to: 1, before: 3, after: 2 })).toBe("계약서.pdf 뺐어요. 2개 남았어요");
    expect(rowNews({ name: "a.pdf", from: 0, to: null, before: 1, after: 0 })).toBe("a.pdf 뺐어요. 0개 남았어요");
    expect(rowNews({ name: "a.pdf", from: 0, to: 0, before: 2, after: 2 })).toBe(""); // 움직이지 않음
  });
  it("쪽 썸네일: 옮기기·지우기·돌리기", () => {
    expect(rowNews({ name: null, from: 0, to: 1, before: 5, after: 5 })).toBe("1번째 쪽을 2번째로 옮겼어요");
    expect(rowNews({ name: null, from: 2, to: 2, before: 5, after: 4 })).toBe("3번째 쪽을 지웠어요. 4쪽 남았어요");
    expect(rowNews({ name: null, from: 1, to: 1, before: 5, after: 5, rot: "90°" })).toBe("2번째 쪽, 90도로 돌렸어요");
    expect(rowNews({ name: null, from: 1, to: 1, before: 5, after: 5, rot: null })).toBe("2번째 쪽, 원래 방향이에요");
    expect(rowNews({ name: null, from: 0, to: null, before: 1, after: 1 })).toBe(""); // 마지막 한 쪽(알림이 따로 읽혀요)
  });
  it("rowAction 이 말하는 자리에 넣어요", () => {
    expect(read("src/ui.ts")).toMatch(/say\(rowNews\(/);
  });
});

describe("첫 화면 도구 칸을 HTML 에 미리 넣기(느린 망)", () => {
  it("열 개 도구가 모두 들어가고 화살표는 그림 + 화면 읽기용 '→'", () => {
    const html = toolGridHtml();
    expect(html.match(/class="tool-item"/g)).toHaveLength(TOOL_INFO.length);
    for (const t of TOOL_INFO) expect(html).toContain(`href="#${t.id}"`);
    expect(html).toContain('이미지<span class="arr">');
    expect(arrowedHtml("이미지 → PDF")).toMatch(/<span class="sr">→<\/span>PDF$/);
    expect(arrowedHtml(" → ", true)).not.toContain('class="sr"');
    expect(html).toContain("mailto:cowhddnjsdl0@gmail.com");
  });
  it("index.html 에 빌드 플러그인이 채울 빈 자리가 그대로 있고, app.ts 는 비었을 때만 채워요", () => {
    expect(read("index.html")).toContain('<div class="tools" id="tool-grid"></div>');
    expect(read("vite.config.ts")).toMatch(/toolGridPlugin\(\), hwpPagePlugin\(\), swPlugin\(\)/);
    expect(read("src/app.ts")).toMatch(/if \(!grid\.querySelector\("\.tool-item"\)\) grid\.innerHTML = toolGridHtml\(\)/);
  });
  it("모든 도구에 화면 코드가 붙어 있어요", () => {
    const app = read("src/app.ts");
    for (const t of TOOL_INFO) expect(app).toContain(`"${t.id}": mount`);
  });
});

describe("도구를 열고 닫을 때 초점", () => {
  it("열면 도구 제목으로, 돌아오면 쓰던 도구 칸으로", () => {
    const app = read("src/app.ts");
    expect(app).toMatch(/h\("h1", \{ id: "tool-title", tabindex: "-1" \}/);
    expect(app).toMatch(/focusIfLost\(view\.querySelector<HTMLElement>\("#tool-title"\)\)/);
    expect(app).toMatch(/focusIfLost\(card\)/);
  });
});
