// 집문서 서비스 워커 — 한 번 열었으면 인터넷이 없어도 첫 화면과 한 번 쓴 도구가 열려요(파일은 원래 이 브라우저 안에서만 다뤄요).
// 아래 VERSION·CORE 자리는 vite.config.ts 의 swPlugin 이 빌드 결과(해시 붙은 JS 이름)와 그 내용으로 채워서 dist/sw.js 로 써요.
// 클래식 스크립트라 import/export 가 없어요.
// - 페이지: 네트워크 우선, 3초 안에 안 오면 저장해 둔 화면(첫 화면 './', '/hwp', '/privacy', '/licenses' — 서로 덮지 않게 자리를 나눠요)
// - 화면 JS·CSS·아이콘: 미리 저장 + 저장해 둔 것 먼저, 뒤에서 갱신
// - /vendor/*(pdf-lib·PDF.js·rhwp WASM·글꼴 등, 이름에 버전이 붙어 바뀌지 않는 파일): 미리 받지 않고, 그 도구를 한 번 쓰면 따로 저장해요(앱 버전이 바뀌어도 남아요).
//   화면이 형식이 틀린 응답을 보고 캐시를 건너뛰어(cache: 'reload') 다시 받으면 여기서도 네트워크로 가서 저장본을 고쳐요. HTML(404 화면)은 저장하지 않아요
// - 글꼴 Pretendard(jsDelivr): 정상 응답만 따로 저장
// - 배경 지우기 모델(staticimgly.com)은 건드리지 않아요
const VERSION = __SW_VERSION__;
const CORE = __SW_PRECACHE__;
const VENDOR = 'jms-vendor-v1';
const FONTS = 'jms-fonts-v1';
const NAV_TIMEOUT = 3000;
const PAGES = { '/hwp': './hwp', '/privacy': './privacy', '/licenses': './licenses' };

self.addEventListener('install', (e) => {
  e.waitUntil(caches.open(VERSION).then((c) => c.addAll(CORE)).then(() => self.skipWaiting()));
});
self.addEventListener('activate', (e) => {
  e.waitUntil((async () => {
    for (const k of await caches.keys()) if (k.startsWith('jms-') && k !== VERSION && k !== VENDOR && k !== FONTS) await caches.delete(k);
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
  if (url.origin !== location.origin) {
    if (url.hostname !== 'cdn.jsdelivr.net' || !url.pathname.startsWith('/gh/orioncactus/pretendard@')) return;
    e.respondWith(caches.open(FONTS).then(async (c) => {
      const hit = await c.match(req);
      const net = fetch(req).then((r) => { if (r.ok) c.put(req, r.clone()); return r; });
      if (hit) { net.catch(() => {}); return hit; }
      return net;
    }));
    return;
  }
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
    const hit = await c.match(req, { ignoreSearch: true });
    const net = fetch(req).then((r) => { if (r.status === 200 && !isHtml(r)) c.put(req, r.clone()); return r; });
    if (hit) { net.catch(() => {}); return hit; }
    return net;
  }));
});
