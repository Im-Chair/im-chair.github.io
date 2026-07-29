const CACHE = 'arcade-v16';
// RPG 敵人圖示：檔名＝ENEMIES／首領／域限精英的 key。v385 起 50 隻全數有圖，已無 SVG 回落。
const RPG_MON = [
  'slime','bat','skel','thief','rat','garg','spider',
  'jelly','drown','crab','eel','corpse2','sguard','siren',
  'eye','flower','hound','clot','leech','teeth','necro',
  'lantern','sister','monk','reliq','choir','zealot','knight',
  'magma','mist','pulse','puppet','throm','valve','worm',
  'mb0','mb1','mb2','mb3','mb4','bb0','bb1','bb2','bb3','final',
  'ratking','priest','stitch','inquis','acolyte',            // v385：域限精英（方形框圖）
].map(k => `/rpg/mon/${k}.webp`);
// RPG 通用 UI 圖示（v385）：標題／職業／門／藥水／結算，見 data.js 的 DOOR_IMG 與各表的 img 欄
const RPG_UI = [
  'title','cls_sword','cls_assassin','cls_white','cls_dark',
  'door_fight','door_elite','door_rest','door_chest','ev_corpse',
  'pot_heal','pot_wrath','pot_energy','pot_holy','pot_bomb','ev_rock',
  'res_death','smith','coin','gem',
].map(k => `/rpg/ui/${k}.webp`);
// RPG 裝備圖示（v382）：武器看 wtype、護甲／飾品看名稱，見 data.js 的 ITEM_ICON
const RPG_EQ = [
  'sword','staff','axe','dagger','tome','bell',
  'leather','chain','plate','scale','cloak','robe',
  'ring','pendant','watch','lamp',
].map(k => `/rpg/eq/${k}.webp`);
const ASSETS = [
  '/', '/index.html', '/manifest.json',
  // RPG：預先快取核心檔，讓「裝了 App 但還沒連網進過 RPG」的使用者也能離線開啟。
  // 這裡存的是「不帶 ?v= 版號」的基底網址，靠下方 fetch fallback 的 ignoreSearch 對應到實際帶版號的請求。
  '/rpg/', '/rpg/index.html', '/rpg/style.css',
  '/rpg/data.js', '/rpg/core.js', '/rpg/account.js', '/rpg/items.js',
  '/rpg/battle.js', '/rpg/run.js', '/rpg/ui.js', '/rpg/camp.webp',
  ...RPG_MON, ...RPG_EQ, ...RPG_UI,
];

self.addEventListener('install', e => {
  e.waitUntil(caches.open(CACHE).then(c =>
    // 逐一加入：單一資源失敗（例如某檔改名或某主機不支援目錄網址）不讓整個 install 掛掉
    Promise.all(ASSETS.map(u => c.add(u).catch(err => console.warn('[sw] 預快取略過', u, err))))
  ));
  self.skipWaiting();
});

self.addEventListener('activate', e => {
  e.waitUntil(
    caches.keys().then(keys =>
      Promise.all(keys.filter(k => k !== CACHE).map(k => caches.delete(k)))
    )
  );
  self.clients.claim();
});

self.addEventListener('fetch', e => {
  e.respondWith(
    fetch(e.request)
      .then(res => {
        const copy = res.clone();
        caches.open(CACHE).then(c => c.put(e.request, copy));
        return res;
      })
      // 離線退路：ignoreSearch 讓 data.js?v=349 這類帶版號的請求也能命中預快取的基底網址
      .catch(() => caches.match(e.request, { ignoreSearch: true }))
  );
});
