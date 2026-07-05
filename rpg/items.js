'use strict';
// ============ items.js — 裝備：生成/詞綴/裝備介面/鐵匠(精煉+重鑄)/深淵黑市 ============

function rollAffixVal(k, ri, floor){
  const A = AFFIXES[k];
  if(A.min === A.max && !AFFIX_BAND[k]) return A.min;
  const band = ROLL_BANDS[AFFIX_BAND[k]] || [[A.min,A.max],[A.min,A.max],[A.min,A.max],[A.min,A.max]];
  const [lo, hi] = band[ri];
  let v = rnd(lo, hi);
  if(A.stat) v += Math.round(floor * 0.3);           // 素質吃樓層 +0.3/層
  if(R && R.cycle > 0 && (A.stat || AFFIX_BAND[k]==='hp' || AFFIX_BAND[k]==='mp'))
    v = Math.round(v * (1 + cycVal(R.cycle)));       // 輪迴裝備價值
  return Math.max(1, v);
}

function rollRarity(floor, bonus){ // bonus: 0一般 1精英 2首領
  const cyc = (R&&R.cycle)||0;
  let w = Math.max(46 - floor*3 - bonus*18 - cyc*12, 2);
  let b = Math.max(32 + bonus*4 - cyc*6, 6);
  let g = 13 + floor*1.1 + bonus*10 + cyc*8;
  let o = 2.5 + floor*0.8 + bonus*7 + cyc*6;
  const total = w+b+g+o; let r = Math.random()*total;
  if((r-=w)<0) return 0; if((r-=b)<0) return 1; if((r-=g)<0) return 2; return 3;
}

function makeItem(floor, bonus){
  const ri = rollRarity(floor, bonus||0), rar = RARITIES[ri];
  const slot = pick(['w','w','a','a','t']);
  const it = {id:uid++, slot, rar:ri, up:0, banked:false, affixes:[]};
  if(slot==='w'){
    it.wtype = pick(['dagger','sword','axe','staff']);
    it.base = Math.round(CURVE.wpnBase(floor) * CURVE.rarMult[ri]);
    it.name = pick(WEAPON_NAMES[it.wtype]);
  }
  else if(slot==='a'){ it.base = Math.round(CURVE.armBase(floor) * CURVE.rarMult[ri]); it.name = pick(ARMOR_NAMES); }
  else { it.base = 0; it.name = pick(TRINKET_NAMES); }
  it.name = pick(PREFIX[rar.id]) + it.name;
  const n = rnd(rar.afx[0], rar.afx[1]);
  const pool = Object.keys(AFFIXES).filter(k=>AFFIXES[k].slots.includes(slot) && !AFFIXES[k].leg && !AFFIXES[k].curse);
  const chosen = [];
  for(let i=0;i<n && pool.length;i++){
    const k = pool.splice(Math.floor(Math.random()*pool.length),1)[0];
    chosen.push({k, v:rollAffixVal(k, ri, floor)});
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
    return `${wt.i}${wt.n}｜攻擊 ${it.base + it.up}（${wt.magic?'魔攻':'物攻'}）`;
  }
  if(it.slot==='a') return `防禦 ${it.base + it.up}`;
  return '飾品';
}

function slotName(s){ return s==='w'?'武器':s==='a'?'護甲':'飾品'; }

/* 彙總玩家所有詞綴 */

function marketStock(){
  if(!G.market || G.market.run !== G.rec.runs){
    const boxes = [];
    const n = rnd(2,4);
    const mk = (bonusRar)=>{
      let it = makeItem(Math.max(12, Math.floor(G.rec.deep*0.8)), 2), tries = 0;
      while(it.rar !== bonusRar && tries++ < 40) it = makeItem(Math.max(12, Math.floor(G.rec.deep*0.8)), 2);
      if(it.rar !== bonusRar){ it.rar = bonusRar;
        if(bonusRar===3 && !it.affixes.some(a=>AFFIXES[a.k].leg)){
          const lp = LEG_KEYS.filter(k=>AFFIXES[k].slots.includes(it.slot));
          if(lp.length) it.affixes.unshift({k:pick(lp), v:1});
        } }
      return it;
    };
    for(let i=0;i<n;i++){
      const roll = Math.random();
      if(roll < 0.12 && cyclesUnlocked() > 0){
        const mk2 = Math.random()<0.5?'iron':'steel';
        boxes.push({type:'mat', mat:mk2, qty:rnd(2,3), sold:false});
      } else if(roll < 0.27){
        const it = mk(Math.random()<0.35?3:2);
        boxes.push({type:'open', item:it, sold:false});
      } else {
        const it = mk(Math.random()<0.32?3:2);
        boxes.push({type:'box', item:it, sold:false});
      }
    }
    G.market = {run:G.rec.runs, boxes};
    save();
  }
  return G.market;
}

function boxPrice(b){
  if(b.type==='mat') return 100 + G.rec.deep*2;
  const base = b.item.rar===3 ? 480 + G.rec.deep*6 : 140 + G.rec.deep*2;
  return b.type==='open' ? Math.round(base*1.3) : base;
}

function openMarket(){
  const m = marketStock();
  let html = `<h3>深淵黑市</h3><p class="base">燭火後面的攤主沒有露臉。今晚的貨——有封著的，有拆過的，看你信不信自己的手氣。</p><div class="item-list" style="margin-top:8px">`;
  m.boxes.forEach((b, i)=>{
    if(b.sold){ html += `<div class="item-row" style="opacity:.4"><span class="in">已售出</span></div>`; return; }
    const price = boxPrice(b);
    if(b.type==='mat'){
      html += `<div class="item-row" onclick="buyBox(${i})">
        <span class="in">${MATS[b.mat].i} ${MATS[b.mat].n} ×${b.qty}</span>
        <span class="is">精煉材料｜${price}🪙</span></div>`;
    } else if(b.type==='open'){
      const it = b.item, r = RARITIES[it.rar];
      html += `<div class="item-row ${r.b}" onclick="peekOpen(${i})">
        <span class="in ${r.cls}">📭 ${it.name}</span>
        <span class="is">拆封品・詞綴可見｜${price}🪙</span></div>`;
    } else {
      const it = b.item, r = RARITIES[it.rar];
      html += `<div class="item-row ${r.b}" onclick="buyBox(${i})">
        <span class="in ${r.cls}">🎁 ${r.n}之盒</span>
        <span class="is">${slotName(it.slot)}｜詞綴未知｜${price}🪙</span></div>`;
    }
  });
  html += `</div>
    <button class="btn small" style="margin-top:10px" onclick="rerollMarket()">🎲 換一批貨（80🪙）</button>
    <p style="color:var(--dim);font-size:12px;margin-top:10px">🪙 ${G.gold}｜傳說之盒保底一條傳說詞綴，但也可能是詛咒品——攤主概不負責。</p>
    <button class="btn" style="margin-top:6px" onclick="closeSheet()">離開</button>`;
  openSheet(html);
}

function peekOpen(i){
  const b = G.market.boxes[i];
  if(!b || b.sold) return;
  const it = b.item, r = RARITIES[it.rar], price = boxPrice(b);
  openSheet(`<h3>拆封品</h3>
    <div class="loot-card ${r.b}"><div class="${r.cls}" style="font-size:16px">${it.name} <span style="font-size:11px">${r.n}</span></div>
    <div style="font-size:13px;color:var(--dim);margin:4px 0">${slotName(it.slot)}｜${itemStatLine(it)}</div>
    ${affixHtml(it)}${compareHtml(it)}</div>
    <p class="base">拆過的貨，看得清楚，也貴三成。</p>
    <div class="row" style="margin-top:10px">
      <button class="btn primary" onclick="buyBox(${i})">買下 ${price}🪙</button>
      <button class="btn" onclick="openMarket()">再看看</button></div>`);
}

function rerollMarket(){
  if(G.gold < 80){ toast('碎銀不夠'); return; }
  G.gold -= 80;
  G.market = null;
  marketStock();
  openMarket();
}

function buyBox(i){
  const m = G.market;
  const b = m.boxes[i];
  if(!b || b.sold) return;
  const price = boxPrice(b);
  if(G.gold < price){ toast('碎銀不夠'); return; }
  G.gold -= price;
  b.sold = true;
  if(b.type==='mat'){
    G.mats[b.mat] = (G.mats[b.mat]||0) + b.qty;
    save(); openMarket(); toast(`入手 ${MATS[b.mat].n} ×${b.qty}`);
    return;
  }
  b.item.banked = true;
  G.stash.push(b.item);
  save();
  const it = b.item, r = RARITIES[it.rar];
  openSheet(`<h3>${b.type==='open'?'成交':'開盒'}</h3>
    <div class="loot-card ${r.b}"><div class="${r.cls}" style="font-size:16px">${it.name} <span style="font-size:11px">${r.n}</span></div>
    <div style="font-size:13px;color:var(--dim);margin:4px 0">${slotName(it.slot)}｜${itemStatLine(it)}</div>
    ${affixHtml(it)}</div>
    <p class="base">${it.cursed?'攤主的方向傳來一聲很輕的笑。':'已存入倉庫。'}</p>
    <div class="row" style="margin-top:10px">
      <button class="btn" onclick="openMarket()">繼續看貨</button>
      <button class="btn" onclick="closeSheet()">離開</button></div>`);
}

var stashFilter = 'all';

function openGear(){ renderGear(); showScreen('s-gear'); }

function renderGear(){
  $('gear-gold').textContent = '🪙 ' + G.gold;
  const er = $('equip-row'); er.innerHTML = '';
  for(const s of ['w','a','t']){
    const it = G.equip[s];
    const d = document.createElement('div'); d.className = 'slot';
    d.innerHTML = it
      ? `<div class="sl">${slotName(s)}</div><div class="sn ${RARITIES[it.rar].cls}">${it.name}${it.up?'+'+it.up:''}</div><div style="font-size:11px;color:var(--dim)">${itemStatLine(it)}</div>`
      : `<div class="sl">${slotName(s)}</div><div class="sn" style="color:var(--dim)">— 空 —</div>`;
    if(it) d.onclick = ()=>openItemSheet(it, 'equipped');
    er.appendChild(d);
  }
  const sl = $('stash-list'); sl.innerHTML = '';
  if(!G.stash.length){ sl.innerHTML = '<p style="color:var(--dim);font-size:13px">倉庫空空。深淵裡什麼都有，去搬。</p>'; }
  else {
    const fr = document.createElement('div');
    fr.className = 'row'; fr.style.cssText = 'gap:6px;margin-bottom:8px';
    for(const [f, label] of [['all','全部'],['w','武器'],['a','護甲'],['t','飾品']]){
      const b = document.createElement('button');
      b.className = 'btn small' + (stashFilter===f?' primary':'');
      b.style.flex = '1';
      b.textContent = label + (f==='all' ? ` ${G.stash.length}` : ` ${G.stash.filter(i=>i.slot===f).length}`);
      b.onclick = ()=>{ stashFilter = f; renderGear(); };
      fr.appendChild(b);
    }
    sl.appendChild(fr);
    const junk = G.stash.filter(i=>i.rar<=1);
    if(junk.length>=2){
      const v = junk.reduce((s,i)=>s+6+i.rar*10+Math.floor(i.base/2),0);
      const bd = document.createElement('button');
      bd.className='btn small'; bd.style.marginBottom='6px';
      bd.textContent = `一鍵分解 普通+精良 ×${junk.length}（+${v}🪙）`;
      bd.onclick = ()=>{ G.stash = G.stash.filter(i=>i.rar>1); G.gold += v; save(); renderGear(); toast(`分解 ${junk.length} 件，得 ${v} 碎銀`); };
      sl.appendChild(bd);
    }
  }
  const slotOrder = {w:0, a:1, t:2};
  const sorted = G.stash
    .filter(i=>stashFilter==='all' || i.slot===stashFilter)
    .sort((a,b)=>(slotOrder[a.slot]-slotOrder[b.slot]) || (b.rar-a.rar) || ((b.base+b.up)-(a.base+a.up)));
  for(const it of sorted){
    const d = document.createElement('div'); d.className = `item-row ${RARITIES[it.rar].b}`;
    d.innerHTML = `<span class="in ${RARITIES[it.rar].cls}">${it.name}${it.up?'+'+it.up:''}</span>
      <span class="is">${slotName(it.slot)}｜${itemStatLine(it)}</span>`;
    d.onclick = ()=>openItemSheet(it, 'stash');
    sl.appendChild(d);
  }
}

function affixHtml(it){
  return it.affixes.map(a=>{
    const A = AFFIXES[a.k];
    const cls = A.curse?' curse':A.leg?' leg':'';
    const mark = A.curse?'☠':A.leg?'✸':'◆';
    return `<div class="affix${cls}">${mark} ${A.n}：${A.fmt(a.v)}</div>`;
  }).join('') || '<div class="affix" style="color:var(--dim)">（無詞綴）</div>';
}

function compareHtml(it){
  const cur = G.equip[it.slot];
  if(!cur || cur.id===it.id) return '';
  let lines = [`<div class="cmp">目前身上：<span class="${RARITIES[cur.rar].cls}">${cur.name}${cur.up?'+'+cur.up:''}</span>　<span style="color:var(--dim)">${itemStatLine(cur)}</span>`];
  if(it.slot==='w'){ const d = (it.base+it.up)-(cur.base+cur.up);
    lines.push(`<div>攻擊差 ${d>=0?'<span class="up">+'+d+'</span>':'<span class="dn">'+d+'</span>'}</div>`); }
  if(it.slot==='a'){ const d = (it.base+it.up*4)-(cur.base+cur.up*4);
    lines.push(`<div>生命差 ${d>=0?'<span class="up">+'+d+'</span>':'<span class="dn">'+d+'</span>'}</div>`); }
  lines.push(`<div style="margin-top:4px">${affixHtml(cur)}</div>`);
  lines.push('</div>');
  return lines.join('');
}

function openItemSheet(it, from){
  const r = RARITIES[it.rar];
  const salvage = 6 + it.rar*10 + Math.floor(it.base/2);
  const backCall = from==='bag' ? 'openRunStats()' : 'closeSheet()';
  let btns = '';
  if(from==='stash') btns = `<button class="btn primary" onclick="equipFromStash(${it.id})">裝備</button>
    <button class="btn danger" onclick="salvageItem(${it.id})">分解 +${salvage}🪙</button>`;
  else if(from==='equipped') btns = `<button class="btn" onclick="unequipItem('${it.slot}')">卸下</button>`;
  else if(from==='bag') btns = `<button class="btn primary" onclick="equipFromBag(${it.id},'stats')">立刻換上</button>`;
  openSheet(`<h3 class="${r.cls}">${it.name}${it.up?' +'+it.up:''}</h3>
    <div class="base">${r.n}${slotName(it.slot)}｜${itemStatLine(it)}${it.banked===false&&from!=='equipped'&&R?'｜<span style="color:var(--orange)">未保管</span>':''}</div>
    ${affixHtml(it)}${compareHtml(it)}
    <div class="row" style="margin-top:16px">${btns}<button class="btn" onclick="${backCall}">${from==='bag'?'返回':'關閉'}</button></div>`);
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

function openSmith(){ renderSmith(); showScreen('s-smith'); }

function smithCost(it){ return Math.round(30 * Math.pow(it.up+1, 1.5)); }

function smithTier(up){ // 下一級(up+1)的需求與成功率
  const next = up + 1;
  if(next <= 6) return {mat:null, rate:100};
  if(next <= 9) return {mat:'iron', rate:[90,80,70][next-7]};
  return {mat:'steel', rate:[80,70,60][next-10]};
}

function tryUpgrade(sl){
  const it = G.equip[sl]; if(!it) return;
  const cap = RARITIES[it.rar].upCap;
  if(it.up >= cap){ toast('已達此稀有度的精煉上限'); return; }
  const cost = smithCost(it), tier = smithTier(it.up);
  if(G.gold < cost){ toast('碎銀不夠'); return; }
  if(tier.mat && (G.mats[tier.mat]||0) < 1){ toast('缺少材料：'+MATS[tier.mat].n); return; }
  G.gold -= cost;
  if(tier.mat) G.mats[tier.mat]--;
  if(Math.random()*100 < tier.rate){
    it.up++;
    toast(`精煉成功：${it.name} +${it.up}`);
  } else {
    toast('精煉失敗——材料在鐵砧上碎成了灰。（等級未降）');
  }
  save(); renderSmith();
}

function reforgeCost(it){ return Math.round((60 + it.rar*40) * Math.pow(1.5, it.rf||0)); }

var pendingReforge = null;

function reforgeItem(slot){
  const it = G.equip[slot]; if(!it) return;
  const cost = reforgeCost(it);
  if(G.gold < cost){ toast('碎銀不夠'); return; }
  G.gold -= cost;
  it.rf = (it.rf||0) + 1;
  const legs = it.affixes.filter(a=>AFFIXES[a.k].leg);
  const curses = it.affixes.filter(a=>AFFIXES[a.k].curse);
  const n = it.affixes.length - legs.length - curses.length;
  const pool = Object.keys(AFFIXES).filter(k=>AFFIXES[k].slots.includes(it.slot) && !AFFIXES[k].leg && !AFFIXES[k].curse);
  const chosen = [];
  for(let i=0;i<n && pool.length;i++){
    const k = pool.splice(Math.floor(Math.random()*pool.length),1)[0];
    let v = rollAffixVal(k, it.rar, G.rec.deep);
    if(it.cursed) v = Math.round(v*1.4);
    chosen.push({k, v});
  }
  pendingReforge = {slot, affixes: legs.concat(curses).concat(chosen)};
  save();
  const oldList = it.affixes.filter(a=>!AFFIXES[a.k].leg && !AFFIXES[a.k].curse)
    .map(a=>`<div class="affix">◆ ${AFFIXES[a.k].n}：${AFFIXES[a.k].fmt(a.v)}</div>`).join('') || '<div class="affix" style="color:var(--dim)">（無）</div>';
  const newList = chosen.map(a=>`<div class="affix">◆ ${AFFIXES[a.k].n}：${AFFIXES[a.k].fmt(a.v)}</div>`).join('') || '<div class="affix" style="color:var(--dim)">（無）</div>';
  openSheet(`<h3>重鑄・${it.name}</h3>
    <p class="base">鐵匠把新詞綴敲了出來，攤在鐵砧上讓你過目。傳說與詛咒詞綴不受影響。</p>
    <div class="section-title">原本的</div>${oldList}
    <div class="section-title">新鑄的</div>${newList}
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
  save(); closeSheet(); renderSmith(); toast('新詞綴已上身');
}

function cancelReforge(){
  pendingReforge = null;
  closeSheet(); renderSmith(); toast('保留了原本的詞綴');
}

function renderSmith(){
  const list = $('smith-list'); list.innerHTML='';
  let any = false;
  for(const sl of ['w','a']){
    const it = G.equip[sl]; if(!it) continue; any = true;
    const cost = smithCost(it);
    const gain = sl==='w' ? '攻擊 +1' : '生命 +4';
    const cap = RARITIES[it.rar].upCap;
    const tier = smithTier(it.up);
    const d = document.createElement('div'); d.className = `item-row ${RARITIES[it.rar].b}`;
    if(it.up >= cap){
      d.innerHTML = `<span class="in ${RARITIES[it.rar].cls}">${it.name}+${it.up}</span>
        <span class="is">已達${RARITIES[it.rar].n}上限 +${cap}</span>`;
    } else {
      const matTxt = tier.mat ? `+${MATS[tier.mat].i}${MATS[tier.mat].n}×1` : '';
      d.innerHTML = `<span class="in ${RARITIES[it.rar].cls}">${it.name}${it.up?'+'+it.up:''}</span>
        <span class="is">⚒️ ${gain}｜${cost}🪙${matTxt}｜${tier.rate}%</span>`;
      d.onclick = ()=>tryUpgrade(sl);
    }
    list.appendChild(d);
    if(G.rec.deep >= 10 && it.affixes.filter(a=>!AFFIXES[a.k].leg && !AFFIXES[a.k].curse).length){
      const r = document.createElement('div'); r.className = `item-row ${RARITIES[it.rar].b}`;
      r.innerHTML = `<span class="in" style="color:var(--dim)">↳ 重鑄詞綴${it.rf?`（第 ${it.rf+1} 次）`:''}</span>
        <span class="is">🎲 傳說/詛咒保留｜${reforgeCost(it)}🪙${it.rf?'（每次 ×1.5）':''}</span>`;
      r.onclick = ()=>reforgeItem(sl);
      list.appendChild(r);
    }
  }
  if(!any) list.innerHTML = '<p style="color:var(--dim);font-size:13px">身上沒有可強化的武器或護甲。</p>';
  if(G.rec.deep < 10) list.insertAdjacentHTML('beforeend',
    '<p style="color:var(--dim);font-size:12px;margin-top:8px">🔒 最深抵達 10 層後，鐵匠會學會「重鑄詞綴」。</p>');
  list.insertAdjacentHTML('afterbegin', `<div style="text-align:right;color:var(--gold);font-size:14px">🪙 ${G.gold}　<span style="color:var(--dim)">${MATS.iron.i}${MATS.iron.n}×${G.mats.iron}　${MATS.steel.i}${MATS.steel.n}×${G.mats.steel}</span></div>
    <p style="color:var(--dim);font-size:12px">精煉上限：普通+3／精良+6／稀有+9／傳說+12｜+7起需${MATS.iron.n}（沉沒王國）｜+10起需${MATS.steel.n}（血肉迴廊）｜失敗不降級</p>`);
}

