# 집문서 · 서류 파일 도구

https://jipmunseo.pages.dev (Cloudflare Pages · 예전 `*.vercel.app` 주소는 정리돼서 열리지 않아요)

**한글 문서(HWP·HWPX) 보기·PDF·Word·쪽 그림·텍스트 저장**, PDF 합치기·나누기·회전·**용량 줄이기**, **신분증 가리기·"OO 제출용" 워터마크**, 이미지 → PDF, 이미지 압축·변환,
사진 배경 지우기, 사진 정보(EXIF·위치) 지우기를 **브라우저 안에서만** 처리하는 정적 사이트예요.
서버 함수가 없고, 우리 코드는 파일을 어디로도 보내지 않아요.

## 보안 정책 (`public/_headers`)
- `script-src 'self' 'wasm-unsafe-eval' blob:` — 실행되는 스크립트는 이 사이트 파일뿐이에요(외부 CDN 스크립트 없음).
  `blob:` 는 배경 지우기 라이브러리가 IMG.LY 에서 받은 실행 파일을 워커로 돌릴 때 필요해요.
- `connect-src 'self' blob: https://staticimgly.com` — 데이터를 보낼 수 있는 곳은 이 사이트와 배경 지우기 모델을 받는 곳뿐.
- 글꼴은 이 사이트의 `/fonts/`(JL Sans = Pretendard 1.3.9 를 줄인 판, OFL 예약 이름 때문에 이름을 바꿈)라 `font-src 'self'` 예요. 화면 문구에 새 글자가 생기면 `npm run fonts`(시험이 알려 줘요). 첫 파일(약 120KB)만 받고, 첫 파일에 없는 한글·악센트 로마자(é·ü, U+A1~17F)는 `JL Sans Ko`(약 370KB)를 그때 받아요.
- `frame-ancestors 'none'` + `X-Frame-Options: DENY`, `form-action 'none'`, `object-src 'none'`, `Referrer-Policy: no-referrer`.

## 도구
| 주소 | 하는 일 | 코드 |
|---|---|---|
| `#hwp-view` | **HWP 보기 · 변환**: HWP 5.0·HWPX·HWP 3.0을 rhwp(WASM, 워커)로 열어 쪽 SVG 를 `<img>`(blob)로 보여 줘요(문서 마크업을 페이지 DOM 에 넣지 않음). 내보내기 4형식: 그림 PDF(150/200/300dpi, 쪽 고르기) · **Word .docx**(rhwp 읽기 전용 HTML → 우리 OOXML 쓰기 + fflate, 표 병합·그림·머리말·꼬리말·각주·미주, 워커 안) · 쪽 그림 PNG(여러 장이면 쪽마다 바로 ZIP 에 이어 붙임, 휴대폰은 공유 시트 30장까지) · 텍스트 .txt(UTF-8 BOM + CRLF, 표는 탭). Word·텍스트는 한컴 전용 영역 글자(PUA: 한컴 기호·옛한글)를 화면과 같은 rhwp 표로 보통 글자로 바꾸고, 못 바꾼 개수는 안내해요. 한 번에 만드는 쪽 수는 화질별(150·200·300dpi: 100·60·40쪽, 아이폰·아이패드 40·25·15쪽), 만드는 중에는 `취소`(PDF·쪽 그림은 다음 쪽부터 멈춤, Word·텍스트는 워커를 버리고 원본으로 다시 열기). 암호로 연 문서는 결과 아래 "저장한 파일에는 암호가 없어요" 안내. 암호 문서는 기기 안에서 암호로 열기, DRM·인증서 보안 문서는 열지 않음, 배포용 문서는 복사·인쇄 제한 플래그를 직접 읽어 화면은 PNG 로만·인쇄방지면 저장·인쇄 막기, 배포용은 Word 로 옮기지 않고 복사방지면 텍스트도 막기. 화질·굵은 글꼴 설정만 `localStorage`(`jms.hwp.dpi`·`jms.hwp.bold`)에 기억해요. 검색용 안내 페이지: `/hwp`(`public/hwp.html`, 정적, 도구 코드 없음) | `src/tools-hwp.ts` · `src/hwp-lib.ts`(판별·정책·예상 크기·쪽 수 한도) · `src/hwp-svg.ts` · `src/hwp-export.ts`(블록 모델·텍스트) · `src/hwp-docx.ts`(Word) · `src/hwp-pua.ts`·`src/hwp-pua-oldhangul.ts`(PUA 표, 워커가 내보낼 때만 불러요) · `src/hwp-export-ui.ts` · `src/hwp-worker.ts` · `src/hwp-client.ts` |
| `#pdf-merge` · `#pdf-split` · `#pdf-organize` | 합치기 / 나누기·쪽 빼기 / 회전·순서 | `src/tools-pdf.ts` → `src/pdf-worker.ts` |
| `#pdf-compress` | 용량 줄이기: **사진만 줄이기**(글자·링크 그대로, 안의 JPEG·Flate 사진을 긴 변·화질 기준으로 다시 저장 + 압축 안 된 스트림 Flate) / **쪽을 통째로 이미지로**(PDF.js 로 dpi 맞춰 그려서 JPEG 쪽 PDF) | `src/pdf-shrink.ts`(워커에서 실행, 노드 테스트) |
| `#id-mask` | 서류 사본 가리기(끌어서 검은 네모, 그림 위에 칠해 저장 → 밑 글자 안 남음) + "OO 제출용 · 날짜 · 다른 용도 사용 금지" 대각선 반복 워터마크. 사진 → JPG·A4 PDF, PDF(10쪽까지) → 이미지 PDF | `src/tools-mask.ts` |
| `#img-to-pdf` · `#img-compress` · `#exif-clean` | 이미지 → PDF / 압축·변환 / 정보 지우기 | `src/tools-img.ts` |
| `#bg-remove` | 배경 지우기 (기기 안 AI, 처음 한 번 모델 약 56MB) | `src/tools-bg.ts` |

결과 PDF 에는 제작 도구 이름(Producer·Creator)을 넣지 않아요.

- 첫 화면에 파일을 떨어뜨리면 쓸 수 있는 도구를 보여 주고, 고르면 그 도구에 파일을 넘겨요(HWP·여러 PDF처럼 도구가 하나면 바로 열어요 — `src/lib.ts` `toolsForFiles`, `src/app.ts` `offerTools`·`giveFiles`).
- 이 브라우저에 기억하는 것(`src/prefs.ts`, localStorage): HWP 화질·굵은 글꼴, 이미지 압축의 형식·화질·최대 크기, PDF 용량 줄이기의 방법·정도, 최근에 연 도구 3개(첫 화면 소개 아래 칩). 문서 이름·내용은 남기지 않아요. 처리방침 '이 브라우저에 기억하는 것'과 같이 고쳐요.

- 홈 화면 앱·인터넷 없이 다시 열기(2026-10-18): `public/manifest.webmanifest`(바로가기 'HWP 보기 · 변환'·'PDF 합치기'·'신분증 가리기', PC Chrome·Edge 에 설치하면 HWP·HWPX·PDF 를 '연결 프로그램 › 집문서'로 열어 첫 화면 도구 고르기로 넘겨요 — `file_handlers` + `launchQueue`). 서비스 워커 `dist/sw.js`(`config/sw.js` + `config/sw-plugin.ts`, 빌드할 때 미리 저장 목록·버전을 채워요): 화면·JS·CSS·아이콘·안내 페이지만 미리 저장하고, `/vendor/*`(23MB)는 그 도구를 한 번 쓰면 따로(`jms-vendor-v1`, 앱 버전이 바뀌어도 남음) 저장해요. HTML(404)·부분 응답은 저장하지 않고, 화면이 형식 검사로 `cache: "reload"` 다시 받기를 하면 네트워크로 가서 저장본을 고쳐요. 배경 지우기 모델(staticimgly.com)은 건드리지 않아요. `_headers` 에 `sw.js` no-cache, 서비스 워커가 Pretendard 를 받게 `connect-src` 에 같은 경로. 처리방침 '이 브라우저에 기억하는 것'에 Cache Storage 를 더했어요(적용일 10월 18일).
- 손가락 화면(QA 3바퀴, 2026-10-19): 휴대폰·태블릿에서는 파일 넣는 곳이 '…을 골라 주세요'로 보이고 '눌러서 고르기'·'붙여넣기도 돼요'는 빠져요(끌어다 놓을 곳·붙여넣을 키가 없어요 — `src/ui.ts` `dropText`). 목록의 위로·아래로·빼기와 작은 단추는 44px.
- 화면 읽기: 도구가 결과를 그리면 제목을 한 번 읽어 줘요(`#sr-status`, '2.1 MB에서 1.0 MB로, 52% 줄었어요' — `sayArrows`). 진행 막대에 이름('진행 상황')과 지금 하는 일(`aria-valuetext`).
- 버그 찾기 4차(2026-10-20, `test/bug4.test.ts`): 내려받기·사진 ZIP·HWP 쪽 그림 '카톡 등으로 보내기'는 일이 끝나고 1초까지 다시 하지 않아요(`ui.ts` `once` — 두 번 톡톡에 같은 파일 두 번, 보내기는 엉뚱한 '공유하지 못했어요'). 작업 칸이 닫히거나('다른 PDF·파일·사진'·'모두 지우기'·'그만두기') 파일을 넣어 파일 넣는 곳이 숨거나 단추가 꺼지면(마지막 '되돌리기'·끝 쪽) 초점을 파일 넣는 곳·파일 줄·옆 단추로(`focusIfLost`·`setDisabledKeepingFocus`). 여는 중에 다른 파일을 고르면 늦게 끝난 옛 열기를 버려요(신분증 가리기에서 PDF 쪽과 사진이 한 문서로 섞였어요). 이미지 → PDF·압축·정보 지우기에서 사진·설정을 바꾸면 옛 결과를 걷어요.
- QA 4바퀴(2026-10-20, `test/qa4.test.ts`): 두 번 톡톡 거르기(`src/tap.ts` — 줄을 빼고 옮긴 뒤·화면이 바뀐 뒤·'모두 지우기'·'다른 PDF' 뒤 0.9초는 손가락·마우스 누름을 받지 않아요. 자판은 그대로) — 예전에는 '빼기' 두 번에 다음 파일까지 빠지고, '모두 지우기'·'다른 PDF'·도구 카드 두 번에 파일 고르기 창이 열리고, '내보내기' 두 번에 열렸다 닫히고, '다른 형식으로 저장' 두 번에 '텍스트'가 골라졌어요. 진행 표시·결과·내보내기 칸이 화면 아래 밖에 생기면 보이게 내려요(`revealIfBelow`), '만들기' 단추가 꺼져 초점을 잃었으면 결과의 내려받기로. HWP 보기는 쪽 아래에도 앞 쪽·뒤 쪽, 쪽 번호 칸 Enter 는 마우스 화면에서 칸을 놓지 않아요. 나누기는 방법·고른 쪽을 바꾸면 옛 결과를 걷어요. 손가락 화면은 순서 안내를 화살표 단추만으로·손잡이 숨김·썸네일과 세그먼트 단추 44px·hover 모양은 마우스 화면에만. 마우스 화면 첫 화면에 '파일을 이 화면에 끌어다 놓으세요'. 서비스 워커는 새 버전이 깔려도 바로 앞 버전의 `/js/*`를 한 세대(`jms-prev`) 남겨, 배포 전에 열어 둔 화면에서 HWP 보기·PDF 워커가 '도구를 불러오지 못했어요'로 막히지 않아요(그래도 못 받으면 '새로 고침' 단추).
- 버그 찾기 5차(2026-10-20, `test/bug5.test.ts`): 두 번 톡톡 거르기는 줄이 옮겨지거나 빠질 때만 걸어요(`ui.ts` `rowMoved`) — 회전·순서에서 '돌리기'를 빠르게 두 번 눌러도 90°만 돌았어요. 가리기 '되돌리기'·'모두 지우기'도 거르지 않아요(0.4초 간격 세 번이 두 번만 되돌려지고, 되돌린 뒤 0.9초는 칠하기가 시작되지 않았어요). PDF 합치기에서 큰 PDF 쪽수를 세는 동안 '모두 지우기'를 누르면 기다리던 파일이 다시 목록에 들어오던 것.
- QA 5바퀴(2026-10-20, `test/qa5.test.ts`): 합치기·이미지 → PDF 목록 머리에 **이름순**(숫자는 숫자로 — '스캔 2' 다음 '스캔 10', `lib.ts` `sortByName`) — 휴대폰 파일 고르기는 누른 차례대로 넘겨 줘서 40개가 섞여 들어왔어요. 합치기·나누기·회전·용량 줄이기·이미지 세 도구의 단추 줄은 목록이 길면 화면 아래에 붙어요(`ui.ts` `stickyActions`, 붙은 동안 알림은 그 위로 `toastBottom`). 두 번 톡톡 거르기는 줄이 옮겨진 목록 안의 누름만 걸러요(`tap.ts` scope — 바닥의 '합치기'·'이름순'은 바로 받아요). 일이 끝나면 진행 표시를 바로 숨겨요(0.8초 뒤 숨으면 결과·내려받기가 80px 올라갔어요). 이미지 → PDF 쪽 크기·여백 기억(`jms.img2pdf.size`·`jms.img2pdf.margin`, 처리방침 10월 20일 판). 움직임(`src/motion.ts`, anime.js 3.2.2 — 결과가 처음 나올 때만 따로 받아요): 결과 제목 앞 확인 표시를 도장처럼 찍고 테두리·체크를 그리기, 'n% 줄었어요'를 0부터 세어 올리기. 움직임 줄이기면 하지 않아요.
- 버그 찾기 6차(2026-10-21, `test/bug6.test.ts`): 목록 단추가 줄을 빼면 누른 자리 둘레(32px)도 0.9초 걸러요(`tap.ts` `hold(ms, scope, at)`) — 마지막 줄 '빼기'를 두 번 톡톡 누르면 목록이 짧아져 올라온 '합치기'가 눌리거나 회전·순서에서 다른 도구 링크로 넘어갔어요. 첫 화면에 HWP 두 개·종류가 섞인 파일을 놓으면 그렇게 알려요(`lib.ts` `noToolMessage`). 600px 아래 결과 줄은 '내려받기'를 다음 줄로. 이미지 압축 최대 크기 칸은 칸·기억·쓰는 값을 같게('0.5' → 1×1 그림이었어요).
- 버그 찾기 7차(2026-10-21, `test/bug7.test.ts`): Tab 으로 옮긴 초점이 화면 아래에 붙은 단추 줄 밑에 숨으면 가린 만큼 올려요(`ui.ts` `watchCover`·`coveredBy`) — 합치기 5번째 줄 '위로'가 통째로, 나누기 쪽 칸이 74px 가렸어요. 키보드 초점(:focus-visible)만이고, 붙은 줄 안의 단추로 갈 때는 움직이지 않아요.
- 버그 찾기 9차(2026-10-22, `test/bug9.test.ts`): 이미지 압축 '장마다 용량 한도' 칸에 '200KB'·'1,000'·'5'를 적으면 말없이 비우고 한도 없이 저장하던 것 — 단위·천 단위 쉼표를 떼고 10~50000 밖이면 끝 값으로 칸에 다시 적어요(`lib.ts` `kbInput`). PDF '용량 맞추기' 목표 칸은 칸을 떠나면 쓰는 값으로 다시 적어요('7.25' → 7.3, '600' → 500, 1·2·5·10MB 면 단추만 눌리고 칸은 비움, `targetMbInput`). 목표(1000 단위)를 조금 넘었는데 화면 크기(1024 단위)로는 작아 보이면 '1MB를 1,000,000바이트로 세면 넘어요'를 붙이고(`overButLooksUnder`), 사진이 없는 PDF 는 '사진 긴 변 2400px로 저장'이라고 적지 않아요.
- QA 8바퀴(2026-10-23, `test/qa8.test.ts`): 안내 페이지 `/hwp` 의 'HWP 파일 열기'가 그 자리에서 파일 고르기 창을 열어요(`src/hwp-page.ts`, 빌드 때 `vite.config.ts` `hwpPagePlugin` 이 `dist/hwp.html` 의 `/js/hwp-page.js` 를 해시 이름으로 바꿔요. 코드가 못 돌면 링크 `/#hwp-view` 그대로). 예전에는 도구 화면으로 넘어간 뒤 점선 상자를 한 번 더 눌러야 했어요. 고른 파일은 넘어가는 동안만 IndexedDB(`jms-handoff`)에 두고, 첫 화면이 sessionStorage 표시(`jms.handoff`)를 볼 때만 넘기기 코드를 받아 꺼내자마자 저장소째 지워요(`src/handoff.ts`, 2분 넘은 것·표시 없이 남은 것은 열지 않고 지움). 한글 문서 한 개면 HWP 보기로, PDF·사진·여러 개면 첫 화면 도구 고르기로 넘겨요(`handoffTarget`). 마우스 화면은 `/hwp` 아무 곳에나 떨어뜨려도 돼요. 이미 열린 도구로 넘길 때는 주소가 같아 hashchange 가 없어서 지금 칸에 바로 넣어요(`app.ts` `openWith`). 처리방침 10월 23일 판. 첫 화면 도구 설명에 'PDF 용량 줄이기 — 2MB·5MB 같은 제출 용량', '이미지 압축 — 200KB 이하처럼 장마다 용량'을 적어 10-22 에 넣은 용량 맞추기가 카드에서 보이게 했어요.

## 라이선스

이 저장소는 **GNU AGPL-3.0** 으로 공개합니다 (`LICENSE`).
배경 지우기에 [@imgly/background-removal](https://github.com/imgly/background-removal-js) (AGPL-3.0)을 쓰기 때문이에요.

### @imgly/background-removal 1.7.0 을 고친 부분
- 원본 번들 안의 `ndarray` 가 `new Function` 을 써서 CSP(`unsafe-eval` 금지)에 막혀요.
  그 부분을 `dev/ndarray-shim.cjs` 의 작은 대체 구현으로 바꿔서 다시 묶었어요.
- 결과물: `public/vendor/bg-removal-1.7.0-csp.mjs`
- 다시 만드는 방법: `dev/build-bg.sh` (패치 스크립트 `dev/patch-imgly.py`)

### 한글 문서 보기 (rhwp · Noto 글꼴 · 한컴 고지)
- [rhwp](https://github.com/edwardkim/rhwp) `@rhwp/core` 0.8.7 (MIT) — `public/vendor/rhwp-0.8.7/` 에 고치지 않은 npm 배포본(`rhwp.js`·`rhwp_bg.wasm`)과 `LICENSE`·`THIRD_PARTY_LICENSES.md`(안의 Rust 크레이트 목록)를 둬요. 받기·해시 확인: `bash dev/update-rhwp.sh`.
- 글꼴 Noto Serif KR·Noto Sans KR Regular·Bold (SIL OFL 1.1, rhwp v0.8.7 `assets/fonts` 의 서브셋) — `public/vendor/rhwp-0.8.7/fonts/`(버전 폴더 안: `/vendor/*` 는 1년 immutable 캐시라서). 쪽 SVG 안에 data URI 로 넣어 기기마다 같은 모양으로 그려요. Bold 두 개(1.6MB)는 화면에서 '제목 굵기 원본처럼'을 켰을 때만 받아요.
- Word(.docx)는 `docx` 패키지 없이 `src/hwp-docx.ts` 가 OOXML 부품을 직접 쓰고 이미 있는 fflate 로 묶어요(작성자·회사·만든 시각 없음, zip 시각 1980-01-01 고정). 이유: HWP_SPEC 12-4-5(무게·CSP·묶인 패키지 수).
- Word 서식(2026-10-16): 줄 간격은 rhwp HTML 의 `line-height` 를 옮겨요(`160%` → `<w:spacing w:line="384" w:lineRule="auto"/>`, 고정 값 pt·px → `exact`). 구역마다 쪽 크기·방향·여백(`getPageDef(구역)`)을 따로 두고, 앞 구역의 `sectPr` 는 그 구역 끝 문단에 걸어요(새 구역은 새 쪽). 한 줄이 63칸을 넘는 표가 있으면 Word 가 파일을 못 열어서 Word 를 만들지 않고 화면에서 안내해요(`widestTable`·`WORD_MAX_COLS`).
- 아이콘은 `src/icons.ts` 한 곳에 모아요(시스템 컬러 이모지 대신 직접 그린 SVG). 정적 HTML 에 붙인 커피잔이 같은지, 화면 코드에 컬러 이모지가 없는지는 `test/icons.test.ts` 가 봐요. 글 속 화살표(→)는 `arrowed()` 로 아이콘 + 숨긴 글자. 개인정보 설명은 `/privacy`(`public/privacy.html`) 한 곳에만 둬요.
- 서비스 코드는 rhwp 의 편집·다시 저장·배포용 풀기(`convertToEditable`·`exportHwp*`·`exportHwpx*`)를 부르지 않아요(`src/rhwp.d.ts` 에도 없어요). 배포용 문서를 끄는 스위치: `src/hwp-lib.ts` 의 `HWP_ALLOW_DISTRIBUTION`.
- 시험 파일 `test/fixtures/hwp/` 는 `node dev/make-hwp-fixtures.mjs` 로 rhwp 가 직접 만든 합성 문서예요(머리말·꼬리말·각주·미주가 든 `synthetic-notes.*` 포함).
- 한컴 전용 영역 글자(PUA) 표: `src/hwp-pua.ts` 는 rhwp v0.8.7 렌더러의 표(`hancom_pua.rs`·`paragraph_layout.rs` `map_pua_bullet_char`·`composer.rs`·`tags.rs`)를 그대로 옮겼고(MIT, 옮길 때 원본 Rust 파일과 자동으로 비교해 같음을 확인), 옛한글 표 `src/hwp-pua-oldhangul.ts` 는 `node dev/make-hwp-pua.mjs` 가 rhwp v0.8.7 `pua_oldhangul.rs`(원본 KTUG HanyangPuaTableProject, 퍼블릭 도메인)를 해시를 확인해 받아 만들어요. rhwp 버전을 올리면 표도 같이 다시 봐요.
- 없는 주소는 `public/404.html` 로 404 를 돌려줘요. 이 파일이 없으면 Pages 가 첫 화면을 200 으로 대신 주는데, `/vendor/*` 는 1년 immutable 캐시라 배포 틈에 받은 HTML 이 1년 남을 수 있어서예요. 글꼴·WASM 은 형식(content-type)을 확인하고, 아니면 한 번 캐시를 건너뛰고(`cache: "reload"`) 다시 받아요. 배포 뒤 `npm run check:deploy`(`dev/check-deploy.sh`)가 vendor·js 형식과 404 를 확인해요.
- 한컴 공개 문서 이용 조건에 따른 고지:
  - 본 제품은 한컴의 HWP 문서 파일(.hwp) 공개 문서를 참고하여 개발하였습니다.
  - 본 제품은 한글과컴퓨터의 한글 문서 파일(.hwp) 공개 문서를 참고하여 개발하였습니다.
- 한글·한컴·HWP·HWPX는 ㈜한컴(옛 ㈜한글과컴퓨터)의 상표예요. 집문서는 한컴과 제휴·후원·승인 관계가 없는 독립 도구예요. Microsoft Word는 Microsoft Corporation의 상표이고, 카카오톡은 ㈜카카오의 상표예요.

### 그 밖에 쓴 오픈소스 (각자의 라이선스)
pdf-lib (MIT) · PDF.js (Apache-2.0) · fflate (MIT) · exifr (MIT) · heic-to (LGPL-3.0, CSP 빌드) · ONNX Runtime Web (MIT) — `public/vendor/` 에 그대로 들어 있어요 (Vite 가 다시 묶지 않고 `/vendor/…` 주소 그대로 배포). 글꼴 JL Sans(Pretendard OFL 줄인 판)는 `public/fonts/`(`npm run fonts`).

- **라이선스 고지**: `public/third-party-licenses.txt` (→ `/third-party-licenses.txt`, 저작권 문구 + MIT·Apache-2.0·LGPL-3.0·GPL-3.0·AGPL-3.0 원문 전체)와
  `public/licenses.html` (→ `/licenses`, 한국어 요약 · LGPL 원본 소스 안내). 푸터에서 링크해요. **vendor 파일을 바꾸면 두 파일도 같이 고쳐요.**
- 벤치마킹(2026-10-22, `test/bench.test.ts`, 기록 `_workspace/review/benchmark/2026-10-22/anollim.md`): 결과 아래 **'이 파일로 이어서'**(iLovePDF·Smallpdf) — 결과 PDF·사진 한 개를 다음 도구의 파일 칸에 그대로 넣어요(`app.ts` `addNextRow`, `lib.ts` `nextToolsFor`·`pickNextSource`, 결과 줄의 파일은 `ui.ts` `resultFiles`). 결과가 여러 개(나누기·사진 여러 장)면 두지 않아요. PDF 용량 줄이기 **'용량 맞추기'**(BentoPDF 목표 용량) — 1·2·5·10MB 또는 직접 적은 MB(1000² 로 세요) 안에 드는 것 중 가장 덜 줄인 단계를 골라요(`lib.ts` `fitToSize`·`FIT_STEPS`, 사진만 줄여서 안 되면 쪽을 그림으로 바꾸고 결과에 적어요, `jms.pdf.target`). 이미지 압축 **장마다 용량 한도(KB)** — 화질을 10씩 낮추고 그래도 넘치면 크기를 줄여요(`imgFitSteps`, `jms.img.maxkb`). 처리방침 10월 22일 판.

## 개발 (TypeScript + Vite)

- 코드: `src/*.ts` (`strict`). 화면 → `dist/js/` 로 묶이고, PDF 작업은 `src/pdf-worker.ts`, 한글 문서는 `src/hwp-worker.ts` 모듈 워커(`vendor:rhwp` → `/vendor/rhwp-0.8.7/rhwp.js` 그대로, `vite.config.ts`).
- vendor 라이브러리(pdf-lib · PDF.js · fflate · exifr · heic-to · bg-removal · rhwp)는 `public/vendor/` 의 고정 버전 파일을 **처음 쓸 때** 그 주소 그대로 불러와요(`src/vendor.ts` 의 `vendorImport`). 쓰는 API 만 타입으로 적었어요(`src/vendor.ts`, 워커의 pdf-lib 은 `src/pdf-lib.d.ts`).
- `public/` (vendor · css · assets · `_headers`) 은 같은 경로로 복사돼요. CSS 는 Vite 가 손대지 않고, 빌드 끝에 `css/style.css` 이름에만 내용 해시를 붙여 모든 HTML 링크를 바꿔요(`css/style.<해시>.css`, `config/sw-plugin.ts` `hashStyles`) — 페이지는 네트워크 우선·CSS 는 저장본 먼저라, 배포 뒤 처음 열 때 깔려 있던 서비스 워커가 옛 CSS 를 새 화면에 붙이지 않게요.
- 디자인: 초록 커팅 매트 위 반듯한 카드, 포인트 파랑 `#2563eb`. 손글씨·연필·도장 장식은 쓰지 않아요(Jone Lab 가이드 3차 개정).
- 공유 이미지·아이콘: `dev/make-og.py`(→ `public/assets/og.svg`), `dev/export-art.mjs`(일러스트 → `dev/art/`), PNG 는 `dev/render-png.sh`(크롬 헤드리스).

```bash
npm run dev            # Vite 개발 서버
npm test               # 단위 테스트 (Vitest) — 순수 함수 + PDF 용량 줄이기(실제 pdf-lib, 가짜 코덱) + 한글 문서(실제 rhwp WASM, 합성 문서)
npm run typecheck      # tsc (화면 + 워커)
npm run build          # dist/
node dev/serve.mjs     # dist/ 를 public/_headers 와 같은 헤더(CSP)로 로컬 확인
npm run deploy         # 빌드 후 Cloudflare Pages(jipmunseo) 배포 + 배포 확인(dev/check-deploy.sh)
npm run check:deploy   # 실제 주소의 vendor·js 형식과 없는 주소 404 확인
```

문의: cowhddnjsdl0@gmail.com · Jone Lab: https://jone-lab.pages.dev
