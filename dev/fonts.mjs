// 글꼴을 이 사이트에 직접 두기(QA 7바퀴) — public/fonts/*.<해시>.woff2 를 만들고, @font-face 를 public/css/style.css·public/licenses.html 의
// '/* fonts:start */ … /* fonts:end */' 자리에 써요.
// 결과는 커밋해요(빌드 때 돌리지 않아요).   npm run fonts   (화면 문구에 새 글자가 생기면 test/fonts.test.ts 가 알려 줘요)
//
// 예전에는 jsDelivr 의 Pretendard 동적 부분 집합(CSS + 조각 14~15개, 약 430KB)을 받았어요. 느린 망에서 다른 서버 연결과 조각 요청이
// 화면 JS 와 대역을 나눠 써서 글꼴이 다 바뀌기까지 12초쯤 걸렸어요.
// JL Sans — Pretendard 1.3.9 Variable(SIL OFL 1.1)을 줄인 판. Pretendard 는 OFL 'Reserved Font Name' 이 있어서
//   줄인 판(=고친 판)의 이름 표를 'JL Sans' 로 바꿔요(dev/font-names.mjs). 저작권·라이선스 칸은 그대로예요.
//   - jl-sans    : 화면 문구에 쓰이는 글자 + 영문·숫자·기호. 첫 화면은 이것만 받아요.
//   - jl-sans-ko : 그 밖의 한글 자주 쓰는 글자(완성형 2,350자)와 자모, 악센트 로마자(é·ë·ü… U+A1~17F, 버그 찾기 8차). 다른 이름('JL Sans Ko')으로 font-family 다음 순서에 둬서,
//                  사용자가 넣은 파일 이름·워터마크 글자에 첫 파일에 없는 한글이 나올 때만 받아요.
//                  (같은 이름에 범위를 겹치게 두면 Chrome 이 첫 화면에서 그 파일까지 받아요 — SOS수첩에서 확인)
//   그 밖의 드문 글자는 기기 글꼴로 넘어가요(style.css body 의 다음 글꼴).
// 파일 이름에 내용 해시가 붙어서 _headers 가 /fonts/* 를 1년 캐시해요. 서비스 워커는 jl-sans-ko 를 미리 저장하지 않아요(받으면 저장).
import subsetFont from 'subset-font';
import fontverter from 'fontverter';
import fontkit from '@pdf-lib/fontkit';
import { createHash } from 'node:crypto';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { renameFont } from './font-names.mjs';
import { siteChars, basicChars, koreanCommon, latinMore, LATIN_MORE_RANGE, sortChars, toRange } from './font-chars.mjs';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const OUT = path.join(ROOT, 'public/fonts');
/** 저작권·상표·만든 이·라이선스(0~14)와 이름(16·17·25) 칸을 남겨요 — 기본값은 0~6 만 남겨서 OFL 라이선스 칸이 빠져요 */
const KEEP_NAMES = [0, 1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12, 13, 14, 16, 17, 25];
const kb = (n) => `${(n / 1024).toFixed(1)}KB`;
const hashed = (base, buf) => `${base}.${createHash('sha256').update(buf).digest('hex').slice(0, 10)}.woff2`;

// 지난번 결과(이름에 해시가 붙은 파일)는 지우고 새로 써요
fs.mkdirSync(OUT, { recursive: true });
for (const f of fs.readdirSync(OUT)) if (/\.[0-9a-f]{10}\.woff2$/.test(f)) fs.unlinkSync(path.join(OUT, f));
const files = {};
const write = (base, buf) => {
  const name = hashed(base, buf);
  fs.writeFileSync(path.join(OUT, name), buf);
  files[base] = name;
  console.log(`${name} ${kb(buf.length)}`);
};

const pSfnt = Buffer.from(await fontverter.convert(fs.readFileSync(path.join(ROOT, 'node_modules/pretendard/dist/web/variable/woff2/PretendardVariable.woff2')), 'sfnt'));
const has = new Set(fontkit.create(pSfnt).characterSet.map((cp) => String.fromCodePoint(cp)));
const want = new Set([...siteChars(ROOT), ...basicChars()]);
const core = new Set([...want].filter((c) => has.has(c)));
const ko = new Set([...koreanCommon(), ...latinMore()].filter((c) => has.has(c) && !core.has(c)));
/** Pretendard 줄인 판의 이름: Pretendard Variable → JL Sans, PretendardVariable-Bold → JLSans-Bold, 만든 곳 표시(CTUS)도 빼요 */
const toJLSans = (s) =>
  s.replaceAll('PretendardVariable', 'JLSans').replaceAll('Pretendard Variable', 'JL Sans').replaceAll('Pretendard', 'JL Sans').replace(';CTUS;', ';JLAB;');
const jl = async (set) => fontverter.convert(renameFont(Buffer.from(await subsetFont(pSfnt, sortChars(set), { targetFormat: 'sfnt', preserveNameIds: KEEP_NAMES })), toJLSans), 'woff2');
write('jl-sans', Buffer.from(await jl(core)));
write('jl-sans-ko', Buffer.from(await jl(ko)));

// JL Sans 는 Pretendard Variable 의 굵기 축(45~920)을 그대로 둬요. 첫 파일은 unicode-range 를 두지 않아요(화면에 늘 한글이 있어요).
const faces = `/* fonts:start — dev/fonts.mjs 가 써요(손으로 고치지 않아요). JL Sans = Pretendard 1.3.9(OFL 1.1)를 줄인 판(예약 이름 때문에 이름을 바꿨어요) */
@font-face{font-family:"JL Sans";font-style:normal;font-weight:45 920;font-display:swap;src:url(/fonts/${files['jl-sans']}) format("woff2")}
@font-face{font-family:"JL Sans Ko";font-style:normal;font-weight:45 920;font-display:swap;src:url(/fonts/${files['jl-sans-ko']}) format("woff2");unicode-range:${LATIN_MORE_RANGE},U+3131-318E,U+AC00-D7A3}
/* fonts:end */`;
const block = /\/\* fonts:start[\s\S]*?\/\* fonts:end \*\//;
const patch = (rel, fn, expect = files['jl-sans']) => {
  const f = path.join(ROOT, rel);
  const after = fn(fs.readFileSync(f, 'utf8'));
  if (!after.includes(expect)) throw new Error(`${rel} 에서 고칠 자리를 못 찾았어요`);
  fs.writeFileSync(f, after);
};
patch('public/css/style.css', (s) => s.replace(block, faces));
patch('public/licenses.html', (s) => s.replace(block, faces));
// preload 는 두지 않아요 — 느린 3G 흉내(400ms·50KB/s)에서 글꼴을 미리 받게 하면 화면 JS·CSS 와 대역을 나눠서 첫 그림이
// 첫 화면 2.4초 → 3.1초, HWP 화면 1.7초 → 2.4초로 늦어졌고, 글꼴이 바뀌는 때(5.8초·4.3~4.7초)는 거의 같았어요(font-display: swap).
fs.writeFileSync(path.join(ROOT, 'dev/fonts-chars.json'), JSON.stringify({ core: sortChars(core), missing: sortChars(new Set([...want].filter((c) => !has.has(c)))), files }, null, 1) + '\n');
// 워터마크(캔버스) 글자가 첫 파일에 다 있으면 한글 더 파일을 받지 않으려고 화면 코드에도 첫 파일 글자를 둬요(src/tools-mask.ts, 버그 찾기 14차)
fs.writeFileSync(path.join(ROOT, 'src/font-core.ts'), `// dev/fonts.mjs 가 써요(손으로 고치지 않아요). JL Sans 첫 파일(jl-sans)에 든 글자 — 신분증 가리기 워터마크가 이 밖의 한글을 쓸 때만
// 한글 더 파일(jl-sans-ko 370KB)을 받으려고요(버그 찾기 14차). dev/fonts-chars.json 의 core 와 같아요(test/bug14.test.ts)
export const JL_CORE = ${JSON.stringify(sortChars(core))};
`);
console.log(`JL Sans 첫 파일 ${core.size}자 · 한글 더 ${ko.size}자(${toRange(ko).length}B 범위) · Pretendard 에 없는 글자 ${want.size - core.size}자(기기 글꼴)`);
