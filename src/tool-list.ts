// 도구 목록(이름·설명)과 첫 화면 작업대의 도구 칸 HTML.
// 느린 망(400ms·50KB/s 흉내)에서 도구 칸이 화면 JS(약 85KB)를 다 받은 뒤에야 그려져서, 첫 그림(약 2.6초) 뒤에도
// 작업대가 11초쯤 비어 있었어요(QA 6바퀴). 빌드할 때 index.html 에 그대로 넣어 두고(vite.config.ts toolGridPlugin),
// 화면 JS 는 비어 있을 때만(다른 HTML 로 열렸을 때) 채워요. DOM 을 쓰지 않는 문자열만 다뤄요 — vite 설정에서도 불러요.
import { art } from "./art.js";
import { ICONS } from "./icons.js";

export interface ToolInfo { id: string; title: string; desc: string }
export const TOOL_INFO: readonly ToolInfo[] = [
  // 찾는 사람이 가장 많아서 맨 앞(HWP_SPEC 6-1). 검색용 안내 페이지는 public/hwp.html(/hwp)
  { id: "hwp-view", title: "HWP 보기 · 변환", desc: "한글 문서(HWP·HWPX)를 열어 보고 PDF·Word·그림·텍스트로 저장해요." },
  { id: "pdf-merge", title: "PDF 합치기", desc: "여러 PDF를 원하는 순서로 하나로 합쳐요." },
  { id: "pdf-split", title: "PDF 나누기 · 페이지 빼기", desc: "필요한 쪽만 골라 새 PDF로, 한 쪽씩 또는 범위로 나눠요." },
  { id: "pdf-organize", title: "PDF 회전 · 순서 바꾸기", desc: "썸네일을 보면서 돌리고, 옮기고, 지운 뒤 저장해요." },
  { id: "pdf-compress", title: "PDF 용량 줄이기", desc: "안의 사진을 다시 저장해서 2MB·5MB 같은 제출 용량에 맞춰요." },
  { id: "id-mask", title: "신분증 가리기 · 워터마크", desc: "주민번호 뒷자리를 가리고 ‘OO 제출용’을 넣은 사본을 만들어요." },
  { id: "img-to-pdf", title: "이미지 → PDF", desc: "사진 여러 장을 A4 또는 원본 크기 PDF 하나로 묶어요." },
  { id: "img-compress", title: "이미지 압축 · 변환", desc: "JPG · PNG · WebP · AVIF로 바꾸고 화질 · 크기를 줄여요. 200KB 이하처럼 장마다 용량도 맞춰요." },
  { id: "bg-remove", title: "사진 배경 지우기", desc: "AI가 사진 배경을 지워 투명 PNG로 만들어요." },
  { id: "exif-clean", title: "사진 정보 지우기", desc: "사진에 숨은 위치(GPS) · 카메라 · 날짜 정보를 확인하고 지워요." },
];

const esc = (s: string): string => s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;");
/** ui.ts arrowed() 의 문자열판: '이미지 → PDF' 의 화살표를 그림으로, 화면 읽기에는 '→' 로(deco 면 읽지 않음) */
export function arrowedHtml(text: string, deco = false): string {
  return text.split(/\s*→\s*/).map((part, i) => (i ? `<span class="arr">${ICONS.arrow}</span>${deco ? "" : '<span class="sr">→</span>'}` : "") + esc(part)).join("");
}
/** 작업대의 도구 칸 + 맨 끝 메모 (app.ts 가 예전에 DOM 으로 만들던 것과 같은 모양) */
export function toolGridHtml(): string {
  return TOOL_INFO.map((t) => `<a class="tool-item" href="#${t.id}">${art(t.id)}<h3>${arrowedHtml(t.title)}</h3><p>${esc(t.desc)}</p></a>`).join("")
    + `<p class="bench-memo">필요한 도구가 없나요? <a href="mailto:cowhddnjsdl0@gmail.com">메일로 알려 주세요${arrowedHtml(" → ", true)}</a></p>`;
}
