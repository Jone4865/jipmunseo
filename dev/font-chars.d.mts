// dev/font-chars.mjs 의 타입(시험에서 써요)
export function siteFiles(root?: string): string[];
/** 주석을 뺀 글(문자열 "image/*" 는 그대로) */
export function stripComments(text: string): string;
export function siteChars(root?: string): Set<string>;
export function basicChars(): Set<string>;
export function koreanCommon(): Set<string>;
export function latinMore(): Set<string>;
export const LATIN_MORE_RANGE: string;
/** woff2 파일에 든 글자(코드 포인트) — 시험용 */
export function woff2Chars(file: string | URL): Promise<Set<number>>;
export function sortChars(set: Set<string>): string;
export function toRange(set: Set<string>): string;
