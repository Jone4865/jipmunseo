// 이 브라우저에 기억하는 설정(localStorage) — 고른 값과 최근에 연 도구 이름만. 문서 이름·내용은 남기지 않아요.
// 처리방침 '이 브라우저에 기억하는 것'(public/privacy.html)과 맞춰요. 저장이 막힌 브라우저면 기본값으로 동작해요.

export const PREF = {
  hwpDpi: "jms.hwp.dpi", hwpBold: "jms.hwp.bold",
  imgFmt: "jms.img.fmt", imgQuality: "jms.img.q", imgMaxW: "jms.img.maxw", imgMaxH: "jms.img.maxh",
  pdfMode: "jms.pdf.mode", pdfLevel: "jms.pdf.level",
  img2pdfSize: "jms.img2pdf.size", img2pdfMargin: "jms.img2pdf.margin",
  recent: "jms.recent",
} as const;

export function readPref(k: string): string | null { try { return localStorage.getItem(k); } catch { return null; } }
export function writePref(k: string, v: string): void { try { localStorage.setItem(k, v); } catch { /* 기억 못 해도 괜찮아요 */ } }

/** 고를 수 있는 값 중 하나면 그 값, 아니면 기본값 */
export function pickPref<T extends string>(raw: string | null, allowed: readonly T[], dflt: T): T {
  return raw !== null && (allowed as readonly string[]).includes(raw) ? (raw as T) : dflt;
}
/** lo~hi 사이 정수면 그 값, 아니면 기본값 */
export function intPref(raw: string | null, lo: number, hi: number, dflt: number): number {
  const n = raw === null || raw.trim() === "" ? NaN : Number(raw);
  return Number.isInteger(n) && n >= lo && n <= hi ? n : dflt;
}
/** 최대 크기 칸(px): 빈칸이거나 1~20000 정수만 */
export const sizePref = (raw: string | null): string => (raw === "" || raw === null ? "" : String(intPref(raw, 1, 20000, 0) || ""));

/** 최근에 연 도구: 맨 앞에 넣고, 겹치면 앞으로 옮기고, max 개까지 */
export function pushRecent(list: readonly string[], id: string, max = 3): string[] {
  return [id, ...list.filter((x) => x !== id)].slice(0, max);
}
/** 저장된 최근 도구 목록 읽기 — 지금 있는 도구 id 만, 겹치지 않게 */
export function parseRecent(raw: string | null, known: ReadonlySet<string>, max = 3): string[] {
  let arr: unknown;
  try { arr = JSON.parse(raw || "[]"); } catch { return []; }
  if (!Array.isArray(arr)) return [];
  const out: string[] = [];
  for (const x of arr) if (typeof x === "string" && known.has(x) && !out.includes(x)) out.push(x);
  return out.slice(0, max);
}
