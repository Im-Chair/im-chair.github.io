'use strict';
// ============ run.js — 探索：下潛選單/門/樓層推進/全部事件/商人/撤退與死亡 ============

function startOptions(mode){
  // 回傳 [{floor, fee}]；傳送點以「成功逃脫的最深層」解鎖，每 10 層一階（1,11,21,31,41…）
  const opts = [{floor:1, fee:0}];
  if(mode === 'orig'){
    for(let s = 11; s <= Math.min(G.orig.cp, 41); s += 10) opts.push({floor:s, fee:s*10}); // 本源最深傳送點 41（打穿50王不再多開一階）
  } else {
    const c = cd(mode);
    for(let s = 11; s <= c.cp; s += 10) opts.push({floor:s, fee:s*12});                     // 輪迴無上限
  }
  return opts;
}

var pendingMode = 'orig';

function openDivePicker(){
  const cu = cyclesUnlocked();
  if(cu === 0 && G.orig.cp < 11){ startRun(1, 0); return; }
  if(pendingMode !== 'orig' && pendingMode > cu) pendingMode = 'orig';
  let html = '<h3>下潛</h3>';
  // 模式列
  html += '<div class="row" style="flex-wrap:wrap;gap:6px">';
  html += `<button class="btn small${pendingMode==='orig'?' primary':''}" onclick="setMode('orig')">本源${G.orig.done?'・完結':''}</button>`;
  for(let c=1; c<=cu; c++){
    html += `<button class="btn small${pendingMode===c?' primary':''}" onclick="setMode(${c})">輪迴 ${'I'.repeat(Math.min(c,3))}${c>3?'+'+(c-3):''}</button>`;
  }
  html += '</div>';
  // 模式說明
  if(pendingMode==='orig'){
    html += `<p class="base" style="margin-top:8px">五十層的旅程，五域五王。最深 ${G.orig.deep} 層${G.orig.done?'——你已走到底過':''}。不產出精煉材料。</p>`;
  } else {
    const c = cd(pendingMode);
    html += `<p class="base" style="margin-top:8px">深淵重演，敵人 ×${cycMult(pendingMode).toFixed(1)}，掉落更兇，材料只在這裡。本輪最深 ${c.deep} 層。</p>`;
    if(pendingMode === cu && !(certScore(G.rec.cert) >= cu*1000 + CYC_NEXT))
      html += `<p style="color:var(--dim);font-size:12px">本輪逃離並認證 ${CYC_NEXT} 層，解鎖下一重輪迴。</p>`;
  }
  // 起點列
  html += '<div class="item-list" style="margin-top:8px">';
  for(const o of startOptions(pendingMode)){
    if(o.fee === 0){
      html += `<div class="item-row" onclick="tryStart(1)"><span class="in">🕳 從第 1 層</span><span class="is">免費</span></div>`;
    } else {
      html += `<div class="item-row" onclick="tryStart(${o.floor})"><span class="in">🪢 傳送至第 ${o.floor} 層</span><span class="is">${o.fee}🪙｜補給:${o.floor*5}🪙+藥水</span></div>`;
    }
  }
  html += '</div>';
  let nextCp = '';
  if(pendingMode==='orig'){
    const ds = G.orig.cp>=11 ? Math.min(41, Math.floor((G.orig.cp-1)/10)*10+1) : 1;
    const nxt = ds<41 ? (ds===1?11:ds+10) : 0;   // 本源到 41 就不再開下一階
    if(nxt) nextCp = '活著逃脫到第 '+nxt+' 層並拉繩，解鎖傳送至該層';
  } else {
    const cp = cd(pendingMode).cp;
    const ds = cp>=11 ? Math.floor((cp-1)/10)*10+1 : 1;
    nextCp = '活著逃脫到第 '+(ds===1?11:ds+10)+' 層並拉繩，解鎖傳送至該層';
  }
  if(nextCp) html += `<p style="color:var(--dim);font-size:12px;margin-top:8px">🔒 ${nextCp}。</p>`;
  if(cu === 0) html += '<p style="color:var(--dim);font-size:12px">🔒 打穿本源 50 層通關，解鎖輪迴。</p>';
  html += '<button class="btn" style="margin-top:8px" onclick="closeSheet()">取消</button>';
  openSheet(html);
}

function setMode(m){ pendingMode = m; openDivePicker(); }

function tryStart(floor){
  const cycle = pendingMode==='orig' ? 0 : pendingMode;
  if(floor > 1){
    const fee = pendingMode==='orig' ? floor*10 : floor*12;
    if(G.gold < fee){ toast('傳送費不夠（需 '+fee+'🪙）'); return; }
    G.gold -= fee;
  }
  startRun(floor, cycle);
}

function startRun(startFloor, cycle){
  closeSheet();
  startFloor = startFloor || 1;
  R = {floor:startFloor, hp:playerMaxHp(), mana:playerMaxMana(), gold:0, bag:[], pots:{heal:1}, skillUps:{},
       bless:[], equipBackup:JSON.parse(JSON.stringify(G.equip)),
       doors:null, phase:'doors', kills:0};
  R.cycle = cycle || 0;
  if(startFloor > 1){
    R.gold = startFloor*5;
    potAdd('heal');
    R.deepStart = true;
  }
  if(R.cycle > 0 && cd(R.cycle).deep === 0){
    R.cycIntro = true;
  }
  G.rec.runs++; save();
  bountyProgress('reach');
  enterFloor();
}

function resumeRun(){
  showDoors();
}

function rarityBonusText(f){ return `稀有掉落權重 +${Math.round(f*2.2)}%`; }

function enterFloor(){
  if(R.cycIntro){
    R.cycIntro = false;
    G.mats.iron = (G.mats.iron||0) + 1;
    showEventScreen('🔄','輪迴・'+'I'.repeat(Math.min(R.cycle,3))+(R.cycle>3?'+'+(R.cycle-3):''),
      '深淵重演了自己——但這次它沒打算裝睡。\n\n敵人強度 ×'+cycMult(R.cycle).toFixed(1)+'，掉落遠勝本源。沉鐵與心鋼只在這裡出土——你的精煉上限，現在才真正打得開。\n\n（守繩人塞給你一塊沉鐵當見面禮）',
      [{n:'下去吧', f:()=>{ R.doors=null; if(R.floor===1){ startBattle(makeEnemy(1,0)); } else enterFloor(); }, primary:true}]);
    return;
  }
  // 第一層直接戰鬥，讓玩家先進入狀況
  if(R.floor===1){ startBattle(makeEnemy(1,0)); return; }
  if(R.deepStart){
    R.deepStart = false;
    const heal = Math.round(playerMaxHp()*0.3);
    showEventScreen('🪢','繩降平台','守繩人把你放到了第 '+R.floor+' 層的一座木造平台。平台上有一堆沒熄的營火——上一個租繩子的人留下的。他沒有回來還繩。',
      [{n:'🩹 在火邊休息（回復 '+heal+' 血）', f:()=>{
        R.hp = Math.min(playerMaxHp(), R.hp + heal); nextFloorSame();
      }, primary:true},
      {n:'⚒️ 借火光精進一招', f:()=>{
        showSkillUpScreen('🪢','繩降平台・精進','借著別人的火，練自己的刀。',
          (sid, branch)=>pickUpStay(sid, branch),
          [{n:'直接出發（不精進）', f:()=>nextFloorSame()}]);
      }},
      {n:'直接出發', f:()=>nextFloorSame()}]);
    return;
  }
  showDoors();
}

function nextFloorSame(){ R.doors = null; showDoors(); }

function pickUpStay(sid, branch){
  if(!R.skillUps) R.skillUps = {};
  R.skillUps[sid] = branch;
  const u = SKILL_UPS[sid][branch];
  showEventScreen('🪢','精進完成','「'+SKILLS[sid].n+'」蛻變為「'+u.n+'」。\n\n'+u.d+'（本次探索有效）',
    [{n:'出發', f:()=>nextFloorSame(), primary:true}]);
}

function doorPool(){
  const f = R.floor;
  const pool = [];
  pool.push({t:'fight', i:'⚔️', n:'戰鬥', d:'普通的敵人', w:42});
  if(f>=3) pool.push({t:'elite', i:'😈', n:'精英', d:'更強，掉落更好', w:16});
  const pev = rollEvent();
  const hint = Math.random()<0.5 ? '你察覺到：'+(EV_HINTS[pev]||'說不上來的氣息') : '誰知道呢';
  pool.push({t:'event', i:'❓', n:'未知', d:hint, ev:pev, w:22});
  pool.push({t:'rest', i:'🕯️', n:'營火', d:'回復 30% 生命', w:12});
  pool.push({t:'chest', i:'📦', n:'寶箱', d:'看起來沒上鎖', w:8});
  return pool;
}

function weightedPick(pool){
  const total = pool.reduce((s,p)=>s+p.w,0); let r = Math.random()*total;
  for(const p of pool){ if((r-=p.w)<0) return p; } return pool[0];
}

function showDoors(){
  R.phase = 'doors';
  const f = R.floor;
  const zz = realmFor(f);
  $('d-floor').textContent = f; $('d-floor-big').textContent = f;
  document.querySelector('#s-doors .depth-gauge .lbl').textContent = zz.i+' '+zz.n;
  $('d-gold').textContent = R.gold;
  $('d-hp').textContent = `❤️ ${R.hp}/${playerMaxHp()}`;
  const rb = document.getElementById('retreat-btn');
  if(rb) rb.style.display = R.hasRope ? '' : 'none';
  const rh = document.getElementById('rope-hint');
  if(rh) rh.textContent = R.hasRope ? '' : `🪢 逃脫之繩：首領掉率隨深度提升（第 ${ROPE_PITY} 層起必給）／寶箱 5%／商人 8%｜單趟限一條`;
  $('d-bonus').textContent = rarityBonusText(f);
  const grid = $('door-grid'); grid.innerHTML = '';
  if(R.forceDoor){
    const t = R.forceDoor; R.forceDoor = null;
    const map = {fight:['⚔️','戰鬥','逃不掉的'], elite:['😈','精英','逃不掉的'], boss:['☠️','首領','逃不掉的']};
    const m = map[t] || map.fight;
    R.doors = [{t, i:m[0], n:m[1], d:m[2]}];
    grid.style.gridTemplateColumns = '1fr';
  } else if(f % 5 === 0){
    // 首領層
    const b = bossFor(f);
    R.doors = [{t:'boss', i:b.i, n:'首領・'+b.n, d:'必掉稀有以上'}];
    grid.style.gridTemplateColumns = '1fr';
  } else {
    if(!R.doors){
      const pool = doorPool();
      const d1 = weightedPick(pool);
      let d2 = weightedPick(pool); let guard = 0;
      while(d2.t===d1.t && guard++<12) d2 = weightedPick(pool);
      R.doors = [d1,d2];
    }
    grid.style.gridTemplateColumns = '1fr 1fr';
  }
  for(const d of R.doors){
    const el = document.createElement('div'); el.className = 'door';
    el.innerHTML = `<div class="di">${d.i}</div><div class="dn">${d.n}</div><div class="dd">${d.d}</div>`;
    el.onclick = ()=>enterDoor(d);
    grid.appendChild(el);
  }
  $('bag-hint').textContent = R.bag.length ? `（行囊 ${R.bag.length} 件未保管）` : '';
  renderDoorPotions();
  save();
  showScreen('s-doors');
}

function renderDoorPotions(){
  const row = $('door-potions'); row.innerHTML = '';
  for(const [k,n] of Object.entries(R.pots||{})){
    const pt = POTIONS[k];
    const d = document.createElement('div'); d.className='potion';
    d.innerHTML = `<span class="pi">${pt.i}</span>${pt.n}${n>1?' ×'+n:''}`;
    d.onclick = ()=>{
      if(!pt.any){ toast('只能在戰鬥中使用'); return; }
      usePotion(k, false);
      showDoors();
    };
    row.appendChild(d);
  }
}

function enterDoor(d){
  R.doors = null;
  R.lastDoor = d.t;
  if(d.t==='fight') startBattle(makeEncounter(R.floor, 0));
  else if(d.t==='elite'){
    const roll = Math.random();
    if(roll < 0.4){
      startBattle(makeRealmElite(R.floor));
    } else if(R.floor>=8 && roll < 0.7){
      const e1 = makeEnemy(R.floor, 0), e2 = makeEnemy(R.floor, 0);
      for(const e of [e1,e2]){ e.hp = Math.round(e.hp*0.85); e.maxhp = e.hp; }
      startBattle([e1, e2]);
    } else startBattle(makeEncounter(R.floor, 1));
  }
  else if(d.t==='boss') startBattle(makeBossEncounter(R.floor));
  else if(d.t==='rest') doRest();
  else if(d.t==='chest') doChest();
  else if(d.t==='event'){ R.pendingEv = d.ev || null; runEvent(); }
}

function nextFloor(){
  if(hasCurse('bloodtax')){ R.hp = Math.max(1, R.hp - 3); toast('血稅：-3 生命'); }
  const before = realmFor(R.floor);
  R.floor++;
  bountyProgress('reach');
  if(R.floor > G.rec.deep) G.rec.deep = R.floor;
  if(R.cycle === 0){ if(R.floor > G.orig.deep) G.orig.deep = Math.min(50, R.floor); }
  else { const c = cd(R.cycle); if(R.floor > c.deep) c.deep = R.floor; }
  save();
  const now = realmFor(R.floor);
  if(now !== before){
    showEventScreen(now.i, '進入・'+now.n, now.intro,
      [{n:'繼續前進', f:()=>{ R.doors=null; showDoors(); }, primary:true}]);
    return;
  }
  showDoors();
}

function doRest(){
  const heal = Math.round(playerMaxHp()*0.3*healMult());
  const choices = [{n:`🩹 休息（回復 ${heal} 血）`, f:()=>{
    R.hp = Math.min(playerMaxHp(), R.hp + heal);
    showEventScreen('🕯️','營火','火光照不遠，但夠暖。\n\n回復了 '+heal+' 點生命。',
      [{n:'繼續前進', f:()=>nextFloor(), primary:true}]);
  }, primary:true}];
  choices.push(fireExtra());
  showEventScreen('🕯️','營火','你在深淵裡生了一小堆火。火只有一堆，事只能做一件。', choices);
}

function fireExtra(){
  const pool = [];
  if(potTotal() > 0) pool.push('cook');
  if(R.bag.length > 0) pool.push('scrap');
  pool.push('quench', 'poke');
  const k = pick(pool);
  if(k==='cook'){
    const pk = Object.keys(R.pots)[0];
    return {n:`🍲 烹食（熬掉一瓶${POTIONS[pk].n}，生命上限 +8）`, f:()=>{
      R.pots[pk]--; if(!R.pots[pk]) delete R.pots[pk];
      R.bless.push({k:'hp', v:8});
      R.hp = Math.min(playerMaxHp(), R.hp + 8);
      showEventScreen('🕯️','烹食','你把藥水倒進鍋裡，加了些說不上來的東西。味道意外地好。\n\n生命上限 +8（本次探索有效）。',
        [{n:'繼續前進', f:()=>nextFloor(), primary:true}]);
    }};
  }
  if(k==='scrap'){
    return {n:`🔧 拆裝（熔掉行囊裡的裝備換碎銀）`, f:()=>scrapFire()};
  }
  if(k==='quench'){
    return {n:'🗡 淬火（武器附毒或附燃，持續 3 場戰鬥）', f:()=>{
      showEventScreen('🕯️','淬火','把刀刃埋進火堆，接下來抹什麼？',
        [{n:'☠️ 抹毒（攻擊附 2 中毒）', f:()=>{ R.quench={k:'ptouch',v:2,battles:3};
          showEventScreen('🕯️','淬火','刀刃泛起烏青色。（持續 3 場戰鬥）',[{n:'出發',f:()=>nextFloor(),primary:true}]); }},
        {n:'🔥 淬焰（攻擊附 2 燃燒）', f:()=>{ R.quench={k:'btouch',v:2,battles:3};
          showEventScreen('🕯️','淬火','刀刃透著暗紅的熱。（持續 3 場戰鬥）',[{n:'出發',f:()=>nextFloor(),primary:true}]); }}]);
    }};
  }
  return {n:'🔥 撥弄火堆（誰知道會怎樣）', f:()=>{
    if(Math.random()<0.5){
      const b = pick(BLESSINGS); R.bless.push({k:b.k, v:b.v});
      showEventScreen('🕯️','撥火','火星飛起來的形狀像個古老的符文。\n\n'+b.n+'（本次探索有效）',
        [{n:'繼續前進', f:()=>nextFloor(), primary:true}]);
    } else {
      const d = Math.max(3, Math.round(playerMaxHp()*0.06)); R.hp = Math.max(1, R.hp-d);
      showEventScreen('🕯️','撥火','火星飛起來燙了你一臉。深淵的火也是火。\n\n失去 '+d+' 點生命。',
        [{n:'……繼續前進', f:()=>nextFloor()}]);
    }
  }};
}

function scrapFire(){
  if(!R.bag.length){ nextFloor(); return; }
  const c = R.bag.slice(0,6).map(it=>{
    const v = 6 + it.rar*10 + Math.floor(it.base/2);
    return {n:`熔掉 ${it.name}（+${v}🪙）`, f:()=>{
      const i = R.bag.findIndex(x=>x.id===it.id);
      if(i>=0){ R.bag.splice(i,1); R.gold += v; }
      scrapFire();
    }};
  });
  c.push({n:'夠了，出發', f:()=>nextFloor(), primary:true});
  showEventScreen('🕯️','拆裝','火堆燒得夠旺，可以熔東西。行囊裡的貨，熔掉的錢立刻落袋（不用等撤退）。', c);
}

function pickUp(sid, branch){
  if(!R.skillUps) R.skillUps = {};
  R.skillUps[sid] = branch;
  const u = SKILL_UPS[sid][branch];
  showEventScreen('🕯️','精進完成','「'+SKILLS[sid].n+'」蛻變為「'+u.n+'」。\n\n'+u.d+'（本次探索有效）',
    [{n:'繼續前進', f:()=>nextFloor(), primary:true}]);
}

function doChest(){
  tryDropRope(ROPE_DROP.chest, '寶箱');
  if(Math.random() < 0.18){
    // 寶箱怪
    showEventScreen('📦','寶箱','你伸手掀開箱蓋——箱子也張開了嘴。',
      [{n:'⚔️ 迎戰', f:()=>{ const e = makeEnemy(R.floor, 1); e.n='寶箱怪'; e.i='📦'; startBattle(e); }}]);
  } else {
    const it = makeItem(R.floor, 1);
    R.bag.push(it);
    showLoot([it], 0, '📦', '無主的寶箱', '深淵裡的無主之物，現在有主了。');
  }
}

function showEventScreen(icon,title,text,choices){
  R.phase='event';
  $('ev-floor').textContent = R.floor;
  $('ev-gold').textContent = R.gold;
  $('ev-icon').textContent = icon;
  $('ev-title').textContent = title;
  $('ev-text').textContent = text;
  const c = $('ev-choices'); c.innerHTML='';
  for(const ch of choices){
    const b = document.createElement('button'); b.className='btn'+(ch.primary?' primary':'');
    b.textContent = ch.n; b.onclick = ch.f; c.appendChild(b);
  }
  save(); showScreen('s-event');
}
/* 精進三欄選擇：左 技能名/功能、中 A分支、右 B分支。onPick(sid, 'a'|'b') */
function showSkillUpScreen(icon, title, text, onPick, extraChoices){
  R.phase='event';
  $('ev-floor').textContent = R.floor;
  $('ev-gold').textContent = R.gold;
  $('ev-icon').textContent = icon;
  $('ev-title').textContent = title;
  $('ev-text').textContent = text;
  const c = $('ev-choices'); c.innerHTML='';
  const upgradable = CLASSES[G.cls].skills.filter(sid=>!(R.skillUps&&R.skillUps[sid]));
  const grid = document.createElement('div'); grid.className='su-grid';
  const head = document.createElement('div'); head.className='su-row su-head';
  head.innerHTML = '<div class="su-name">技能／功能</div><div class="su-cell">A 分支</div><div class="su-cell">B 分支</div>';
  grid.appendChild(head);
  for(const sid of upgradable){
    const base = SKILLS[sid], ups = SKILL_UPS[sid];
    const row = document.createElement('div'); row.className='su-row';
    const name = document.createElement('div'); name.className='su-name';
    name.innerHTML = `<b>${base.n}</b><span>${base.d}</span>`;
    const ba = document.createElement('button'); ba.className='su-cell su-pick';
    ba.innerHTML = `<b>${ups.a.n}</b><span>${ups.a.d}</span>`; ba.onclick = ()=>onPick(sid,'a');
    const bb = document.createElement('button'); bb.className='su-cell su-pick';
    bb.innerHTML = `<b>${ups.b.n}</b><span>${ups.b.d}</span>`; bb.onclick = ()=>onPick(sid,'b');
    row.append(name, ba, bb); grid.appendChild(row);
  }
  c.appendChild(grid);
  for(const ch of (extraChoices||[])){
    const b = document.createElement('button'); b.className='btn'+(ch.primary?' primary':'');
    b.textContent = ch.n; b.onclick = ch.f; c.appendChild(b);
  }
  save(); showScreen('s-event');
}
/* 「離開」也要有事發生：小財 / 小傷 / 小憩 */

function walkAway(icon, title){
  const r = Math.random();
  if(r < 0.45){
    const g = 8 + Math.round(R.floor*1.2); R.gold += g;
    showEventScreen(icon, title, '你繞開了它。腳邊的碎石堆裡閃著幾枚前人掉的碎銀。\n\n獲得 '+g+' 碎銀。',
      [{n:'繼續前進', f:()=>nextFloor(), primary:true}]);
  } else if(r < 0.72){
    const h = Math.min(Math.round(playerMaxHp()*0.06), playerMaxHp()-R.hp);
    if(h>0) R.hp += h;
    showEventScreen(icon, title, '你繞開了它，順便在轉角喘了口氣。\n\n回復 '+h+' 點生命。',
      [{n:'繼續前進', f:()=>nextFloor(), primary:true}]);
  } else {
    const e = makeEnemy(R.floor, 0);
    showEventScreen(icon, title, '你繞開了它——正好繞進另一個東西的地盤。',
      [{n:'⚔️ 迎戰', f:()=>startBattle(e, {ambush:true}), primary:true}]);
  }
}

function rollEvent(){
  const ri = realmIdx(R.floor);
  const weights = {shrine:9, gambler:8, merchant:12, spring:9, can:4,
                   rock:9, corpse:9, crack:7, box:9, whisper:7};
  if(!(R.scrollSeen && R.scrollSeen[ri]) && CLASSES[G.cls].skills.some(sid=>!(R.skillUps&&R.skillUps[sid])))
    weights.scroll = 14;
  for(const [k,zr] of Object.entries(EV_REALM)) if(zr===ri) weights[k] = 16;
  if(!R.seenEv) R.seenEv = {};
  const evs = Object.keys(weights);
  let total = 0;
  for(const e of evs){ weights[e] = weights[e] / (1 + (R.seenEv[e]||0)); total += weights[e]; }
  let r = Math.random()*total, ev = evs[0];
  for(const e of evs){ if((r-=weights[e])<0){ ev = e; break; } }
  return ev;
}

function runEvent(){
  const ev = R.pendingEv || rollEvent();
  R.pendingEv = null;
  if(!R.seenEv) R.seenEv = {};
  R.seenEv[ev] = (R.seenEv[ev]||0) + 1;
  EVENTS[ev]();
}
/* 隨機寶藏：碎銀 / 裝備 / 藥水 / 祝福 */

function treasureRoll(bonus, icon, title){
  const r = Math.random();
  if(r < 0.34){
    const g = Math.round((28 + R.floor*6 + rnd(0,15)) * (1 + sumAffix('greed')/100));
    R.gold += g;
    showEventScreen(icon, title, '一小堆碎銀，數了數有 '+g+' 枚。深淵的錢不燙手，只是重。',
      [{n:'收下，繼續前進', f:()=>nextFloor(), primary:true}]);
  } else if(r < 0.72){
    const it = makeItem(R.floor, bonus||0); R.bag.push(it);
    showLoot([it], 0, icon, title, '');
  } else if(r < 0.9){
    const k = pick(potionPool());
    if(potAdd(k)){
      showEventScreen(icon, title, '找到了 '+POTIONS[k].i+' '+POTIONS[k].n+'。（'+pdesc(k)+'）',
        [{n:'收下，繼續前進', f:()=>nextFloor(), primary:true}]);
    } else {
      const g = 20 + R.floor*3; R.gold += g;
      showEventScreen(icon, title, '找到一瓶藥水，但你背不下了，只好折成 '+g+' 碎銀。',
        [{n:'收下，繼續前進', f:()=>nextFloor(), primary:true}]);
    }
  } else {
    const b = pick(BLESSINGS); R.bless.push({k:b.k, v:b.v});
    if(b.k==='hp') R.hp = Math.min(playerMaxHp(), R.hp);
    showEventScreen(icon, title, '你摸到的不是東西，是一段殘留的祝福。\n\n'+b.n+'（本次探索有效）',
      [{n:'繼續前進', f:()=>nextFloor(), primary:true}]);
  }
}

const EVENTS = {
  shrine(){
    const cost = Math.max(4, Math.round(R.hp*0.15));
    showEventScreen('⛩️','無名神龕','石龕裡供著一尊看不清面目的神像。香爐是冷的，但你總覺得有東西在等你開口。',
      [{n:`獻上鮮血（失去 ${cost} 血，獲得隨機祝福）`, f:()=>{
        R.hp = Math.max(1, R.hp - cost);
        const b = pick(BLESSINGS);
        R.bless.push({k:b.k, v:b.v});
        if(b.k==='hp') R.hp = Math.min(playerMaxHp(), R.hp + b.v);
        showEventScreen('⛩️','無名神龕','神像的眼窩亮了一瞬。\n\n'+b.n+'（本次探索有效）',
          [{n:'繼續前進', f:()=>nextFloor(), primary:true}]);
      }},
      {n:'不拜。繼續前進', f:()=>walkAway('⛩️', '無名神龕')}]);
  },
  gambler(){
    const stake = Math.min(R.gold, Math.max(20, Math.round(R.gold*0.5)));
    if(R.gold < 10){ EVENTS.spring(); return; }
    showEventScreen('🎲','蹲在角落的賭徒','一個看不清臉的傢伙搖著骰盅：「猜大小。贏了翻倍，輸了歸我。」\n\n他看起來不像會出老千——因為他根本沒有手。',
      [{n:`押 ${stake} 碎銀`, f:()=>{
        if(Math.random()<0.5){ R.gold += stake;
          showEventScreen('🎲','賭徒','骰盅掀開。「你贏了。」他的聲音聽起來鬆了一口氣，這反而更可疑。\n\n獲得 '+stake+' 碎銀。',[{n:'見好就收',f:()=>nextFloor(),primary:true}]);
        } else { R.gold -= stake;
          showEventScreen('🎲','賭徒','骰盅掀開。他沒有臉，但你確定他在笑。\n\n失去 '+stake+' 碎銀。',[{n:'走人',f:()=>nextFloor()}]);
        }
      }},
      {n:'不賭', f:()=>walkAway('🎲', '賭徒')}]);
  },
  merchant(){
    // 貨架抽 3 樣，存進 R.shop 供限購與重繪
    const gearIt = makeItem(R.floor, Math.random()<0.35?1:0);
    const shop = [];
    shop.push({kind:'gear', it:gearIt, price:Math.round((60 + R.floor*6) * (1 + gearIt.rar*0.5)), sold:false});
    const pool2 = ['oil','quench'];
    if(R.cycle > 0) pool2.push('mat');
    const k2 = pick(pool2);
    if(k2==='oil') shop.push({kind:'oil', price:45 + R.floor*2, sold:false});
    else if(k2==='quench') shop.push({kind:'quench', price:35 + R.floor*2, sold:false});
    else shop.push({kind:'mat', mat:(R.floor<=30?'iron':'steel'), price:70 + R.floor*3, sold:false});
    shop.push({kind:'potion', k:pick(potionPool()), price:25 + R.floor*3, sold:false});
    if(!R.hasRope && !R.ropeSeen && Math.random() < ROPE_DROP.merchant){
      shop.push({kind:'rope', price:Math.round(120 + R.floor*8), sold:false});
    }
    R.shop = shop;
    renderMerchant();
  },
  spring(){
    const heal = Math.round(playerMaxHp()*0.35*healMult());
    showEventScreen('⛲','幽光泉水','岩縫間湧出泛著微光的泉水，看起來乾淨得不像這裡的東西。',
      [{n:'喝下（回復 '+heal+' 血）', f:()=>{ R.hp=Math.min(playerMaxHp(),R.hp+heal);
        showEventScreen('⛲','幽光泉水','冰涼，微甜，喝完之後傷口不那麼疼了。\n\n回復 '+heal+' 點生命。',[{n:'繼續前進',f:()=>nextFloor(),primary:true}]); }},
      {n:'太可疑了，不喝', f:()=>walkAway('⛲', '幽光泉水')}]);
  },
  can(){
    showEventScreen('🥫','奇怪的罐頭','角落裡放著一個沒有標籤的罐頭。你把耳朵貼上去——裡面有東西在動。\n\n不知道為什麼，你想起了某個只在午夜開市的市場。',
      [{n:'打開它', f:()=>{
        const roll = Math.random();
        if(roll<0.5){ const g = 60+R.floor*8; R.gold+=g;
          showEventScreen('🥫','罐頭開了','一隻不屬於任何年代的蟬爬出來，鳴叫一聲，化成了一把碎銀。\n\n獲得 '+g+' 碎銀。',[{n:'收下',f:()=>nextFloor(),primary:true}]);
        } else if(roll<0.85){ const b = pick(BLESSINGS); R.bless.push({k:b.k,v:b.v});
          showEventScreen('🥫','罐頭開了','蟬鳴了三聲。你夢見了自己的童年，醒來時覺得渾身是勁。\n\n'+b.n,[{n:'繼續前進',f:()=>nextFloor(),primary:true}]);
        } else { const dmg = Math.round(playerMaxHp()*0.2); R.hp=Math.max(1,R.hp-dmg);
          showEventScreen('🥫','罐頭開了','蟬沒有鳴。沉默像瘟疫一樣撲了你一臉。\n\n失去 '+dmg+' 點生命。',[{n:'…走了',f:()=>nextFloor()}]);
        }
      }},
      {n:'別碰它', f:()=>walkAway('🥫', '奇怪的罐頭')}]);
  },
  /* ==== 同名事件・未知結局 ==== */
  rock(){
    showEventScreen('🪨','塌落的石堆','一堆看起來剛塌下來不久的碎石，縫隙裡露出什麼東西的邊角。可能是前人沒帶走的，也可能是專門留給你的。',
      [{n:'搬開石頭', f:()=>{
        const r = Math.random();
        if(r < 0.38){ treasureRoll(0, '🪨', '石堆下'); }
        else if(r < 0.65){
          showEventScreen('🪨','石堆下','石頭才挪開一半，底下的東西先動了。',
            [{n:'⚔️ 迎戰', f:()=>startBattle(makeEnemy(R.floor, R.floor>=6?1:0), {ambush:true}), primary:true}]);
        }
        else if(r < 0.85){
          const d = Math.max(4, Math.round(playerMaxHp()*0.08));
          R.hp = Math.max(1, R.hp - d); R.pendingStatus = {poison:3};
          showEventScreen('🪨','石堆下','指尖一刺——石縫裡藏著淬毒的針。失去 '+d+' 點生命，毒素會纏著你進入下一場戰鬥（中毒 3）。',
            [{n:'……包紮一下，繼續前進', f:()=>nextFloor()}]);
        }
        else showEventScreen('🪨','石堆下','搬了半天，底下只有更多石頭。深淵有時候就是這麼無聊。',
          [{n:'拍拍手上的灰，繼續前進', f:()=>nextFloor()}]);
      }},
      {n:'繞過去', f:()=>walkAway('🪨', '塌落的石堆')}]);
  },
  corpse(){
    showEventScreen('🧟','前人','一具冒險者的屍體靠牆坐著，姿勢像只是睡著了。裝備看起來還算完整。',
      [{n:'搜刮遺物', f:()=>{
        const r = Math.random();
        if(r < 0.55){ treasureRoll(0, '🧟', '遺物'); }
        else if(r < 0.75){
          const e = makeEnemy(R.floor, 0); e.n='不安息者'; e.i='🧟';
          showEventScreen('🧟','遺物','你的手才碰到他的行囊，他的手就抓住了你的。',
            [{n:'⚔️ 迎戰', f:()=>startBattle(e, {ambush:true}), primary:true}]);
        }
        else {
          const d = Math.max(5, Math.round(playerMaxHp()*0.1));
          R.hp = Math.max(1, R.hp - d);
          showEventScreen('🧟','遺物','屍水濺了你一手，皮膚立刻開始發燙。失去 '+d+' 點生命。\n\n他的行囊裡什麼都沒有。他大概也是這樣被騙的。',
            [{n:'離開', f:()=>nextFloor()}]);
        }
      }},
      {n:'替他闔上眼，不動遺物', f:()=>{
        if(Math.random() < 0.35){
          const b = pick(BLESSINGS); R.bless.push({k:b.k, v:b.v});
          showEventScreen('🧟','前人','你替他闔上眼。起身時，覺得肩膀被誰輕輕拍了一下。\n\n'+b.n+'（本次探索有效）',
            [{n:'繼續前進', f:()=>nextFloor(), primary:true}]);
        } else showEventScreen('🧟','前人','你替他闔上眼，繼續前進。深淵沒有給你任何回報——體面本來就不是拿來換東西的。',
          [{n:'繼續前進', f:()=>nextFloor()}]);
      }}]);
  },
  crack(){
    showEventScreen('✨','發光的裂縫','岩壁上一道窄縫透出微光，寬度剛好夠伸進一隻手。你聽過兩種傳聞：有人從裡面摸出傳說中的東西，也有人從此只剩一隻手。',
      [{n:'伸手進去', f:()=>{
        const r = Math.random();
        if(r < 0.08){
          const it = makeItem(R.floor, 2); it.rar = 3;
          it.name = pick(PREFIX.orange) + it.name.replace(/^(破舊的|素面的|無名的|精良的|工匠的|磨亮的|符文|低語的|深淵紋|王殞|噬光|無面|母巢)/,'');
          it.affixes = it.affixes.length>=3? it.affixes : it.affixes.concat([{k:'str',v:3}]);
          R.bag.push(it);
          showLoot([it], 0, '✨', '裂縫深處', '你的指尖碰到了它——它也在等你。');
        }
        else if(r < 0.45){ treasureRoll(0, '✨', '裂縫深處'); }
        else {
          const d = Math.max(6, Math.round(playerMaxHp()*0.14));
          R.hp = Math.max(1, R.hp - d);
          showEventScreen('✨','裂縫深處','裡面的東西比你更快。你抽回手，少了一塊肉。失去 '+d+' 點生命。',
            [{n:'握著手離開', f:()=>nextFloor()}]);
        }
      }},
      {n:'看看就好', f:()=>walkAway('✨', '發光的裂縫')}]);
  },
  box(){
    // 預先擲定結局，「搖一搖」給 75% 準確的提示
    const roll = Math.random();
    const outcome = roll < 0.45 ? 'item' : roll < 0.65 ? 'potion' : roll < 0.85 ? 'trap' : 'empty';
    const hintFor = o => o==='item' ? '沉甸甸的金屬碰撞聲' : o==='potion' ? '液體晃動的聲音' : o==='trap' ? '細微的滋滋聲' : '沒有任何聲音';
    const open = ()=>{
      if(outcome==='item'){ const it = makeItem(R.floor, 1); R.bag.push(it); showLoot([it], 0, '🧰', '鐵盒打開了', ''); }
      else if(outcome==='potion'){
        let got = [];
        for(let i=0;i<2;i++){ const k = pick(potionPool()); if(potAdd(k)) got.push(POTIONS[k].i+POTIONS[k].n); }
        showEventScreen('🧰','鐵盒打開了', got.length? '裡面墊著稻草，放著 '+got.join('、')+'。':'裡面是藥水，但你的藥水袋已經滿了。',
          [{n:'繼續前進', f:()=>nextFloor(), primary:true}]);
      }
      else if(outcome==='trap'){
        const d = Math.max(6, Math.round(playerMaxHp()*0.16));
        R.hp = Math.max(1, R.hp - d);
        showEventScreen('🧰','鐵盒炸了','鎖簧連著火藥。失去 '+d+' 點生命。\n\n盒底燒剩的東西裡，好像什麼都沒有。',
          [{n:'……走了', f:()=>nextFloor()}]);
      }
      else showEventScreen('🧰','鐵盒打開了','空的。有人比你先到，還好心地把鎖重新鎖上。',
        [{n:'繼續前進', f:()=>nextFloor()}]);
    };
    const baseChoices = shaken => {
      const c = [{n:'撬開它', f:open, primary:shaken}];
      if(!shaken) c.push({n:'先搖一搖聽聲音', f:()=>{
        const heard = Math.random() < 0.75 ? outcome : pick(['item','potion','trap','empty'].filter(o=>o!==outcome));
        showEventScreen('🧰','上鎖的鐵盒','你把鐵盒拿起來晃了晃——裡面傳出' + hintFor(heard) + '。\n\n（你的耳朵不一定可靠）',
          baseChoices(true));
      }});
      c.push({n:'不碰它', f:()=>walkAway('🧰', '上鎖的鐵盒')});
      return c;
    };
    showEventScreen('🧰','上鎖的鐵盒','角落裡放著一個上了鎖的鐵盒，鎖是新的，盒子是舊的。這個組合通常意味著兩件事之一：有人想保護裡面的東西，或想保護外面的你。',
      baseChoices(false));
  },
  whisper(){
    showEventScreen('🚪','低語的門','一扇不在任何地圖上的門，門縫裡漏出很低很低的說話聲。聽不清內容，但語氣像在招手。',
      [{n:'推開門', f:()=>{
        const r = Math.random();
        if(r < 0.30){
          const its = [makeItem(R.floor,1), makeItem(R.floor,1), makeItem(R.floor,1)];
          const c = its.map(it=>({n:`${RARITIES[it.rar].n}｜${it.name}（${itemStatLine(it)}）`, f:()=>{
            R.bag.push(it); showLoot([it], 0, '🚪', '密室', '你拿走了一件，門在身後消失了。');
          }}));
          c.push({n:'都不拿', f:()=>nextFloor()});
          showEventScreen('🚪','密室','門後是一個小小的密室，石台上供著三件東西。低語聲說：只能拿一件。',c);
        }
        else if(r < 0.60){
          showEventScreen('🚪','門後','低語聲停了。門後的東西一直在等的就是這一刻。',
            [{n:'⚔️ 迎戰', f:()=>startBattle(makeEnemy(R.floor, 1), {ambush:true}), primary:true}]);
        }
        else if(r < 0.85){
          const g = 15 + R.floor*3; R.gold += g;
          showEventScreen('🚪','門後','門後只有一面牆，牆上用指甲刻著一行字：「別信搖起來有金屬聲的盒子。」\n\n牆角散落著 '+g+' 枚碎銀。',
            [{n:'收下，繼續前進', f:()=>nextFloor(), primary:true}]);
        }
        else {
          const d = Math.max(4, Math.round(playerMaxHp()*0.07));
          R.hp = Math.max(1, R.hp - d); R.floor++;
          if(R.floor > G.rec.deep) G.rec.deep = R.floor;
          showEventScreen('🚪','門後','你踏進去，腳下沒有地板。\n\n摔到了更深的地方——直接抵達下一層，失去 '+d+' 點生命。',
            [{n:'爬起來', f:()=>nextFloor()}]);
        }
      }},
      {n:'假裝沒聽見', f:()=>walkAway('🚪', '低語的門')}]);
  },
  /* ==== 分域事件 ==== */
  mine(){ // 淺穴
    showEventScreen('⛏️','崩塌的礦道','半塌的礦道口插著一把還算完好的鎬。裡面黑得很誠實。',
      [{n:'進去挖挖看', f:()=>{
        const r = Math.random();
        if(r<0.4){ treasureRoll(0,'⛏️','礦道深處'); }
        else if(r<0.7){ const d = Math.max(5, Math.round(playerMaxHp()*0.1)); R.hp = Math.max(1, R.hp-d);
          showEventScreen('⛏️','礦道深處','你敲了兩下，頭頂敲了回來。失去 '+d+' 點生命。',
            [{n:'灰頭土臉地離開', f:()=>nextFloor()}]); }
        else { const g = 25 + R.floor*4; R.gold += g;
          showEventScreen('⛏️','礦道深處','礦脈早被挖空了，但前人漏了一小袋——'+g+' 碎銀。',
            [{n:'收下', f:()=>nextFloor(), primary:true}]); }
      }},
      {n:'不進去', f:()=>walkAway('⛏️','崩塌的礦道')}]);
  },
  oldfire(){ // 淺穴
    showEventScreen('🔥','先人的火堆','一堆還溫著的營火，主人不見了。灰裡好像埋著什麼。',
      [{n:'撥開灰燼', f:()=>{
        const r = Math.random();
        if(r<0.45){ const b = pick(BLESSINGS); R.bless.push({k:b.k,v:b.v});
          showEventScreen('🔥','灰燼','灰裡埋著一枚刻符的石子，還帶著火的餘溫。\n\n'+b.n+'（本次探索有效）',
            [{n:'繼續前進', f:()=>nextFloor(), primary:true}]); }
        else if(r<0.75){ const e = makeEnemy(R.floor,0);
          showEventScreen('🔥','灰燼','火堆的主人回來了。他不覺得你是客人。',
            [{n:'⚔️ 迎戰', f:()=>startBattle(e), primary:true}]); }
        else { const h = Math.min(Math.round(playerMaxHp()*0.15), playerMaxHp()-R.hp); R.hp += h;
          showEventScreen('🔥','灰燼','什麼都沒埋。你借火烤了烤手，回復 '+h+' 點生命。',
            [{n:'繼續前進', f:()=>nextFloor(), primary:true}]); }
      }},
      {n:'別動別人的火', f:()=>walkAway('🔥','先人的火堆')}]);
  },
  wreck(){ // 沉沒王國
    showEventScreen('⛵','擱淺的貨船','一艘商船卡在王國的街道中央——沉到這裡的船，貨艙朝著天。',
      [{n:'撬開貨艙', f:()=>{
        const r = Math.random();
        if(r<0.45){ treasureRoll(1,'⛵','貨艙'); }
        else if(r<0.75){ const e = makeEnemy(R.floor, R.floor>=13?1:0); e.n='貨艙裡的'+e.n.replace('精英・',''); 
          showEventScreen('⛵','貨艙','貨早就被搬空了，搬貨的東西還住在裡面。',
            [{n:'⚔️ 迎戰', f:()=>startBattle(e,{ambush:true}), primary:true}]); }
        else { const g = 30 + R.floor*5; R.gold += g;
          showEventScreen('⛵','貨艙','船長室的暗格裡藏著 '+g+' 碎銀。船長本人在椅子上，早就不需要錢了。',
            [{n:'收下', f:()=>nextFloor(), primary:true}]); }
      }},
      {n:'不上船', f:()=>walkAway('⛵','擱淺的貨船')}]);
  },
  wishwell(){ // 沉沒王國
    const cost = 20 + R.floor*3;
    showEventScreen('🪙','許願池','王國廣場的許願池還在運作——池底鋪滿了願望，大多沒實現。',
      [{n:`投入 ${cost} 碎銀許願`, f:()=>{
        if(R.gold < cost){ toast('碎銀不夠'); return; }
        R.gold -= cost;
        const r = Math.random();
        if(r<0.5){ const b = pick(BLESSINGS); R.bless.push({k:b.k,v:b.v});
          showEventScreen('🪙','許願池','水面泛起一圈不屬於物理的漣漪。\n\n'+b.n+'（本次探索有效）',
            [{n:'繼續前進', f:()=>nextFloor(), primary:true}]); }
        else if(r<0.8){ const g = cost*2; R.gold += g;
          showEventScreen('🪙','許願池','池子把你的碎銀吐了回來——連本帶利，'+g+' 碎銀。它大概不喜歡你的願望。',
            [{n:'也行', f:()=>nextFloor(), primary:true}]); }
        else showEventScreen('🪙','許願池','碎銀沉底，什麼都沒發生。你聽見池底傳來一聲很小的「謝了」。',
          [{n:'……走了', f:()=>nextFloor()}]);
      }},
      {n:'不許願', f:()=>walkAway('🪙','許願池')}]);
  },
  cyst(){ // 血肉迴廊
    showEventScreen('🫧','搏動的囊腫','牆上鼓著一顆半透明的囊腫，隨著整條迴廊的心跳一起搏動。裡面有影子。',
      [{n:'刺破它', f:()=>{
        const r = Math.random();
        if(r<0.4){ const it = makeItem(R.floor, 1); R.bag.push(it);
          showLoot([it], 0, '🫧', '囊腫裡', '深淵消化不了的東西，都會被包起來。'); }
        else if(r<0.75){ const d = Math.max(6, Math.round(playerMaxHp()*0.09)); R.hp = Math.max(1, R.hp-d); R.pendingStatus = {poison:4};
          showEventScreen('🫧','囊腫裡','膿液噴了你一身。失去 '+d+' 點生命，毒素纏著你進入下一場戰鬥（中毒 4）。',
            [{n:'擦掉，繼續前進', f:()=>nextFloor()}]); }
        else { const g = 35 + R.floor*4; R.gold += g;
          showEventScreen('🫧','囊腫裡','裡面是一個被消化到只剩錢袋的冒險者。'+g+' 碎銀，還有點黏。',
            [{n:'收下', f:()=>nextFloor(), primary:true}]); }
      }},
      {n:'不碰', f:()=>walkAway('🫧','搏動的囊腫')}]);
  },
  vein(){ // 血肉迴廊
    showEventScreen('🩸','裸露的血管','一根手臂粗的血管從牆裡垂下來，破口處滴著溫熱的血。喝的人聽說會變強。也聽說會變別的。',
      [{n:'喝一口', f:()=>{
        const r = Math.random();
        if(r<0.5){ R.bless.push({k:'str',v:3}); const h = Math.min(Math.round(playerMaxHp()*0.2), playerMaxHp()-R.hp); R.hp += h;
          showEventScreen('🩸','血管','深淵的血在你血管裡燒。力量 +3（本次探索），回復 '+h+' 點生命。',
            [{n:'繼續前進', f:()=>nextFloor(), primary:true}]); }
        else { R.pendingStatus = {wound:3};
          showEventScreen('🩸','血管','血是甜的——太甜了。你的傷口開始不肯癒合（下場戰鬥重傷 3）。',
            [{n:'……繼續前進', f:()=>nextFloor()}]); }
      }},
      {n:'不喝', f:()=>walkAway('🩸','裸露的血管')}]);
  },
  confess(){ // 無光教區
    showEventScreen('🕳','懺悔室','一座黑木懺悔室立在路中央，簾子後面有呼吸聲。牌子上寫：「說出你的重量。」',
      [{n:'進去懺悔', f:()=>{
        const cursed = ['w','a','t'].some(sl=>G.equip[sl] && G.equip[sl].cursed);
        const r = Math.random();
        if(cursed && r<0.6){
          for(const sl of ['w','a','t']){ const it = G.equip[sl];
            if(it && it.cursed){ it.affixes = it.affixes.filter(a=>!AFFIXES[a.k].curse); it.cursed = false; it.name = it.name.replace('詛咒的',''); break; } }
          showEventScreen('🕳','懺悔室','簾後的聲音聽完，嘆了口氣。你身上有什麼東西鬆開了。\n\n一件裝備的詛咒被赦免了。',
            [{n:'繼續前進', f:()=>nextFloor(), primary:true}]); }
        else if(r<0.55){ const h = Math.min(Math.round(playerMaxHp()*0.25), playerMaxHp()-R.hp); R.hp += h;
          showEventScreen('🕳','懺悔室','你把一路的殺孽都說了。簾後只回了一句：「不重。」\n\n回復 '+h+' 點生命。',
            [{n:'繼續前進', f:()=>nextFloor(), primary:true}]); }
        else { const d = Math.max(5, Math.round(playerMaxHp()*0.08)); R.hp = Math.max(1, R.hp-d);
          showEventScreen('🕳','懺悔室','簾後的聲音說：「不夠誠實。」一條看不見的鞭子抽在你背上。失去 '+d+' 點生命。',
            [{n:'離開', f:()=>nextFloor()}]); }
      }},
      {n:'我沒什麼好懺悔的', f:()=>walkAway('🕳','懺悔室')}]);
  },
  candle(){ // 無光教區
    showEventScreen('🕯','冷燭祭壇','祭壇上插滿了燒不起來的蠟燭。祭壇的說明只有一句：「借火者，還火。」',
      [{n:'用自己的體溫點燃（失去 10% 血）', f:()=>{
        const d = Math.max(4, Math.round(playerMaxHp()*0.1)); R.hp = Math.max(1, R.hp-d);
        R.quench = {k:'btouch', v:3, battles:4};
        showEventScreen('🕯','冷燭祭壇','蠟燭一根接一根亮起——燒的是你的溫度。你的武器泛著同樣的冷焰。\n\n攻擊附 3 層燃燒，持續 4 場戰鬥。',
          [{n:'繼續前進', f:()=>nextFloor(), primary:true}]);
      }},
      {n:'不還火', f:()=>walkAway('🕯','冷燭祭壇')}]);
  },
  bloodspring(){ // 心室
    showEventScreen('⛲','血泉','一眼泉，湧的是血——溫的、乾淨的、和你心跳同頻的血。',
      [{n:'喝下', f:()=>{
        const r = Math.random();
        if(r<0.6){ R.bless.push({k:'hp',v:12}); const h = Math.min(Math.round(playerMaxHp()*0.35), playerMaxHp()-R.hp); R.hp += h;
          showEventScreen('⛲','血泉','它認得你——你一路流的血，有一部分匯到了這裡。\n\n生命上限 +12（本次探索），回復 '+h+' 點生命。',
            [{n:'繼續前進', f:()=>nextFloor(), primary:true}]); }
        else { R.pendingStatus = {wound:2, weak:2};
          showEventScreen('⛲','血泉','血認得你，但不喜歡你。（下場戰鬥重傷 2、虛弱 2）',
            [{n:'……繼續前進', f:()=>nextFloor()}]); }
      }},
      {n:'不喝', f:()=>walkAway('⛲','血泉')}]);
  },
  scroll(){ // 📜 殘卷：技能精進唯一來源，每域至多一次
    const ri = realmIdx(R.floor);
    if(!R.scrollSeen) R.scrollSeen = {};
    R.scrollSeen[ri] = true;
    const upgradable = CLASSES[G.cls].skills.filter(sid=>!(R.skillUps&&R.skillUps[sid]));
    if(!upgradable.length){
      const g = 40 + R.floor*3; R.gold += g;
      showEventScreen('📜','殘卷','石臺上攤著一頁殘卷，但上面的招式你都已經會了。\n\n卷頁化為 '+g+' 碎銀。',
        [{n:'收下，繼續前進', f:()=>nextFloor(), primary:true}]);
      return;
    }
    const sacrifice = (payFn, payDesc) => {
      showSkillUpScreen('📜','殘卷・'+payDesc,'代價談妥了。殘卷上的文字開始蠕動——選一招，讓它爬進你的骨頭裡。',
        (sid, branch)=>{ payFn(); pickUp(sid, branch); },
        [{n:'……還是算了', f:()=>walkAway('📜','殘卷')}]);
    };
    const choices = [
      {n:'✂️ 以血立契（本次探索生命上限 −15%）', f:()=>{
        sacrifice(()=>{
          R.hpCut = (R.hpCut||0) + 0.15;
          R.hp = Math.min(R.hp, playerMaxHp());
        }, '血契');
      }},
    ];
    if(R.bag.length){
      choices.push({n:'🔥 以物立契（熔掉行囊中一件裝備）', f:()=>{
        const c = R.bag.slice(0,6).map(it=>({n:`熔掉 ${it.name}`, f:()=>{
          const i = R.bag.findIndex(x=>x.id===it.id);
          if(i>=0) R.bag.splice(i,1);
          sacrifice(()=>{}, '物契');
        }}));
        c.push({n:'捨不得', f:()=>EVENTS.scroll()});
        showEventScreen('📜','殘卷・獻祭','殘卷要吃東西。選一件——它不挑，但要真的痛。', c);
      }});
    }
    choices.push({n:'不碰它', f:()=>walkAway('📜','殘卷')});
    showEventScreen('📜','殘卷','石臺上攤著一頁會呼吸的殘卷——上面是失傳的招式變體。\n\n它明碼標價：變強要流血。',
      choices);
  },
  calcified(){ // 心室
    showEventScreen('🗿','鈣化的英雄','一位冒險者站在走廊中央——站了太久，深淵把他變成了鈣。他手上的裝備看起來還能用。',
      [{n:'撬下他的裝備', f:()=>{
        const r = Math.random();
        if(r<0.5){ const it = makeItem(R.floor, 2); R.bag.push(it);
          showLoot([it], 0, '🗿', '英雄的遺物', '他的手指斷裂的聲音像一句遲來的「拿去」。'); }
        else { const e = makeRealmElite(Math.min(R.floor,50));
          showEventScreen('🗿','英雄的遺物','你才碰到他的劍柄，走廊盡頭傳來腳步聲——看守遺物的東西回來了。',
            [{n:'⚔️ 迎戰', f:()=>startBattle(e), primary:true}]); }
      }},
      {n:'讓他站著', f:()=>{
        if(Math.random()<0.4){ const b = pick(BLESSINGS); R.bless.push({k:b.k,v:b.v});
          showEventScreen('🗿','鈣化的英雄','你朝他點了點頭。轉身時，你發誓看到他也點了。\n\n'+b.n+'（本次探索有效）',
            [{n:'繼續前進', f:()=>nextFloor(), primary:true}]); }
        else walkAway('🗿','鈣化的英雄');
      }}]);
  },
};

function merchantLabel(st){
  if(st.sold) return '（已售出）';
  if(st.kind==='gear'){ const r = RARITIES[st.it.rar]; return `${r.n}裝備｜${st.it.name}（${itemStatLine(st.it)}）— ${st.price}🪙`; }
  if(st.kind==='oil') return `✦ 祝福油（隨機一項本次探索祝福）— ${st.price}🪙`;
  if(st.kind==='quench') return `🗡 淬毒服務（攻擊附 3 中毒，3 場戰鬥）— ${st.price}🪙`;
  if(st.kind==='mat') return `${MATS[st.mat].i} ${MATS[st.mat].n} ×1 — ${st.price}🪙`;
  if(st.kind==='rope') return `🪢 逃脫之繩（活著離開，記錄這趟深度）— ${st.price}🪙`;
  return `${POTIONS[st.k].i} ${POTIONS[st.k].n}（${pdesc(st.k)}）— ${st.price}🪙`;
}

function buyMerchant(idx){
  const st = R.shop[idx];
  if(!st || st.sold) return;
  if(R.gold < st.price){ toast('碎銀不夠'); return; }
  if(st.kind==='gear'){ R.bag.push(st.it); toast('入手 '+st.it.name); }
  else if(st.kind==='oil'){ const b = pick(BLESSINGS); R.bless.push({k:b.k,v:b.v}); toast(b.n); }
  else if(st.kind==='quench'){ R.quench = {k:'ptouch', v:3, battles:3}; toast('刀刃泛起烏青色'); }
  else if(st.kind==='mat'){ G.mats[st.mat]++; toast('入手 '+MATS[st.mat].n); }
  else if(st.kind==='rope'){ R.hasRope = true; R.ropeSeen = true; toast('🪢 入手逃脫之繩'); }
  else { if(!potAdd(st.k)){ toast('背不下了'); return; } toast('買到了'); }
  R.gold -= st.price;
  st.sold = true;
  save();
  renderMerchant();
}

function renderMerchant(){
  const choices = R.shop.map((st, i)=>({ n:merchantLabel(st), f:()=>buyMerchant(i) }));
  choices.push({n:'不買了，繼續前進', f:()=>nextFloor(), primary:true});
  showEventScreen('🏮','迷路的商人','一盞紅燈籠下，商人縮在貨擔後面：「客人，深處的東西不收碎銀，趁現在換點有用的吧。」',choices);
}

function tryDropRope(chance, srcLabel){ // 逃脫之繩掉落：單趟唯一
  if(R.hasRope || R.ropeSeen) return false;   // 已有繩、或這趟已給過就不再給
  if(Math.random() < chance){
    R.hasRope = true; R.ropeSeen = true;
    toast('🪢 獲得逃脫之繩！');
    return true;
  }
  return false;
}

function retreat(){
  if(!R.hasRope){ toast('沒有逃脫之繩'); return; }
  const n = R.bag.length, g = R.gold;
  // 保管一切
  for(const it of R.bag){ it.banked = true; G.stash.push(it); }
  for(const s of ['w','a','t']) if(G.equip[s]) G.equip[s].banked = true;
  G.gold += g;
  const deep = R.floor;
  const kills = R.kills;
  // 認證：只有活著逃脫才寫進榮譽紀錄（歷史是贏家寫的），只留最難成就
  recordCert(R.cycle, deep);
  // 傳送點也一樣——只有活著逃脫才解鎖（本源上限 41 層）
  if(R.cycle === 0) G.orig.cp = Math.max(G.orig.cp, Math.min(deep, 41));
  else { const c = cd(R.cycle); c.cp = Math.max(c.cp, deep); }
  R = null; B = null; save();
  $('res-icon').textContent = '🪢';
  $('res-title').textContent = '平安歸來';
  $('res-sub').textContent = `你在第 ${deep} 層拉了繩子。貪婪是美德，活著兌現它更是。`;
  $('res-body').innerHTML = `<div class="stat-grid">
    <div class="stat-box"><div class="v">${deep}</div><div class="k">抵達深度</div></div>
    <div class="stat-box"><div class="v">${kills}</div><div class="k">擊殺</div></div>
    <div class="stat-box"><div class="v">+${g}</div><div class="k">帶回碎銀</div></div>
  </div>` + (n? `<p style="text-align:center;color:var(--green);font-size:13px">${n} 件裝備已存入倉庫。</p>`:'');
  showScreen('s-result');
}

function playerDie(){
  if(B) B.over = true;
  const deep = R.floor, kills = R.kills, lostG = R.gold, lostN = R.bag.length;
  const deathHit = R.lastHit || null;
  // 未保管的裝備全部消失，裝備欄還原成下潛時的樣子
  G.equip = R.equipBackup;
  R = null; B = null; save();
  setTimeout(()=>{
    $('res-icon').textContent = '💀';
    $('res-title').textContent = '深淵收下了你';
    $('res-sub').textContent = '再貪一層，就這一層——每個死在這裡的人都這麼說過。';
    const lh = deathHit;
    const recap = lh ? `<p style="text-align:center;color:#e8a0a0;font-size:14px;margin:6px 0">死因：${lh.src} ${lh.d} 傷（當時剩 ${lh.hpBefore} 血）</p>` : '';
    const realm = realmFor(deep);
    $('res-body').innerHTML = recap + `<div class="stat-grid">
      <div class="stat-box"><div class="v">${deep}</div><div class="k">${realm?realm.n:''} 倒下</div></div>
      <div class="stat-box"><div class="v">${kills}</div><div class="k">擊殺</div></div>
      <div class="stat-box"><div class="v" style="color:var(--red)">-${lostG}</div><div class="k">失去碎銀</div></div>
    </div>` + (lostN? `<p style="text-align:center;color:var(--red);font-size:13px">${lostN} 件未保管的裝備沉入了深淵。</p>`:
      '<p style="text-align:center;color:var(--dim);font-size:13px">至少你沒帶什麼可以失去的東西。</p>');
    showScreen('s-result');
  }, 700);
}

/* ===== 委託板（可接任務） ===== */
const MAX_ACTIVE = 2;
function romanCyc(c){ return c===0?'本源':'輪迴'+('I'.repeat(Math.min(c,3))+(c>3?'+'+(c-3):'')); }
function genBounty(){
  const cu = cyclesUnlocked();
  const mode = (cu>0 && Math.random()<0.45) ? (1+Math.floor(Math.random()*cu)) : 0;
  const cap = mode===0 ? Math.min(50, Math.max(10, G.orig.cp+9)) : Math.max(20, cd(mode).cp+14);
  const lo  = mode===0 ? 5 : 11;
  const type = pick(['reach','kill','loot','boss','streakkill','flawless','dotkill']);
  let floor = lo + Math.floor(Math.random()*Math.max(1,(cap-lo+1)));
  let target = 0;
  if(type==='boss'){ const bosses=[]; for(let f=Math.ceil(lo/5)*5; f<=cap; f+=5) bosses.push(f); floor = bosses.length? pick(bosses) : 10; }
  if(type==='streakkill'){ target = 5 + Math.floor(Math.random()*10); floor = lo; }
  const hard = (type==='flawless'||type==='dotkill'||type==='boss') ? 1.5 : 1;   // 挑戰型獎勵更高
  const diff = (floor||lo) * (mode? cycMult(mode):1) * hard;
  const r = Math.random();
  let reward;
  if(mode>0 && r<0.3) reward = {kind:'mat', mat: floor<=30?'iron':'steel', amt: hard>1?2:1};
  else if(r<0.25) reward = {kind:'gear', amt:1, bonus: hard>1?2:1};
  else reward = {kind:'gold', amt: Math.round(50 + diff*7)};
  return {mode, floor, target, type, reward, state:'offer'};
}
function ensureBounties(){
  if(!G.bounties) G.bounties = [];
  for(const b of G.bounties) if(b.state===undefined) b.state = b.done ? 'done' : 'offer'; // 舊檔轉新制
  G.bounties = G.bounties.filter(b=>b.state!=='done');
  let offers = G.bounties.filter(b=>b.state==='offer').length;
  while(offers < 3){ G.bounties.push(genBounty()); offers++; }
}
function bountyText(b){
  const m = romanCyc(b.mode); let t;
  switch(b.type){
    case 'reach': t = `抵達第 ${b.floor} 層`; break;
    case 'kill':  t = `在第 ${b.floor} 層擊殺敵人`; break;
    case 'loot':  t = `在第 ${b.floor} 層取得裝備`; break;
    case 'boss':  t = `擊殺第 ${b.floor} 層首領`; break;
    case 'streakkill': t = `一趟累積擊殺 ${b.target} 隻`; break;
    case 'flawless':   t = `第 ${b.floor} 層起·不受傷贏一場`; break;
    case 'dotkill':    t = `第 ${b.floor} 層起·斬殺中毒或燃燒的敵人`; break;
    default: t = '？';
  }
  return `${m}・${t}`;
}
function rewardText(r){ if(r.kind==='gold') return `🪙 ${r.amt}`; if(r.kind==='mat') return `${MATS[r.mat].i}${MATS[r.mat].n} ×${r.amt}`; return `🎁 ${(r.bonus>1?'稀有':'')}裝備`; }
function claimBounty(b){
  if(b.state==='done') return; b.state = 'done'; const r = b.reward;
  if(r.kind==='gold') G.gold += r.amt;
  else if(r.kind==='mat') G.mats[r.mat] = (G.mats[r.mat]||0) + r.amt;
  else if(r.kind==='gear'){ const it = makeItem(b.floor||R.floor||10, r.bonus||1); it.banked=true; G.stash.push(it); }
  toast('委託完成！' + rewardText(r)); save();
}
function bountyProgress(kind){
  if(!R || !G.bounties) return;
  for(const b of G.bounties){
    if(b.state !== 'active' || b.mode !== R.cycle || b.type !== kind) continue;
    let ok;
    if(kind==='reach') ok = R.floor >= b.floor;
    else if(kind==='streakkill') ok = R.kills >= b.target;
    else if(kind==='flawless' || kind==='dotkill') ok = R.floor >= b.floor;  // 特殊條件已由呼叫端確認
    else ok = R.floor === b.floor;                                            // kill/loot/boss
    if(ok) claimBounty(b);
  }
}
function acceptBounty(i){
  const b = G.bounties[i]; if(!b || b.state!=='offer') return;
  if(G.bounties.filter(x=>x.state==='active').length >= MAX_ACTIVE){ toast(`同時最多接 ${MAX_ACTIVE} 個委託`); return; }
  b.state = 'active'; save(); openBounties();
}
function abandonBounty(i){
  const b = G.bounties[i]; if(!b || b.state!=='active') return;
  G.bounties.splice(i,1); ensureBounties(); save(); openBounties();
}
function openBounties(){
  ensureBounties();
  const active = G.bounties.filter(b=>b.state==='active');
  const offers = G.bounties.filter(b=>b.state==='offer');
  let html = `<h3>懸賞板</h3><p class="base">自己挑委託接下——只有接下的才會追蹤並發獎。同時最多 ${MAX_ACTIVE} 個。</p>`;
  html += `<div class="section-title">進行中 ${active.length}/${MAX_ACTIVE}</div>`;
  if(!active.length) html += '<p class="base" style="color:var(--dim)">還沒接委託，往下挑一個。</p>';
  for(const b of active){ const i = G.bounties.indexOf(b);
    html += `<div class="item-row"><span class="in">🎯 ${bountyText(b)}</span><span class="is">${rewardText(b.reward)}　<span style="color:var(--red);cursor:pointer" onclick="abandonBounty(${i})">放棄</span></span></div>`;
  }
  html += '<div class="section-title">可接委託</div><div class="item-list">';
  for(const b of offers){ const i = G.bounties.indexOf(b);
    html += `<div class="item-row" onclick="acceptBounty(${i})"><span class="in">📌 ${bountyText(b)}</span><span class="is">${rewardText(b.reward)}　<span style="color:var(--gold)">接下 ›</span></span></div>`;
  }
  html += '</div><button class="btn" style="margin-top:12px" onclick="closeSheet()">關閉</button>';
  openSheet(html);
}

function backToCamp(){ renderCamp(); showScreen('s-camp'); }

