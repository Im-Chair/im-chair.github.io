const CACHE = 'sudoku-v2';
// v2：原本預快取的是根目錄首頁（'/'），數獨本身從沒被存進快取；改成數獨自己的檔案。
const ASSETS = [
  '/sudoku/', '/sudoku/index.html', '/sudoku/manifest.json',
  '/sudoku/icons/icon-192.png', '/sudoku/icons/icon-512.png',
];

self.addEventListener('install', e => {
  e.waitUntil(caches.open(CACHE).then(c =>
    Promise.all(ASSETS.map(u => c.add(u).catch(err => console.warn('[sw] 預快取略過', u, err))))
  ));
  self.skipWaiting();
});

self.addEventListener('activate', e => {
  e.waitUntil(caches.keys().then(keys =>
    // 只清自己（sudoku-*）的舊版，不動整站共用空間裡其他遊戲的快取
    Promise.all(keys.filter(k => k.startsWith('sudoku-') && k !== CACHE).map(k => caches.delete(k)))
  ));
  self.clients.claim();
});

// network-first：有網路就拿最新版並順手更新快取，離線才用快取（與根 sw.js 一致）
self.addEventListener('fetch', e => {
  if (e.request.method !== 'GET') return;
  e.respondWith(
    fetch(e.request)
      .then(res => {
        const copy = res.clone();
        caches.open(CACHE).then(c => c.put(e.request, copy));
        return res;
      })
      .catch(() => caches.match(e.request, { ignoreSearch: true }))
  );
});
