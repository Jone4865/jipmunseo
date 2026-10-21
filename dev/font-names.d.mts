// dev/font-names.mjs 의 타입(시험에서 써요)
export interface NameRecord { platformID: number; encodingID: number; languageID: number; nameID: number; string: string }
export function readNames(sfnt: Buffer): NameRecord[];
export function readWoff2Names(path: string): Promise<NameRecord[]>;
export function renameFont(sfnt: Buffer, rename: (s: string, nameID: number) => string): Buffer;
