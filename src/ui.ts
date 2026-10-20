// 공통 UI 조각 + 라이브러리 로더
import { ICONS } from "./icons.js";
import { formatSize, kindOf, moveItem, zipWriter, uniqueName } from "./lib.js";
import { vendorImport, type PdfjsModule, type PdfjsDocument, type HeicToModule, type FflateModule } from "./vendor.js";
import { holdTaps } from "./tap.js";

/* ───── DOM 도우미 ───── */
/** h() 속성: class · html · on<이벤트> · dataset · 그 밖의 속성(true 면 빈 값, null/false 면 생략) */
export type Attrs = Record<string, unknown>;
export type Kid = Node | string | number | null | undefined | false | Kid[];
export function h<K extends keyof HTMLElementTagNameMap>(tag: K, attrs?: Attrs | null, ...kids: Kid[]): HTMLElementTagNameMap[K] {
  const el = document.createElement(tag);
  for (const [k, v] of Object.entries(attrs || {})) {
    if (v == null || v === false) continue;
    if (k === "class") el.className = v as string;
    else if (k === "html") el.innerHTML = v as string;
    else if (k.startsWith("on")) el.addEventListener(k.slice(2).toLowerCase(), v as EventListener);
    else if (k === "dataset") Object.assign(el.dataset, v);
    else el.setAttribute(k, v === true ? "" : (v as string));
  }
  for (const kid of (kids as unknown[]).flat()) {
    if (kid == null || kid === false) continue;
    el.append(kid instanceof Node ? kid : document.createTextNode(String(kid)));
  }
  return el;
}

export { ICONS };
export const icon = (name: string) => h("span", { html: ICONS[name], style: "display:contents" });
/**
 * 글 속 화살표(→)를 집문서 화살표 아이콘으로: "이미지 → PDF" 처럼. 화면 읽기 프로그램·복사에는 숨긴 "→" 글자가 남아요.
 * deco: 꾸밈 화살표("알려 주세요 →")는 숨긴 글자 없이 아이콘만
 */
export function arrowed(text: string, deco = false): Kid[] {
  const out: Kid[] = [];
  text.split(/\s*→\s*/).forEach((part, i) => {
    if (i) out.push(h("span", { class: "arr", html: ICONS.arrow }), deco ? null : h("span", { class: "sr" }, "→"));
    if (part) out.push(part);
  });
  return out;
}
export function iconBtn(name: string, label: string, onClick: (e: MouseEvent) => void, extra = ""): HTMLButtonElement {
  return h("button", { type: "button", class: `icon-btn ${extra}`, title: label, "aria-label": label, html: ICONS[name], onclick: onClick });
}

/**
 * 목록 항목의 단추('위로'·'아래로'·'빼기'·돌리기)를 누르면 목록을 통째로 새로 그려서, 키보드로 누르면 초점이 페이지 맨 앞으로 빠졌어요.
 * 단추가 초점을 가진 채 눌렸으면(키보드·안드로이드) 다시 그린 뒤 옮긴 항목의 같은 단추로 초점을 돌려요.
 * 끝에 닿아 그 단추가 꺼졌으면 그 항목의 켜진 단추로, 지운 항목이면 그 자리에 온 항목으로.
 */
/** 목록 단추를 누른 뒤 줄이 옮겨졌거나 빠졌는지(같은 자리에 다른 줄이 왔는지) — 아니면 두 번 톡톡 거르기를 걸지 않아요 */
export const rowMoved = (from: number, to: number | null, countBefore: number, countAfter: number): boolean =>
  from < 0 || countBefore !== countAfter || (to !== null && to !== from);
export function rowAction(container: HTMLElement, rowSel: string, act: () => number | null): (e: MouseEvent) => void {
  return (e) => {
    const btn = e.currentTarget as HTMLElement | null;
    const had = !!btn && btn === document.activeElement;
    const label = btn?.getAttribute("aria-label") ?? "";
    const before = [...container.querySelectorAll(rowSel)];
    const from = btn ? before.findIndex((r) => r.contains(btn)) : -1;
    const to = act();
    // 줄이 옮겨지거나 빠지면 같은 자리로 다른 줄이 와요 — 두 번 톡톡의 두 번째 누름이 다음 파일까지 빼거나 되돌려 놓지 않게.
    // 돌리기처럼 줄이 제자리에 남으면 거르지 않아요 — 예전에는 '오른쪽으로 돌리기'를 빠르게 두 번 눌러도 90°만 돌았어요(버그 5차)
    if (rowMoved(from, to, before.length, container.querySelectorAll(rowSel).length)) holdTaps();
    if (!had || to === null) return;
    const rows = container.querySelectorAll<HTMLElement>(rowSel);
    const row = rows[Math.max(0, Math.min(to, rows.length - 1))];
    if (!row) return;
    const btns = [...row.querySelectorAll<HTMLButtonElement>("button")].filter((b) => !b.disabled);
    (btns.find((b) => b.getAttribute("aria-label") === label) ?? btns[0])?.focus();
  };
}

/**
 * 누른 단추가 숨거나 사라지면('다른 PDF'·'모두 지우기'로 작업 칸이 닫힘, 파일을 넣어 파일 넣는 곳이 숨음, '그만두기')
 * 초점이 문서 맨 앞으로 빠져서 탭 키를 처음부터 눌러야 했어요 → 초점을 잃었을 때만 to 로 옮겨요.
 * 마우스·손가락으로 누른 사람의 화면은 움직이지 않게(preventScroll)
 */
export function focusIfLost(to: HTMLElement | null | undefined): void {
  const a = document.activeElement;
  if (a && a !== document.body && a.isConnected && !(a as HTMLElement).closest("[hidden]")) return;
  if (to && to.isConnected && !to.closest("[hidden]")) to.focus({ preventScroll: true });
}
/**
 * 단추를 끄기 전에 그 단추에 초점이 있었으면 alt 로 옮겨요 — 꺼진 단추는 초점을 가질 수 없어서 마지막 '되돌리기'·끝 쪽의 '뒤 쪽'을
 * 키보드로 누르면 초점이 문서 맨 앞으로 빠졌어요
 */
export function setDisabledKeepingFocus(btn: HTMLButtonElement, off: boolean, alt: () => HTMLElement | null | undefined): void {
  const had = off && !btn.disabled && document.activeElement === btn;
  btn.disabled = off;
  if (had) alt()?.focus({ preventScroll: true });
}
/**
 * 내려받기·ZIP·보내기 단추를 빠르게 두 번 누르면 같은 파일이 두 번 받아졌고, 보내기는 첫 공유 창이 떠 있는 동안 두 번째가 실패해
 * '공유하지 못했어요'가 떴어요 → 일이 끝나고 1초까지는 다시 받지 않아요
 */
export function once<A extends unknown[]>(fn: (...a: A) => unknown, ms = 1000): (...a: A) => Promise<void> {
  let busy = false;
  return async (...a) => {
    if (busy) return;
    busy = true;
    try { await fn(...a); } finally { setTimeout(() => { busy = false; }, ms); }
  };
}

/**
 * 진행 표시·결과·펼친 칸이 화면 아래 밖에 생기면 보이게 내려요. 휴대폰에서 화면 맨 아래의 '만들기'·'내보내기'를 누르면
 * 진행 막대와 결과가 화면 밖에 생겨, 눌러도 아무 일이 없는 것처럼 보였어요. 이미 보이면 움직이지 않아요
 */
export function revealIfBelow(el: HTMLElement | null | undefined, block: ScrollLogicalPosition = "nearest"): void {
  if (!el || !el.isConnected || el.closest("[hidden]")) return;
  const r = el.getBoundingClientRect();
  if (r.top <= window.innerHeight - 48) return;
  const smooth = typeof matchMedia === "function" && !matchMedia("(prefers-reduced-motion: reduce)").matches;
  el.scrollIntoView({ block, behavior: smooth ? "smooth" : "auto" });
}

/* ───── 토스트 ───── */
let toastTimer: ReturnType<typeof setTimeout> | undefined;
export function toast(msg: string): void {
  const t = document.getElementById("toast") as HTMLElement;
  t.textContent = msg;
  t.classList.add("show");
  clearTimeout(toastTimer);
  toastTimer = setTimeout(() => t.classList.remove("show"), 2600);
}

/* ───── 드롭존 ───── */
// accept: input accept 문자열, filter(file) → true 면 받음. compact 는 파일이 들어온 뒤 작게.
export type Dropzone = HTMLDivElement & { setCompact(on: boolean, label?: string): void };
/**
 * 손가락 화면(휴대폰·태블릿)에서는 끌어다 놓을 곳도, 붙여넣을 키도 없어서 '…을 끌어다 놓으세요 / 또는 눌러서 고르기'가 할 일을 가렸어요
 * → '…을 골라 주세요'로 바꾸고 '눌러서 고르기'·'붙여넣기도 돼요'는 빼요. 마우스 화면은 그대로예요.
 */
export function dropText(title: string, sub: string, touch: boolean): { title: string; sub: string } {
  if (!touch) return { title, sub };
  return {
    title: title.replace(/(?:여기에 )?끌어다 놓으세요$/, "골라 주세요"),
    sub: sub.replace(/^또는 눌러서 고르기(?: · )?/, "").replace(/ · 눌러서 고르기/, "").replace(/ · 붙여넣기(?:\(Ctrl\+V\))?도 돼요$/, ""),
  };
}
export const touchFirst = (): boolean => typeof matchMedia === "function" && matchMedia("(hover: none) and (pointer: coarse)").matches;

export function dropzone({ accept, multiple = true, title: title0, sub: sub0, onFiles }: { accept: string; multiple?: boolean; title: string; sub: string; onFiles: (files: File[]) => void }): Dropzone {
  const { title, sub } = dropText(title0, sub0, touchFirst());
  const input = h("input", { type: "file", accept, multiple: multiple || null, tabindex: "-1", "aria-hidden": "true" });
  const el = h("div", { class: "drop", tabindex: "0", role: "button", "aria-label": title },
    h("span", { html: ICONS.upload, style: "display:contents" }),
    h("div", { class: "drop-title" }, title),
    sub ? h("div", { class: "drop-sub" }, sub) : null,
    input) as Dropzone;
  const pick = () => input.click();
  el.addEventListener("click", (e) => { if (e.target !== input) pick(); });
  el.addEventListener("keydown", (e) => { if (e.key === "Enter" || e.key === " ") { e.preventDefault(); pick(); } });
  input.addEventListener("change", () => { const fs = [...(input.files as FileList)]; input.value = ""; if (fs.length) onFiles(fs); });
  let depth = 0;
  el.addEventListener("dragenter", (e) => { if (hasFiles(e)) { e.preventDefault(); depth++; el.classList.add("over"); } });
  el.addEventListener("dragover", (e) => { if (hasFiles(e)) { e.preventDefault(); (e.dataTransfer as DataTransfer).dropEffect = "copy"; } });
  el.addEventListener("dragleave", () => { depth = Math.max(0, depth - 1); if (!depth) el.classList.remove("over"); });
  el.addEventListener("drop", (e) => {
    if (!hasFiles(e)) return;
    e.preventDefault(); depth = 0; el.classList.remove("over");
    const fs = [...(e.dataTransfer as DataTransfer).files];
    if (fs.length) onFiles(multiple ? fs : fs.slice(0, 1));
  });
  el.setCompact = (on, label) => {
    el.classList.toggle("compact", on);
    (el.querySelector(".drop-title") as HTMLElement).textContent = on ? (label || "파일 더 넣기") : title;
  };
  return el;
}
const hasFiles = (e: DragEvent) => [...(e.dataTransfer?.types || [])].includes("Files");

/* ───── 진행 표시 ───── */
export function progress() {
  const fill = h("i");
  const bar = h("div", { class: "bar" }, fill);
  const text = h("div", { class: "ptext" });
  // 화면 읽기: 막대에 이름('진행 상황')과 지금 하는 일(aria-valuetext — '모델 받는 중… 12.3 / 56.1MB')을 붙여요
  const el = h("div", { class: "progress", hidden: true, role: "progressbar", "aria-label": "진행 상황", "aria-valuemin": "0", "aria-valuemax": "100" }, bar, text);
  return {
    el,
    set(frac?: number | null, msg?: string | null) {
      const was = el.hidden;
      el.hidden = false;
      if (was) revealIfBelow(el);
      const indet = frac == null;
      bar.classList.toggle("indet", indet);
      if (!indet) { const p = Math.round(Math.max(0, Math.min(1, frac)) * 100); fill.style.width = p + "%"; el.setAttribute("aria-valuenow", String(p)); }
      if (msg != null) { text.textContent = msg; el.setAttribute("aria-valuetext", msg); }
    },
    hide() { el.hidden = true; fill.style.width = "0"; },
  };
}

/* ───── 알림 ───── */
export function alertBox() {
  const el = h("div", { class: "alert", hidden: true, role: "alert" });
  return {
    el,
    show(msg: string, kind = "") { el.className = `alert ${kind}`; el.textContent = msg; el.hidden = false; },
    hide() { el.hidden = true; },
  };
}
export const errMsg = (e: unknown): string => (e ? (e as Error).message : "") || String(e || "알 수 없는 문제가 생겼어요.");

/* ───── 내려받기 ───── */
export function download(blob: Blob, name: string): void {
  const url = URL.createObjectURL(blob);
  const a = h("a", { href: url, download: name, style: "display:none" });
  document.body.append(a);
  a.click();
  a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 60_000);
}

/** 결과 한 줄: 이름, 크기, (부가정보), 내려받기 버튼 */
export function resultItem({ name, blob, extra, thumb }: { name: string; blob: Blob; extra?: Kid; thumb?: Node | null }): HTMLDivElement {
  const btn = h("button", { type: "button", class: "btn sm primary", onclick: once(() => download(blob, name)) }, icon("dl"), "내려받기");
  btn.dataset.name = name;
  return h("div", { class: "ritem" },
    thumb || null,
    h("div", { class: "fmeta" }, h("div", { class: "fname", title: name }, name), h("div", { class: "fsub" }, formatSize(blob.size), extra ? h("span", {}, " · ", extra) : null)),
    btn);
}


/* ───── 드래그로 순서 바꾸기 (데스크톱). 휴대폰은 버튼으로 ───── */
export function sortable(container: HTMLElement, itemSelector: string, onMove: (from: number, to: number) => void, { horizontal = false } = {}): void {
  let from = -1;
  const items = () => [...container.querySelectorAll<HTMLElement>(itemSelector)];
  const clear = () => items().forEach((x) => x.classList.remove("drop-before", "drop-after", "dragging"));
  container.addEventListener("dragstart", (e) => {
    const it = (e.target as Element).closest<HTMLElement>(itemSelector);
    if (!it) return;
    from = items().indexOf(it);
    it.classList.add("dragging");
    const dt = e.dataTransfer as DataTransfer;
    dt.effectAllowed = "move";
    dt.setData("text/x-jipmunseo", String(from));
  });
  const where = (e: DragEvent, it: Element) => {
    const r = it.getBoundingClientRect();
    return horizontal ? (e.clientX - r.left > r.width / 2) : (e.clientY - r.top > r.height / 2);
  };
  container.addEventListener("dragover", (e) => {
    if (from < 0) return;
    const it = (e.target as Element).closest(itemSelector);
    if (!it) return;
    e.preventDefault();
    items().forEach((x) => x.classList.remove("drop-before", "drop-after"));
    it.classList.add(where(e, it) ? "drop-after" : "drop-before");
  });
  container.addEventListener("drop", (e) => {
    if (from < 0) return;
    const it = (e.target as Element).closest<HTMLElement>(itemSelector);
    e.preventDefault();
    if (it) {
      let to = items().indexOf(it);
      if (where(e, it)) to++;
      if (to > from) to--;
      if (to !== from) onMove(from, to);
    }
    from = -1; clear();
  });
  container.addEventListener("dragend", () => { from = -1; clear(); });
}
export { moveItem };

/* ───── 세그먼트 버튼 ───── */
export interface SegOption<T> { value: T; label: string; disabled?: boolean; title?: string }
export type Seg<T> = HTMLDivElement & { setValue(v: T): void };
export function seg<T>(options: SegOption<T>[], value: T, onChange: (v: T) => void): Seg<T> {
  const el = h("div", { class: "seg", role: "group" }) as Seg<T>;
  // 단추는 한 번만 만들고 눌린 모양·꺼짐만 고쳐요. 예전에는 누를 때마다 단추를 새로 만들어서, 키보드로 고르면 초점이 페이지 맨 앞으로 빠졌어요
  const btns = options.map((o) => h("button", {
    type: "button",
    onclick: () => { if (o.value !== value && !o.disabled) { value = o.value; sync(); onChange(value); } },
  }, o.label) as HTMLButtonElement);
  const sync = () => btns.forEach((b, i) => {
    const o = options[i];
    b.setAttribute("aria-pressed", String(o.value === value));
    b.disabled = !!o.disabled;
    if (o.title) b.title = o.title; else b.removeAttribute("title");
  });
  el.replaceChildren(...btns);
  sync();
  el.setValue = (v) => { value = v; sync(); };
  return el;
}

/* ───── 파일 검사 ───── */
export const LIMITS = {
  pdfFile: 300 * 1024 * 1024,
  imageFile: 60 * 1024 * 1024,
  bgFile: 30 * 1024 * 1024,
  hwpFile: 100 * 1024 * 1024,
};
export function filterFiles(files: File[], kinds: string[], maxBytes: number, report: (msg: string) => void): File[] {
  const ok: File[] = [], bad: string[] = [];
  for (const f of files) {
    const k = kindOf(f);
    if (!kinds.includes(k)) bad.push(`${f.name}: 이 도구에서 쓸 수 없는 파일이에요.`);
    else if (f.size > maxBytes) bad.push(`${f.name}: ${formatSize(maxBytes)}보다 커서 넣지 않았어요.`);
    else if (f.size === 0) bad.push(`${f.name}: 빈 파일이에요.`);
    else ok.push(f);
  }
  if (bad.length) report(bad.join("\n"));
  return ok;
}

/* ───── PDF 워커 ───── */
interface Pending { resolve: (v: unknown) => void; reject: (e: Error) => void; onProgress?: (done: number, total: number) => void }
let pdfWorker: Worker | null, seq = 0;
const pending = new Map<number, Pending>();
function worker(): Worker {
  if (pdfWorker) return pdfWorker;
  pdfWorker = new Worker(new URL("./pdf-worker.js", import.meta.url), { type: "module" });
  pdfWorker.onmessage = (ev) => {
    const { id, type } = ev.data;
    const p = pending.get(id);
    if (!p) return;
    if (type === "progress") p.onProgress?.(ev.data.done, ev.data.total);
    else { pending.delete(id); type === "done" ? p.resolve(ev.data.result) : p.reject(new Error(ev.data.message)); }
  };
  pdfWorker.onerror = (e) => {
    for (const p of pending.values()) p.reject(new Error("PDF 처리 도구를 불러오지 못했어요. 새로고침 후 다시 해 주세요."));
    pending.clear();
    pdfWorker = null;
    e.preventDefault?.();
  };
  return pdfWorker;
}
/** 워커 작업 실행. 결과 모양은 작업(op)마다 달라 부르는 쪽에서 T 로 정함 */
export function runPdf<T = unknown>(op: string, args: unknown, transfer: Transferable[] = [], onProgress?: (done: number, total: number) => void): Promise<T> {
  return new Promise<T>((resolve, reject) => {
    const id = ++seq;
    pending.set(id, { resolve: resolve as (v: unknown) => void, reject, onProgress });
    worker().postMessage({ id, op, args }, transfer);
  });
}

/* ───── PDF.js (썸네일) ───── */
let pdfjsP: Promise<PdfjsModule> | null = null;
export function loadPdfjs(): Promise<PdfjsModule> {
  pdfjsP ||= vendorImport<PdfjsModule>("/vendor/pdfjs/pdf.min.mjs").then((m) => {
    m.GlobalWorkerOptions.workerSrc = "/vendor/pdfjs/pdf.worker.min.mjs";
    return m;
  }).catch((e) => { pdfjsP = null; throw new Error("PDF 미리보기 도구를 불러오지 못했어요. 인터넷 연결을 확인해 주세요."); });
  return pdfjsP;
}
export async function openPdfjs(buf: ArrayBuffer): Promise<PdfjsDocument> {
  const pdfjs = await loadPdfjs();
  try {
    return await pdfjs.getDocument({
      data: buf, cMapUrl: "/vendor/pdfjs/cmaps/", cMapPacked: true, standardFontDataUrl: "/vendor/pdfjs/standard_fonts/",
      isEvalSupported: false, enableXfa: false,
    }).promise;
  } catch (e) {
    if (e && (e as Error).name === "PasswordException") throw new Error("암호가 걸린 PDF예요. 암호를 푼 뒤 다시 넣어 주세요.");
    throw new Error("PDF를 읽지 못했어요. 파일이 깨졌거나 PDF가 아닐 수 있어요.");
  }
}

/** PDF 한 쪽을 dpi 로 흰 바탕 캔버스에 그려요 (화소 한도 안으로). wPt·hPt 는 원래 쪽 크기(회전 반영) */
export async function renderPdfPage(doc: PdfjsDocument, n: number, dpi: number): Promise<{ canvas: HTMLCanvasElement; wPt: number; hPt: number }> {
  const page = await doc.getPage(n + 1);
  const vp1 = page.getViewport({ scale: 1 });
  let scale = dpi / 72;
  if (vp1.width * vp1.height * scale * scale > MAX_PIXELS) scale = Math.sqrt(MAX_PIXELS / (vp1.width * vp1.height));
  const vp = page.getViewport({ scale });
  const c = document.createElement("canvas");
  c.width = Math.max(1, Math.ceil(vp.width)); c.height = Math.max(1, Math.ceil(vp.height));
  const g = c.getContext("2d") as CanvasRenderingContext2D;
  g.fillStyle = "#fff"; g.fillRect(0, 0, c.width, c.height);
  await page.render({ canvasContext: g, viewport: vp }).promise;
  page.cleanup();
  return { canvas: c, wPt: vp1.width, hPt: vp1.height };
}

/** 보이는 썸네일부터 차례로 그려요 */
export interface ThumbRenderer { observe(box: HTMLElement): void; destroy(): void }
export function thumbRenderer(doc: PdfjsDocument, width = 220): ThumbRenderer {
  const queue: HTMLElement[] = [];
  let busy = false;
  const io = new IntersectionObserver((ents) => {
    for (const en of ents) if (en.isIntersecting) { io.unobserve(en.target); queue.push(en.target as HTMLElement); }
    pump();
  }, { rootMargin: "300px" });
  async function pump() {
    if (busy) return;
    busy = true;
    while (queue.length) {
      const box = queue.shift() as HTMLElement;
      const n = Number(box.dataset.page);
      try {
        const page = await doc.getPage(n + 1);
        const vp0 = page.getViewport({ scale: 1 });
        const scale = Math.min(width / vp0.width, (width * 1.4) / vp0.height) * Math.min(2, window.devicePixelRatio || 1);
        const vp = page.getViewport({ scale });
        const c = document.createElement("canvas");
        c.width = Math.ceil(vp.width); c.height = Math.ceil(vp.height);
        await page.render({ canvasContext: c.getContext("2d") as CanvasRenderingContext2D, viewport: vp }).promise;
        page.cleanup();
        box.replaceChildren(c);
        box.dispatchEvent(new CustomEvent("rendered"));
      } catch { box.replaceChildren(h("div", { class: "ph" })); }
    }
    busy = false;
  }
  return {
    observe(box) { io.observe(box); },
    destroy() { io.disconnect(); queue.length = 0; doc.destroy?.(); },
  };
}

/* ───── 이미지 읽기 ───── */
export const IS_IOS = /iP(hone|ad|od)/.test(navigator.userAgent) || (navigator.platform === "MacIntel" && navigator.maxTouchPoints > 1);
export const MAX_PIXELS = IS_IOS ? 16_000_000 : 50_000_000;

let heicP: Promise<HeicToModule> | null = null;
// HEIC: 브라우저가 직접 못 열면 heic-to(libheif WASM, CSP 빌드)로 브라우저 안에서 풀어요
const loadHeic = () => (heicP ||= vendorImport<HeicToModule>("/vendor/heic-to-1.5.2-csp.mjs").catch(() => { heicP = null; throw new Error("HEIC 변환 도구를 불러오지 못했어요."); }));
const withTimeout = <T>(p: Promise<T>, ms: number): Promise<T> => Promise.race([p, new Promise<never>((_, rej) => setTimeout(() => rej(new Error("timeout")), ms))]);

/** File → { source(ImageBitmap|HTMLImageElement), width, height, close() } (EXIF 방향 반영) */
/** 열린 이미지: 그릴 소스 · 크기 · 닫기 */
export interface DecodedImage { source: CanvasImageSource; width: number; height: number; close(): void }
export async function decodeImage(file: File): Promise<DecodedImage> {
  const k = kindOf(file);
  let blob: Blob = file;
  try {
    return await bitmapFrom(blob);
  } catch (e) {
    if (k !== "heic") throw new Error(`${file.name}: 이미지를 열지 못했어요. 지원하지 않는 형식이거나 파일이 깨졌을 수 있어요.`);
  }
  // HEIC: 브라우저가 직접 못 열면 heic2any 로 변환 (브라우저 안에서)
  try {
    const { heicTo } = await loadHeic();
    blob = await withTimeout(heicTo({ blob: file, type: "image/png" }), 60_000);
    return await bitmapFrom(blob);
  } catch (e) {
    throw new Error(`${file.name}: HEIC 사진을 열지 못했어요. 아이폰 설정 > 카메라 > 포맷에서 '높은 호환성'으로 찍거나 JPG로 바꿔 넣어 주세요.`);
  }
}
async function bitmapFrom(blob: Blob): Promise<DecodedImage> {
  if ("createImageBitmap" in window) {
    try {
      const bmp = await createImageBitmap(blob, { imageOrientation: "from-image" });
      return { source: bmp, width: bmp.width, height: bmp.height, close: () => bmp.close() };
    } catch { /* 아래 img 방식으로 */ }
  }
  const url = URL.createObjectURL(blob);
  try {
    const img = new Image();
    img.decoding = "async";
    img.src = url;
    await img.decode();
    return { source: img, width: img.naturalWidth, height: img.naturalHeight, close: () => {} };
  } finally {
    setTimeout(() => URL.revokeObjectURL(url), 1000);
  }
}

/** 이미지 → canvas (크기 조절 · 배경색 채우기) */
export function drawToCanvas(img: DecodedImage, w: number, h2: number, fill?: string | null): HTMLCanvasElement {
  let s = 1;
  if (w * h2 > MAX_PIXELS) s = Math.sqrt(MAX_PIXELS / (w * h2));
  const cw = Math.max(1, Math.floor(w * s)), ch = Math.max(1, Math.floor(h2 * s));
  const c = document.createElement("canvas");
  c.width = cw; c.height = ch;
  const ctx = c.getContext("2d") as CanvasRenderingContext2D;
  if (fill) { ctx.fillStyle = fill; ctx.fillRect(0, 0, cw, ch); }
  ctx.imageSmoothingEnabled = true;
  ctx.imageSmoothingQuality = "high";
  ctx.drawImage(img.source, 0, 0, cw, ch);
  return c;
}

export function canvasToBlob(canvas: HTMLCanvasElement, type: string, quality?: number): Promise<Blob> {
  return new Promise((res, rej) => canvas.toBlob((b) => (b ? res(b) : rej(new Error("이미지를 저장하지 못했어요. 사진이 너무 클 수 있어요."))), type, quality));
}

/** 브라우저가 이 형식으로 저장(인코딩)할 수 있는지 */
const encCache: Record<string, boolean> = {};
export async function canEncode(type: string): Promise<boolean> {
  if (type in encCache) return encCache[type];
  const c = document.createElement("canvas");
  c.width = c.height = 2;
  const b = await new Promise<Blob | null>((r) => c.toBlob(r, type, 0.8));
  return (encCache[type] = !!b && b.type === type);
}

/** 작은 미리보기 URL (목록용) */
export async function thumbURL(img: DecodedImage, size = 120): Promise<string> {
  const s = Math.min(1, size / Math.max(img.width, img.height));
  const c = drawToCanvas(img, img.width * s, img.height * s);
  const b = await canvasToBlob(c, "image/jpeg", 0.7);
  return URL.createObjectURL(b);
}

/* ───── ZIP ───── */
/** fflate(zip) — 처음 쓸 때 한 번 받아요 */
export const loadFflate = (): Promise<FflateModule> => vendorImport<FflateModule>("/vendor/fflate-0.8.2.mjs");
/** 파일 여러 개를 ZIP 하나로(압축 없음). 한 파일씩 이어 붙여서 결과보다 몇 배 큰 메모리를 한꺼번에 쓰지 않아요. 같은 이름은 '이름-2.확장자'로 */
export async function makeZip(files: { name: string; blob: Blob }[]): Promise<Blob> {
  const w = zipWriter(await loadFflate());
  const used = new Set<string>();
  try {
    for (const f of files) w.add(uniqueName(f.name, used), new Uint8Array(await f.blob.arrayBuffer()));
    return w.finish();
  } catch {
    w.abort();
    throw new Error("ZIP을 만들지 못했어요.");
  }
}

/** 붙여넣기(클립보드) 이미지 */
export function filesFromPaste(e: ClipboardEvent): File[] {
  const out: File[] = [];
  for (const it of e.clipboardData?.items || []) {
    if (it.kind === "file") {
      const f = it.getAsFile();
      if (f) {
        const ext = (f.type.split("/")[1] || "png").replace("jpeg", "jpg");
        out.push(f.name && f.name !== "image." + ext && f.name !== "image.png" ? f : new File([f], `붙여넣은-이미지-${Date.now()}.${ext}`, { type: f.type }));
      }
    }
  }
  return out;
}
