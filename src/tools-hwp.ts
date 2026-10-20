// 본 제품은 한컴의 HWP 문서 파일(.hwp) 공개 문서를 참고하여 개발하였습니다.
// 10. HWP 보기 · 변환 — 한글 문서(HWP·HWPX·HWP 3.0)를 이 기기 안에서 열어 보고, PDF·Word·쪽 그림(PNG)·텍스트로 저장해요.
//  - 형식·배포용·DRM 판별은 앞(메인)에서 순수 함수로(hwp-lib.ts). 형식이 아니면 보기 도구(약 5MB)를 받지 않아요.
//  - 쪽은 워커(rhwp)가 그린 SVG 를 손본 뒤 <img>(blob)로 띄워요. 문서에서 나온 마크업을 페이지 DOM 에 넣지 않아요.
//  - 복사·인쇄를 막아 둔 배포용 문서는 SVG 안에 글자가 그대로 있어서 화면도 캔버스로 그린 PNG 로만 보여 줘요.
//  - 인쇄를 막아 둔 문서는 PDF·쪽 그림 저장을 막고, 브라우저 인쇄(Ctrl/Cmd+P)에도 쪽 대신 안내만 나가요.
//  - Word·텍스트는 워커 안에서 rhwp 읽기 전용 API 로 만들어요. 배포용 문서는 Word 로, 복사 제한 문서는 텍스트로도 옮기지 않아요(12-2).
//  - 화질(150·200·300dpi)과 굵은 글꼴 켜기는 이 브라우저에 기억해요(localStorage, 설정 두 개뿐 — 문서·파일 정보는 남기지 않아요).
//  - 편집 가능하게 바꾸기(convertToEditable)·HWP 로 다시 저장은 부르지 않아요(타입에도 없어요).
// 설계: _workspace/review/HWP_SPEC.md (4·5·6·7·12장)
import { h, icon, dropzone, progress, alertBox, resultItem, seg, toast, runPdf, canvasToBlob, LIMITS, MAX_PIXELS, IS_IOS, once, focusIfLost, setDisabledKeepingFocus, touchFirst, type Seg } from "./ui.js";
import { holdTaps } from "./tap.js";
import { PREF, readPref, writePref } from "./prefs.js";
import { formatSize, parseRanges, rangesToSet } from "./lib.js";
import { sniffHwp, distributionFlags, hwpPolicy, hwpErrorCode, pdfEstimateKB, pngEstimateKB, maxExportPages, type HwpSniff, type HwpPolicy, type HwpDpi } from "./hwp-lib.js";
import { prepareSvg, pxToPt, FONT_BASE, FAMILY, type FontFace, type Fonts } from "./hwp-svg.js";
import { exportRules, exportName, warnLines, EXPORT_FORMATS, type ExportFormat, type ExportRule, type Warn } from "./hwp-export.js";
import { pngPack, mayShare, shareFilesFor, shareFiles, SHARE_MAX, type PagePng, type PngPack } from "./hwp-export-ui.js";
import { HwpClient, HwpClientError, type OpenResult, type ExportProgress } from "./hwp-client.js";
import type { Mounted } from "./app.js";

/* ───── 고정 문구 · 한도 ───── */
const IS_MOBILE = IS_IOS || /Android|iPhone|iPad|iPod|Mobile/i.test(navigator.userAgent);
const MOBILE_WARN_BYTES = 30 * 1024 * 1024;
/** PDF·쪽 그림을 한 번에 만드는 최대 쪽 수(화질별, hwp-lib.ts maxExportPages) */
const MAX_EXPORT: Record<HwpDpi, number> = { 150: maxExportPages(150, IS_IOS), 200: maxExportPages(200, IS_IOS), 300: maxExportPages(300, IS_IOS) };
const JPEG_Q = 0.85;
const DOCX_MIME = "application/vnd.openxmlformats-officedocument.wordprocessingml.document";
/** 메모리가 적은 기기(Chrome 계열만 알려 줘요). 300dpi 를 고르면 안내를 띄워요 */
const LOW_MEMORY = ((navigator as Navigator & { deviceMemory?: number }).deviceMemory ?? 8) <= 2;

/* ───── 기억하는 설정 두 개(화질·굵은 글꼴). 저장이 막힌 브라우저면 기본값으로 ───── */
const savedDpi = (): HwpDpi => { const n = Number(readPref(PREF.hwpDpi)); return n === 200 || n === 300 ? n : 150; };

const MSG = {
  notHwp: "HWP·HWPX 파일이 아니에요. 확장자만 바뀐 다른 파일일 수 있어요.",
  hwpUnknown: "HWP 파일로 보이지 않아요. 회사·기관 보안(DRM)이 걸린 문서이거나 파일이 깨졌을 수 있어요. 문서를 준 곳의 프로그램으로 열어 주세요.",
  empty: "빈 파일이에요.",
  tooBig: "100MB보다 큰 파일은 열지 않아요.",
  bigMobile: "큰 파일이라 휴대폰에서는 느리거나 멈출 수 있어요.",
  drm: "보안(DRM) 문서라 열 수 없어요. 문서를 준 회사·기관의 프로그램으로 열어 주세요.",
  distribution: "배포용 문서는 지금 집문서에서 열지 않아요. 한글 문서를 볼 수 있는 다른 프로그램으로 열어 주세요.",
  failed: "이 문서를 열지 못했어요. 파일이 깨졌거나 아직 지원하지 않는 형식일 수 있어요. 어떤 프로그램으로 만든 문서인지 메일로 알려 주시면 살펴볼게요(파일은 보내지 않으셔도 돼요).",
  timeout: "문서가 너무 복잡해서 열지 못했어요.",
  crashed: "보기 도구가 멈춰서 다시 시작했어요. 파일을 한 번 더 넣어 주세요.",
  loadFail: "보기 도구를 받지 못했어요. 인터넷 연결을 확인하고 다시 해 주세요.",
  firstLoad: "한글 문서 보기 도구를 처음 한 번 받고 있어요 (약 5MB)…",
  opening: "문서를 여는 중…",
  pwWrong: "암호가 맞지 않아요. 다시 넣어 주세요.",
  reading: "읽기용 보기예요. 한컴오피스와 글꼴·줄 간격·쪽 나눔이 조금 다를 수 있고, 고쳐 쓸 수는 없어요.",
  reopening: "문서를 다시 여는 중…",
  docxTooBig: "문서가 커서 Word로 옮기지 못했어요. 텍스트나 PDF로 저장해 보세요.",
  docxTooWide: (cols: number) => `한 줄이 ${cols}칸인 표가 있어서 Word 파일을 만들지 않았어요. Word는 표 한 줄에 63칸까지만 열 수 있어요. PDF·쪽 그림·텍스트로는 저장할 수 있어요.`,
  txtTooBig: "문서가 커서 텍스트로 옮기지 못했어요. PDF로 저장해 보세요.",
  exportCrashed: "옮기는 중에 보기 도구가 멈췄어요. 다른 형식으로 저장해 보세요.",
  bigDocxMobile: "큰 문서라 휴대폰에서는 오래 걸리거나 멈출 수 있어요.",
  lowMemory300: "이 기기는 메모리가 적어서 300dpi는 느리거나 멈출 수 있어요. 보통(150dpi)을 권해요.",
  ios300: "아이폰·아이패드에서는 300dpi가 느리거나 멈출 수 있어요. 보통(150dpi)을 권해요.",
  cancelling: "멈추는 중… 지금 그리는 쪽까지만 마치고 멈춰요.",
  cancelled: "만들기를 취소했어요.",
  pwNote: "저장한 파일에는 암호가 걸려 있지 않아요. 다른 사람에게 보낼 때 주의해 주세요.",
  boldFail: "굵은 글꼴을 받지 못했어요. 인터넷 연결을 확인하고 다시 켜 주세요.",
  hwp3: "아주 예전 한글(3.0) 문서예요. 모양이 더 많이 다를 수 있어요.",
  reason: {
    print: "만든 사람이 인쇄를 막아 둔 배포용 문서예요. 집문서에서는 보기만 할 수 있어요.",
    copy: "만든 사람이 복사를 막아 둔 배포용 문서예요. 보기와 그림 PDF 저장만 돼요.",
    privacy: "개인 정보 보안이 걸린 문서라 보기만 할 수 있어요.",
  },
  printNote: {
    print: "만든 사람이 인쇄를 막아 둔 문서라 인쇄되지 않아요.",
    privacy: "개인 정보 보안이 걸린 문서라 인쇄되지 않아요.",
  },
  blocked: {
    print: "만든 사람이 인쇄를 막아 둔 문서라 저장할 수 없어요.",
    copy: "만든 사람이 복사를 막아 둔 문서라 글을 옮길 수 없어요. PDF·쪽 그림은 돼요.",
    edit: "배포용 문서라 고쳐 쓸 수 있는 Word로는 옮기지 않아요. PDF·쪽 그림·텍스트는 돼요.",
    privacy: "개인 정보 보안이 걸린 문서라 저장할 수 없어요.",
  },
} as const;

const FORMAT_CARD: Record<ExportFormat, { title: string; tag: string; shape: boolean; desc: string }> = {
  pdf: { title: "PDF", tag: "모양 그대로", shape: true, desc: "보이는 그대로 쪽을 그림으로 담아요. 인쇄·제출용이에요. 글자 검색·복사는 안 돼요." },
  docx: { title: "Word (.docx)", tag: "글 위주", shape: false, desc: "글과 표를 고쳐 쓸 수 있게 옮겨요. 글꼴과 쪽 나눔은 원본과 달라져요." },
  png: { title: "쪽 그림 (PNG)", tag: "모양 그대로", shape: true, desc: "쪽마다 그림 한 장이에요. 카톡으로 바로 보내기 좋아요. 여러 쪽이면 ZIP으로 묶어요." },
  txt: { title: "텍스트 (.txt)", tag: "글 위주", shape: false, desc: "글자만 뽑아요. 표는 칸을 탭으로 나누고, 그림·서식은 빠져요." },
};

/* ───── 글꼴(Noto Serif KR·Noto Sans KR, OFL) — 처음 한 번 받아 메모리에만 둬요. 굵은 것(Bold)은 켰을 때만 ───── */
let fontsP: Promise<Fonts> | null = null;
let boldP: Promise<Fonts> | null = null;
/**
 * 글꼴 하나를 받아요. 글꼴(font/woff2)이 아니면 쓰지도 기억하지도 않아요. 배포 틈에 없는 주소가 HTML·404 로 오거나
 * 그런 응답이 브라우저 캐시(/vendor/* 는 1년 immutable)에 남아 있으면, 한 번은 캐시를 건너뛰고(cache: "reload") 새로 받아 캐시도 고쳐 둬요.
 */
async function fetchFace(file: string, family: string, weight: 400 | 700 = 400): Promise<FontFace> {
  const isFont = (r: Response) => r.ok && (r.headers.get("content-type") ?? "").split(";")[0].trim().toLowerCase() === "font/woff2";
  let r = await fetch(FONT_BASE + file);
  if (!isFont(r)) r = await fetch(FONT_BASE + file, { cache: "reload" });
  if (!isFont(r)) throw new Error(`font ${r.status} ${r.headers.get("content-type") ?? ""}`);
  const blob = await r.blob();
  const url = await new Promise<string>((res, rej) => {
    const fr = new FileReader();
    fr.onload = () => res(String(fr.result));
    fr.onerror = () => rej(fr.error);
    fr.readAsDataURL(blob);
  });
  return { family, mime: "font/woff2", base64: url.slice(url.indexOf(",") + 1), weight };
}
/** 글꼴을 못 받으면 기기 글꼴로 그려요(빈 객체) — 다음에 다시 받아 봐요 */
function loadFonts(): Promise<Fonts> {
  fontsP ||= Promise.all([fetchFace("NotoSerifKR-Regular.woff2", FAMILY.serif), fetchFace("NotoSansKR-Regular.woff2", FAMILY.sans)])
    .then(([serif, sans]) => ({ serif, sans }))
    .catch(() => { fontsP = null; return {}; });
  return fontsP;
}
/** 굵은 글꼴 두 개(명조 1.0MB + 고딕 0.56MB). 못 받으면 오류 — 부르는 쪽이 끄고 알려요 */
function loadBold(): Promise<Fonts> {
  boldP ||= Promise.all([fetchFace("NotoSerifKR-Bold.woff2", FAMILY.serif, 700), fetchFace("NotoSansKR-Bold.woff2", FAMILY.sans, 700)])
    .then(([serifBold, sansBold]) => ({ serifBold, sansBold }))
    .catch((e) => { boldP = null; throw e; });
  return boldP;
}
let toolReady = false; // 이 페이지에서 보기 도구를 한 번이라도 띄웠는지(진행 문구용)

/* ───── 캔버스 래스터 (PDF·쪽 그림·배포용 화면이 같이 써요) ───── */
interface Raster { blob: Blob; w: number; h: number }
async function rasterize(svgUrl: string, w: number, hgt: number, type: "image/png" | "image/jpeg", quality?: number): Promise<Raster> {
  const img = new Image();
  img.decoding = "async";
  img.src = svgUrl;
  await img.decode();
  let s = 1;
  if (w * hgt > MAX_PIXELS) s = Math.sqrt(MAX_PIXELS / (w * hgt));
  const cw = Math.max(1, Math.floor(w * s)), ch = Math.max(1, Math.floor(hgt * s));
  const c = document.createElement("canvas");
  c.width = cw; c.height = ch;
  try {
    const g = c.getContext("2d") as CanvasRenderingContext2D;
    g.fillStyle = "#fff";
    g.fillRect(0, 0, cw, ch);
    g.drawImage(img, 0, 0, cw, ch);
    return { blob: await canvasToBlob(c, type, quality), w: cw, h: ch };
  } finally {
    c.width = c.height = 0; // 쪽마다 캔버스 비우기(휴대폰 메모리)
    img.removeAttribute("src");
  }
}
const svgBlobUrl = (svg: string) => URL.createObjectURL(new Blob([svg], { type: "image/svg+xml" }));
class Cancelled extends Error {}

/* ───── 화면 ───── */
interface Doc { name: string; size: number; sniff: HwpSniff; policy: HwpPolicy; rules: Record<ExportFormat, ExportRule>; info: OpenResult; password: boolean }
interface Entry { url: string; charts: number }

export function mountHwp(root: HTMLElement): Mounted {
  let client = new HwpClient();
  let gen = 0; // 다른 파일·닫기 때마다 올려서 진행 중이던 일을 버려요
  let bytes: Uint8Array | null = null; // 원본(다시 열기용). 다른 파일·떠날 때 버려요
  let pending: { name: string; size: number; sniff: HwpSniff; policy: HwpPolicy } | null = null; // 암호 기다리는 문서
  let doc: Doc | null = null;
  let cur = 0;
  let zoom: "fit" | "big" = "fit";
  let busy = false;
  let bold = readPref(PREF.hwpBold) === "1";
  /** 지금 쓸 글꼴: 굵은 글꼴을 켰고 받았으면 같이 */
  async function fonts(): Promise<Fonts> {
    const base = await loadFonts();
    if (!bold) return base;
    try { return { ...base, ...(await loadBold()) }; } catch { return base; }
  }

  const tool = h("div", { class: "hwp-tool" });
  const err = alertBox();
  const warn = alertBox();
  const prog = progress();
  /* 내보내기 취소: 진행 표시 옆. PDF·쪽 그림은 다음 쪽부터 멈추고, Word·텍스트는 워커를 버리고 원본으로 다시 열어요 */
  const cancelBtn = h("button", { type: "button", class: "btn sm hwp-cancel", hidden: true, onclick: () => cancelExport() }, "취소");
  const progRow = h("div", { class: "hwp-progress" }, prog.el, cancelBtn);
  const dz = dropzone({
    accept: "", multiple: false, // 휴대폰 파일 선택기가 .hwp 를 회색으로 막지 않게 모든 파일을 받고 내용으로 가려요
    title: "HWP·HWPX 파일을 끌어다 놓으세요", sub: "한글 문서 · .hwp · .hwpx · 100MB까지",
    onFiles: (f) => { if (f[0]) void load(f[0]); },
  });

  /* 암호 칸 — <form> 으로 감싸지 않아요(Enter 는 keydown) */
  const pwIn = h("input", { class: "input", type: "password", autocomplete: "new-password", "aria-label": "문서 암호", spellcheck: "false", autocapitalize: "off" });
  const pwBad = h("p", { class: "hint bad", hidden: true, role: "alert" }, MSG.pwWrong);
  const pwBtn = h("button", { type: "button", class: "btn primary", onclick: () => void submitPassword() }, "열기");
  pwIn.addEventListener("keydown", (e) => { if (e.key === "Enter") { e.preventDefault(); void submitPassword(); } });
  const pwName = h("b", { style: "color:var(--ink)" });
  const pwPanel = h("div", { class: "panel hwp-pw", hidden: true },
    h("div", { class: "panel-head" }, h("div", { class: "muted" }, pwName), h("button", { type: "button", class: "btn ghost sm", onclick: () => { reset(true); holdTaps(); focusIfLost(dz); } }, "다른 파일")),
    h("p", { style: "margin:0 0 10px" }, "암호가 걸린 문서예요. 문서를 보낸 사람에게 받은 암호를 넣어 주세요."),
    h("div", { class: "hwp-pw-row" }, pwIn, pwBtn),
    pwBad,
    h("p", { class: "hint" }, "암호는 문서를 여는 데만 쓰고 저장하지 않아요."));

  /* 미리보기 */
  const fileLine = h("div", { class: "muted hwp-file", tabindex: "-1" }); // 문서를 열어 파일 넣는 곳이 숨으면 초점을 여기로
  const notices = h("div", { class: "hwp-notices" });
  const prevBtn = h("button", { type: "button", class: "btn sm", onclick: () => go(cur - 1) }, icon("back"), "앞 쪽");
  const nextBtn = h("button", { type: "button", class: "btn sm", onclick: () => go(cur + 1) }, "뒤 쪽", icon("next"));
  const pageIn = h("input", { class: "input num hwp-pagein", type: "number", inputmode: "numeric", min: "1", "aria-label": "쪽 번호" });
  const pageTotal = h("span", { class: "muted" });
  pageIn.addEventListener("change", () => { const n = parseInt(pageIn.value, 10); if (Number.isFinite(n)) go(n - 1); else updatePager(); });
  // Enter: 그 쪽으로 가요. 예전에는 칸을 놓아(blur) 바꿨는데, 자판으로 쓰는 사람은 초점이 문서 맨 앞으로 빠졌어요 →
  // 마우스 화면은 칸에 초점을 두고 글자를 골라 두고, 손가락 화면은 화면 자판을 닫으려고 그대로 놓아요
  pageIn.addEventListener("keydown", (e) => {
    if (e.key !== "Enter") return;
    e.preventDefault();
    if (touchFirst()) { pageIn.blur(); return; }
    const n = parseInt(pageIn.value, 10);
    if (Number.isFinite(n)) go(n - 1); else updatePager();
    pageIn.select();
  });
  const zoomSeg = seg<"fit" | "big">([{ value: "fit", label: "폭 맞춤" }, { value: "big", label: "크게" }], zoom, (v) => { zoom = v; stage.classList.toggle("big", v === "big"); if (raster()) { clearCache(); show(); } });
  const pager = h("div", { class: "row hwp-pager" }, prevBtn, h("span", { class: "hwp-pagebox" }, pageIn, pageTotal), nextBtn);
  /* 쪽 아래 넘기기: 휴대폰에서 한 쪽을 끝까지 읽고 다음 쪽으로 가려면 쪽 위의 단추까지 다시 올라가야 했어요 → 아래에도 두고, 넘기면 쪽 맨 위로 올려요 */
  const goBelow = (i: number) => { const was = cur; go(i); if (cur === was) return; holdTaps(); bar.scrollIntoView({ block: "start", behavior: matchMedia("(prefers-reduced-motion: reduce)").matches ? "auto" : "smooth" }); };
  const prevBtn2 = h("button", { type: "button", class: "btn sm", onclick: () => goBelow(cur - 1) }, icon("back"), "앞 쪽");
  const nextBtn2 = h("button", { type: "button", class: "btn sm", onclick: () => goBelow(cur + 1) }, "뒤 쪽", icon("next"));
  const pageNow2 = h("span", { class: "muted hwp-pagenow" });
  const pager2 = h("div", { class: "row hwp-pager hwp-pager-below", role: "group", "aria-label": "쪽 넘기기" }, prevBtn2, pageNow2, nextBtn2);
  const pageImg = h("img", { class: "hwp-page", alt: "", decoding: "async", draggable: "false" });
  const placeholder = h("div", { class: "hwp-ph" }, "그리는 중…");
  const stage = h("div", { class: "hwp-stage" }, placeholder);
  const chartNote = h("p", { class: "hint", hidden: true });
  /* 굵은 글꼴: 켤 때만 받아요(첫 화면 무게 그대로) */
  const boldIn = h("input", { type: "checkbox" });
  boldIn.checked = bold;
  const boldState = h("span", { class: "hwp-bold-state", "aria-live": "polite" });
  const boldRow = h("label", { class: "check-row hwp-bold" }, boldIn, h("span", {}, "제목 굵기 원본처럼 ", h("small", {}, "(글꼴 1.6MB 더 받기)")), boldState);
  boldIn.addEventListener("change", () => void setBold(boldIn.checked));
  async function setBold(on: boolean): Promise<void> {
    bold = on; writePref(PREF.hwpBold, on ? "1" : "0");
    if (on) {
      boldState.textContent = "받는 중…"; boldIn.disabled = true;
      try { await loadBold(); }
      catch { bold = false; boldIn.checked = false; writePref(PREF.hwpBold, "0"); toast(MSG.boldFail); }
      finally { boldState.textContent = ""; boldIn.disabled = false; }
    }
    if (doc) { clearCache(); void show(); }
  }
  const printNote = h("p", { class: "hwp-print-note" });

  /* 내보내기 */
  const exportBtn = h("button", { type: "button", class: "btn primary", "aria-expanded": "false", onclick: () => {
    toggleExport();
    // 두 번 톡톡 누르면 열렸다 바로 닫혔어요. 화면 맨 아래에서 누르면 열린 칸이 화면 밖이라 아무 일이 없는 것처럼 보였어요 → 보이게 올려요
    holdTaps();
    if (!exportBox.hidden && exportBox.getBoundingClientRect().top > window.innerHeight * 0.7) {
      exportArea.scrollIntoView({ block: "start", behavior: matchMedia("(prefers-reduced-motion: reduce)").matches ? "auto" : "smooth" });
    }
  } }, icon("dl"), "내보내기");
  const fmtGroup = h("div", { class: "hwp-formats", role: "radiogroup", "aria-label": "저장할 파일 형식" });
  let fmt: ExportFormat = "pdf";
  let range: "all" | "pick" = "all";
  let dpi: HwpDpi = savedDpi();
  const rangeIn = h("input", { class: "input", type: "text", placeholder: "예) 1-3, 5", "aria-label": "저장할 쪽", autocomplete: "off", inputmode: "numeric" });
  const rangeSlot = h("span", { class: "hwp-range" });
  let rangeSeg: Seg<"all" | "pick"> | null = null;
  /** 범위 버튼은 문서마다 새로 만들어요("전체 N쪽") */
  function buildRangeSeg(n: number): void {
    rangeSeg = seg<"all" | "pick">([{ value: "all", label: `전체 ${n}쪽` }, { value: "pick", label: "쪽 고르기" }], range, (v) => {
      range = v; rangeIn.hidden = v === "all"; if (v === "pick") rangeIn.focus(); updateOpts();
    });
    rangeSlot.replaceChildren(rangeSeg);
  }
  rangeIn.hidden = true;
  rangeIn.addEventListener("input", () => updateOpts());
  const dpiSeg = seg<HwpDpi>([{ value: 150, label: "보통 150dpi" }, { value: 200, label: "선명하게 200dpi" }, { value: 300, label: "인쇄용 300dpi" }], dpi, (v) => { dpi = v; writePref(PREF.hwpDpi, String(v)); updateOpts(); });
  const optHint = h("p", { class: "hint" });
  const makeBtn = h("button", { type: "button", class: "btn primary", onclick: () => void runExport() });
  const picOpts = h("div", { class: "opts" },
    h("div", { class: "opt" }, h("span", { class: "lbl" }, "저장할 쪽"), rangeSlot, rangeIn),
    h("div", { class: "opt" }, h("span", { class: "lbl" }, "화질"), dpiSeg));
  const optsBox = h("div", { class: "hwp-opts" },
    picOpts,
    optHint,
    h("div", { class: "actions" }, makeBtn));
  const exportBox = h("div", { class: "hwp-export", hidden: true },
    h("h2", { class: "sub-h" }, "어떤 파일로 저장할까요?"), fmtGroup, optsBox);
  const exportArea = h("div", { class: "hwp-export-area" }, h("div", { class: "actions" }, exportBtn), exportBox);
  const out = h("div");

  const bar = h("div", { class: "hwp-bar" }, pager, zoomSeg);
  const viewer = h("div", { class: "panel hwp-viewer", hidden: true },
    h("div", { class: "panel-head" }, fileLine, h("button", { type: "button", class: "btn ghost sm", onclick: () => { reset(true); holdTaps(); focusIfLost(dz); } }, "다른 파일")),
    notices,
    bar,
    stage, pager2, chartNote, printNote, boldRow,
    exportArea);

  const legal = h("div", { class: "hwp-legal" },
    h("p", {}, "본 제품은 한컴의 HWP 문서 파일(.hwp) 공개 문서를 참고하여 개발하였습니다."),
    h("p", {}, "한글·한컴·HWP·HWPX는 ㈜한컴(옛 ㈜한글과컴퓨터)의 상표예요. 집문서는 한컴과 제휴·후원·승인 관계가 없는 독립 도구예요."),
    h("p", {}, "문서 보기: ", h("a", { href: "https://github.com/edwardkim/rhwp", target: "_blank", rel: "noopener" }, "rhwp"), " (MIT) · ", h("a", { href: "/licenses" }, "라이선스 고지")));

  tool.append(dz, err.el, warn.el, pwPanel, viewer, progRow, out, legal);
  root.append(tool);

  /* ───── 파일 받기 ───── */
  const isHwpName = (n: string) => /\.hwpx?$/i.test(n);
  async function load(file: File): Promise<void> {
    reset(false);
    const g = gen;
    if (file.size === 0) return err.show(MSG.empty);
    if (file.size > LIMITS.hwpFile) return err.show(MSG.tooBig);
    if (IS_MOBILE && file.size > MOBILE_WARN_BYTES) warn.show(MSG.bigMobile, "info");
    let b: Uint8Array;
    try { b = new Uint8Array(await file.arrayBuffer()); } catch { return err.show(MSG.failed); }
    if (g !== gen) return;
    const sniff = sniffHwp(b);
    const flags = sniff.kind === "hwp5" && sniff.distribution ? distributionFlags(b) : null;
    const policy = hwpPolicy(sniff, flags);
    if (policy.block) {
      // 형식이 아니거나 열지 않는 문서면 보기 도구를 받지 않아요
      const m = policy.block === "drm" || policy.block === "cert" ? MSG.drm
        : policy.block === "distribution" ? MSG.distribution
        : isHwpName(file.name) ? MSG.hwpUnknown : MSG.notHwp;
      return err.show(m);
    }
    bytes = b;
    pending = { name: file.name, size: file.size, sniff, policy };
    if (policy.needPassword) return askPassword(false);
    await open();
  }

  function askPassword(wrong: boolean): void {
    if (!pending) return;
    dz.hidden = true; viewer.hidden = true; pwPanel.hidden = false;
    pwName.textContent = pending.name;
    pwBad.hidden = !wrong;
    pwIn.value = "";
    pwBtn.disabled = false;
    pwIn.focus();
  }
  async function submitPassword(): Promise<void> {
    const pw = pwIn.value;
    if (!pw) { pwIn.focus(); return; }
    pwIn.value = ""; // 입력 칸에 남기지 않아요
    pwBtn.disabled = true;
    await open(pw);
  }

  /** 워커로 문서 열기. 암호는 이 호출 안에서만 써요 */
  async function open(password?: string): Promise<void> {
    if (!pending || !bytes) return;
    const g = gen, p = pending;
    err.hide();
    try {
      prog.set(null, toolReady ? MSG.opening : MSG.firstLoad);
      await Promise.all([client.init(), loadFonts(), bold ? loadBold().catch(() => null) : null]);
      if (g !== gen) return;
      toolReady = true;
      prog.set(null, MSG.opening);
      const info = await client.open(bytes.slice().buffer, password); // 복사본을 넘겨요(transfer)
      if (g !== gen) return;
      if (!info.pages) throw new HwpClientError("error", "");
      pending = null;
      doc = { name: p.name, size: p.size, sniff: p.sniff, policy: p.policy, rules: exportRules(p.policy, p.sniff), info, password: !!password };
      showViewer();
    } catch (e) {
      if (g !== gen) return;
      const ce = e instanceof HwpClientError ? e : new HwpClientError("error", String((e as Error)?.message ?? e));
      if (ce.code === "load" || ce.code === "worker") { failTo(MSG.loadFail); return; }
      if (ce.code === "timeout") { failTo(MSG.timeout); return; }
      if (ce.code === "fatal") { failTo(MSG.crashed); return; }
      const code = hwpErrorCode(ce.message);
      if (code === "password-needed") { askPassword(false); return; }
      if (code === "password-wrong") { askPassword(true); return; }
      failTo(code === "empty" ? MSG.empty : code === "drm" ? MSG.drm : MSG.failed);
    } finally {
      if (g === gen) prog.hide();
    }
  }
  /** 처음(드롭존)으로 돌아가고 알림 하나 */
  function failTo(msg: string): void {
    reset(true);
    err.show(msg);
  }

  /* ───── 미리보기 ───── */
  const raster = () => doc?.policy.preview === "raster";
  function showViewer(): void {
    if (!doc) return;
    const d = doc;
    dz.hidden = true; pwPanel.hidden = true; viewer.hidden = false;
    fileLine.replaceChildren(h("b", { style: "color:var(--ink)" }, d.name), ` · ${d.info.pages}쪽 · ${formatSize(d.size)}`);
    focusIfLost(fileLine); // 파일 넣는 곳·암호 칸이 숨어 초점이 문서 맨 앞으로 빠지지 않게
    const reason = d.policy.reason;
    notices.replaceChildren(h("div", { class: "alert info" }, MSG.reading, d.sniff.kind === "hwp3" ? "\n" + MSG.hwp3 : ""));
    if (reason) notices.append(h("div", { class: "alert" }, MSG.reason[reason]));
    // 인쇄 막기: 쪽을 숨기고 안내만 인쇄돼요
    const noPrint = !d.policy.print;
    tool.classList.toggle("hwp-noprint", noPrint);
    printNote.textContent = noPrint ? MSG.printNote[reason === "privacy" ? "privacy" : "print"] : "";
    pageIn.max = String(d.info.pages);
    pageTotal.textContent = `/ ${d.info.pages}쪽`;
    pager.hidden = pager2.hidden = d.info.pages < 2;
    stage.classList.toggle("big", zoom === "big");
    // 내보내기: 막힌 형식만 남으면 버튼을 숨겨요
    exportArea.hidden = !EXPORT_FORMATS.some((f) => d.rules[f].ok);
    fmt = pickInitialFormat(d);
    buildRangeSeg(d.info.pages);
    renderFormats();
    cur = 0;
    show();
  }

  function updatePager(): void {
    if (!doc) return;
    pageIn.value = String(cur + 1);
    // 끝 쪽에서 '뒤 쪽'(첫 쪽에서 '앞 쪽')이 꺼지면 거기 있던 초점은 반대쪽 단추로 — 예전엔 문서 맨 앞으로 빠졌어요
    const prevOff = cur <= 0, nextOff = cur >= doc.info.pages - 1;
    if (!prevOff) prevBtn.disabled = false;
    if (!nextOff) nextBtn.disabled = false;
    setDisabledKeepingFocus(prevBtn, prevOff, () => (nextOff ? pageIn : nextBtn));
    setDisabledKeepingFocus(nextBtn, nextOff, () => (prevOff ? pageIn : prevBtn));
    pageNow2.textContent = `${cur + 1} / ${doc.info.pages}쪽`;
    if (!prevOff) prevBtn2.disabled = false;
    if (!nextOff) nextBtn2.disabled = false;
    setDisabledKeepingFocus(prevBtn2, prevOff, () => (nextOff ? pageIn : nextBtn2));
    setDisabledKeepingFocus(nextBtn2, nextOff, () => (prevOff ? pageIn : prevBtn2));
  }
  function go(i: number): void {
    if (!doc) return;
    const n = Math.max(0, Math.min(doc.info.pages - 1, i));
    if (n === cur) { updatePager(); return; }
    cur = n;
    show();
  }

  /* 쪽 캐시: 지금 쪽 ± 1쪽만 blob 주소를 갖고, 벗어나면 revoke */
  const cache = new Map<string, Entry>();
  const inflight = new Map<string, Promise<Entry>>();
  let shownKey = "";
  let rasterW = 0;
  const keyOf = (i: number) => (raster() ? `${i}@${rasterW}@${zoom}` : `${i}`);
  const pageOf = (k: string) => parseInt(k, 10);
  function clearCache(): void {
    for (const e of cache.values()) URL.revokeObjectURL(e.url);
    cache.clear(); shownKey = "";
  }
  function prune(): void {
    for (const [k, e] of cache) {
      if (k === shownKey) continue;
      if (Math.abs(pageOf(k) - cur) > 1 || (raster() && !k.endsWith(`@${rasterW}@${zoom}`))) { URL.revokeObjectURL(e.url); cache.delete(k); }
    }
  }
  /** 무대 안쪽 폭(여백 뺀 것) */
  function stageInnerWidth(): number {
    const cs = getComputedStyle(stage);
    return Math.max(200, Math.round(stage.clientWidth - parseFloat(cs.paddingLeft) - parseFloat(cs.paddingRight)));
  }
  /** 배포용 화면 그림 크기: 무대 폭 × 기기 배율(× 1.5 크게), 쪽 비율 그대로 */
  function rasterTarget(i: number): { w: number; h: number } {
    const s = (doc as Doc).info.sizes[i];
    const w = Math.max(200, Math.round(rasterW * Math.min(3, window.devicePixelRatio || 1) * (zoom === "big" ? 1.5 : 1)));
    return { w, h: Math.round((w * s.h) / s.w) };
  }
  async function buildPage(i: number): Promise<Entry> {
    const raw = await client.svg(i);
    const { svg, charts } = prepareSvg(raw, await fonts());
    const svgUrl = svgBlobUrl(svg);
    if (!raster()) return { url: svgUrl, charts };
    // 복사·인쇄 제한 문서: SVG(글자 포함)는 캔버스에 그린 직후 버리고 PNG 만 화면에 둬요
    try {
      const t = rasterTarget(i);
      const r = await rasterize(svgUrl, t.w, t.h, "image/png");
      return { url: URL.createObjectURL(r.blob), charts };
    } finally { URL.revokeObjectURL(svgUrl); }
  }
  function getPage(i: number): Promise<Entry> {
    const k = keyOf(i), g = gen;
    const hit = cache.get(k);
    if (hit) return Promise.resolve(hit);
    const had = inflight.get(k);
    if (had) return had;
    // 다른 파일로 바뀐 뒤 끝난 옛 작업이 새 문서의 같은 자리를 지우지 않게, 자기 것일 때만 지워요
    const done = () => { if (inflight.get(k) === p) inflight.delete(k); };
    const p: Promise<Entry> = buildPage(i).then((e) => {
      done();
      if (g !== gen || keyOf(i) !== k) { URL.revokeObjectURL(e.url); throw new Cancelled(); }
      cache.set(k, e);
      return e;
    }, (e) => { done(); throw g !== gen ? new Cancelled() : e; });
    inflight.set(k, p);
    return p;
  }
  let viewTok = 0;
  async function show(): Promise<void> {
    if (!doc) return;
    const i = cur, t = ++viewTok;
    updatePager();
    if (raster()) rasterW = stageInnerWidth();
    const k = keyOf(i);
    if (!cache.has(k)) {
      const s = doc.info.sizes[i];
      placeholder.style.aspectRatio = `${s.w} / ${s.h}`;
      placeholder.textContent = "그리는 중…";
      stage.replaceChildren(placeholder);
    }
    try {
      const e = await getPage(i);
      if (t !== viewTok || !doc) return;
      pageImg.src = e.url;
      pageImg.alt = `${i + 1}쪽`;
      shownKey = k;
      stage.replaceChildren(pageImg);
      chartNote.hidden = !e.charts;
      chartNote.textContent = e.charts ? `이 쪽의 차트 ${e.charts}개는 표시하지 못했어요.` : "";
      prune();
      // 앞뒤 1쪽 미리 준비
      for (const j of [i + 1, i - 1]) if (j >= 0 && j < doc.info.pages && !cache.has(keyOf(j))) getPage(j).catch(() => {});
    } catch (e) {
      if (e instanceof Cancelled || t !== viewTok) return;
      if (e instanceof HwpClientError && (e.code === "fatal" || e.code === "timeout" || e.code === "worker" || e.code === "load")) { failTo(MSG.crashed); return; }
      placeholder.textContent = "이 쪽을 그리지 못했어요.";
      stage.replaceChildren(placeholder);
    }
  }
  // 무대 폭이 바뀌면 배포용 그림을 다시 그려요(일반 문서는 SVG 라 그대로 선명해요)
  let lastW = 0, roTimer: ReturnType<typeof setTimeout> | undefined;
  const ro = new ResizeObserver(() => {
    const w = stage.clientWidth;
    if (!raster() || !w || Math.abs(w - lastW) < 24) { lastW = w || lastW; return; }
    lastW = w;
    clearTimeout(roTimer);
    roTimer = setTimeout(() => { clearCache(); show(); }, 250);
  });
  ro.observe(stage);

  const onKey = (e: KeyboardEvent) => {
    if (!doc || viewer.hidden || e.defaultPrevented || e.altKey || e.ctrlKey || e.metaKey) return;
    const t = e.target as HTMLElement | null;
    if (t && (t.tagName === "INPUT" || t.tagName === "TEXTAREA" || t.tagName === "SELECT" || t.isContentEditable)) return;
    if (e.key === "ArrowLeft") { e.preventDefault(); go(cur - 1); }
    else if (e.key === "ArrowRight") { e.preventDefault(); go(cur + 1); }
  };
  document.addEventListener("keydown", onKey);

  /* ───── 내보내기: 형식 고르기 ───── */
  /** 허용된 것 중 첫 번째(보통 PDF). 형식은 기억하지 않아요(설계 '선택' 항목 — 기억하는 건 화질·굵은 글꼴 두 개만) */
  function pickInitialFormat(d: Doc): ExportFormat {
    return EXPORT_FORMATS.find((f) => d.rules[f].ok) ?? "pdf";
  }
  function toggleExport(open?: boolean): void {
    const on = open ?? exportBox.hidden;
    exportBox.hidden = !on;
    exportBtn.setAttribute("aria-expanded", String(on));
    if (on) { renderFormats(); updateOpts(); }
  }
  function renderFormats(): void {
    if (!doc) return;
    const d = doc;
    const cards = EXPORT_FORMATS.map((f) => {
      const c = FORMAT_CARD[f], r = d.rules[f], sel = f === fmt && r.ok;
      return h("button", {
        type: "button", role: "radio", class: `hwp-fmt${r.ok ? "" : " off"}`, "aria-checked": String(sel), "aria-disabled": r.ok ? null : "true",
        tabindex: sel || (!d.rules[fmt].ok && r.ok) ? "0" : "-1", dataset: { fmt: f },
        onclick: () => { if (r.ok) choose(f); },
      },
      h("span", { class: "hwp-fmt-top" }, h("b", {}, c.title), h("span", { class: `hwp-tag${c.shape ? " shape" : ""}` }, c.tag)),
      h("span", { class: "hwp-fmt-desc" }, r.ok ? c.desc : MSG.blocked[r.why ?? "print"]));
    });
    // 카드를 새로 그려도 키보드로 고른 카드에 초점을 남겨요(Space·Enter 로 고르면 초점이 페이지 맨 앞으로 빠졌어요)
    const hadFocus = fmtGroup.contains(document.activeElement);
    fmtGroup.replaceChildren(...cards);
    if (hadFocus) (fmtGroup.querySelector(`[data-fmt="${fmt}"]`) as HTMLElement | null)?.focus();
  }
  fmtGroup.addEventListener("keydown", (e) => {
    if (!doc || !["ArrowRight", "ArrowDown", "ArrowLeft", "ArrowUp"].includes(e.key)) return;
    const d = doc;
    const ok = EXPORT_FORMATS.filter((f) => d.rules[f].ok);
    if (ok.length < 2) return;
    e.preventDefault();
    const step = e.key === "ArrowRight" || e.key === "ArrowDown" ? 1 : -1;
    choose(ok[(ok.indexOf(fmt) + step + ok.length) % ok.length]);
    (fmtGroup.querySelector(`[data-fmt="${fmt}"]`) as HTMLElement | null)?.focus();
  });
  function choose(f: ExportFormat): void {
    fmt = f;
    if (!busy) { out.replaceChildren(); lastPngs = []; prog.hide(); }
    renderFormats();
    updateOpts();
  }
  /** 고른 쪽(0부터). 잘못 적으면 Error */
  function selectedPages(): number[] {
    const n = (doc as Doc).info.pages;
    if (range === "all") return Array.from({ length: n }, (_, i) => i);
    return rangesToSet(parseRanges(rangeIn.value, n));
  }
  const MAKE: Record<ExportFormat, string> = { pdf: "PDF 만들기", png: "쪽 그림 만들기", docx: "Word 파일 만들기", txt: "텍스트 만들기" };
  function updateOpts(): void {
    if (!doc) return;
    makeBtn.textContent = MAKE[fmt];
    const pic = fmt === "pdf" || fmt === "png";
    picOpts.hidden = !pic;
    if (!pic) {
      optHint.className = "hint";
      optHint.textContent = fmt === "docx"
        ? "글·표·그림과 머리말·꼬리말·각주·미주를 옮겨요. 줄 간격과 쪽 크기는 원본 값을 쓰고, 글꼴과 쪽 나눔은 Word가 다시 정해요. 차트는 빠져요." + (IS_MOBILE && doc.size > MOBILE_WARN_BYTES ? " " + MSG.bigDocxMobile : "")
        : "UTF-8 글자 파일이에요. 메모장·한글·워드 어디서나 열려요. 각주·미주는 끝에 모아 적어요.";
      makeBtn.disabled = busy;
      return;
    }
    let pages: number[];
    try { pages = selectedPages(); }
    catch (e) { optHint.className = "hint bad"; optHint.textContent = (e as Error).message; makeBtn.disabled = true; return; }
    optHint.className = "hint";
    makeBtn.disabled = busy || !pages.length;
    const max = MAX_EXPORT[dpi];
    if (pages.length > max) {
      optHint.className = "hint bad";
      optHint.textContent = dpi === 150
        ? `한 번에 ${max}쪽까지 만들 수 있어요. 쪽 범위를 나눠서 저장해 주세요.`
        : `${dpi}dpi로는 한 번에 ${max}쪽까지 만들 수 있어요. 쪽 범위를 나눠서 저장하거나 화질을 낮춰 주세요.`;
      makeBtn.disabled = true;
      return;
    }
    const mb = (kb: number) => (kb / 1024 < 0.1 ? "0.1" : (kb / 1024).toFixed(1));
    const [lo, hi] = pngEstimateKB(pages.length, dpi);
    const pngSize = mb(lo) === mb(hi) ? mb(lo) : `${mb(lo)}~${mb(hi)}`;
    optHint.textContent = (fmt === "png"
      ? `쪽마다 PNG 한 장 · 예상 크기 약 ${pngSize}MB`
      : `쪽을 그림으로 담은 PDF예요. 인쇄·제출에는 충분하지만 글자 검색·복사는 안 돼요. 예상 크기 약 ${mb(pdfEstimateKB(pages.length, dpi))}MB`)
      // 아이폰·아이패드는 기기 메모리 값을 알려 주지 않아서 300dpi 면 늘 안내해요
      + (dpi === 300 && IS_IOS ? "\n" + MSG.ios300 : dpi === 300 && LOW_MEMORY ? "\n" + MSG.lowMemory300 : "");
  }

  /* ───── 내보내기: 만들기 ───── */
  let lastPngs: PagePng[] = []; // 공유 시트에 다시 쓸 쪽 그림. 공유할 수 있는 장수(30장 이하)일 때만, 결과를 보여 주는 동안만 갖고 있어요
  let exportTok = 0; // 내보내기마다 올려요. 취소·다른 파일이면 하나 더 올려서 진행 중이던 만들기의 결과를 버려요
  let exportFmt: ExportFormat | null = null; // 지금 만드는 형식(형식마다 멈추는 방법이 달라요)
  /** 쪽 하나를 dpi 로 그려요(PDF·쪽 그림 공용) */
  async function renderAt(i: number, type: "image/png" | "image/jpeg"): Promise<Raster> {
    const s = (doc as Doc).info.sizes[i];
    const raw = await client.svg(i);
    const { svg } = prepareSvg(raw, await fonts());
    const url = svgBlobUrl(svg);
    try { return await rasterize(url, Math.round((s.w * dpi) / 96), Math.round((s.h * dpi) / 96), type, type === "image/jpeg" ? JPEG_Q : undefined); }
    finally { URL.revokeObjectURL(url); }
  }
  function setCancel(on: boolean): void { cancelBtn.hidden = !on; cancelBtn.disabled = false; }
  /**
   * 취소(0장 결정 10번). PDF·쪽 그림은 지금 그리는 쪽까지만 마치고 멈춰요(만든 것은 버려요).
   * Word·텍스트는 워커 안에서 한 번에 돌아서 중간에 멈출 수 없어요 → 워커를 버리고, 끝나면 원본으로 다시 열어 보기를 이어 가요(암호 문서는 암호를 다시 물어요).
   */
  function cancelExport(): void {
    if (!busy || !exportFmt) return;
    exportTok++;
    cancelBtn.disabled = true;
    if (exportFmt === "docx" || exportFmt === "txt") client.dispose(); // 기다리던 요청은 '취소'로 끝나요
    else prog.set(null, MSG.cancelling);
  }
  async function runExport(): Promise<void> {
    if (!doc || busy) return;
    const d = doc, f = fmt, g = gen, t = ++exportTok;
    const alive = () => g === gen && t === exportTok;
    if (!d.rules[f].ok) return; // 막힌 형식은 여기까지 오지 않지만 한 번 더
    const pic = f === "pdf" || f === "png";
    let pages: number[] = [];
    if (pic) {
      try { pages = selectedPages(); } catch (e) { optHint.className = "hint bad"; optHint.textContent = (e as Error).message; return; }
      if (!pages.length || pages.length > MAX_EXPORT[dpi]) return;
    }
    busy = true; exportFmt = f; makeBtn.disabled = true; err.hide(); out.replaceChildren(); lastPngs = [];
    setCancel(true);
    let after: (() => Promise<void>) | null = null; // 끝난 뒤 이어서 할 일(다시 열기)
    let pack: PngPack | null = null; // 쪽 그림 ZIP(다 끝나기 전에 멈추면 버려요)
    try {
      const total = pages.length;
      if (f === "docx" || f === "txt") {
        prog.set(0, "문서 글을 옮기는 중… 0%");
        const onP = (p: ExportProgress) => {
          if (!alive()) return;
          if (p.phase === "pack") { prog.set(0.9, "Word 파일로 묶는 중…"); return; }
          const r = p.total ? Math.min(1, p.done / p.total) : 0;
          prog.set(r * 0.88, `문서 글을 옮기는 중… ${Math.round(r * 100)}%`);
        };
        if (f === "docx") {
          const r = await client.docx(onP);
          if (!alive()) return;
          setCancel(false);
          if (r.tooWide) { prog.hide(); err.show(MSG.docxTooWide(r.tooWide)); return; }
          prog.set(1, "완료!");
          out.replaceChildren(resultBox("Word 파일을 만들었어요",
            resultItem({ name: exportName(d.name, "docx"), blob: new Blob([r.bytes], { type: DOCX_MIME }), extra: "글·표 위주" }),
            diffNote(r.warn, "쪽 나눔은 Word가 다시 정해요.")));
        } else {
          const r = await client.txt(onP);
          if (!alive()) return;
          setCancel(false);
          prog.set(1, "완료!");
          out.replaceChildren(resultBox("텍스트를 만들었어요",
            resultItem({ name: exportName(d.name, "txt"), blob: new Blob([r.text], { type: "text/plain;charset=utf-8" }), extra: "글자만 · UTF-8" }),
            diffNote(r.warn, null)));
        }
      } else if (f === "pdf") {
        // 쪽 JPEG 는 PDF 워커로 옮겨(transfer) 묶어요. 묶을 때 워커 안에 모든 쪽 + 결과가 같이 있어서, 쪽 수 한도(MAX_EXPORT)를 화질별로 둬요
        const parts: { bytes: Uint8Array<ArrayBuffer>; wPt: number; hPt: number }[] = [];
        for (let k = 0; k < total; k++) {
          if (!alive()) return;
          prog.set(k / total * 0.9, `${k + 1}/${total}쪽 그리는 중…`);
          const r = await renderAt(pages[k], "image/jpeg");
          if (!alive()) return;
          const s = d.info.sizes[pages[k]];
          parts.push({ bytes: new Uint8Array(await r.blob.arrayBuffer()), wPt: pxToPt(s.w), hPt: pxToPt(s.h) });
        }
        if (!alive()) return;
        setCancel(false); // 묶기는 금방 끝나요
        prog.set(0.92, "PDF로 묶는 중…");
        const pdf = await runPdf<{ bytes: Uint8Array<ArrayBuffer> }>("pages", { pages: parts }, parts.map((p) => p.bytes.buffer));
        if (!alive()) return;
        prog.set(1, "완료!");
        out.replaceChildren(resultBox("PDF를 만들었어요",
          resultItem({ name: exportName(d.name, "pdf"), blob: new Blob([pdf.bytes], { type: "application/pdf" }), extra: `${total}쪽 · 그림 PDF` })));
      } else if (f === "png") {
        // 쪽마다 그리자마자 ZIP 에 넣고 놓아요(0장 결정 2번). 공유 시트로 다시 보낼 수 있는 장수일 때만 그림을 들고 있어요
        const keep = total === 1 || mayShare(total);
        const kept: PagePng[] = [];
        pack = await pngPack(d.name, total, d.info.pages);
        let dims = "";
        for (let k = 0; k < total; k++) {
          if (!alive()) return;
          prog.set(k / total * (total > 1 ? 0.95 : 1), `${k + 1}/${total}쪽 그리는 중…`);
          const r = await renderAt(pages[k], "image/png");
          if (!alive()) return;
          const p: PagePng = { page: pages[k] + 1, blob: r.blob };
          await pack.add(p);
          if (keep) kept.push(p);
          if (!dims) dims = `${r.w}×${r.h}`;
        }
        if (!alive()) return;
        setCancel(false);
        if (total > 1) prog.set(0.97, "ZIP으로 묶는 중…");
        const res = pack.finish();
        pack = null;
        prog.set(1, "완료!");
        lastPngs = kept;
        const box = resultBox("쪽 그림을 만들었어요",
          resultItem({ name: res.name, blob: res.blob, extra: total > 1 ? `쪽 그림 ${total}장 ZIP` : `${dims} PNG` }));
        const files = shareFilesFor(d.name, kept, d.info.pages);
        if (files) {
          box.insertBefore(h("div", { class: "hwp-share" },
            // 두 번 톡톡 누르면 첫 공유 창이 떠 있는 동안 두 번째가 실패해 '공유하지 못했어요'가 떴어요 → 공유 창이 닫히고 1초까지는 다시 열지 않아요
            h("button", { type: "button", class: "btn", onclick: once(async () => {
              const r = await shareFiles(files);
              if (r === "failed") toast("공유하지 못했어요. 내려받아서 보내 주세요.");
            }) }, h("span", { html: SHARE_ICON, style: "display:contents" }), "카톡 등으로 보내기"),
            h("p", { class: "hint" }, "카톡에서 글자가 흐리면 사진 화질을 ‘원본’으로 바꿔 보내 주세요.")), box.querySelector(".hwp-again"));
        } else if (total > SHARE_MAX && typeof navigator.canShare === "function") {
          box.insertBefore(h("p", { class: "hint" }, `${SHARE_MAX}장이 넘으면 ZIP으로 받아서 보내 주세요.`), box.querySelector(".hwp-again"));
        }
        out.replaceChildren(box);
      }
    } catch (e) {
      if (!alive()) return; // 취소·다른 파일 뒤에 끝난 요청(Word·텍스트는 워커를 버려서 '취소'로 끝나요)
      if (!pic && e instanceof HwpClientError && (e.code === "timeout" || e.code === "fatal")) {
        // 워커를 버렸으니 원본 바이트로 다시 열어요(12-10). 보기는 그대로 이어져요
        const msg = e.code === "fatal" ? MSG.exportCrashed : f === "docx" ? MSG.docxTooBig : MSG.txtTooBig;
        after = () => reopen(msg);
        return;
      }
      if (e instanceof HwpClientError && (e.code === "fatal" || e.code === "timeout" || e.code === "worker" || e.code === "load")) { failTo(MSG.crashed); return; }
      err.show(e instanceof HwpClientError ? (pic ? "쪽을 그리지 못했어요. 다시 해 주세요." : "문서를 옮기지 못했어요. 다른 형식으로 저장해 보세요.") : (e as Error)?.message || "저장하지 못했어요. 다시 해 주세요.");
    } finally {
      pack?.abort(); // 다 묶기 전에 멈췄으면 모은 조각을 버려요
      if (g === gen) {
        const cancelled = t !== exportTok;
        busy = false; exportFmt = null; setCancel(false);
        // Word·텍스트를 취소했으면 워커를 버렸으니 늘 다시 열어요(그 사이 결과가 왔어도 버려요)
        if (cancelled && !pic && !after) after = () => reopen(MSG.cancelled, "info");
        if (after) { prog.hide(); void after(); }
        else if (cancelled) { prog.hide(); out.replaceChildren(); updateOpts(); toast(MSG.cancelled); }
        else { setTimeout(() => { if (!busy) prog.hide(); }, 800); updateOpts(); }
      }
    }
  }
  function resultBox(title: string, item: HTMLElement, note?: HTMLElement | null): HTMLElement {
    return h("div", { class: "result", id: "result" }, h("h2", {}, icon("ok"), title), item, note ?? null,
      // 암호로 연 문서: 저장한 파일에는 암호가 없어요(설계 밖 안내, 검토 제안)
      doc?.password ? h("p", { class: "hint hwp-pwnote" }, MSG.pwNote) : null,
      h("button", { type: "button", class: "btn ghost sm hwp-again", onclick: () => {
        out.replaceChildren(); lastPngs = []; prog.hide(); toggleExport(true); exportBox.scrollIntoView({ block: "nearest" });
        holdTaps(); // 두 번 톡톡의 두 번째 누름이 결과가 걷힌 자리로 올라온 형식 카드('텍스트')를 골랐어요
        // 누른 단추가 결과와 함께 사라져 초점이 문서 맨 앞으로 빠졌어요 → 고른 형식 카드로
        focusIfLost(fmtGroup.querySelector<HTMLElement>('[aria-checked="true"]'));
      } }, "다른 형식으로 저장"));
  }
  /** Word·텍스트: 원본과 다른 점(12-4-4 문구). 늘 붙는 줄(tail)이 있으면 끝에 */
  function diffNote(w: Warn, tail: string | null): HTMLElement | null {
    const lines = [...warnLines(w), ...(tail ? [tail] : [])];
    if (!lines.length) return null;
    return h("div", { class: "alert info hwp-diff" }, h("b", {}, "원본과 다른 점"), h("ul", {}, ...lines.map((l) => h("li", {}, l))));
  }
  /**
   * Word·텍스트가 시간 한도를 넘기거나 취소해서 워커를 버린 뒤: 원본으로 다시 열어 보기를 이어 가요.
   * 암호 문서는 암호를 남기지 않아서 다시 물어요. kind "info" 는 오류가 아닌 알림(취소)
   */
  async function reopen(msg: string, kind: "" | "info" = ""): Promise<void> {
    const d = doc, b = bytes;
    if (!d || !b) { failTo(msg); return; }
    if (d.password) {
      reset(true);
      bytes = b; pending = { name: d.name, size: d.size, sniff: d.sniff, policy: d.policy };
      askPassword(false);
      err.show(msg + " 문서를 다시 열려면 암호를 한 번 더 넣어 주세요.", kind);
      return;
    }
    const g = gen;
    busy = true; makeBtn.disabled = true;
    try {
      prog.set(null, MSG.reopening);
      const info = await client.open(b.slice().buffer);
      if (g !== gen) return;
      d.info = info;
      err.show(msg, kind);
      void show(); // 줄 서 있다 취소된 쪽이 있었으면 다시 그려요
    } catch { if (g === gen) failTo(msg); }
    finally { if (g === gen) { prog.hide(); busy = false; updateOpts(); } }
  }
  /* ───── 정리 ───── */
  /** 열린 문서·워커·blob 주소·원본 바이트를 모두 버려요. toDrop 이면 드롭존으로 */
  function reset(toDrop: boolean): void {
    gen++; viewTok++;
    client.dispose();
    client = new HwpClient();
    for (const p of inflight.values()) p.catch(() => {});
    inflight.clear();
    clearCache();
    pageImg.removeAttribute("src");
    stage.replaceChildren(placeholder);
    bytes = null; pending = null; doc = null; cur = 0; busy = false; lastPngs = [];
    exportTok++; exportFmt = null; setCancel(false); // 진행 중이던 내보내기는 버려요
    pwIn.value = "";
    out.replaceChildren(); err.hide(); warn.hide(); prog.hide();
    exportBox.hidden = true; exportBtn.setAttribute("aria-expanded", "false");
    range = "all"; rangeIn.value = ""; rangeIn.hidden = true; rangeSeg?.setValue("all");
    tool.classList.remove("hwp-noprint");
    printNote.textContent = "";
    if (toDrop) { viewer.hidden = true; pwPanel.hidden = true; dz.hidden = false; }
  }
  // 뒤로 가기 캐시(bfcache)에 문서·암호로 연 내용이 남지 않게 떠날 때 비워요
  const onHide = () => reset(true);
  window.addEventListener("pagehide", onHide);

  return {
    unmount: () => {
      window.removeEventListener("pagehide", onHide);
      document.removeEventListener("keydown", onKey);
      ro.disconnect();
      clearTimeout(roTimer);
      reset(true);
      client.dispose();
    },
  };
}

const SHARE_ICON = `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><circle cx="18" cy="5" r="3"/><circle cx="6" cy="12" r="3"/><circle cx="18" cy="19" r="3"/><path d="M8.6 13.5l6.8 4M15.4 6.5l-6.8 4"/></svg>`;
