// 집문서 /test — 디자인 비교용 첫 화면의 작은 코드.
// '파일 고르기'·떨어뜨리기는 /hwp 안내 페이지와 같은 방식으로 고른 파일을 첫 화면 도구로 넘겨요(src/handoff.ts 와 같은 저장소·표시 이름).
// 코드가 못 돌면 링크(/)가 그대로 일해요.
const root = document.documentElement;
root.classList.add("js");

/* ── 작업대가 화면에 들어오면 서류를 차례로 놓아요 ── */
const bench = document.querySelector(".bench");
let i = 0;
for (const el of document.querySelectorAll(".bench-head > *, .sheet, .memo")) el.style.setProperty("--i", String(Math.min(i++, 12)));
if ("IntersectionObserver" in window && bench) {
  const io = new IntersectionObserver((es) => { if (es.some((e) => e.isIntersecting)) { bench.classList.add("in"); io.disconnect(); } }, { rootMargin: "0px 0px -12% 0px" });
  io.observe(bench);
} else bench?.classList.add("in");
// 주소의 #tools 로 바로 왔을 때도 보이게
if (location.hash === "#tools") bench?.classList.add("in");

/* ── 가진 파일로 도구 고르기 (첫 화면에 파일을 놓았을 때 권하는 도구와 같은 묶음, src/lib.ts toolsForFiles) ── */
const filter = document.getElementById("filter");
const sheets = document.getElementById("sheets");
const say = document.getElementById("filter-say");
const NAMES = { hwp: "한글 문서", pdf: "PDF", img: "사진" };
if (filter && sheets) {
  filter.hidden = false;
  filter.addEventListener("click", (e) => {
    const b = e.target instanceof Element ? e.target.closest("button[data-kind]") : null;
    if (!b) return;
    const kind = b.dataset.kind;
    for (const x of filter.querySelectorAll("button")) x.setAttribute("aria-pressed", String(x === b));
    let n = 0;
    for (const s of sheets.querySelectorAll(".sheet")) {
      const on = kind === "all" || (s.dataset.kind || "").split(" ").includes(kind);
      s.classList.toggle("off", !on);
      if (on) n++;
    }
    if (kind === "all") { sheets.removeAttribute("data-kind"); say.textContent = ""; }
    else { sheets.dataset.kind = kind; say.textContent = `${NAMES[kind]}로 쓸 수 있는 도구 ${n}개`; }
  });
}

/* ── 파일 고르기 → 첫 화면 도구로 넘기기 ── */
const DB = "jms-handoff", FLAG = "jms.handoff";
const toast = (msg) => {
  const t = document.getElementById("toast");
  if (!t) return;
  t.textContent = msg; t.classList.add("on");
  clearTimeout(toast.t); toast.t = setTimeout(() => t.classList.remove("on"), 3200);
};
function target(files) {
  return files.length === 1 && /\.hwpx?$/i.test(files[0].name) ? { tool: "hwp-view", url: "/#hwp-view" } : { tool: "", url: "/" };
}
function put(tool, files) {
  return new Promise((res) => {
    try {
      const r = indexedDB.open(DB, 1);
      r.onupgradeneeded = () => r.result.createObjectStore("files");
      r.onerror = r.onblocked = () => res(false);
      r.onsuccess = () => {
        const db = r.result;
        const t = db.transaction("files", "readwrite");
        t.objectStore("files").put({ at: Date.now(), tool, files }, "pick");
        t.oncomplete = () => { db.close(); try { sessionStorage.setItem(FLAG, "1"); } catch {} res(true); };
        t.onerror = t.onabort = () => { db.close(); res(false); };
      };
    } catch { res(false); }
  });
}
async function go(files) {
  if (!files.length) return;
  const { tool, url } = target(files);
  root.classList.add("hw-going");
  const ok = await put(tool, files);
  if (ok) { location.href = url; return; }
  const k = url.indexOf("#");
  location.href = k < 0 ? `${url}?handoff=0` : `${url.slice(0, k)}?handoff=0${url.slice(k)}`;
}
const input = document.createElement("input");
input.type = "file";
input.accept = ".hwp,.hwpx,application/pdf,.pdf,image/*,.heic,.heif";
input.multiple = true;
input.hidden = true;
input.tabIndex = -1;
input.setAttribute("aria-hidden", "true");
input.addEventListener("change", () => { const fs = [...(input.files || [])]; input.value = ""; void go(fs); });
document.body.append(input);
for (const a of document.querySelectorAll("a[data-pick]")) {
  a.setAttribute("role", "button");
  a.addEventListener("click", (e) => {
    if (e.ctrlKey || e.metaKey || e.shiftKey || e.button !== 0) return;
    e.preventDefault();
    input.click();
  });
  a.addEventListener("keydown", (e) => { if (e.key === " ") { e.preventDefault(); input.click(); } });
}
const hasFiles = (e) => [...(e.dataTransfer?.types || [])].includes("Files");
addEventListener("dragover", (e) => { if (hasFiles(e)) { e.preventDefault(); e.dataTransfer.dropEffect = "copy"; } });
addEventListener("drop", (e) => {
  if (!hasFiles(e)) return;
  e.preventDefault();
  const fs = [...e.dataTransfer.files];
  if (!fs.length) { toast("파일을 읽지 못했어요. ‘파일 고르기’로 다시 골라 주세요"); return; }
  void go(fs);
});
addEventListener("pageshow", () => root.classList.remove("hw-going"));
