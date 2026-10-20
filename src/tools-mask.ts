// 9. 서류 사본 가리기 · "OO 제출용" 워터마크 — 신분증·통장·등본 사본을 보내기 전에, 이 기기 안에서
//  - 가릴 곳을 끌어서 검은 네모로 칠해요. 저장할 때 그림 자체에 칠하니 밑의 글자는 결과에 남지 않아요.
//  - PDF 는 쪽마다 그림으로 그려서 칠하므로 결과도 이미지 PDF 예요(글자 선택 안 됨 = 가린 글자도 못 꺼냄).
import { h, icon, dropzone, progress, alertBox, errMsg, resultItem, seg, filterFiles, LIMITS, runPdf, decodeImage, drawToCanvas, canvasToBlob, openPdfjs, renderPdfPage, focusIfLost, setDisabledKeepingFocus } from "./ui.js";
import { holdTaps } from "./tap.js";
import { formatSize, kindOf, outName, normRect, rectAt, watermarkLines, watermarkMetrics, kstDateLabel, mmToPt, type Rect, type WatermarkSize } from "./lib.js";
import type { Mounted } from "./app.js";

/** history: 바꾸기 전 가린 곳들(되돌리기용) — 칠하기·톡 눌러 지우기·모두 지우기마다 하나씩 */
interface Page { canvas: HTMLCanvasElement; wPt: number; hPt: number; masks: Rect[]; history: Rect[][] }
const COLORS = { gray: "#374151", red: "#dc2626", blue: "#1d4ed8" } as const;
type WmColor = keyof typeof COLORS;
const MAX_PAGES = 10;
const RENDER_DPI = 150;
const FONT = '"Pretendard Variable", Pretendard, -apple-system, "Apple SD Gothic Neo", "Noto Sans KR", "Malgun Gothic", sans-serif';

function checkbox(label: string, checked: boolean, onChange: (v: boolean) => void): HTMLLabelElement {
  const input = h("input", { type: "checkbox", checked: checked || null });
  input.addEventListener("change", () => onChange(input.checked));
  return h("label", { class: "check-row" }, input, h("span", {}, label));
}

export function mountMask(root: HTMLElement): Mounted {
  let pages: Page[] = [];
  let cur = 0;
  let src: { name: string; size: number; isPdf: boolean } | null = null;
  const wm = { on: true, to: "", date: true, forbid: true, opacity: 0.3, size: "m" as WatermarkSize, color: "gray" as WmColor };
  let drag: { x0: number; y0: number; x1: number; y1: number; id: number } | null = null;

  const err = alertBox();
  const prog = progress();
  const out = h("div");
  const dz = dropzone({
    accept: "image/*,.heic,.heif,application/pdf,.pdf", multiple: false,
    title: "가릴 사진이나 PDF를 끌어다 놓으세요", sub: `신분증·통장·등본 사본 · JPG · PNG · HEIC · PDF(${MAX_PAGES}쪽까지)`, onFiles: (f) => load(f[0]),
  });
  const canvas = h("canvas", { class: "mask-canvas", role: "img", "aria-label": "가릴 곳을 끌어서 네모로 칠하는 곳", tabindex: "-1" });
  const stage = h("div", { class: "mask-stage" }, canvas);
  const pageInfo = h("span", { class: "muted" });
  const prevBtn = h("button", { type: "button", class: "btn sm", onclick: () => go(cur - 1) }, icon("back"), "앞 쪽");
  const nextBtn = h("button", { type: "button", class: "btn sm", onclick: () => go(cur + 1) }, "뒤 쪽", icon("next"));
  const pager = h("div", { class: "row mask-pager" }, prevBtn, pageInfo, nextBtn);
  const count = h("span", { class: "muted" });
  // 되돌리기는 마지막에 한 일을 되돌려요. 예전에는 늘 마지막 네모만 지워서, 톡 눌러 지운 곳·'모두 지우기'는 되살릴 수 없고
  // 오히려 남아 있던 다른 네모가 지워졌어요. 단추 자리가 바뀌지 않으니 두 번 톡톡 거르기(holdTaps)는 걸지 않아요 — 걸면 0.4초 간격으로
  // 세 번 되돌려도 두 번만 되돌려지고, 되돌린 바로 뒤 0.9초는 칠하기도 시작되지 않았어요(버그 5차)
  const undoBtn = h("button", { type: "button", class: "btn sm", onclick: () => { const p = page(), prev = p?.history.pop(); if (!p || !prev) return; p.masks = prev; changed(); } }, "되돌리기");
  const clearBtn = h("button", { type: "button", class: "btn sm ghost", onclick: () => { const p = page(); if (!p?.masks.length) return; p.history.push(p.masks); p.masks = []; changed(); } }, "이 쪽 가린 곳 모두 지우기");
  const fileLine = h("div", { class: "muted", tabindex: "-1" }); // 파일을 넣어 파일 넣는 곳이 숨으면 초점을 여기로

  const toIn = h("input", { class: "input", type: "text", maxlength: "30", placeholder: "예) OO은행, OO부동산", "aria-label": "제출처", autocomplete: "off" });
  toIn.addEventListener("input", () => { wm.to = toIn.value; changed(); });
  const op = h("input", { type: "range", min: "10", max: "60", step: "1", value: String(wm.opacity * 100), "aria-label": "워터마크 진하기" });
  const opVal = h("b", {}, `${Math.round(wm.opacity * 100)}%`);
  op.addEventListener("input", () => { wm.opacity = Number(op.value) / 100; opVal.textContent = `${op.value}%`; changed(); });
  const wmOpts = h("div", { class: "opts" },
    h("div", { class: "opt" }, h("label", {}, "어디에 내나요? (제출처)"), toIn, h("div", { class: "hint" }, "적은 이름 뒤에 ‘제출용’이 붙어요.")),
    h("div", { class: "opt" }, h("span", { class: "lbl" }, "같이 넣을 것"),
      checkbox(`날짜 (${kstDateLabel()})`, wm.date, (v) => { wm.date = v; changed(); }),
      checkbox("‘다른 용도 사용 금지’", wm.forbid, (v) => { wm.forbid = v; changed(); })),
    h("div", { class: "opt" }, h("span", { class: "lbl" }, "글자 크기"), seg<WatermarkSize>([{ value: "s", label: "작게" }, { value: "m", label: "보통" }, { value: "l", label: "크게" }], wm.size, (v) => { wm.size = v; changed(); })),
    h("div", { class: "opt" }, h("span", { class: "lbl" }, "색"), seg<WmColor>([{ value: "gray", label: "회색" }, { value: "red", label: "빨강" }, { value: "blue", label: "파랑" }], wm.color, (v) => { wm.color = v; changed(); })),
    h("div", { class: "opt" }, h("span", { class: "lbl" }, "진하기 ", opVal), op));
  const go2 = h("button", { type: "button", class: "btn primary big", onclick: run }, "사본 만들기");
  const work = h("div", { hidden: true },
    h("div", { class: "panel" },
      h("div", { class: "panel-head" }, fileLine, h("button", { type: "button", class: "btn ghost sm", onclick: () => { reset(); holdTaps(); focusIfLost(dz); } }, "다른 파일")),
      h("h2", { class: "sub-h" }, "1. 가릴 곳 칠하기"),
      h("p", { class: "hint", style: "margin:0 0 10px" }, "주민등록번호 뒷자리, 주소, 계좌번호처럼 보내면 안 되는 곳을 손가락이나 마우스로 끌어서 검게 칠해요. 칠한 곳을 톡 누르면 지워져요."),
      pager, stage,
      h("div", { class: "row", style: "margin-top:10px" }, count, undoBtn, clearBtn)),
    h("div", { class: "panel" },
      h("div", { class: "panel-head" }, h("h2", { class: "sub-h", style: "margin:0" }, "2. 워터마크"), checkbox("워터마크 넣기", wm.on, (v) => { wm.on = v; wmOpts.classList.toggle("off", !v); changed(); })),
      wmOpts),
    h("div", { class: "alert info" }, "가린 곳은 그림 위에 완전히 덮어 칠해서 저장해요. 밑에 있던 글자는 결과 파일에 남지 않고, 사진 속 위치·기기 정보도 빠져요."),
    h("div", { class: "actions" }, go2));
  root.append(dz, err.el, work, prog.el, out);

  const page = () => pages[cur];

  /* ───── 그리기 ───── */
  const wmLines = () => watermarkLines({ to: wm.to, date: wm.date ? kstDateLabel() : null, forbid: wm.forbid });
  function drawWatermark(g: CanvasRenderingContext2D, W: number, H: number): void {
    const lines = wmLines();
    const { fontPx, lineGap, angle } = watermarkMetrics(W, H, wm.size);
    g.save();
    g.globalAlpha = wm.opacity;
    g.fillStyle = COLORS[wm.color];
    g.font = `800 ${fontPx}px ${FONT}`;
    g.textAlign = "center";
    g.textBaseline = "middle";
    const tw = Math.max(...lines.map((l) => g.measureText(l).width));
    const stepX = tw + fontPx * 3, stepY = lineGap * lines.length + fontPx * 2.4;
    g.translate(W / 2, H / 2);
    g.rotate((angle * Math.PI) / 180);
    // 돌려도 빈 귀퉁이가 없게 대각선 길이만큼 넉넉히 깔아요 (잘라 내도 남게)
    const R = Math.hypot(W, H) / 2 + Math.max(stepX, stepY);
    for (let row = 0, y = -R; y <= R; y += stepY, row++) {
      const off = row % 2 ? stepX / 2 : 0;
      for (let x = -R + off; x <= R; x += stepX) lines.forEach((l, i) => g.fillText(l, x, y + (i - (lines.length - 1) / 2) * lineGap));
    }
    g.restore();
  }
  /** 쪽 하나를 원래 픽셀 좌표로 그림: 바탕 → 검은 네모 → 워터마크 */
  function paintPage(g: CanvasRenderingContext2D, p: Page): void {
    g.drawImage(p.canvas, 0, 0);
    g.fillStyle = "#000";
    for (const m of p.masks) g.fillRect(m.x, m.y, m.w, m.h);
    if (wm.on) drawWatermark(g, p.canvas.width, p.canvas.height);
  }
  let scale = 1;
  function render(): void {
    const p = page();
    if (!p) return;
    const W = p.canvas.width, H = p.canvas.height;
    const availW = stage.clientWidth || 320;
    const maxH = Math.max(240, Math.min(window.innerHeight * 0.7, 760));
    scale = Math.min(availW / W, maxH / H, 1);
    const cw = Math.max(1, Math.round(W * scale)), ch = Math.max(1, Math.round(H * scale));
    const dpr = Math.min(2, window.devicePixelRatio || 1);
    if (canvas.width !== Math.round(cw * dpr) || canvas.height !== Math.round(ch * dpr)) {
      canvas.width = Math.round(cw * dpr); canvas.height = Math.round(ch * dpr);
    }
    canvas.style.width = `${cw}px`; canvas.style.height = `${ch}px`;
    const g = canvas.getContext("2d") as CanvasRenderingContext2D;
    g.setTransform(scale * dpr, 0, 0, scale * dpr, 0, 0);
    g.imageSmoothingQuality = "high";
    paintPage(g, p);
    if (drag) {
      const r = normRect(drag.x0, drag.y0, drag.x1, drag.y1, W, H, 1);
      if (r) {
        g.fillStyle = "rgba(0,0,0,.55)"; g.fillRect(r.x, r.y, r.w, r.h);
        g.strokeStyle = "#2563eb"; g.lineWidth = 2 / scale; g.strokeRect(r.x, r.y, r.w, r.h);
      }
    }
  }
  let raf = 0;
  const schedule = () => { if (!raf) raf = requestAnimationFrame(() => { raf = 0; render(); }); };
  function changed(): void {
    out.replaceChildren();
    const n = page()?.masks.length || 0, all = pages.reduce((a, p) => a + p.masks.length, 0);
    count.textContent = pages.length > 1 ? `이 쪽 ${n}곳 · 모두 ${all}곳 가림` : `${n}곳 가림`;
    // 단추가 꺼질 때 거기 있던 초점은 옆 단추(없으면 칠하는 곳)로 — 마지막 '되돌리기'·끝 쪽의 '뒤 쪽'에서 문서 맨 앞으로 빠졌어요.
    // 켜질 단추를 먼저 켜야 초점을 넘겨받을 수 있어요
    const undoOff = !page()?.history.length, clearOff = !n, prevOff = cur === 0, nextOff = cur >= pages.length - 1;
    for (const [b, off] of [[undoBtn, undoOff], [clearBtn, clearOff], [prevBtn, prevOff], [nextBtn, nextOff]] as const) if (!off) b.disabled = false;
    setDisabledKeepingFocus(undoBtn, undoOff, () => (clearOff ? canvas : clearBtn));
    setDisabledKeepingFocus(clearBtn, clearOff, () => (undoOff ? canvas : undoBtn));
    pager.hidden = pages.length < 2;
    pageInfo.textContent = `${cur + 1} / ${pages.length}쪽`;
    setDisabledKeepingFocus(prevBtn, prevOff, () => (nextOff ? canvas : nextBtn));
    setDisabledKeepingFocus(nextBtn, nextOff, () => (prevOff ? canvas : prevBtn));
    schedule();
    ensureFont();
  }
  function go(i: number): void { cur = Math.max(0, Math.min(pages.length - 1, i)); changed(); }

  // 캔버스 글자는 웹 글꼴 중 그 글자가 든 조각이 받아져 있어야 Pretendard 로 그려져요
  let fontKey = "";
  function ensureFont(): Promise<void> {
    const text = wmLines().join("");
    if (!document.fonts || text === fontKey) return Promise.resolve();
    fontKey = text;
    return document.fonts.load(`800 40px "Pretendard Variable"`, text).then(() => schedule(), () => {});
  }

  /* ───── 끌어서 칠하기 ───── */
  const toImg = (e: PointerEvent) => {
    const r = canvas.getBoundingClientRect();
    const p = page();
    return { x: ((e.clientX - r.left) / r.width) * p.canvas.width, y: ((e.clientY - r.top) / r.height) * p.canvas.height };
  };
  canvas.addEventListener("pointerdown", (e) => {
    if (!page() || (e.pointerType === "mouse" && e.button !== 0)) return;
    e.preventDefault();
    const { x, y } = toImg(e);
    drag = { x0: x, y0: y, x1: x, y1: y, id: e.pointerId };
    try { canvas.setPointerCapture(e.pointerId); } catch { /* 무시 */ }
  });
  canvas.addEventListener("pointermove", (e) => {
    if (!drag || e.pointerId !== drag.id) return;
    const { x, y } = toImg(e);
    drag.x1 = x; drag.y1 = y;
    schedule();
  });
  const finish = (e: PointerEvent) => {
    if (!drag || e.pointerId !== drag.id) return;
    const p = page(), d = drag;
    drag = null;
    // 화면에서 6px 보다 작게 끌면 '누르기'로 봐요 → 그 자리의 칠한 곳 지우기
    const minPx = 6 / scale;
    const r = normRect(d.x0, d.y0, d.x1, d.y1, p.canvas.width, p.canvas.height, minPx);
    if (r) { p.history.push([...p.masks]); p.masks.push(r); }
    else { const i = rectAt(p.masks, d.x0, d.y0); if (i >= 0) { p.history.push([...p.masks]); p.masks.splice(i, 1); } }
    changed();
  };
  canvas.addEventListener("pointerup", finish);
  canvas.addEventListener("pointercancel", (e) => { if (drag && e.pointerId === drag.id) { drag = null; schedule(); } });
  const ro = new ResizeObserver(() => schedule());
  ro.observe(stage);

  /* ───── 파일 열기 ───── */
  /**
   * 여는 중에 다른 파일을 고르면(아직 보이는 파일 넣는 곳을 다시 누르거나 붙여넣기) 두 파일의 쪽이 한 문서로 섞였어요
   * (‘report.pdf · 6쪽’인데 첫 쪽이 PDF 6쪽, 사진은 어딘가에) → 열 때마다 번호를 올리고, 늦게 끝난 옛 열기는 버려요
   */
  let loadGen = 0;
  function reset(): void {
    loadGen++;
    for (const p of pages) p.canvas.width = p.canvas.height = 0;
    pages = []; cur = 0; src = null; out.replaceChildren(); err.hide();
    work.hidden = true; dz.hidden = false;
  }
  async function load(file: File): Promise<void> {
    err.hide(); out.replaceChildren();
    const isPdf = kindOf(file) === "pdf";
    if (!filterFiles([file], ["pdf", "image", "heic"], isPdf ? LIMITS.pdfFile : LIMITS.imageFile, (m) => err.show(m)).length) return;
    reset();
    const g = loadGen, stale = () => g !== loadGen;
    const opened: Page[] = []; // 다 열린 뒤에만 pages 로 — 옛 열기가 새 문서에 쪽을 보태지 않게
    try {
      if (isPdf) {
        prog.set(null, "PDF 여는 중…");
        const doc = await openPdfjs(await file.arrayBuffer());
        try {
          if (stale()) return;
          if (doc.numPages > MAX_PAGES) throw new Error(`PDF는 ${MAX_PAGES}쪽까지만 넣을 수 있어요. 'PDF 나누기'로 필요한 쪽만 골라 주세요.`);
          for (let i = 0; i < doc.numPages; i++) {
            prog.set(i / doc.numPages, `${i + 1}/${doc.numPages}쪽 그리는 중…`);
            const r = await renderPdfPage(doc, i, RENDER_DPI);
            if (stale()) { r.canvas.width = r.canvas.height = 0; return; }
            opened.push({ ...r, masks: [], history: [] });
          }
        } finally { doc.destroy?.(); }
      } else {
        prog.set(null, "사진 여는 중…");
        const img = await decodeImage(file);
        if (stale()) { img.close(); return; }
        const c = drawToCanvas(img, img.width, img.height, "#fff");
        img.close();
        opened.push({ canvas: c, wPt: 0, hPt: 0, masks: [], history: [] });
      }
      pages = opened;
      src = { name: file.name, size: file.size, isPdf };
      fileLine.replaceChildren(h("b", { style: "color:var(--ink)" }, file.name), ` · ${isPdf ? `${pages.length}쪽 · ` : `${pages[0].canvas.width}×${pages[0].canvas.height} · `}${formatSize(file.size)}`);
      dz.hidden = true; work.hidden = false;
      focusIfLost(fileLine);
      cur = 0;
      changed();
    } catch (e) { if (stale()) return; err.show(errMsg(e)); reset(); }
    finally {
      if (stale()) for (const p of opened) p.canvas.width = p.canvas.height = 0;
      else prog.hide(); // 옛 열기가 새로 여는 중인 진행 표시를 걷지 않게
    }
  }

  /* ───── 저장 ───── */
  async function exportJpeg(p: Page): Promise<Blob> {
    const c = document.createElement("canvas");
    c.width = p.canvas.width; c.height = p.canvas.height;
    paintPage(c.getContext("2d") as CanvasRenderingContext2D, p);
    const b = await canvasToBlob(c, "image/jpeg", 0.92);
    c.width = c.height = 0;
    return b;
  }
  async function run(): Promise<void> {
    if (!src) return;
    err.hide(); out.replaceChildren(); go2.disabled = true;
    const s = src;
    try {
      fontKey = ""; await ensureFont();
      const jpgs: Blob[] = [];
      for (let i = 0; i < pages.length; i++) {
        prog.set(i / pages.length * 0.7, `${i + 1}/${pages.length}쪽 저장하는 중…`);
        jpgs.push(await exportJpeg(pages[i]));
      }
      const bytes = await Promise.all(jpgs.map(async (b) => new Uint8Array(await b.arrayBuffer())));
      prog.set(0.75, "PDF 만드는 중…");
      const pdf = s.isPdf
        ? await runPdf<{ bytes: Uint8Array<ArrayBuffer> }>("pages", { pages: pages.map((p, i) => ({ bytes: bytes[i], wPt: p.wPt, hPt: p.hPt })) }, bytes.map((b) => b.buffer))
        : await runPdf<{ bytes: Uint8Array<ArrayBuffer> }>("images", { images: [{ bytes: bytes[0], mime: "image/jpeg", w: pages[0].canvas.width, h: pages[0].canvas.height }], pageSize: "a4", marginPt: mmToPt(10) }, [bytes[0].buffer]);
      prog.set(1, "완료!");
      const masks = pages.reduce((a, p) => a + p.masks.length, 0);
      const what = [masks ? `${masks}곳 가림` : "가린 곳 없음", wm.on ? `워터마크 “${wmLines()[0]}”` : "워터마크 없음"].join(" · ");
      const box = h("div", { class: "result", id: "result" }, h("h2", {}, icon("ok"), "사본을 만들었어요"),
        h("p", { class: "hint", style: "margin:-4px 0 6px" }, what));
      if (!s.isPdf) box.append(resultItem({ name: outName(s.name, "사본", "jpg"), blob: jpgs[0], extra: "사진(JPG)" }));
      box.append(resultItem({ name: outName(s.name, "사본", "pdf"), blob: new Blob([pdf.bytes], { type: "application/pdf" }), extra: s.isPdf ? `${pages.length}쪽 · 이미지 PDF` : "A4 PDF" }));
      out.replaceChildren(box);
    } catch (e) { err.show(errMsg(e)); }
    finally { prog.hide(); go2.disabled = false; }
  }

  return {
    onPaste: (fs) => { if (fs[0]) load(fs[0]); },
    unmount: () => { ro.disconnect(); reset(); },
  };
}
