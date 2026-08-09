const CACHE = 'arcade-v43';
// RPG 敵人圖示：檔名＝ENEMIES／首領／域限精英的 key。v385 起 50 隻全數有圖，已無 SVG 回落。
const RPG_MON = [
  'slime','bat','skel','thief','rat','garg','spider',
  'jelly','drown','crab','eel','corpse2','sguard','siren',
  'eye','flower','hound','clot','leech','teeth','necro',
  'lantern','sister','monk','reliq','choir','zealot','knight',
  'magma','mist','pulse','puppet','throm','valve','worm',
  'mimic','feign',                                             // 執行時用 imgKey 借用，見 data.js 的 RUNTIME_MON_IMG
  'mb0','mb1','mb2','mb3','mb4','bb0','bb1','bb2','bb3','final',
  'ratking','priest','stitch','inquis','acolyte',            // 域限精英 A（每域第一隻）
  'miner','raider','swarm','warden','stoker',                 // v396：域限精英 B（每域第二隻）
].map(k => `/rpg/mon/${k}.webp`);
// RPG 通用 UI 圖示（v385）：標題／職業／門／藥水／結算，見 data.js 的 DOOR_IMG 與各表的 img 欄
const RPG_UI = [
  'title','cls_sword','cls_assassin','cls_white','cls_dark',
  'door_fight','door_elite','door_rest','door_chest','door_unknown','ev_corpse',   // v431：未知門有自己的圖；ev_corpse 仍是「前人遺物」事件在用
  'pot_heal','pot_wrath','pot_energy','pot_holy','pot_bomb','ev_rock',
  'res_death','smith','coin','gem','title_bg','npc_smith','bg_market',
  'pot_purge','pot_stone','ev_box','ev_can','ev_scroll','ev_dice','ev_rope',
  'ev_door','ev_shrine','ev_mine','ev_cart','ev_cyst','ev_root','ev_lava','ev_confess',
  'ev_well','ev_crack','ev_cycle','ev_merchant',
  'realm0','realm1','realm2','realm3','realm4','realm5',
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
  '/rpg/manifest.json', '/rpg/icon.png',   // v421：深淵有自己的 manifest，可獨立「加到主畫面」
  '/rpg/data.js', '/rpg/core.js', '/rpg/account.js', '/rpg/items.js',
  // v396：營地底圖 camp3.webp（941×1672≈9:16）。舊的 camp.webp / camp2.webp 已無人引用，
  // 檔案還留在 rpg/ 但不預快取；確認新圖無誤後可直接刪檔。
  '/rpg/battle.js', '/rpg/run.js', '/rpg/ui.js', '/rpg/camp3.webp',
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
