// 검색용 안내 페이지(/hwp)의 작은 화면 코드 — 도구 코드는 싣지 않아요(HWP_SPEC 0장 결정 5번).
// 'HWP 파일 열기'를 누르면 이 자리에서 파일 고르기 창을 열고, 고른 파일을 첫 화면의 HWP 보기로 넘겨요(src/handoff.ts).
// 예전에는 도구 화면으로 넘어간 뒤 점선 상자를 한 번 더 눌러야 했어요(QA 8바퀴). 이 코드가 못 돌면 링크(/#hwp-view)가 그대로 일해요.
import { putHandoff, handoffTarget } from "./handoff.js";

/** 고른 파일을 넘기고 도구로 가요. 넘기지 못해도(저장소를 못 쓰는 브라우저) 도구로는 가요 */
async function go(files: File[]): Promise<void> {
  if (!files.length) return;
  const { tool, url } = handoffTarget(files);
  document.documentElement.classList.add("hw-going");
  await putHandoff(tool, files);
  location.href = url;
}

// 휴대폰 파일 선택기가 .hwp 를 회색으로 막지 않게 도구와 같이 모든 파일을 받아요(내용은 도구가 가려요)
const input = document.createElement("input");
input.type = "file";
input.hidden = true;
input.tabIndex = -1;
input.setAttribute("aria-hidden", "true");
input.addEventListener("change", () => { const fs = [...(input.files || [])]; input.value = ""; void go(fs); });
document.body.append(input);

for (const a of document.querySelectorAll<HTMLAnchorElement>("a[data-pick]")) {
  a.setAttribute("role", "button");
  a.addEventListener("click", (e) => {
    // 새 탭으로 열기(Ctrl·⌘·가운데 단추)는 링크 그대로
    if (e.ctrlKey || e.metaKey || e.shiftKey || e.button !== 0) return;
    e.preventDefault();
    input.click();
  });
  a.addEventListener("keydown", (e) => { if (e.key === " ") { e.preventDefault(); input.click(); } });
}

// 마우스 화면: 이 페이지 아무 곳에나 파일을 떨어뜨려도 열어요
const hasFiles = (e: DragEvent) => [...(e.dataTransfer?.types || [])].includes("Files");
addEventListener("dragover", (e) => { if (hasFiles(e)) { e.preventDefault(); (e.dataTransfer as DataTransfer).dropEffect = "copy"; } });
addEventListener("drop", (e) => {
  if (!hasFiles(e)) return;
  e.preventDefault();
  void go([...(e.dataTransfer as DataTransfer).files]);
});
// 뒤로 가기로 이 페이지가 저장본(bfcache)에서 돌아오면 '여는 중' 모양을 걷어요
addEventListener("pageshow", () => document.documentElement.classList.remove("hw-going"));
