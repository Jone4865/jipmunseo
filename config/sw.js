// 집문서 서비스 워커 — 한 번 열었으면 인터넷이 없어도 첫 화면과 한 번 쓴 도구가 열려요(파일은 원래 이 브라우저 안에서만 다뤄요).
// 아래 VERSION·CORE 자리는 vite.config.ts 의 swPlugin 이 빌드 결과(해시 붙은 JS 이름)와 그 내용으로 채워서 dist/sw.js 로 써요.
// 클래식 스크립트라 import/export 가 없어요.
// - 페이지: 네트워크 우선, 3초 안에 안 오면 저장해 둔 화면(첫 화면 './', '/hwp', '/pdf-compress', '/pdf-merge', '/privacy', '/licenses' — 서로 덮지 않게 자리를 나눠요)
// - 화면 JS·CSS·파비콘: 미리 저장 + 저장해 둔 것 먼저, 뒤에서 갱신(홈 화면 아이콘 icon.png·apple-touch-icon.png 은 미리 받지 않아요 — 쓰이면 그때 저장)
// - /vendor/*(pdf-lib·PDF.js·rhwp WASM·글꼴 등, 이름에 버전이 붙어 바뀌지 않는 파일): 미리 받지 않고, 그 도구를 한 번 쓰면 따로 저장해요(앱 버전이 바뀌어도 남아요).
//   화면이 형식이 틀린 응답을 보고 캐시를 건너뛰어(cache: 'reload') 다시 받으면 여기서도 네트워크로 가서 저장본을 고쳐요. HTML(404 화면)은 저장하지 않아요
// - 글꼴(/fonts/, 이름에 해시): 첫 파일은 미리 저장, 한글 더(jl-sans-ko)는 받으면 저장 — 화면 파일과 같은 길이에요. 다른 출처는 건드리지 않아요
// - 배경 지우기 모델(staticimgly.com)은 건드리지 않아요
// - 새 버전이 깔리면 바로 앞 버전의 화면 JS(/js/*, 이름에 해시)를 한 세대만 따로(jms-prev) 남겨요. 배포 전에 열어 둔 화면이 아직 받지 않은
//   도구 코드(HWP 보기·PDF 워커)를 부르면 새 배포에는 그 이름이 없어 '도구를 불러오지 못했어요'가 떴어요(QA 4바퀴, 2026-10-20)
const VERSION = __SW_VERSION__;
const CORE = __SW_PRECACHE__;
const VENDOR = 'jms-vendor-v1';
const PREV = 'jms-prev';
const NAV_TIMEOUT = 3000;
const PAGES = { '/hwp': './hwp', '/pdf-compress': './pdf-compress', '/pdf-merge': './pdf-merge', '/privacy': './privacy', '/licenses': './licenses' };

self.addEventListener('install', (e) => {
  e.waitUntil(caches.open(VERSION).then((c) => c.addAll(CORE)).then(() => self.skipWaiting()));
});
self.addEventListener('activate', (e) => {
  e.waitUntil((async () => {
    const olds = (await caches.keys()).filter((k) => k.startsWith('jms-') && k !== VERSION && k !== VENDOR && k !== PREV);
    if (olds.length) {
      // 두 세대 전 것은 버리고, 바로 앞 버전의 JS 만 옮겨 둬요
      await caches.delete(PREV);
      const prev = await caches.open(PREV);
      for (const k of olds) {
        const c = await caches.open(k);
        for (const req of await c.keys()) {
          if (!new URL(req.url).pathname.startsWith('/js/')) continue;
          const r = await c.match(req);
          if (r) await prev.put(req, r);
        }
        await caches.delete(k);
      }
    }
    await self.clients.claim();
  })());
});

function timeout(p, ms) {
  return new Promise((ok) => { const t = setTimeout(() => ok(null), ms); p.then((v) => { clearTimeout(t); ok(v); }, () => { clearTimeout(t); ok(null); }); });
}
const isHtml = (r) => (r.headers.get('content-type') || '').startsWith('text/html');

self.addEventListener('fetch', (e) => {
  const req = e.request;
  if (req.method !== 'GET' || req.headers.has('range')) return;
  const url = new URL(req.url);
  if (url.origin !== location.origin) return;
  if (req.mode === 'navigate') {
    const key = PAGES[url.pathname.replace(/\.html$/, '')] || (url.pathname === '/' || url.pathname === '/index.html' ? './' : null);
    if (!key) return; // 없는 주소는 그대로(404 화면)
    e.respondWith((async () => {
      const c = await caches.open(VERSION);
      const net = fetch(req).then((r) => { if (r.ok && !r.redirected) c.put(key, r.clone()); return r; });
      const fast = await timeout(net, NAV_TIMEOUT);
      if (fast) return fast;
      const hit = await c.match(key);
      if (hit) { net.catch(() => {}); return hit; }
      return net;
    })());
    return;
  }
  if (url.pathname.startsWith('/vendor/')) {
    e.respondWith(caches.open(VENDOR).then(async (c) => {
      const keep = (r) => { if (r.status === 200 && !isHtml(r)) c.put(req, r.clone()); return r; };
      if (req.cache !== 'reload' && req.cache !== 'no-store') {
        const hit = await c.match(req, { ignoreSearch: true });
        if (hit) return hit;
      }
      return fetch(req).then(keep);
    }));
    return;
  }
  e.respondWith(caches.open(VERSION).then(async (c) => {
    const hit = (await c.match(req, { ignoreSearch: true })) || (url.pathname.startsWith('/js/') ? await caches.open(PREV).then((p) => p.match(req, { ignoreSearch: true })) : undefined);
    const net = fetch(req).then((r) => { if (r.status === 200 && !isHtml(r)) c.put(req, r.clone()); return r; });
    if (hit) { net.catch(() => {}); return hit; }
    return net;
  }));
});
