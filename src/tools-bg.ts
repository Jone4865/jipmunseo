// 6. 사진 배경 지우기 — @imgly/background-removal (기기 안에서 AI 실행)
import { h, icon, dropzone, progress, alertBox, errMsg, resultItem, seg, filterFiles, LIMITS, decodeImage, drawToCanvas, canvasToBlob } from "./ui.js";
import { formatSize, outName } from "./lib.js";
import { vendorImport, type BgRemovalModule } from "./vendor.js";
import type { Mounted } from "./app.js";

// 모델·런타임은 IMG.LY CDN 에서 받아요 (CSP connect-src 에 이 주소만 허용)
export const BG_PUBLIC_PATH = "https://staticimgly.com/@imgly/background-removal-data/1.7.0/dist/";
export const BG_MODEL = "isnet_quint8";
export const BG_DOWNLOAD_MB = 56; // 모델 44.3MB + ONNX 런타임 11.8MB

let libP: Promise<BgRemovalModule> | null = null;
const loadLib = () => (libP ||= vendorImport<BgRemovalModule>("/vendor/bg-removal-1.7.0-csp.mjs").catch((e) => { libP = null; throw new Error("배경 지우기 도구를 불러오지 못했어요. 새로고침 후 다시 해 주세요."); }));

export function mountBg(root: HTMLElement): Mounted {
  let file: { name: string; size: number; blob: Blob } | null = null, srcURL: string | null = null, outBlob: Blob | null = null, outURL: string | null = null, bgMode = "transparent", bgColor = "#ffffff";
  const err = alertBox();
  const prog = progress();
  const out = h("div");
  const dz = dropzone({ accept: "image/*,.heic,.heif", multiple: false, title: "배경을 지울 사진을 끌어다 놓으세요", sub: "JPG · PNG · WebP · HEIC · 눌러서 고르기 · 붙여넣기도 돼요", onFiles: (f) => pick(f[0]) });
  const note = h("div", { class: "alert info" },
    `처음 한 번 AI 모델(약 ${BG_DOWNLOAD_MB}MB)을 받아요. 휴대폰 데이터라면 와이파이에서 하는 게 좋아요. 두 번째부터는 받아 둔 모델로 바로 지워요.`);
  const before = h("div", { class: "bg-view" });
  const after = h("div", { class: "bg-view checker" });
  const color = h("input", { type: "color", class: "color", value: bgColor, "aria-label": "배경색" });
  color.addEventListener("input", () => { bgColor = color.value; bgSeg.setValue("color"); bgMode = "color"; paint(); });
  const bgSeg = seg([{ value: "transparent", label: "투명" }, { value: "white", label: "흰색" }, { value: "color", label: "다른 색" }], bgMode, (v) => { bgMode = v; paint(); });
  const go = h("button", { type: "button", class: "btn primary big", onclick: run }, "배경 지우기");
  const work = h("div", { hidden: true },
    h("div", { class: "panel" },
      h("div", { class: "panel-head" }, h("div", { class: "muted", id: "bg-file" }), h("button", { type: "button", class: "btn ghost sm", onclick: reset }, "다른 사진")),
      h("div", { class: "bg-stage" },
        h("div", { class: "bg-pane" }, h("div", { class: "lbl" }, "원본"), before),
        h("div", { class: "bg-pane" }, h("div", { class: "lbl" }, "결과"), after)),
      h("div", { class: "opts", style: "margin-top:14px" },
        h("div", { class: "opt" }, h("span", { class: "lbl" }, "배경"), h("div", { class: "row" }, bgSeg, color)))),
    h("div", { class: "actions" }, go));
  root.append(note, dz, err.el, work, prog.el, out);

  function reset() {
    if (srcURL) URL.revokeObjectURL(srcURL);
    if (outURL) URL.revokeObjectURL(outURL);
    file = srcURL = outBlob = outURL = null;
    out.replaceChildren(); err.hide(); before.replaceChildren(); after.replaceChildren();
    work.hidden = true; dz.hidden = false;
  }

  async function pick(f: File): Promise<void> {
    err.hide();
    if (!filterFiles([f], ["image", "heic"], LIMITS.bgFile, (m) => err.show(m)).length) return;
    reset();
    try {
      // HEIC 등은 미리 PNG 로 풀어서 넘겨요 (방향도 맞춰서)
      const img = await decodeImage(f);
      const c = drawToCanvas(img, img.width, img.height);
      img.close();
      const blob = await canvasToBlob(c, "image/png");
      c.width = c.height = 0;
      file = { name: f.name, size: f.size, blob };
      srcURL = URL.createObjectURL(blob);
      before.replaceChildren(h("img", { src: srcURL, alt: "원본 사진" }));
      after.replaceChildren(h("span", { class: "muted", style: "font-size:13px" }, "아직 안 지웠어요"));
      (document.getElementById("bg-file") as HTMLElement).replaceChildren(h("b", { style: "color:var(--text)" }, f.name), ` · ${formatSize(f.size)}`);
      dz.hidden = true; work.hidden = false;
      go.disabled = false; go.textContent = "배경 지우기";
    } catch (e) { err.show(errMsg(e)); }
  }

  async function run() {
    err.hide(); out.replaceChildren(); go.disabled = true;
    try {
      prog.set(null, "도구 불러오는 중…");
      const lib = await loadLib();
      const fetched: Record<string, [number, number]> = {};
      const t0 = performance.now();
      const res = await lib.removeBackground((file as { blob: Blob }).blob, { // 사진을 고른 뒤에만 버튼이 보임
        publicPath: BG_PUBLIC_PATH,
        model: BG_MODEL,
        device: "cpu",
        output: { format: "image/png" },
        progress: (key, cur, total) => {
          if (key.startsWith("fetch:")) {
            fetched[key] = [cur, total];
            const c = Object.values(fetched).reduce((a, x) => a + x[0], 0);
            const t = Object.values(fetched).reduce((a, x) => a + x[1], 0);
            prog.set(t ? c / t : null, `모델 받는 중… ${(c / 1048576).toFixed(1)} / ${(t / 1048576).toFixed(1)}MB`);
          } else if (key.startsWith("compute:")) {
            prog.set(null, "사진에서 배경을 찾는 중… (기기 성능에 따라 몇 초~수십 초)");
          }
        },
      });
      outBlob = res;
      if (outURL) URL.revokeObjectURL(outURL);
      outURL = URL.createObjectURL(outBlob);
      prog.set(1, `완료! ${((performance.now() - t0) / 1000).toFixed(1)}초`);
      paint();
    } catch (e) {
      const m = errMsg(e);
      err.show(/fetch|network|Failed to/i.test(m) ? "모델을 받지 못했어요. 인터넷 연결을 확인하고 다시 해 주세요." : /memory|allocation|RangeError/i.test(m) ? "기기 메모리가 부족해요. 더 작은 사진으로 해 주세요." : `배경을 지우지 못했어요. (${m})`);
    } finally { setTimeout(() => prog.hide(), 900); go.disabled = false; go.textContent = "다시 지우기"; }
  }

  async function paint() {
    after.classList.toggle("checker", bgMode === "transparent");
    after.style.background = bgMode === "white" ? "#fff" : bgMode === "color" ? bgColor : "";
    if (!outBlob) return;
    after.replaceChildren(h("img", { src: outURL, alt: "배경을 지운 사진" }));
    const fname = (file as { name: string }).name; // 결과가 있으면 고른 사진도 있음
    let blob = outBlob, name = outName(fname, "배경제거", "png");
    if (bgMode !== "transparent") {
      const img = await decodeImage(outBlob as File); // 원래 JS 처럼 Blob 을 그대로 넘김
      const c = drawToCanvas(img, img.width, img.height, bgMode === "white" ? "#ffffff" : bgColor);
      img.close();
      blob = await canvasToBlob(c, "image/jpeg", 0.95);
      name = outName(fname, "배경바꿈", "jpg");
    }
    out.replaceChildren(h("div", { class: "result", id: "result" }, h("h2", {}, icon("ok"), "배경을 지웠어요"),
      resultItem({ name, blob, extra: bgMode === "transparent" ? "투명 배경 PNG" : "배경색 채운 JPG" })));
  }
  return { onPaste: (fs) => { if (fs[0]) pick(fs[0]); }, unmount: reset };
}
