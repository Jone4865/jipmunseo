#!/usr/bin/env bash
# 배포 뒤 확인: vendor·js 파일이 제 형식(content-type)으로 오는지, 없는 주소가 첫 화면 HTML(200)이 아니라 404 인지.
# /vendor/* 는 1년 immutable 캐시라, 없는 주소가 HTML 200 으로 오면 그 HTML 이 사용자 브라우저에 1년 남아요(public/404.html 로 막아요).
# 사용: bash dev/check-deploy.sh [주소(기본 https://jipmunseo.pages.dev)]  — 배포 직후 퍼지는 동안을 생각해 200 은 몇 번 다시 봐요.
set -uo pipefail
cd "$(dirname "$0")/.."
BASE=${1:-https://jipmunseo.pages.dev}
fail=0
check() { # 경로 기대코드 기대형식(정규식)
  local got code type i
  for i in 1 2 3 4 5; do
    got=$(curl -s -o /dev/null -w '%{http_code} %{content_type}' "$BASE$1")
    code=${got%% *}; type=${got#* }
    [[ $code == "$2" && $type =~ $3 ]] && { echo "OK   $1 → $got"; return; }
    sleep 3
  done
  echo "틀림 $1 → $got (기대 $2 $3)"; fail=1
}
JS='^(application|text)/javascript'
for f in "rhwp_bg.wasm:^application/wasm" "rhwp.js:$JS" \
         "fonts/NotoSerifKR-Regular.woff2:^font/woff2" "fonts/NotoSansKR-Regular.woff2:^font/woff2" \
         "fonts/NotoSerifKR-Bold.woff2:^font/woff2" "fonts/NotoSansKR-Bold.woff2:^font/woff2"; do
  check "/vendor/rhwp-0.8.7/${f%%:*}" 200 "${f#*:}"
done
check /vendor/fflate-0.8.2.mjs 200 "$JS"
check /vendor/pdf-lib-1.17.1.esm.min.js 200 "$JS"
# 이번 빌드의 js 조각(워커·PUA 표 포함)과 해시 붙은 CSS 가 다 올라갔는지
for f in dist/js/*.js; do [[ -e $f ]] && check "/js/${f##*/}" 200 "$JS"; done
for f in dist/css/*.css; do [[ -e $f ]] && check "/css/${f##*/}" 200 ^text/css; done
check / 200 ^text/html
check /hwp 200 ^text/html
check /pdf-compress 200 ^text/html
check /pdf-merge 200 ^text/html
check /licenses 200 ^text/html
check /privacy 200 ^text/html
# 없는 주소: 404 여야 해요(첫 화면 200 이면 404.html 이 빠진 거예요)
check /vendor/rhwp-0.8.7/fonts/NotExist-Bold.woff2 404 ^text/html
check /vendor/nope.mjs 404 ^text/html
check /no-such-page 404 ^text/html
echo "없는 vendor 주소의 캐시 헤더(참고): $(curl -sI "$BASE/vendor/nope.mjs" | grep -i '^cache-control' | tr -d '\r')"
exit $fail
