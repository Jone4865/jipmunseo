// dev/font-chars.mjs 의 타입(시험에서 써요)
export function siteFiles(root?: string): string[];
export function siteChars(root?: string): Set<string>;
export function basicChars(): Set<string>;
export function koreanCommon(): Set<string>;
export function sortChars(set: Set<string>): string;
export function toRange(set: Set<string>): string;
