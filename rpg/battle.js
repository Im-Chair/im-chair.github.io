'use strict';
// ============ battle.js — 戰鬥：敵人生成/回合流程/技能結算/狀態效果/戰利品 ============

function applyCycPrefix(e){
  const c = (R&&R.cycle)||0;
  if(c<=0) return e;
  if(Math.random() < 0.35 + c*0.1){
    const p = pick(CYC_PREFIX);
    p.mod(e, c);
    e.n = p.n + e.n;
  }
  return e;
}

function makeEnemy(floor, elite){
  const ri = realmIdx(floor);
  const pool = floor > 50
    ? Object.entries(ENEMIES)
    : Object.entries(ENEMIES).filter(([k,e])=>e.realm===ri);
  const [key, t] = pick(pool);
  const m = scaleMult(floor) * (elite?1.6:1);
  const e = {key, n:(elite?'精英・':'')+t.n, i:t.i, hp:Math.round(t.hp*m), maxhp:Math.round(t.hp*m),
    pat:t.pat, pi:0, block:0, st:{}, mult:m/(elite?1.6:1)*(elite?1.3:1), elite:elite?1:0, boss:false};
  return elite ? applyCycPrefix(e) : ((R&&R.cycle>=2) ? applyCycPrefix(e) : e);
}

function makeRealmElite(floor){
  const t = REALM_ELITES[realmIdx(floor)];
  const m = scaleMult(floor);
  const e = {key:t.key, n:'精英・'+t.n, i:t.i, hp:Math.round(t.hp*m), maxhp:Math.round(t.hp*m),
    pat:t.pat, pi:0, block:0, st:{}, mult:m, elite:1, boss:false};
  return applyCycPrefix(e);
}

function enemyMove(e){ return e.pat[e.pi % e.pat.length]; }

function bossFor(floor){
  if(floor % 50 === 0) return FINAL_BOSS;
  if(floor % 10 === 0) return LORD_BOSSES[((floor/10 - 1) % 4 + 4) % 4] || LORD_BOSSES[(floor/10-1)%4];
  return MINI_BOSSES[(Math.floor(floor/10)) % 5];
}

function makeBoss(floor){
  if(floor % 50 === 0){
    const m = scaleMult(floor)*0.9;
    const hp = Math.round(185*m);
    return {key:'final', n:FINAL_BOSS.n, i:FINAL_BOSS.i, hp, maxhp:hp,
      pat:FINAL_BOSS.pat, pat2:FINAL_BOSS.pat2, p2:false, pi:0, block:0, st:{},
      mult:m, elite:2, boss:true, final:true, intro:FINAL_BOSS.intro};
  }
  if(floor % 10 === 0){
    const idx = ((floor/10 - 1) % 4 + 4) % 4; // 10,20,30,40 -> 0..3; 60,70.. 輪迴循環
    const b = LORD_BOSSES[idx];
    const m = scaleMult(floor)*1.0;
    return {key:b.key, n:b.n, i:b.i, hp:Math.round(b.hp*m), maxhp:Math.round(b.hp*m),
      pat:b.pat, pi:0, block:0, st:{}, mult:m, elite:2, boss:true, intro:b.intro};
  }
  const b = MINI_BOSSES[(Math.floor(floor/10)) % 5];
  const m = scaleMult(floor)*1.0;
  return {key:b.key, n:b.n, i:b.i, hp:Math.round(b.hp*m), maxhp:Math.round(b.hp*m),
    pat:b.pat, pi:0, block:0, st:{}, mult:m, elite:2, boss:true, intro:b.intro};
}

function intentText(e){
  const mv = enemyMove(e);
  const rageMul = (B && B.turn >= 8) ? 1 + (B.turn - 7) * 0.15 : 1;
  const weakMul = e.st.weak ? 0.75 : 1;
  const v = mv.v ? Math.round(mv.v * e.mult * rageMul * (e.dmgMul||1) * weakMul) : 0;
  const wm = e.st.weak && mv.v ? '↓' : '';
  switch(mv.t){
    case 'a': return ['🗡️', (mv.nm||'攻擊')+' '+v+wm];
    case 'h': return ['💥', (mv.nm||'重擊')+' '+v+wm];
    case 'm': return ['🌀', (mv.nm||'連擊')+' '+v+wm+'×'+mv.x];
    case 'd': return ['🛡️', '防禦 '+v];
    case 'c': return ['🌫️', mv.nm||'詛咒'];
    case 'v': return ['🩸', (mv.nm||'吸血')+' '+v+wm];
    case 's': return ['🪙', (mv.nm||'偷竊')+' '+v+wm];
    case 'g': return ['⏳', mv.nm||'蓄力'];
  }
  return ['❔','？'];
}

function startBattle(enemies, opt){
  if(!Array.isArray(enemies)) enemies = [enemies];
  R.phase='battle';
  B = {es:enemies, ti:0, energy:3, maxEnergy:3, block:0, st:{}, turn:1, nextCrit:0,
       over:false, sparkN:0, rageWarned:false,
       boss:enemies.some(e=>e.boss), elite:Math.max(...enemies.map(e=>e.elite||0)), duo:enemies.length>1};
  if(sumAffix('ener')>0) B.energy++;
  if(R.execEnergy){ B.energy += R.execEnergy; R.execEnergy = 0; }
  if(R.pendingStatus){ B.st = Object.assign({}, R.pendingStatus); R.pendingStatus = null; }
  if(opt && opt.ambush){ B.energy = Math.max(1, B.energy-1); }
  $('p-name').textContent = CLASSES[G.cls].icon+' '+CLASSES[G.cls].name;
  $('log').innerHTML='';
  const e0 = enemies[0];
  if(e0.boss && e0.intro) log(e0.intro,'sys');
  else if(B.duo) log('遭遇了 '+enemies.map(e=>e.n).join(' 與 ')+'——先殺哪隻？','sys');
  else log('遭遇了 '+e0.n+'。','sys');
  if(opt && opt.ambush) log('你被偷襲了！第一回合能量 -1。','sys');
  if(Object.keys(B.st).length) log('異常狀態纏著你進入了戰鬥。','sys');
  startPlayerTurn(true);
  save();
  showScreen('s-battle');
}

function tgt(){ return B.es[B.ti]; }

function aliveEs(){ return B.es.filter(e=>e.hp>0); }

function selectTarget(i){ if(B && !B.over && B.es[i] && B.es[i].hp>0){ B.ti = i; renderBattle(); } }

function ensureTarget(){ if(tgt().hp<=0){ const i = B.es.findIndex(e=>e.hp>0); if(i>=0) B.ti = i; } }

function log(txt, cls){
  const l = $('log');
  l.insertAdjacentHTML('beforeend', `<div class="l-${cls||''}">${txt}</div>`);
  l.scrollTop = l.scrollHeight;
}

function floatDmg(zone, txt, cls){
  const z = $(zone); if(!z) return;
  const d = document.createElement('div');
  d.className = 'float-dmg '+(cls||''); d.textContent = txt;
  z.appendChild(d); setTimeout(()=>d.remove(), 800);
}

function startPlayerTurn(first){
  if(B.over) return;
  if(!first){ B.energy = B.maxEnergy; if(!sumAffix('wall')) B.block = 0; }
  B.sparkN = 0;
  const plate = sumAffix('plate');
  if(plate){ B.block += plate; }
  const rg = sumAffix('regen');
  if(rg && !first){ const h = healPlayer(3); if(h>0) log(`血甲：回復 ${h} 生命。`,'heal'); }
  if(B.st.poison){ const d = B.st.poison; damagePlayer(d, '中毒');
    log(`中毒發作，你受到 ${d} 點傷害。`,'dmg'); floatDmg('player-zone','-'+d,''); B.st.poison = Math.floor(B.st.poison*0.7); if(!B.st.poison) delete B.st.poison;
    if(R.hp<=0){ playerDie(); return; } }
  if(B.st.stunImm){ B.st.stunImm--; if(!B.st.stunImm) delete B.st.stunImm; }
  if(B.st.stun){ B.st.stun--;
    if(!B.st.stun){ delete B.st.stun; B.st.stunImm = 2; }
    log('你被暈眩了，這回合無法行動。','sys'); renderBattle(); setTimeout(()=>enemyTurn(), 900); return; }
  renderBattle();
}

function renderBattle(){
  $('b-floor').textContent = R.floor;
  $('b-gold').textContent = R.gold;
  ensureTarget();
  const zone = $('enemy-zone');
  let html = `<div class="e-wrap${B.duo?' duo':''}">`;
  B.es.forEach((e,i)=>{
    const dead = e.hp<=0;
    const [ii,it] = dead? ['💀','已倒下'] : intentText(e);
    html += `<div class="e-block${(B.duo&&i===B.ti&&!dead)?' sel':''}${dead?' dead':''}" id="ez-${i}" onclick="selectTarget(${i})">
      <div class="enemy-icon" id="eicon-${i}">${e.i}</div>
      <div class="enemy-name">${e.boss?`<span class="boss">☠ ${e.n}</span>`: e.elite?`<span class="elite">${e.n}</span>`: e.n}</div>
      <div><span class="intent"><span class="ii">${ii}</span>${dead?it:'下一步：'+it}</span></div>
      <div class="hpbar"><div class="fill" style="width:${Math.max(0,e.hp/e.maxhp*100)}%"></div>
        <div class="txt">${Math.max(0,e.hp)} / ${e.maxhp}${e.block?`（🛡${e.block}）`:''}</div></div>
      <div class="status-row">${statusHtml(e.st, 0)}</div>
    </div>`;
  });
  html += '</div>';
  zone.innerHTML = html;
  const mhp = playerMaxHp();
  $('p-hpfill').style.width = Math.max(0, R.hp/mhp*100)+'%';
  $('p-hptxt').textContent = `${R.hp} / ${mhp}`;
  $('p-status').innerHTML = statusHtml(B.st, 0);
  const bb = $('p-block');
  if(B.block>0){ bb.style.display='inline-block'; bb.textContent = '🛡 '+B.block; } else bb.style.display='none';
  const en = $('p-energy'); en.innerHTML = '';
  for(let i=0;i<Math.max(B.maxEnergy, B.energy);i++){
    en.insertAdjacentHTML('beforeend', `<span class="pip${i<B.energy?' on':''}"></span>`);
  }
  const grid = $('skill-grid'); grid.innerHTML='';
  for(const sid of CLASSES[G.cls].skills){
    const sk = SK(sid);
    const b = document.createElement('button'); b.className = 'skill-btn';
    b.disabled = B.energy < sk.c || B.over;
    b.innerHTML = `<div class="sn">${sk.n}${(R.skillUps&&R.skillUps[sid])?'⁺':''}</div><div class="sd">${skillDesc(sid)}</div><span class="sc">◆${sk.c}</span>`;
    b.onclick = ()=>useSkill(sid);
    grid.appendChild(b);
  }
  $('btn-end').disabled = B.over;
}

function SK(sid){
  const base = SKILLS[sid];
  const up = R && R.skillUps && R.skillUps[sid];
  if(!up) return base;
  const u = SKILL_UPS[sid][up];
  const sk = {n:u.n, c:base.c, d:u.d, f:JSON.parse(JSON.stringify(base.f))};
  u.mod(sk.f, sk);
  return sk;
}

function skillDesc(sid){
  const sk = SK(sid), f = sk.f;
  const vulnMark = (B && tgt().st.vuln) ? '▲' : '';
  if(f.dmg){ const d = calcPlayerDmg(f.dmg, true);
    return sk.d.replace(/\d+ 點傷害/, d+vulnMark+' 點傷害'); }
  if(f.poisonDmg){ const stacks = (B&&tgt().st.poison)||0; const d = stacks? calcPlayerDmg(stacks*f.poisonDmg, true): calcPlayerDmg(5,true);
    return `造成 ${d} 點傷害（中毒層數×${f.poisonDmg}）`; }
  return sk.d;
}

function statusHtml(st, block){
  const M = {poison:['☠️ 中毒','bad'],burn:['🔥 燃燒','bad'],weak:['💤 虛弱','bad'],vuln:['🎯 易傷','bad'],stun:['💫 暈眩','bad'],stunImm:['🛡💫 暈眩抵抗','blk'],wound:['🩹 重傷','bad'],rage:['😡 狂怒','bad']};
  let h = '';
  for(const [k,v] of Object.entries(st)) if(v>0 && M[k]) h += `<span class="st ${M[k][1]}">${M[k][0]} ${v}</span>`;
  if(block>0) h += `<span class="st blk">🛡 ${block}</span>`;
  return h;
}

function damagePlayer(d, src){
  if(d <= 0) return 0;
  if(hasCurse('frail')) d = Math.round(d*1.15);
  if(src && R) R.lastHit = {src, d, hpBefore:R.hp};
  if(R.hp - d <= 0 && B && !B.gutsUsed && sumAffix('guts')){
    B.gutsUsed = true;
    R.hp = 1;
    log('不屈——你在致死的一擊下站住了，剩 1 點生命。','sys');
    floatDmg('player-zone','不屈!','crit');
    return d;
  }
  R.hp = Math.max(0, R.hp - d);
  return d;
}

function healPlayer(amount){
  let h = Math.floor(amount * healMult());
  if(B && B.st.wound) h = Math.floor(h/2);
  const real = Math.min(h, playerMaxHp() - R.hp);
  if(real > 0) R.hp += real;
  return real;
}

function calcPlayerDmg(base, preview){
  let d = base + playerAtk();
  if(sumAffix('fury')) d = Math.round(d*1.4);
  if(B && B.potRage) d = Math.round(d*1.5);
  if(B && B.st.weak) d = Math.round(d*0.75);
  if(B && tgt().st.vuln) d = Math.round(d*1.5);
  return Math.max(1, Math.round(d));
}

function scaleDot(ap, rate){
  const out = Object.assign({}, ap);
  const bonus = Math.floor(playerAtk() * rate);
  if(out.poison) out.poison += bonus;
  if(out.burn) out.burn += bonus;
  return out;
}

function useSkill(sid){
  if(B.over) return;
  const sk = SK(sid), f = sk.f;
  if(B.energy < sk.c) return;
  B.energy -= sk.c;
  if(f.block){ B.block += f.block; log(`${sk.n}：獲得 ${f.block} 格擋。`); }
  if(f.thornHit){ const e = tgt(); e.hp -= f.thornHit; log(`${sk.n}：反刺 ${f.thornHit} 傷害。`,'dmg'); }
  if(f.heal){ const h = healPlayer(f.heal);
    log(`${sk.n}：回復 ${h} 血${B.st.wound?'（重傷減半）':''}。`,'heal'); floatDmg('player-zone','+'+h,'heal'); }
  if(f.nextCrit){ B.nextCrit = Math.max(B.nextCrit, f.nextCrit===true?1:f.nextCrit); }
  let dmg = 0;
  if(f.dmg) dmg = f.dmg;
  if(f.poisonDmg){ const st = tgt().st.poison||0; dmg = st? st*f.poisonDmg : 5; }
  if(dmg > 0) dealToEnemy(dmg, sk, f);
  else if(f.apply) applyStatus(tgt().st, scaleDot(f.apply, 0.6), tgt().n);
  if(aliveEs().length===0){ winBattle(); return; }
  renderBattle();
}

function applyStatus(target, ap, name){
  for(const [k,v] of Object.entries(ap)){
    if(k==='stun' && target.stunImm){ log('暈眩被抵抗了！','sys'); continue; }
    target[k] = Math.min(99, (target[k]||0) + v);
  }
  const names = {poison:'中毒',burn:'燃燒',weak:'虛弱',vuln:'易傷',stun:'暈眩',wound:'重傷'};
  log((name?name+'：':'')+Object.entries(ap).filter(([k])=>!(k==='stun'&&target.stunImm)).map(([k,v])=>`${names[k]} +${v}`).join('、'));
}

function dealToEnemy(base, sk, f){
  const e = tgt();
  const zone = 'ez-'+B.ti;
  let d = calcPlayerDmg(base);
  if(sumAffix('exem') && e.hp <= e.maxhp*0.3) d = Math.round(d*1.5);
  let crit = false;
  if(B.nextCrit>0 || Math.random()*100 < playerCrit()){ d = Math.round(d*(sumAffix('luck7')?2.1:1.6)); crit = true;
    if(B.nextCrit>0) B.nextCrit--;
    if(sumAffix('spark') && B.sparkN < 2){ B.energy++; B.sparkN++; log('燧心：爆擊回復 1 能量。','sys'); } }
  /* 蝕魂：傷害轉中毒（以毒為源的攻擊不轉換，防止複利循環） */
  if(sumAffix('vform') && !(f && f.poisonDmg)){
    const stacks = Math.max(1, Math.ceil(d*0.6));
    applyStatus(e.st, {poison:stacks});
    floatDmg(zone, '☠'+stacks, crit?'crit':'');
    log(`${sk.n} 化作 ${stacks} 層蝕魂之毒${crit?'（爆擊！）':''}。`,'dmg');
    if(f && f.apply) applyStatus(e.st, scaleDot(f.apply, 0.6));
    return;
  }
  let absorbed = 0;
  if(e.block > 0){ absorbed = Math.min(e.block, d); e.block -= absorbed; d -= absorbed; }
  e.hp -= d;
  const ic = $('eicon-'+B.ti);
  if(ic){ ic.classList.remove('hit'); void ic.offsetWidth; ic.classList.add('hit'); }
  floatDmg(zone, crit? d+'!':'-'+d, crit?'crit': d===0?'blocked':'');
  log(`${sk.n} 對 ${e.n} 造成 ${d} 傷害${crit?'（爆擊！）':''}${absorbed?`（${absorbed} 被格擋）`:''}。`,'dmg');
  if(d>0 && e.thorns){ damagePlayer(e.thorns, '荊棘反噬'); floatDmg('player-zone','-'+e.thorns,'');
    log(`荊棘反噬 ${e.thorns} 傷害。`,'dmg'); if(R.hp<=0){ playerDie(); return; } }
  if(d>0){
    const vamp = cappedStat('vamp', sumAffix('vamp')) + (f && f.drain? f.drain*100:0);
    if(vamp>0){ const real = healPlayer(Math.max(1, Math.round(d*vamp/100)));
      if(real>0) log(`吸血回復 ${real}${B.st.wound?'（重傷減半）':''}。`,'heal'); }
    const pt = sumAffix('ptouch'); if(pt) applyStatus(e.st, {poison:pt + Math.floor(playerAtk()*0.12)});
    const bt = sumAffix('btouch'); if(bt) applyStatus(e.st, {burn:bt + Math.floor(playerAtk()*0.12)});
  }
  if(f && f.apply) applyStatus(e.st, scaleDot(f.apply, 0.6));
  if(e.hp<=0) onEnemySlain(e);
  if(e.hp<=0 && f && f.execKill){ R.execEnergy = (f.execEnergy||2); const h=healPlayer(f.execHeal||6);
    log('處決成功！下場戰鬥 +'+(f.execEnergy||2)+' 能量，回復 '+h+' 血。','sys'); }
  if(e.hp<=0 && B.duo) log(e.n+' 倒下了。','sys');
}

function onEnemySlain(e){
  if(e._slain) return; e._slain = true;
  if(sumAffix('feast')){ const h = healPlayer(Math.round(playerMaxHp()*0.15));
    if(h>0){ log(`貪食：吞噬殘渣，回復 ${h} 生命。`,'heal'); floatDmg('player-zone','+'+h,'heal'); } }
}

function endTurn(){
  if(B.over) return;
  for(const e of aliveEs()) tickBurn(e, 'ez-'+B.es.indexOf(e), e.n);
  if(aliveEs().length===0){ winBattle(); return; }
  enemyTurn();
}

function tickBurn(who, zone, name){
  if(who.st && who.st.burn){
    const d = who.st.burn;
    if(who.maxhp !== undefined){ who.hp -= d; } else { damagePlayer(d, '燃燒'); }
    log(`${name}受到 ${d} 點燃燒傷害。`,'dmg');
    floatDmg(zone, '-'+d, '');
    who.st.burn = Math.floor(who.st.burn/2);
    if(!who.st.burn) delete who.st.burn;
  }
}

function enemyTurn(){
  setTimeout(()=>{
    let rageMul = 1;
    if(B.turn >= 8){
      rageMul = 1 + (B.turn - 7) * 0.15;
      if(!B.rageWarned){ B.rageWarned = true; log('深淵不耐煩了——敵人陷入狂怒，傷害開始遞增！','sys'); }
    }
    for(const e of B.es){
      if(e.hp<=0) continue;
      if(B.turn >= 8) e.st.rage = B.turn - 7;
      if(e.st.poison){ const d = e.st.poison; e.hp -= d;
        log(`${e.n} 中毒受到 ${d} 傷害。`,'dmg'); floatDmg('ez-'+B.es.indexOf(e),'-'+d,'');
        if(sumAffix('symbio')){ const h = healPlayer(Math.ceil(d*0.5));
          if(h>0){ log(`腐生：回復 ${h} 生命。`,'heal'); } }
        e.st.poison = Math.floor(e.st.poison*0.7); if(!e.st.poison) delete e.st.poison;
        if(e.hp<=0){ log(e.n+' 被毒殺了。','sys'); onEnemySlain(e); continue; } }
      if(e.st.stunImm){ e.st.stunImm--; if(!e.st.stunImm) delete e.st.stunImm; }
      if(e.st.stun){ e.st.stun--;
        if(!e.st.stun){ delete e.st.stun; e.st.stunImm = 2; }
        log(`${e.n} 暈眩中，跳過行動。`,'sys'); continue; }
      if(e.pat2 && !e.p2 && e.hp <= e.maxhp/2){
        e.pat = e.pat2; e.pi = 0; e.p2 = true; e.block = 0;
        log(FINAL_BOSS.intro2,'sys');
      }
      if(e.autoblock){ e.block += e.autoblock; }
      const mv = enemyMove(e);
      e.pi++;
      const val = mv.v ? Math.round(mv.v * e.mult * rageMul * (e.dmgMul||1)) : 0;
      const weakMul = e.st.weak ? 0.75 : 1;
      switch(mv.t){
        case 'a': case 'h': case 'v': case 's': case 'm': {
          const times = mv.x || 1;
          let totalDealt = 0;
          for(let i=0;i<times;i++){
            if(R.hp<=0) break;
            let d = Math.round(val*weakMul);
            if(B.st.vuln) d = Math.round(d*1.5);
            if(Math.random()*100 < (hasCurse('heavy2')?0:cappedStat('agile', sumAffix('agile')))){ log('你閃過了'+e.n+'的攻擊。','sys'); floatDmg('player-zone','閃避','blocked'); continue; }
            let absorbed = 0;
            if(B.block>0){ absorbed = Math.min(B.block, d); B.block -= absorbed; d -= absorbed; }
            if(d>0){ damagePlayer(d, `${e.n}的${mv.nm||'攻擊'}`); totalDealt += d;
              floatDmg('player-zone','-'+d,''); }
            else floatDmg('player-zone','格擋','blocked');
            log(`${e.n} ${mv.nm||'攻擊'}造成 ${d} 傷害${absorbed?`（${absorbed} 被格擋）`:''}。`,'dmg');
            const th = sumAffix('thorn');
            if(th && ['a','h','m','v'].includes(mv.t)){ e.hp -= th; log(`荊棘反彈 ${th} 傷害。`,'dmg'); }
            if(mv.t==='v' && d>0){ const h = Math.min(Math.round(d*0.5), e.maxhp - e.hp); if(h>0){ e.hp += h; log(`${e.n} 吸取了 ${h} 生命。`,'heal'); } }
            if(e.evamp && d>0 && mv.t!=='v'){ const h = Math.min(Math.round(d*e.evamp), e.maxhp - e.hp); if(h>0){ e.hp += h; log(`${e.n} 汲取了 ${h} 生命。`,'heal'); } }
            if(mv.t==='s' && d>0){ const steal = Math.min(R.gold, 10 + R.floor*2); R.gold -= steal; if(steal) log(`${e.n} 偷走了 ${steal} 碎銀！`,'sys'); }
          }
          if(mv.ap && totalDealt>0) applyStatus(B.st, mv.ap, null);
          break;
        }
        case 'd': e.block += val; log(`${e.n} 進入防禦（+${val} 格擋）。`); break;
        case 'c': applyStatus(B.st, mv.ap, e.n); break;
        case 'g': log(`${e.n} 正在${mv.nm||'蓄力'}——下一擊會很痛。`,'sys'); break;
      }
      if(R.hp<=0){ playerDie(); return; }
    }
    if(aliveEs().length===0){ winBattle(); return; }
    afterEnemyAct();
  }, 500);
}

function afterEnemyAct(){
  tickBurn({st:B.st}, 'player-zone', '你');
  if(R.hp<=0){ playerDie(); return; }
  for(const k of ['weak','vuln','wound']){
    if(B.st[k]){ B.st[k]--; if(!B.st[k]) delete B.st[k]; }
    for(const e of B.es){ if(e.st[k]){ e.st[k]--; if(!e.st[k]) delete e.st[k]; } }
  }
  B.turn++;
  startPlayerTurn();
  save();
}

function winBattle(){
  if(B.over) return; B.over = true;
  R.kills += B.es.length;
  if(B.boss) G.rec.boss++;
  let firstKillBonus = 0;
  for(const e of B.es){
    const key = e.key || 'unknown';
    if(!G.codex[key]){ G.codex[key] = 0; firstKillBonus += 30; }
    G.codex[key]++;
  }
  if(firstKillBonus){ R.gold += firstKillBonus; toast('圖鑑首錄 +'+firstKillBonus+'🪙'); }
  const mend = sumAffix('mend');
  if(mend){ const h = Math.min(mend, playerMaxHp()-R.hp); if(h>0) R.hp += h; }
  if(R.quench && R.quench.battles>0){ R.quench.battles--; }
  let gold = Math.round((8 + R.floor*2.4 + rnd(0,6)) * (B.boss?4 : B.elite?2 : 1) * (B.duo?1.6:1) * (1 + (R.cycle||0)*0.2));
  gold = Math.round(gold * (1 + sumAffix('greed')/100));
  R.gold += gold;
  const drops = [];
  const dropChance = (B.boss||B.elite||B.duo)?1 : 0.55;
  if(Math.random() < dropChance){
    const bonus = B.boss?2 : (B.elite||B.duo)?1 : 0;
    let it = makeItem(R.floor, bonus);
    if(B.boss && it.rar < 2){ it = makeItem(R.floor, 2); it.rar = Math.max(2, it.rar); }
    drops.push(it); R.bag.push(it);
  }
  if((B.boss || B.duo) && Math.random()<0.5){ const it2 = makeItem(R.floor, 1); drops.push(it2); R.bag.push(it2); }
  if(B.es.some(e=>e.final)){
    let it3 = makeItem(R.floor, 2); let tries = 0;
    while(it3.rar < 3 && tries++ < 30) it3 = makeItem(R.floor, 2);
    if(it3.rar < 3){ it3.rar = 3; const lp = LEG_KEYS.filter(k=>AFFIXES[k].slots.includes(it3.slot));
      if(lp.length) it3.affixes.unshift({k:pick(lp), v:1}); }
    drops.push(it3); R.bag.push(it3);
  }
  let matDrop = null;
  if(R.cycle > 0 && R.floor >= 11){
    const chance = (0.16 + (B.elite?0.10:0) + (B.boss?0.20:0)) * (1 + (R.cycle-1)*0.35);
    if(Math.random() < chance){
      matDrop = R.floor <= 30 ? 'iron' : 'steel';
      G.mats[matDrop] = (G.mats[matDrop]||0) + 1;
    }
  }
  let potionDrop = null, potionOverflow = 0;
  if(Math.random() < (B.boss?0.8:0.22)){
    const k = pick(potionPool());
    if(potAdd(k)) potionDrop = k;
    else { potionOverflow = 12 + Math.round(R.floor*0.8); R.gold += potionOverflow; }
  }
  const isFinal = B.es.some(e=>e.final);
  if(isFinal){ G.rec.clear = (G.rec.clear||0) + 1; }
  if(B.boss){
    if(R.cycle === 0 && R.floor % 5 === 0) G.orig.cp = Math.max(G.orig.cp, Math.min(R.floor, 45));
    if(R.cycle > 0 && R.floor % 10 === 0){ const c = cd(R.cycle); c.cp = Math.max(c.cp, R.floor); }
  }
  if(R.cycle === 0 && R.floor === 50 && B.boss){ R.origDone = true; G.orig.done = true; }
  setTimeout(()=>{
    showLoot(drops, gold, B.boss?'👑':'⚔️', isFinal?'你打穿了深淵的心臟':(B.boss?'首領倒下了':'戰鬥勝利'),
      `獲得 ${gold} 碎銀` + (potionDrop? `，撿到 ${POTIONS[potionDrop].i}${POTIONS[potionDrop].n}`:'') + (potionOverflow? `，藥水袋滿——折成 ${potionOverflow} 碎銀`:'') + (matDrop? `，拾獲 ${MATS[matDrop].i}${MATS[matDrop].n} ×1`:''), mend? `（急救回復 ${mend} 血）`:'');
  }, 600);
  save();
}

function showLoot(items, gold, icon, title, sub, extra){
  R.phase='loot';
  $('loot-icon').textContent = icon;
  $('loot-title').textContent = title;
  $('loot-sub').textContent = (sub||'') + (extra||'');
  const body = $('loot-body'); body.innerHTML = '';
  if(!items.length){
    body.innerHTML = '<p style="text-align:center;color:var(--dim);font-size:13px">這次沒有裝備掉落。</p>';
  }
  for(const it of items){
    const r = RARITIES[it.rar];
    const d = document.createElement('div'); d.className = `loot-card ${r.b}`;
    d.innerHTML = `<div class="${r.cls}" style="font-size:16px">${it.name} <span style="font-size:11px">${r.n}</span></div>
      <div style="font-size:13px;color:var(--dim);margin:4px 0">${slotName(it.slot)}｜${itemStatLine(it)}</div>
      ${affixHtml(it)}${compareHtml(it)}
      <button class="btn small primary" style="margin-top:10px" onclick="equipFromBag(${it.id});this.textContent='已裝上';this.disabled=true">立刻換上</button>`;
    body.appendChild(d);
  }
  save();
  showScreen('s-loot');
}

function equipFromBag(id, ret){
  let it = R.bag.find(x=>x.id===id) || G.stash.find(x=>x.id===id);
  if(!it) return;
  const idx = R.bag.findIndex(x=>x.id===id);
  if(idx>=0) R.bag.splice(idx,1);
  const old = G.equip[it.slot];
  if(old){ if(old.banked!==false) G.stash.push(old); else R.bag.push(old); }
  it.banked = false;
  G.equip[it.slot] = it;
  // 換裝可能改變血量上限
  R.hp = Math.min(R.hp, playerMaxHp());
  closeSheet(); save(); toast('已裝備 '+it.name);
  if(R.phase==='doors') showDoors();
  if(ret==='stats') openRunStats();
}

function afterLoot(){
  if(R.origDone){
    // 本源完結：自動保管一切
    for(const it of R.bag){ it.banked = true; G.stash.push(it); }
    for(const sl of ['w','a','t']) if(G.equip[sl]) G.equip[sl].banked = true;
    G.gold += R.gold;
    const kills = R.kills;
    R = null; B = null; save();
    $('res-icon').textContent = '🌅';
    $('res-title').textContent = '本源・完結';
    $('res-sub').textContent = '深淵之心在你身後停止了跳動。五十層的路，你走到了底——但心臟之下傳來低語：「再來一次。這次我不裝睡。」';
    $('res-body').innerHTML = `<div class="stat-grid">
      <div class="stat-box"><div class="v">50</div><div class="k">走到了底</div></div>
      <div class="stat-box"><div class="v">${kills}</div><div class="k">擊殺</div></div>
      <div class="stat-box"><div class="v">🔄</div><div class="k">輪迴已開</div></div>
    </div><p style="text-align:center;color:var(--green);font-size:13px">所有收穫已存入倉庫。輪迴在下潛選單等你。</p>`;
    showScreen('s-result');
    return;
  }
  nextFloor();
}

function usePotion(k, inBattle){
  if(!R.pots || !R.pots[k]) return;
  if(k==='heal'){ const v = potPower(k); const h = inBattle? healPlayer(v) : Math.min(v, playerMaxHp()-R.hp);
    if(!inBattle) R.hp += h;
    toast(`回復 ${h} 血`); if(inBattle){ log(`喝下治療藥水，回復 ${h} 血${B&&B.st.wound?'（重傷減半）':''}。`,'heal'); floatDmg('player-zone','+'+h,'heal'); } }
  else if(k==='energy'){ if(!inBattle) return toast('只能在戰鬥中用'); B.energy += 2; log('灌下烈酒，+2 能量。','sys'); }
  else if(k==='bomb'){ if(!inBattle) return toast('只能在戰鬥中用'); const v = potPower(k); const e = tgt(); e.hp -= v; applyStatus(e.st, {vuln:2}); log(`火油瓶對 ${e.n} 炸出 ${v} 傷害，火光中破綻畢露（易傷 2）。`,'dmg'); floatDmg('ez-'+B.ti,'-'+v,''); }
  else if(k==='purge'){ B ? (B.st = {}) : null; toast('負面狀態已清除'); if(inBattle) log('淨化藥水洗去了所有異常。','sys'); }
  else if(k==='wrath'){ if(!inBattle) return toast('只能在戰鬥中用'); B.potRage = true; log('狂暴藥劑燒進血管——本場戰鬥傷害 +50%！','sys'); }
  else if(k==='stone'){ if(!inBattle) return toast('只能在戰鬥中用'); const v = potPower(k); B.block += v; log(`石膚藥劑：+${v} 格擋。`,'sys'); }
  else if(k==='holy'){ if(!inBattle) return toast('只能在戰鬥中用'); B.st = {}; const v = potPower(k);
    for(const e of aliveEs()){ e.hp -= v; floatDmg('ez-'+B.es.indexOf(e),'-'+v,''); }
    log(`聖水潑灑——所有敵人受到 ${v} 傷害，你的異常被洗淨。`,'sys'); }
  R.pots[k]--; if(!R.pots[k]) delete R.pots[k];
  save();
  if(inBattle){
    closeSheet();
    if(aliveEs().length===0){ winBattle(); return; }
    renderBattle();
  }
}

function openBattlePotions(){
  if(!potTotal()){ toast('沒有藥水'); return; }
  let html = '<h3>道具</h3><div class="item-list" style="margin-top:10px">';
  for(const [k,n] of Object.entries(R.pots)){
    const p = POTIONS[k];
    html += `<div class="item-row" onclick="usePotion('${k}',true)"><span>${p.i} ${p.n}${n>1?' ×'+n:''}</span><span class="is">${pdesc(k)}</span></div>`;
  }
  html += '</div><button class="btn" style="margin-top:12px" onclick="closeSheet()">關閉</button>';
  openSheet(html);
}

