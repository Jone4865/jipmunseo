/// <reference types="vite/client" />
// 집문서 — 라우터 (#pdf-merge 같은 주소로 도구마다 공유 가능)
import { h, ICONS, arrowed, filesFromPaste, toast, focusIfLost, revealIfBelow, resultFiles } from "./ui.js";
import { installTapGuard, holdTaps } from "./tap.js";
import { mountMerge, mountSplit, mountOrganize, mountPdfCompress } from "./tools-pdf.js";
import { mountImgToPdf, mountCompress, mountExif } from "./tools-img.js";
import { mountBg } from "./tools-bg.js";
import { mountMask } from "./tools-mask.js";
import { art } from "./art.js";
import { TOOL_INFO, toolGridHtml } from "./tool-list.js";
import { toolsForFiles, noToolMessage, sayArrows, nextToolsFor, pickNextSource } from "./lib.js";
import { stampResult } from "./motion.js";
import { PREF, readPref, writePref, pushRecent, parseRecent } from "./prefs.js";

/** 도구 화면이 돌려주는 것 (없으면 {}) */
export interface Mounted { unmount?: () => void; onPaste?: (files: File[]) => void }
interface Tool { id: string; title: string; desc: string; mount: (body: HTMLElement) => Mounted | void }

/** 그 도구를 열 때만 코드를 받아요(첫 화면 무게 그대로 — HWP_SPEC 0장 결정 10번). 붙여넣기는 받지 않는 도구용 */
function lazyMount(load: () => Promise<(body: HTMLElement) => Mounted | void>): (body: HTMLElement) => Mounted {
  return (body) => {
    let inner: Mounted | null = null, gone = false;
    body.append(h("p", { class: "hint", style: "color:var(--mat-muted)" }, "도구를 여는 중…"));
    load().then((mount) => { if (gone) return; body.replaceChildren(); inner = mount(body) || {}; })
      .catch(() => { if (!gone) body.replaceChildren(loadFailBox(navigator.onLine !== false)); });
    return { unmount: () => { gone = true; inner?.unmount?.(); } };
  };
}
/**
 * 도구 코드를 못 받았을 때. 인터넷이 되는데도 못 받는 건 대개 이 화면을 연 뒤에 집문서가 새로 배포돼 옛 코드 이름이 없어진 경우라
 * '인터넷 연결을 확인하라'고만 하면 헷갈려요 → 새로 고침 단추를 같이 둬요(주소의 #도구 는 그대로라 같은 도구가 열려요)
 */
export function loadFailBox(online: boolean): HTMLElement {
  return h("div", { class: "alert", role: "alert" },
    online ? "도구를 불러오지 못했어요. 그사이 집문서가 새로 바뀌었을 수 있어요. 새로 고침하면 열려요." : "도구를 불러오지 못했어요. 인터넷 연결을 확인하고 새로 고침해 주세요.",
    h("div", { class: "row", style: "margin-top:10px" }, h("button", { type: "button", class: "btn sm", onclick: () => location.reload() }, "새로 고침")));
}
const mountHwp = lazyMount(() => import("./tools-hwp.js").then((m) => m.mountHwp));
const MOUNTS: Record<string, (body: HTMLElement) => Mounted | void> = {
  "hwp-view": mountHwp, "pdf-merge": mountMerge, "pdf-split": mountSplit, "pdf-organize": mountOrganize, "pdf-compress": mountPdfCompress,
  "id-mask": mountMask, "img-to-pdf": mountImgToPdf, "img-compress": mountCompress, "bg-remove": mountBg, "exif-clean": mountExif,
};
// 이름·설명은 tool-list.ts 한곳에(첫 화면 HTML 에도 빌드 때 그대로 들어가요)
const TOOLS: Tool[] = TOOL_INFO.map((t) => ({ ...t, mount: MOUNTS[t.id] }));
const byId = Object.fromEntries(TOOLS.map((t) => [t.id, t]));
// 화면이 바뀐 바로 뒤의 두 번째 누름을 걸러요(tap.ts)
installTapGuard(document);

// 아래 id 들은 index.html 에 항상 있음
const $id = (id: string) => document.getElementById(id) as HTMLElement;

// 작업대 위 도구들 — 빌드한 index.html 에는 이미 들어 있어요(tool-list.ts). 비어 있을 때만 채워요
const grid = $id("tool-grid");
if (!grid.querySelector(".tool-item")) grid.innerHTML = toolGridHtml();

// 첫 화면 아무 곳에나 파일을 떨어뜨리면 쓸 도구를 골라 주는데(offerTools), 그걸 알려 주는 곳이 없었어요 — 마우스 화면에만 적어요
if (typeof matchMedia === "function" && matchMedia("(hover: hover) and (pointer: fine)").matches) {
  const bt = document.querySelector(".bench-title");
  if (bt) bt.textContent = "작업대 · 쓸 도구를 고르거나, 파일을 이 화면에 끌어다 놓으세요";
}

/* 최근에 연 도구(3개) — 첫 화면 소개 아래 칩. 도구 이름만 기억해요(prefs.ts) */
let recent = parseRecent(readPref(PREF.recent), new Set(TOOLS.map((t) => t.id)));
function renderRecent(): void {
  const box = $id("recent");
  box.hidden = !recent.length;
  box.replaceChildren(...(recent.length ? [h("span", { class: "recent-lbl" }, "최근에 쓴 도구"), ...recent.map((id) => h("a", { href: `#${id}` }, ...arrowed(byId[id].title)))] : []));
}

/* 첫 화면에 떨어뜨린 파일 → 쓸 도구를 고르면 그 도구에 파일을 넘겨요 */
let handoff: File[] | null = null;
function offerTools(files: File[]): void {
  const ids = toolsForFiles(files);
  const box = $id("drop-offer");
  if (!ids.length) { box.hidden = true; toast(noToolMessage(files)); return; }
  if (ids.length === 1) { openWith(ids[0], files); return; }
  // 파일 이름 뒤에 바로 조사를 붙이면 받침에 따라 '로/으로'가 틀려서('계약서 최종본로') '파일로'로 받아요
  const what = files.length === 1 ? `‘${files[0].name}’ 파일` : `파일 ${files.length}개`;
  box.replaceChildren(
    h("p", { class: "offer-title" }, `${what}로 무엇을 할까요?`),
    h("div", { class: "offer-tools" }, ...ids.map((id) => h("button", { type: "button", class: "btn", onclick: () => { box.hidden = true; openWith(id, files); } }, h("span", {}, ...arrowed(byId[id].title))))), // 단추의 flex 틈이 화살표 양옆에 또 붙어 '이미지   →   PDF'로 벌어지지 않게 한 덩어리로
    // '그만두기'로 상자가 숨으면 초점이 문서 맨 앞으로 빠졌어요 → 바로 아래 도구 목록의 첫 도구로
    h("button", { type: "button", class: "btn ghost sm", onclick: () => { box.hidden = true; holdTaps(); focusIfLost($id("tool-grid").querySelector<HTMLElement>("a")); } }, "그만두기"));
  box.hidden = false;
  box.scrollIntoView({ block: "nearest", behavior: matchMedia("(prefers-reduced-motion: reduce)").matches ? "auto" : "smooth" });
  (box.querySelector(".offer-tools button") as HTMLElement | null)?.focus({ preventScroll: true });
}
/**
 * 그 도구를 열고 파일을 넣어요. 그 도구가 이미 열려 있으면 주소가 같아 hashchange 가 오지 않아서 지금 칸에 바로 넣어요
 * (/hwp 에서 고른 파일이 /#hwp-view 로 넘어왔을 때, 설치한 앱을 HWP 보기에 둔 채 '연결 프로그램'으로 열 때)
 */
function openWith(id: string, files: File[]): void {
  const body = shownTool === id ? view.querySelector<HTMLElement>(".tool-body") : null;
  if (body) { giveFiles(body, files); return; }
  handoff = files;
  location.hash = id;
}
/** 도구의 파일 고르기 칸에 넘겨받은 파일을 넣어요(HWP 처럼 코드를 받는 도구는 칸이 생길 때까지 잠깐 기다려요) */
function giveFiles(body: HTMLElement, files: File[], tries = 0): void {
  const input = body.querySelector<HTMLInputElement>(".drop input[type=file]");
  if (!input) {
    if (!body.isConnected) return;
    // 도구 코드를 받는 데 오래 걸리면(느린 연결) 기다리다 말없이 파일을 버리지 않고 다시 놓아 달라고 해요
    if (tries < 50) setTimeout(() => giveFiles(body, files, tries + 1), 100);
    else toast("파일을 점선 상자에 다시 놓아 주세요");
    return;
  }
  try {
    const dt = new DataTransfer();
    for (const f of files) dt.items.add(f);
    input.files = dt.files;
    input.dispatchEvent(new Event("change"));
  } catch { toast("파일을 점선 상자에 다시 놓아 주세요"); }
}

/**
 * 결과 아래 '이어서' 줄(벤치마킹 2026-10-22, iLovePDF·Smallpdf): 합친 PDF를 줄이거나 HWP 를 PDF 로 바꿔 합치려면
 * 내려받고 → 모든 도구 → 다시 파일 고르기를 해야 했어요(휴대폰은 방금 받은 파일을 다운로드 폴더에서 다시 찾아야 해요).
 * 결과 파일을 그대로 다음 도구의 파일 칸에 넣어요. 결과가 여러 개(나누기·사진 여러 장)면 어느 걸 넘길지 몰라서 두지 않아요
 */
function addNextRow(res: HTMLElement, current: string | null): void {
  const old = res.querySelector<HTMLElement>(":scope > .next-tools");
  const rows = [...res.querySelectorAll<HTMLElement>(".ritem")].map((r) => resultFiles.get(r)).filter((x): x is { name: string; blob: Blob } => !!x);
  const src = current ? pickNextSource(rows.map((r) => ({ ...r, type: r.blob.type }))) : null;
  const ids = src ? nextToolsFor({ name: src.name, type: src.blob.type }, current as string).filter((id) => byId[id]) : [];
  // 사진 여러 장처럼 결과 줄이 하나씩 붙는 도구는 줄이 늘 때마다 다시 봐요(첫 줄만 보고 넘기지 않게)
  const key = src && ids.length ? `${src.name}|${src.blob.size}|${current}` : "";
  if (old && old.dataset.key === key) return;
  old?.remove();
  if (!src || !key) return;
  const lbl = h("span", { class: "next-lbl", id: "next-lbl" }, "이 파일로 이어서");
  const row = h("div", { class: "next-tools", role: "group", "aria-labelledby": "next-lbl" }, lbl,
    ...ids.map((id) => h("button", { type: "button", class: "next-btn", onclick: () => {
      handoff = [new File([src.blob], src.name, { type: src.blob.type || (/\.pdf$/i.test(src.name) ? "application/pdf" : "") })];
      location.hash = id;
    } }, h("span", {}, ...arrowed(byId[id].title)))));
  row.dataset.key = key;
  res.append(row);
}

const home = $id("home");
const view = $id("tool-view");
const other = $id("other-tools");
const baseTitle = document.title;
let active: Mounted | null = null;
/** 지금 열려 있는 도구 — 첫 화면으로 돌아오면 그 도구 칸으로 초점을 돌려요 */
let shownTool: string | null = null;
/** 위쪽 '집문서' 글자를 눌렀으면 첫 화면 맨 위로(쓰던 도구 칸으로 내려가지 않아요) */
let toTop = false;
document.querySelector(".brand")?.addEventListener("click", () => { toTop = !!shownTool; });

function route(first = false) {
  const id = location.hash.slice(1);
  const tool = byId[id];
  // 도구 카드·'모든 도구'를 두 번 톡톡 누르면 두 번째 누름이 새 화면의 파일 넣는 곳(파일 고르기 창)이나 도구 카드에 닿았어요(처음 열 때는 거르지 않아요)
  if (!first) holdTaps();
  if (active) { try { active.unmount?.(); } catch {} active = null; }
  if (!tool) {
    view.hidden = true; view.replaceChildren();
    home.hidden = false; other.hidden = true;
    document.title = baseTitle;
    renderRecent();
    // '모든 도구'·뒤로 가기로 돌아오면 초점이 사라진 도구 화면과 함께 문서 맨 앞으로 빠져, 키보드·화면 읽기로는 어디인지 몰랐어요(QA 6바퀴)
    // → 방금 쓴 도구 칸으로 초점과 화면을 돌려요. 위쪽 '집문서' 글자처럼 초점이 남아 있는 곳에서 왔으면 맨 위로
    const from = shownTool; shownTool = null;
    const card = from && !toTop ? grid.querySelector<HTMLElement>(`a[href="#${from}"]`) : null;
    toTop = false;
    focusIfLost(card);
    if (id && document.getElementById(id)) $id(id).scrollIntoView();
    else if (card && document.activeElement === card) card.scrollIntoView({ block: "center" });
    else window.scrollTo(0, 0);
    return;
  }
  home.hidden = true; view.hidden = false;
  document.title = `${tool.title} — 집문서`;
  const body = h("div", { class: "tool-body" });
  view.replaceChildren(h("section", { class: "tool", "aria-labelledby": "tool-title" },
    h("a", { class: "back", href: "#" }, h("span", { html: ICONS.back, style: "display:contents" }), "모든 도구"),
    h("div", { class: "tool-head" }, h("span", { html: art(tool.id), style: "display:contents" }),
      h("div", {}, h("h1", { id: "tool-title", tabindex: "-1" }, ...arrowed(tool.title)), h("p", {}, tool.desc))),
    h("div", { class: "mat work" }, body)));
  other.hidden = false;
  other.replaceChildren(...TOOLS.filter((t) => t.id !== id).map((t) => h("a", { href: `#${t.id}` }, ...arrowed(t.title))));
  active = tool.mount(body) || {};
  recent = pushRecent(recent, id);
  writePref(PREF.recent, JSON.stringify(recent));
  $id("drop-offer").hidden = true;
  shownTool = id;
  // 도구 칸을 키보드로 열면 누른 칸이 숨어 초점이 문서 맨 앞으로 빠졌어요 → 도구 제목으로(화면 읽기가 어느 도구인지 읽어요)
  if (!first) focusIfLost(view.querySelector<HTMLElement>("#tool-title"));
  if (handoff) { const fs = handoff; handoff = null; giveFiles(body, fs); }
  window.scrollTo(0, 0);
}

window.addEventListener("hashchange", () => route());
route(true);

/* 안내 페이지(/hwp)에서 고른 파일 — 넘어오는 동안만 IndexedDB 에 두고 꺼내자마자 지워요(src/handoff.ts, 처리방침 '넣은 파일').
   첫 화면 무게를 그대로 두려고 표시(sessionStorage 'jms.handoff' = HANDOFF_FLAG)나 남은 저장소가 있을 때만 코드를 받아요 */
let handoffFlag = false;
try { handoffFlag = !!sessionStorage.getItem("jms.handoff"); } catch {}
if (handoffFlag) {
  import("./handoff.js").then(async (m) => {
    const got = await m.takeHandoff();
    if (got && byId[got.tool]) openWith(got.tool, got.files);
    else if (got && !got.tool) offerTools(got.files); // 한글 문서가 아닌 것은 첫 화면에서 쓸 도구를 골라요
    else toast("파일을 넘겨받지 못했어요. 점선 상자를 눌러 다시 골라 주세요");
  }).catch(() => toast("파일을 넘겨받지 못했어요. 점선 상자를 눌러 다시 골라 주세요"));
} else {
  // 넘기는 중에 탭을 닫아 남은 것은 꺼내지 않고 지워요
  (indexedDB as IDBFactory & { databases?: () => Promise<{ name?: string }[]> }).databases?.()
    .then((dbs) => { if (dbs.some((d) => d.name === "jms-handoff")) return import("./handoff.js").then((m) => m.clearHandoff()); })
    .catch(() => {});
}

/* 화면 읽기: 도구가 결과를 그리면 그 제목('3쪽짜리 PDF가 만들어졌어요')을 한 번 읽어 줘요.
   예전에는 'PDF 합치기'만 저장 단추로 초점을 옮겨서, 다른 도구는 끝난 걸 화면 읽기로 알 수 없었어요.
   배경 색을 바꿀 때처럼 같은 결과를 곧바로 다시 그리면 또 읽지 않아요 */
const srStatus = $id("sr-status");
let lastSaid = { text: "", at: 0 };
new MutationObserver((recs) => {
  // 이미 있는 결과에 줄이 더 붙은 것(사진 여러 장) — '이어서' 줄만 다시 봐요
  const grown = new Set<HTMLElement>();
  for (const r of recs) {
    const res = r.target instanceof Element ? r.target.closest<HTMLElement>(".result") : null;
    if (res) grown.add(res);
  }
  for (const res of grown) addNextRow(res, shownTool);
  for (const r of recs) for (const n of r.addedNodes) {
    if (!(n instanceof HTMLElement)) continue;
    const res = n.matches(".result") ? n : n.querySelector(".result");
    const h2 = res?.querySelector("h2");
    if (!h2) continue;
    addNextRow(res as HTMLElement, shownTool);
    // 제목 옆 알약('52% 줄었어요')은 쉼표로 띄우고, 화살표는 '…에서 …로'로 읽어요
    const c = h2.cloneNode(true) as HTMLElement;
    c.querySelectorAll(".pill").forEach((p) => p.prepend(", "));
    const t = sayArrows(c.textContent || "");
    if (!t || (t === lastSaid.text && Date.now() - lastSaid.at < 5000)) continue;
    // 결과가 화면 아래 밖에 생기면 보이게 내리고, '만들기' 단추가 일하는 동안 꺼져 초점이 문서 맨 앞으로 빠졌으면 내려받기 단추로
    revealIfBelow(res as HTMLElement);
    focusIfLost(res?.querySelector<HTMLElement>("button.primary") ?? null);
    lastSaid = { text: t, at: Date.now() };
    // 새 결과만 확인 도장을 찍어요(같은 결과를 다시 그릴 때는 위에서 걸러져요)
    stampResult(res as HTMLElement);
    srStatus.textContent = "";
    setTimeout(() => { srStatus.textContent = t; }, 60);
  }
}).observe(view, { childList: true, subtree: true });

// 클립보드 붙여넣기 (이미지 도구)
document.addEventListener("paste", (e) => {
  if (!active?.onPaste) return;
  if (e.target instanceof HTMLInputElement && e.target.type === "text") return;
  const files = filesFromPaste(e);
  if (files.length) { e.preventDefault(); active.onPaste(files); toast(`붙여넣은 이미지 ${files.length}개를 넣었어요`); }
});

// 도구 밖에 파일을 떨어뜨려도 브라우저가 파일을 열어버리지 않게
window.addEventListener("dragover", (e) => { if ([...(e.dataTransfer?.types || [])].includes("Files")) e.preventDefault(); });
window.addEventListener("drop", (e) => {
  if (!e.defaultPrevented && [...(e.dataTransfer?.types || [])].includes("Files")) {
    e.preventDefault();
    if (active) toast("점선 상자 안에 놓아 주세요");
    else offerTools([...(e.dataTransfer as DataTransfer).files]);
  }
});

// 설치한 앱(PC Chrome·Edge)에서 HWP·PDF 파일을 '연결 프로그램 › 집문서'로 열면 첫 화면에 떨어뜨린 것처럼 도구로 넘겨요(manifest file_handlers)
interface LaunchParams { files: readonly { getFile(): Promise<File> }[] }
const lq = (window as unknown as { launchQueue?: { setConsumer(f: (p: LaunchParams) => void): void } }).launchQueue;
lq?.setConsumer(async (p) => {
  if (!p.files?.length) return;
  try { offerTools(await Promise.all(p.files.map((f) => f.getFile()))); } catch { toast("파일을 열지 못했어요. 점선 상자에 다시 놓아 주세요"); }
});

// 인터넷 없이 다시 열기: 배포본에만 서비스 워커(dist/sw.js — vite.config.ts swPlugin). 개발 서버에서는 쓰지 않아요
if (import.meta.env.PROD && "serviceWorker" in navigator) {
  addEventListener("load", () => { navigator.serviceWorker.register("/sw.js").catch(() => {}); });
}
