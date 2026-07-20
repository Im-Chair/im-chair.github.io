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

function rollRarity(floor, bonus){ // bonus: 0一般 1精英 2首領
  const cyc = (R&&R.cycle)||0;
  let w = Math.max(46 - floor*3 - bonus*18 - cyc*12, 2);
  let b = Math.max(32 + bonus*4 - cyc*6, 6);
  let g = 13 + floor*1.1 + bonus*10 + cyc*8;
  let o = 2.5 + floor*0.8 + bonus*7 + cyc*6;
  const total = w+b+g+o; let r = Math.random()*total;
  if((r-=w)<0) return 0; if((r-=b)<0) return 1; if((r-=g)<0) return 2; return 3;
}

function makeItem(floor, bonus, cyc){
  const ri = rollRarity(floor, bonus||0), rar = RARITIES[ri];
  const slot = pick(['w','w','a','a','t']);
  const it = {id:uid++, slot, rar:ri, up:0, banked:false, affixes:[]};
  const cc = (cyc != null) ? cyc : ((R && R.cycle>0) ? R.cycle : 0);   // 明確輪迴優先（營地生裝備用），否則讀當前 run
  it.pf = floor; it.pc = cc;                                 // 出身樓層/輪迴（重鑄依此還原強度）
  const cf = floor * cycK(cc);                               // 輪迴等效樓層：基礎值只放大樓層項（6+0.9·f·K），常數不吃
  if(slot==='w'){
    it.wtype = pick(['dagger','sword','axe','staff']);
    it.base = Math.round(CURVE.wpnBase(cf) * CURVE.rarMult[ri]);
    it.name = pick(WEAPON_NAMES[it.wtype]);
  }
  else if(slot==='a'){ it.base = Math.round(CURVE.armBase(cf) * CURVE.rarMult[ri]); it.name = pick(ARMOR_NAMES); }
  else { it.base = 0; it.name = pick(TRINKET_NAMES); }
  it.name = pick(PREFIX[rar.id]) + it.name;
  const n = rnd(rar.afx[0], rar.afx[1]);
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
    const perk = {dagger:'連擊', sword:'爆擊', axe:'破防', staff:'法術'}[it.wtype||'sword'] || '';
    return `${wt.i}${wt.n}｜攻擊 ${eqStat(it)}（${wt.magic?'魔攻':'物攻'}）｜${wt.pts}行動·${perk}`;
  }
  if(it.slot==='a') return `防禦 ${eqStat(it)}`;
  return '飾品';
}

function slotName(s){ return s==='w'?'武器':s==='a'?'護甲':'飾品'; }

/* 彙總玩家所有詞綴 */

function marketStock(){
  if(!G.market || G.market.run !== G.rec.runs){
    const boxes = [];
    const n = rnd(2,4);
    const mk = (bonusRar)=>{
      const g = certGearCtx();                         // 綁認證的樓層＋輪迴，讓黑市裝備吃真實輪迴倍率
      let it = makeItem(g.floor, 2, g.cyc), tries = 0;
      while(it.rar !== bonusRar && tries++ < 40) it = makeItem(g.floor, 2, g.cyc);
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
    const runes = [];
    const rc = rnd(2,3);
    const cc = G.rec.cert ? G.rec.cert.cycle : 0;
    const cf = G.rec.cert ? G.rec.cert.floor : Math.max(12, G.rec.deep);
    for(let i=0;i<rc;i++) runes.push({rune: makeRune(cf, cc), sold:false});
    G.market = {run:G.rec.runs, boxes, runes};
    save();
  }
  if(!G.market.runes) G.market.runes = [];
  return G.market;
}

function boxPrice(b){
  if(b.type==='mat') return 100 + G.rec.deep*2;
  const base = b.item.rar===3 ? 480 + G.rec.deep*6 : 140 + G.rec.deep*2;
  const cyc = (G.rec.cert && G.rec.cert.cycle) || 0;
  const priced = Math.round(base * Math.pow(1.5, cyc));   // 高輪迴 = 前一輪迴價格 ×1.5（裝備變強，價格跟上）
  return b.type==='open' ? Math.round(priced*1.3) : priced;
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
  html += '</div>';
  html += '<div class="section-title">🔯 符文攤（用 💎 購買）</div><div class="item-list">';
  (m.runes||[]).forEach((s,i)=>{
    if(s.sold){ html += `<div class="item-row" style="opacity:.4"><span class="in">已售出</span></div>`; return; }
    const rn = s.rune, a = rn.affixes[0], price = runeGemPrice(rn);
    html += `<div class="item-row ${RARITIES[rn.rar].b}" onclick="buyRune(${i})"><span class="in ${RARITIES[rn.rar].cls}">${rn.icon} ${rn.name}</span><span class="is">${runeFmt(a)}</span><span class="ip">💎${price}</span></div>`;
  });
  html += '</div>';
  html += `<button class="btn small" style="margin-top:10px" onclick="rerollMarket()">🎲 換一批貨（80🪙）</button>
    <p style="color:var(--dim);font-size:12px;margin-top:10px">🪙 ${G.gold}　💎 ${G.gems||0}｜符文放進「角色→符文槽」鑲入即被動生效。</p>
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

function runeGemPrice(rn){ return (rn.rar+1)*20; }   // 普20／精良40／稀有60／傳說80（鑽石梯度保留，消耗加倍）
function buyRune(i){
  const s = G.market && G.market.runes && G.market.runes[i];
  if(!s || s.sold) return;
  const price = runeGemPrice(s.rune);
  if((G.gems||0) < price){ toast('💎 不夠'); return; }
  G.gems -= price; s.sold = true;
  if(!G.runeBag) G.runeBag = [];
  G.runeBag.push(s.rune);
  save(); openMarket(); toast('入手 '+s.rune.name);
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
function runeMaxRar(cycle, floor){   // 本源只普通；輪迴I≥30精良、≥70稀有；II≥30稀有、≥70傳說；III≥30傳說
  if(cycle<=0) return 0;
  const base = Math.min(cycle-1, 2);
  let m = base;
  if(floor>=30) m = base+1;
  if(floor>=70) m = base+2;
  return Math.min(3, m);
}
function makeRune(floor, cycle){
  const maxR = runeMaxRar(cycle||0, floor);
  const w = []; for(let r=0;r<=maxR;r++) w.push(Math.pow(0.45, r));   // 越高階越稀有
  const tot = w.reduce((a,b)=>a+b,0); let x = Math.random()*tot, ri = 0;
  for(let r=0;r<=maxR;r++){ x -= w[r]; if(x<0){ ri = r; break; } }
  const k = pick(Object.keys(RUNE_AFFIX));
  const cat = RUNE_AFFIX[k];
  const [lo,hi] = RUNE_BAND[cat.band][ri];
  const affix = {k, v: rnd(lo,hi)};   // 符文值純由稀有度決定，不吃樓層/輪迴
  if(cat.mul) affix.mul = true;        // 素質/上限型：乘法套用
  return {id:uid++, isRune:true, rar:ri, name:'符文·'+AFFIXES[k].n, icon:'🔯', affixes:[affix]};
}
function openRunes(){
  if(!G.runes) G.runes=[null,null,null]; if(!G.runeBag) G.runeBag=[];
  let html='<h3>符文</h3><p class="base">符文鑲進符文槽即被動生效，不佔裝備、跨探索永久保留。</p><div class="section-title">符文槽 '+G.runes.filter(Boolean).length+'/3</div><div class="item-list">';
  G.runes.forEach((rn,i)=>{ if(rn){ const a=rn.affixes[0];
    html+=`<div class="item-row ${RARITIES[rn.rar].b}" onclick="unsocketRune(${i})"><div style="width:100%"><div class="${RARITIES[rn.rar].cls}" style="font-weight:600">${rn.icon} ${rn.name}<span style="float:right;color:var(--red);font-weight:400">取下</span></div><div style="color:var(--dim);font-size:12px;line-height:1.35;margin-top:3px">${runeFmt(a)}</div></div></div>`;
  } else html+=`<div class="item-row" style="opacity:.6"><span class="in" style="color:var(--dim)">◇ 空符文槽</span></div>`; });
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
  sm.textContent=sellMode?'✓ 批次販售中——點符文勾選':'🏷️ 批次販售（多選）';
  sm.onclick=()=>{ sellMode=!sellMode; sellSel.clear(); renderGear(); }; sl.appendChild(sm);
  const sorted = runes.filter(r=>stashRarity==='all'||r.rar===+stashRarity)
    .sort((a,b)=>(b.rar-a.rar) || (a.affixes[0].k<b.affixes[0].k?-1:a.affixes[0].k>b.affixes[0].k?1:0));
  for(const rn of sorted){ const a=rn.affixes[0]; const checked=sellSel.has(rn.id);
    const d=document.createElement('div'); d.className=`item-row ${RARITIES[rn.rar].b}`;
    d.innerHTML=`<div style="width:100%"><div class="${RARITIES[rn.rar].cls}" style="font-weight:600">${sellMode?(checked?'☑ ':'☐ '):''}${rn.icon} ${rn.name}<span style="float:right;color:var(--dim);font-weight:400;font-size:11px">${RARITIES[rn.rar].n}</span></div><div style="color:var(--dim);font-size:12px;line-height:1.35;margin-top:3px">${runeFmt(a)}</div></div>`;
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
      sb.textContent=`販售選取 ${sel.length} 個（+${val}🪙）`;
      sb.onclick=()=>{ G.runeBag=runes.filter(r=>!sellSel.has(r.id)); G.gold+=val; sellSel.clear(); save(); renderGear(); toast(`販售 ${sel.length} 符文，得 ${val} 碎銀`); }; sl.appendChild(sb);
    }
  }
}
function openRuneSheet(id){
  const rn = (G.runeBag||[]).find(r=>r.id===id); if(!rn) return;
  const a=rn.affixes[0], r=RARITIES[rn.rar], val=runeSellVal(rn);
  openSheet(`<h3 class="${r.cls}">${rn.icon} ${rn.name}</h3><div class="base">${r.n}符文｜${runeFmt(a)}</div>
    <div class="row" style="margin-top:16px"><button class="btn primary" onclick="socketRune(${rn.id})">鑲入符文槽</button><button class="btn danger" onclick="sellRune(${rn.id})">分解 +${val}🪙</button></div>
    <button class="btn" style="margin-top:8px" onclick="openGear()">關閉</button>`);
}
function sellRune(id){
  const i=G.runeBag.findIndex(r=>r.id===id); if(i<0) return;
  const val=runeSellVal(G.runeBag[i]);
  G.runeBag.splice(i,1); G.gold+=val; closeSheet(); renderGear(); save(); toast(`分解得 ${val} 碎銀`);
}

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
    sm.textContent = sellMode ? '✓ 批次販售中——點裝備勾選' : '🏷️ 批次販售（多選）';
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
    d.innerHTML = `<span class="in ${RARITIES[it.rar].cls}">${selling?(checked?'☑ ':'☐ '):''}${it.name}${it.up?'+'+it.up:''}</span>
      <span class="is">${slotName(it.slot)}｜${itemStatLine(it)}</span>`;
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
      sb.textContent = `販售選取 ${sel.length} 件（+${val}🪙）`;
      sb.onclick = ()=>{ G.stash = G.stash.filter(i=>!sellSel.has(i.id)); G.gold += val; sellSel.clear(); save(); renderGear(); toast(`販售 ${sel.length} 件，得 ${val} 碎銀`); };
      sl.appendChild(sb);
    }
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
    <button class="btn danger" onclick="salvageItem(${it.id})">分解 +${salvage}🪙</button>`;
    extra = `<button class="btn" style="margin-top:8px" onclick="moveToShared(${it.id})">📦 存入共用倉庫</button>`; }
  else if(from==='shared'){ btns = `<button class="btn primary" onclick="equipFromShared(${it.id})">裝備</button>
    <button class="btn" onclick="sharedToOwn(${it.id})">↩ 取回個人</button>`; }
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

function openSmith(){ renderSmith(); showScreen('s-smith'); }

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
function reforgeItem(slot){ const it = G.equip[slot]; if(!it) return; reforgeSlot = slot; reforgeLocks = []; renderReforgeLock(); }
function toggleReforgeLock(i){ const p = reforgeLocks.indexOf(i); if(p>=0) reforgeLocks.splice(p,1); else reforgeLocks.push(i); renderReforgeLock(); }
function renderReforgeLock(){
  const it = G.equip[reforgeSlot]; if(!it) return;
  const cost = Math.round(reforgeCost(it) * (1 + reforgeLocks.length*0.5));   // 每鎖一條 +50%
  const normals = it.affixes.filter(a=>!AFFIXES[a.k].leg && !AFFIXES[a.k].curse);
  const fixed = it.affixes.filter(a=>AFFIXES[a.k].leg || AFFIXES[a.k].curse);
  let html = `<h3>重鑄・${it.name}</h3><p class="base">鎖定想保留的詞綴（🔒），其餘重鑄；數量隨機、可能變多。傳說與詛咒自動保留。<span style="color:var(--gold)">每鎖一條費用 +50%</span>。</p>`;
  html += fixed.map(a=>`<div class="affix ${AFFIXES[a.k].leg?'leg':'curse'}">${AFFIXES[a.k].leg?'✸':'☠'} ${AFFIXES[a.k].n}：${AFFIXES[a.k].fmt(a.v)}　<span style="color:var(--dim)">保留</span></div>`).join('');
  html += '<div class="item-list" style="margin-top:6px">';
  normals.forEach((a,i)=>{ const locked = reforgeLocks.includes(i);
    html += `<div class="item-row" onclick="toggleReforgeLock(${i})"><span class="in">${locked?'🔒':'🔓'} ${AFFIXES[a.k].n}：${AFFIXES[a.k].fmt(a.v)}</span><span class="is">${locked?'<span style="color:var(--gold)">鎖定</span>':'重鑄'}</span></div>`; });
  html += '</div>';
  html += `<div class="row" style="margin-top:16px"><button class="btn primary" onclick="doReforge()">重鑄（${cost}🪙）</button><button class="btn" onclick="closeSheet()">取消</button></div>`;
  openSheet(html);
}
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
  const oldList = normals.map(a=>`<div class="affix">◆ ${AFFIXES[a.k].n}：${AFFIXES[a.k].fmt(a.v)}</div>`).join('') || '<div class="affix" style="color:var(--dim)">（無）</div>';
  const newNormals = kept.concat(rolled);
  const newList = newNormals.map(a=>`<div class="affix">◆ ${AFFIXES[a.k].n}：${AFFIXES[a.k].fmt(a.v)}${kept.includes(a)?' 🔒':''}</div>`).join('') || '<div class="affix" style="color:var(--dim)">（無）</div>';
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
  save(); renderSmith(); toast('新詞綴已上身');
  reforgeItem(reforgeSlot);   // 直接回到重鑄介面（同一件），不必回鐵匠重點
}

function cancelReforge(){
  pendingReforge = null;
  renderSmith(); toast('保留了原本的詞綴');
  reforgeItem(reforgeSlot);   // 保留原本後，仍回到重鑄介面可再鑄
}

function renderSmith(){
  const list = $('smith-list'); list.innerHTML='';
  let any = false;
  for(const sl of ['w','a']){
    const it = G.equip[sl]; if(!it) continue; any = true;
    const cost = smithCost(it);
    const cap = RARITIES[it.rar].upCap;
    const tier = smithTier(it.up);
    const gain = (sl==='w'?'攻擊':'防禦') + ' +' + tier.gain;
    const d = document.createElement('div'); d.className = `item-row ${RARITIES[it.rar].b}`;
    if(it.up >= cap){
      d.innerHTML = `<span class="in ${RARITIES[it.rar].cls}">${it.name}+${it.up}</span>
        <span class="is">已達${RARITIES[it.rar].n}上限 +${cap}</span>`;
    } else {
      const matTxt = tier.mat ? `＋${MATS[tier.mat].i}${MATS[tier.mat].n}×${tier.qty}` : '';
      const rateTxt = tier.rate < 1 ? `｜成功 ${Math.round(tier.rate*100)}%` : '';
      d.innerHTML = `<span class="in ${RARITIES[it.rar].cls}">${it.name}${it.up?'+'+it.up:''}</span>
        <span class="is">⚒️ ${gain}｜${cost}🪙${matTxt}${rateTxt}</span>`;
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
    <p style="color:var(--dim);font-size:12px">上限：普通+3／精良+6／稀有+9／傳說+12｜+1~6只需碎銀·素質+1｜+7~9需${MATS.iron.n} 2/4/8·素質+2｜+10~12需${MATS.steel.n} 2/4/8·素質+3</p>`);
}

