// 이미지 도구: 이미지→PDF / 압축·변환·크기 / 사진 정보(EXIF) 지우기
import { type SegOption, h, stickyActions, ICONS, icon, arrowed, iconBtn, rowAction, describeRows, dropzone, progress, alertBox, errMsg, resultItem, sortable, seg, filterFiles, LIMITS, runPdf, decodeImage, drawToCanvas, canvasToBlob, canEncode, thumbURL, makeZip, download, toast, once, focusIfLost } from "./ui.js";
import { holdTaps } from "./tap.js";
import { PREF, readPref, writePref, pickPref, intPref, sizePref } from "./prefs.js";
import { formatSize, outName, moveItem, sortByName, isSortedByName, savedPercent, fitWithin, extFor, kindOf, mmToPt, uniqueNames, formatCoord } from "./lib.js";
import { vendorImport, type ExifrModule, type Exifr, type ExifData } from "./vendor.js";
import type { Mounted } from "./app.js";
import type { PageSize } from "./lib.js";

interface Meta { count: number; chips: { cls?: string; text: string }[]; gps?: boolean }
/** 목록의 사진 한 장 */
interface ImgItem { id: number; file: File; thumb: string | null; w: number; h: number; error: string | null; status: string; meta?: Meta; extra?: Node }

const IMG_ACCEPT = "image/*,.heic,.heif";
const IMG_KINDS = ["image", "heic"];

/** 공통: 이미지 목록 (썸네일 + 순서 바꾸기 선택) */
function imageList({ orderable }: { orderable: boolean }) {
  let items: ImgItem[] = []; let uid = 0;
  const el = h("ol", { class: "flist" });
  const api = {
    el,
    get items() { return items; },
    set items(v) { items = v; api.render(); },
    onChange: (): void => {},
    /** 사진을 더하거나 빼거나 옮기면(지난 결과가 지금 목록과 달라져요) */
    onEdit: (): void => {},
    add(files: File[], onErr?: (msg: string) => void) {
      const created = files.map((file): ImgItem => ({ id: ++uid, file, thumb: null, w: 0, h: 0, error: null, status: "" }));
      if (created.length) api.onEdit();
      items.push(...created); api.render();
      const done = (async () => {
        for (const it of created) {
          try {
            const img = await decodeImage(it.file);
            it.w = img.width; it.h = img.height;
            it.thumb = await thumbURL(img, 120);
            img.close();
          } catch (e) { it.error = errMsg(e).replace(/^.*?: /, ""); onErr?.(errMsg(e)); }
          api.render();
        }
      })();
      return { created, done };
    },
    remove(i: number) { const [x] = items.splice(i, 1); if (x?.thumb) URL.revokeObjectURL(x.thumb); api.onEdit(); api.render(); },
    clear() { items.forEach((x) => x.thumb && URL.revokeObjectURL(x.thumb)); items = []; api.onEdit(); api.render(); },
    move(from: number, to: number) { items = moveItem(items, from, to); api.onEdit(); api.render(); },
    /** 파일 이름 순서로(QA 5바퀴). 이미 그 순서면 false */
    sortByName(): boolean {
      if (isSortedByName(items, (x) => x.file.name)) return false;
      items = sortByName(items, (x) => x.file.name); api.onEdit(); api.render();
      return true;
    },
    render(): void {
      el.replaceChildren(...items.map((it, i) => h("li", { class: "fitem", draggable: orderable ? "true" : null, dataset: { k: "i" + it.id } },
        orderable ? h("span", { class: "handle", html: ICONS.grip, title: "끌어서 순서 바꾸기" }) : null,
        orderable ? h("span", { class: "fnum" }, i + 1) : null,
        it.thumb ? h("img", { class: "fthumb", src: it.thumb, alt: "" }) : h("span", { class: "fthumb" }),
        h("div", { class: "fmeta" },
          h("div", { class: "fname", title: it.file.name }, it.file.name),
          h("div", { class: "fsub" }, it.error ? h("span", { class: "bad" }, it.error) : it.w ? `${it.w}×${it.h} · ${formatSize(it.file.size)}` : "여는 중…", it.status ? h("span", {}, " · ", it.status) : null),
          it.extra || null),
        h("div", { class: "fbtns" },
          orderable ? iconBtn("up", "위로", rowAction(el, ".fitem", () => { api.move(i, i - 1); return i - 1; })) : null,
          orderable ? iconBtn("down", "아래로", rowAction(el, ".fitem", () => { api.move(i, i + 1); return i + 1; })) : null,
          iconBtn("x", "빼기", rowAction(el, ".fitem", () => { api.remove(i); return items.length ? i : null; }), "danger")))));
      if (orderable) {
        el.firstElementChild?.querySelector('[aria-label="위로"]')?.setAttribute("disabled", "");
        el.lastElementChild?.querySelector('[aria-label="아래로"]')?.setAttribute("disabled", "");
      }
      describeRows(el, ".fitem", ".fname");
      api.onChange();
    },
  };
  if (orderable) sortable(el, ".fitem", (a, b) => api.move(a, b));
  return api;
}

const isDecoded = (it: ImgItem) => it.w > 0 && !it.error;

/* ═════════ 4. 이미지 → PDF ═════════ */
export function mountImgToPdf(root: HTMLElement): Mounted {
  // 쪽 크기·여백은 지난번에 고른 값으로 시작해요(prefs.ts, QA 5바퀴 — 매번 '사진 원본 크기'·'좁게'를 다시 골라야 했어요)
  let pageSize: PageSize = pickPref(readPref(PREF.img2pdfSize), ["a4", "original"] as const, "a4"), margin: string = pickPref(readPref(PREF.img2pdfMargin), ["0", "10", "20"] as const, "0");
  const err = alertBox();
  const prog = progress();
  const out = h("div");
  const list = imageList({ orderable: true });
  const dz = dropzone({ accept: IMG_ACCEPT, title: "사진을 여기에 끌어다 놓으세요", sub: "JPG · PNG · WebP · HEIC · 눌러서 고르기 · 붙여넣기(Ctrl+V)도 돼요", onFiles: add });
  const go = h("button", { type: "button", class: "btn primary big", onclick: run }, "PDF 만들기");
  const count = h("span", { class: "muted" });
  // 휴대폰 파일 고르기는 누른 차례대로 넘겨 줘서 'IMG_0001~0050'이 섞여 들어와요 — 한 번에 이름 순서로
  const sortBtn = h("button", { type: "button", class: "btn ghost sm", title: "파일 이름 순서로 놓아요", onclick: () => {
    if (!list.sortByName()) { toast("이미 이름 순서예요"); return; }
    holdTaps(undefined, list.el);
  } }, "이름순");
  const panel = h("div", { class: "panel", hidden: true },
    h("div", { class: "panel-head" }, h("h2", {}, "쪽 순서"), h("div", { class: "row" }, count, sortBtn, h("button", { type: "button", class: "btn ghost sm", onclick: () => { list.clear(); holdTaps(); focusIfLost(dz); } }, "모두 지우기"))),
    list.el,
    h("div", { class: "opts", style: "margin-top:16px" },
      h("div", { class: "opt" }, h("span", { class: "lbl" }, "쪽 크기"), seg<PageSize>([{ value: "a4", label: "A4 (가로세로 자동)" }, { value: "original", label: "사진 원본 크기" }], pageSize, (v) => { pageSize = v; out.replaceChildren(); writePref(PREF.img2pdfSize, v); })),
      h("div", { class: "opt" }, h("span", { class: "lbl" }, "여백"), seg([{ value: "0", label: "없음" }, { value: "10", label: "좁게" }, { value: "20", label: "넓게" }], margin, (v) => { margin = v; out.replaceChildren(); writePref(PREF.img2pdfMargin, v); }))));
  root.append(dz, err.el, panel, stickyActions(go), prog.el, out);
  // 사진을 더하거나 빼거나 순서·쪽 크기·여백을 바꾸면 지난 결과는 지금 모습과 달라요 — 예전엔 옛 PDF 내려받기가 그대로 남았어요(합치기와 같게)
  list.onEdit = () => out.replaceChildren();

  list.onChange = () => {
    const n = list.items.length, ok = list.items.filter(isDecoded).length;
    panel.hidden = !n;
    dz.setCompact(n > 0, "사진 더 넣기");
    count.textContent = `${n}장`;
    sortBtn.hidden = n < 2;
    const busy = list.items.some((x) => !x.w && !x.error);
    go.disabled = !ok || busy;
    go.textContent = !n ? "사진을 넣어 주세요" : busy ? "사진 여는 중…" : `${ok}장으로 PDF 만들기`;
  };
  list.onChange();

  function add(files: File[]): void {
    err.hide();
    const ok = filterFiles(files, IMG_KINDS, LIMITS.imageFile, (m) => err.show(m));
    list.add(ok, (m) => err.show(m));
  }

  async function run() {
    err.hide(); out.replaceChildren(); go.disabled = true;
    const its = list.items.filter(isDecoded);
    try {
      const images: { bytes: Uint8Array<ArrayBuffer>; mime: string; w: number; h: number }[] = [];
      for (let i = 0; i < its.length; i++) {
        prog.set(i / its.length * 0.6, `${i + 1}/${its.length} 사진 준비 중…`);
        const img = await decodeImage(its[i].file);
        // 투명한 PNG 는 PNG 로, 나머지는 JPEG(92%)로 넣어요
        const keepPng = its[i].file.type === "image/png";
        const c = drawToCanvas(img, img.width, img.height, keepPng ? null : "#fff");
        img.close();
        const mime = keepPng ? "image/png" : "image/jpeg";
        const b = await canvasToBlob(c, mime, 0.92);
        images.push({ bytes: new Uint8Array(await b.arrayBuffer()), mime, w: c.width, h: c.height });
        c.width = c.height = 0;
      }
      const { bytes } = await runPdf<{ bytes: Uint8Array<ArrayBuffer> }>("images", { images, pageSize, marginPt: mmToPt(Number(margin)) }, images.map((x) => x.bytes.buffer), (d, t) => prog.set(0.6 + d / t * 0.35, `${d}/${t} 쪽 만드는 중…`));
      prog.set(1, "완료!");
      const name = outName(its[0].file.name, its.length > 1 ? `외${its.length - 1}장` : "", "pdf");
      out.replaceChildren(h("div", { class: "result", id: "result" }, h("h2", {}, icon("ok"), `${its.length}쪽짜리 PDF가 만들어졌어요`), resultItem({ name, blob: new Blob([bytes], { type: "application/pdf" }) })));
    } catch (e) { err.show(errMsg(e)); }
    finally { prog.hide(); list.onChange(); }
  }
  return { onPaste: add, unmount: () => list.clear() };
}

/* ═════════ 5. 이미지 압축 · 변환 · 크기 조절 ═════════ */
const IMG_FMTS = ["keep", "image/jpeg", "image/png", "image/webp", "image/avif"] as const;
export function mountCompress(root: HTMLElement): Mounted {
  // 저장 형식·화질·최대 크기는 지난번에 고른 값으로 시작해요(prefs.ts)
  let fmt: string = pickPref(readPref(PREF.imgFmt), IMG_FMTS, "keep"), quality = intPref(readPref(PREF.imgQuality), 10, 100, 80);
  const err = alertBox();
  const prog = progress();
  const out = h("div");
  const list = imageList({ orderable: false });
  const dz = dropzone({ accept: IMG_ACCEPT, title: "줄일 사진을 여기에 끌어다 놓으세요", sub: "여러 장 한꺼번에 · JPG · PNG · WebP · AVIF · HEIC · 붙여넣기도 돼요", onFiles: add });
  const go = h("button", { type: "button", class: "btn primary big", onclick: run }, "변환하기");
  const qVal = h("b", {}, `${quality}%`);
  const q = h("input", { type: "range", min: "10", max: "100", step: "1", value: String(quality), "aria-label": "화질" });
  q.addEventListener("input", () => { quality = Number(q.value); qVal.textContent = `${quality}%`; out.replaceChildren(); });
  q.addEventListener("change", () => writePref(PREF.imgQuality, String(quality)));
  const maxW = h("input", { class: "input num", type: "number", min: "1", inputmode: "numeric", placeholder: "그대로", "aria-label": "최대 가로(px)", value: sizePref(readPref(PREF.imgMaxW)) });
  const maxH = h("input", { class: "input num", type: "number", min: "1", inputmode: "numeric", placeholder: "그대로", "aria-label": "최대 세로(px)", value: sizePref(readPref(PREF.imgMaxH)) });
  // 칸에 남는 값 = 기억하는 값 = 쓰는 값. 예전에는 '0.5'를 넣으면 기억은 안 하면서 그대로 써서 1×1 그림이 나왔어요(버그 6차)
  const saveMax = () => { maxW.value = sizePref(maxW.value); maxH.value = sizePref(maxH.value); writePref(PREF.imgMaxW, maxW.value); writePref(PREF.imgMaxH, maxH.value); out.replaceChildren(); };
  maxW.addEventListener("change", saveMax); maxH.addEventListener("change", saveMax);
  maxW.addEventListener("input", () => out.replaceChildren()); maxH.addEventListener("input", () => out.replaceChildren());
  const qOpt = h("div", { class: "opt" }, h("span", { class: "lbl" }, "화질 ", qVal), q, h("div", { class: "hint" }, "70~85%면 눈으로 차이를 느끼기 어려워요. PNG는 화질 설정이 없어요."));
  const fmtOpts: SegOption<string>[] = [
    { value: "keep", label: "원래 형식" },
    { value: "image/jpeg", label: "JPG" },
    { value: "image/png", label: "PNG" },
    { value: "image/webp", label: "WebP" },
    { value: "image/avif", label: "AVIF" },
  ];
  const fmtSeg = seg(fmtOpts, fmt, (v) => { fmt = v; writePref(PREF.imgFmt, v); syncQ(); out.replaceChildren(); });
  const fmtHint = h("div", { class: "hint" });
  const count = h("span", { class: "muted" });
  const panel = h("div", { class: "panel", hidden: true },
    h("div", { class: "panel-head" }, h("h2", {}, "사진"), h("div", { class: "row" }, count, h("button", { type: "button", class: "btn ghost sm", onclick: () => { list.clear(); holdTaps(); focusIfLost(dz); } }, "모두 지우기"))),
    list.el,
    h("div", { class: "opts", style: "margin-top:16px" },
      h("div", { class: "opt" }, h("span", { class: "lbl" }, "저장 형식"), fmtSeg, fmtHint),
      qOpt,
      h("div", { class: "opt" }, h("span", { class: "lbl" }, "최대 크기 (px, 비율 유지)"), h("div", { class: "row" }, maxW, h("span", { class: "muted" }, "×"), maxH),
        h("div", { class: "row", style: "margin-top:8px" }, ...[["1920", "FHD"], ["1280", "1280"], ["800", "800"]].map(([v, l]) => h("button", { type: "button", class: "btn sm", onclick: () => { maxW.value = v; maxH.value = v; saveMax(); } }, l)),
          h("button", { type: "button", class: "btn sm ghost", onclick: () => { maxW.value = ""; maxH.value = ""; saveMax(); } }, "그대로")))));
  root.append(dz, err.el, panel, stickyActions(go), prog.el, out);
  // 사진을 더하거나 빼거나 형식·화질·크기를 바꾸면 지난 결과는 지금 설정과 달라요(옛 결과·내려받기를 걷어요)
  list.onEdit = () => out.replaceChildren();

  // 브라우저가 저장할 수 없는 형식은 끄기
  (async () => {
    const no: string[] = [];
    for (const o of fmtOpts) if (o.value.startsWith("image/") && !(await canEncode(o.value))) { o.disabled = true; o.title = "이 브라우저는 이 형식으로 저장할 수 없어요"; no.push(o.label); }
    // 지난번에 고른 형식을 이 브라우저가 저장할 수 없으면 원래 형식으로
    if (fmtOpts.some((o) => o.value === fmt && o.disabled)) { fmt = "keep"; syncQ(); }
    fmtSeg.setValue(fmt);
    fmtHint.textContent = no.length ? `이 브라우저는 ${no.join(", ")} 저장을 지원하지 않아요. (원래 형식이 그렇다면 JPG로 저장해요)` : "원래 형식: JPG는 JPG로, PNG는 PNG로 저장해요. HEIC는 JPG로.";
  })();
  function syncQ() { qOpt.style.opacity = fmt === "image/png" ? ".45" : ""; q.disabled = fmt === "image/png"; }

  list.onChange = () => {
    const n = list.items.length, ok = list.items.filter(isDecoded).length;
    panel.hidden = !n;
    dz.setCompact(n > 0, "사진 더 넣기");
    count.textContent = `${n}장 · ${formatSize(list.items.reduce((a, x) => a + x.file.size, 0))}`;
    const busy = list.items.some((x) => !x.w && !x.error);
    go.disabled = !ok || busy;
    go.textContent = !n ? "사진을 넣어 주세요" : busy ? "사진 여는 중…" : `${ok}장 변환하기`;
  };
  list.onChange();

  function add(files: File[]): void {
    err.hide();
    list.add(filterFiles(files, IMG_KINDS, LIMITS.imageFile, (m) => err.show(m)), (m) => err.show(m));
  }

  async function targetType(file: File): Promise<string> {
    if (fmt !== "keep") return fmt;
    const t = file.type;
    if ((t === "image/png" || t === "image/webp" || t === "image/avif") && (await canEncode(t))) return t;
    if (t === "image/png") return t;
    if (t === "image/gif" || t === "image/bmp") return "image/png";
    return "image/jpeg";
  }

  async function run() {
    err.hide(); out.replaceChildren(); go.disabled = true;
    const its = list.items.filter(isDecoded);
    const results: { it: ImgItem; blob: Blob; type: string; w: number; h: number; name: string }[] = [];
    const mw = Number(sizePref(maxW.value)) || 0, mh = Number(sizePref(maxH.value)) || 0;
    try {
      for (let i = 0; i < its.length; i++) {
        const it = its[i];
        prog.set(i / its.length, `${i + 1}/${its.length} ${it.file.name}`);
        const img = await decodeImage(it.file);
        const type = await targetType(it.file);
        const fit = fitWithin(img.width, img.height, mw, mh);
        const c = drawToCanvas(img, fit.width, fit.height, type === "image/jpeg" ? "#fff" : null);
        img.close();
        const blob = await canvasToBlob(c, type, type === "image/png" ? undefined : quality / 100);
        const sameFmt = type === it.file.type;
        results.push({ it, blob, type, w: c.width, h: c.height, name: outName(it.file.name, sameFmt ? "압축" : "", extFor(type)) });
        c.width = c.height = 0;
      }
      prog.set(1, "완료!");
      const names = uniqueNames(results.map((r) => r.name));
      results.forEach((r, i) => (r.name = names[i]));
      const before = results.reduce((a, r) => a + r.it.file.size, 0), after = results.reduce((a, r) => a + r.blob.size, 0);
      const pct = savedPercent(before, after);
      const box = h("div", { class: "result", id: "result" },
        h("h2", {}, icon("ok"), ...arrowed(`${results.length}장 끝! ${formatSize(before)} → ${formatSize(after)}`), h("span", { class: `pill ${pct > 0 ? "good" : pct < 0 ? "bad" : ""}` }, pct > 0 ? `${pct}% 줄었어요` : pct < 0 ? `${-pct}% 커졌어요` : "거의 그대로")));
      if (results.length > 1) {
        const zipBtn: HTMLButtonElement = h("button", { type: "button", class: "btn primary", onclick: once(async () => { zipBtn.disabled = true; try { download(await makeZip(results), `사진-${results.length}장-변환.zip`); } catch (e) { err.show(errMsg(e)); } zipBtn.disabled = false; }) }, icon("dl"), "모두 ZIP으로 받기");
        box.append(h("div", { class: "row", style: "margin-bottom:8px" }, zipBtn));
      }
      for (const r of results) {
        const p = savedPercent(r.it.file.size, r.blob.size);
        const extra = h("span", {}, `원본 ${formatSize(r.it.file.size)} · ${r.w}×${r.h} `, h("span", { class: `pill ${p >= 0 ? "good" : "bad"}` }, p >= 0 ? `−${p}%` : `+${-p}%`),
          p < 0 && r.type === r.it.file.type && r.w === r.it.w ? h("span", { class: "muted" }, " 원본이 더 작아요 — 원본을 그대로 쓰세요") : null);
        box.append(resultItem({ name: r.name, blob: r.blob, extra, thumb: h("img", { class: "fthumb", src: r.it.thumb, alt: "" }) }));
      }
      if (results.some((r) => r.it.file.type === "image/gif")) box.append(h("p", { class: "hint" }, "움직이는 GIF는 첫 장면만 남아요."));
      out.replaceChildren(box);
    } catch (e) { err.show(errMsg(e)); }
    finally { prog.hide(); list.onChange(); }
  }
  syncQ();
  return { onPaste: add, unmount: () => list.clear() };
}

/* ═════════ 7. 사진 정보(EXIF·위치) 지우기 ═════════ */
let exifrP: Promise<Exifr> | null = null;
const loadExifr = () => (exifrP ||= vendorImport<ExifrModule>("/vendor/exifr-7.1.3.mjs").then((m) => m.default || m));

async function readMeta(fileOrBlob: Blob): Promise<Meta> {
  const exifr = await loadExifr();
  let d: ExifData | null | undefined = null;
  try {
    d = await exifr.parse(fileOrBlob, { tiff: true, exif: true, gps: true, xmp: true, iptc: true, icc: false, jfif: false, ihdr: false, mergeOutput: true, translateValues: true, reviveValues: true });
  } catch { d = null; }
  if (!d) return { count: 0, chips: [] };
  const keys = Object.keys(d).filter((k) => !/^(ImageWidth|ImageHeight|ExifImageWidth|ExifImageHeight|Orientation|ColorSpace|XResolution|YResolution|ResolutionUnit|YCbCrPositioning|BitsPerSample|ColorComponents|Compression|PixelXDimension|PixelYDimension)$/.test(k));
  const chips: Meta["chips"] = [];
  if (Number.isFinite(d.latitude) && Number.isFinite(d.longitude)) chips.push({ cls: "gps", text: `위치 정보 있음! ${formatCoord(d.latitude as number, d.longitude as number)}` });
  else if (keys.some((k) => /^GPS/.test(k))) chips.push({ cls: "gps", text: "위치 관련 정보 있음!" });
  const cam = [d.Make, d.Model].filter(Boolean).join(" ").replace(/^(\w+) \1 /i, "$1 ");
  if (cam) chips.push({ text: `카메라: ${cam}` });
  if (d.LensModel) chips.push({ text: `렌즈: ${d.LensModel}` });
  const dt = d.DateTimeOriginal || d.CreateDate || d.ModifyDate;
  if (dt) chips.push({ text: `찍은 때: ${dt instanceof Date ? dt.toLocaleString("ko-KR") : dt}` });
  if (d.Software) chips.push({ text: `프로그램: ${d.Software}` });
  if (d.Artist || d.Copyright || d.creator) chips.push({ text: `작성자 정보: ${d.Artist || d.creator || d.Copyright}` });
  if (d.SerialNumber || d.BodySerialNumber) chips.push({ text: "기기 일련번호" });
  const rest = keys.length - chips.length;
  if (rest > 0) chips.push({ text: `그 밖의 정보 ${rest}개` });
  return { count: keys.length, chips, gps: chips.some((c) => c.cls === "gps") };
}
const chipsEl = (meta: Meta) => h("div", { class: "chips" }, meta.count ? meta.chips.map((c) => h("span", { class: `chip ${c.cls || ""}`, title: c.text }, c.text)) : h("span", { class: "chip clean" }, "숨은 정보 없음"));

export function mountExif(root: HTMLElement): Mounted {
  const err = alertBox();
  const prog = progress();
  const out = h("div");
  const list = imageList({ orderable: false });
  const dz = dropzone({ accept: IMG_ACCEPT, title: "정보를 지울 사진을 끌어다 놓으세요", sub: "여러 장 가능 · JPG · PNG · WebP · HEIC · 붙여넣기도 돼요", onFiles: add });
  const go = h("button", { type: "button", class: "btn primary big", onclick: run }, "정보 지우기");
  const summary = h("div", { class: "alert info", hidden: true });
  const panel = h("div", { class: "panel", hidden: true },
    h("div", { class: "panel-head" }, h("h2", {}, "찾은 정보"), h("button", { type: "button", class: "btn ghost sm", onclick: () => { list.clear(); holdTaps(); focusIfLost(dz); } }, "모두 지우기")),
    list.el, summary,
    h("p", { class: "hint" }, "사진을 브라우저에서 새로 그려 저장하는 방식이라 위치 · 카메라 · 날짜 같은 정보가 모두 빠져요. 사진 방향은 맞게 돌려서 저장해요. JPG는 화질 95%로 저장하고, 색 프로필이 빠져서 넓은 색영역 사진은 색이 조금 달라질 수 있어요."));
  root.append(dz, err.el, panel, stickyActions(go), prog.el, out);
  list.onEdit = () => out.replaceChildren(); // 사진을 더하거나 빼면 지난 결과를 걷어요

  list.onChange = () => {
    const n = list.items.length;
    panel.hidden = !n;
    dz.setCompact(n > 0, "사진 더 넣기");
    const busy = list.items.some((x) => (!x.w && !x.error) || (!x.meta && !x.error));
    const ok = list.items.filter(isDecoded).length;
    go.disabled = !ok || busy;
    go.textContent = !n ? "사진을 넣어 주세요" : busy ? "정보 읽는 중…" : `${ok}장 정보 지우기`;
    const gps = list.items.filter((x) => x.meta?.gps).length;
    summary.hidden = !n || busy;
    summary.className = gps ? "alert" : "alert info";
    summary.textContent = gps ? `${n}장 중 ${gps}장에 찍은 위치(GPS)가 들어 있어요. 그대로 올리면 사는 곳이 드러날 수 있어요.` : "위치 정보가 든 사진은 없어요. 그래도 카메라·날짜 정보는 지울 수 있어요.";
  };
  list.onChange();

  async function add(files: File[]): Promise<void> {
    err.hide();
    const ok = filterFiles(files, IMG_KINDS, LIMITS.imageFile, (m) => err.show(m));
    const { created, done } = list.add(ok, (m) => err.show(m));
    for (const it of created) {
      it.meta = await readMeta(it.file);
      it.extra = chipsEl(it.meta);
      list.render();
    }
    await done;
  }

  async function run() {
    err.hide(); out.replaceChildren(); go.disabled = true;
    const its = list.items.filter(isDecoded);
    const results: { it: ImgItem; blob: Blob; after: Meta; name: string; shrunk: string | null }[] = [];
    try {
      for (let i = 0; i < its.length; i++) {
        const it = its[i];
        prog.set(i / its.length, `${i + 1}/${its.length} ${it.file.name}`);
        const img = await decodeImage(it.file);
        let type = it.file.type;
        if (!["image/jpeg", "image/png", "image/webp"].includes(type) || !(await canEncode(type))) type = it.file.type === "image/png" ? "image/png" : "image/jpeg";
        const c = drawToCanvas(img, img.width, img.height, type === "image/jpeg" ? "#fff" : null);
        // 기기 한계(아이폰은 1,600만 화소)보다 큰 사진은 줄어들어요 → 결과에 알려요
        const shrunk = c.width < img.width ? `${img.width}×${img.height} → ${c.width}×${c.height}` : null;
        img.close();
        const blob = await canvasToBlob(c, type, type === "image/png" ? undefined : 0.95);
        c.width = c.height = 0;
        const after = await readMeta(blob);
        results.push({ it, blob, after, name: outName(it.file.name, "정보삭제", extFor(type)), shrunk });
      }
      prog.set(1, "완료!");
      const names = uniqueNames(results.map((r) => r.name));
      results.forEach((r, i) => (r.name = names[i]));
      const clean = results.every((r) => r.after.count === 0);
      const box = h("div", { class: "result", id: "result" }, h("h2", {}, icon("ok"), clean ? `${results.length}장 모두 깨끗해졌어요` : "저장했어요 (일부 정보가 남았어요)"));
      if (results.length > 1) {
        const zipBtn: HTMLButtonElement = h("button", { type: "button", class: "btn primary", onclick: once(async () => { zipBtn.disabled = true; try { download(await makeZip(results), `사진-${results.length}장-정보삭제.zip`); } catch (e) { err.show(errMsg(e)); } zipBtn.disabled = false; }) }, icon("dl"), "모두 ZIP으로 받기");
        box.append(h("div", { class: "row", style: "margin-bottom:8px" }, zipBtn));
      }
      for (const r of results) box.append(resultItem({ name: r.name, blob: r.blob, thumb: h("img", { class: "fthumb", src: r.it.thumb, alt: "" }), extra: h("span", {},
        r.after.count === 0 ? h("span", { class: "chip clean" }, "다시 확인: 남은 정보 없음") : h("span", { class: "chip" }, `남은 정보 ${r.after.count}개`),
        r.shrunk ? h("span", { class: "chip warn", title: "이 기기가 다룰 수 있는 크기보다 커서 줄였어요" }, "크기 줄어듦 ", ...arrowed(r.shrunk)) : null) }));
      if (results.some((r) => r.shrunk)) box.append(h("p", { class: "hint" }, "이 기기가 한 번에 다룰 수 있는 크기보다 큰 사진은 해상도가 줄어요. 원래 크기가 필요하면 PC에서 해 주세요."));
      out.replaceChildren(box);
    } catch (e) { err.show(errMsg(e)); }
    finally { prog.hide(); list.onChange(); }
  }
  return { onPaste: add, unmount: () => list.clear() };
}
