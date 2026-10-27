// PDF 도구: 합치기 / 나누기·페이지 빼기 / 회전·순서
import { h, stickyActions, ICONS, icon, arrowed, iconBtn, rowAction, describeRows, dropzone, progress, alertBox, errMsg, resultItem, sortable, seg, filterFiles, LIMITS, runPdf, openPdfjs, thumbRenderer, makeZip, toast, renderPdfPage, canvasToBlob, focusIfLost, touchFirst } from "./ui.js";
import { holdTaps } from "./tap.js";
import { PREF, readPref, writePref, pickPref } from "./prefs.js";
import { formatSize, outName, moveItem, sortByName, isSortedByName, parseRanges, rangesToSet, formatRanges, uniqueNames, baseName, safeName, normRotation, savedPercent, COMPRESS_PRESETS, FIT_STEPS, FIT_TARGETS_MB, fitToSize, mbToBytes, parseTargetMb, targetMbInput, overButLooksUnder, mergeGoLabel, mergeBadNote, type CompressMode, type CompressLevel, type CompressPreset } from "./lib.js";
import type { ShrinkStats } from "./pdf-shrink.js";
import type { ThumbRenderer } from "./ui.js";
import type { PdfjsDocument } from "./vendor.js";
import type { Mounted } from "./app.js";

type Bytes = Uint8Array<ArrayBuffer>;
/** 열어 둔 PDF 하나 */
interface Opened { file: File; buf: ArrayBuffer; doc: PdfjsDocument; pages: number; renderer: ThumbRenderer }
const pdfBlob = (bytes: Bytes) => new Blob([bytes], { type: "application/pdf" });
const sumPages = (list: { pages: number | null }[]) => list.reduce((a, f) => a + (f.pages || 0), 0);
/**
 * 순서 바꾸기 안내: 손가락 화면에서는 끌어서 옮기기가 기기마다 안 되거나 달라서(QA 3바퀴 제안) 되는 방법(화살표 단추)만 적어요.
 * 예전에는 '끌어서 놓거나'라고 적혀 있어 처음 쓰는 사람이 손잡이를 끌다 막혔어요
 */
export const moveHint = (mouse: string, touch: string, isTouch = touchFirst()): string => (isTouch ? touch : mouse);

/* ═════════ 1. PDF 합치기 ═════════ */
export function mountMerge(root: HTMLElement): Mounted {
  let files: { id: number; file: File; pages: number | null; error: string | null }[] = []; // {id, file, pages, error}
  let uid = 0;
  /** '모두 지우기'마다 올려요 — 큰 PDF 쪽수를 세는 동안 지우면, 아직 차례를 기다리던 파일이 지운 목록에 다시 들어왔어요(버그 5차) */
  let gen = 0;
  const err = alertBox();
  const prog = progress();
  const listEl = h("ol", { class: "flist", "aria-label": "합칠 PDF 순서" });
  // 못 읽은 PDF 는 합칠 때 빠져요(QA 12바퀴). 예전에는 말없이 빠져서 제출 서류 하나가 빠진 채 내려받을 수 있었고,
  // 1개 + 깨진 1개면 목록엔 2개인데 단추는 'PDF를 2개 이상 넣어 주세요'라 어긋났어요
  const badNote = h("p", { class: "hint bad", style: "margin:10px 0 0", hidden: true });
  const summary = h("span", { class: "muted" });
  const go = h("button", { type: "button", class: "btn primary big", disabled: true, onclick: run }, "PDF 합치기");
  const clearBtn = h("button", { type: "button", class: "btn ghost sm", onclick: () => { gen++; files = []; out.replaceChildren(); render(); holdTaps(); focusIfLost(dz); } }, "모두 지우기");
  // 휴대폰 파일 고르기는 누른 차례대로 넘겨 줘서 '스캔 1~40'이 섞여 들어와요 — 화살표로 맞추려면 수십 번 눌러야 했어요(QA 5바퀴)
  const sortBtn = h("button", { type: "button", class: "btn ghost sm", title: "파일 이름 순서로 놓아요", onclick: () => {
    if (isSortedByName(files, (f) => f.file.name)) { toast("이미 이름 순서예요"); return; }
    files = sortByName(files, (f) => f.file.name); relist(); holdTaps(undefined, listEl);
  } }, "이름순");
  const panel = h("div", { class: "panel", hidden: true },
    h("div", { class: "panel-head" }, h("h2", {}, "합칠 순서"), h("div", { class: "row" }, summary, sortBtn, clearBtn)),
    h("p", { class: "hint", style: "margin:-6px 0 10px" }, moveHint("끌어서 놓거나 화살표 단추로", "화살표 단추로") + " 순서를 바꿀 수 있어요. 책갈피(목차)와 입력 칸은 합친 파일로 따라오지 않아요."),
    listEl, badNote);
  const out = h("div");
  const dz = dropzone({ accept: "application/pdf,.pdf", title: "PDF 파일을 여기에 끌어다 놓으세요", sub: "또는 눌러서 고르기 · 여러 개 한꺼번에 가능", onFiles: add });

  root.append(dz, err.el, panel, stickyActions(go), prog.el, out);
  /** 순서·파일이 바뀌면 지난 결과는 지금 목록과 달라요 — 예전에는 바꾼 뒤에도 '15쪽짜리 PDF가 만들어졌어요'와 옛 파일 내려받기가 남았어요 */
  const relist = () => { out.replaceChildren(); render(); };
  sortable(listEl, ".fitem", (a, b) => { files = moveItem(files, a, b); relist(); });

  async function add(list: File[]): Promise<void> {
    err.hide();
    const ok = filterFiles(list, ["pdf"], LIMITS.pdfFile, (m) => err.show(m));
    const g = gen;
    for (const file of ok) {
      if (g !== gen) return;
      const it: (typeof files)[number] = { id: ++uid, file, pages: null, error: null };
      files.push(it);
      relist();
      try {
        const buf = await file.arrayBuffer();
        it.pages = (await runPdf<{ pages: number }>("count", { buf }, [buf])).pages;
      } catch (e) { it.error = errMsg(e); }
      render();
    }
  }

  function render() {
    panel.hidden = !files.length;
    dz.setCompact(files.length > 0, "PDF 더 넣기");
    listEl.replaceChildren(...files.map((f, i) => h("li", { class: "fitem", draggable: "true", dataset: { k: "m" + f.id } },
      h("span", { class: "handle", html: ICONS.grip, title: "끌어서 순서 바꾸기" }),
      h("span", { class: "fnum" }, i + 1),
      h("div", { class: "fmeta" },
        h("div", { class: "fname", title: f.file.name }, f.file.name),
        h("div", { class: "fsub" }, f.error ? h("span", { class: "bad" }, f.error) : f.pages == null ? "쪽수 세는 중…" : `${f.pages}쪽`, " · ", formatSize(f.file.size))),
      h("div", { class: "fbtns" },
        iconBtn("up", "위로", rowAction(listEl, ".fitem", () => { files = moveItem(files, i, i - 1); relist(); return i - 1; })),
        iconBtn("down", "아래로", rowAction(listEl, ".fitem", () => { files = moveItem(files, i, i + 1); relist(); return i + 1; })),
        iconBtn("x", "빼기", rowAction(listEl, ".fitem", () => { files.splice(i, 1); relist(); return files.length ? i : null; }), "danger")))));
    listEl.querySelectorAll(".fitem")[0]?.querySelector('[aria-label="위로"]')?.setAttribute("disabled", "");
    [...listEl.querySelectorAll(".fitem")].at(-1)?.querySelector('[aria-label="아래로"]')?.setAttribute("disabled", "");
    describeRows(listEl, ".fitem", ".fname");
    const good = files.filter((f) => f.pages);
    const bad = files.filter((f) => f.error).length;
    summary.textContent = `${files.length}개 · 모두 ${sumPages(good)}쪽`;
    sortBtn.hidden = files.length < 2;
    badNote.hidden = !bad;
    badNote.textContent = bad ? mergeBadNote(bad, good.length) : "";
    go.disabled = good.length < 2 || files.some((f) => f.pages == null && !f.error);
    go.textContent = mergeGoLabel(good.length, bad, sumPages(good));
  }

  async function run() {
    err.hide(); out.replaceChildren();
    const good = files.filter((f) => f.pages);
    const bad = files.filter((f) => f.error).length;
    go.disabled = true;
    try {
      prog.set(0, "파일 읽는 중…");
      const bufs = await Promise.all(good.map((f) => f.file.arrayBuffer()));
      const { bytes } = await runPdf<{ bytes: Bytes }>("merge", { bufs }, bufs, (d, t) => prog.set(d / t * 0.9, `${d}/${t} 합치는 중…`));
      prog.set(1, "완료!");
      const name = outName(good[0].file.name, "합침", "pdf");
      const blob = pdfBlob(bytes);
      out.replaceChildren(h("div", { class: "result", id: "result" }, h("h2", {}, icon("ok"), `${sumPages(good)}쪽짜리 PDF가 만들어졌어요`), resultItem({ name, blob, extra: `${good.length}개 파일 합침${bad ? ` · 못 읽은 ${bad}개 제외` : ""}` })));
      out.querySelector<HTMLButtonElement>("button.primary")?.focus();
    } catch (e) { err.show(errMsg(e)); }
    finally { prog.hide(); render(); }
  }
  render();
  return {};
}

/* ═════════ PDF 하나를 열어 썸네일 격자 만드는 공통부 ═════════ */
async function openOne(file: File, prog: ReturnType<typeof progress>) {
  prog.set(null, "PDF 여는 중…");
  const buf = await file.arrayBuffer();
  const doc = await openPdfjs(buf.slice(0));
  return { buf, doc, pages: doc.numPages };
}

/* ═════════ 2. 나누기 / 페이지 빼기 ═════════ */
export function mountSplit(root: HTMLElement): Mounted {
  let cur: Opened | null = null; // {file, buf, doc, pages, renderer}
  const C = () => cur as Opened; // PDF 를 연 뒤에만 불림
  let mode = "pick"; // pick | each | ranges
  let keep = "keep"; // keep | remove
  let sel = new Set<number>();
  const err = alertBox();
  const prog = progress();
  const out = h("div");
  const dz = dropzone({ accept: "application/pdf,.pdf", multiple: false, title: "나눌 PDF 하나를 끌어다 놓으세요", sub: "또는 눌러서 고르기", onFiles: (f) => load(f[0]) });

  const modeSeg = seg([
    { value: "pick", label: "골라서 빼기" },
    { value: "each", label: "한 쪽씩 나누기" },
    { value: "ranges", label: "범위로 나누기" },
  ], mode, (v) => { mode = v; out.replaceChildren(); update(); });
  const keepSeg = seg([{ value: "keep", label: "고른 쪽만 새 PDF로" }, { value: "remove", label: "고른 쪽 지우고 저장" }], keep, (v) => { keep = v; out.replaceChildren(); update(); });
  const rangeIn = h("input", { class: "input", type: "text", inputmode: "text", placeholder: "예) 1-3, 5, 8-10", "aria-label": "페이지 범위", autocomplete: "off" });
  const rangeHint = h("div", { class: "hint" });
  const selInfo = h("span", { class: "muted" });
  const allBtn = h("button", { type: "button", class: "btn sm", onclick: () => { sel = new Set([...Array(C().pages).keys()]); syncSel(true); } }, "전체 선택");
  const noneBtn = h("button", { type: "button", class: "btn sm", onclick: () => { sel.clear(); syncSel(true); } }, "선택 해제");
  const pickTools = h("div", { class: "row" }, selInfo, allBtn, noneBtn);
  const go = h("button", { type: "button", class: "btn primary big", onclick: run }, "만들기");
  const grid = h("div", { class: "thumbs" });
  const fileLine = h("div", { class: "muted", tabindex: "-1" }); // 파일을 넣어 파일 넣는 곳이 숨으면 초점을 여기로(focusIfLost)
  const optKeep = h("div", { class: "opt" }, h("span", { class: "lbl" }, "어떻게 저장할까요?"), keepSeg);
  const optRange = h("div", { class: "opt" }, h("label", {}, "페이지 범위"), rangeIn, rangeHint);
  const work = h("div", { hidden: true },
    h("div", { class: "panel" },
      h("div", { class: "panel-head" }, fileLine, h("button", { type: "button", class: "btn ghost sm", onclick: () => { reset(); holdTaps(); focusIfLost(dz); } }, "다른 PDF")),
      h("div", { class: "opts" }, h("div", { class: "opt" }, h("span", { class: "lbl" }, "방법"), modeSeg), optKeep, optRange)),
    h("div", { class: "panel" }, h("div", { class: "panel-head" }, h("h2", {}, "페이지"), pickTools), grid),
    stickyActions(go));
  root.append(dz, err.el, work, prog.el, out);

  rangeIn.addEventListener("input", () => {
    out.replaceChildren(); // 고른 쪽·범위가 바뀌면 지난 결과는 지금 설정과 달라요(합치기·이미지 도구와 같게)
    if (mode === "pick") {
      try { sel = new Set(rangesToSet(parseRanges(rangeIn.value, C().pages))); rangeHint.className = "hint"; syncSel(false); }
      catch (e) { if (rangeIn.value.trim()) { rangeHint.className = "hint bad"; rangeHint.textContent = errMsg(e); update(); } else { sel.clear(); syncSel(false); } }
    } else update();
  });

  let loadGen = 0; // 여는 중에 다른 PDF 를 고르면 늦게 끝난 옛 열기는 버려요(나중에 고른 파일이 이겨요)
  function reset() {
    loadGen++;
    cur?.renderer.destroy(); cur = null; sel.clear(); out.replaceChildren(); err.hide();
    work.hidden = true; dz.hidden = false; rangeIn.value = "";
  }

  async function load(file: File): Promise<void> {
    err.hide(); out.replaceChildren();
    if (!filterFiles([file], ["pdf"], LIMITS.pdfFile, (m) => err.show(m)).length) return;
    reset();
    const g = loadGen;
    try {
      const o = await openOne(file, prog);
      if (g !== loadGen) { o.doc.destroy?.(); return; }
      cur = { file, ...o, renderer: thumbRenderer(o.doc) };
      dz.hidden = true; work.hidden = false;
      fileLine.replaceChildren(h("b", { style: "color:var(--ink)" }, file.name), ` · ${C().pages}쪽 · ${formatSize(file.size)}`);
      focusIfLost(fileLine);
      grid.replaceChildren(...Array.from({ length: C().pages }, (_, i) => {
        const box = h("div", { class: "tbox", dataset: { page: i } }, h("div", { class: "ph" }));
        const card = h("div", { class: "thumb", dataset: { i }, role: "checkbox", "aria-checked": "false", tabindex: "0", "aria-label": `${i + 1}쪽` },
          h("span", { class: "check", html: ICONS.check }), box, h("div", { class: "tlabel" }, h("b", {}, `${i + 1}쪽`)));
        const toggle = () => { if (mode !== "pick") return; sel.has(i) ? sel.delete(i) : sel.add(i); syncSel(true); };
        card.addEventListener("click", toggle);
        card.addEventListener("keydown", (e) => { if (e.key === " " || e.key === "Enter") { e.preventDefault(); toggle(); } });
        C().renderer.observe(box);
        return card;
      }));
      update();
    // reset() 이 loadGen 을 올려서 finally 의 prog.hide() 가 건너뛰어졌어요 — '여는 중…' 막대가 남고, reset() 안의 err.hide() 가
    // 방금 띄운 까닭까지 지워서 깨진 PDF 를 넣으면 끝나지 않는 막대만 보였어요(QA 11바퀴). 걷어낸 뒤에 까닭을 띄워요
    } catch (e) { if (g === loadGen) { reset(); prog.hide(); err.show(errMsg(e)); } }
    finally { if (g === loadGen) prog.hide(); }
  }

  /** 고른 쪽이 바뀌면(썸네일·전체 선택·선택 해제·범위 칸) — 방법·저장 방식을 바꿀 때도 옛 결과를 걷어요. 예전에는 '한 쪽씩 나누기'로 바꿔도 '2쪽짜리 PDF가 만들어졌어요'와 그 내려받기가 남았어요 */
  function syncSel(writeInput: boolean): void {
    out.replaceChildren();
    grid.querySelectorAll<HTMLElement>(".thumb").forEach((c) => { const on = sel.has(Number(c.dataset.i)); c.classList.toggle("sel", on); c.setAttribute("aria-checked", String(on)); });
    if (writeInput) { rangeIn.value = formatRanges([...sel]); rangeHint.className = "hint"; }
    update();
  }

  function groupsForRanges() {
    return parseRanges(rangeIn.value, C().pages);
  }

  function update() {
    if (!cur) return;
    const pick = mode === "pick";
    optKeep.hidden = !pick;
    optRange.hidden = mode === "each";
    pickTools.hidden = !pick;
    grid.querySelectorAll(".thumb").forEach((c) => c.classList.toggle("selectable", pick));
    if (!pick) grid.querySelectorAll(".thumb").forEach((c) => c.classList.remove("sel"));
    else syncSelClasses();
    rangeIn.placeholder = pick ? "예) 1-3, 5 (썸네일을 눌러도 돼요)" : "예) 1-3, 5, 8-10 → 파일 3개";
    selInfo.textContent = `${sel.size}쪽 고름`;
    if (pick) {
      if (rangeHint.className !== "hint bad") rangeHint.textContent = "썸네일을 누르거나 범위를 적어서 고르세요.";
      const n = keep === "keep" ? sel.size : C().pages - sel.size;
      // 범위 칸에 잘못 적은 채로는 만들지 않아요 — 예전에는 '11'처럼 없는 쪽을 적어 안내가 떠도 그 전에 고른 쪽으로 만들 수 있었어요
      const badRange = rangeHint.className === "hint bad";
      go.disabled = badRange || !sel.size || n < 1;
      go.textContent = badRange ? "범위를 고쳐 주세요" : !sel.size ? "페이지를 골라 주세요" : n < 1 ? "모든 쪽을 지울 순 없어요" : keep === "keep" ? `${sel.size}쪽으로 새 PDF 만들기` : `${sel.size}쪽 지우고 저장 (${n}쪽 남음)`;
    } else if (mode === "each") {
      go.disabled = C().pages < 2;
      go.textContent = C().pages < 2 ? "1쪽짜리는 나눌 게 없어요" : `${C().pages}개 파일로 나누기`;
    } else {
      try {
        const g = groupsForRanges();
        rangeHint.className = "hint";
        rangeHint.textContent = `파일 ${g.length}개: ` + g.map((x) => x.length === 1 ? `${x[0] + 1}쪽` : `${x[0] + 1}-${(x.at(-1) as number) + 1}쪽`).join(", ");
        go.disabled = false; go.textContent = `${g.length}개 파일로 나누기`;
      } catch (e) {
        rangeHint.className = rangeIn.value.trim() ? "hint bad" : "hint";
        rangeHint.textContent = rangeIn.value.trim() ? errMsg(e) : "쉼표로 나눈 묶음마다 파일 하나가 돼요.";
        go.disabled = true; go.textContent = "범위를 적어 주세요";
      }
    }
  }
  function syncSelClasses() { grid.querySelectorAll<HTMLElement>(".thumb").forEach((c) => c.classList.toggle("sel", sel.has(Number(c.dataset.i)))); }

  async function run() {
    err.hide(); out.replaceChildren(); go.disabled = true;
    const base = safeName(baseName(C().file.name));
    try {
      if (mode === "pick") {
        const chosen = [...sel].sort((a, b) => a - b);
        const pages = keep === "keep" ? chosen : [...Array(C().pages).keys()].filter((i) => !sel.has(i));
        prog.set(null, "새 PDF 만드는 중…");
        const buf = C().buf.slice(0);
        const { bytes } = await runPdf<{ bytes: Bytes }>("pick", { buf, pages }, [buf]);
        const name = outName(C().file.name, keep === "keep" ? `${formatRanges(chosen).replace(/\s/g, "")}쪽` : "페이지삭제", "pdf");
        out.replaceChildren(h("div", { class: "result", id: "result" }, h("h2", {}, icon("ok"), `${pages.length}쪽짜리 PDF가 만들어졌어요`), resultItem({ name, blob: pdfBlob(bytes) })));
      } else {
        const groups = mode === "each" ? [...Array(C().pages).keys()].map((i) => [i]) : groupsForRanges();
        const pad = String(C().pages).length;
        const names = uniqueNames(groups.map((g) => {
          const a = g[0] + 1, b = (g.at(-1) as number) + 1;
          return mode === "each" ? `${base}-${String(a).padStart(pad, "0")}쪽.pdf` : `${base}-${a === b ? a : `${a}-${b}`}쪽.pdf`;
        }));
        const buf = C().buf.slice(0);
        const { files } = await runPdf<{ files: Bytes[] }>("split", { buf, groups }, [buf], (d, t) => prog.set(d / t * 0.9, `${d}/${t} 나누는 중…`));
        const items = files.map((b, i) => ({ name: names[i], blob: pdfBlob(b) }));
        prog.set(0.95, "ZIP으로 묶는 중…");
        const zip = await makeZip(items);
        const zipName = `${base}-나눔.zip`;
        const box = h("div", { class: "result", id: "result" }, h("h2", {}, icon("ok"), `파일 ${items.length}개로 나눴어요`),
          resultItem({ name: zipName, blob: zip, extra: `PDF ${items.length}개 묶음` }));
        const shown = items.slice(0, 50);
        box.append(...shown.map((it) => resultItem(it)));
        if (items.length > shown.length) box.append(h("p", { class: "hint" }, `나머지 ${items.length - shown.length}개는 ZIP에 들어 있어요.`));
        out.replaceChildren(box);
      }
      prog.set(1, "완료!");
    } catch (e) { err.show(errMsg(e)); }
    finally { prog.hide(); update(); }
  }
  return { unmount: () => cur?.renderer.destroy() };
}

/* ═════════ 3. 회전 · 순서 바꾸기 · 삭제 ═════════ */
export function mountOrganize(root: HTMLElement): Mounted {
  let cur: Opened | null = null;
  const C = () => cur as Opened; // PDF 를 연 뒤에만 불림
  let items: { idx: number; rot: number }[] = []; // {idx, rot}
  const thumbsByIdx = new Map<number, HTMLElement>(); // idx → tbox element (캔버스 재사용)
  const err = alertBox();
  const prog = progress();
  const out = h("div");
  const dz = dropzone({ accept: "application/pdf,.pdf", multiple: false, title: "정리할 PDF 하나를 끌어다 놓으세요", sub: "또는 눌러서 고르기", onFiles: (f) => load(f[0]) });
  const grid = h("div", { class: "thumbs", "aria-label": "페이지 순서" });
  const fileLine = h("div", { class: "muted", tabindex: "-1" }); // 파일을 넣어 파일 넣는 곳이 숨으면 초점을 여기로(focusIfLost)
  const info = h("span", { class: "muted" });
  const go = h("button", { type: "button", class: "btn primary big", onclick: run }, "저장하기");
  const work = h("div", { hidden: true },
    h("div", { class: "panel" },
      h("div", { class: "panel-head" }, fileLine, h("button", { type: "button", class: "btn ghost sm", onclick: () => { reset(); holdTaps(); focusIfLost(dz); } }, "다른 PDF")),
      h("div", { class: "row" },
        h("button", { type: "button", class: "btn sm", onclick: () => { items.forEach((it) => (it.rot = normRotation(it.rot - 90))); edit(); } }, icon("rotL"), "모두 왼쪽으로"),
        h("button", { type: "button", class: "btn sm", onclick: () => { items.forEach((it) => (it.rot = normRotation(it.rot + 90))); edit(); } }, icon("rotR"), "모두 오른쪽으로"),
        h("button", { type: "button", class: "btn sm ghost", onclick: () => { items = [...Array(C().pages).keys()].map((idx) => ({ idx, rot: 0 })); edit(); toast("처음 상태로 되돌렸어요"); } }, "처음 상태로"))),
    h("div", { class: "panel" }, h("div", { class: "panel-head" }, h("h2", {}, "페이지"), info),
      h("p", { class: "hint", style: "margin:-6px 0 10px" }, moveHint("썸네일을 끌어서 순서를 바꾸거나, 아래 단추로", "아래 단추로") + " 돌리기 · 옮기기 · 지우기를 할 수 있어요."), grid),
    stickyActions(go));
  root.append(dz, err.el, work, prog.el, out);
  /** 돌리고 옮기고 지우면 지난번에 저장한 결과는 지금 모습과 달라서 걷어요 */
  const edit = () => { out.replaceChildren(); render(); };
  sortable(grid, ".thumb", (a, b) => { items = moveItem(items, a, b); edit(); }, { horizontal: true });

  let loadGen = 0; // 여는 중에 다른 PDF 를 고르면 늦게 끝난 옛 열기는 버려요
  function reset() {
    loadGen++;
    cur?.renderer.destroy(); cur = null; items = []; thumbsByIdx.clear(); out.replaceChildren(); err.hide();
    work.hidden = true; dz.hidden = false;
  }
  async function load(file: File): Promise<void> {
    err.hide(); out.replaceChildren();
    if (!filterFiles([file], ["pdf"], LIMITS.pdfFile, (m) => err.show(m)).length) return;
    reset();
    const g = loadGen;
    try {
      const o = await openOne(file, prog);
      if (g !== loadGen) { o.doc.destroy?.(); return; }
      cur = { file, ...o, renderer: thumbRenderer(o.doc) };
      items = [...Array(C().pages).keys()].map((idx) => ({ idx, rot: 0 }));
      for (const it of items) {
        const box = h("div", { class: "tbox", dataset: { page: it.idx } }, h("div", { class: "ph" }));
        thumbsByIdx.set(it.idx, box);
        C().renderer.observe(box);
      }
      dz.hidden = true; work.hidden = false;
      fileLine.replaceChildren(h("b", { style: "color:var(--ink)" }, file.name), ` · ${C().pages}쪽 · ${formatSize(file.size)}`);
      focusIfLost(fileLine);
      render();
    // reset() 이 loadGen 을 올려서 finally 의 prog.hide() 가 건너뛰어졌어요 — '여는 중…' 막대가 남고, reset() 안의 err.hide() 가
    // 방금 띄운 까닭까지 지워서 깨진 PDF 를 넣으면 끝나지 않는 막대만 보였어요(QA 11바퀴). 걷어낸 뒤에 까닭을 띄워요
    } catch (e) { if (g === loadGen) { reset(); prog.hide(); err.show(errMsg(e)); } }
    finally { if (g === loadGen) prog.hide(); }
  }
  function render() {
    const n = items.length;
    grid.replaceChildren(...items.map((it, i) => {
      const box = thumbsByIdx.get(it.idx) as HTMLElement;
      // 같은 페이지 썸네일 박스를 재사용 (복제 시 두 번째부터는 사본)
      box.style.setProperty("--rot", it.rot + "deg");
      const inner = box.firstElementChild;
      if (inner && inner.tagName !== "DIV") (inner as HTMLElement).style.transform = `rotate(${it.rot}deg) scale(${it.rot % 180 ? 0.75 : 1})`;
      return h("div", { class: "thumb", draggable: "true", dataset: { i } },
        it.rot ? h("span", { class: "rot-badge" }, `${it.rot}°`) : null,
        box,
        h("div", { class: "tlabel" }, h("b", {}, `${i + 1}`), h("span", { class: "sr" }, "번째 쪽"), it.idx !== i ? h("span", {}, `원래 ${it.idx + 1}쪽`) : null),
        h("div", { class: "tbtns" },
          iconBtn("rotL", "왼쪽으로 돌리기", rowAction(grid, ".thumb", () => { it.rot = normRotation(it.rot - 90); edit(); return i; })),
          iconBtn("rotR", "오른쪽으로 돌리기", rowAction(grid, ".thumb", () => { it.rot = normRotation(it.rot + 90); edit(); return i; })),
          iconBtn("left", "앞으로", rowAction(grid, ".thumb", () => { items = moveItem(items, i, i - 1); edit(); return i - 1; })),
          iconBtn("right", "뒤로", rowAction(grid, ".thumb", () => { items = moveItem(items, i, i + 1); edit(); return i + 1; })),
          iconBtn("x", "이 쪽 지우기", rowAction(grid, ".thumb", () => { if (items.length === 1) { toast("마지막 한 쪽은 지울 수 없어요"); return null; } items.splice(i, 1); edit(); return i; }), "danger")));
    }));
    grid.querySelectorAll(".thumb").forEach((t, i) => {
      if (i === 0) (t.querySelector('[aria-label="앞으로"]') as HTMLButtonElement).disabled = true;
      if (i === n - 1) (t.querySelector('[aria-label="뒤로"]') as HTMLButtonElement).disabled = true;
    });
    describeRows(grid, ".thumb", ".tlabel");
    const removed = cur ? C().pages - n : 0;
    const rotated = items.filter((x) => x.rot).length;
    const moved = items.some((x, i) => x.idx !== i);
    info.textContent = `${n}쪽` + (removed ? ` · ${removed}쪽 지움` : "") + (rotated ? ` · ${rotated}쪽 돌림` : "") + (moved ? " · 순서 바뀜" : "");
    go.disabled = !(removed || rotated || moved);
    go.textContent = go.disabled ? "바꾼 게 아직 없어요" : "바꾼 대로 저장하기";
  }
  // 썸네일이 늦게 그려지면 회전 다시 적용
  grid.addEventListener("rendered", (e) => {
    const target = e.target as HTMLElement;
    const it = items.find((x) => x.idx === Number(target.dataset.page));
    const c = target.firstElementChild as HTMLElement | null;
    if (it && c) c.style.transform = `rotate(${it.rot}deg) scale(${it.rot % 180 ? 0.75 : 1})`;
  }, true);

  async function run() {
    err.hide(); out.replaceChildren(); go.disabled = true;
    try {
      prog.set(null, "저장하는 중…");
      const buf = C().buf.slice(0);
      const { bytes } = await runPdf<{ bytes: Bytes }>("organize", { buf, items: items.map((x) => ({ idx: x.idx, rot: x.rot })) }, [buf]);
      prog.set(1, "완료!");
      out.replaceChildren(h("div", { class: "result", id: "result" }, h("h2", {}, icon("ok"), `${items.length}쪽짜리 PDF로 저장했어요`), resultItem({ name: outName(C().file.name, "편집", "pdf"), blob: pdfBlob(bytes) })));
      // 저장 단추를 누른 뒤 쪽 목록을 다시 그려 초점이 페이지 맨 앞으로 빠지지 않게 내려받기로(합치기와 같게)
      out.querySelector<HTMLButtonElement>("button.primary")?.focus();
    } catch (e) { err.show(errMsg(e)); }
    finally { prog.hide(); render(); }
  }
  return { unmount: () => cur?.renderer.destroy() };
}

/* ═════════ 4. PDF 용량 줄이기 ═════════ */
export function mountPdfCompress(root: HTMLElement): Mounted {
  let cur: { file: File; buf: ArrayBuffer; pages: number } | null = null;
  const C = () => cur as NonNullable<typeof cur>; // PDF 를 연 뒤에만 불림
  // 방법·정도·목표 용량은 지난번에 고른 값으로 시작해요(prefs.ts)
  let mode: CompressMode = pickPref<CompressMode>(readPref(PREF.pdfMode), ["images", "raster"], "images");
  let level: Level = pickPref<Level>(readPref(PREF.pdfLevel), ["light", "normal", "strong", "fit"], "normal");
  let target: number = parseTargetMb(readPref(PREF.pdfTarget)) ?? 5;
  const err = alertBox();
  const prog = progress();
  const out = h("div");
  const dz = dropzone({ accept: "application/pdf,.pdf", multiple: false, title: "줄일 PDF 하나를 끌어다 놓으세요", sub: "또는 눌러서 고르기", onFiles: (f) => load(f[0]) });
  const fileLine = h("div", { class: "muted", tabindex: "-1" }); // 파일을 넣어 파일 넣는 곳이 숨으면 초점을 여기로(focusIfLost)
  const modeHint = h("div", { class: "hint" });
  const levelHint = h("div", { class: "hint" });
  const modeSeg = seg<CompressMode>([{ value: "images", label: "사진만 줄이기" }, { value: "raster", label: "쪽을 통째로 이미지로" }], mode, (v) => { mode = v; writePref(PREF.pdfMode, v); sync(); });
  const levelSeg = seg<Level>([{ value: "light", label: "조금" }, { value: "normal", label: "보통" }, { value: "strong", label: "많이" }, { value: "fit", label: "용량 맞추기" }], level, (v) => { level = v; writePref(PREF.pdfLevel, v); sync(); });
  // 목표 용량: 자주 막히는 1·2·5·10MB 는 누르기로, 그 밖은 칸에 적어요(벤치마킹 2026-10-22)
  const targetSeg = seg<number>(FIT_TARGETS_MB.map((n) => ({ value: n, label: `${n}MB` })), -1, (v) => setTarget(v));
  targetSeg.setAttribute("aria-label", "목표 용량");
  const targetIn = h("input", { class: "input num", type: "text", inputmode: "decimal", "aria-label": "목표 용량 직접 적기(MB)", placeholder: "직접", autocomplete: "off" }) as HTMLInputElement;
  // 칸에 남는 값 = 쓰는 값(버그 찾기 9차): 예전에는 '7.25'를 적으면 7.3MB로 맞추면서 칸에는 7.25가 남고, '0'·'abc'를 적으면
  // 칸이 '5'가 되면서 5MB 단추도 눌려 있었어요. 적는 동안에는 읽을 수 있는 값만 쓰고, 칸을 떠나면 쓰는 값으로 고쳐 적어요
  targetIn.addEventListener("input", () => { const n = targetMbInput(targetIn.value); if (n !== null) setTarget(n, false); });
  targetIn.addEventListener("change", () => setTarget(targetMbInput(targetIn.value) ?? target));
  const fitBox = h("div", { class: "row fit-row" }, targetSeg, h("span", { class: "fit-own" }, targetIn, h("span", { class: "muted" }, "MB 이하")));
  const go = h("button", { type: "button", class: "btn primary big", onclick: run }, "용량 줄이기");
  const work = h("div", { hidden: true },
    h("div", { class: "panel" },
      h("div", { class: "panel-head" }, fileLine, h("button", { type: "button", class: "btn ghost sm", onclick: () => { reset(); holdTaps(); focusIfLost(dz); } }, "다른 PDF")),
      h("div", { class: "opts" },
        h("div", { class: "opt" }, h("span", { class: "lbl" }, "방법"), modeSeg, modeHint),
        h("div", { class: "opt" }, h("span", { class: "lbl" }, "얼마나 줄일까요?"), levelSeg, fitBox, levelHint))),
    stickyActions(go));
  root.append(dz, err.el, work, prog.el, out);

  function setTarget(n: number, fillInput = true): void {
    target = n; writePref(PREF.pdfTarget, String(n));
    if (fillInput) targetIn.value = (FIT_TARGETS_MB as readonly number[]).includes(n) ? "" : String(n);
    sync();
  }
  function sync() {
    modeHint.textContent = mode === "images"
      ? "글자·링크·책갈피는 그대로 두고 안에 든 사진만 다시 저장해요. 글자만 있는 PDF는 많이 줄지 않아요."
      : "스캔한 서류에 좋아요. 쪽마다 그림으로 다시 그려서 가장 작아지지만, 글자를 고르거나 검색할 수 없고 링크·책갈피·입력 칸이 빠져요.";
    fitBox.hidden = level !== "fit";
    targetSeg.setValue((FIT_TARGETS_MB as readonly number[]).includes(target) ? target : -1);
    if (!(FIT_TARGETS_MB as readonly number[]).includes(target) && document.activeElement !== targetIn) targetIn.value = String(target);
    if (level === "fit") {
      const already = cur && cur.file.size <= mbToBytes(target) ? ` 이 PDF는 이미 ${formatSize(cur.file.size)}라 줄이지 않아도 돼요.` : "";
      levelHint.textContent = (mode === "images"
        ? "여러 정도로 줄여 보고 목표 안에 드는 것 중 가장 선명한 것을 골라요. 사진만 줄여서 안 되면 쪽을 통째로 이미지로 바꿔요."
        : "여러 정도로 줄여 보고 목표 안에 드는 것 중 가장 선명한 것을 골라요.") + already;
    } else levelHint.textContent = presetText(mode, COMPRESS_PRESETS[mode][level]);
    out.replaceChildren();
  }
  let loadGen = 0; // 여는 중에 다른 PDF 를 고르면 늦게 끝난 옛 열기는 버려요
  function reset() {
    loadGen++;
    cur = null; out.replaceChildren(); err.hide();
    work.hidden = true; dz.hidden = false;
  }
  async function load(file: File): Promise<void> {
    err.hide(); out.replaceChildren();
    if (!filterFiles([file], ["pdf"], LIMITS.pdfFile, (m) => err.show(m)).length) return;
    reset();
    const g = loadGen;
    try {
      prog.set(null, "PDF 여는 중…");
      const buf = await file.arrayBuffer();
      const copy = buf.slice(0);
      const { pages } = await runPdf<{ pages: number }>("count", { buf: copy }, [copy]);
      if (g !== loadGen) return;
      cur = { file, buf, pages };
      fileLine.replaceChildren(h("b", { style: "color:var(--ink)" }, file.name), ` · ${pages}쪽 · ${formatSize(file.size)}`);
      dz.hidden = true; work.hidden = false;
      focusIfLost(fileLine);
      sync();
    // reset() 이 loadGen 을 올려서 finally 의 prog.hide() 가 건너뛰어졌어요 — '여는 중…' 막대가 남고, reset() 안의 err.hide() 가
    // 방금 띄운 까닭까지 지워서 깨진 PDF 를 넣으면 끝나지 않는 막대만 보였어요(QA 11바퀴). 걷어낸 뒤에 까닭을 띄워요
    } catch (e) { if (g === loadGen) { reset(); prog.hide(); err.show(errMsg(e)); } }
    finally { if (g === loadGen) prog.hide(); }
  }

  /** 한 번 줄이기. tag 는 진행 표시 앞에 붙는 말('2번째 맞춰 보는 중 · ') */
  async function shrink(m: CompressMode, p: CompressPreset, tag = ""): Promise<{ bytes: Bytes; stats: ShrinkStats | null }> {
    if (m === "images") {
      const buf = C().buf.slice(0);
      prog.set(0, `${tag}PDF 안의 사진을 찾는 중…`);
      return runPdf<{ bytes: Bytes; stats: ShrinkStats }>("compress", { buf, maxSide: p.maxSide, quality: p.quality }, [buf],
        (d, t) => prog.set(d / t * 0.95, `${tag}${d}/${t} 줄이는 중…`));
    }
    const doc = await openPdfjs(C().buf.slice(0));
    const pages: { bytes: Bytes; wPt: number; hPt: number }[] = [];
    try {
      for (let i = 0; i < doc.numPages; i++) {
        prog.set(i / doc.numPages * 0.8, `${tag}${i + 1}/${doc.numPages}쪽 그리는 중…`);
        const r = await renderPdfPage(doc, i, p.dpi);
        const b = await canvasToBlob(r.canvas, "image/jpeg", p.quality);
        r.canvas.width = r.canvas.height = 0;
        pages.push({ bytes: new Uint8Array(await b.arrayBuffer()), wPt: r.wPt, hPt: r.hPt });
      }
    } finally { doc.destroy?.(); }
    const { bytes } = await runPdf<{ bytes: Bytes }>("pages", { pages }, pages.map((x) => x.bytes.buffer), (d, t) => prog.set(0.8 + d / t * 0.15, `${tag}${d}/${t}쪽 묶는 중…`));
    return { bytes, stats: null };
  }

  async function run() {
    err.hide(); out.replaceChildren(); go.disabled = true;
    const before = C().file.size;
    try {
      let bytes: Bytes, stats: ShrinkStats | null = null, usedMode: CompressMode = mode;
      const notes: string[] = [];
      let fitPill: HTMLElement | null = null;
      if (level === "fit") {
        // 사진만 줄이기를 골랐으면 그걸 먼저 다 해 보고, 그래도 넘치면 쪽을 그림으로(글자가 사라지니 결과에 적어요)
        const modes: CompressMode[] = mode === "images" ? ["images", "raster"] : ["raster"];
        const limit = mbToBytes(target);
        const smallest: number[] = modes.map(() => Infinity);
        const r = await fitToSize(modes.map((m) => FIT_STEPS[m]), limit, async (p, g, n) => {
          const res = await shrink(modes[g], p, `${n}번째로 맞춰 보는 중 · `);
          smallest[g] = Math.min(smallest[g], res.bytes.byteLength);
          return { size: res.bytes.byteLength, out: res };
        });
        ({ bytes, stats } = r.out); usedMode = modes[r.group];
        const goal = `${fmtMb(target)} 이하`;
        fitPill = h("span", { class: `pill ${r.fits ? "good" : "bad"}` }, r.fits ? `${goal} 맞춤` : `${goal}로 못 줄였어요`);
        if (usedMode !== mode) notes.push(`사진만 줄여서는 ${formatSize(smallest[0])}까지라 쪽을 통째로 이미지로 바꿨어요.${overButLooksUnder(smallest[0], limit, 2)} 글자를 고르거나 검색할 수 없어요.`);
        // 사진이 없는 PDF 는 '사진 긴 변 2400px · 화질 82%'로 저장했다고 적으면 엉뚱해요(아래에 '사진이 없어요'가 붙어요)
        const noPhotos = usedMode === "images" && !!r.out.stats && !r.out.stats.recompressed;
        if (r.fits) notes.push(noPhotos ? `${goal}에 들어요.` : `${goal}에 드는 것 중 가장 선명하게 저장했어요(${presetText(usedMode, r.step)}).`);
        else notes.push(`가장 작게 해도 ${formatSize(r.size)}예요.${overButLooksUnder(r.size, limit, 2)} 'PDF 나누기'로 나눠서 보내 보세요.`);
      } else {
        ({ bytes, stats } = await shrink(mode, COMPRESS_PRESETS[mode][level]));
      }
      prog.set(1, "완료!");
      const blob = pdfBlob(bytes);
      const pct = savedPercent(before, blob.size);
      if (stats && usedMode === "images") {
        notes.push(stats.images ? `사진 ${stats.images}장 중 ${stats.recompressed}장을 줄였어요.` : "PDF 안에 사진이 없어요.");
        if (stats.images && !stats.canRecode) notes.push("이 브라우저는 사진을 다시 그릴 수 없어서 사진은 그대로 뒀어요. 크롬·엣지·최신 사파리에서 해 보세요.");
      }
      if (pct < 0) notes.push("원본이 더 작아요. 원본을 그대로 쓰세요.");
      else if (pct < 3 && level !== "fit") notes.push(mode === "images" ? "더 줄일 게 거의 없었어요. 스캔한 서류라면 '쪽을 통째로 이미지로'를 써 보세요." : "더 줄일 게 거의 없었어요. 원본을 그대로 써도 돼요.");
      out.replaceChildren(h("div", { class: "result", id: "result" },
        h("h2", {}, icon("ok"), ...arrowed(`${formatSize(before)} → ${formatSize(blob.size)}`),
          h("span", { class: `pill ${pct > 0 ? "good" : pct < 0 ? "bad" : ""}` }, pct > 0 ? `${pct}% 줄었어요` : pct < 0 ? `${-pct}% 커졌어요` : "거의 그대로"), fitPill),
        notes.length ? h("p", { class: "hint", style: "margin:-4px 0 6px" }, notes.join(" ")) : null,
        resultItem({ name: outName(C().file.name, "줄임", "pdf"), blob, extra: usedMode === "images" ? "글자 그대로" : `${C().pages}쪽 · 이미지 PDF` })));
    } catch (e) { err.show(errMsg(e)); }
    finally { prog.hide(); go.disabled = false; }
  }
  return { unmount: reset };
}
type Level = CompressLevel | "fit";
/** '사진 긴 변 1800px · 화질 72%' / '120dpi · 화질 70%' */
const presetText = (m: CompressMode, p: CompressPreset): string => m === "images" ? `사진 긴 변 ${p.maxSide}px · 화질 ${Math.round(p.quality * 100)}%` : `${p.dpi}dpi · 화질 ${Math.round(p.quality * 100)}%`;
/** 2 → '2MB', 1.5 → '1.5MB' */
const fmtMb = (n: number): string => `${n}MB`;
