/* 貪婪深淵 — 圖片資產對帳（無瀏覽器）。用法：node _audit_assets.js
 *
 * 為什麼需要這支：「新增圖片是三件事」的第 3 件（sw.js 補登）漏掉的話，
 * 線上有網路時**完全正常**，只有離線才缺圖——是最難靠手測發現的一類。
 * 這支把三邊對起來：遊戲實際會請求的圖 ／ sw.js 預快取清單 ／ 硬碟上真的有的檔。
 *
 * 資料一律從 source of truth 讀回來，不要在這裡另抄一份清單：
 *   - 會請求什麼 → 讀 data.js 的資料表（與 core.js 的 preloadArt 同一套推導）
 *   - 登記了什麼 → 解析 ../sw.js 的 RPG_MON / RPG_UI / RPG_EQ
 * 唯一推導不到的是 RUNTIME_MON_IMG（run.js 用 e.imgKey 借用別人的檔名），
 * 所以那份在 data.js 裡是一個明列的常數，這裡直接讀它。
 */
const fs = require('fs'), vm = require('vm'), path = require('path');
const DIR = path.dirname(fs.realpathSync(__filename)) + '/';

/* --- 用最小 stub 把 data.js 載進來。只要資料表，不碰 DOM --- */
const ctx = { console, window:{ IMG_VER:'1' }, document:{ getElementById:()=>null, querySelectorAll:()=>[] } };
vm.createContext(ctx);
vm.runInContext(fs.readFileSync(DIR + 'data.js', 'utf8'), ctx, { filename:'data.js' });
const g = expr => vm.runInContext(expr, ctx);

/* --- 1. 遊戲實際會請求哪些圖 --- */
const want = new Set();
const add = (pre, arr) => arr.forEach(k => want.add(pre + k));
add('mon/', g('Object.keys(ENEMIES).filter(k=>ENEMIES[k].img)'));
add('mon/', g('MINI_BOSSES.concat(LORD_BOSSES).filter(b=>b.img).map(b=>b.key)'));
if (g('FINAL_BOSS.img')) want.add('mon/final');
add('mon/', g('REALM_ELITES.flat().filter(e=>e.img).map(e=>e.key)'));
add('mon/', g('RUNTIME_MON_IMG'));                       // imgKey 借用，資料表推導不到
add('eq/',  g('Object.keys(WEAPON_TYPES)'));
add('eq/',  g('[...new Set(Object.values(ITEM_ICON))]'));
add('ui/',  g('[...new Set(Object.values(DOOR_IMG))]'));
add('ui/',  g('Object.keys(POTIONS).filter(k=>POTIONS[k].img).map(k=>POTIONS[k].img)'));
add('ui/',  g('[...new Set(Object.values(EV_IMG))]'));
add('ui/',  g('REALMS.filter(z=>z.bg).map(z=>z.bg)'));
// 場景／介面圖：這些在 code 裡是寫死的字串，沒有資料表可推導
add('ui/', ['res_death','smith','npc_smith','bg_market','title','title_bg',
            'cls_sword','cls_assassin','cls_white','cls_dark','coin','gem']);

/* --- 2. sw.js 登記了哪些 --- */
const swPath = DIR + '../sw.js';
if (!fs.existsSync(swPath)) {
  console.log('找不到 ../sw.js —— 這支要在「網站根目錄有掛進來」的情況下跑。');
  process.exit(1);
}
const sw = fs.readFileSync(swPath, 'utf8');
const PRE = { MON:'mon/', UI:'ui/', EQ:'eq/' };
const have = new Set();
for (const [, grp, body] of sw.matchAll(/const RPG_(MON|UI|EQ) = \[([\s\S]*?)\]\.map/g))
  for (const m of body.matchAll(/'([^']+)'/g)) have.add(PRE[grp] + m[1]);

/* --- 3. 檔案真的在硬碟上嗎 --- */
const exists = k => fs.existsSync(DIR + k + '.webp');

const missing = [...want].filter(k => !have.has(k)).sort();          // 離線會缺圖
const orphan  = [...have].filter(k => !want.has(k)).sort();          // 白佔快取
const nofile  = [...new Set([...want, ...have])].filter(k => !exists(k)).sort();
const cache   = (sw.match(/const CACHE = '([^']+)'/) || [,'?'])[1];

console.log(`sw.js CACHE = ${cache}`);
console.log(`遊戲會請求 ${want.size} 張 ｜ sw.js 登記 ${have.size} 張\n`);
const show = (label, arr, hint) => {
  if (!arr.length) { console.log(`✅ ${label}：無`); return false; }
  console.log(`❌ ${label}（${arr.length}）：${arr.join(', ')}\n   → ${hint}`);
  return true;
};
let bad = false;
bad = show('會請求但 sw.js 沒登記', missing, '離線會缺圖。補進 sw.js 的 RPG_* 並把 CACHE +1') || bad;
bad = show('sw.js 登記但遊戲不再請求', orphan, '白佔快取。確認真的不用了再從 sw.js 移除') || bad;
bad = show('清單有名字但檔案不存在', nofile, '檔名打錯，或圖還沒放進來') || bad;
console.log('\n' + (bad ? '❌ 有缺口，見上' : '✅ 三邊對得起來'));
process.exit(bad ? 1 : 0);
