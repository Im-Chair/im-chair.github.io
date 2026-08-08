'use strict';
// ============ items.js — 裝備：生成/詞綴/裝備介面/鐵匠(精煉+重鑄)/深淵黑市 ============

function rollAffixVal(k, ri, floor, cyc){
  const A = AFFIXES[k];
  if(A.min === A.max && !AFFIX_BAND[k]) return A.min;
  const band = ROLL_BANDS[AFFIX_BAND[k]] || [[A.min,A.max],[A.min,A.max],[A.min,A.max],[A.min,A.max]];
  const [lo, hi] = band[ri];
  let v = rnd(lo, hi);
  const cc = (cyc != null) ? cyc : ((R && R.cycle > 0) ? R.cycle : 0);   // 明確輪迴優先（營地生裝備用），否則讀當前 run
  if(A.stat) v += Math.round(floor * 0.3 * cycK(cc));  // 素質吃樓層 +0.3/層；輪迴只放大樓層項，骰值常數不吃（與基礎值同軸成長）
  else if(cc > 0 && (AFFIX_BAND[k]==='hp' || AFFIX_BAND[k]==='mp'))
    v = Math.round(v * cycK(cc));                      // hp/mp 無樓層項，維持整值縮放
  return Math.max(1, v);
}

function rollRarity(floor, bonus, cycArg){ // bonus: 0一般 1精英 2首領；cycArg：營地生裝備要明確指定（R 為 null 會被當 cycle 0）
  // 錨點制(§掉落)：白80→40、橙5→20 隨深度(prog=輪迴+樓層/100，本源50→prog0.5、輪迴III100→prog4)線性；
  // 加成:精英 白×0.7橙×1.5、首領 白×0.5橙×2；藍/金填剩餘(越深金越多)。雜魚主掉白(高基礎填補)、橙靠首領與輪迴。
  const cyc = (cycArg != null) ? cycArg : ((R&&R.cycle)||0);
  const p = cyc + floor/100;
  let W = 80 - (80-40)*(p-0.5)/3.5;
  let O = 5  + (20-5 )*(p-0.5)/3.5;
  const bW = [1,0.7,0.5][bonus] || 1, bO = [1,1.5,2][bonus] || 1;
  W = Math.max(2, W*bW); O = Math.max(1, O*bO);
  const rem = Math.max(0, 100 - W - O);
  const gFrac = Math.min(0.8, Math.max(0.4, 0.5 + 0.15*(p-0.5)/3.5));
  const g = rem*gFrac, b = rem*(1-gFrac);
  const total = W+b+g+O; let r = Math.random()*total;
  if((r-=W)<0) return 0; if((r-=b)<0) return 1; if((r-=g)<0) return 2; return 3;
}

/* 武器類型抽選：偏向該職業用得到的那組（物攻職拿魔攻武器 weaponFit=0＝純垃圾，掉一堆等於製造摩擦）。
   註：這不是為了新武器才加的偏權——舊制 4 選 1 均分時，施法職有 3/4 機率掉到物攻武器（重罰），
   反而是受害最深的一方。偏權後兩邊都改善。留 25% 給另一組，維持「其他武器存在」的質感與變賣價值。 */
function pickWeaponType(){
  const magicCls = !!(G && G.cls && CLASSES[G.cls].mainStat === 'int');
  const own   = magicCls ? WPN_MAGIC : WPN_PHYS;
  const other = magicCls ? WPN_PHYS  : WPN_MAGIC;
  return pick(Math.random() < 0.75 ? own : other);
}

function makeItem(floor, bonus, cyc, forceRar){
  const ri = (forceRar != null) ? forceRar : rollRarity(floor, bonus||0), rar = RARITIES[ri];   // forceRar：指定稀有度（在骰詞綴前決定，詞綴才會依該稀有度正確生成）
  const slot = pick(['w','w','a','a','t']);
  const it = {id:uid++, slot, rar:ri, up:0, banked:false, affixes:[]};
  const cc = (cyc != null) ? cyc : ((R && R.cycle>0) ? R.cycle : 0);   // 明確輪迴優先（營地生裝備用），否則讀當前 run
  it.pf = floor; it.pc = cc;                                 // 出身樓層/輪迴（重鑄依此還原強度）
  const cf = floor * cycK(cc);                               // 輪迴等效樓層：基礎值只放大樓層項（6+0.6·f·K），常數不吃
  const rb = CURVE.rarMultBand[ri];                          // 稀有度倍率每件隨機（反轉：稀有度越高倍率越低、詞綴越多）
  const rm = rb[0] + Math.random()*(rb[1]-rb[0]);
  if(slot==='w'){
    it.wtype = pickWeaponType();
    it.base = Math.round(CURVE.wpnBase(cf) * rm);
    it.name = pick(WEAPON_NAMES[it.wtype]);
  }
  else if(slot==='a'){ it.base = Math.round(CURVE.armBase(cf) * rm); it.name = pick(ARMOR_NAMES); }
  else { it.base = 0; it.name = pick(TRINKET_NAMES); }
  it.name = pick(PREFIX[rar.id]) + it.name;
  let n = rnd(rar.afx[0], rar.afx[1]);
  if(slot==='t') n = Math.max(1, n);   // 飾品 base=0，至少 1 條詞綴才有功能（白飾品 0 條＝廢物）
  const pool = Object.keys(AFFIXES).filter(k=>AFFIXES[k].slots.includes(slot) && !AFFIXES[k].leg && !AFFIXES[k].curse);
  const chosen = [];
  for(let i=0;i<n && pool.length;i++){
    const k = pool.splice(Math.floor(Math.random()*pool.length),1)[0];
    chosen.push({k, v:rollAffixVal(k, ri, floor, cc)});
  }
  it.affixes = chosen;
  if(ri===3){
    const legPool = LEG_KEYS.filter(k=>AFFIXES[k].slots.includes(slot));
    if(legPool.length) it.affixes.unshift({k:pick(legPool), v:1});
    if(Math.random() < 0.2){
      it.cursed = true;
      it.name = '詛咒的' + it.name;
      for(const a of it.affixes) if(!AFFIXES[a.k].leg && a.v > 1) a.v = Math.round(a.v * 1.4);
      const ck = pick(CURSE_KEYS);
      it.affixes.push({k:ck, v:AFFIXES[ck].min});
    }
  }
  return it;
}

function itemStatLine(it){
  if(it.slot==='w'){
    const wt = WEAPON_TYPES[it.wtype||'sword'];
    const perk = {dagger:'連擊', sword:'爆擊', axe:'破防', staff:'法術', tome:'省魔', bell:'換點'}[it.wtype||'sword'] || '';
    return `${wt.i}${wt.n}｜攻擊 ${eqStat(it)}（${wt.magic?'魔攻':'物攻'}）｜${wt.pts}行動·${perk}`;
  }
  if(it.slot==='a') return `防禦 ${eqStat(it)}`;
  return '飾品';
}

function slotName(s){ return s==='w'?'武器':s==='a'?'護甲':'飾品'; }

/* 裝備圖示唯一入口（同 enemyIcon 的作法：有圖走圖、沒有回落 emoji，可一件一件補）。
   cls 決定尺寸：ic-sm 列表用、ic-lg 戰利品卡／裝備欄用。 */
function itemIconSlug(it){
  if(!it) return null;
  if(it.slot === 'w') return it.wtype || 'sword';
  // ⚠️ 護甲/飾品的 it.name 前面接了前綴（PREFIX：「王殞」「精良的」…，傳說還可能再加「詛咒的」），
  //    所以不能用整串去查表——要比對「字尾」。武器沒踩到是因為它查的是 wtype 不是名字。
  for(const k in ITEM_ICON) if(it.name && it.name.endsWith(k)) return ITEM_ICON[k];
  return null;
}
function itemIcon(it, cls){
  const slug = itemIconSlug(it);
  if(!slug) return `<span class="item-ic ${cls||'ic-sm'} ic-fb">${it && it.slot==='a'?'<svg class="ic"><use href="#ic-shield"/></svg>':'<svg class="ic"><use href="#ic-gem"/></svg>'}</span>`;
  return `<img class="item-ic ${cls||'ic-sm'} r${it.rar}" src="eq/${slug}.webp?v=${window.IMG_VER}" alt="" draggable="false">`;
}

/* 彙總玩家所有詞綴 */

/* 黑市改「每個已認證輪迴一個分頁」（見 certPool）。
   分頁不是「有取捨的選擇」，而是一道價格階梯——它真正的價值是：你剛踏進輪迴III，
   還是買得到符合實際實力的輪迴II 貨，而不是被降級成輪迴III 第1層的垃圾。 */
/* v415：貨物生成抽出來，讓「只刷新這一頁」能重用同一套規則 */
function rollMarketBoxes(ctx, isTop){
  const lo = Math.max(1, ctx.floor - 10);
  const boxes = [];
  for(let i=0;i<rnd(2,3);i++){                       // 分頁後每頁縮到 2–3 件，否則貨量爆炸
    const fl = rnd(lo, ctx.floor);
    // 稀有度：以該樓層的自然掉落分佈為底、整體推高一階（沿用首領權重 白×0.5 橙×2）。
    // 四種稀有度都上架——稀有度倍率反轉後白裝基礎值最高，只賣稀有/傳說等於只賣基礎值最低的貨。
    const it = makeItem(fl, 0, ctx.cyc, rollRarity(fl, 2, ctx.cyc));
    boxes.push({type: Math.random()<0.35?'open':'box', item:it, sold:false});
  }
  // 材料只掛在最強分頁（材料不分輪迴，每頁都出現沒有意義）
  if(isTop && cyclesUnlocked() >= 2 && Math.random() < 0.5)
    boxes.push({type:'mat', mat: Math.random()<0.5?'iron':'steel', qty:rnd(2,3), sold:false});
  return boxes;
}
function rollMarketRunes(ctx){
  const runes = [];
  if(runeMaxRar(ctx.cyc, ctx.floor) >= 0)            // 符文里程碑由該分頁自己的輪迴/樓層決定，不用另寫規則
    for(let i=0;i<rnd(1,2);i++){ const rn = makeRune(ctx.floor, ctx.cyc); if(rn) runes.push({rune:rn, sold:false}); }
  return runes;
}

function marketStock(){
  if(!G.market || G.market.run !== G.rec.runs || !G.market.tabs){
    const pool = certPool();
    const tabs = pool.map((ctx, ti)=>
      ({cyc:ctx.cyc, floor:ctx.floor, eq:ctx.eq,
        boxes: rollMarketBoxes(ctx, ti===0), runes: rollMarketRunes(ctx)}));
    G.market = {run:G.rec.runs, tabs, ti:0};
    save();
  }
  if(G.market.ti == null || G.market.ti >= G.market.tabs.length) G.market.ti = 0;
  return G.market;
}
function marketTab(){ const m = marketStock(); return m.tabs[m.ti]; }

/* 定價兩條原則：
   1. 吃「這件裝備自己的出身」(it.pf/it.pc)，不是玩家的最高認證——分頁後用玩家認證必錯
      （本源分頁的貨會被按輪迴III 的倍率收錢）。
   2. 價格主體看「等效樓層」= pf × cycK(pc)，也就是這件裝備的實際強度。
      碎銀是累積的存量，強度是當下的值，兩者不該互相牽制——多刷幾趟累積碎銀來買貴裝備本來就是設計意圖，
      所以價格要跟著強度走，不要因為「單場收入成長比較慢」就把曲線壓平。
   稀有度改四檔、且只加溢價(每階 +35%)而非主導：稀有度倍率反轉後白裝基礎值最高，
   不該賣得像垃圾（原本是「橙 480+ / 其餘 140+」約 3.4 倍的斷崖）。*/
function boxPrice(b){
  if(b.type==='mat') return (100 + G.rec.deep*2) * 5;   // 材料調漲 5 倍（沉鐵/心鋼原本過於便宜）
  const it = b.item, pf = it.pf || G.rec.deep || 10;
  const eq = pf * cycK(it.pc || 0);                     // 等效樓層＝跨輪迴比較強度的唯一正確基準
  const base = (80 + eq*8) * Math.pow(1.35, it.rar);    // 係數對齊舊制：本源50 的白裝仍是 480🪙
  return Math.round(base * (b.type==='open' ? 1.3 : 1));
}

function marketTabName(t){
  if(t.cyc === 0) return '本源';
  if(t.cyc >= 4) return '無限';
  return '輪迴' + 'I'.repeat(t.cyc);
}
var marketStall = 0;   // 0=裝備 1=符文 2=魔符
function switchMarketTab(i){ const m = marketStock(); m.ti = i; marketStall = 0; save(); renderMarket(); }
function switchMarketStall(s){ marketStall = s; renderMarket(); }
function marketEq(t){ return t.eq || t.floor * cycK(t.cyc || 0); }
/* 刷新只換當前分頁：費用跟該頁的等效樓層走，與 boxPrice 同一把尺。
   最強分頁 eq≈50 時約等於改版前的固定 80，弱分頁自然便宜。 */
function marketRerollCost(t){ return Math.round(20 + marketEq(t) * 1.2); }

function openMarket(){ marketStock(); marketStall = 0; renderMarket(); showScreen('s-market'); }

function renderMarket(){
  const m = marketStock(), t = m.tabs[m.ti];
  syncWallet();   // 貨幣顯示唯一入口（core.js WALLET）；勿在此另寫 mk-gold／mk-gem
  $('mk-src').innerHTML  = `貨源　<b>${marketTabName(t)}</b>　第 <b>${Math.max(1,t.floor-10)}–${t.floor}</b> 層`;

  $('mk-tabs').innerHTML = m.tabs.map((tb,i)=>
    `<div class="mk-tab${i===m.ti?' on':''}" onclick="switchMarketTab(${i})">${marketTabName(tb)}<b>${tb.floor}</b></div>`
  ).join('');

  /* 第二列：符文／魔符／刷新。裝備是預設攤位，點第一列任一分頁就回來 */
  // 符文攤只在「該分頁的輪迴/樓層真的解鎖符文」時出現。
  // 以前無條件顯示，點本源分頁再點符文會進到一個永遠空的攤位——看起來就是「跳不出商品」。
  const hasRune = runeMaxRar(t.cyc || 0, t.floor) >= 0;
  if(!hasRune && marketStall === 1) marketStall = 0;      // 切分頁後若符文攤消失，自動退回裝備攤
  let bar = hasRune
    ? `<div class="mk-tab${marketStall===1?' on':''}" onclick="switchMarketStall(1)" style="padding:8px 4px">符文</div>`
    : `<div class="mk-tab" style="padding:8px 4px;opacity:.35;cursor:default" onclick="toast('這個貨源還沒有符文——輪迴 I 之後才有')">符文</div>`;
  bar += `<div class="mk-tab${marketStall===2?' on':''}" onclick="switchMarketStall(2)" style="padding:8px 4px">魔符</div>`;
  if(marketStall === 1){
    bar += `<div class="mk-re gem${(G.gems||0)<1?' poor':''}" onclick="rerollMarket()">`
         + `<svg class="ic"><use href="#ic-dice"/></svg><svg class="ic"><use href="#ic-gem"/></svg> 1</div>`;
  } else if(marketStall === 0){
    const rc = marketRerollCost(t);
    bar += `<div class="mk-re${G.gold<rc?' poor':''}" onclick="rerollMarket()">`
         + `<svg class="ic"><use href="#ic-dice"/></svg><svg class="ic"><use href="#ic-gold"/></svg> ${rc}</div>`;
  } else {
    bar += `<div class="mk-re poor" style="cursor:default">—</div>`;
  }
  $('mk-bar').innerHTML = bar;

  let h = '';
  if(marketStall === 2){
    h = '<p class="mk-empty">魔符攤尚未開張。</p>';
  } else if(marketStall === 1){
    const rs = t.runes || [];
    if(!rs.length) h = '<p class="mk-empty">這個貨源還沒有符文可買。</p>';
    rs.forEach((s,i)=>{
      if(s.sold){ h += '<div class="mk-card void">已售出</div>'; return; }
      const rn = s.rune, r = RARITIES[rn.rar], price = runeGemPrice(rn), poor = (G.gems||0) < price;
      h += `<div class="mk-card rune${poor?' poor':''}" onclick="buyRune(${i})">`
         + `<div class="thumb">${rn.icon||'<svg class="ic"><use href="#ic-star"/></svg>'}</div>`
         + `<div class="bd"><div class="t1 ${r.cls}">${rn.name}</div>`
         + `<div class="t2">${runeFmt(rn.affixes[0])}</div></div>`
         + `<div class="pr"><svg class="ic"><use href="#ic-gem"/></svg> ${price}</div></div>`;
    });
  } else {
    t.boxes.forEach((b,i)=>{
      if(b.sold){ h += '<div class="mk-card void">已售出</div>'; return; }
      const price = boxPrice(b), poor = G.gold < price;
      if(b.type === 'mat'){
        h += `<div class="mk-card${poor?' poor':''}" onclick="buyBox(${i})">`
           + `<div class="thumb">${MATS[b.mat].i}</div>`
           + `<div class="bd"><div class="t1">${MATS[b.mat].n} ×${b.qty}</div>`
           + `<div class="t2">精煉材料</div></div>`
           + `<div class="pr">${price}</div></div>`;
        return;
      }
      const it = b.item, r = RARITIES[it.rar];
      if(b.type === 'open'){
        const tags = it.affixes.slice(0,2).map(a=>`<span>${AFFIXES[a.k].fmt(a.v)}</span>`).join('');
        h += `<div class="mk-card ${r.b}${poor?' poor':''}" onclick="peekOpen(${i})">`
           + `<div class="thumb ${r.b}">${itemIcon(it)}</div>`
           + `<div class="bd"><div class="t1 ${r.cls}">${it.name}<span class="mk-tag">+30%</span></div>`
           + `<div class="t2">${slotName(it.slot)}｜${itemStatLine(it)}</div>`
           + `<div class="aff">${tags}</div></div>`
           + `<div class="pr">${price}<small>已拆</small></div></div>`;
      } else {
        h += `<div class="mk-card sealed ${r.b}${poor?' poor':''}" onclick="peekBox(${i})">`
           + `<div class="thumb ${r.b}"><i>?</i></div>`
           + `<div class="bd"><div class="t1 ${r.cls}">${r.n}之盒</div>`
           + `<div class="t2">${slotName(it.slot)}｜詞綴未知</div></div>`
           + `<div class="pr">${price}<small>未拆</small></div></div>`;
      }
    });
  }
  $('mk-goods').innerHTML = h;
}

/* v415：未拆封改成先確認再扣款。改成整頁之後卡片變大、誤觸成本高（一盒動輒上千碎銀） */
function peekBox(i){
  const b = marketTab().boxes[i];
  if(!b || b.sold) return;
  const it = b.item, r = RARITIES[it.rar], price = boxPrice(b);
  openSheet(`<h3>${r.n}之盒</h3>
    <p class="base">${slotName(it.slot)}｜詞綴未知</p>
    <div class="row" style="margin-top:10px">
      <button class="btn primary" onclick="closeSheet();buyBox(${i})">買下 ${price}<svg class="ic"><use href="#ic-gold"/></svg></button>
      <button class="btn" onclick="closeSheet()">再看看</button></div>`);
}

function peekOpen(i){
  const b = marketTab().boxes[i];
  if(!b || b.sold) return;
  const it = b.item, r = RARITIES[it.rar], price = boxPrice(b);
  openSheet(`<h3>拆封品</h3>
    <div class="loot-card ${r.b}"><div class="lc-head">${itemIcon(it,'ic-lg')}<div class="${r.cls}" style="font-size:16px">${it.name} <span style="font-size:11px">${r.n}</span></div></div>
    <div style="font-size:13px;color:var(--dim);margin:4px 0">${slotName(it.slot)}｜${itemStatLine(it)}</div>
    ${affixHtml(it)}${compareHtml(it)}</div>
    <p class="base">拆過的貨，看得清楚，也貴三成。</p>
    <div class="row" style="margin-top:10px">
      <button class="btn primary" onclick="closeSheet();buyBox(${i})">買下 ${price}<svg class="ic"><use href="#ic-gold"/></svg></button>
      <button class="btn" onclick="closeSheet()">再看看</button></div>`);
}

function rerollMarket(){
  const m = marketStock(), t = m.tabs[m.ti];
  const ctx = {cyc:t.cyc, floor:t.floor, eq:t.eq};
  if(marketStall === 1){                       // 符文攤：固定 1 顆寶石
    if((G.gems||0) < 1){ toast('<svg class="ic"><use href="#ic-gem"/></svg> 不夠'); return; }
    G.gems -= 1; t.runes = rollMarketRunes(ctx);
  } else if(marketStall === 0){
    const c = marketRerollCost(t);
    if(G.gold < c){ toast('碎銀不夠'); return; }
    G.gold -= c; t.boxes = rollMarketBoxes(ctx, m.ti === 0);
  } else return;
  save(); renderMarket();                      // 只換這一頁這一攤，ti / marketStall 都不動
}

function buyBox(i){
  const b = marketTab().boxes[i];
  if(!b || b.sold) return;
  const price = boxPrice(b);
  if(G.gold < price){ toast('碎銀不夠'); return; }
  G.gold -= price;
  b.sold = true;
  if(b.type==='mat'){
    G.mats[b.mat] = (G.mats[b.mat]||0) + b.qty;
    save(); renderMarket(); toast(`入手 ${MATS[b.mat].n} ×${b.qty}`);
    return;
  }
  b.item.banked = true;
  G.stash.push(b.item);
  save();
  const it = b.item, r = RARITIES[it.rar];
  openSheet(`<h3>${b.type==='open'?'成交':'開盒'}</h3>
    <div class="loot-card ${r.b}"><div class="lc-head">${itemIcon(it,'ic-lg')}<div class="${r.cls}" style="font-size:16px">${it.name} <span style="font-size:11px">${r.n}</span></div></div>
    <div style="font-size:13px;color:var(--dim);margin:4px 0">${slotName(it.slot)}｜${itemStatLine(it)}</div>
    ${affixHtml(it)}</div>
    <p class="base">${it.cursed?'攤主的方向傳來一聲很輕的笑。':'已存入倉庫。'}</p>
    <div class="row" style="margin-top:10px">
      <button class="btn" onclick="closeSheet();renderMarket()">繼續看貨</button></div>`);
}

function runeGemPrice(rn){ return (rn.rar+1)*20; }   // 普20／精良40／稀有60／傳說80（鑽石梯度保留，消耗加倍）
function buyRune(i){
  const t = marketTab(); const s = t && t.runes && t.runes[i];
  if(!s || s.sold) return;
  const price = runeGemPrice(s.rune);
  if((G.gems||0) < price){ toast('<svg class="ic"><use href="#ic-gem"/></svg> 不夠'); return; }
  G.gems -= price; s.sold = true;
  if(!G.runeBag) G.runeBag = [];
  G.runeBag.push(s.rune);
  save(); closeSheet(); renderMarket(); toast('入手 '+s.rune.name);
}
var stashFilter = 'all';
var stashRarity = 'all', sellMode = false, sellSel = new Set();

let gearTab = 'own';   // 倉庫分頁：own 個人 / shared 共用
function openGear(){ renderGear(); showScreen('s-gear'); }
function moveToShared(id){
  const i = G.stash.findIndex(x=>x.id===id); if(i<0) return;
  const it = G.stash.splice(i,1)[0]; it.banked = true; ACC.sharedStash.push(it);
  closeSheet(); renderGear(); save(); toast('已存入共用倉庫');
}
function sharedToOwn(id){
  const i = ACC.sharedStash.findIndex(x=>x.id===id); if(i<0) return;
  const it = ACC.sharedStash.splice(i,1)[0]; G.stash.push(it);
  closeSheet(); renderGear(); save(); toast('已取回個人倉庫');
}
function equipFromShared(id){
  const i = ACC.sharedStash.findIndex(x=>x.id===id); if(i<0) return;
  const it = ACC.sharedStash.splice(i,1)[0];
  if(G.equip[it.slot]) G.stash.push(G.equip[it.slot]);
  G.equip[it.slot] = it; closeSheet(); renderGear(); save(); toast('已裝備 '+it.name);
}
/* ===== 符文（放進符文槽即被動生效） ===== */
function runeMaxRar(cycle, floor){   // 符文里程碑：本源不掉；輪迴I50→普通、II50→精良、III50→稀有、III100→傳說；無限→傳說。回 -1＝不解鎖
  if(cycle>=4) return 3;
  if(cycle<=0) return -1;                        // 本源不掉符文
  if(cycle===1) return floor>=50 ? 0 : -1;       // 輪迴I 50 起：普通
  if(cycle===2) return floor>=50 ? 1 : 0;        // 輪迴II 50 起：精良（<50 仍普通）
  return floor>=100 ? 3 : (floor>=50 ? 2 : 1);   // 輪迴III：<50精良、≥50稀有、100傳說
}
function makeRune(floor, cycle){
  const maxR = runeMaxRar(cycle||0, floor);
  if(maxR < 0) return null;   // 未達符文解鎖里程碑（本源/輪迴I 50 層前）
  const w = []; for(let r=0;r<=maxR;r++) w.push(Math.pow(0.45, r));   // 越高階越稀有
  const tot = w.reduce((a,b)=>a+b,0); let x = Math.random()*tot, ri = 0;
  for(let r=0;r<=maxR;r++){ x -= w[r]; if(x<0){ ri = r; break; } }
  const k = pick(Object.keys(RUNE_AFFIX));
  const cat = RUNE_AFFIX[k];
  const [lo,hi] = RUNE_BAND[cat.band][ri];
  const affix = {k, v: rnd(lo,hi)};   // 符文值純由稀有度決定，不吃樓層/輪迴
  if(cat.mul) affix.mul = true;        // 素質/上限型：乘法套用
  return {id:uid++, isRune:true, rar:ri, name:'符文·'+AFFIXES[k].n, icon:'<svg class="ic"><use href="#ic-star"/></svg>', affixes:[affix]};
}
function openRunes(){
  if(!G.runes) G.runes=[null,null,null]; if(!G.runeBag) G.runeBag=[];
  let html='<h3>符文</h3><p class="base">符文鑲進符文槽即被動生效，不佔裝備、跨探索永久保留。</p><div class="section-title">符文槽 '+G.runes.filter(Boolean).length+'/3</div><div class="item-list">';
  G.runes.forEach((rn,i)=>{ if(rn){ const a=rn.affixes[0];
    html+=`<div class="item-row ${RARITIES[rn.rar].b}" onclick="unsocketRune(${i})"><div style="width:100%"><div class="${RARITIES[rn.rar].cls}" style="font-weight:600">${rn.icon} ${rn.name}<span style="float:right;color:var(--red);font-weight:400">取下</span></div><div style="color:var(--dim);font-size:12px;line-height:1.35;margin-top:3px">${runeFmt(a)}</div></div></div>`;
  } else html+=`<div class="item-row" style="opacity:.6"><span class="in" style="color:var(--dim)"><svg class="ic"><use href="#ic-gem"/></svg> 空符文槽</span></div>`; });
  html+='</div><div class="section-title">持有符文</div><div class="item-list">';
  if(!G.runeBag.length) html+='<p style="color:var(--dim);font-size:13px">還沒有符文。深淵裡打得到。</p>';
  for(const rn of G.runeBag){ const a=rn.affixes[0];
    html+=`<div class="item-row ${RARITIES[rn.rar].b}" onclick="socketRune(${rn.id})"><div style="width:100%"><div class="${RARITIES[rn.rar].cls}" style="font-weight:600">${rn.icon} ${rn.name}<span style="float:right;color:var(--gold);font-weight:400">鑲入</span></div><div style="color:var(--dim);font-size:12px;line-height:1.35;margin-top:3px">${runeFmt(a)}</div></div></div>`; }
  html+='</div><button class="btn" style="margin-top:12px" onclick="closeSheet()">關閉</button>';
  openSheet(html);
}
function socketRune(id){
  const i=G.runeBag.findIndex(r=>r.id===id); if(i<0) return;
  const slot=G.runes.indexOf(null); if(slot<0){ toast('符文槽已滿——先取下一個'); return; }
  G.runes[slot]=G.runeBag.splice(i,1)[0]; if(R) R.hp=Math.min(R.hp, playerMaxHp());
  save(); openRunes();
}
function unsocketRune(i){ if(!G.runes[i]) return; G.runeBag.push(G.runes[i]); G.runes[i]=null; save(); openRunes(); }
function runeSellVal(rn){ return 8 + rn.rar*16; }
function renderRuneStash(sl){
  const runes = G.runeBag || [];
  if(!runes.length){ sl.insertAdjacentHTML('beforeend', '<p style="color:var(--dim);font-size:13px">還沒有符文。戰鬥掉落或黑市購買，鑲進「角色 → 符文槽」即被動生效。</p>'); return; }
  const rr = document.createElement('div'); rr.className='row'; rr.style.cssText='gap:6px;margin-bottom:8px';
  for(const [f,label] of [['all','全'],['0','普'],['1','精良'],['2','稀有'],['3','傳說']]){
    const b=document.createElement('button'); b.className='btn small'+(stashRarity===f?' primary':''); b.style.flex='1';
    b.textContent=label; b.onclick=()=>{ stashRarity=f; renderGear(); }; rr.appendChild(b);
  }
  sl.appendChild(rr);
  const sm=document.createElement('button'); sm.className='btn small'+(sellMode?' primary':''); sm.style.cssText='width:100%;margin-bottom:6px';
  sm.innerHTML=sellMode?'<svg class="ic"><use href="#ic-check"/></svg> 批次販售中——點符文勾選':'<svg class="ic"><use href="#ic-bag"/></svg> 批次販售（多選）';
  sm.onclick=()=>{ sellMode=!sellMode; sellSel.clear(); renderGear(); }; sl.appendChild(sm);
  const sorted = runes.filter(r=>stashRarity==='all'||r.rar===+stashRarity)
    .sort((a,b)=>(b.rar-a.rar) || (a.affixes[0].k<b.affixes[0].k?-1:a.affixes[0].k>b.affixes[0].k?1:0));
  for(const rn of sorted){ const a=rn.affixes[0]; const checked=sellSel.has(rn.id);
    const d=document.createElement('div'); d.className=`item-row ${RARITIES[rn.rar].b}`;
    d.innerHTML=`<div style="width:100%"><div class="${RARITIES[rn.rar].cls}" style="font-weight:600">${sellMode?(checked?'<svg class="ic"><use href="#ic-check"/></svg> ':'<svg class="ic"><use href="#ic-uncheck"/></svg> '):''}${rn.icon} ${rn.name}<span style="float:right;color:var(--dim);font-weight:400;font-size:11px">${RARITIES[rn.rar].n}</span></div><div style="color:var(--dim);font-size:12px;line-height:1.35;margin-top:3px">${runeFmt(a)}</div></div>`;
    d.onclick = sellMode ? ()=>{ if(sellSel.has(rn.id)) sellSel.delete(rn.id); else sellSel.add(rn.id); renderGear(); } : ()=>openRuneSheet(rn.id);
    sl.appendChild(d);
  }
  if(sellMode){
    const p2=document.createElement('button'); p2.className='btn small'; p2.style.cssText='width:100%;margin-top:8px';
    p2.textContent=sellSel.size?'全部取消':'全選（依目前篩選）';
    p2.onclick=()=>{ if(sellSel.size) sellSel.clear(); else for(const r of sorted) sellSel.add(r.id); renderGear(); }; sl.appendChild(p2);
    const sel=runes.filter(r=>sellSel.has(r.id));
    if(sel.length){
      const val=sel.reduce((s,r)=>s+runeSellVal(r),0);
      const sb=document.createElement('button'); sb.className='btn primary'; sb.style.cssText='width:100%;margin-top:6px';
      sb.innerHTML=`販售選取 ${sel.length} 個（+${val}<svg class="ic"><use href="#ic-gold"/></svg>）`;
      sb.onclick=()=>{ G.runeBag=runes.filter(r=>!sellSel.has(r.id)); G.gold+=val; sellSel.clear(); save(); renderGear(); toast(`販售 ${sel.length} 符文，得 ${val} 碎銀`); }; sl.appendChild(sb);
    }
  }
}
function openRuneSheet(id){
  const rn = (G.runeBag||[]).find(r=>r.id===id); if(!rn) return;
  const a=rn.affixes[0], r=RARITIES[rn.rar], val=runeSellVal(rn);
  openSheet(`<h3 class="${r.cls}">${rn.icon} ${rn.name}</h3><div class="base">${r.n}符文｜${runeFmt(a)}</div>
    <div class="row" style="margin-top:16px"><button class="btn primary" onclick="socketRune(${rn.id})">鑲入符文槽</button><button class="btn danger" onclick="sellRune(${rn.id})">分解 +${val}<svg class="ic"><use href="#ic-gold"/></svg></button></div>
    <button class="btn" style="margin-top:8px" onclick="openGear()">關閉</button>`);
}
function sellRune(id){
  const i=G.runeBag.findIndex(r=>r.id===id); if(i<0) return;
  const val=runeSellVal(G.runeBag[i]);
  G.runeBag.splice(i,1); G.gold+=val; closeSheet(); renderGear(); save(); toast(`分解得 ${val} 碎銀`);
}

function renderGear(){
  syncWallet();   // 同上：gear-gold 由 WALLET 統一寫
  const er = $('equip-row'); er.innerHTML = '';
  for(const s of ['w','a','t']){
    const it = G.equip[s];
    const d = document.createElement('div'); d.className = 'slot';
    d.innerHTML = it
      ? `<div class="sl">${slotName(s)}</div>${itemIcon(it,'ic-lg')}<div class="sn ${RARITIES[it.rar].cls}">${it.name}${it.up?'+'+it.up:''}</div><div style="font-size:11px;color:var(--dim)">${itemStatLine(it)}</div>`
      : `<div class="sl">${slotName(s)}</div><div class="ic-empty">—</div><div class="sn" style="color:var(--dim)">— 空 —</div>`;
    if(it) d.onclick = ()=>openItemSheet(it, 'equipped');
    er.appendChild(d);
  }
  const sl = $('stash-list'); sl.innerHTML = '';
  // 個人／共用 分頁
  const tabRow = document.createElement('div');
  tabRow.className = 'row'; tabRow.style.cssText = 'gap:6px;margin-bottom:8px';
  for(const [t, label, arr] of [['own','個人倉庫',G.stash],['shared','共用倉庫',ACC.sharedStash],['runes','符文',G.runeBag||[]]]){
    const b = document.createElement('button');
    b.className = 'btn small' + (gearTab===t?' primary':''); b.style.flex = '1';
    b.textContent = `${label} ${arr.length}`;
    b.onclick = ()=>{ gearTab = t; renderGear(); };
    tabRow.appendChild(b);
  }
  sl.appendChild(tabRow);
  if(gearTab==='runes'){ renderRuneStash(sl); return; }
  const stash = gearTab==='shared' ? ACC.sharedStash : G.stash;
  const fromKind = gearTab==='shared' ? 'shared' : 'stash';
  if(!stash.length){
    sl.insertAdjacentHTML('beforeend', `<p style="color:var(--dim);font-size:13px">${gearTab==='shared'?'共用倉庫是空的。把想跨角色共享的裝備存進來。':'倉庫空空。深淵裡什麼都有，去搬。'}</p>`);
    return;
  }
  const fr = document.createElement('div');
  fr.className = 'row'; fr.style.cssText = 'gap:6px;margin-bottom:6px';
  for(const [f, label] of [['all','全部'],['w','武器'],['a','護甲'],['t','飾品']]){
    const b = document.createElement('button');
    b.className = 'btn small' + (stashFilter===f?' primary':''); b.style.flex = '1';
    b.textContent = label + (f==='all' ? ` ${stash.length}` : ` ${stash.filter(i=>i.slot===f).length}`);
    b.onclick = ()=>{ stashFilter = f; renderGear(); };
    fr.appendChild(b);
  }
  sl.appendChild(fr);
  const rr = document.createElement('div');
  rr.className = 'row'; rr.style.cssText = 'gap:6px;margin-bottom:8px';
  for(const [f, label] of [['all','全'],['0','普'],['1','精良'],['2','稀有'],['3','傳說']]){
    const b = document.createElement('button');
    b.className = 'btn small' + (stashRarity===f?' primary':''); b.style.flex = '1';
    b.textContent = label; b.onclick = ()=>{ stashRarity = f; renderGear(); };
    rr.appendChild(b);
  }
  sl.appendChild(rr);
  if(gearTab==='own'){
    const sm = document.createElement('button');
    sm.className = 'btn small' + (sellMode?' primary':''); sm.style.cssText = 'width:100%;margin-bottom:6px';
    sm.innerHTML = sellMode ? '<svg class="ic"><use href="#ic-check"/></svg> 批次販售中——點裝備勾選' : '<svg class="ic"><use href="#ic-bag"/></svg> 批次販售（多選）';
    sm.onclick = ()=>{ sellMode = !sellMode; sellSel.clear(); renderGear(); };
    sl.appendChild(sm);
  } else { sellMode = false; }   // 共用分頁不販售
  const slotOrder = {w:0, a:1, t:2};
  const sorted = stash
    .filter(i=>(stashFilter==='all' || i.slot===stashFilter) && (stashRarity==='all' || i.rar===+stashRarity))
    .sort((a,b)=>(slotOrder[a.slot]-slotOrder[b.slot]) || (b.rar-a.rar) || (eqStat(b)-eqStat(a)));
  const selling = sellMode && gearTab==='own';
  for(const it of sorted){
    const d = document.createElement('div'); d.className = `item-row ${RARITIES[it.rar].b}`;
    const checked = sellSel.has(it.id);
    d.innerHTML = `${itemIcon(it)}<div class="ir-body">
      <span class="in ${RARITIES[it.rar].cls}">${selling?(checked?'<svg class="ic"><use href="#ic-check"/></svg> ':'<svg class="ic"><use href="#ic-uncheck"/></svg> '):''}${it.name}${it.up?'+'+it.up:''}</span>
      <span class="is">${slotName(it.slot)}｜${itemStatLine(it)}</span></div>`;
    d.onclick = selling
      ? ()=>{ if(sellSel.has(it.id)) sellSel.delete(it.id); else sellSel.add(it.id); renderGear(); }
      : ()=>openItemSheet(it, fromKind);
    sl.appendChild(d);
  }
  if(selling){
    const p2 = document.createElement('button'); p2.className='btn small'; p2.style.cssText='width:100%;margin-top:8px';
    p2.textContent = sellSel.size ? '全部取消' : '全選（依目前篩選）';
    p2.onclick = ()=>{ if(sellSel.size) sellSel.clear(); else for(const i of sorted) sellSel.add(i.id); renderGear(); };
    sl.appendChild(p2);
    const sel = G.stash.filter(i=>sellSel.has(i.id));
    if(sel.length){
      const val = sel.reduce((s,i)=>s+6+i.rar*10+Math.floor(i.base/2),0);
      const sb = document.createElement('button'); sb.className='btn primary'; sb.style.cssText='width:100%;margin-top:6px';
      sb.innerHTML = `販售選取 ${sel.length} 件（+${val}<svg class="ic"><use href="#ic-gold"/></svg>）`;
      sb.onclick = ()=>{ G.stash = G.stash.filter(i=>!sellSel.has(i.id)); G.gold += val; sellSel.clear(); save(); renderGear(); toast(`販售 ${sel.length} 件，得 ${val} 碎銀`); };
      sl.appendChild(sb);
    }
  }
}

function affixHtml(it){
  return it.affixes.map(a=>{
    const A = AFFIXES[a.k];
    const cls = A.curse?' curse':A.leg?' leg':'';
    const mark = A.curse?'<svg class="ic"><use href="#ic-poison"/></svg>':A.leg?'<svg class="ic"><use href="#ic-legend"/></svg>':'<svg class="ic"><use href="#ic-gem"/></svg>';
    return `<div class="affix${cls}">${mark} ${A.n}：${A.fmt(a.v)}</div>`;
  }).join('') || '<div class="affix" style="color:var(--dim)">（無詞綴）</div>';
}

function compareHtml(it){
  const cur = G.equip[it.slot];
  if(!cur || cur.id===it.id) return '';
  let lines = [`<div class="cmp">目前身上：<span class="${RARITIES[cur.rar].cls}">${cur.name}${cur.up?'+'+cur.up:''}</span>　<span style="color:var(--dim)">${itemStatLine(cur)}</span>`];
  if(it.slot==='w'){ const d = eqStat(it)-eqStat(cur);
    lines.push(`<div>攻擊差 ${d>=0?'<span class="up">+'+d+'</span>':'<span class="dn">'+d+'</span>'}</div>`); }
  if(it.slot==='a'){ const d = eqStat(it)-eqStat(cur);
    lines.push(`<div>防禦差 ${d>=0?'<span class="up">+'+d+'</span>':'<span class="dn">'+d+'</span>'}</div>`); }
  lines.push(`<div style="margin-top:4px">${affixHtml(cur)}</div>`);
  lines.push('</div>');
  return lines.join('');
}

function openItemSheet(it, from){
  const r = RARITIES[it.rar];
  const salvage = 6 + it.rar*10 + Math.floor(it.base/2);
  const backCall = from==='bag' ? 'openRunStats()' : 'closeSheet()';
  let btns = ''; let extra = '';
  if(from==='stash'){ btns = `<button class="btn primary" onclick="equipFromStash(${it.id})">裝備</button>
    <button class="btn danger" onclick="salvageItem(${it.id})">分解 +${salvage}<svg class="ic"><use href="#ic-gold"/></svg></button>`;
    extra = `<button class="btn" style="margin-top:8px" onclick="moveToShared(${it.id})"><svg class="ic"><use href="#ic-chest"/></svg> 存入共用倉庫</button>`; }
  else if(from==='shared'){ btns = `<button class="btn primary" onclick="equipFromShared(${it.id})">裝備</button>
    <button class="btn" onclick="sharedToOwn(${it.id})"><svg class="ic"><use href="#ic-refresh"/></svg> 取回個人</button>`; }
  else if(from==='equipped') btns = `<button class="btn" onclick="unequipItem('${it.slot}')">卸下</button>`;
  else if(from==='bag') btns = `<button class="btn primary" onclick="equipFromBag(${it.id},'stats')">立刻換上</button>`;
  openSheet(`<h3 class="${r.cls}">${it.name}${it.up?' +'+it.up:''}</h3>
    <div class="base">${r.n}${slotName(it.slot)}｜${itemStatLine(it)}${it.banked===false&&from!=='equipped'&&R?'｜<span style="color:var(--orange)">未保管</span>':''}</div>
    ${affixHtml(it)}${compareHtml(it)}
    <div class="row" style="margin-top:16px">${btns}<button class="btn" onclick="${backCall}">${from==='bag'?'返回':'關閉'}</button></div>${extra}`);
}

function equipFromStash(id){
  const i = G.stash.findIndex(x=>x.id===id); if(i<0) return;
  const it = G.stash.splice(i,1)[0];
  if(G.equip[it.slot]) G.stash.push(G.equip[it.slot]);
  G.equip[it.slot] = it; closeSheet(); renderGear(); save(); toast('已裝備 '+it.name);
}

function unequipItem(s){
  if(!G.equip[s]) return; G.stash.push(G.equip[s]); G.equip[s]=null;
  closeSheet(); renderGear(); save();
}

function salvageItem(id){
  const i = G.stash.findIndex(x=>x.id===id); if(i<0) return;
  const it = G.stash[i];
  const v = 6 + it.rar*10 + Math.floor(it.base/2);
  G.stash.splice(i,1); G.gold += v; closeSheet(); renderGear(); save(); toast(`分解得 ${v} 碎銀`);
}

var smithSel = 'w';                     // v411：鐵匠畫面目前選中的裝備欄（w/a）
function smithPick(sl){ smithSel = sl; reforgeSlot = sl; reforgeLocks = []; renderSmith(); }
function openSmith(){
  if(!G.equip[smithSel]) smithSel = G.equip.w ? 'w' : 'a';
  reforgeSlot = smithSel; reforgeLocks = [];
  renderSmith(); showScreen('s-smith');
}

function smithCost(it){ return Math.round(30 * Math.pow(it.up+1, 1.5)); }

function smithTier(up){ // 下一級(up+1)：材料、數量、素質增益、成功率（+1~6 保證，之後每級 -10%）
  const next = up + 1;
  const rate = next <= 6 ? 1 : Math.max(0.1, 1 - (next - 6) * 0.1);
  if(next <= 6) return {mat:null, qty:0, gain:1, rate};
  if(next <= 9) return {mat:'iron', qty:[2,4,8][next-7], gain:2, rate};
  return {mat:'steel', qty:[2,4,8][next-10], gain:3, rate};
}

function tryUpgrade(sl){
  const it = G.equip[sl]; if(!it) return;
  const cap = RARITIES[it.rar].upCap;
  if(it.up >= cap){ toast('已達此稀有度的精煉上限'); return; }
  const cost = smithCost(it), tier = smithTier(it.up);
  if(G.gold < cost){ toast('碎銀不夠'); return; }
  if(tier.mat && (G.mats[tier.mat]||0) < tier.qty){ toast(`缺少材料：${MATS[tier.mat].n} ×${tier.qty}`); return; }
  G.gold -= cost;
  if(tier.mat) G.mats[tier.mat] -= tier.qty;
  if(Math.random() < tier.rate){
    it.up++;
    save(); renderSmith();
    toast(`精煉成功：${it.name} +${it.up}（${sl==='w'?'攻擊':'防禦'} +${tier.gain}）`);
  } else {
    save(); renderSmith();
    toast(`精煉失敗——碎銀與材料化為灰燼（等級未降）`);
  }
}

function reforgeCost(it){ return Math.round((60 + it.rar*40) * Math.pow(1.5, it.rf||0)); }

var pendingReforge = null;

var reforgeSlot = null, reforgeLocks = [];
function reforgeItem(slot){ const it = G.equip[slot]; if(!it) return; smithPick(slot); }
function toggleReforgeLock(i){ const p = reforgeLocks.indexOf(i); if(p>=0) reforgeLocks.splice(p,1); else reforgeLocks.push(i); renderSmith(); }
function renderReforgeLock(){ renderSmith(); }   // v411：鎖定 UI 已內嵌在鐵匠畫面
function reforgeCtx(it){   // 重鑄用的強度情境：新裝備讀出身；舊裝備由現有素質反推有效樓層，避免縮水
  if(it.pf != null) return {floor: it.pf, cyc: it.pc||0};
  let eff = G.rec.deep || 10;
  for(const a of it.affixes){
    const A = AFFIXES[a.k]; if(!A || !A.stat) continue;
    const key = AFFIX_BAND[a.k];
    const bd = (ROLL_BANDS[key] && ROLL_BANDS[key][it.rar]) || [A.min, A.max];
    const mid = (bd[0]+bd[1])/2;
    const f = (a.v - mid) / 0.3;                 // 反推：v ≈ 帶中值 + 樓層×0.3
    if(f > eff) eff = f;
  }
  return {floor: Math.round(eff), cyc: 0};
}
function doReforge(){
  const slot = reforgeSlot, it = G.equip[slot]; if(!it) return;
  const cost = Math.round(reforgeCost(it) * (1 + reforgeLocks.length*0.5)); if(G.gold < cost){ toast('碎銀不夠'); return; }
  G.gold -= cost; it.rf = (it.rf||0) + 1;
  const ctx = reforgeCtx(it);
  const legs = it.affixes.filter(a=>AFFIXES[a.k].leg);
  const curses = it.affixes.filter(a=>AFFIXES[a.k].curse);
  const normals = it.affixes.filter(a=>!AFFIXES[a.k].leg && !AFFIXES[a.k].curse);
  const kept = reforgeLocks.map(i=>normals[i]).filter(Boolean);
  const keptKeys = new Set(kept.map(a=>a.k));
  const rar = RARITIES[it.rar];
  const targetN = rnd(rar.afx[0], rar.afx[1]);                 // 隨機普通詞綴數
  const toRoll = Math.max(0, targetN - kept.length);
  const pool = Object.keys(AFFIXES).filter(k=>AFFIXES[k].slots.includes(it.slot) && !AFFIXES[k].leg && !AFFIXES[k].curse && !keptKeys.has(k));
  const rolled = [];
  for(let i=0;i<toRoll && pool.length;i++){
    const k = pool.splice(Math.floor(Math.random()*pool.length),1)[0];
    let v = rollAffixVal(k, it.rar, ctx.floor, ctx.cyc);   // 輪迴縮放已統一在 rollAffixVal 內（樓層項 ×cycK），不再外掛第二次
    if(it.cursed) v = Math.round(v*1.4);
    rolled.push({k, v});
  }
  pendingReforge = {slot, affixes: legs.concat(curses).concat(kept).concat(rolled)};
  save();
  const oldList = normals.map(a=>`<div class="affix"><svg class="ic"><use href="#ic-gem"/></svg> ${AFFIXES[a.k].n}：${AFFIXES[a.k].fmt(a.v)}</div>`).join('') || '<div class="affix" style="color:var(--dim)">（無）</div>';
  const newNormals = kept.concat(rolled);
  const newList = newNormals.map(a=>`<div class="affix"><svg class="ic"><use href="#ic-gem"/></svg> ${AFFIXES[a.k].n}：${AFFIXES[a.k].fmt(a.v)}${kept.includes(a)?' <svg class="ic"><use href="#ic-lock"/></svg>':''}</div>`).join('') || '<div class="affix" style="color:var(--dim)">（無）</div>';
  openSheet(`<h3>重鑄・${it.name}</h3>
    <p class="base">鎖定的保留，其餘重鑄。傳說與詛咒不受影響。</p>
    <div class="section-title">原本的（${normals.length}）</div>${oldList}
    <div class="section-title">新鑄的（${newNormals.length}）</div>${newList}
    <div class="row" style="margin-top:16px">
      <button class="btn primary" onclick="applyReforge()">換上新的</button>
      <button class="btn" onclick="cancelReforge()">保留原本</button></div>
    <p style="color:var(--dim);font-size:12px;margin-top:8px">重鑄費已付，不論去留。</p>`);
}

function applyReforge(){
  if(!pendingReforge) return;
  const it = G.equip[pendingReforge.slot];
  if(it) it.affixes = pendingReforge.affixes;
  pendingReforge = null;
  save(); closeSheet(); reforgeLocks = []; renderSmith(); toast('新詞綴已上身');
}

function cancelReforge(){
  pendingReforge = null;
  closeSheet(); reforgeLocks = []; renderSmith(); toast('保留了原本的詞綴');
}

function smithScrollChk(){
  const w = $('sm-work'); if(!w) return;
  w.classList.toggle('more', w.scrollHeight - w.clientHeight > 4);
}

function renderSmith(){
  syncWallet();   // 同上：sm-gold 由 WALLET 統一寫
  $('sm-mats').innerHTML = MATS.iron.i + ' ' + (G.mats.iron||0) + '\u3000' + MATS.steel.i + ' ' + (G.mats.steel||0);

  /* ---- 上半：身上的武器與護甲（飾品不可鍛造，不列） ---- */
  const box = $('sm-slots'); box.innerHTML = '';
  for(const [sl, kd] of [['w','武器'],['a','護甲']]){
    const it = G.equip[sl];
    const d = document.createElement('div');
    if(!it){
      d.className = 'sm-slot empty'; d.textContent = `— 未裝備${kd} —`;
      box.appendChild(d); continue;
    }
    const R = RARITIES[it.rar];
    d.className = 'sm-slot' + (smithSel === sl ? ' on' : '');
    d.innerHTML = itemIcon(it, 'ic-lg')
      + `<div class="tx"><div class="kd">${kd}</div>`
      + `<div class="nm ${R.cls}">${it.name}<span class="up">${it.up ? ' +' + it.up : ''}</span></div>`
      + `<div class="ln">${R.n}・上限 +${R.upCap}・詞綴 ${it.affixes.length}</div></div>`;
    d.onclick = ()=>smithPick(sl);
    box.appendChild(d);
  }

  /* ---- 下半：精煉 + 重鑄 ---- */
  const work = $('sm-work');
  const it = G.equip[smithSel];
  if(!it){ work.innerHTML = '<p class="sm-lock">身上沒有可鍛造的武器或護甲。</p>'; smithScrollChk(); return; }
  const R = RARITIES[it.rar], cap = R.upCap;
  let h = '';

  h += `<div class="sm-card"><div class="hd"><span class="t">精 煉</span>`
     + `<span class="cap">${it.up} / ${cap}\u3000${R.n}上限</span></div>`;
  if(it.up >= cap){
    h += `<div class="sm-lock">已達${R.n}上限 +${cap}，無法再精煉。</div>`;
  } else {
    const cost = smithCost(it), tier = smithTier(it.up);
    const lackG = G.gold < cost, lackM = !!(tier.mat && (G.mats[tier.mat]||0) < tier.qty);
    h += `<div class="sm-step"><b>+${it.up}</b><i>→</i><b class="to">+${it.up+1}</b>`
       + `<span class="gain">${smithSel==='w'?'攻擊':'防禦'} +${tier.gain}</span></div>`
       + `<div class="sm-cap-bar"><u style="width:${Math.round((it.up+1)/cap*100)}%"></u></div>`
       + `<div class="sm-need">`
       + `<span class="${lackG?'lack':''}"><svg class="ic"><use href="#ic-gold"/></svg> <b>${cost}</b></span>`
       + (tier.mat ? `<span class="${lackM?'lack':''}">${MATS[tier.mat].i} <b>${tier.qty}</b> / ${G.mats[tier.mat]||0}</span>` : '')
       + (tier.rate < 1 ? `<span class="risk">成功 <b>${Math.round(tier.rate*100)}%</b></span>` : `<span>必成</span>`)
       + `</div>`
       + `<button class="btn primary${(lackG||lackM)?' lack':''}" onclick="tryUpgrade('${smithSel}')">`
       + `${tier.rate < 1 ? '賭一把' : '敲下去'}</button>`;
  }
  h += `</div>`;

  h += `<div class="sm-card"><div class="hd"><span class="t">重 鑄</span>`
     + `<span class="cap">${it.rf ? '已重鑄 ' + it.rf + ' 次' : '尚未重鑄'}</span></div>`;
  if((G.rec.deep||0) < 10){
    h += `<div class="sm-lock">最深抵達 10 層後，鐵匠會學會重鑄詞綴。</div>`;
  } else {
    const leg = it.affixes.find(a=>AFFIXES[a.k].leg);
    const cur = it.affixes.find(a=>AFFIXES[a.k].curse);
    /* 這個 normals 的順序必須與 doReforge() 內的 filter 一致，reforgeLocks 存的是它的索引 */
    const normals = it.affixes.filter(a=>!AFFIXES[a.k].leg && !AFFIXES[a.k].curse);
    const rc = Math.round(reforgeCost(it) * (1 + reforgeLocks.length*0.5));
    h += `<div class="rf-grid">`;
    h += leg
      ? `<div class="rf-cell leg rf-wide"><span class="tx">${AFFIXES[leg.k].n}：${AFFIXES[leg.k].fmt(leg.v)}<small>傳說</small></span><span class="lk">自動保留</span></div>`
      : `<div class="rf-cell void rf-wide">無傳說詞綴</div>`;
    const cells = Math.max(4, normals.length);   // 正常最多 4，多出來也不藏
    for(let i=0;i<cells;i++){
      const a = normals[i];
      if(!a){ h += `<div class="rf-cell void">空</div>`; continue; }
      const on = reforgeLocks.includes(i);
      h += `<div class="rf-cell norm${on?' lock':''}" onclick="toggleReforgeLock(${i})">`
         + `<span class="tx">${AFFIXES[a.k].fmt(a.v)}</span>`
         + `<span class="lk"><svg class="ic"><use href="#${on?'ic-lock':'ic-unlock'}"/></svg></span></div>`;
    }
    h += cur
      ? `<div class="rf-cell cur rf-wide"><span class="tx">${AFFIXES[cur.k].n}：${AFFIXES[cur.k].fmt(cur.v)}<small>詛咒</small></span><span class="lk">自動保留</span></div>`
      : `<div class="rf-cell void rf-wide">無詛咒詞綴</div>`;
    h += `</div>`;
    h += `<div class="rf-hint">${reforgeLocks.length
        ? '鎖定 ' + reforgeLocks.length + ' 條，費用 +' + (reforgeLocks.length*50) + '%'
        : '點詞綴可鎖定，每鎖一條 +50%'}</div>`;
    h += `<button class="btn${G.gold < rc ? ' lack' : ''}" onclick="doReforge()">重鑄\u3000`
       + `<span class="bc"><svg class="ic"><use href="#ic-gold"/></svg> ${rc}</span></button>`;
  }
  h += `</div>`;

  work.innerHTML = h;
  smithScrollChk();
}

