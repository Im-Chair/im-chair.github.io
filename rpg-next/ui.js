'use strict';
/* ============ ui.js — 畫面與演出。規則都在 core.js，這裡只讀狀態、呼叫動作、播 S.fx。 ============ */

const RUN_KEY = 'abyss2-run', META_KEY = 'abyss2-meta', META_VER = 3;
const $ = id => document.getElementById(id);
const ic = (n, cls) => `<svg class="ic ${cls || ''}"><use href="#ic-${n}"/></svg>`;
const art = p => `${ART}${p}?v=4`;
const foeArt = (a, k) => a && a[0] === '@' ? `${a.slice(1)}?v=4` : art('mon/' + (a || k) + '.webp');
let S = null;          // 目前這一趟（null＝標題畫面）
let meta = loadMeta();
let busy = false;      // 敵方回合與轉場時鎖輸入
let seenCards = new Set();
let pendingLoot = null;
let view = 'title';      // 沒有進行中的一趟時顯示 title 或 camp
let diveDepth = null;    // 營地選的下潛深度（null＝最深）
let smithTab = 'all';    // 鐵匠鋪的部位篩選：all / weapon / armor / trinket
let mutChoices = [];     // 下潛前這次抽到的三個異變
let diveNm = 0;          // 營地選的噩夢階（開局時再夾到可選上限內）
let recTab = 'cls';      // 紀錄與圖鑑的分頁：cls / ach / foe / tre / gear

function loadMeta(){
  const blank = () => ({v: META_VER, runs: 0, escapes: 0, best: 0, bank: 0, seenHelp: 0, depth: 0, cleared: 0, gold: 0, stats: {}, owned: [], equip: {}, cls: 'sword', seenCls: {}, ach: {}, clsStats: {}, seenFoe: {}, seenTre: {}, nmMax: 0, mutEsc: 0, boughtLegend: 0});
  try{
    const raw = localStorage.getItem(META_KEY);
    if(raw === null) return blank();
    let m = null;
    try{ m = JSON.parse(raw); }catch(e){}
    if(m && m.v === META_VER){
      const mm = Object.assign(blank(), m);
      if(!clsUnlocked(mm, mm.cls)) mm.cls = 'sword';   // 沒有的職業或還沒解鎖，退回劍士
      /* 成就補發：舊進度已滿足、而且能從 meta 回溯的（生還過、打贏首領、累計下潛…）。有新達成就存回去 */
      if(checkAchievements(mm, null).length){ try{ localStorage.setItem(META_KEY, JSON.stringify(mm)); }catch(e){} }
      return mm;
    }
    /* 一次性遷移（v < 3）：存檔重置，測新節奏（回程裝備受深度限制、首領只吃一半貪婪）。原樣備份後重來，並清掉舊局。
       存回新資料之後就有 v:3，不會重複觸發；seenHelp 不沿用（說明有更新） */
    localStorage.setItem(META_KEY + '-bak', raw);
    localStorage.removeItem(RUN_KEY);
    const fresh = blank();
    localStorage.setItem(META_KEY, JSON.stringify(fresh));
    return fresh;
  }catch(e){ return blank(); }
}
function saveMeta(){ try{ localStorage.setItem(META_KEY, JSON.stringify(meta)); }catch(e){} }
function saveRun(){
  try{
    if(!S || S.screen === 'result'){ localStorage.removeItem(RUN_KEY); return; }
    const {fx, ...rest} = S;
    localStorage.setItem(RUN_KEY, JSON.stringify(rest));
  }catch(e){}
}
function loadRun(){
  try{
    const r = JSON.parse(localStorage.getItem(RUN_KEY) || 'null');
    if(!r || r.v !== 1) return null;
    /* 營地上線前的舊進度沒有這些欄位 */
    r.load = r.load || {};
    r.bagCap = r.bagCap || GAME.bag;
    r.depth = r.depth || 0;
    r.own = r.own || [];
    r.mutation = MUTATIONS[r.mutation] ? r.mutation : null;   // 舊局沒有異變
    r.cls = CLASSES[r.cls] ? r.cls : 'sword';                 // 舊局沒有職業 ＝ 劍士
    r.evSeen = r.evSeen || [];
    r.nm = r.nm || 0;                      // 舊局沒有噩夢階
    r.unlocked = r.unlocked || [];         // 舊局沒有成就解鎖牌
    r.stats = r.stats || {kills: 0, steps: 0, burned: 0};
    if(r.stats.maxGreed === undefined) r.stats.maxGreed = r.greed || 0;
    return r;
  }
  catch(e){ return null; }
}

/* —— 音效（WebAudio 即時合成；總開關是首頁的 arcade-sound，每次出聲前重讀）—— */
const SFX = (() => {
  let ctx = null;
  function tone(freq, dur, type, vol, slide, delay){
    if(localStorage.getItem('arcade-sound') === 'off') return;
    try{
      ctx = ctx || new (window.AudioContext || window.webkitAudioContext)();
      if(ctx.state === 'suspended') ctx.resume();
      const t = ctx.currentTime + (delay || 0), o = ctx.createOscillator(), g = ctx.createGain();
      o.type = type || 'square';
      o.frequency.setValueAtTime(freq, t);
      if(slide) o.frequency.exponentialRampToValueAtTime(Math.max(30, slide), t + dur);
      g.gain.setValueAtTime(vol || 0.1, t);
      g.gain.exponentialRampToValueAtTime(0.0008, t + dur);
      o.connect(g).connect(ctx.destination);
      o.start(t);
      o.stop(t + dur + 0.02);
    }catch(e){}
  }
  return {
    card(){ tone(520, .05, 'triangle', .05); },
    hit(big){ tone(big ? 140 : 210, big ? .2 : .1, 'sawtooth', big ? .16 : .1, 60); },
    hurt(){ tone(110, .22, 'sawtooth', .16, 45); },
    block(){ tone(900, .06, 'square', .05, 500); },
    clink(){ tone(1250, .08, 'triangle', .08); tone(1660, .12, 'triangle', .07, 0, .06); },
    burn(){ tone(320, .3, 'sawtooth', .1, 90); tone(1000, .12, 'triangle', .06, 1600, .05); },
    tier(up){ [0, 1, 2].forEach(i => tone((up ? [220, 277, 330] : [330, 277, 220])[i], .18, 'triangle', .09, 0, i * .09)); },
    die(){ tone(240, .28, 'square', .08, 50); },
    win(){ [523, 659, 784].forEach((f, i) => tone(f, .16, 'triangle', .09, 0, i * .08)); },
    lose(){ [196, 165, 123].forEach((f, i) => tone(f, .4, 'sawtooth', .09, 0, i * .22)); },
    dodge(){ tone(1500, .09, 'sine', .06, 600); },
    ignite(){ tone(260, .25, 'sawtooth', .07, 520); tone(700, .1, 'triangle', .04, 300, .05); },
    poison(){ tone(180, .2, 'sine', .08, 120); tone(150, .2, 'sine', .06, 100, .1); },
    mana(){ tone(660, .1, 'sine', .07, 990); tone(990, .14, 'sine', .06, 0, .07); },
    morph(){ [150, 110, 220].forEach((f, i) => tone(f, .3, 'sawtooth', .1, f * 2, i * .12)); },
    ach(){ [659, 784, 988, 1318].forEach((f, i) => tone(f, .18, 'triangle', .08, 0, i * .07)); },
    extract(){ [392, 523, 659, 784, 1046].forEach((f, i) => tone(f, .2, 'triangle', .09, 0, i * .09)); },
  };
})();

/* —— 共用片段 —— */
function fmtText(str, def, target){
  if(!str) return '';
  const inBattle = S && S.battle;
  let d;
  if(inBattle) d = calcDmg(S, def, target || null);
  else{
    d = def.dmg || def.base || def.bonus || 0;
    str = str.replace(/（現在 \{d\}）/g, '');
  }
  return str.replace(/\{d\}/g, d).replace(/\{b\}/g, inBattle ? blockOf(S, def) : (def.blk || 0));
}
const KIND_ICON = {atk: 'sword', def: 'shield', skl: 'star', bad: 'warn'};
function cardHtml(c, opt){
  opt = opt || {};
  const d = cardDef(c);
  const off = opt.off ? ' off' : '';
  const isNew = opt.deal && !seenCards.has(c.uid) ? ' new' : '';
  const style = opt.delay ? ` style="animation-delay:${opt.delay}ms"` : '';
  return `<button class="card ${d.k}${c.up ? ' up' : ''}${d.r === 2 ? ' rare' : ''}${off}${isNew}${opt.cls ? ' ' + opt.cls : ''}"${style} ${opt.attr || ''}>
    <span class="cost">${d.c}</span><span class="ck">${ic(KIND_ICON[d.k])}</span>
    <span class="cn">${d.n}${c.up ? '+' : ''}</span>
    <span class="ct">${fmtText(d.t, d, opt.target)}</span></button>`;
}
function hud(){
  const T = greedTier(S), ti = greedTierIndex(S.greed), next = GREED_TIERS[ti + 1];
  const pct = next ? (S.greed - T.min) / (next.min - T.min) * 100 : 100;
  const hpPct = S.hp / S.maxHp * 100;
  return `<div class="hud">
    <div class="hud-hp"><div class="hud-num"><span>${ic('heal')} 生命</span><span>${S.hp} / ${S.maxHp}</span></div>
      <div class="bar"><i style="width:${hpPct}%"></i></div></div>
    <button class="chip greed t${ti}" id="greedChip" data-act="greedInfo">
      <span class="gn"><span>${T.n}</span><span>${S.greed}</span></span><span class="bar"><i style="width:${pct}%"></i></span></button>
    <button class="chip" data-act="bagSheet" aria-label="背包">${ic('bag')} ${S.bag.length}/${S.bagCap}</button>
  </div>${ruleBar()}${S.nm && !S.battle ? `<button class="mut-bar nm-bar" data-act="nmInfo">噩夢 ${S.nm} 階<small>${NIGHTMARES[S.nm - 1].d}${S.nm > 1 ? `（另有 ${S.nm - 1} 條，點開看）` : ''}</small></button>` : ''}${S.mutation && !S.battle ? `<button class="mut-bar" data-act="mutInfo">異變・${MUTATIONS[S.mutation].n}<small>${MUTATIONS[S.mutation].good}；${MUTATIONS[S.mutation].bad}</small></button>` : ''}`;
}
/* 區域規則：地圖與營火、獎勵畫面頂端常駐一行（戰鬥中改成狀態列的標籤） */
function ruleBar(){
  const rg = regionOf(S.depth || 0);
  if(!rg.rule || S.battle) return '';
  return `<button class="rule-bar" data-act="ruleInfo">${rg.n}・${rg.rule.n}<small>${rg.rule.d}</small></button>`;
}
function mutInfoHtml(id){
  const m = MUTATIONS[id];
  return `<b>${m.n}</b><div class="mut-good">＋ ${m.good}</div><div class="mut-bad">－ ${m.bad}</div>`;
}

function treasureImg(t){
  return t.icon ? `<svg class="ic tr-ic"><use href="#ic-${t.icon}"/></svg>`
    : `<img class="${t.cls || ''}" src="${art(t.img)}" alt="">`;
}

/* —— 主繪製 —— */
function render(){
  const app = $('app');
  if(!S){ app.innerHTML = view === 'camp' ? campHtml() : titleHtml(); return; }
  const realmVar = `--realm:url('${art('ui/realm' + regionOf(S.depth || 0).realm + '.webp')}')`;
  app.setAttribute('style', realmVar);
  const f = {map: mapHtml, battle: battleHtml, reward: rewardHtml, rest: restHtml, event: eventHtml, result: resultHtml}[S.screen];
  app.innerHTML = f();
  if(S.screen === 'map') scrollMap();
  if(S.battle) S.battle.hand.forEach(c => seenCards.add(c.uid));
  markSeen();
  saveRun();
}

/* 圖鑑：遇過的敵人、看過或帶過的財寶 */
function markSeen(){
  let dirty = false;
  meta.seenFoe = meta.seenFoe || {}; meta.seenTre = meta.seenTre || {};
  const foe = k => { if(!meta.seenFoe[k]){ meta.seenFoe[k] = 1; dirty = true; } };
  const tre = id => { if(!meta.seenTre[id]){ meta.seenTre[id] = 1; dirty = true; } };
  if(S.battle) S.battle.enemies.forEach(e => foe(e.key));
  S.bag.forEach(tre);
  if(S.reward && S.reward.loot) S.reward.loot.forEach(tre);
  if(dirty) saveMeta();
}

/* 營地重畫時保留捲動位置（買東西、切分頁不要跳回最上面） */
function renderKeep(){
  const el = document.querySelector('#app .screen');
  const top = el ? el.scrollTop : 0;
  render();
  const el2 = document.querySelector('#app .screen');
  if(el2) el2.scrollTop = top;
}

function titleHtml(){
  const saved = loadRun();
  return `<div class="screen title-screen">
    <div class="title-bg" style="background-image:url('${art('ui/title_bg.webp')}')"></div>
    <div class="grow"></div>
    <h1 class="title">貪婪深淵</h1>
    <div class="subtitle">重製版</div>
    <div class="meta-line"><span>職業 <b>${CLASSES[meta.cls].n}</b></span><span>下潛 <b>${meta.runs}</b></span><span>生還 <b>${meta.escapes}</b></span><span>單趟最高 <b>${meta.best}</b></span><span>金幣 <b>${meta.gold}</b></span>${meta.cleared ? `<span>通關 <b>${meta.cleared}</b></span>` : ''}</div>
    <div class="col">
      ${saved ? `<button class="btn primary" data-act="resume">繼續這一趟<small>${saved.bag.length} 件財寶還在身上</small></button>` : ''}
      <button class="btn ${saved ? '' : 'primary'}" data-act="toCamp">進營地</button>
      <button class="btn" data-act="help">怎麼玩</button>
      <button class="btn" data-act="home">回遊戲列表</button>
    </div></div>`;
}

/* —— 營地 —— */
function gearIcon(id){
  const g = GEAR[id];
  return `<img src="${art(g.img)}" alt="" style="filter:drop-shadow(0 0 5px ${RARITY[g.r].c})">`;
}
function campHtml(){
  const L = loadoutFrom(meta);
  const saved = loadRun();
  const maxD = meta.depth || 0;
  const d = diveDepth === null ? maxD : Math.min(diveDepth, maxD);
  const nmLim = nmLimit(meta), nmSel = Math.min(diveNm, nmLim);
  const nmRow = nmLim > 0 ? `<div class="depth-pick nm-pick"><button class="chip" data-act="nmSet:${nmSel - 1}" ${nmSel <= 0 ? 'disabled' : ''}>較低</button>
          <span>${nmSel ? `噩夢 ${nmSel} 階` : '一般難度'}<small>${nmSel ? `新增：${NIGHTMARES[nmSel - 1].d}・共 ${nmSel} 條規則・財寶賣價 +${Math.round(NM_SELL * nmSel * 100)}%` : '可選噩夢階，敵人更強，財寶更值錢'}</small></span>
          <button class="chip" data-act="nmSet:${nmSel + 1}" ${nmSel >= nmLim ? 'disabled' : ''}>較高</button></div>` : '';
  const slots = Object.keys(SLOTS).map(k => {
    const id = meta.equip[k], g = id && GEAR[id];
    return `<button class="slot" data-act="gearSheet:${k}">
      ${g ? gearIcon(id) : '<span class="slot-empty">空</span>'}
      <span class="slot-t"><small>${SLOTS[k]}・持有 ${meta.owned.filter(id => GEAR[id].slot === k).length} / ${Object.keys(GEAR).filter(id => GEAR[id].slot === k).length}</small><b style="color:${g ? RARITY[g.r].c : 'var(--dim)'}">${g ? g.n : '還沒有裝備'}</b>
      <small>${g ? g.d : '活著回來就會拿到'}</small></span></button>`;
  }).join('');
  const ups = Object.keys(STAT_UPS).map(k => {
    const u = STAT_UPS[k], lv = meta.stats[k] || 0, full = lv >= u.max, cost = statCost(k, lv);
    return `<div class="up-row"><div class="up-t"><b>${u.n}</b> <small>Lv ${lv} / ${u.max}</small><div class="up-d">${u.d}</div></div>
      <button class="btn up-btn" data-act="buy:${k}" ${full || meta.gold < cost ? 'disabled' : ''}>${full ? '已滿' : `${ic('gold')} ${cost}`}</button></div>`;
  }).join('');
  const smith = Object.keys(GEAR).filter(id => !meta.owned.includes(id) && (smithTab === 'all' || GEAR[id].slot === smithTab)).sort((a, b) => GEAR[a].r - GEAR[b].r).map(id => {
    const g = GEAR[id], R = RARITY[g.r], st = gearBuyState(meta, id);
    return `<div class="up-row${st === 'locked' || st === 'ach' ? ' locked' : ''}">${gearIcon(id)}
      <div class="up-t"><b style="color:${R.c}">${g.n}</b> <small>${SLOTS[g.slot]}・${R.n}</small><div class="up-d">${g.d}</div></div>
      ${st === 'ach' ? `<span class="lock-note">成就「${ACHIEVEMENTS.find(a => a.id === g.ach).n}」後開放</span>`
      : st === 'locked' ? `<span class="lock-note">解鎖第 ${g.r + 1} 層後開放</span>`
        : `<button class="btn up-btn" data-act="smith:${id}" ${st === 'ok' ? '' : 'disabled'}>${ic('gold')} ${R.buy}</button>`}</div>`;
  }).join('');
  return `<div class="camp-head" style="background-image:linear-gradient(180deg,rgba(8,6,5,.35),var(--bg)),url('${ART}camp3.webp')">
      <button class="chip camp-back" data-act="toTitle">標題</button>
      <div class="page-title">營地</div>
      <div class="camp-gold">${ic('gold')} ${meta.gold}</div>
    </div>
    <div class="screen">
      <div class="sect">職業</div>
      <div class="cls-row">${CLASS_ORDER.map(id => { const c = CLASSES[id], ok = clsUnlocked(meta, id);
        return `<button class="cls-card${meta.cls === id ? ' on' : ''}${ok ? '' : ' locked'}" data-act="setCls:${id}"><img src="${art(c.img)}" alt=""><b>${c.n}</b><small>${ok ? '生命 ' + c.hp : '打贏第 ' + c.need + ' 層首領解鎖'}</small></button>`; }).join('')}</div>
      <div class="sheet-p cls-line"><b>${CLASSES[meta.cls].n}</b>：${CLASSES[meta.cls].line}</div>
      <button class="btn rec-btn" data-act="records">紀錄與圖鑑<small>成就 ${Object.keys(meta.ach || {}).length} / ${ACHIEVEMENTS.length}・敵人 ${Object.keys(meta.seenFoe || {}).length} / ${Object.keys(ENEMIES).length}</small></button>
      <div class="sect">下一趟的你</div>
      <div class="camp-power">
        <span>生命 <b>${CLASSES[meta.cls].hp + (L.hp || 0)}</b></span><span>力量 <b>${L.str || 0}</b></span>
        <span>開場格擋 <b>${L.blk || 0}</b></span><span>背包 <b>${GAME.bag + (L.bag || 0)}</b></span>
      </div>
      <div class="sect">裝備（點一下更換）</div>
      <div class="col" style="gap:6px">${slots}</div>
      <div class="sect">素質（永久提升）</div>
      ${ups}
      <div class="sect">鐵匠鋪（金幣買裝備，稀有度上限＝解鎖到第幾層）</div>
      <div class="tabs">${[['all', '全部'], ...Object.entries(SLOTS)].map(([k, n]) => `<button class="chip${smithTab === k ? ' on' : ''}" data-act="smithTab:${k}">${n}</button>`).join('')}</div>
      ${smith || '<div class="sheet-p" style="color:var(--dim)">這一類全部都買齊了。</div>'}
    </div>
    <div class="camp-foot">
      ${saved ? `<button class="btn primary" data-act="resume">繼續這一趟<small>${saved.bag.length} 件財寶還在身上</small></button>
        <button class="btn danger" style="margin-top:6px;padding:8px" data-act="confirmNew">放棄這一趟</button>`
      : `${maxD > 0 ? `<div class="depth-pick"><button class="chip" data-act="depth:${d - 1}" ${d <= 0 ? 'disabled' : ''}>較淺</button>
          <span>第 ${d + 1} 層・${depthName(d)}<small>敵人 +${Math.round((depthMul('hp', d) - 1) * 100)}%・財寶 +${Math.round((depthMul('value', d) - 1) * 100)}%${regionOf(d).rule ? `<br>規則：${regionOf(d).rule.n}（${regionOf(d).rule.d}）` : ''}</small></span>
          <button class="chip" data-act="depth:${d + 1}" ${d >= maxD ? 'disabled' : ''}>較深</button></div>` : ''}
        ${nmRow}
        <button class="btn primary" data-act="newGame">下潛${meta.escapes >= 1 ? '<small>下潛前可以選一個異變</small>' : ''}</button>`}
    </div>`;
}
/* —— 紀錄與圖鑑 —— */
function openRecords(){
  const TABS = [['cls', '職業'], ['ach', '成就'], ['foe', '敵人'], ['tre', '財寶'], ['gear', '裝備']];
  const ach = meta.ach || {}, seenFoe = meta.seenFoe || {}, seenTre = meta.seenTre || {};
  const img = (src, extra) => `<img loading="lazy" decoding="async" src="${src}" alt="" ${extra || ''}>`;
  let body = '';
  if(recTab === 'cls'){
    body = CLASS_ORDER.map(id => {
      const c = CLASSES[id], s = (meta.clsStats || {})[id] || {};
      return `<div class="bag-line">${img(art(c.img))}<div><b>${c.n}</b> ${clsUnlocked(meta, id) ? '' : `<span class="sub">（打贏第 ${c.need} 層首領解鎖）</span>`}
        <div class="sub">下潛 ${s.dives || 0}・生還 ${s.escapes || 0}・首領勝 ${s.boss || 0}</div>
        <div class="sub">最深第 ${s.deep || 0} 層・最高噩夢 ${s.nm || 0} 階</div></div></div>`;
    }).join('') + `<div class="sheet-p" style="color:var(--dim);font-size:12px">總計：下潛 ${meta.runs}・生還 ${meta.escapes}・通關 ${meta.cleared || 0}・已通關噩夢 ${meta.nmMax || 0} 階。<br>最高噩夢＝該職業打贏首領時所用的最高階。</div>`;
  }else if(recTab === 'ach'){
    body = ACHIEVEMENTS.map(a => `<div class="bag-line ach-line${ach[a.id] ? ' done' : ''}"><span class="ach-mark">${ach[a.id] ? '✔' : '？'}</span>
      <div><b>${a.n}</b><div class="sub">${a.d}</div><div class="sub">獎勵：${rewardText(a.reward)}</div></div></div>`).join('');
  }else if(recTab === 'foe'){
    const keys = Object.keys(ENEMIES);
    body = `<div class="sheet-p" style="color:var(--dim);font-size:12px">遇過 ${keys.filter(k => seenFoe[k]).length} / ${keys.length}</div><div class="bag-grid">${keys.map(k => {
      const d = ENEMIES[k];
      return seenFoe[k] ? `<div class="bag-it">${img(foeArt(d.art, k))}${d.n}</div>` : `<div class="bag-it unk"><span class="unk-q">？</span>？？？</div>`;
    }).join('')}</div>`;
  }else if(recTab === 'tre'){
    body = `<div class="bag-grid">${TREASURES.map(t => seenTre[t.id]
      ? `<div class="bag-it">${treasureImg(t)}${t.n}<br><span class="sub">${FAM[t.fam].n}</span></div>`
      : `<div class="bag-it unk"><span class="unk-q">？</span>？？？</div>`).join('')}</div>`;
  }else{
    body = Object.keys(GEAR).sort((a, b) => GEAR[b].r - GEAR[a].r).map(id => {
      const g = GEAR[id], own = meta.owned.includes(id), lock = g.ach && !ach[g.ach];
      return `<div class="bag-line${own ? '' : ' unk-line'}">${img(art(g.img), `style="filter:${own ? `drop-shadow(0 0 5px ${RARITY[g.r].c})` : 'grayscale(1) brightness(.45)'}"`)}
        <div><span style="color:${RARITY[g.r].c}">${g.n}</span> <span class="sub">${SLOTS[g.slot]}・${RARITY[g.r].n}</span><div class="sub">${g.d}</div>
        ${lock ? `<div class="sub">成就「${ACHIEVEMENTS.find(a => a.id === g.ach).n}」後出現</div>` : ''}</div>
        <span class="sub" style="margin-left:auto;flex:none">${own ? '已擁有' : '未擁有'}</span></div>`;
    }).join('');
  }
  openSheet(`<div class="sheet-t">紀錄與圖鑑</div>
    <div class="tabs rec-tabs">${TABS.map(([k, n]) => `<button class="chip${recTab === k ? ' on' : ''}" data-act="recTab:${k}">${n}</button>`).join('')}</div>
    <div class="rec-body">${body}</div>
    <button class="btn sticky-close" style="margin-top:10px" data-act="closeSheet">關閉</button>`);
}
function openGearSheet(slot){
  const list = meta.owned.filter(id => GEAR[id].slot === slot).sort((a, b) => GEAR[b].r - GEAR[a].r);
  openSheet(`<div class="sheet-t">${SLOTS[slot]}　<small style="font-size:12px;color:var(--dim);letter-spacing:0">持有 ${list.length} 件，點「穿上」更換</small></div>
    ${list.length ? list.map(id => { const g = GEAR[id], on = meta.equip[slot] === id;
      return `<div class="bag-line">${gearIcon(id)}<div><span style="color:${RARITY[g.r].c}">${g.n}</span> <span class="sub">${RARITY[g.r].n}</span><div class="sub">${g.d}</div></div>
        ${on ? '<span class="sub" style="margin-left:auto;flex:none">穿著中</span>' : `<button class="btn" data-act="equip:${id}">穿上</button>`}</div>`;
    }).join('') : '<div class="sheet-p" style="color:var(--dim)">還沒有這類裝備。活著回來就會拿到一件，貪婪越高越好。</div>'}
    <button class="btn sticky-close" style="margin-top:10px" data-act="closeSheet">關閉</button>`);
}

/* —— 異變三選一 —— */
function openMutationSheet(){
  mutChoices = pickMutations(3, Math.random);
  openSheet(`<div class="sheet-t">這一趟的異變</div>
    <div class="sheet-p">選一個，這一趟的規則會改變；每個都有好處也有代價。</div>
    ${mutChoices.map(id => `<button class="mut-opt" data-act="pickMut:${id}">${mutInfoHtml(id)}</button>`).join('')}
    <button class="btn" style="margin-top:8px" data-act="pickMut:none">不異變<small>照原本的規則下潛</small></button>
    <button class="btn" style="margin-top:6px;padding:8px" data-act="closeSheet">先不下潛</button>`);
}

/* —— 地圖 —— */
const ROW_H = 92;
function mapHtml(){
  const open = reachable(S).map(p => p.join(','));
  const curR = S.at ? S.at[0] : -1;
  const sight = MUTATIONS[S.mutation] ? MUTATIONS[S.mutation].sight : 0;
  let lines = '', nodes = '';
  const X = n => (n.x * 100).toFixed(1) + '%';
  const Y = r => r * ROW_H + 36;
  S.map.forEach((row, r) => row.forEach((n, c) => {
    n.next.forEach(nc => {
      const m = S.map[r + 1][nc];
      const isOpen = S.at && S.at[0] === r && S.at[1] === c;
      const walked = n.done && m.done;
      lines += `<line class="${walked ? 'walked' : isOpen ? 'open' : ''}" x1="${X(n)}" y1="${Y(r)}" x2="${X(m)}" y2="${Y(r + 1)}"/>`;
    });
    const isOpen = open.includes(r + ',' + c);
    const here = S.at && S.at[0] === r && S.at[1] === c;
    /* 黑暗：前方超過 sight 列的一般節點看不到類型 */
    const hidden = !!sight && r > curR + sight && !n.done && n.t !== 'exit' && n.t !== 'boss';   // 撤離點與首領的位置固定，不藏
    const kind = hidden ? 'event' : n.t;
    const label = hidden ? '？' : NODE_NAME[n.t];
    const extra = hidden ? '' : n.t === 'fight' ? `<em>${n.reward === 'card' ? '技能' : '財寶'}</em>`
      : n.t === 'elite' ? `<em>技能＋財寶</em>` : n.t === 'exit' ? `<em>帶走全部</em>` : '';
    const boxTop = Y(r) - (kind === 'boss' ? 32 : 25);
    nodes += `<button class="node ${kind}${isOpen ? ' open' : ''}${n.done ? ' done' : ''}${here ? ' here' : ''}${r < curR && !n.done ? ' past' : ''}"
      style="left:${X(n)};top:${boxTop}px" ${isOpen ? `data-act="node:${r},${c}"` : 'disabled'}>
      <span class="pic" style="background-image:url('${art(NODE_ART[kind])}')"></span>${label}${extra}</button>`;
  }));
  return `${hud()}
    <div class="map-scroll" id="mapScroll"><div class="map" style="height:${S.map.length * ROW_H + 40}px">
      <svg class="lines">${lines}</svg>${nodes}</div></div>
    <div class="map-foot">
      <button class="chip" data-act="deckSheet">${ic('book')} 技能 ${S.deck.length}</button>
      <button class="chip" data-act="bagSheet">${ic('gold')} 可賣 ${bagValue(S)}</button>
      <button class="chip" data-act="menu">選單</button>
    </div>`;
}
function scrollMap(){
  const el = $('mapScroll');
  if(!el) return;
  const r = S.at ? S.at[0] : 0;
  el.scrollTop = Math.max(0, r * ROW_H - 40);
}

/* —— 戰鬥 —— */
/* 招式的特殊效果，簡短標籤（預告與詳情共用）。普通攻擊、格擋不在這裡 */
function moveBits(p){
  const b = [];
  if(p.drain) b.push('吸血');
  if(p.boom) b.push('自爆');
  if(p.vuln) b.push('易傷');
  if(p.weak) b.push('虛弱');
  if(p.psn) b.push('中毒');
  if(p.burn) b.push('燃燒' + p.burn);
  if(p.ap) b.push('燒行動點');
  if(p.goo) b.push('塞黏液');
  if(p.astr) b.push(p.all ? '全隊強化' : '強化友軍');
  if(p.ablk) b.push('護友');
  if(p.aheal) b.push('治療友軍');
  if(p.str) b.push('力量+' + p.str);
  return b;
}
function intentHtml(e){
  const p = intent(S, e), bits = moveBits(p);
  const nm = p.nm ? `<span class="inm">${p.nm}</span>` : '';
  const bt = bits.length ? `<span class="ibits">${bits.join('・')}</span>` : '';
  if(p.a){
    const dmg = enemyHitValue(S, e, p.a);
    return `<span class="intent atk${e.charged ? ' heavy' : ''}">${ic('sword')}${dmg}${p.x ? '×' + p.x : ''}${e.charged ? '<span class="inm">重擊</span>' : nm}${bt}</span>`;
  }
  if(p.charge){
    const nx = edef(e).pat[(e.step + 1) % edef(e).pat.length];
    const nb = nx.boom ? '<span class="ibits">之後自爆</span>' : '';
    return `<span class="intent warn">${ic('warn')}${p.d ? ic('shield') + p.d : ''}<span class="inm">→重擊 ${nx.a ? enemyHitValue(S, e, nx.a) : '?'}</span>${nb}</span>`;
  }
  if(p.steal) return `<span class="intent warn">${ic('bag')}${nm}</span>`;
  if(p.flee) return `<span class="intent warn">${ic('exit')}${nm}</span>`;
  if(p.summon) return `<span class="intent bad">${ic('skull')}${nm}</span>`;
  if(p.goo || p.weak || p.psn || p.vuln || p.burn || p.ap) return `<span class="intent bad">${ic('poison')}${p.d ? ic('shield') + p.d : ''}${nm}${bt}</span>`;
  if(p.astr || p.ablk || p.aheal || p.str) return `<span class="intent def">${ic('star')}${p.d ? ic('shield') + p.d : ''}${nm}${bt}</span>`;
  if(p.d) return `<span class="intent def">${ic('shield')}${p.d}${nm}</span>`;
  return `<span class="intent">?</span>`;
}
function foeHtml(e, i, b){
  const gone = e.hp <= 0 || e.gone;
  const tags = [];
  if(e.block > 0) tags.push(`<span class="tag blk">${ic('shield')}${e.block}</span>`);
  if(e.vuln > 0) tags.push(`<span class="tag vul">易傷${e.vuln}</span>`);
  if(e.psn > 0) tags.push(`<span class="tag psn">毒${e.psn}</span>`);
  if(e.mk > 0) tags.push(`<span class="tag mk">咒印${e.mk}</span>`);
  if(e.str > 0) tags.push(`<span class="tag str">力${e.str}</span>`);
  if(e.charged) tags.push(`<span class="tag vul">蓄力完成</span>`);
  if(e.half) tags.push(`<span class="tag tr">狂化</span>`);
  if(ENEMIES[e.key].dodge) tags.push(`<span class="tag blk">閃避${Math.round(ENEMIES[e.key].dodge * 100)}%</span>`);
  e.traits.forEach(t => tags.push(`<span class="tag tr">${TRAITS[t].n}</span>`));
  if(e.loot.length) tags.push(`<span class="tag vul">${ic('bag')}贓物</span>`);
  return `<button class="foe${b.target === i ? ' target' : ''}${e.boss ? ' boss' : ''}${e.elite ? ' elite' : ''}${gone ? ' dead' : ''}" data-uid="${e.uid}" data-act="foe:${i}">
    ${gone ? '<span class="intent">&nbsp;</span>' : intentHtml(e)}
    <img src="${foeArt(edef(e).art, e.key)}" alt="${e.n}">
    <span class="fname">${e.n}</span>
    <span class="bar"><i style="width:${e.hp / e.max * 100}%"></i><span>${e.hp}/${e.max}</span></span>
    <span class="tags">${tags.join('')}</span></button>`;
}
function battleHtml(){
  const b = S.battle;
  const target = b.enemies[b.target];
  const myTurn = b.phase === 'player';
  const apMax = Math.max(GAME.ap, b.ap);
  let orbs = '';
  for(let i = 0; i < apMax; i++) orbs += `<i class="${i < b.ap ? '' : 'off'}"></i>`;
  const status = [];
  if(b.str) status.push(`<span class="tag str">力量${b.str}</span>`);
  if(b.scars) status.push(`<span class="tag tr" data-act="scarInfo">傷痕${b.scars}</span>`);
  if(b.weak) status.push(`<span class="tag vul">虛弱${b.weak}</span>`);
  if(b.vuln) status.push(`<span class="tag vul">易傷${b.vuln}</span>`);
  if(b.psn) status.push(`<span class="tag tr">中毒${b.psn}</span>`);
  if(clsOf(S) === 'rogue') status.push(`<span class="tag cb" data-act="comboInfo">連擊 ${b.played || 0}</span>`);
  if(clsOf(S) === 'mage') status.push(`<span class="tag mn" data-act="manaInfo">法力 ${b.mana || 0}/${MANA_MAX}</span>`);
  if(b.keep) status.push(`<span class="tag blk">堅守</span>`);
  if(b.burn) status.push(`<span class="tag tr" data-act="burnInfo">燃燒${b.burn}</span>`);
  if(b.apLoss) status.push(`<span class="tag vul">下回合行動點-${b.apLoss}</span>`);
  const rg = regionOf(S.depth || 0);
  if(rg.rule) status.push(`<span class="tag vul" data-act="ruleInfo">${rg.n}・${rg.rule.n}</span>`);
  if(S.nm) status.push(`<span class="tag vul" data-act="nmInfo">噩夢 ${S.nm}</span>`);
  if(S.mutation) status.push(`<span class="tag tr" data-act="mutInfo">異變・${MUTATIONS[S.mutation].n}</span>`);
  /* 身上遺物與詛咒的效果也要看得到（點一下開背包） */
  S.bag.forEach(id => { const t = treasure(id);
    if(t.fam === 'relic') status.push(`<span class="tag rel" data-act="bagSheet">${t.n}</span>`);
    else if(t.fam === 'curse') status.push(`<span class="tag cur" data-act="bagSheet">${t.n}：${t.ef}</span>`); });
  const hand = b.hand.map((c, i) => cardHtml(c, {deal: 1, off: !myTurn || cardDef(c).c > b.ap, target, delay: 0,
    attr: `data-card="${i}"`})).join('');
  const burnable = myTurn && !b.burned && S.bag.length > 0;
  return `${hud()}
    <div class="battle">
      <div class="stage">${b.enemies.map((e, i) => foeHtml(e, i, b)).join('')}</div>
      <div class="pl" id="plArea">
        <span class="ap">${orbs}<b>${b.ap}</b></span>
        <span class="pl-block${b.block ? '' : ' zero'}" id="plBlock">${ic('shield')}${b.block}</span>
        ${clsOf(S) === 'mage' ? `<span class="mana" id="plMana" data-act="manaInfo" title="法力">${Array.from({length: MANA_MAX}, (_, i) => `<i class="${i < (b.mana || 0) ? '' : 'off'}"></i>`).join('')}</span>` : ''}
        <span class="tags" style="justify-content:flex-start">${status.join('')}</span>
        <span class="piles">牌堆 ${b.draw.length}<br>棄牌 ${b.disc.length}</span>
      </div>
      <div class="hand">${hand || `<span style="margin:auto;color:var(--dim);font-size:13px">${myTurn ? '手牌打完了' : '敵方行動中…'}</span>`}</div>
      <div class="acts">
        <button class="btn burn" data-act="bagSheet" ${burnable ? '' : 'disabled'}>${ic('fire')} 燒財寶<small>${b.burned ? '本回合已燒' : `換 ${burnApGain(S)} 行動點`}</small></button>
        <button class="btn primary" data-act="endTurn" ${myTurn ? '' : 'disabled'}>結束回合</button>
      </div>
    </div>`;
}

/* —— 獎勵 —— */
function famTag(t){ return `<span class="fam fam-${t.fam}">${FAM[t.fam].n}</span>`; }
function lootTile(id, i){
  const t = treasure(id);
  return `<button class="loot ${t.fam}" data-act="loot:${i}">${famTag(t)}${treasureImg(t)}${t.n}
    <div class="ef">${t.ef || '沒有效果'}</div><div class="v">${ic('gold')} 賣 ${treasureValue(S, id)}</div><div class="g">貪婪 +${t.g}</div></button>`;
}
function rewardHtml(){
  const R = S.reward;
  let body = '';
  if(R.loot) body += `<div class="sect">財寶 · 挑一件（背包 ${S.bag.length}/${S.bagCap}）</div>
    <div class="loot-row" style="grid-template-columns:repeat(${R.loot.length > 3 ? 2 : R.loot.length},1fr)">${R.loot.map(lootTile).join('')}</div>
    <button class="btn" style="margin-top:8px" data-act="skipLoot">不拿</button>`;
  if(R.cards) body += `<div class="sect">技能 · 挑一張${R.up ? '（鍛爐：已強化）' : ''}</div>
    <div class="card-row">${R.cards.map((id, i) => cardHtml({id, up: R.up && CARDS[id].up ? 1 : 0}, {attr: `data-pick="${i}"`})).join('')}</div>
    <button class="btn" style="margin-top:8px" data-act="skipCards">不學</button>`;
  if(!R.loot && !R.cards && R.again) body += `<div class="col" style="margin-top:14px">
    <button class="btn danger" data-act="chestAgain">再翻一次<small>${Math.round(GAME.chestMimic * 100)}% 機率是寶箱怪</small></button>
    <button class="btn primary" data-act="closeReward">見好就收</button></div>`;
  return `${hud()}<div class="screen"><div class="page-title">${R.title}</div><div class="page-text">${R.text}</div>${body}</div>`;
}

/* —— 營火 —— */
function restHtml(){
  const heal = Math.min(S.maxHp - S.hp, restHealAmt(S));
  return `${hud()}<div class="screen">
    <img class="ev-img" src="${art('ui/door_rest.webp')}" alt="">
    <div class="page-title">營火</div><div class="page-text">火堆還有餘溫。只夠做一件事。</div>
    <div class="col">
      <button class="btn primary" data-act="restHeal" ${heal ? '' : 'disabled'}>休息<small>回復 ${heal} 生命</small></button>
      <button class="btn" data-act="restPick:up">磨練<small>強化一張技能</small></button>
      <button class="btn" data-act="restPick:rm">拋棄雜念<small>從牌組移除一張技能</small></button>
    </div></div>`;
}

/* —— 事件 —— */
function eventHtml(){
  const ev = S.event, E = EVENTS[ev.id];
  if(ev.pick === 'remove') return `${hud()}<div class="screen">
    <div class="page-title">${E.title}</div><div class="ev-text">${ev.note}</div>
    <div class="deck-grid">${deckSorted().map(c => cardHtml(c, {attr: `data-act="evPick:${c.i}" data-info="${c.id}:${c.up}"`})).join('')}</div>
    <div class="sheet-p" style="color:var(--dim);font-size:12px">點一張把它從牌組移除，長按看說明。</div></div>`;
  const opts = ev.result ? `<button class="btn primary" data-act="closeEvent">繼續</button>`
    : E.opts.map(o => `<button class="btn" data-act="evOpt:${o.id}" ${eventOptEnabled(S, o) ? '' : 'disabled'}>${o.t}<small>${o.d}</small></button>`).join('');
  return `${hud()}<div class="screen">
    <img class="ev-img" src="${art(E.img)}" alt="">
    <div class="page-title">${E.title}</div>
    <div class="ev-text">${ev.result || E.text}</div>
    <div class="col">${opts}</div></div>`;
}

/* —— 結算 —— */
function endingHtml(){
  const again = (meta.cleared || 0) > 1, L = again ? ENDING.again : ENDING.first;
  return `<div class="screen ending">
    <div class="grow"></div>
    <div class="result-t ok">深淵之心停了</div>
    <div class="end-txt">${L.map(t => `<p>${t}</p>`).join('')}</div>
    <div class="end-n">第 ${meta.cleared || 1} 次通關</div>
    <div class="grow"></div>
    <div class="col"><button class="btn primary" data-act="endingNext">繼續</button></div>
  </div>`;
}
function resultHtml(){
  const r = S.result;
  if(r.ending && !r.endSeen) return endingHtml();
  const list = (ids, lost) => ids.map(id => { const t = treasure(id);
    return `<div class="bag-it${lost ? ' lost' : ''}">${treasureImg(t)}${t.n}<br>${treasureValue(S, id)}</div>`; }).join('');
  return `<div class="screen">
    <div class="result-t ${r.ok ? 'ok' : 'no'}">${r.ok ? '活著回來' : '葬身深淵'}</div>
    <div class="result-why">${r.why}</div>
    <div class="result-why" style="margin-top:-4px">職業：${CLASSES[r.cls || 'sword'].n}</div>
    <div class="result-v">${ic('gold')} ${r.value}<small>${r.ok ? '財寶賣掉換到的金幣' : '什麼都沒帶回來'}</small></div>
    ${r.mutation ? `<div class="mut-note">本趟異變　${mutInfoHtml(r.mutation)}</div>` : ''}
    ${r.nm ? `<div class="mut-note nm-note">噩夢 ${r.nm} 階　財寶賣價 +${Math.round(NM_SELL * r.nm * 100)}%</div>` : ''}
    ${r.newNm ? `<div class="unlock">開放噩夢 ${r.newNm} 階</div>` : ''}
    ${(r.newAch || []).map(achHtml).join('')}
    ${r.gear ? gearReward(r) : ''}
    ${r.newDepth ? `<div class="unlock">解鎖第 ${r.newDepth + 1} 層・${depthName(r.newDepth)}</div>` : ''}
    ${r.items.length ? `<div class="sect">賣掉的財寶</div><div class="bag-grid">${list(r.items)}</div>` : ''}
    ${r.lost.length ? `<div class="sect">永遠留在下面</div><div class="bag-grid">${list(r.lost, 1)}</div>` : ''}
    <div class="stat-row"><span>走了 <b>${r.steps}</b> 格</span><span>打倒 <b>${r.kills}</b></span><span>燒掉 <b>${r.burned}</b></span><span>最終貪婪 <b>${r.greed}</b></span></div>
    <div class="grow"></div>
    <div class="col"><button class="btn primary" data-act="toCamp">回營地${r.ok ? '<small>花金幣變強、換裝備</small>' : ''}</button></div>
  </div>`;
}
function rewardText(rw){
  return rw.card ? `新技能「${CARDS[rw.card].n}」加入獎勵牌池` : rw.gear ? `新裝備「${GEAR[rw.gear].n}」可在鐵匠鋪購買、回程掉落` : `${rw.gold} 金幣`;
}
function achHtml(id){
  const a = ACHIEVEMENTS.find(x => x.id === id);
  return `<div class="ach-get"><small>達成成就</small><b>${a.n}</b><div>${a.d}</div><small>獎勵：${rewardText(a.reward)}</small></div>`;
}
function gearReward(r){
  const g = GEAR[r.gear], R = RARITY[g.r];
  const note = r.dupGold ? `已經有了，換成 ${r.dupGold} 金幣` : r.autoEquip ? '已自動穿上' : '到營地可以換上';
  return `<div class="gear-get" style="border-color:${R.c}">${gearIcon(r.gear)}
    <div><small>依最終貪婪 ${r.greed}${r.bossDown ? '＋打贏首領' : ''} 獲得${r.greed >= 12 && greedTierIndex(r.greed) > (r.depth || 0) + 1 ? '（受下潛深度限制，往更深才有更好的）' : ''}</small>
    <b style="color:${R.c}">${g.n}</b> <small>${R.n}</small><div>${g.d}</div><small>${note}</small></div></div>`;
}
function bankResult(){
  if(!S.result || S.result.banked) return;
  bankRewards(meta, S.result);
  saveMeta();
  if((S.result.newAch || []).length) setTimeout(() => SFX.ach(), 1300);   // 等結算畫面出來再響
}

/* —— 面板 —— */
function openSheet(html){
  const el = $('sheet');
  el.innerHTML = `<div class="sheet-box">${html}</div>`;
  el.classList.add('show');
}
function closeSheet(){ $('sheet').classList.remove('show'); pendingLoot = null; }
function bagLine(id, i, btn){
  const t = treasure(id);
  return `<div class="bag-line">${treasureImg(t)}<div>${t.n} ${famTag(t)} <span class="ef ${t.fam === 'curse' ? 'bad' : ''}">${t.ef}</span><div class="sub">賣 ${treasureValue(S, id)} 金幣 · 貪婪 ${t.g}</div></div>${btn || ''}</div>`;
}
function openBag(){
  const b = S.battle;
  const canBurn = b && b.phase === 'player' && !b.burned;
  const rows = S.bag.map((id, i) => bagLine(id, i, canBurn
    ? `<button class="btn" data-act="burn:${i}" style="color:#f0a35e">${ic('fire')} 燒掉</button>` : '')).join('');
  openSheet(`<div class="sheet-t">背包 ${S.bag.length}/${S.bagCap}</div>
    <div class="sheet-p">帶著就有效果，回去能賣 <b style="color:var(--gold)">${bagValue(S)}</b> 金幣。死了就全沒，走到撤離點才算你的。${canBurn ? '<br>戰鬥中每回合可以燒一件：+${burnApGain(S)} 行動點，貪婪也隨之下降。' : ''}</div>
    ${rows || '<div class="sheet-p" style="color:var(--dim)">什麼都沒有。</div>'}
    <button class="btn" style="margin-top:10px" data-act="closeSheet">關閉</button>`);
}
function openDeck(){
  openSheet(`<div class="sheet-t">技能牌組 ${S.deck.length} 張</div>
    <div class="deck-grid">${deckSorted().map(c => cardHtml(c, {cls: 'static', attr: `data-info="${c.id}:${c.up}"`})).join('')}</div>
    <div class="sheet-p" style="color:var(--dim);font-size:12px">長按技能看完整說明。</div>
    <button class="btn" data-act="closeSheet">關閉</button>`);
}
function deckSorted(){
  return S.deck.map((c, i) => Object.assign({}, c, {i})).sort((a, b) => a.id < b.id ? -1 : a.id > b.id ? 1 : 0);
}
function openRestPick(mode){
  const list = deckSorted().filter(c => mode === 'rm' ? S.deck.length > 5 : (!c.up && CARDS[c.id].up));
  openSheet(`<div class="sheet-t">${mode === 'rm' ? '移除哪一張？' : '強化哪一張？'}</div>
    <div class="deck-grid">${list.map(c => {
      const shown = mode === 'up' ? {id: c.id, up: 1} : c;
      return cardHtml(shown, {attr: `data-act="${mode === 'rm' ? 'restRm' : 'restUp'}:${c.i}" data-info="${shown.id}:${shown.up}"`});
    }).join('')}</div>
    ${mode === 'up' ? '<div class="sheet-p" style="color:var(--dim);font-size:12px">這裡顯示的是強化後的效果。</div>' : ''}
    <button class="btn" data-act="closeSheet">算了</button>`);
}
function openGreedInfo(){
  const ti = greedTierIndex(S.greed);
  openSheet(`<div class="sheet-t">貪婪 ${S.greed}</div>
    <div class="sheet-p">每走一格 +${GAME.stepGreed}，撿到財寶再加。越貪，敵人越凶，但活著回去拿到的裝備也越好（稀有度最高＝下潛層數 + 1 階，打贏首領再高一階）。首領只吃一半的加成。把財寶燒掉或被偷，貪婪就會降回來。</div>
    ${GREED_TIERS.map((t, i) => `<div class="tier-line${i === ti ? ' on' : ''}"><span>${t.min}+</span><span>${t.n}</span><span>${t.desc}</span></div>`).join('')}
    <button class="btn" style="margin-top:10px" data-act="closeSheet">關閉</button>`);
}
function openHelp(){
  const cl = S ? clsOf(S) : (meta.cls || 'sword'), cd = CLASSES[cl];
  openSheet(`<div class="sheet-t">怎麼玩</div>
    <div class="sheet-p"><b>下潛：</b>在分岔地圖往下走，打倒首領或走到<span style="color:var(--green)">撤離點</span>才算帶回來；死了，身上財寶全沒。</div>
    <div class="sheet-p"><b>財寶：</b><span style="color:var(--gold)">金銀</span>賣得貴；<span style="color:var(--green)">遺物</span>不值錢但帶著變強；<span style="color:var(--red)">詛咒</span>最值錢但有代價。拿越多<b>貪婪</b>越高，敵人更凶、回去的裝備更好。</div>
    <div class="sheet-p"><b>戰鬥：</b>每回合 3 行動點、抽 ${cd.hand || GAME.hand} 張。敵人頭上是下一招。點敵人換目標，點技能使用，<b>長按看說明</b>。快撐不住可燒一件財寶換行動點。</div>
    <div class="sheet-p"><b>${cd.n}：</b>${cd.how}</div>
    <div class="sheet-p"><b>回營地：</b>財寶換成金幣，永久提升素質、買裝備。生還一次後，下潛前可選一個異變（好處配代價）。</div>
    <button class="btn primary" data-act="closeSheet">知道了</button>`);
}

/* —— 演出 —— */
function centerOf(el){
  const r = el.getBoundingClientRect();
  return [r.left + r.width / 2, r.top + r.height / 2];
}
function float(text, cls, x, y){
  const el = document.createElement('div');
  el.className = 'fl ' + cls;
  el.textContent = text;
  el.style.left = x + 'px';
  el.style.top = y + 'px';
  $('fx').appendChild(el);
  setTimeout(() => el.remove(), 900);
}
const foeEl = uid => document.querySelector(`.foe[data-uid="${uid}"]`);
function retrigger(el, cls){
  if(!el) return;
  el.classList.remove(cls);
  void el.offsetWidth;
  el.classList.add(cls);
}
function shake(){ retrigger($('shake'), 'sh'); }
function overlay(cls, ms, html){
  const el = document.createElement('div');
  el.className = cls;
  if(html) el.innerHTML = html;
  $('fx').appendChild(el);
  setTimeout(() => el.remove(), ms);
}
function playerPos(){
  const pl = $('plArea');
  if(pl) return centerOf(pl);
  return [window.innerWidth / 2, window.innerHeight * 0.4];
}
function playFx(list){
  let gap = 0;
  list.forEach(e => {
    const delay = gap;
    if(['hit', 'hurt'].includes(e.k)) gap += 110;
    setTimeout(() => oneFx(e), delay);
  });
}
function oneFx(e){
  const foe = e.uid ? foeEl(e.uid) : null;
  const [fx, fy] = foe ? centerOf(foe) : [0, 0];
  switch(e.k){
    case 'hit': {
      if(foe) retrigger(foe, 'hit');
      if(e.amt > 0){
        const big = e.amt >= 15;
        float(e.amt, 'dmg' + (big ? ' big' : ''), fx + (Math.random() - .5) * 26, fy - 10);
        SFX.hit(big);
        if(big) shake();
      }else{ SFX.block(); }
      if(e.blocked > 0) float(`擋 ${e.blocked}`, 'blk', fx + 26, fy + 24);
      break;
    }
    case 'hurt': {
      const [x, y] = playerPos();
      if(e.amt > 0){
        float('-' + e.amt, 'hurt', x + (Math.random() - .5) * 40, y - 10);
        SFX.hurt();
        shake();
        overlay('vig', 350);
      }
      if(e.blocked > 0){ float(`擋 ${e.blocked}`, 'blk', x + 50, y - 26); SFX.block(); }
      break;
    }
    case 'act': if(foe) retrigger(foe, 'lunge'); if(e.nm) float(e.nm, 'txt', fx, fy - 56); break;
    case 'block': { const [x, y] = playerPos(); float('+' + e.amt, 'blk', x, y - 14); SFX.block(); break; }
    case 'eblock': float('+' + e.amt, 'blk', fx, fy); SFX.block(); break;
    case 'heal': { const [x, y] = playerPos(); float('+' + e.amt, 'heal', x, y - 14); SFX.clink(); break; }
    case 'mana': { const [x, y] = playerPos(); float(`法力 +${e.amt}`, 'mana', x + 30, y - 30); SFX.mana(); retrigger($('plMana') || $('plArea'), 'bump'); break; }
    case 'epsn': float(e.t, 'psn', fx, fy - 30); SFX.poison(); break;
    case 'emk': float(e.t, 'mk', fx, fy - 44); break;
    case 'buff': { const [x, y] = playerPos(); float(e.t, 'txt', x, y - 20); SFX.clink(); break; }
    case 'debuff': { const [x, y] = playerPos(); float(e.t, 'txt', x, y - 24); if(/燃燒/.test(e.t)) SFX.ignite(); else if(/中毒/.test(e.t)) SFX.poison(); break; }
    case 'die': if(foe) foe.classList.add('dying'); SFX.die(); break;
    case 'dodge': if(foe) float('閃避', 'txt', fx, fy - 20); SFX.dodge(); break;
    case 'eheal': float('+' + e.amt, 'heal', fx, fy - 6); break;
    case 'ebuff': float(e.t, 'txt', fx, fy - 44); break;
    case 'form': float(e.t, 'txt', fx, fy - 70); overlay('flash', 500); SFX.morph(); break;
    case 'revive': float('重新站起！', 'txt', fx, fy - 30); break;
    case 'summon': if(foe) foe.classList.add('spawn'); break;
    case 'steal': case 'flee': toast(e.t); SFX.burn(); if(e.k === 'flee' && foe) foe.classList.add('dying'); break;
    case 'toast': toast(e.t); break;
    case 'card': SFX.card(); break;
    case 'coin': SFX.clink(); bumpGreed(); break;
    case 'pick': SFX.clink(); break;
    case 'burn': SFX.burn(); overlay('flash', 400); bumpGreed(); break;
    case 'tier':
      SFX.tier(e.up);
      overlay('tier-banner', 1700, `${e.up ? '貪婪加深' : '貪念退去'}・${e.n}<small>${GREED_TIERS.find(t => t.n === e.n).desc}</small>`);
      break;
    case 'win': SFX.win(); break;
    case 'death': SFX.lose(); shake(); overlay('vig', 350); break;
    case 'extract': SFX.extract(); break;
  }
}
function bumpGreed(){ retrigger($('greedChip'), 'bump'); }
function toast(t){ overlay('toast', 1900, t); }

/* 把這一步的狀態變化畫出來。離開戰鬥時先在舊畫面播完（才看得到最後一擊），再換頁 */
function commit(){
  const list = S && S.fx ? S.fx : [];
  if(S) S.fx = [];
  const leftBattle = $('app').querySelector('.battle') && S && S.screen !== 'battle';
  if(S && S.screen === 'result'){
    bankResult();
    /* 都結束了，不用再跳貪婪階級的橫幅蓋住結算 */
    for(let i = list.length - 1; i >= 0; i--) if(list[i].k === 'tier') list.splice(i, 1);
  }
  if(leftBattle){
    saveRun();
    busy = true;
    playFx(list);
    setTimeout(() => { busy = false; render(); }, S.screen === 'result' ? 1100 : 760);
    return;
  }
  render();
  playFx(list);
}

/* —— 敵方回合：一隻一隻來 —— */
function runEnemyPhase(){
  busy = true;
  const step = () => {
    const more = enemyStep(S);
    if(S.screen !== 'battle'){ busy = false; commit(); return; }
    commit();
    if(more || S.battle.phase === 'enemy') setTimeout(step, 620);
    else busy = false;
  };
  setTimeout(step, 320);
}

/* —— 動作 —— */
const ACT = {
  newGame(){
    if(meta.escapes >= 1){ openMutationSheet(); return; }   // 生還過才有異變
    ACT.pickMut('none');
  },
  pickMut(id){
    closeSheet();
    localStorage.removeItem(RUN_KEY);
    const maxD = meta.depth || 0;
    const mutation = mutChoices.includes(id) ? id : null;   // 只認這次抽到的三個
    S = newRun((Date.now() ^ (Math.random() * 1e9)) | 0, loadoutFrom(meta), diveDepth === null ? maxD : Math.min(diveDepth, maxD), ownedOf(meta), mutation, meta.cls, Math.min(diveNm, nmLimit(meta)), unlockedOf(meta));
    mutChoices = [];
    meta.clsStats = meta.clsStats || {};
    const cs = (meta.clsStats[S.cls] = meta.clsStats[S.cls] || {dives: 0, escapes: 0, boss: 0, deep: 0, nm: 0});
    cs.dives++;
    cs.deep = Math.max(cs.deep || 0, S.depth + 1);
    saveMeta();
    S.fx = [];
    seenCards = new Set();
    render();
    const rg = regionOf(S.depth || 0);
    if(rg.rule) toast(`${rg.n}・${rg.rule.n}`);
    meta.seenCls = meta.seenCls || {};
    if(!meta.seenHelp){ meta.seenHelp = 1; meta.seenCls[clsOf(S)] = 1; saveMeta(); openHelp(); }
    else if(clsOf(S) !== 'sword' && !meta.seenCls[clsOf(S)]){ meta.seenCls[clsOf(S)] = 1; saveMeta(); openHelp(); }
  },
  confirmNew(){
    openSheet(`<div class="sheet-t">放棄這一趟？</div><div class="sheet-p">身上的財寶會全部失去，也拿不到裝備。</div>
      <div class="col"><button class="btn danger" data-act="abandon">放棄</button><button class="btn" data-act="closeSheet">算了</button></div>`);
  },
  abandon(){ localStorage.removeItem(RUN_KEY); closeSheet(); render(); },
  resume(){
    S = loadRun();
    if(!S) return render();
    S.fx = [];
    seenCards = new Set();
    render();
    if(S.battle && S.battle.phase === 'enemy') runEnemyPhase();
  },
  toTitle(){ S = null; view = 'title'; closeSheet(); $('app').removeAttribute('style'); render(); },
  toCamp(){ S = null; view = 'camp'; diveDepth = null; closeSheet(); $('app').removeAttribute('style'); render(); },
  buy(k){ if(buyStat(meta, k)){ saveMeta(); SFX.clink(); renderKeep(); } },
  smith(id){ if(buyGear(meta, id)){ saveMeta(); SFX.clink(); renderKeep(); } },
  smithTab(k){ smithTab = k; renderKeep(); },
  setCls(id){
    if(!CLASSES[id]) return;
    if(!clsUnlocked(meta, id)){ toast(`打贏第 ${CLASSES[id].need} 層首領後解鎖${CLASSES[id].n}`); return; }
    meta.cls = id; saveMeta(); SFX.clink(); renderKeep();
  },
  gearSheet(slot){ openGearSheet(slot); },
  nmSet(n){ diveNm = Math.max(0, Math.min(+n, nmLimit(meta))); renderKeep(); },
  nmInfo(){
    const rows = NIGHTMARES.slice(0, S.nm).map((x, i) => `<div class="tier-line"><span>${i + 1}</span><span>${x.n}</span><span>${x.d}</span></div>`).join('');
    openSheet(`<div class="sheet-t">噩夢 ${S.nm} 階</div><div class="sheet-p">規則逐階累積。回報：財寶賣價 +${Math.round(NM_SELL * S.nm * 100)}%。打贏深淵之心就能挑戰更高一階。</div>${rows}<button class="btn" style="margin-top:10px" data-act="closeSheet">關閉</button>`);
  },
  records(){ openRecords(); },
  recTab(k){ recTab = k; openRecords(); },
  equip(id){ if(equipGear(meta, id)){ saveMeta(); closeSheet(); SFX.clink(); renderKeep(); } },
  depth(d){ diveDepth = +d; renderKeep(); },
  ruleInfo(){ const rg = regionOf(S.depth || 0); if(!rg.rule) return;
    openSheet(`<div class="sheet-t">${rg.n}・${rg.rule.n}</div><div class="sheet-p">${rg.rule.d}。整個區域都一樣，打贏首領前不會變。</div><button class="btn" data-act="closeSheet">關閉</button>`); },
  burnInfo(){ openSheet(`<div class="sheet-t">燃燒</div><div class="sheet-p">每個回合結束時失去等量的生命（不被格擋擋下），之後層數 -1。</div><button class="btn" data-act="closeSheet">關閉</button>`); },
  endingNext(){ S.result.endSeen = 1; render(); },
  mutInfo(){ openSheet(`<div class="sheet-t">這一趟的異變</div><div class="mut-opt static">${mutInfoHtml(S.mutation)}</div><button class="btn" data-act="closeSheet">關閉</button>`); },
  home(){ location.href = '../'; },
  help: openHelp,
  closeSheet,
  menu(){
    openSheet(`<div class="sheet-t">選單</div><div class="col">
      <button class="btn" data-act="help">怎麼玩</button>
      <button class="btn" data-act="saveQuit">存檔回營地</button>
      <button class="btn" data-act="closeSheet">繼續</button></div>`);
  },
  saveQuit(){ closeSheet(); saveRun(); ACT.toCamp(); },
  greedInfo: openGreedInfo,
  bagSheet: openBag,
  deckSheet: openDeck,
  node(arg){
    const [r, c] = arg.split(',').map(Number);
    if(S.map[r][c].t === 'boss' && greedTierIndex(S.greed) > 0){
      const T = greedTier(S), pc = m => Math.round((1 + (m - 1) / 2 - 1) * 100);
      openSheet(`<div class="sheet-t">貪婪還沒放下</div>
        <div class="sheet-p">目前貪婪「${T.n}」：${bossName(S)}血量 <b>+${pc(T.hp)}%</b>、傷害 <b>+${pc(T.dmg)}%</b>${T.start >= 2 ? `、開場格擋 ${Math.floor(T.start / 2)}` : ''}。進去前可以先燒掉或丟掉財寶，把貪婪降下來。</div>
        <div class="col"><button class="btn primary" data-act="bossGo:${arg}">進去</button><button class="btn" data-act="bagSheet">看背包</button><button class="btn" data-act="closeSheet">再想想</button></div>`);
      return;
    }
    if(S.map[r][c].t === 'exit'){
      openSheet(`<div class="sheet-t">從這裡撤離？</div>
        <div class="sheet-p">賣掉身上 ${S.bag.length} 件財寶得 <b style="color:var(--gold)">${bagValue(S)}</b> 金幣${S.mutation ? `（已含異變「${MUTATIONS[S.mutation].n}」：${MUTATIONS[S.mutation].good}）` : ''}，再依貪婪拿一件<b style="color:${RARITY[runGearRarity(S, S.greed + stepGreedOf(S), false)].c}">${RARITY[runGearRarity(S, S.greed + stepGreedOf(S), false)].n}裝備</b>。這一趟就結束了。</div>
        ${gearDepthCapped(S, S.greed + stepGreedOf(S)) ? `<div class="sheet-p" style="color:var(--dim);font-size:12px">貪婪夠高，但這一層最多只能拿${RARITY[runGearRarity(S, S.greed + stepGreedOf(S), false)].n}的裝備；往更深走才有更好的。打贏首領還能再升一階。</div>` : ''}
        <div class="col"><button class="btn primary" data-act="exitGo:${arg}">爬上去</button><button class="btn" data-act="closeSheet">再貪一點</button></div>`);
      return;
    }
    enterNode(S, r, c);
    commit();
  },
  bossGo(arg){
    closeSheet();
    const [r, c] = arg.split(',').map(Number);
    enterNode(S, r, c);
    commit();
  },
  exitGo(arg){
    closeSheet();
    const [r, c] = arg.split(',').map(Number);
    enterNode(S, r, c);
    commit();
  },
  foe(arg){
    const i = +arg, b = S.battle;
    if(!b) return;
    if(b.target === i){ foeInfo(b.enemies[i]); return; }
    setTarget(S, i);
    render();
  },
  comboInfo(){ openSheet(`<div class="sheet-t">連擊</div><div class="sheet-p">這個回合已經打出的牌數（現在 ${S.battle.played || 0}）。追擊、刀雨、終結一擊等牌，每已出一張就多加傷害。回合開始歸零，所以先打便宜的牌，最後再收尾。</div><button class="btn" data-act="closeSheet">關閉</button>`); },
  manaInfo(){ openSheet(`<div class="sheet-t">法力</div><div class="sheet-p">現在 ${S.battle.mana || 0} / ${MANA_MAX}。回合結束沒用完的行動點會存成法力，跨回合保留。打出<b>法術</b>牌會吃掉全部法力，每點法力讓傷害或格擋更高（卡面數字已含目前法力）；「回響」不耗法力。</div><button class="btn" data-act="closeSheet">關閉</button>`); },
  scarInfo(){ openSheet(`<div class="sheet-t">傷痕</div><div class="sheet-p">每次被攻擊打到掉血時 +1，只在這場戰鬥有效。血債、怒火會用到它。</div><button class="btn" data-act="closeSheet">關閉</button>`); },
  endTurn(){
    if(!endTurn(S)) return;
    if(S.screen !== 'battle'){ commit(); return; }   // 盾擊戰錘在回合結束就打完了
    commit();
    runEnemyPhase();
  },
  burn(arg){
    if(burnTreasure(S, +arg)){ closeSheet(); commit(); }
  },
  loot(arg){
    const r = takeLoot(S, +arg);
    if(r === 'full'){
      pendingLoot = +arg;
      openSheet(`<div class="sheet-t">背包滿了，換掉哪一件？</div>
        ${S.bag.map((id, i) => bagLine(id, i, `<button class="btn" data-act="swap:${i}">丟掉</button>`)).join('')}
        <button class="btn" style="margin-top:10px" data-act="closeSheet">算了</button>`);
      return;
    }
    commit();
  },
  swap(arg){
    const p = pendingLoot;
    closeSheet();
    takeLoot(S, p, +arg);
    commit();
  },
  skipLoot(){ skipLoot(S); commit(); },
  skipCards(){ skipCards(S); commit(); },
  chestAgain(){ chestAgain(S); commit(); },
  closeReward(){ closeReward(S); commit(); },
  restHeal(){ restHeal(S); commit(); },
  restPick(mode){ openRestPick(mode); },
  restUp(arg){ closeSheet(); restUpgrade(S, +arg); commit(); },
  restRm(arg){ closeSheet(); restRemove(S, +arg); commit(); },
  evOpt(id){ chooseEvent(S, id); commit(); },
  evPick(i){ if(eventPick(S, +i)) commit(); },
  closeEvent(){ closeEvent(S); commit(); },
};
function foeInfo(e){
  const d = edef(e), d0 = ENEMIES[e.key];
  const line = p => {
    const parts = [];
    if(p.a) parts.push(`攻擊 ${enemyHitValue(S, e, p.a)}${p.x ? '×' + p.x : ''}`);
    if(p.drain) parts.push('吸血（打掉你多少生命，自己就回多少）');
    if(p.boom) parts.push('自爆（打完就死）');
    if(p.vuln) parts.push(`易傷 ${p.vuln}`);
    if(p.burn) parts.push(`燃燒 ${p.burn}（每回合結束失去等量生命，之後 -1）`);
    if(p.ap) parts.push(`燒掉你下回合 ${p.ap} 點行動點`);
    if(p.astr) parts.push(`${p.all ? '全體' : '友軍'}力量 +${p.astr}`);
    if(p.ablk) parts.push(`友軍格擋 +${p.ablk}`);
    if(p.aheal) parts.push(`治療友軍 ${p.aheal}`);
    if(p.d && !p.charge) parts.push(`格擋 ${p.d}`);
    if(p.weak) parts.push(`虛弱 ${p.weak}`);
    if(p.psn) parts.push(`中毒 ${p.psn}`);
    if(p.str) parts.push(`力量 +${p.str}`);
    if(p.goo) parts.push(`塞 ${p.goo} 張黏液`);
    if(p.steal) parts.push('偷走最貴的財寶');
    if(p.flee) parts.push('帶贓物逃跑');
    if(p.summon) parts.push('叫幫手');
    if(p.charge) parts.push(`蓄力${p.d ? `（獲得 ${p.d} 格擋，這回合不攻擊，下一招是重擊）` : '（這回合不攻擊，下一招是重擊）'}`);
    return parts.join('、');
  };
  const now = e.step % d.pat.length;
  openSheet(`<div class="sheet-t">${e.n}</div>
    <div class="sheet-p">生命 ${e.hp}/${e.max}${d.revive ? '。倒下後會站起來一次。' : ''}</div>
    ${e.psn > 0 ? `<div class="sheet-p"><b style="color:#a6e58a">毒 ${e.psn}</b>：輪到牠行動時先受 ${e.psn} 點傷害（無視格擋），然後毒 -1。</div>` : ''}
    ${e.mk > 0 ? `<div class="sheet-p"><b style="color:#d9a6ff">咒印 ${e.mk}</b>：牠受到的每次傷害 +${e.mk}，不會消失。</div>` : ''}
    ${d0.dodge ? `<div class="sheet-p">閃避率 ${Math.round(d0.dodge * 100)}%。</div>` : ''}
    ${d0.half ? `<div class="sheet-p">生命過半後${e.half ? '（已經）' : ''}力量 +${d0.half.str}。</div>` : ''}
    ${d0.form2 ? `<div class="sheet-p">生命過半後${e.form ? '（已經）' : ''}顯出真身：招式全換，每回合力量 +${d0.form2.grow || 0}，並回復 ${Math.round((d0.form2.heal || 0) * 100)}% 生命。</div>` : ''}
    ${e.traits.map(t => `<div class="sheet-p"><b style="color:#ff8a78">${TRAITS[t].n}</b>：${TRAITS[t].d}</div>`).join('')}
    <div class="sect">招式循環</div>
    ${d.pat.map((p, i) => `<div class="tier-line${i === now ? ' on' : ''}" style="grid-template-columns:70px 1fr"><span>${p.nm || (i === now ? '下一招' : '')}</span><span>${line(p)}</span></div>`).join('')}
    <button class="btn" style="margin-top:10px" data-act="closeSheet">關閉</button>`);
}

/* —— 輸入：點擊用事件委派；技能分「點一下用」和「長按看說明」 —— */
let pressTimer = null, longPressed = false;
function showTip(html){ const t = $('tip'); t.innerHTML = html; t.classList.add('show'); }
function hideTip(){ $('tip').classList.remove('show'); }
function tipForCard(c, target){
  const d = cardDef(c);
  return `<b>${d.n}${c.up ? '+' : ''}</b>（${d.c} 行動點）<br>${fmtText(d.long || d.t, d, target)}`;
}
function cardFromEl(el){
  if(el.dataset.card !== undefined && S.battle) return [S.battle.hand[+el.dataset.card], S.battle.enemies[S.battle.target]];
  if(el.dataset.pick !== undefined && S.reward && S.reward.cards){ const id = S.reward.cards[+el.dataset.pick]; return [{id, up: S.reward.up && CARDS[id].up ? 1 : 0}, null]; }
  if(el.dataset.info){ const [id, up] = el.dataset.info.split(':'); return [{id, up: +up}, null]; }
  return [null, null];
}
document.addEventListener('pointerdown', ev => {
  const el = ev.target.closest && ev.target.closest('.card');
  longPressed = false;
  if(!el || !S) return;
  pressTimer = setTimeout(() => {
    const [c, t] = cardFromEl(el);
    if(c){ longPressed = true; showTip(tipForCard(c, t)); }
  }, 380);
});
const endPress = () => { clearTimeout(pressTimer); hideTip(); };
document.addEventListener('pointerup', endPress);
document.addEventListener('pointercancel', endPress);
document.addEventListener('contextmenu', ev => ev.preventDefault());
document.addEventListener('click', ev => {
  if(longPressed){ longPressed = false; return; }
  const sheetBg = ev.target.id === 'sheet';
  if(sheetBg){ closeSheet(); return; }
  const cardEl = ev.target.closest('[data-card]');
  if(cardEl){
    if(busy || !S || !S.battle) return;
    const i = +cardEl.dataset.card;
    if(!playable(S, i)){ retrigger(cardEl, 'hit'); return; }
    playCard(S, i);
    commit();
    return;
  }
  const pickEl = ev.target.closest('[data-pick]');
  if(pickEl){ if(!busy){ takeCard(S, +pickEl.dataset.pick); commit(); } return; }
  const actEl = ev.target.closest('[data-act]');
  if(!actEl) return;
  const [name, arg] = actEl.dataset.act.split(/:(.*)/);
  /* 敵方回合只能看資訊，不能操作 */
  if(busy && !['bagSheet', 'greedInfo', 'closeSheet', 'deckSheet'].includes(name)) return;
  if(ACT[name]) ACT[name](arg);
});

render();
