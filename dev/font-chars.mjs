// 줄인 글꼴(JL Sans)에 넣을 글자 모으기 — dev/fonts.mjs(만들기)와 test/fonts.test.ts(빠진 글자 찾기)가 같이 써요.
import { readFileSync, readdirSync } from 'node:fs';
import { join } from 'node:path';

/** 화면에 나오는 글이 든 파일: 페이지 HTML(첫 화면·HWP 보기·처리방침·라이선스·404), 화면 코드(src, 시험·d.ts·한컴 PUA 표 빼고, 워커의 오류 문구도 화면에 나와요), 화면 CSS */
export function siteFiles(root = '.') {
  const out = ['index.html', 'public/hwp.html', 'public/pdf-compress.html', 'public/pdf-merge.html', 'public/privacy.html', 'public/licenses.html', 'public/404.html', 'public/css/style.css'].map((f) => join(root, f));
  for (const n of readdirSync(join(root, 'src'))) if (/\.ts$/.test(n) && !/\.(test|d)\.ts$|^hwp-pua/.test(n)) out.push(join(root, 'src', n));
  return out.sort();
}

/**
 * 주석(// …, /* … *\/, <!-- … -->)은 빼고 남은 글.
 * 막는 주석은 줄 처음·빈칸·괄호·구두점 뒤의 '/*' 만 봐요 — 예전에는 문자열 "image/*" 의 '/*' 부터 다음 '*\/' 까지를 주석으로 지워서
 * 신분증 가리기의 '빨강·파랑'·'좌표'·'덮어'·'밑에' 등과 배경 지우기의 '흰' 10자가 첫 글꼴에서 빠졌어요. 그 도구를 열면 한글 더 파일(370KB)을
 * 받고, 받기 전·인터넷 없을 때는 그 글자만 기기 글꼴로 튀었어요(버그 찾기 14차)
 */
export function stripComments(text) {
  return text
    .replace(/(^|[\s;{}(),])\/\*[\s\S]*?\*\//g, '$1')
    .replace(/<!--[\s\S]*?-->/g, '')
    .split('\n')
    .map((l) => l.replace(/(^|\s)\/\/\s.*$/, '$1'))
    .join('\n');
}

/** 화면 문구·데이터에 실제 쓰이는 ASCII 밖 글자 */
export function siteChars(root = '.') {
  const set = new Set();
  for (const f of siteFiles(root)) {
    const text = readFileSync(f, 'utf8');
    for (const ch of f.endsWith('.json') ? text : stripComments(text)) if (ch.codePointAt(0) > 0x7e && ch.trim()) set.add(ch);
  }
  return set;
}

/** 영문·숫자·기호(ASCII 보이는 글자 전부) + 자주 쓰는 문장 부호 + 줄바꿈 없는 칸(U+A0, 용량 '1.39 KB' 사이 — formatSize) */
export function basicChars() {
  let s = '\u00a0';
  for (let c = 0x20; c <= 0x7e; c++) s += String.fromCharCode(c);
  return new Set(s + ' ·…‘’“”–—→←↑↓×✓•「」『』《》〈〉％～￦°');
}

/**
 * 악센트 붙은 로마자(Latin-1 보충 U+A1~FF · 라틴 확장 A U+100~17F: é·ë·ü·ñ·ł…) — 파일 이름 'Café Zoë.pdf'·워터마크 제출처에 적으면
 * 그 글자만 기기 글꼴(맥은 Helvetica)로 그려져 굵은 파일 이름에서 혼자 가늘게 튀었어요(버그 찾기 8차). 원본(Pretendard)에 있는 글자라
 * 한글 더 파일(jl-sans-ko)에 같이 넣고, 그 글자가 나올 때만 받아요(LATIN_MORE_RANGE).
 */
export function latinMore() {
  const set = new Set();
  for (let c = 0xa1; c <= 0x17f; c++) set.add(String.fromCharCode(c));
  return set;
}
export const LATIN_MORE_RANGE = 'U+A1-17F';

/** 한글 자주 쓰는 글자(KS X 1001 완성형 2,350자) + 한글 자모 — 사용자가 넣는 파일 이름·워터마크 글자용(그 글자가 나올 때만 받는 파일) */
export function koreanCommon() {
  const set = new Set();
  const dec = new TextDecoder('euc-kr');
  for (let hi = 0xb0; hi <= 0xc8; hi++) {
    for (let lo = 0xa1; lo <= 0xfe; lo++) {
      const ch = dec.decode(new Uint8Array([hi, lo]));
      if (ch >= '가' && ch <= '힣') set.add(ch);
    }
  }
  for (let c = 0x3131; c <= 0x318e; c++) set.add(String.fromCharCode(c));
  return set;
}

export const sortChars = (set) => [...set].sort((a, b) => a.codePointAt(0) - b.codePointAt(0)).join('');

/** 글자 목록 → CSS unicode-range (붙은 번호는 묶어요) */
export function toRange(set) {
  const cps = [...set].map((c) => c.codePointAt(0)).sort((a, b) => a - b);
  const out = [];
  const hex = (n) => n.toString(16).toUpperCase();
  for (let i = 0; i < cps.length; ) {
    let j = i;
    while (j + 1 < cps.length && cps[j + 1] === cps[j] + 1) j++;
    out.push(i === j ? `U+${hex(cps[i])}` : `U+${hex(cps[i])}-${hex(cps[j])}`);
    i = j + 1;
  }
  return out.join(',');
}

/** woff2 파일에 든 글자(코드 포인트) — 시험(test/bug8.test.ts)이 한글 더 파일에 악센트 로마자가 들었는지 봐요 */
export async function woff2Chars(file) {
  const { default: fontverter } = await import('fontverter');
  const { default: fontkit } = await import('@pdf-lib/fontkit');
  const sfnt = Buffer.from(await fontverter.convert(readFileSync(file), 'sfnt'));
  return new Set(fontkit.create(sfnt).characterSet);
}
