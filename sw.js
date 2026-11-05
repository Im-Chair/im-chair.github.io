const CACHE = 'arcade-v71';
// 珠界的圖獨立一個快取、不跟 CACHE 改版：改版時不必重抓，也不用每次打開都等網路
const ART_CACHE = 'arcade-pokemo-art';
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
  'realm0','realm1','realm2','realm3','realm4',
].map(k => `/rpg/ui/${k}.webp`);
// RPG 裝備圖示（v382）：武器看 wtype、護甲／飾品看名稱，見 data.js 的 ITEM_ICON
const RPG_EQ = [
  'sword','staff','axe','dagger','tome','bell',
  'leather','chain','plate','scale','cloak','robe',
  'ring','pendant','watch','lamp',
].map(k => `/rpg/eq/${k}.webp`);
// 珠界美術（pokemo/art/）。新增圖檔時這裡加一筆；ui-btn* 是選配，還沒出圖時只會略過
const POKEMO_ART = [
  'bosses', 'bg-water', 'bg-fire', 'bg-wood', 'bg-light', 'bg-dark', 'bg-coast', 'bg-ember', 'bg-marsh',
  'bg-sky', 'bg-abyss', 'bg-title', 'sheet-water', 'sheet-fire', 'sheet-wood', 'sheet-light', 'sheet-dark',
  'map-tiles', 'map-tree1', 'map-tree2', 'map-house', 'map-fountain', 'map-sign', 'map-gate', 'map-rock',
  'map-bush', 'map-tiles_coast', 'map-tree1_coast', 'map-tree2_coast', 'map-house_coast', 'map-fountain_coast',
  'map-sign_coast', 'map-gate_coast', 'map-rock_coast', 'map-bush_coast', 'map-lighthouse', 'map-tiles_ember',
  'map-tree1_ember', 'map-tree2_ember', 'map-house_ember', 'map-fountain_ember', 'map-sign_ember',
  'map-gate_ember', 'map-rock_ember', 'map-bush_ember', 'map-ashbarrel', 'map-tiles_marsh', 'map-tree1_marsh',
  'map-tree2_marsh', 'map-house_marsh', 'map-fountain_marsh', 'map-sign_marsh', 'map-gate_marsh',
  'map-rock_marsh', 'map-bush_marsh', 'map-marshgrave', 'map-tiles_sky', 'map-tree1_sky', 'map-tree2_sky',
  'map-house_sky', 'map-fountain_sky', 'map-sign_sky', 'map-gate_sky', 'map-rock_sky', 'map-bush_sky',
  'map-special_sky', 'map-tiles_abyss', 'map-tree1_abyss', 'map-tree2_abyss', 'map-house_abyss', 'map-fountain_abyss',
  'map-sign_abyss', 'map-gate_abyss', 'map-rock_abyss', 'map-bush_abyss', 'map-special_abyss', 'ch-liechya',
  'p-liechya', 'ch-taiyi', 'p-taiyi', 'ch-ache', 'p-ache', 'ch-qizhua', 'p-qizhua', 'ch-jin', 'p-jin',
  'ch-huipo', 'p-huipo', 'ch-xiaohuo', 'ch-moen', 'p-moen', 'ch-adu', 'p-adu', 'ch-main', 'p-main',
  'ch-xiaodou', 'p-xiaodou', 'ch-chaosheng', 'p-chaosheng', 'ch-ajing', 'p-ajing', 'ch-yanpo', 'p-yanpo',
  'ch-bo', 'p-bo', 'ch-zhou', 'p-zhou', 'ch-hana', 'p-hana', 'ch-guard', 'p-guard', 'ch-cloak', 'p-cloak',
  'ch-sefei', 'p-sefei', 'ch-yunque', 'p-yunque', 'ch-jiale', 'p-jiale', 'ch-zhiyu', 'p-zhiyu', 'ch-heifeng',
  'p-heifeng', 'ch-huiya', 'p-huiya', 'ch-xiaomiao', 'p-xiaomiao', 'ch-yexiao', 'p-yexiao', 'orbs',
  'ui-btn', 'ui-btn-pri',
].map(k => `/pokemo/art/${k}.webp`);
const ASSETS = [
  '/', '/index.html', '/manifest.json', '/icon.png',
  // v44：單檔小遊戲也預快取，裝了 App 但還沒點進去過的遊戲也能離線開。
  // 數獨／轉珠之塔各有自己的 SW，但在它們註冊前（從沒進去過）是由這支根 SW 接手，所以一併列入。
  '/minesweeper/', '/bulls-cows/', '/solitaire/', '/sudoku/', '/tower-orbs/',
  '/tower-orbs/rogue.js',   // v47：轉珠之塔的地城模式拆成獨立檔
  '/drift-ark/',            // v48：漂流方舟（單檔，美術以 base64 內嵌）
  '/tetris/',               // v53：俄羅斯方塊（單檔）
  '/pokemo/',               // v56：珠界：歸一之子（單檔、內嵌美術）
  '/outpost/', '/deep-miner/', '/neon-danmaku/',   // v59：晨昏線前哨、深掘礦工、霓虹彈幕（皆單檔）
  '/sky-frontier/',         // v63：天穹拓荒（單檔）
  // v45：小遊戲美術（可一張一張補；檔案還不存在時只會略過）。產出流程見 美術需求_ChatGPT出圖.md
  ...['sudoku','minesweeper','bulls-cows','solitaire','rpg','tower-orbs','drift-ark','tetris','pokemo','outpost','deep-miner','neon-danmaku','sky-frontier'].map(k => `/icons/${k}.webp`),
  '/solitaire/back.webp', '/solitaire/felt.webp', '/minesweeper/flag.webp', '/minesweeper/mine.webp',
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

// 安裝只抓首頁必要檔案、馬上啟用。其餘交給 fillCaches，安裝時全抓會塞滿網路，遊戲的圖要排在幾百個請求後面
const CORE = ['/', '/index.html', '/manifest.json', '/icon.png'];
self.addEventListener('install', e => {
  e.waitUntil(caches.open(CACHE).then(c =>
    // 逐一加入：單一資源失敗不讓整個 install 掛掉
    Promise.all(CORE.map(u => c.add(u).catch(err => console.warn('[sw] 預快取略過', u, err))))
  ));
  self.skipWaiting();
});

// 離線用的快取在背景慢慢補：同時最多 2 個、低優先，已經有的不重抓，沒補完下次打開首頁會接著補
let filling = null, pendingArt = 0;   // pendingArt：遊戲正在等的圖，還沒抓完時背景補快取要讓路
function fillCaches() {
  return filling || (filling = (async () => {
    await new Promise(r => setTimeout(r, 3000));   // 先讓使用者點進遊戲
    const jobs = [...ASSETS.map(u => [CACHE, u]), ...POKEMO_ART.map(u => [ART_CACHE, u])];
    let failed = 0;
    const worker = async () => {
      while (jobs.length) {
        while (pendingArt > 0) await new Promise(r => setTimeout(r, 300));
        const [name, u] = jobs.shift();
        const c = await caches.open(name);
        if (await c.match(u)) continue;
        try {
          const res = await fetch(u, { priority: 'low' });
          if (res.ok) await c.put(u, res);
        } catch (err) { failed++; }
      }
    };
    await Promise.all([worker(), worker()]);
    // 都補完才清舊版，補的途中離線還有舊快取可用。只清自己（arcade-*）的舊版，數獨／轉珠之塔的快取不能動
    if (!failed) {
      const keys = await caches.keys();
      await Promise.all(keys.filter(k => k.startsWith('arcade-') && k !== CACHE && k !== ART_CACHE).map(k => caches.delete(k)));
    }
  })().finally(() => { filling = null; }));
}
self.addEventListener('message', e => { if (e.data === 'fill') e.waitUntil(fillCaches()); });

self.addEventListener('activate', () => {
  self.clients.claim();
});

self.addEventListener('fetch', e => {
  if (e.request.method !== 'GET') return;
  // 珠界的圖：有快取就直接用，同時在背景更新，換圖後下次打開就是新的
  const url = new URL(e.request.url);
  if (url.origin === location.origin && url.pathname.startsWith('/pokemo/art/')) {
    e.respondWith(caches.open(ART_CACHE).then(async c => {
      const hit = await c.match(e.request, { ignoreSearch: true });
      const net = fetch(e.request, hit ? { priority: 'low' } : {}).then(res => { if (res.ok) c.put(e.request, res.clone()); return res; });
      if (hit) { e.waitUntil(net.catch(() => {})); return hit; }
      pendingArt++;
      return net.finally(() => { pendingArt--; });
    }));
    return;
  }
  e.respondWith(
    fetch(e.request)
      .then(res => {
        // 只存成功的回應：部署中途的 404／5xx 不能蓋掉原本好的快取
        if (res.ok) {
          const copy = res.clone();
          caches.open(CACHE).then(c => c.put(e.request, copy));
        }
        return res;
      })
      // 離線退路：ignoreSearch 讓 data.js?v=349 這類帶版號的請求也能命中預快取的基底網址；
      // 沒命中時回網路錯誤，不要回 undefined（respondWith 會丟錯）
      .catch(() => caches.match(e.request, { ignoreSearch: true }).then(m => m || Response.error()))
  );
});
