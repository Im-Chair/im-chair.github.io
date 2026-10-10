/* ================= 地城（Roguelike 模式）=================
   一局 = 選隊長 → 10 層分支路線（戰鬥／精英／事件／商店／營火）→ 第 10 層魔王。死亡即結束，不能用魔石復活。
   隊伍每局重新組：隊長＋兩名同屬性隊員起手，之後靠三選一招募、遺物、符石強化成長，跟背包收藏完全分開。
   戰鬥直接沿用主程式的盤面與流程，主程式只在 stageInfo / genWaves / startBattle / win / lose / giveup
   各留一行 `kind==='rogue'` 的掛勾，進到這裡處理；遺物與敵人特性則走主程式的 RH(時點, 預設值, …) → 本檔 rgHook。
   共用主程式的全域（S、B、G、CARD、mkEnemy…），所以本檔必須在主程式之後載入（init 改在 DOMContentLoaded 才執行，見 index.html 最後）。

   階段：1 骨架 → 2 流派與遺物 → 3 敵人特性、精英、魔王機制 → 4 事件、商店、跨局解鎖與深淵難度（目前做到這裡）。
   擴充時盡量新增 RG_* 表格與 rg* 函式，別把邏輯塞回主程式。
   所有名稱旁的圖示都走 rgArt：rg/<key>.webp 有圖就用圖，沒有就用 emoji（清單見 美術需求_ChatGPT出圖.md 第 11 節）。 */

const RG_KEY = 'tower_orbs_rogue_v1';
const RG_FLOORS = 10;   // 第 10 層是魔王
const RG_COST = 10;     // 進入一局扣一次體力，房間之間不再扣
const RG_NODE = {
  battle: { n: '戰鬥', e: '⚔️', d: '兩波敵人，穩定取得獎勵' },
  elite:  { n: '精英', e: '💀', d: '強敵坐鎮，勝利可從三件遺物中挑一件' },
  event:  { n: '事件', e: '❓', d: '未知的遭遇，可能是機會也可能是陷阱' },
  shop:   { n: '商店', e: '🛒', d: '用本局的金幣購買遺物、隊員與補給' },
  rest:   { n: '營火', e: '🏕️', d: '回復生命，或讓全隊訓練' },
  boss:   { n: '魔王', e: '👑', d: '擊敗它，完成這次地城' },
};
const RG_ORDER = ['battle', 'elite', 'event', 'shop', 'rest', 'boss'];

// 存檔：run＝進行中的一局（null 表示沒有）；meta＝跨局紀錄
let RG = (() => {
  try {
    const d = JSON.parse(localStorage.getItem(RG_KEY));
    if (d && d.meta) {
      const r = d.run, M = d.meta;   // 舊版存檔缺的欄位補上預設值
      M.ascMax = M.ascMax || 0; M.ascSel = M.ascSel || 0;
      if (r) {
        r.relics = r.relics || []; r.orb = r.orb || {}; r.energy = r.energy || 0; r.core = r.core || 0;
        r.asc = r.asc || 0; r.curse = r.curse || 0; r.seenEv = r.seenEv || []; r.boss = r.boss || 'seal';
      }
      return d;
    }
  } catch (e) {}
  return { run: null, meta: { runs: 0, clears: 0, best: 0, ascMax: 0, ascSel: 0 } };
})();
function rgSave() { try { localStorage.setItem(RG_KEY, JSON.stringify(RG)) } catch (e) {} }

/* ---------- 難度曲線 ----------
   地城第 F 層對應到塔的強度 fEff，直接丟進主程式的 mkEnemy。
   起手隊伍（4★ Lv20 隊長＋兩張 3★ Lv15）打第 1 層約 2～3 回合一波；
   第 10 層魔王約等於塔 24 層的魔王，需要途中招募／訓練過的隊伍。 */
const rgFEff = F => Math.round(2 + F * 2.2);
const rgRecruitR = (F, elite) => clamp((F <= 3 ? 3 : F <= 6 ? 4 : 5) + (elite ? 1 : 0), 3, 6);
const rgRecruitLv = (r, F) => Math.min(maxLv(r), Math.round(maxLv(r) * .4) + F * 2);
const rgTraitP = F => F <= 1 ? 0 : Math.min(.75, .15 + F * .07);   // 普通敵人帶特性的機率
const RG_TRAIN = 6;     // 全隊訓練：每人 +6 級
const RG_REST_HEAL = .5;
const RG_CHARGE = 20;   // 蓄能水晶的能量上限
const RG_ORB_UP = .25;  // 符石強化每級 +25%
const RG_INTERRUPT = .2;   // 戰鬥中途離開 App，回來重打同一間要扣的生命比例
const RG_BARRIER = 6;   // 結界魔王：累計消除幾顆指定珠才破
const RG_ASC_STEP = .15, RG_ASC_MAX = 10;   // 深淵難度：每級敵人生命／攻擊 +15%

/* ---------- 美術：有圖用圖，沒圖用 emoji ----------
   rg/index.json 是 tools/process_art.py 產生的「目前有哪些圖」清單，只抓一次，避免逐張試抓一堆 404。 */
const RG_ART = new Set();
let rgArtLoaded = false;
function rgLoadArt() {
  if (rgArtLoaded) return; rgArtLoaded = true;
  fetch('rg/index.json').then(r => r.ok ? r.json() : []).then(list => {
    if (!Array.isArray(list) || !list.length) return;
    list.forEach(k => RG_ART.add(k));
    if (!B && UI.tab === 'tower' && UI.sub === 'rogue') render(true);
  }).catch(() => {});
}
const rgArt = (key, emo, px = 20) => RG_ART.has(key)
  ? `<img src="rg/${key}.webp" alt="" style="width:${px}px;height:${px}px;vertical-align:middle">`
  : `<span style="font-size:${px}px;line-height:1;vertical-align:middle">${emo}</span>`;

/* ---------- 遺物 ----------
   tag＝流派；en＝流派核心（選隊長時依屬性送一個）；req＝要先有該核心才會出現在獎勵裡（不然拿了沒用）；
   lock＝要先達成 RG_UNLOCK 的條件才會出現。效果全寫在下方 rgHook，各遺物只用 rgHas(id) 判斷。 */
const RG_TAG = { burn: '灼燒', shield: '護盾', heal: '溢療', prism: '五色', burst: '爆發', any: '通用' };
const RG_RELIC = {
  ember:    { n: '火種', e: '🔥', tag: 'burn', en: 1, d: '消除火珠令目標燃燒（一次 5 顆以上燒全體，珠越多層數越多）。每回合結束，燃燒中的敵人每層受到隊伍平均攻擊 30% 的傷害（無視防禦），之後層數 -1' },
  fuel:     { n: '助燃劑', e: '🛢️', tag: 'burn', req: 'ember', d: '燃燒傷害 ×1.6' },
  ash:      { n: '灰燼之心', e: '🖤', tag: 'burn', req: 'ember', d: '對燃燒中的敵人，轉珠傷害 ×1.3' },
  wildfire: { n: '野火', e: '🌋', tag: 'burn', req: 'ember', d: '燃燒中的敵人倒下時，剩下的層數蔓延給其他敵人' },
  tide:     { n: '潮汐護符', e: '🌊', tag: 'shield', en: 1, d: '消除水珠獲得護盾（每組約最大生命 6%，珠越多越高）。護盾先承受傷害，上限為最大生命 40%，只在當場戰鬥有效' },
  coral:    { n: '珊瑚之棘', e: '🪸', tag: 'shield', req: 'tide', d: '護盾擋下傷害時，以擋下量 ×3 反擊攻擊者' },
  abyss:    { n: '深海壓力', e: '🐚', tag: 'shield', req: 'tide', d: '開戰時獲得最大生命 30% 的護盾；護盾上限提高到 60%' },
  grail:    { n: '聖杯', e: '🏆', tag: 'heal', en: 1, d: '回復時超出生命上限的部分，×2 轉為對目標的傷害（無視防禦）' },
  spring:   { n: '生命之泉', e: '⛲', tag: 'heal', req: 'grail', d: '心珠回復量 ×1.5' },
  halo:     { n: '慈悲之環', e: '😇', tag: 'heal', req: 'grail', d: '每回合結束回復最大生命 6%' },
  prism:    { n: '五色稜鏡', e: '💎', tag: 'prism', en: 1, d: '同一回合消除水、火、木、光、暗五種珠，全隊攻擊力 ×2.5' },
  harmony:  { n: '調和之石', e: '☯️', tag: 'prism', req: 'prism', d: '稜鏡條件放寬為任意四種珠（心珠也算）' },
  rainbow:  { n: '虹之種', e: '🌈', tag: 'prism', req: 'prism', d: '觸發稜鏡的回合，全隊技能冷卻額外 -1' },
  cell:     { n: '蓄能水晶', e: '🔋', tag: 'burst', en: 1, d: `每消除一組珠子累積 1 能量（整局保留，上限 ${RG_CHARGE}）。能量滿時在戰鬥上方按 ⚡ 蓄勢，下一次攻擊全隊攻擊力 ×3` },
  coil:     { n: '過載線圈', e: '🧲', tag: 'burst', req: 'cell', d: '能量釋放的倍率由 ×3 提高到 ×5' },
  dynamo:   { n: '發電機', e: '⚙️', tag: 'burst', req: 'cell', d: '每場戰鬥開始時獲得 5 能量' },
  core:     { n: '共鳴核心', e: '🔮', tag: 'any', d: '本局每消除一組隊長屬性珠，隊長屬性隊員攻擊 +1%（整局累積，上限 +60%）' },
  greed:    { n: '貪婪之眼', e: '👁️', tag: 'any', lock: 'relics', d: '一回合 6 Combo 以上時，每 Combo 獲得 4 金幣；但受到的傷害 ×1.2' },
  glass:    { n: '逆轉沙漏', e: '⏳', tag: 'any', d: '每場戰鬥一次，可在戰鬥上方按 ⏳ 免費重排盤面' },
  watch:    { n: '延時之錶', e: '⏱️', tag: 'any', d: '轉珠時間 +1.5 秒' },
  rage:     { n: '狂戰士之血', e: '🩸', tag: 'any', d: '生命低於 50% 時，全隊攻擊力 ×1.5' },
  chain:    { n: '連鎖指環', e: '💍', tag: 'any', lock: 'relics', d: '天降消除（盤面落下後自然連成的）每組傷害 ×2' },
  bell:     { n: '共鳴鈴', e: '🔔', tag: 'any', lock: 'relics', d: '計算攻擊時 Combo 數 +2' },
};
// 隊長屬性決定起手遺物（＝這局一開始往哪個流派走）
const RG_START = { fire: 'ember', water: 'tide', wood: 'grail', light: 'prism', dark: 'cell' };
const rgHas = id => !!RG.run && RG.run.relics.includes(id);
const rgIco = (id, px = 20) => rgArt('relic-' + id, RG_RELIC[id].e, px);
const rgRelicLine = id => { const r = RG_RELIC[id]; return `${rgIco(id)} <b>${r.n}</b> <small>［${RG_TAG[r.tag]}］</small>` };

/* ---------- 敵人特性（第 3 階段） ----------
   普通敵人隨樓層越深越常帶一種特性；精英固定組合；魔王另有 RG_BOSS 機制。
   s＝戰鬥中盤面下方提示用的短句，d＝完整說明（戰鬥中按 🧿 看得到）。 */
const RG_TRAIT = {
  rage:  { n: '狂暴', e: '💢', s: '半血後攻擊↑', d: '生命低於一半時，攻擊力 ×1.6' },
  twin:  { n: '連擊', e: '🗡️', s: '攻擊×1.4', d: '每次攻擊連打兩下，總傷害 ×1.4' },
  regen: { n: '再生', e: '💚', s: '每回合回血', d: '每回合回復最大生命 8%' },
  drain: { n: '吸心', e: '🦇', s: '心珠被轉走', d: '攻擊時把盤面上 3 顆心珠變成自己屬性的珠' },
  shell: { n: '硬殼', e: '🐢', s: '不足5顆只有40%', d: '一次消不到 5 顆的那組珠，對牠只造成 40% 傷害' },
  ward:  { n: '連擊結界', e: '🔰', s: 'Combo<5傷害×0.2', d: '本回合 Combo 少於 5 時，對牠的轉珠傷害 ×0.2' },
  venom: { n: '劇毒', e: '☠️', s: '中毒', d: '攻擊附帶中毒：之後 3 回合，每回合失去最大生命 4%（不會致死）' },
  curse: { n: '詛咒', e: '🕯️', s: '技能冷卻+2', d: '攻擊時讓一名隊員的技能冷卻 +2' },
};
const RG_ELITE = [
  { n: '鐵壁', tr: ['shell', 'regen'] },
  { n: '狂戰', tr: ['rage', 'twin'] },
  { n: '咒術', tr: ['curse', 'drain', 'venom'] },
];
const RG_BOSS = {
  seal:    { n: '封印', e: '🔒', d: '每回合封印一種屬性：該屬性的珠不造成傷害、也不觸發遺物效果（盤面上變灰）' },
  barrier: { n: '結界', e: '🛡️', d: `結界展開時幾乎不受傷害（×0.05，技能也一樣）。累計消除 ${RG_BARRIER} 顆指定屬性的珠即可破除，之後 2 回合受到的傷害 ×1.5，然後換一種屬性重新展開` },
  shift:   { n: '變幻', e: '🎭', d: '生命降到 2/3 與 1/3 時變換成另一種屬性（剋制關係跟著變），並把盤面上的心珠變成新屬性' },
};
// 盤面封印的灰階樣式（只有封印魔王會設 #board 的 data-seal）
document.head.insertAdjacentHTML('beforeend', `<style>${ATTRS.map(a => `#board[data-seal="${a}"] .orb.a-${a}`).join(',')}{filter:grayscale(1) brightness(.5)}</style>`);

/* ---------- 跨局解鎖（第 4 階段） ---------- */
const RG_UNLOCK = [
  { id: 'gold',   n: '探險者錢袋', e: '👛', c: '最深到達第 5 層', ok: M => M.best >= 5,   d: '每局開始時帶 60 金幣' },
  { id: 'relics', n: '禁忌遺物',   e: '📜', c: '挑戰 3 次',       ok: M => M.runs >= 3,   d: '遺物池加入「貪婪之眼」「連鎖指環」「共鳴鈴」' },
  { id: 'lead4',  n: '第四位隊長', e: '👥', c: '通關 1 次',       ok: M => M.clears >= 1, d: '選隊長時多一位候選' },
  { id: 'asc',    n: '深淵難度',   e: '🌑', c: '通關 1 次',       ok: M => M.clears >= 1, d: `開局可選深淵等級：每級敵人生命與攻擊 +${RG_ASC_STEP * 100}%，通關魔石 +3。在最高等級通關會再開放下一級（上限 ${RG_ASC_MAX}）` },
  { id: 'kit',    n: '行囊',       e: '🎒', c: '通關 3 次',       ok: M => M.clears >= 3, d: '出發前先從三件通用遺物中挑一件' },
];
const rgUnl = id => { const u = RG_UNLOCK.find(x => x.id === id); return !!u && u.ok(RG.meta) };

/* ---------- 事件（第 4 階段） ----------
   o＝選項：l 標題、s 說明、can(run) 回傳 true 或「不能選的原因」、go(run) 套用效果並回傳結果文字。 */
const RG_EVENT = {
  altar: { n: '血之祭壇', e: '🗿', d: '祭壇上擺著一件散發微光的遺物，底座刻著：「以血換取」。', o: [
    { l: '獻上鮮血', s: '失去 25% 生命，取走遺物', can: r => r.hpR > .3 || '生命不足 30%，撐不住', go: r => { r.hpR -= .25; return rgGiveRelic(r) } },
    { l: '離開', s: '什麼都不做', go: () => '你沒有碰祭壇，繼續前進。' } ] },
  gamble: { n: '骰子商人', e: '🎲', d: '戴面具的商人搖著骰子：「押 60 金，運氣好拿回三倍。」', o: [
    { l: '押注', s: '付 60 金：一半機率拿回 180 金', can: r => r.gold >= 60 || '金幣不足 60', go: r => { r.gold -= 60; if (Math.random() < .5) { r.gold += 180; return `骰子停在六點！拿回 ${ico('coin')}180。` } return '骰子停在一點……商人笑著收走了金幣。' } },
    { l: '離開', s: '不賭', go: () => '你搖搖頭走開，商人聳了聳肩。' } ] },
  wanderer: { n: '迷途的冒險者', e: '🧭', d: '一名受傷的冒險者靠在牆邊，問能不能跟你同行。', o: [
    { l: '讓他加入', s: '獲得一名稀有度較高的隊員（隊伍已滿時改為指導全隊訓練 +8 級）', go: r => {
      if (r.team.length >= 5) { rgTrain(8); return '隊伍已經滿了。他留下來指導大家一陣子：全隊 +8 級。' }
      const rr = Math.min(6, rgRecruitR(r.floor, false) + 1), id = pick(POOL[rr]); r.team.push({ id, lv: rgRecruitLv(rr, r.floor) });
      return `${chip(CARD[id].attr)} <b>${CARD[id].name}</b>（${stars(rr)}）加入了隊伍。`;
    } },
    { l: '幫他包紮', s: '他留下藥草：回復 30% 生命', go: r => { r.hpR = Math.min(1, r.hpR + .3); return '他道謝後離開，留下的藥草讓你恢復了精神。' } } ] },
  fountain: { n: '深淵之泉', e: '🫧', d: '泉水清澈見底，深處卻閃著五色的光。', o: [
    { l: '喝一口', s: '回復全部生命', go: r => { r.hpR = 1; return '冰涼的泉水流過全身，隊伍完全恢復了。' } },
    { l: '潛入深處', s: '隨機一種符石強化 +2，但失去 20% 生命', can: r => r.hpR > .25 || '生命不足 25%，潛不下去', go: r => {
      const a = rgOrbPick(); r.orb[a] = (r.orb[a] || 0) + 2; r.hpR -= .2;
      return `你在水底握住一顆發光的珠子：${AE[a]} ${AN[a]}珠強化 +2。`;
    } } ] },
  chest: { n: '詛咒寶箱', e: '🧰', d: '一個纏著黑色鎖鏈的寶箱。打開它的聲音，一定會吵醒附近的怪物。', o: [
    { l: '打開', s: '獲得遺物，但下一場戰鬥的敵人攻擊 ×1.4', go: r => { r.curse = 1; return rgGiveRelic(r) + '<br><small>遠處傳來低吼……下一場戰鬥的敵人攻擊 ×1.4。</small>' } },
    { l: '不碰它', s: '安全第一', go: () => '你繞過寶箱，繼續前進。' } ] },
};
function rgGiveRelic(r) {
  const id = rgRelicPick(1)[0];
  if (id) { r.relics.push(id); return `獲得遺物 ${rgRelicLine(id)}<br><small>${RG_RELIC[id].d}</small>` }
  const a = rgOrbPick(); r.orb[a] = (r.orb[a] || 0) + 1;   // 遺物都拿光了
  return `遺物已經全部到手，改為 ${AE[a]} ${AN[a]}珠強化 +1。`;
}

/* ---------- 路線 ---------- */
function rgChoices(F) {
  if (F >= RG_FLOORS) return ['boss'];
  if (F === 1) return ['battle', 'battle'];
  if (F === RG_FLOORS - 1) return ['elite', 'shop', 'rest'];   // 魔王前一定有營火與商店可選
  const w = { battle: 5, elite: F >= 3 ? 2 : 0, event: 2.5, shop: F >= 3 ? 1.2 : 0, rest: F >= 4 ? 1.5 : 0 };
  const out = F === 5 ? ['shop'] : [];   // 中段保證一間商店
  while (out.length < 3) { const k = wpick(Object.keys(w), x => w[x]); if (k === 'battle' || !out.includes(k)) out.push(k) }
  return out.sort((a, b) => RG_ORDER.indexOf(a) - RG_ORDER.indexOf(b));
}

/* ---------- 隊伍 ---------- */
// 同屬性、同稀有度、不同進化線的卡（隊長技對同屬性生效，起手隊員選同屬性才吃得到）
function rgCardOf(attr, r, notFam) {
  const ids = POOL[r].filter(id => CARD[id].attr === attr && CARD[id].fam !== notFam);
  return pick(ids.length ? ids : POOL[r].filter(id => CARD[id].attr === attr));
}
function rgTeam() { return RG.run.team.map(m => mkMember(CARD[m.id], m.lv, false, 1)) }
function rgTeamHTML(act) {
  return `<div class="grid g5">${RG.run.team.map((m, i) => miniD(CARD[m.id], { lv: m.lv, act, id: String(i) })).join('')}</div>`;
}
function rgTrain(n) { RG.run.team.forEach(m => m.lv = Math.min(maxLv(CARD[m.id].rarity), m.lv + n)) }
function rgBuildHTML() {
  const run = RG.run, orbs = Object.keys(run.orb).filter(a => run.orb[a]);
  return `<div data-act="rgRelics" style="cursor:pointer;margin-top:10px;display:flex;flex-wrap:wrap;gap:4px;align-items:center;font-size:13px">
    <span style="color:var(--muted)">遺物</span>${run.relics.map(id => `<span title="${RG_RELIC[id].n}">${rgIco(id, 22)}</span>`).join('')}
    ${orbs.length ? `<span style="color:var(--muted);margin-left:8px">符石</span>${orbs.map(a => `<span>${AE[a]}+${run.orb[a]}</span>`).join(' ')}` : ''}
    ${rgHas('cell') ? `<span style="margin-left:8px">⚡${run.energy}/${RG_CHARGE}</span>` : ''}
    <small style="margin-left:auto;color:var(--muted)">詳情 ›</small></div>`;
}

/* ---------- 主畫面（爬塔 → 地城 分頁） ---------- */
function rRogue() {
  rgLoadArt();
  const run = RG.run, M = RG.meta;
  if (!run) {
    const asc = rgUnl('asc') ? `<div style="display:flex;align-items:center;gap:8px;margin-top:10px;font-size:13px">
        ${rgArt('unlock-asc', '🌑', 18)} 深淵等級
        <button class="btn sm ghost" data-act="rgAsc" data-v="-1">－</button><b style="min-width:20px;text-align:center">${M.ascSel}</b><button class="btn sm ghost" data-act="rgAsc" data-v="1">＋</button>
        <small style="color:var(--muted)">敵人 +${Math.round(M.ascSel * RG_ASC_STEP * 100)}%・最高 ${M.ascMax}</small></div>` : '';
    return `<div class="hint">每次進入地城都從頭組隊：選一位隊長出發，沿途在三選一中招募隊員、收集<b>遺物</b>、強化符石，
      走過 ${RG_FLOORS} 層分支路線（戰鬥、精英、事件、商店、營火）後挑戰魔王。<b>倒下就結束</b>，不能用魔石復活。
      <br>隊長的屬性決定起手遺物（流派方向），途中拿到的遺物會再把你往別的方向推。隊伍與背包收藏分開，抽卡運氣不影響這裡的強弱。通關可帶回魔石與金幣。</div>
      <div class="panel"><h3>🌀 深淵地城</h3>
        <div class="statline"><div>挑戰<b>${M.runs}</b></div><div>通關<b>${M.clears}</b></div><div>最深<b>${M.best} 層</b></div></div>
        ${asc}
        <button class="btn gold full" style="margin-top:10px" data-act="rgStart">進入地城　${ico('stam')}${RG_COST}</button>
      </div>
      <div class="panel"><h3>🔓 解鎖</h3>
        ${RG_UNLOCK.map(u => { const ok = u.ok(M); return `<div class="sec" style="display:flex;gap:10px;align-items:center${ok ? '' : ';opacity:.55'}">
          <div style="flex:none">${rgArt('unlock-' + u.id, u.e, 26)}</div>
          <div><b>${u.n}</b> <small>${ok ? '✅ 已解鎖' : '🔒 ' + u.c}</small><br><small>${u.d}</small></div></div>`; }).join('')}
      </div>`;
  }
  const hp = Math.round(run.hpR * 100);
  let h = `<div class="panel">
    <div style="display:flex;justify-content:space-between;align-items:baseline"><h3 style="margin:0">🌀 地城 第 ${run.floor} / ${RG_FLOORS} 層${run.asc ? ` <small style="color:var(--muted)">深淵 ${run.asc}</small>` : ''}</h3><span>${ico('coin')}${fmt(run.gold)}</span></div>
    <div style="margin:8px 0 2px;font-size:12px;color:var(--muted)">隊伍生命 ${hp}%${run.curse ? '　<span style="color:var(--bad)">🧰 詛咒：下一場敵人攻擊 ×1.4</span>' : ''}</div>
    <div style="height:8px;border-radius:4px;background:#0006;overflow:hidden"><i style="display:block;height:100%;width:${hp}%;background:${hp < 30 ? 'var(--bad)' : 'var(--ok)'}"></i></div>
    <div style="margin-top:10px">${rgTeamHTML('rgMember')}</div>
    ${rgBuildHTML()}
  </div>`;
  if (run.phase === 'reward') {
    h += `<button class="btn gold full" data-act="rgReward">🎁 ${run.bonus ? '挑選出發前的遺物' : '領取戰鬥獎勵'}</button>`;
  } else if (run.phase === 'shop') {
    h += `<button class="btn gold full" data-act="rgShop">🛒 回到商店</button>`;
  } else if (run.phase === 'event') {
    h += `<button class="btn gold full" data-act="rgEvent">❓ 繼續事件</button>`;
  } else if (run.phase === 'battle') {
    const n = RG_NODE[run.room.node];
    h += `<div class="hint" style="margin-top:4px">上一場戰鬥（${n.e} ${n.n}）中途離開了。重新挑戰同一個房間，但要付出 ${RG_INTERRUPT * 100}% 生命的代價。</div>
      <button class="btn gold full" data-act="rgResume">重新挑戰</button>`;
  } else {
    h += `<div class="hint" style="margin-top:4px">選擇下一個房間：</div>`;
    run.choices.forEach((k, i) => {
      const n = RG_NODE[k], a = ATTRS[(run.floor + i) % 5], fight = ['battle', 'elite', 'boss'].includes(k);
      const d = k === 'boss' ? `${rgArt('boss-' + run.boss, RG_BOSS[run.boss].e, 14)} ${RG_BOSS[run.boss].n}：${RG_BOSS[run.boss].d}` : n.d;
      h += `<div class="floor a-${fight ? a : 'heart'}" data-act="rgGo" data-i="${i}"><div class="fn" style="display:grid;place-items:center">${rgArt('node-' + k, n.e, RG_ART.has('node-' + k) ? 44 : 26)}</div>
        <div class="fi"><b>${n.n}</b><div>${d}</div></div><div class="fc">${fight ? AE[a] : ''}</div></div>`;
    });
    if (run.floor < RG_FLOORS) h += `<div class="hint" style="margin-top:6px">${rgArt('node-boss', '👑', 14)} 第 ${RG_FLOORS} 層魔王：${rgArt('boss-' + run.boss, RG_BOSS[run.boss].e, 14)} <b>${RG_BOSS[run.boss].n}</b>——${RG_BOSS[run.boss].d}</div>`;
  }
  h += `<div class="row"><button class="btn ghost" data-act="rgQuit">放棄這次地城</button></div>`;
  return h;
}
ACT.rgAsc = t => { const M = RG.meta; M.ascSel = clamp(M.ascSel + +t.dataset.v, 0, M.ascMax); rgSave(); render(true) };
ACT.rgRelics = () => {
  const run = RG.run; if (!run) return;
  const orbs = Object.keys(run.orb).filter(a => run.orb[a]);
  openModal(`<h3>🧿 本局遺物（${run.relics.length}）</h3>
    ${B && B.rg ? rgFoeHTML() : ''}
    ${run.relics.map(id => `<div class="sec">${rgRelicLine(id)}<br>${RG_RELIC[id].d}</div>`).join('')}
    ${orbs.length ? `<div class="sec"><b>符石強化</b><br>${orbs.map(a => `${AE[a]} ${AN[a]}珠 Lv${run.orb[a]}（${a === 'heart' ? '回復' : '傷害'} +${Math.round(run.orb[a] * RG_ORB_UP * 100)}%）`).join('<br>')}</div>` : ''}
    ${rgHas('cell') ? `<div class="sec">⚡ 能量 ${run.energy} / ${RG_CHARGE}</div>` : ''}
    ${rgHas('core') ? `<div class="sec">🔮 共鳴核心：隊長屬性攻擊 +${Math.min(60, run.core)}%</div>` : ''}
    <button class="btn ghost full" style="margin-top:8px" data-act="close">關閉</button>`, 'wide');
};
// 戰鬥中：目前這波敵人的特性完整說明
function rgFoeHTML() {
  const foes = rgAlive().filter(e => e.bm || (e.tr && e.tr.length));
  if (!foes.length) return '';
  return `<div class="sec" style="border-color:var(--bad)"><b>⚠️ 敵人特性</b>${foes.map(e => `<br><b>${e.name}</b>
    ${e.bm ? `<br>${rgArt('boss-' + e.bm, RG_BOSS[e.bm].e, 14)} ${RG_BOSS[e.bm].n}：<small>${RG_BOSS[e.bm].d}</small>` : ''}
    ${(e.tr || []).map(k => `<br>${rgArt('trait-' + k, RG_TRAIT[k].e, 14)} ${RG_TRAIT[k].n}：<small>${RG_TRAIT[k].d}</small>`).join('')}`).join('')}</div>`;
}

/* ---------- 開局：選隊長 ---------- */
ACT.rgStart = () => {
  if (S.stam < RG_COST) return toast('體力不足');
  const attrs = [...ATTRS].sort(() => Math.random() - .5).slice(0, rgUnl('lead4') ? 4 : 3);
  UI.rgLead = attrs.map(a => rgCardOf(a, 4));
  openModal(`<h3>選擇隊長</h3><div class="hint" style="margin:0 0 8px">隊長技會影響整局，隊長的屬性決定起手遺物。隊長之外，會再給你兩名同屬性的 3★ 隊員。</div>
    ${UI.rgLead.map((id, i) => { const d = CARD[id], rid = RG_START[d.attr], rl = RG_RELIC[rid]; return `<div class="sec" data-act="rgLead" data-i="${i}" style="cursor:pointer;display:flex;gap:10px;align-items:center">
      <div style="width:64px;flex:none">${miniD(d, { lv: 20 })}</div>
      <div><b>${chip(d.attr)} ${d.name}</b><br><small>👑 ${lsText(d.ls)}</small>${d.as ? `<br><small>✨ ${SKN[d.as.type]}：${skText(d.as)}</small>` : ''}
        <br><small>🧿 起手遺物 ${rgIco(rid, 16)} <b>${rl.n}</b>［${RG_TAG[rl.tag]}］：${rl.d}</small></div></div>`; }).join('')}
    <button class="btn ghost full" style="margin-top:8px" data-act="close">取消</button>`, 'wide');
};
ACT.rgLead = t => {
  const lead = CARD[UI.rgLead[+t.dataset.i]];
  if (S.stam < RG_COST) return toast('體力不足');
  const wasFull = S.stam >= stamMax(); S.stam -= RG_COST; if (wasFull) S.stamT = Date.now(); save(); hud();
  const run = RG.run = {
    floor: 1, hpR: 1, gold: rgUnl('gold') ? 60 : 0, phase: 'map',
    team: [{ id: lead.id, lv: 20 }, { id: rgCardOf(lead.attr, 3, lead.fam), lv: 15 }, { id: rgCardOf(lead.attr, 3, lead.fam), lv: 15 }],
    relics: [RG_START[lead.attr]], orb: {}, energy: 0, core: 0,
    asc: rgUnl('asc') ? RG.meta.ascSel : 0, curse: 0, seenEv: [], boss: pick(Object.keys(RG_BOSS)),
    choices: rgChoices(1),
  };
  const had = RG_UNLOCK.filter(u => u.ok(RG.meta)).map(u => u.id);
  RG.meta.runs++;   // 「挑戰次數」類的解鎖在出發時就成立，這裡提示（其他的在結算畫面提示）
  RG_UNLOCK.filter(u => u.ok(RG.meta) && !had.includes(u.id)).forEach(u => toast(`🔓 解鎖：${u.n}`));
  if (rgUnl('kit')) {   // 行囊：出發前先挑一件通用遺物
    run.phase = 'reward'; run.bonus = true;
    run.reward = rgRelicPick(3, id => RG_RELIC[id].tag === 'any').map(id => ({ t: 'relic', id }));
  }
  rgSave(); closeAll(); render();
  if (run.bonus) rgShowReward();
};

/* ---------- 選房間 ---------- */
// 進戰鬥前先把 phase 存成 'battle'：中途關掉 App 回來不能改選房間，只能付代價重打同一間
function rgFight(room) {
  const run = RG.run;
  run.phase = 'battle'; run.room = room; rgSave();
  startBattle({ kind: 'rogue', node: room.node, F: run.floor, a: room.a, bm: room.bm }, null);
}
ACT.rgGo = t => {
  const run = RG.run; if (!run || run.phase !== 'map') return;
  const i = +t.dataset.i, k = run.choices[i];
  if (k === 'rest') return rgRest();
  if (k === 'shop') { run.phase = 'shop'; run.shop = rgShopGen(run.floor); rgSave(); render(true); return rgShowShop() }
  if (k === 'event') {
    const left = Object.keys(RG_EVENT).filter(id => !run.seenEv.includes(id));
    run.ev = pick(left.length ? left : Object.keys(RG_EVENT)); run.seenEv.push(run.ev);
    run.phase = 'event'; rgSave(); render(true); return rgShowEvent();
  }
  rgFight({ node: k, a: ATTRS[(run.floor + i) % 5], bm: k === 'boss' ? run.boss : undefined });
};
ACT.rgResume = () => {
  const run = RG.run; if (!run || run.phase !== 'battle' || B) return;
  run.hpR = Math.max(.05, run.hpR - RG_INTERRUPT);
  rgFight(run.room);
};

// 主程式 stageInfo / genWaves 的地城分支
function rgStageInfo(s) {
  const n = RG_NODE[s.node];
  return { f: rgFEff(s.F), name: `地城 ${s.F}F · ${n.n}`, sub: n.d, attr: s.a, cost: 0, exp: 0, coins: 0, first: 0, tb: 6 };
}
function rgGenWaves(s, info) {
  const run = RG.run, f = info.f, a = info.attr, F = s.F;
  const mob = n => Array.from({ length: n }, () => {
    const e = mkEnemy(f, pick(ATTRS), false);
    if (Math.random() < rgTraitP(F)) e.tr = [pick(Object.keys(RG_TRAIT))];
    return e;
  });
  let waves;
  if (s.node === 'battle') waves = [mob(ri(2, 3)), mob(ri(2, 3))];
  else if (s.node === 'elite') {
    const t = pick(RG_ELITE), e = mkEnemy(f, a, false, { hp: 3.2, atk: 1.35 });
    e.name = t.n + '·' + e.name; e.elite = true; e.cd = e.cdMax = 3; e.tr = [...t.tr];
    waves = [mob(2), [e]];
  } else {
    const bm = s.bm || pick(Object.keys(RG_BOSS)), e = mkEnemy(f, a, true, { hp: 1.8, atk: 1.15 });
    e.bm = bm; e.tr = ['rage']; e.name = RG_BOSS[bm].n + '·' + e.name;
    waves = [mob(3), [e]];
  }
  const k = 1 + RG_ASC_STEP * (run.asc || 0), ck = run.curse ? 1.4 : 1;
  waves.flat().forEach(e => { e.hp = e.max = Math.round(e.max * k); e.atk = Math.round(e.atk * k * ck); e.coin = ri(6, 12) + F * 2; e.drops = [] });
  return waves;
}
// 開戰：生命跨房間延續（主程式開戰時會設成滿血，這裡改回本局剩餘比例），並建立本場的遺物狀態 B.rg
function rgOnBattleStart(b) {
  const run = RG.run;
  b.hp = Math.max(1, Math.round(b.max * run.hpR));
  b.rg = { lead: CARD[run.team[0].id].attr, shield: 0, over: 0, armed: false, glass: false, prismNow: false, seal: null, venom: 0 };
  if (rgHas('abyss')) b.rg.shield = Math.round(b.max * .3);
  if (rgHas('watch')) b.timeMax += 1.5;
  if (rgHas('dynamo')) run.energy = Math.min(RG_CHARGE, run.energy + 5);
  $('#bt-dropn').hidden = true;   // 地城不掉卡，把位置讓給遺物按鈕
  $('#battle .bt-top [data-act="giveup"]').insertAdjacentHTML('beforebegin', '<span id="rg-bar" style="display:flex;gap:4px;flex:none"></span>');
  rgSync();
}

/* ---------- 戰鬥中的掛勾（主程式 RH 呼叫進來） ----------
   combo     攻擊計算用的 Combo 數        atkAll 本回合全隊倍率（順便累積各流派資源、結界進度）
   dmg       每組珠對每個敵人的倍率        eMul   技能對敵人的倍率（結界）
   heal      心珠回復量                    kill   敵人倒下
   eAct      敵人出手（特性效果），回傳攻擊倍率   hurt   敵人打過來的傷害（回傳 0 表示全擋）
   after     我方攻擊結束、敵人行動前（燃燒、溢療、持續回復、變幻）
   turnStart 敵人行動後、輪到玩家前（中毒、再生、封印輪替、結界倒數）
   wave      新一波敵人出現 */
function rgHook(n, v, ...a) {
  const run = RG.run, b = B.rg;
  switch (n) {
    case 'combo': return v + (rgHas('bell') ? 2 : 0);
    case 'atkAll': return rgOnCombos();
    case 'dmg': {
      const [m, c, e] = a;
      if (c.t === b.seal) return 0;
      let x = (1 + RG_ORB_UP * (run.orb[c.t] || 0)) * rgTakeMul(e);
      if (rgHas('core') && m.attr === b.lead) x *= 1 + Math.min(.6, run.core * .01);
      if (rgHas('ash') && e.burn > 0) x *= 1.3;
      if (rgHas('chain') && c.cas) x *= 2;
      if (rgTr(e, 'shell') && c.n < 5) x *= .4;
      if (rgTr(e, 'ward') && B.combos.length < 5) x *= .2;
      return x;
    }
    case 'eMul': return v * rgTakeMul(a[0]);
    case 'heal': {
      const h = v * (1 + RG_ORB_UP * (run.orb.heart || 0)) * (rgHas('spring') ? 1.5 : 1);
      b.over += Math.max(0, B.hp + h - B.max);
      return h;
    }
    case 'kill': {
      const e = v;
      if (rgHas('wildfire') && e.burn > 0) {
        const o = rgAlive();
        o.forEach(x => { x.burn = (x.burn || 0) + e.burn; rgTag(x) });
        if (o.length) popOn(e.el, '🌋', '');
      }
      e.burn = 0; e.tag = '';
      if (e.bm === 'seal') rgSetSeal(null);
      rgTip();
      return v;
    }
    case 'eAct': return v * rgEnemyAct(a[0]);
    case 'hurt': {
      const e = a[0]; let d = v;
      if (rgHas('greed')) d = Math.round(d * 1.2);
      if (b.shield > 0) {
        const ab = Math.min(b.shield, d); b.shield -= ab; d -= ab;
        popOn($('#bt-hpbar'), '💠-' + fmt(ab), '');
        if (rgHas('coral') && e.hp > 0) hit(e, Math.max(1, Math.round(ab * 3 * rgTakeMul(e))), 'water', 'crit');
        rgSync();
      }
      return d;
    }
    case 'after': return rgAfter();
    case 'turnStart': return rgTurnStart();
    case 'wave': return rgWave();
  }
  return v;
}
const rgAlive = () => B.enemies.filter(e => e.hp > 0);
const rgTr = (e, k) => !!e.tr && e.tr.includes(k);
const rgShieldCap = () => Math.round(B.max * (rgHas('abyss') ? .6 : .4));
const rgTakeMul = e => e.bm === 'barrier' ? (e.barrier ? .05 : 1.5) : 1;   // 結界：展開時幾乎無傷，破除後 ×1.5

// 敵人頭上的狀態列：特性圖示＋魔王機制＋燃燒層數
function rgTag(e) {
  let t = (e.tr || []).map(k => rgArt('trait-' + k, RG_TRAIT[k].e, 16)).join('');
  if (e.bm === 'seal' && B.rg.seal) t += ` 🔒${AE[B.rg.seal]}`;
  if (e.bm === 'barrier') t += e.barrier ? ` 🛡️${AE[e.need]}${e.prog}/${RG_BARRIER}` : ` 💥${e.brk}`;
  if (e.bm === 'shift') t += ' ' + rgArt('boss-shift', '🎭', 16);
  if (e.burn > 0) t += ` 🔥${e.burn}`;
  e.tag = t; if (e.el) updEnemy(e);
}
// 盤面下方的提示列：這波敵人有哪些需要注意的特性
function rgTip() {
  const b = B.rg, out = [], seen = new Set();
  rgAlive().forEach(e => {
    if (e.bm === 'seal' && b.seal) out.push(`🔒本回合${AN[b.seal]}珠無效`);
    if (e.bm === 'barrier') out.push(e.barrier ? `🛡️消${AN[e.need]}珠 ${e.prog}/${RG_BARRIER} 破結界` : `💥結界破除（${e.brk}回合）`);
    if (e.bm === 'shift') out.push('🎭2/3、1/3血時變換屬性');
    (e.tr || []).forEach(k => { if (!seen.has(k)) { seen.add(k); out.push(RG_TRAIT[k].e + RG_TRAIT[k].s) } });
  });
  B.tipX = out.length ? out.join('・') + '　（🧿看詳情）' : '';
  if (B.phase === 'idle') tip();
}
function rgSetSeal(a) {
  B.rg.seal = a;
  const bd = $('#board'); if (bd) bd.dataset.seal = a || '';
}
function rgReseal() {
  const a = pick(ATTRS.filter(x => x !== B.rg.seal));
  rgSetSeal(a); banner(`🔒 ${AN[a]}珠被封印`);
}
const rgNeed = e => pick(ATTRS.filter(x => x !== e.need));
function rgWave() {
  rgSetSeal(null);
  rgAlive().forEach(e => {
    if (e.bm === 'seal') rgReseal();
    if (e.bm === 'barrier') { e.barrier = 1; e.prog = 0; e.need = rgNeed(e) }
    if (e.bm === 'shift') e.ph = 0;
  });
  rgAlive().forEach(rgTag); rgTip();
}
function rgShift(e) {
  const old = e.attr, na = pick(ATTRS.filter(a => a !== old));
  e.attr = na; e.bi = ATTRS.indexOf(na);
  e.el.classList.replace('a-' + old, 'a-' + na);
  e.el.querySelector('.ab').textContent = AN[na];
  e.el.querySelector('.face').innerHTML = `<i class="spr s-boss bsp" style="--bx:${e.bi % 4};--by:${Math.floor(e.bi / 4)}"></i>`;
  G.forEach(row => row.forEach(o => { if (o && o.t === 'heart') { setOrb(o, na); o.el.classList.add('flash'); setTimeout(() => o.el.classList.remove('flash'), 420) } }));
  banner(`🎭 變幻為${AN[na]}屬性`); beep(330, .3, 'sawtooth', .05);
}
// 敵人出手時的特性效果，回傳攻擊倍率
function rgEnemyAct(e) {
  const b = B.rg; let x = 1;
  if (rgTr(e, 'rage') && e.hp < e.max * .5) { x *= 1.6; popOn(e.el, '💢', '') }
  if (rgTr(e, 'twin')) { x *= 1.4; popOn(e.el, '×2', '') }
  if (rgTr(e, 'drain')) {
    const hs = []; G.forEach(row => row.forEach(o => { if (o && o.t === 'heart') hs.push(o) }));
    hs.sort(() => Math.random() - .5).slice(0, 3).forEach(o => { setOrb(o, e.attr); o.el.classList.add('flash'); setTimeout(() => o.el.classList.remove('flash'), 420) });
  }
  if (rgTr(e, 'venom')) b.venom = 3;
  if (rgTr(e, 'curse')) {
    const ms = B.team.filter(m => m.as);
    if (ms.length) {
      const m = pick(ms); m.cdLeft += 2; rTeamB();
      const el = $$('#bt-team .tm')[B.team.indexOf(m)]; if (el) popOn(el, '🕯️+2', '');
    }
  }
  if (b.venom) rgSync();
  return x;
}

// 本回合消除結果：累積各流派資源、推進結界，回傳全隊攻擊倍率
function rgOnCombos() {
  const run = RG.run, b = B.rg, cs = B.combos.filter(c => c.t !== b.seal);   // 被封印的屬性不觸發任何效果
  let x = 1;
  if (rgHas('cell') && !b.armed) run.energy = Math.min(RG_CHARGE, run.energy + cs.length);
  if (rgHas('core')) run.core += cs.filter(c => c.t === b.lead).length;
  if (rgHas('tide')) {
    cs.filter(c => c.t === 'water').forEach(c => b.shield += B.max * .06 * om(c.n));
    b.shield = Math.min(Math.round(b.shield), rgShieldCap());
  }
  if (rgHas('ember')) {
    const tg = curTarget();
    cs.filter(c => c.t === 'fire').forEach(c => (c.all ? rgAlive() : tg ? [tg] : []).forEach(e => e.burn = (e.burn || 0) + 1 + Math.floor((c.n - 3) / 2)));
  }
  if (rgHas('prism')) {
    const kinds = new Set(cs.map(c => c.t));
    if (rgHas('harmony') ? kinds.size >= 4 : ATTRS.every(t => kinds.has(t))) { x *= 2.5; b.prismNow = true; banner('💎 五色稜鏡') }
  }
  if (rgHas('rage') && B.hp < B.max * .5) x *= 1.5;
  if (b.armed) { x *= rgHas('coil') ? 5 : 3; b.armed = false; banner('⚡ 能量釋放') }
  rgAlive().forEach(e => {
    if (e.bm !== 'barrier' || !e.barrier) return;
    e.prog += B.combos.filter(c => c.t === e.need).reduce((s, c) => s + c.n, 0);
    if (e.prog >= RG_BARRIER) { e.barrier = 0; e.brk = 2; e.prog = 0; banner('💥 結界破除'); beep(980, .3, 'triangle') }
  });
  rgAlive().forEach(rgTag); rgTip(); rgSync();
  return x;
}

async function rgAfter() {
  const run = RG.run, b = B.rg, my = B;
  rgAlive().forEach(e => {   // 變幻魔王：跌破門檻就換屬性
    if (e.bm !== 'shift') return;
    while ((e.ph || 0) < 2 && e.hp < e.max * [2 / 3, 1 / 3][e.ph || 0]) { e.ph = (e.ph || 0) + 1; rgShift(e) }
  });
  if (rgHas('halo')) {
    const h = Math.round(B.max * .06);
    b.over += Math.max(0, B.hp + h - B.max); healTeam(h); await sleep(300);
    if (B !== my || B.over) return;
  }
  if (rgHas('grail') && b.over > 0) {
    const e = curTarget();
    if (e) { hit(e, Math.max(1, Math.round(b.over * 2 * rgTakeMul(e))), 'light', 'heal'); await sleep(300); if (B !== my || B.over) return }
  }
  b.over = 0;
  if (rgHas('ember')) {
    const unit = B.team.reduce((s, m) => s + m.atk, 0) / B.team.length * .3 * (rgHas('fuel') ? 1.6 : 1);
    let any = false;
    for (const e of rgAlive()) {
      if (!(e.burn > 0) || e.hp <= 0) continue;
      const s = e.burn; e.burn--; rgTag(e);
      hit(e, Math.max(1, Math.round(s * unit * rgTakeMul(e))), 'fire', ''); any = true;
    }
    if (any) await sleep(350);
    if (B !== my || B.over) return;
  }
  if (b.prismNow) {
    b.prismNow = false;
    if (rgHas('rainbow')) { B.team.forEach(m => { if (m.cdLeft > 0) m.cdLeft-- }); rTeamB() }
  }
  if (rgHas('greed') && B.combos.length >= 6) {
    const g = B.combos.length * 4; run.gold += g; popOn($('#bt-hpbar'), `+${g}💰`, '');
  }
  rgAlive().forEach(rgTag); rgTip(); rgSync();
}

function rgTurnStart() {
  const b = B.rg;
  if (b.venom > 0) {   // 中毒不會致死
    const d = Math.min(B.hp - 1, Math.round(B.max * .04));
    if (d > 0) { B.hp -= d; popOn($('#bt-hpbar'), '☠️-' + fmt(d), 'dmg') }
    b.venom--;
  }
  rgAlive().forEach(e => {
    if (rgTr(e, 'regen') && e.hp < e.max) { const h = Math.min(e.max - e.hp, Math.round(e.max * .08)); e.hp += h; popOn(e.el, '+' + fmt(h), 'heal'); updEnemy(e) }
    if (e.bm === 'barrier' && !e.barrier && --e.brk <= 0) { e.barrier = 1; e.prog = 0; e.need = rgNeed(e); banner('🛡️ 結界重新展開') }
    if (e.bm === 'seal') rgReseal();
  });
  rgAlive().forEach(rgTag); rgTip(); rgSync();
}

// 戰鬥上方的遺物按鈕列＋生命條上的護盾／中毒
function rgSync() {
  if (!B || !B.rg) return;
  const run = RG.run, b = B.rg;
  B.hpTag = (b.shield > 0 ? `  💠${fmt(b.shield)}` : '') + (b.venom > 0 ? `  ☠️${b.venom}` : '');
  updHP();
  const bar = $('#rg-bar'); if (!bar) return;
  let h = `<button class="btn sm ghost" data-act="rgRelics">🧿${run.relics.length}</button>`;
  if (rgHas('cell')) h += `<button class="btn sm ${run.energy >= RG_CHARGE && !b.armed ? 'gold' : 'ghost'}" data-act="rgBurst">⚡${b.armed ? '蓄勢' : run.energy + '/' + RG_CHARGE}</button>`;
  if (rgHas('glass')) h += `<button class="btn sm ghost" data-act="rgGlass" ${b.glass ? 'disabled style="opacity:.4"' : ''}>⏳</button>`;
  bar.innerHTML = h;
}
ACT.rgBurst = () => {
  if (!B || !B.rg || B.over) return;
  const run = RG.run, b = B.rg;
  if (b.armed) return toast('已蓄勢，下一次攻擊就會釋放');
  if (run.energy < RG_CHARGE) return toast(`能量 ${run.energy} / ${RG_CHARGE}，還沒蓄滿`);
  if (B.phase !== 'idle') return toast('請在轉珠前使用');
  b.armed = true; run.energy = 0; banner('⚡ 蓄勢待發'); beep(880, .25, 'triangle'); rgSync();
};
ACT.rgGlass = () => {
  if (!B || !B.rg || B.over || B.rg.glass) return;
  if (B.phase !== 'idle') return toast('請在轉珠前使用');
  B.rg.glass = true; genBoard(); banner('⏳ 盤面重排'); beep(600, .2, 'triangle'); rgSync();
};

/* ---------- 戰鬥結束 ---------- */
function rgOnWin() {
  const run = RG.run, node = B.spec.node, elite = node === 'elite';
  B.over = true; B.phase = 'end';
  run.hpR = B.hp / B.max; run.gold += B.coins; run.curse = 0;
  beep(784, .4, 'triangle');
  if (node === 'boss') { closeAll(); endBattle(); return rgFinish(true) }
  run.phase = 'reward'; run.room = null; run.reward = rgRollRewards(run.floor, elite); rgSave();
  closeAll(); endBattle(); rgShowReward();
}
function rgOnLose() {
  B.over = true; B.phase = 'dead';
  closeAll(); endBattle(); rgFinish(false);
}

/* ---------- 三選一獎勵 ----------
   普通戰鬥：招募／（遺物或符石強化）／（訓練、補血或再一個招募）
   精英：三件遺物挑一件（遺物池不夠時用符石強化補）
   遺物抽選對「已經有的流派」加權，比較容易湊成套；其他流派的核心權重較低，但仍可能出現，讓你有轉向的機會。 */
function rgRelicPick(n, filter) {
  const own = RG.run.relics, tags = own.map(id => RG_RELIC[id].tag);
  const pool = Object.keys(RG_RELIC).filter(id => { const r = RG_RELIC[id];
    return !own.includes(id) && (!r.req || own.includes(r.req)) && (!r.lock || rgUnl(r.lock)) && (!filter || filter(id)) });
  const w = id => { const r = RG_RELIC[id]; return (r.en ? .6 : 1) * (r.tag === 'any' ? 1 : 1 + 1.5 * tags.filter(t => t === r.tag).length) };
  const out = [];
  while (out.length < n && pool.length) { const id = wpick(pool, w); out.push(id); pool.splice(pool.indexOf(id), 1) }
  return out;
}
const rgOrbPick = () => pick([...new Set(RG.run.team.map(m => CARD[m.id].attr)), 'heart']);
function rgRollRewards(F, elite) {
  if (elite) {
    const rs = rgRelicPick(3).map(id => ({ t: 'relic', id }));
    while (rs.length < 3) rs.push({ t: 'orb', a: rgOrbPick() });
    return rs;
  }
  const r = rgRecruitR(F, elite), lv = rgRecruitLv(r, F);
  const rec = () => ({ t: 'recruit', id: pick(POOL[r]), lv });
  const rl = rgRelicPick(1)[0];
  return [
    rec(),
    rl && Math.random() < .5 ? { t: 'relic', id: rl } : { t: 'orb', a: rgOrbPick() },
    pick([{ t: 'train', n: RG_TRAIN }, { t: 'heal', p: .35 }, rec()]),
  ];
}
// 獎勵／商品的顯示內容：[圖, 標題, 說明]
function rgOffer(o) {
  if (o.t === 'recruit') {
    const d = CARD[o.id];
    return [miniD(d, { lv: o.lv }), `招募 ${chip(d.attr)} ${d.name}`,
      `${d.ls ? '👑 ' + lsText(d.ls) + '<br>' : ''}${d.as ? '✨ ' + SKN[d.as.type] + '：' + skText(d.as) : '沒有主動技'}`];
  }
  if (o.t === 'relic') { const r = RG_RELIC[o.id]; return [rgIco(o.id, 40), `遺物 ${r.n} <small>［${RG_TAG[r.tag]}］</small>`, r.d] }
  if (o.t === 'orb') {
    const lv = RG.run.orb[o.a] || 0;
    return [AE[o.a], `強化${AN[o.a]}珠 Lv${lv}→${lv + 1}`, o.a === 'heart' ? `心珠回復量 +${RG_ORB_UP * 100}%` : `${AN[o.a]}珠造成的傷害 +${RG_ORB_UP * 100}%`];
  }
  if (o.t === 'train') return ['📈', `全隊訓練 +${o.n} 級`, '所有隊員等級提升（不超過該稀有度上限）'];
  return ['💖', `回復 ${Math.round(o.p * 100)}% 生命`, `目前 ${Math.round(RG.run.hpR * 100)}%`];
}
function rgOfferHTML(o, attrs, side = '') {
  const [art, title, desc] = rgOffer(o);
  return `<div class="sec" ${attrs} style="cursor:pointer;display:flex;gap:10px;align-items:center${o.sold ? ';opacity:.35;pointer-events:none' : ''}">
    <div style="width:64px;flex:none;text-align:center;font-size:34px">${art}</div><div style="flex:1;min-width:0"><b>${title}</b><br><small>${desc}</small></div>${side}</div>`;
}
// 套用一項獎勵（招募時隊伍要有空位，滿了由呼叫端先處理替換）
function rgGrant(o) {
  const run = RG.run;
  if (o.t === 'recruit') run.team.push({ id: o.id, lv: o.lv });
  else if (o.t === 'relic') run.relics.push(o.id);
  else if (o.t === 'orb') run.orb[o.a] = (run.orb[o.a] || 0) + 1;
  else if (o.t === 'train') rgTrain(o.n);
  else run.hpR = Math.min(1, run.hpR + o.p);
}
function rgReplaceModal() {
  openModal(`<h3>隊伍已滿，要替換誰？</h3><div class="hint" style="margin:0 0 8px">隊長不能替換。</div>
    ${rgTeamHTML('rgReplace')}<button class="btn ghost full" style="margin-top:10px" data-act="close">返回</button>`, 'wide');
}
function rgShowReward() {
  const run = RG.run;
  openModal(`<h2 class="win">${run.bonus ? '🎒 出發前的準備' : `🏆 第 ${run.floor} 層突破`}</h2>
    <div class="hint" style="margin:0 0 8px;text-align:center">選一項帶走（隊伍 ${run.team.length} / 5・遺物 ${run.relics.length}）</div>
    ${run.reward.map((o, i) => rgOfferHTML(o, `data-act="rgPick" data-i="${i}"`)).join('')}
    <button class="btn ghost full" style="margin-top:8px" data-act="rgSkip">都不要，${run.bonus ? '直接出發' : '繼續前進'}</button>`, 'wide', true);
}
// 領完獎勵：出發前的行囊不前進樓層，其他照常進下一層
function rgAfterPick() {
  const run = RG.run;
  if (run.bonus) { run.bonus = false; run.phase = 'map'; run.reward = null; rgSave(); render(); return }
  rgNextFloor();
}
ACT.rgReward = () => rgShowReward();
ACT.rgSkip = () => { closeAll(); rgAfterPick() };
ACT.rgPick = t => {
  const run = RG.run, o = run.reward[+t.dataset.i];
  if (o.t === 'recruit' && run.team.length >= 5) { UI.rgRecruit = o; UI.rgThen = null; return rgReplaceModal() }
  rgGrant(o); closeAll(); rgAfterPick();
};
ACT.rgReplace = t => {
  const i = +t.dataset.id; if (!i) return toast('隊長不能替換');
  RG.run.team[i] = { id: UI.rgRecruit.id, lv: UI.rgRecruit.lv };
  closeAll();
  const then = UI.rgThen || rgAfterPick; UI.rgThen = null; then();
};

/* ---------- 商店（第 4 階段） ----------
   三件遺物＋符石強化＋稀有隊員＋補給，價格隨樓層上漲。沒花掉的金幣通關時加倍帶回，所以買不買是取捨。 */
function rgShopGen(F) {
  const pm = 1 + F * .06, p = n => Math.round(n * pm / 5) * 5;
  const items = rgRelicPick(3).map(id => { const r = RG_RELIC[id]; return { t: 'relic', id, price: p(r.tag === 'any' ? 100 : r.en ? 130 : 115) } });
  items.push({ t: 'orb', a: rgOrbPick(), price: p(70) });
  const r = rgRecruitR(F, true); items.push({ t: 'recruit', id: pick(POOL[r]), lv: rgRecruitLv(r, F), price: p(90) });
  items.push({ t: 'heal', p: .4, price: p(45) });
  return items;
}
function rgShowShop() {
  const run = RG.run;
  openModal(`<h2 class="win">${rgArt('node-shop', '🛒', 26)} 深淵商人</h2>
    <div class="hint" style="margin:0 0 8px;text-align:center">持有 ${ico('coin')}${fmt(run.gold)}・沒花掉的金幣通關時會加倍帶回</div>
    ${run.shop.map((o, i) => rgOfferHTML(o, `data-act="rgBuy" data-i="${i}"`,
      `<div style="flex:none;font-weight:800;font-size:13px;color:${o.sold ? 'var(--muted)' : run.gold >= o.price ? 'var(--gold)' : 'var(--bad)'}">${o.sold ? '已售出' : ico('coin') + o.price}</div>`)).join('')}
    <button class="btn gold full" style="margin-top:8px" data-act="rgShopLeave">離開商店，繼續前進</button>`, 'wide');
}
ACT.rgShop = () => rgShowShop();
ACT.rgBuy = t => {
  const run = RG.run, o = run && run.shop && run.shop[+t.dataset.i];
  if (!o || o.sold || run.phase !== 'shop') return;
  if (run.gold < o.price) return toast('金幣不足');
  const pay = () => { run.gold -= o.price; o.sold = true; rgSave(); closeAll(); render(true); rgShowShop() };
  if (o.t === 'recruit' && run.team.length >= 5) { UI.rgRecruit = o; UI.rgThen = pay; return rgReplaceModal() }
  rgGrant(o); pay();
};
ACT.rgShopLeave = () => { closeAll(); rgNextFloor() };

/* ---------- 事件 ---------- */
function rgShowEvent() {
  const run = RG.run, ev = RG_EVENT[run.ev];
  openModal(`<h2 class="win">${ev.n}</h2>
    <div style="text-align:center;margin:4px 0 8px">${rgArt('event-' + run.ev, ev.e, 64)}</div>
    <div class="hint" style="margin:0 0 8px;text-align:center">${ev.d}</div>
    ${ev.o.map((o, i) => { const c = o.can ? o.can(run) : true; return `<div class="sec" data-act="rgEv" data-i="${i}" style="cursor:pointer${c === true ? '' : ';opacity:.45'}">
      <b>${o.l}</b><br><small>${o.s}${c === true ? '' : `　<span style="color:var(--bad)">（${c}）</span>`}</small></div>`; }).join('')}`, 'wide', true);
}
ACT.rgEvent = () => rgShowEvent();
ACT.rgEv = t => {
  const run = RG.run; if (!run || run.phase !== 'event') return;
  const id = run.ev, ev = RG_EVENT[id], o = ev.o[+t.dataset.i];
  const c = o.can ? o.can(run) : true; if (c !== true) return toast(c);
  const msg = o.go(run);
  closeAll(); rgNextFloor();   // 先存檔前進，結果視窗只是顯示
  openModal(`<h3>${rgArt('event-' + id, ev.e, 22)} ${ev.n}</h3><div class="cfm">${msg}</div>
    <button class="btn gold full" style="margin-top:10px" data-act="close">繼續</button>`);
};

/* ---------- 營火 ---------- */
function rgRest() {
  const run = RG.run;
  openModal(`<h2 class="win">${rgArt('node-rest', '🏕️', 26)} 營火</h2><div class="hint" style="margin:0 0 8px;text-align:center">在火邊歇一會兒。只能選一件事。</div>
    <div class="sec" data-act="rgRestDo" data-v="heal" style="cursor:pointer"><b>💖 休息</b><br><small>回復 ${RG_REST_HEAL * 100}% 生命（目前 ${Math.round(run.hpR * 100)}%）</small></div>
    <div class="sec" data-act="rgRestDo" data-v="train" style="cursor:pointer"><b>📈 訓練</b><br><small>全隊 +${RG_TRAIN + 2} 級</small></div>
    <button class="btn ghost full" style="margin-top:8px" data-act="close">再想想</button>`, 'wide');
}
ACT.rgRestDo = t => {
  const run = RG.run;
  if (t.dataset.v === 'heal') run.hpR = Math.min(1, run.hpR + RG_REST_HEAL); else rgTrain(RG_TRAIN + 2);
  closeAll(); rgNextFloor();
};

function rgNextFloor() {
  const run = RG.run;
  RG.meta.best = Math.max(RG.meta.best, run.floor);
  run.floor++; run.phase = 'map'; run.reward = null; run.shop = null; run.ev = null; run.choices = rgChoices(run.floor);
  rgSave(); UI.tab = 'tower'; UI.sub = 'rogue'; render();
}

/* ---------- 結算 ---------- */
function rgFinish(won) {
  const run = RG.run, M = RG.meta, F = run.floor;
  const had = new Set(RG_UNLOCK.filter(u => u.ok(M)).map(u => u.id));
  const firstClear = won && !M.clears;
  let gems = 0, coins = won ? run.gold * 2 + 500 : Math.round(run.gold / 2);
  if (won) { M.clears++; gems = 5 + 3 * run.asc + (firstClear ? 10 : 0) }
  M.best = Math.max(M.best, won ? RG_FLOORS : F - 1);
  let ascUp = false;
  if (won && rgUnl('asc') && run.asc >= M.ascMax && M.ascMax < RG_ASC_MAX) { M.ascMax = run.asc + 1; ascUp = true }
  const fresh = RG_UNLOCK.filter(u => u.ok(M) && !had.has(u.id));
  S.coins += coins; S.gems += gems; save(); hud();
  RG.run = null; rgSave();
  UI.tab = 'tower'; UI.sub = 'rogue'; render();
  openModal(`<h2 class="win" ${won ? '' : 'style="color:var(--bad);text-shadow:none"'}>${won ? '👑 地城通關！' : '💀 倒在了第 ' + F + ' 層'}</h2>
    <div class="rw"><span>帶回金幣</span><b>${ico('coin')} +${fmt(coins)}</b></div>
    ${gems ? `<div class="rw"><span>${firstClear ? '首次通關' : '通關獎勵'}${run.asc ? `（深淵 ${run.asc}）` : ''}</span><b>${ico('gem')} +${gems}</b></div>` : ''}
    <div class="rw"><span>本局遺物</span><b>${run.relics.map(id => rgIco(id)).join('')}</b></div>
    ${fresh.map(u => `<div class="sec" style="border-color:var(--gold)">🔓 <b>解鎖：${rgArt('unlock-' + u.id, u.e, 18)} ${u.n}</b><br><small>${u.d}</small></div>`).join('')}
    ${ascUp && !fresh.some(u => u.id === 'asc') ? `<div class="sec" style="border-color:var(--gold)">🌑 深淵等級 ${M.ascMax} 已開放</div>` : ''}
    <div class="hint" style="margin-top:8px;text-align:center">${won ? '下一次，換一位隊長試試別的打法。' : '隊伍會重新組過——下一局又是新的開始。'}</div>
    <button class="btn gold full" style="margin-top:10px" data-act="close">返回</button>`, 'wide', true);
}
ACT.rgQuit = () => confirmBox('放棄這次地城？本局的隊伍會解散，只帶回一半金幣。', () => rgFinish(false), '放棄');

// 隊員詳情（點地城畫面上的隊員）
ACT.rgMember = t => {
  const m = RG.run.team[+t.dataset.id], d = CARD[m.id], st = statsAt(d, m.lv);
  openModal(`<h3>${chip(d.attr)} ${d.name} ${+t.dataset.id === 0 ? '👑' : ''}</h3>
    <div><span class="stars">${stars(d.rarity)}</span> Lv${m.lv} / ${maxLv(d.rarity)}　生命 ${fmt(st.hp)}　攻 ${fmt(st.atk)}　回 ${fmt(st.rcv)}</div>
    ${d.ls ? `<div class="sec"><b>👑 隊長技</b>${+t.dataset.id === 0 ? '' : '<small>（只有隊長生效）</small>'}<br>${lsText(d.ls)}</div>` : ''}
    ${d.as ? `<div class="sec"><b>✨ ${SKN[d.as.type]}</b><br>${skText(d.as)}</div>` : ''}
    <button class="btn ghost full" style="margin-top:8px" data-act="close">關閉</button>`);
};
