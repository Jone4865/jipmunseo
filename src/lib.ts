// 집문서 — 순수 함수 모음 (DOM 없음, vitest 로 테스트)

export type FileKind = "pdf" | "heic" | "image" | "other";
export type PageSize = "a4" | "original";
export interface ImageLayout { pageW: number; pageH: number; x: number; y: number; w: number; h: number }

/**
 * "1-3, 5, 8-10" 같은 페이지 범위를 해석해요.
 * 반환: 그룹 배열. 각 그룹은 0부터 시작하는 페이지 번호 배열.
 * 예) parseRanges("1-3, 5", 10) → [[0,1,2],[4]]
 * 잘못된 입력은 한국어 메시지와 함께 Error 를 던져요.
 */
export function parseRanges(input: unknown, pageCount: number): number[][] {
  const text = String(input ?? "")
    .normalize("NFKC") // 전각 숫자·기호(５, －)도 받아요
    .replace(/[～〜~–—−]/g, "-")
    .replace(/[，、;]/g, ",")
    .trim();
  if (!text) throw new Error("페이지 범위를 입력해 주세요. 예) 1-3, 5");
  if (!Number.isInteger(pageCount) || pageCount < 1) throw new Error("페이지가 없어요.");
  const groups: number[][] = [];
  for (const raw of text.split(",")) {
    const part = raw.replace(/\s+/g, "");
    if (!part) continue;
    let m: RegExpExecArray | null;
    if ((m = /^(\d+)$/.exec(part))) {
      const n = Number(m[1]);
      checkPage(n, pageCount, part);
      groups.push([n - 1]);
    } else if ((m = /^(\d*)-(\d*)$/.exec(part)) && (m[1] || m[2])) {
      const a = m[1] ? Number(m[1]) : 1;
      const b = m[2] ? Number(m[2]) : pageCount;
      checkPage(a, pageCount, part);
      checkPage(b, pageCount, part);
      const g: number[] = [];
      if (a <= b) for (let i = a; i <= b; i++) g.push(i - 1);
      else for (let i = a; i >= b; i--) g.push(i - 1);
      groups.push(g);
    } else {
      // '을(를)' 대신 다른 안내('"0" — 페이지는 …')와 같은 꼴로
      throw new Error(`"${raw.trim()}" — 쪽 번호로 읽지 못했어요. 예) 1-3, 5, 8-10`);
    }
  }
  if (!groups.length) throw new Error("페이지 범위를 입력해 주세요. 예) 1-3, 5");
  return groups;
}

function checkPage(n: number, max: number, part: string): void {
  if (n < 1 || n > max) throw new Error(`"${part}" — 페이지는 1부터 ${max}까지 있어요.`);
}

/** 그룹들을 합쳐 중복 없이 순서대로 정렬한 페이지 집합 */
export function rangesToSet(groups: number[][]): number[] {
  return [...new Set(groups.flat())].sort((a, b) => a - b);
}

/** 0부터 시작하는 인덱스 배열을 "1-3, 5" 형태로 */
export function formatRanges(indices: number[]): string {
  const s = [...new Set(indices)].sort((a, b) => a - b);
  const out: string[] = [];
  for (let i = 0; i < s.length; i++) {
    let j = i;
    while (j + 1 < s.length && s[j + 1] === s[j] + 1) j++;
    out.push(i === j ? `${s[i] + 1}` : `${s[i] + 1}-${s[j] + 1}`);
    i = j;
  }
  return out.join(", ");
}

/** 바이트 → "1.2 MB" */
export function formatSize(bytes: number): string {
  if (!Number.isFinite(bytes) || bytes < 0) return "-";
  if (bytes < 1024) return `${bytes} B`;
  const units = ["KB", "MB", "GB"];
  let v = bytes / 1024;
  let u = 0;
  while (v >= 1024 && u < units.length - 1) { v /= 1024; u++; }
  return `${v >= 100 ? Math.round(v) : v >= 10 ? v.toFixed(1).replace(/\.0$/, "") : v.toFixed(2).replace(/\.?0+$/, "")} ${units[u]}`;
}

/**
 * 줄어든 비율(%) — 커지면 음수. 줄었으면 내림이라 다 줄지 않았는데 '100% 줄었어요'가 되지 않고,
 * 조금이라도 커졌으면 -1 이하라 '0% 줄었어요'(반올림한 -0)로 보이지 않아요.
 */
export function savedPercent(before: number, after: number): number {
  if (!before || after === before) return 0;
  const r = (1 - after / before) * 100;
  return r > 0 ? Math.floor(r) : -Math.max(1, Math.round(-r));
}

/** "사진.final.JPG" → "사진.final" */
export function baseName(name: unknown): string {
  const n = (String(name ?? "").split(/[\\/]/).pop() as string).trim(); // split 결과는 비지 않아요
  const i = n.lastIndexOf(".");
  const b = i > 0 ? n.slice(0, i) : n;
  return b || "파일";
}

/** 파일 이름에 못 쓰는 글자 정리 */
export function safeName(name: unknown): string {
  return String(name ?? "")
    .replace(/[\u0000-\u001f<>:"/\\|?*]+/g, "_")
    .replace(/\s+/g, " ")
    .replace(/^[.\s]+|[.\s]+$/g, "")
    .slice(0, 120) || "파일";
}

/** 결과 파일 이름: outName("보고서.pdf", "합침", "pdf") → "보고서-합침.pdf" */
export function outName(original: string, suffix: string, ext: string): string {
  const b = safeName(baseName(original));
  return `${b}${suffix ? "-" + suffix : ""}.${ext.replace(/^\./, "")}`;
}

/** 같은 이름이 겹치지 않게 (zip 안 파일들) */
export function uniqueNames(names: string[]): string[] {
  const seen = new Map<string, number>();
  return names.map((n) => {
    const key = n.toLowerCase();
    if (!seen.has(key)) { seen.set(key, 1); return n; }
    const c = (seen.get(key) as number) + 1;
    seen.set(key, c);
    const i = n.lastIndexOf(".");
    const cand = i > 0 ? `${n.slice(0, i)} (${c})${n.slice(i)}` : `${n} (${c})`;
    seen.set(cand.toLowerCase(), 1);
    return cand;
  });
}

/** 배열에서 항목 하나를 옮긴 새 배열 */
export function moveItem<T>(arr: readonly T[], from: number, to: number): T[] {
  const a = arr.slice();
  if (from < 0 || from >= a.length) return a;
  const t = Math.max(0, Math.min(a.length - 1, to));
  const [x] = a.splice(from, 1);
  a.splice(t, 0, x);
  return a;
}

/**
 * 파일 이름 순서(QA 5바퀴). 휴대폰 파일 고르기는 누른 차례대로 넘겨 줘서 '스캔 1~40'이 섞여 들어와요 — 화살표로 맞추려면 수십 번 눌러야 했어요.
 * 숫자는 숫자로 비교해요('스캔 2' 다음 '스캔 10'). 이름이 같으면 넣은 순서 그대로
 */
const nameCollator = new Intl.Collator("ko", { numeric: true, sensitivity: "base" });
export function sortByName<T>(arr: readonly T[], name: (x: T) => string): T[] {
  return arr.map((x, i) => ({ x, i, n: name(x) }))
    .sort((a, b) => nameCollator.compare(a.n, b.n) || a.i - b.i)
    .map((e) => e.x);
}
/** 이미 이름 순서인지 */
export const isSortedByName = <T>(arr: readonly T[], name: (x: T) => string): boolean =>
  arr.every((x, i) => i === 0 || nameCollator.compare(name(arr[i - 1]), name(x)) <= 0);

/** 최대 가로/세로 안에 비율 유지해 맞추기 (확대는 안 함). 0/빈값은 제한 없음 */
export function fitWithin(w: number, h: number, maxW: number, maxH: number): { width: number; height: number; scaled: boolean } {
  let s = 1;
  if (maxW > 0 && w > maxW) s = Math.min(s, maxW / w);
  if (maxH > 0 && h > maxH) s = Math.min(s, maxH / h);
  return { width: Math.max(1, Math.round(w * s)), height: Math.max(1, Math.round(h * s)), scaled: s < 1 };
}

/** 회전 각도 정규화 (0/90/180/270) */
export function normRotation(deg: number): number {
  return (((Math.round(deg / 90) * 90) % 360) + 360) % 360;
}

/** MIME → 확장자 */
export function extFor(mime: string): string {
  return ({ "image/jpeg": "jpg", "image/png": "png", "image/webp": "webp", "image/avif": "avif", "application/pdf": "pdf" } as Record<string, string>)[mime] || "bin";
}

/** 파일 종류 판별 (이름 + MIME) */
export function kindOf(file: { name?: string; type?: string } | null | undefined): FileKind {
  const name = String(file?.name || "").toLowerCase();
  const type = String(file?.type || "").toLowerCase();
  if (type === "application/pdf" || name.endsWith(".pdf")) return "pdf";
  if (/heic|heif/.test(type) || /\.(heic|heif)$/.test(name)) return "heic";
  if (type.startsWith("image/") || /\.(jpe?g|png|webp|avif|gif|bmp)$/.test(name)) return "image";
  return "other";
}

/**
 * 첫 화면에 파일을 떨어뜨렸을 때 쓸 수 있는 도구(앞에 둔 것이 먼저) — 하나면 바로 열고, 여럿이면 고르게 해요(app.ts).
 * 한 개만 받는 도구(나누기·회전·용량 줄이기·가리기·배경 지우기)는 파일이 하나일 때만. 섞여 있거나 모르는 파일이면 빈 목록
 */
export function toolsForFiles(files: readonly { name?: string; type?: string }[]): string[] {
  if (!files.length) return [];
  if (files.every((f) => /\.hwpx?$/i.test(String(f.name || "")))) return files.length === 1 ? ["hwp-view"] : [];
  const kinds = new Set(files.map((f) => kindOf(f)));
  const one = files.length === 1;
  if (kinds.size === 1 && kinds.has("pdf")) return one ? ["pdf-compress", "pdf-split", "pdf-organize", "id-mask"] : ["pdf-merge"];
  if ([...kinds].every((k) => k === "image" || k === "heic")) return one ? ["img-compress", "img-to-pdf", "id-mask", "bg-remove", "exif-clean"] : ["img-to-pdf", "img-compress", "exif-clean"];
  return [];
}

/** 이미지 → PDF 배치 계산. 단위 pt. pageSize: "a4" | "original", margin pt */
export function layoutImage(imgW: number, imgH: number, pageSize: PageSize, marginPt = 0): ImageLayout {
  if (pageSize === "original") {
    const w = imgW * 0.75, h = imgH * 0.75; // 96dpi 기준 px → pt
    return { pageW: w + marginPt * 2, pageH: h + marginPt * 2, x: marginPt, y: marginPt, w, h };
  }
  const A4 = [595.28, 841.89];
  const landscape = imgW > imgH;
  const pageW = landscape ? A4[1] : A4[0];
  const pageH = landscape ? A4[0] : A4[1];
  const boxW = pageW - marginPt * 2, boxH = pageH - marginPt * 2;
  const s = Math.min(boxW / imgW, boxH / imgH);
  const w = imgW * s, h = imgH * s;
  return { pageW, pageH, x: (pageW - w) / 2, y: (pageH - h) / 2, w, h };
}

/** mm → pt */
export const mmToPt = (mm: number): number => (mm * 72) / 25.4;

/** GPS 좌표 보기 좋게 */
export function formatCoord(lat: number, lon: number): string {
  if (!Number.isFinite(lat) || !Number.isFinite(lon)) return "";
  return `${Math.abs(lat).toFixed(5)}°${lat >= 0 ? "N" : "S"}, ${Math.abs(lon).toFixed(5)}°${lon >= 0 ? "E" : "W"}`;
}

/* ───── PDF 용량 줄이기 ───── */
export type CompressMode = "images" | "raster";
export type CompressLevel = "light" | "normal" | "strong";
export interface CompressPreset { maxSide: number; dpi: number; quality: number }
/** images: 글자는 그대로 두고 안의 사진만 다시 저장 (긴 변 maxSide px) · raster: 쪽마다 dpi 로 그려 JPEG 로 */
export const COMPRESS_PRESETS: Record<CompressMode, Record<CompressLevel, CompressPreset>> = {
  images: {
    light: { maxSide: 2400, dpi: 0, quality: 0.82 },
    normal: { maxSide: 1800, dpi: 0, quality: 0.72 },
    strong: { maxSide: 1200, dpi: 0, quality: 0.6 },
  },
  raster: {
    light: { maxSide: 0, dpi: 150, quality: 0.8 },
    normal: { maxSide: 0, dpi: 120, quality: 0.7 },
    strong: { maxSide: 0, dpi: 96, quality: 0.6 },
  },
};

/** 긴 변이 maxSide 를 넘지 않게 (확대는 안 함, 0 이면 그대로) */
export function scaleToMaxSide(w: number, h: number, maxSide: number): { width: number; height: number; scale: number } {
  const long = Math.max(w, h);
  const s = maxSide > 0 && long > maxSide ? maxSide / long : 1;
  return { width: Math.max(1, Math.round(w * s)), height: Math.max(1, Math.round(h * s)), scale: s };
}

/**
 * PDF FlateDecode 이미지의 PNG 예측(Predictor 10~15) 풀기. 8비트 성분만.
 * 줄마다 [필터 1바이트 + columns*colors 바이트]. 길이가 안 맞거나 모르는 필터면 null.
 */
export function pngUnpredict(data: Uint8Array, columns: number, colors: number): Uint8Array<ArrayBuffer> | null {
  const bpp = colors, rowLen = columns * colors, stride = rowLen + 1;
  if (!(columns > 0 && colors > 0) || data.length < stride) return null;
  const rowsN = Math.floor(data.length / stride);
  const out = new Uint8Array(rowsN * rowLen);
  for (let r = 0; r < rowsN; r++) {
    const f = data[r * stride], src = r * stride + 1, dst = r * rowLen, up = dst - rowLen;
    for (let i = 0; i < rowLen; i++) {
      const x = data[src + i];
      const a = i >= bpp ? out[dst + i - bpp] : 0;
      const b = r > 0 ? out[up + i] : 0;
      const c = r > 0 && i >= bpp ? out[up + i - bpp] : 0;
      let v: number;
      if (f === 0) v = x;
      else if (f === 1) v = x + a;
      else if (f === 2) v = x + b;
      else if (f === 3) v = x + ((a + b) >> 1);
      else if (f === 4) {
        const p = a + b - c, pa = Math.abs(p - a), pb = Math.abs(p - b), pc = Math.abs(p - c);
        v = x + (pa <= pb && pa <= pc ? a : pb <= pc ? b : c);
      } else return null;
      out[dst + i] = v & 255;
    }
  }
  return out;
}

/* ───── 서류 사본 가리기 · 워터마크 ───── */
/** 한국 시간 날짜 "2026.10.13" */
export function kstDateLabel(nowMs: number = Date.now()): string {
  const d = new Date(nowMs + 9 * 3600_000);
  return `${d.getUTCFullYear()}.${String(d.getUTCMonth() + 1).padStart(2, "0")}.${String(d.getUTCDate()).padStart(2, "0")}`;
}

/** 워터마크 줄: "OO은행 제출용" (+ 날짜) (+ 다른 용도 사용 금지) */
export function watermarkLines({ to, date, forbid }: { to?: unknown; date?: string | null; forbid?: boolean }): string[] {
  const t = String(to ?? "").replace(/\s+/g, " ").replace(/[\u0000-\u001f]/g, "").trim().slice(0, 30);
  const lines = [!t ? "제출용" : /제출\s*용$/.test(t) ? t : `${t} 제출용`];
  if (date) lines.push(date);
  if (forbid) lines.push("다른 용도 사용 금지");
  return lines;
}

export type WatermarkSize = "s" | "m" | "l";
/** 워터마크 글자 크기(px)·줄 간격·각도. 이미지 넓이(√(가로×세로))에 맞춰요 */
export function watermarkMetrics(w: number, h: number, size: WatermarkSize): { fontPx: number; lineGap: number; angle: number } {
  const k = size === "s" ? 0.028 : size === "l" ? 0.055 : 0.04;
  const fontPx = Math.max(14, Math.round(Math.sqrt(Math.max(1, w * h)) * k));
  return { fontPx, lineGap: Math.round(fontPx * 1.3), angle: -30 };
}

export interface Rect { x: number; y: number; w: number; h: number }
/** 끌어서 그린 네모를 이미지 안으로 자르고 정리. 한 변이 min px 보다 작으면 null */
export function normRect(x0: number, y0: number, x1: number, y1: number, W: number, H: number, min = 4): Rect | null {
  const cl = (v: number, m: number) => Math.max(0, Math.min(m, v));
  const ax = cl(Math.min(x0, x1), W), bx = cl(Math.max(x0, x1), W);
  const ay = cl(Math.min(y0, y1), H), by = cl(Math.max(y0, y1), H);
  if (bx - ax < min || by - ay < min) return null;
  return { x: Math.round(ax), y: Math.round(ay), w: Math.round(bx - ax), h: Math.round(by - ay) };
}

/** 점이 들어 있는 맨 위(마지막) 네모의 번호, 없으면 -1 */
export function rectAt(rects: readonly Rect[], x: number, y: number): number {
  for (let i = rects.length - 1; i >= 0; i--) {
    const r = rects[i];
    if (x >= r.x && x <= r.x + r.w && y >= r.y && y <= r.y + r.h) return i;
  }
  return -1;
}

/* ───── ZIP 을 한 파일씩 이어 붙이기 (fflate 0.8.2 스트리밍 Zip + ZipPassThrough, 압축 없음) ───── */
/** fflate 의 스트리밍 Zip 중 쓰는 모양만 */
export interface FflateZipEntry { push(chunk: Uint8Array, final?: boolean): void }
export interface FflateStreamModule {
  Zip: new (cb: (err: Error | null, chunk: Uint8Array, final: boolean) => void) => { add(f: FflateZipEntry): void; end(): void; terminate(): void };
  ZipPassThrough: new (name: string) => FflateZipEntry;
}
export interface ZipWriter {
  /** 파일 하나를 넣어요. 바이트는 이 자리에서 Blob 조각으로 넘기고 들고 있지 않아요 */
  add(name: string, data: Uint8Array): void;
  /** 끝을 써서 ZIP Blob 하나로 */
  finish(): Blob;
  /** 그만둬요(모은 조각을 버려요) */
  abort(): void;
  readonly count: number;
}
/**
 * 파일을 넣는 대로 ZIP 조각을 Blob 으로 넘겨요. 모든 파일을 배열로 모았다가 한꺼번에 묶으면 결과의 3~4배가 메모리에 같이 있게 돼서,
 * 쪽 그림처럼 큰 파일 여러 개를 묶을 때 써요. PNG·JPEG 는 이미 압축돼 있어서 그대로 넣어요(ZipPassThrough).
 * 한글 이름은 fflate 가 UTF-8 표시(일반 목적 플래그 bit 11)를 켜요.
 */
export function zipWriter(ff: FflateStreamModule, type = "application/zip"): ZipWriter {
  let parts: Blob[] = [];
  let pending: Uint8Array[] = [];
  let failed: Error | null = null;
  let count = 0;
  const z = new ff.Zip((err, chunk) => { if (err) failed = err; else if (chunk) pending.push(chunk); });
  const flush = () => { if (pending.length) { parts.push(new Blob(pending as BlobPart[])); pending = []; } };
  const check = () => { if (failed) throw new Error("ZIP을 만들지 못했어요."); };
  return {
    add(name, data) {
      check();
      const f = new ff.ZipPassThrough(name);
      z.add(f);
      f.push(data, true);
      check();
      count++;
      flush();
    },
    finish() {
      z.end();
      check();
      flush();
      const out = new Blob(parts, { type });
      parts = [];
      return out;
    },
    abort() {
      try { z.terminate(); } catch { /* 이미 끝났어요 */ }
      parts = []; pending = [];
    },
    get count() { return count; },
  };
}
/** ZIP 안에서 이름이 겹치지 않게: 같은 이름이 있으면 '이름-2.확장자', '이름-3.확장자' … (used 에 넣어 둬요) */
export function uniqueName(name: string, used: Set<string>): string {
  let out = name;
  if (used.has(out)) {
    const dot = name.lastIndexOf(".");
    const [base, ext] = dot > 0 ? [name.slice(0, dot), name.slice(dot)] : [name, ""];
    for (let i = 2; used.has(out); i++) out = `${base}-${i}${ext}`;
  }
  used.add(out);
  return out;
}

/** 화면 읽기용 결과 문장: '2.1 MB → 1.0 MB, 52% 줄었어요' → '2.1 MB에서 1.0 MB로, 52% 줄었어요'(화살표는 '오른쪽 화살표'로 읽혀서) */
export function sayArrows(text: string): string {
  return text.replace(/\s+/g, " ").trim().replace(/\s*→\s*([^,→]+?)\s*(?=,|$)/g, "에서 $1로");
}
