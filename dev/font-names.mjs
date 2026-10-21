// 줄인 글꼴의 이름 표(name) 바꾸기 — SIL OFL 의 'Reserved Font Name' 이 있는 글꼴(Pretendard)은
// 고친 판(줄인 판도 고친 판)에 같은 이름을 쓰면 안 돼요. 저작권(0)·상표(7)·만든 이(8~12)·라이선스(13·14)는 그대로 두고
// 이름이 드러나는 칸(1·3·4·6·16·17·21·22·25 와 굵기 이름 256~)만 바꿔요.
// fontTools 없이 sfnt 를 직접 다시 묶어요(표 순서·내용은 그대로, name 만 새로 쓰고 체크섬을 다시 계산).

import fontverter from 'fontverter';
import { readFileSync } from 'node:fs';

const KEEP = new Set([0, 2, 5, 7, 8, 9, 10, 11, 12, 13, 14, 19]);

function decode(platform, raw) {
  return platform === 0 || platform === 3 ? Buffer.from(raw).swap16().toString('utf16le') : Buffer.from(raw).toString('latin1');
}
function encode(platform, s) {
  return platform === 0 || platform === 3 ? Buffer.from(s, 'utf16le').swap16() : Buffer.from(s, 'latin1');
}

function tables(sfnt) {
  const n = sfnt.readUInt16BE(4);
  const out = [];
  for (let i = 0; i < n; i++) {
    const o = 12 + i * 16;
    const off = sfnt.readUInt32BE(o + 8), len = sfnt.readUInt32BE(o + 12);
    out.push({ tag: sfnt.toString('latin1', o, o + 4), data: sfnt.subarray(off, off + len) });
  }
  return out;
}

/** sfnt 의 name 표를 { nameID, platformID, string } 목록으로 */
export function readNames(sfnt) {
  const t = tables(sfnt).find((x) => x.tag === 'name').data;
  const count = t.readUInt16BE(2), so = t.readUInt16BE(4);
  const out = [];
  for (let i = 0; i < count; i++) {
    const r = 6 + i * 12;
    const [platformID, encodingID, languageID, nameID, len, off] = [0, 2, 4, 6, 8, 10].map((k) => t.readUInt16BE(r + k));
    out.push({ platformID, encodingID, languageID, nameID, string: decode(platformID, t.subarray(so + off, so + off + len)) });
  }
  return out;
}

/** woff2 파일의 name 표 (시험에서 써요) */
export async function readWoff2Names(path) {
  return readNames(await fontverter.convert(readFileSync(path), 'sfnt'));
}

function checksum(buf) {
  const p = Buffer.alloc(Math.ceil(buf.length / 4) * 4);
  buf.copy(p);
  let s = 0;
  for (let i = 0; i < p.length; i += 4) s = (s + p.readUInt32BE(i)) >>> 0;
  return s;
}

/**
 * name 표에서 KEEP 이 아닌 칸의 글자를 rename(string, nameID) 으로 바꾼 sfnt 를 돌려줘요.
 * @param {Buffer} sfnt
 * @param {(s: string, nameID: number) => string} rename
 */
export function renameFont(sfnt, rename) {
  const recs = readNames(sfnt).map((r) => (KEEP.has(r.nameID) ? r : { ...r, string: rename(r.string, r.nameID) }));
  // 새 name 표(format 0)
  const strings = [];
  let pos = 0;
  const head = Buffer.alloc(6 + recs.length * 12);
  head.writeUInt16BE(0, 0);
  head.writeUInt16BE(recs.length, 2);
  head.writeUInt16BE(head.length, 4);
  recs.forEach((r, i) => {
    const b = encode(r.platformID, r.string);
    const o = 6 + i * 12;
    [r.platformID, r.encodingID, r.languageID, r.nameID, b.length, pos].forEach((v, k) => head.writeUInt16BE(v, o + k * 2));
    strings.push(b);
    pos += b.length;
  });
  const name = Buffer.concat([head, ...strings]);

  const list = tables(sfnt).map((t) => (t.tag === 'name' ? { ...t, data: name } : { ...t, data: Buffer.from(t.data) }));
  const headT = list.find((t) => t.tag === 'head');
  if (headT) headT.data.writeUInt32BE(0, 8); // checkSumAdjustment 는 맨 끝에 다시
  const n = list.length;
  const dir = Buffer.alloc(12 + n * 16);
  sfnt.copy(dir, 0, 0, 12); // sfntVersion·numTables·searchRange… 그대로
  let off = dir.length;
  const body = [];
  list.forEach((t, i) => {
    const o = 12 + i * 16;
    dir.write(t.tag, o, 'latin1');
    dir.writeUInt32BE(checksum(t.data), o + 4);
    dir.writeUInt32BE(off, o + 8);
    dir.writeUInt32BE(t.data.length, o + 12);
    const padded = Buffer.alloc(Math.ceil(t.data.length / 4) * 4);
    t.data.copy(padded);
    body.push(padded);
    off += padded.length;
  });
  const out = Buffer.concat([dir, ...body]);
  if (headT) {
    const headOff = out.readUInt32BE(12 + list.indexOf(headT) * 16 + 8);
    out.writeUInt32BE((0xb1b0afba - checksum(out)) >>> 0, headOff + 8);
  }
  return out;
}
