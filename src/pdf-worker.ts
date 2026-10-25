// PDF 작업 전용 워커 (module worker). 화면이 멈추지 않게 무거운 일은 여기서 해요.
import { PDFDocument, degrees, PDFName, PDFNumber, PDFArray, PDFDict, PDFStream, PDFRawStream, PDFRef } from "vendor:pdf-lib";
import { layoutImage, type PageSize } from "./lib.js";
import { shrinkPdf, type ShrinkCodec, type ShrinkStats } from "./pdf-shrink.js";
import type { PdfLibDocument, PdfLibPage } from "./vendor.js";

type Bytes = Uint8Array<ArrayBuffer>;
type Progress = (done: number, total: number) => void;

async function load(buf: ArrayBuffer): Promise<PdfLibDocument> {
  try {
    const d = await PDFDocument.load(buf, { updateMetadata: false });
    // 머리('%PDF-')만 맞고 몸이 깨진 파일은 load 가 통과하고 쪽 목록을 볼 때 영어 오류("Cannot read properties of undefined
    // (reading 'Pages')")가 그대로 화면에 나왔어요(합치기 줄·용량 줄이기, 버그 찾기 13차) → 여기서 쪽 목록까지 읽어 같은 안내로 바꿔요
    d.getPageCount();
    return d;
  } catch (e) {
    const msg = String(e && (e as Error).message || e);
    if (/encrypt/i.test(msg)) throw new Error("암호가 걸린 PDF예요. 암호를 푼 뒤 다시 넣어 주세요.");
    throw new Error("PDF를 읽지 못했어요. 파일이 깨졌거나 PDF가 아닐 수 있어요.");
  }
}

// 새로 만드는 PDF 에는 제작 도구 이름(Producer·Creator)을 넣지 않아요
const fresh = (): Promise<PdfLibDocument> => PDFDocument.create({ updateMetadata: false });

async function save(doc: PdfLibDocument): Promise<Bytes> {
  return doc.save({ useObjectStreams: true });
}

/* ───── 용량 줄이기용 이미지 코덱 (OffscreenCanvas · 압축 스트림, 모두 이 기기 안에서) ───── */
const canRecode = typeof OffscreenCanvas !== "undefined" && typeof createImageBitmap === "function";
async function streamThrough(bytes: Uint8Array, t: CompressionStream | DecompressionStream): Promise<Uint8Array> {
  const out = new Response(new Blob([bytes as Uint8Array<ArrayBuffer>]).stream().pipeThrough(t));
  return new Uint8Array(await out.arrayBuffer());
}
async function encode(src: CanvasImageSource, w: number, h: number, quality: number): Promise<Uint8Array | null> {
  const c = new OffscreenCanvas(w, h);
  const g = c.getContext("2d");
  if (!g) return null;
  g.imageSmoothingEnabled = true;
  g.imageSmoothingQuality = "high";
  g.drawImage(src, 0, 0, w, h);
  const blob = await c.convertToBlob({ type: "image/jpeg", quality });
  return blob.type === "image/jpeg" ? new Uint8Array(await blob.arrayBuffer()) : null;
}
const codec: ShrinkCodec = {
  canRecode,
  async jpeg(bytes, w, h, outW, outH, quality) {
    const blob = new Blob([bytes as Uint8Array<ArrayBuffer>], { type: "image/jpeg" });
    let bmp: ImageBitmap;
    // PDF 는 사진 속 방향 정보를 무시하므로 그대로(none) 풀어요. 지원 안 하는 브라우저는 기본값으로
    try { bmp = await createImageBitmap(blob, { imageOrientation: "none", colorSpaceConversion: "none" } as ImageBitmapOptions); }
    catch { bmp = await createImageBitmap(blob); }
    try {
      if (bmp.width !== w || bmp.height !== h) return null;
      return await encode(bmp, outW, outH, quality);
    } finally { bmp.close(); }
  },
  async pixels(raw, comps, w, h, outW, outH, quality) {
    const img = new ImageData(w, h);
    const px = img.data;
    for (let i = 0, j = 0; i < w * h; i++, j += 4) {
      if (comps === 3) { px[j] = raw[i * 3]; px[j + 1] = raw[i * 3 + 1]; px[j + 2] = raw[i * 3 + 2]; }
      else { px[j] = px[j + 1] = px[j + 2] = raw[i]; }
      px[j + 3] = 255;
    }
    const bmp = await createImageBitmap(img);
    try { return await encode(bmp, outW, outH, quality); } finally { bmp.close(); }
  },
  inflate: (b) => streamThrough(b, new DecompressionStream("deflate")),
  deflate: (b) => streamThrough(b, new CompressionStream("deflate")),
};
const lib = { PDFName, PDFNumber, PDFArray, PDFDict, PDFStream, PDFRawStream, PDFRef };

const ops = {
  async count({ buf }: { buf: ArrayBuffer }) {
    const d = await load(buf);
    return { pages: d.getPageCount() };
  },

  async merge({ bufs }: { bufs: ArrayBuffer[] }, progress: Progress) {
    const out = await fresh();
    for (let i = 0; i < bufs.length; i++) {
      const src = await load(bufs[i]);
      const pages = await out.copyPages(src, src.getPageIndices());
      pages.forEach((p: PdfLibPage) => out.addPage(p));
      progress(i + 1, bufs.length);
    }
    return { bytes: await save(out) };
  },

  async pick({ buf, pages }: { buf: ArrayBuffer; pages: number[] }) {
    const src = await load(buf);
    const out = await fresh();
    (await out.copyPages(src, pages)).forEach((p) => out.addPage(p));
    return { bytes: await save(out) };
  },

  async split({ buf, groups }: { buf: ArrayBuffer; groups: number[][] }, progress: Progress) {
    const src = await load(buf);
    const files: Bytes[] = [];
    for (let i = 0; i < groups.length; i++) {
      const out = await fresh();
      (await out.copyPages(src, groups[i])).forEach((p) => out.addPage(p));
      files.push(await save(out));
      progress(i + 1, groups.length);
    }
    return { files };
  },

  async organize({ buf, items }: { buf: ArrayBuffer; items: { idx: number; rot: number }[] }) {
    const src = await load(buf);
    const out = await fresh();
    const copied = await out.copyPages(src, items.map((it) => it.idx));
    copied.forEach((p, i) => {
      const extra = items[i].rot || 0;
      if (extra) p.setRotation(degrees((((p.getRotation().angle + extra) % 360) + 360) % 360));
      out.addPage(p);
    });
    return { bytes: await save(out) };
  },

  async images({ images, pageSize, marginPt }: { images: { bytes: Bytes; mime: string; w: number; h: number }[]; pageSize: PageSize; marginPt: number }, progress: Progress) {
    const out = await fresh();
    for (let i = 0; i < images.length; i++) {
      const im = images[i];
      const emb = im.mime === "image/png" ? await out.embedPng(im.bytes) : await out.embedJpg(im.bytes);
      const L = layoutImage(im.w, im.h, pageSize, marginPt);
      const page = out.addPage([L.pageW, L.pageH]);
      page.drawImage(emb, { x: L.x, y: L.y, width: L.w, height: L.h });
      progress(i + 1, images.length);
    }
    return { bytes: await save(out) };
  },

  /** 쪽마다 그린 JPEG 를 원래 쪽 크기(pt) 그대로 한 장씩 (용량 줄이기 '통째로 이미지로', 사본 가리기) */
  async pages({ pages }: { pages: { bytes: Bytes; wPt: number; hPt: number }[] }, progress: Progress) {
    const out = await fresh();
    for (let i = 0; i < pages.length; i++) {
      const p = pages[i];
      const emb = await out.embedJpg(p.bytes);
      out.addPage([p.wPt, p.hPt]).drawImage(emb, { x: 0, y: 0, width: p.wPt, height: p.hPt });
      progress(i + 1, pages.length);
    }
    return { bytes: await save(out) };
  },

  /** 글자는 그대로, 안의 사진만 다시 저장 */
  async compress({ buf, maxSide, quality }: { buf: ArrayBuffer; maxSide: number; quality: number }, progress: Progress) {
    const doc = await load(buf);
    const stats: ShrinkStats = await shrinkPdf(lib, doc, { maxSide, quality }, codec, progress);
    return { bytes: await save(doc), stats };
  },
};

/** 작업 이름 → 함수. 인자 모양은 화면 쪽(runPdf 부르는 곳)이 맞춰 보냄 */
type Op = (args: never, progress: Progress) => Promise<{ bytes?: Bytes; files?: Bytes[]; pages?: number; stats?: ShrinkStats }>;
self.onmessage = async (ev: MessageEvent<{ id: number; op: string; args: unknown }>) => {
  const { id, op, args } = ev.data;
  const progress: Progress = (done, total) => self.postMessage({ id, type: "progress", done, total });
  try {
    const result = await (ops as Record<string, Op>)[op](args as never, progress);
    const transfer: Transferable[] = [];
    if (result.bytes) transfer.push(result.bytes.buffer);
    if (result.files) result.files.forEach((f) => transfer.push(f.buffer));
    self.postMessage({ id, type: "done", result }, transfer);
  } catch (e) {
    self.postMessage({ id, type: "error", message: e && (e as Error).message ? (e as Error).message : String(e) });
  }
};
