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

/* 供需曲線敵人生成 (§13)：身分權重 × 樓層目標值 */
const REALM_HP_MEAN = [0,0,0,0,0], REALM_DMG_MEAN = [0,0,0,0,0];
(function(){
  const hc=[0,0,0,0,0], dm=[0,0,0,0,0], dc=[0,0,0,0,0];
  for(const e of Object.values(ENEMIES)){
    REALM_HP_MEAN[e.realm]+=e.hp; hc[e.realm]++;
    for(const m of e.pat) if(m.v){ dm[e.realm]+=m.v*(m.x||1); dc[e.realm]++; }
  }
  for(let i=0;i<5;i++){ REALM_HP_MEAN[i]/=hc[i]; REALM_DMG_MEAN[i]=dm[i]/dc[i]; }
})();
function applyTag(e, tag){ // 敵人標籤 (§11)：免疫制門檻
  if(e.tag === tag) return;
  delete e.st._immP; delete e.st._immB; e.naked = false; e.shell = 0;
  e.tag = tag;
  if(!tag) return;
  if(tag==='pImm') e.st._immP = 1;
  if(tag==='bImm') e.st._immB = 1;
  if(tag==='naked') e.naked = true;
  if(tag==='heavy'){ e.shell = Math.round(e.maxhp * HEAVY_SHELL); e.block = Math.max(e.block, e.shell); }
}
function patMean(pat){ let t=0,c=0; for(const m of pat) if(m.v){ t+=m.v*(m.x||1); c++; } return c? t/c : 10; }
function makeEnemy(floor, elite){
  const ri = realmIdx(floor);
  const pool = floor > 50
    ? Object.entries(ENEMIES)
    : Object.entries(ENEMIES).filter(([k,e])=>e.realm===ri);
  const [key, t] = pick(pool);
  const cm = cycMult((R&&R.cycle)||0);
  const hp = Math.round(CURVE.mobHP(floor) * (t.hp/REALM_HP_MEAN[t.realm]) * (elite?CURVE.eliteHP:1) * cm);
  // 一般怪傷害：域內身分保留（打手打得比域均重）
  const mult = CURVE.mobDMG(floor) * (elite?1.15:1) * cm / REALM_DMG_MEAN[t.realm];
  const e = {key, n:t.n, i:t.i, svg:t.svg, hp, maxhp:hp,
    pat:t.pat, pi:0, block:0, st:{}, mult, elite:elite?1:0, boss:false};
  if(t.tag) applyTag(e, t.tag);
  return elite ? applyCycPrefix(e) : ((R&&R.cycle>=2) ? applyCycPrefix(e) : e);
}
function makeEncounter(floor, elite){ // 多敵曲線 (§11)
  const duo = floor >= CURVE.duoLock
    || (floor >= CURVE.duoStart && Math.random() < (floor - CURVE.duoStart) * CURVE.duoRate);
  if(duo) return [makeEnemy(floor, elite), makeEnemy(floor, 0)];
  return makeEnemy(floor, elite);
}
function makeBossEncounter(floor){
  const boss = makeBoss(floor);
  if(R && R.cycle > 0){
    if(floor >= 100) return [boss, makeBoss(floor)];  // 輪迴深處：雙王
    return [boss, makeEnemy(floor, 0)];               // 輪迴王戰帶隨從
  }
  return boss;
}
function makeRealmElite(floor){
  const t = REALM_ELITES[realmIdx(floor)];
  const cm = cycMult((R&&R.cycle)||0);
  const em = 100; // 域限精英基準體重
  const hp = Math.round(CURVE.mobHP(floor) * CURVE.eliteHP * (t.hp/em) * cm);
  const e = {key:t.key, n:t.n, i:t.i, svg:t.svg, hp, maxhp:hp,
    pat:t.pat, pi:0, block:0, st:{}, mult:CURVE.mobDMG(floor)*1.15*cm/patMean(t.pat), elite:1, boss:false};
  return applyCycPrefix(e);
}
function enemyMove(e){ return e.pat[e.pi % e.pat.length]; }

function bossFor(floor){
  if(floor % 50 === 0) return FINAL_BOSS;
  if(floor % 10 === 0) return LORD_BOSSES[((floor/10 - 1) % 4 + 4) % 4] || LORD_BOSSES[(floor/10-1)%4];
  return MINI_BOSSES[(Math.floor(floor/10)) % 5];
}

function makeBoss(floor){
  const cm = cycMult((R&&R.cycle)||0);
  const mk = (b, hpMult, key, extra) => {
    const hp = Math.round(CURVE.mobHP(floor) * hpMult * cm);
    return Object.assign({key, n:b.n, i:b.i, svg:b.svg, hp, maxhp:hp,
      pat:b.pat, pi:0, block:0, st:{},
      mult: CURVE.mobDMG(floor) * CURVE.bossDMG * cm / patMean(b.pat),
      elite:2, boss:true, intro:b.intro}, extra||{});
  };
  if(floor % 50 === 0){
    const e = mk(FINAL_BOSS, CURVE.finalHP, 'final', {pat2:FINAL_BOSS.pat2, p2:false, final:true});
    return e;
  }
  if(floor % 10 === 0){
    const idx = ((floor/10 - 1) % 4 + 4) % 4;
    const lord = mk(LORD_BOSSES[idx], CURVE.lordHP, LORD_BOSSES[idx].key);
    lord.phaseTags = LORD_PHASE_TAGS[idx];
    applyTag(lord, lord.phaseTags[0]);
    return lord;
  }
  const b = MINI_BOSSES[(Math.floor(floor/10)) % 5];
  return mk(b, CURVE.miniHP, b.key);
}
function intentText(e){
  const mv = enemyMove(e);
  const _ra = (B && B.rageAt) || 8;
  const rageMul = (B && B.turn >= _ra) ? 1 + (B.turn - (_ra-1)) * 0.15 : 1;
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
  const agiBonus = statTotal('agi') >= 100 ? 2 : statTotal('agi') >= 40 ? 1 : 0; // 敏捷追加行動點（點）
  const _wpts = weaponType().pts || 3;                                            // 武器每回合行動點
  B = {es:enemies, ti:0, energy:_wpts+agiBonus, maxEnergy:_wpts+agiBonus, block:0, shield:0, st:{}, turn:1, nextCrit:0,
       over:false, sparkN:0, rageWarned:false, charge:null, noHit:true,
       boss:enemies.some(e=>e.boss), elite:Math.max(...enemies.map(e=>e.elite||0)), duo:enemies.length>1};
  const _zrule = realmFor(R.floor) && realmFor(R.floor).rule;
  B.rageAt = _zrule==='rage5' ? 5 : 8;                       // 心室：狂怒提前到第 5 回合
  if(_zrule==='drain1') B.energy = Math.max(1, B.energy-1);  // 沉沒王國：首回合行動點 −1
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
  const rg = sumAffix('regen');
  if(rg && !first){ const h = healPlayer(Math.ceil(playerMaxHp()*0.06)); if(h>0) log(`血甲：回復 ${h} 生命。`,'heal'); }
  if(playerMaxMana() > 0 && !first){
    const mm = playerMaxMana();
    R.mana = Math.min(mm, (R.mana||0) + Math.round(mm * manaRegenPct()/100));
  }
  if(B.st.poison){ const d = Math.ceil(playerMaxHp() * DOT.poisonPct * B.st.poison); damagePlayer(d, '中毒');
    log(`中毒發作，你受到 ${d} 點傷害（${B.st.poison} 層）。`,'dmg'); floatDmg('player-zone','-'+d,''); B.st.poison -= 1; if(B.st.poison<=0) delete B.st.poison;
    if(R.hp<=0){ playerDie(); return; } }
  if(B.st.stunImm){ B.st.stunImm--; if(!B.st.stunImm) delete B.st.stunImm; }
  if(B.st.stun){ B.st.stun--;
    if(!B.st.stun){ delete B.st.stun; B.st.stunImm = 2; }
    log('你被暈眩了，這回合無法行動。','sys'); renderBattle(); setTimeout(()=>enemyTurn(), 900); return; }
  if(B.charge){
    const need = B.charge.cost - B.charge.paid;
    if(B.energy >= need){
      B.energy -= need;
      const sid = B.charge.sid;
      B.charge = null;
      const sk = SK(sid);
      log(`蓄力完成——【${sk.n}】釋放！`,'sys');
      castSkill(sk);
      if(B.over) return;
    } else {
      B.charge.paid += B.energy;
      B.energy = 0;
      log(`蓄力中（${fmtPts(B.charge.paid)}/${fmtPts(B.charge.cost)}）……`,'sys');
      renderBattle();
      setTimeout(()=>enemyTurn(), 900);
      return;
    }
  }
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
    html += `<div class="e-block${(B.duo&&i===B.ti&&!dead)?' sel':''}${dead?' dead':''}${!dead&&e.st.poison?' poisoned':''}${!dead&&e.st.burn?' burning':''}" id="ez-${i}" onclick="selectTarget(${i})">
      <div class="enemy-icon" id="eicon-${i}">${e.svg||e.i}</div>
      <div class="enemy-name">${e.boss?`<span class="boss">☠ ${e.n}</span>`: e.elite?`<span class="elite">${e.n}</span>`: e.n}${e.tag?` <span class="st" style="cursor:pointer" onclick="explainStatus('tag_${e.tag}')">${ENEMY_TAGS[e.tag].i}${ENEMY_TAGS[e.tag].n}</span>`:''}</div>
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
  const en = $('p-energy');
  en.innerHTML = `<span style="color:var(--gold);font-size:13px">◆ ${fmtPts(B.energy)}/${fmtPts(B.maxEnergy)} 行動</span>` +
    (playerMaxMana()>0? `<span style="color:#7fb3e8;font-size:13px">　🔮 ${R.mana||0}/${playerMaxMana()}</span>` : '') +
    (B.shield>0? `<span style="color:#9fd8ff;font-size:13px">　🔷 ${B.shield}</span>` : '');
  const grid = $('skill-grid'); grid.innerHTML='';
  for(const sid of CLASSES[G.cls].skills){
    const sk = SK(sid);
    const cost = skillCostU(sk), mc = skillManaC(sk);
    const charging = B.charge && B.charge.sid === sid;
    const noMana = mc > 0 && (R.mana||0) < mc;
    const chargeable = cost > B.maxEnergy;              // 先天超過每回合上限＝真・可蓄力（斧大招）
    const noEnergy = (cost > B.energy && !chargeable) || (chargeable && B.energy <= 0); // 點數不足不可用；可蓄招也需 >0 點才能起蓄
    const b = document.createElement('button'); b.className = 'skill-btn';
    b.disabled = B.over || !!B.charge || noMana || noEnergy;
    b.innerHTML = `<div class="sn">${sk.n}${sk.upN?'⁺':''}${charging?'（蓄力中 '+fmtPts(B.charge.paid)+'/'+fmtPts(cost)+'）':''}</div>
      <div class="sd">${skillDesc(sid)}</div>
      <span class="sc">◆${fmtPts(cost)}${mc?'｜🔮'+mc:''}${chargeable&&!B.charge?'（蓄）':''}</span>`;
    b.onclick = ()=>useSkill(sid);
    grid.appendChild(b);
  }
  $('btn-end').disabled = B.over || !!B.charge;
  // 行動點耗盡、無招可出 → 自動結束回合（蓄力中或已結束不觸發）
  if(!B.over && !B.charge && !B._autoEnding){
    const canAct = CLASSES[G.cls].skills.some(sid=>{
      const sk = SK(sid), c = skillCostU(sk), mc = skillManaC(sk);
      if(c > B.maxEnergy) return B.energy > 0;          // 斧大招：有點數就能起蓄
      return c <= B.energy && (mc===0 || (R.mana||0) >= mc);
    });
    if(!canAct){
      B._autoEnding = true;
      setTimeout(()=>{ B._autoEnding = false; if(!B.over && !B.charge) endTurn(); }, 500);
    }
  }
}

function SK(sid){
  const base = SKILLS[sid];
  const sk = Object.assign({}, base);
  const up = R && R.skillUps && R.skillUps[sid];
  if(up){ SKILL_UPS[sid][up].mod(sk); sk.upN = SKILL_UPS[sid][up].n; }
  return sk;
}
function skillCostU(sk){ // 行動點：普攻1／中2／大3（輔招吃 fixed），不再乘武器
  if(sk.fixed) return sk.fixed * (sk.costMul||1);
  return Math.max(0.5, sk.costW * (sk.costMul||1));
}
function skillManaC(sk){ return Math.round((sk.mana||0) * (sk.manaMul||1)); }
function fmtPts(p){ return p % 1 === 0 ? String(p) : p.toFixed(1); }
function skillDesc(sid){
  const sk = SK(sid);
  const vulnMark = (B && tgt() && tgt().st.vuln) ? '▲' : '';
  const parts = [];
  if(sk.mult){
    let mult = sk.mult;
    if(sk.poisonAmp && B && tgt()) mult = sk.mult * (1 + sk.poisonAmp * (tgt().st.poison||0));
    if(sk.debuffAmp && B && tgt() && !sk._solo){
      const kinds = ['weak','vuln','poison','burn'].filter(k=>tgt().st[k]).length;
      mult = sk.mult * (1 + sk.debuffAmp * Math.min(4,kinds));
    }
    const d = calcPlayerDmg(mult, sk);
    parts.push(`${sk.hits?sk.hits+'段各 ':''}${d}${vulnMark} 傷${sk.aoe&&sk.mult?'（全體）':''}`);
  }
  if(sk.blockCoef !== undefined) parts.push(`格擋 ${10 + Math.round(statTotal('vit')*sk.blockCoef)}`);
  if(sk.shieldCoef !== undefined) parts.push(`護盾 ${10 + Math.round(statTotal('int')*sk.shieldCoef)}`);
  if(sk.applyOnly){
    const nm = {poison:'毒',burn:'燃',weak:'虛弱',vuln:'易傷'};
    parts.push(Object.entries(sk.applyOnly).map(([k,v])=>`${nm[k]}${v}層`).join('+') + (sk.aoe?'（全體）':''));
  }
  if(sk.apply && sk.mult){
    const nm = {poison:'毒',burn:'燃',weak:'虛弱',vuln:'易傷'};
    parts.push('附'+Object.entries(sk.apply).map(([k,v])=>`${nm[k]}${v}`).join('、'));
  }
  if(sk.drain) parts.push(`${Math.round(sk.drain*100)}%回血`);
  if(sk.execLine) parts.push(`<${Math.round(sk.execLine*100)}%血 ×1.5`);
  return parts.join('｜') || sk.d;
}

const STATUS_INFO = {
  poison:'☠️ 中毒：每回合失去（層數 × 最大生命 1.2%），每回合層數 −1。無視防禦與格擋。',
  burn:'🔥 燃燒：每回合失去（層數 × 最大生命 2%），每回合層數減半。無視防禦與格擋。',
  weak:'💤 虛弱：造成的傷害 ×0.75。',
  vuln:'🎯 易傷：受到的傷害 ×1.5。',
  stun:'💫 暈眩：跳過整個回合。結束後獲得 2 回合暈眩抵抗。',
  stunImm:'🛡💫 暈眩抵抗：期間不會再被暈眩。',
  wound:'🩹 重傷：受到的治療效果減半。',
  rage:'😡 狂怒：造成的傷害提升。',
  block:'🛡 格擋：在防禦結算後吸收等量傷害，回合結束清零（壁壘詞綴可保留）。斧與法術剋格擋、匕首刮不動。',
  tag_pImm:'☠️🚫 毒免：毒層無法施加，這場改靠直接傷害。',
  tag_bImm:'🔥🚫 燃免：燃層無法施加。',
  tag_heavy:'🪨 重甲：常駐格擋外殼，每回合恢復。斧、法術、毒燃能繞過。',
  tag_naked:'🩸 脆弱：受到的直接傷害 +15%。',
};
function explainStatus(k){
  if(STATUS_INFO[k]) openSheet(`<h3>狀態說明</h3><p class="base">${STATUS_INFO[k]}</p>
    <button class="btn" onclick="closeSheet()">關閉</button>`);
}
function statusHtml(st, block){
  const M = {poison:['☠️ 中毒','bad'],burn:['🔥 燃燒','bad'],weak:['💤 虛弱','bad'],vuln:['🎯 易傷','bad'],stun:['💫 暈眩','bad'],stunImm:['🛡💫 暈眩抵抗','blk'],wound:['🩹 重傷','bad'],rage:['😡 狂怒','bad']};
  let h = '';
  for(const [k,v] of Object.entries(st)) if(v>0 && M[k]) h += `<span class="st ${M[k][1]}" onclick="explainStatus('${k}')">${M[k][0]} ${v}</span>`;
  if(block>0) h += `<span class="st blk" onclick="explainStatus('block')">🛡 ${block}</span>`;
  return h;
}

function damagePlayer(d, src){
  if(d <= 0) return 0;
  if(B) B.noHit = false;   // 受傷即破「不受傷」委託
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

function weaponFit(sk){   // 職業/武器不匹配時的武器攻擊力折算
  const classMagic = CLASSES[G.cls].mainStat === 'int';
  const weaponMagic = weaponType().magic;
  const skillMagic = !!(sk && sk.magic);
  if(!classMagic) return weaponMagic ? 0 : 1;   // 物攻角色拿魔攻武器(杖)→0
  if(weaponMagic) return 1;                      // 魔攻角色拿魔攻武器(杖)→正常
  return skillMagic ? 0 : 0.5;                   // 魔攻角色拿物攻武器：魔法技能0、普攻50%
}
function calcPlayerDmg(mult, sk){
  // 唯一公式 (§6)：(武器攻擊×合手 ＋ 主素質) × 武器係數 × 招式倍率
  const w = G.equip.w;
  const wAtk = Math.round((w ? w.base + w.up : 3) * weaponFit(sk));
  let d = (wAtk + mainStat()) * weaponType().coef * mult;
  if(sumAffix('fury')) d = Math.round(d*1.4);
  if(B && B.potRage) d = Math.round(d*1.5);
  if(B && B.st.weak) d = Math.round(d*0.75);
  if(B && tgt().st.vuln) d = Math.round(d*1.5);
  return Math.max(1, Math.round(d));
}

function useSkill(sid){
  if(B.over || B.charge) return;
  const sk = SK(sid);
  const cost = skillCostU(sk), mc = skillManaC(sk);
  if(mc > 0 && (R.mana||0) < mc){ toast('法力不足'); return; }
  if(cost > B.maxEnergy){
    // 蓄力制 (§6)：僅限先天費用超過每回合上限的招（斧大招）；一般「點數不足」不給蓄
    if(cost > B.energy){
      if(mc > 0) R.mana -= mc; // 法力先付
      B.charge = {sid, paid:B.energy, cost};
      B.energy = 0;
      log(`開始蓄力【${sk.n}】——本回合剩餘行動全數投入（${fmtPts(B.charge.paid)}/${fmtPts(cost)}）。`,'sys');
      renderBattle();
      setTimeout(()=>enemyTurn(), 700);
      return;
    }
  } else if(cost > B.energy){
    toast('行動點不足'); return;
  }
  B.energy -= cost;
  if(mc > 0) R.mana -= mc;
  castSkill(sk);
}
function castSkill(sk){
  /* 輔助類 */
  if(sk.blockCoef !== undefined){
    const v = 10 + Math.round(statTotal('vit') * sk.blockCoef);
    B.block += v; B.spike = sk.spike || 0;
    log(`${sk.n}：獲得 ${v} 格擋。`);
  }
  if(sk.shieldCoef !== undefined){
    const v = 10 + Math.round(statTotal('int') * sk.shieldCoef);
    B.shield += v; B.reflect = Math.max(B.reflect||0, sk.reflect||0);
    log(`${sk.n}：獲得 ${v} 護盾。`,'sys');
  }
  if(sk.applyOnly){
    const targets = sk.aoe ? aliveEs() : [tgt()];
    for(const e of targets) applyStatus(e.st, sk.applyOnly, sk.n + (sk.aoe?'（'+e.n+'）':''));
  }
  /* 攻擊類 */
  if(sk.mult){
    if(sk.aoe){
      // 災厄：多體逐個結算；單體切強化模式
      const targets = aliveEs();
      if(targets.length === 1 && sk.debuffAmp){
        const solo = Object.assign({}, sk, {mult:1.8, _solo:true});
        dealToEnemy(1.8, solo, solo);
        if(aliveEs().length) applyStatus(tgt().st, {weak:2, vuln:2, poison:2}, sk.n+'・鋪滿');
      } else {
        const ti0 = B.ti;
        for(const e of targets){
          if(e.hp <= 0) continue;
          B.ti = B.es.indexOf(e);
          let mult = sk.mult;
          if(sk.debuffAmp){
            const kinds = ['weak','vuln','poison','burn'].filter(k=>e.st[k]).length;
            mult = sk.mult * (1 + sk.debuffAmp * Math.min(4, kinds));
          }
          dealToEnemy(mult, sk, sk);
        }
        B.ti = aliveEs().includes(B.es[ti0]) ? ti0 : (B.es.indexOf(aliveEs()[0]) >= 0 ? B.es.indexOf(aliveEs()[0]||B.es[0]) : 0);
      }
    } else {
      const hits = sk.hits || 1;
      for(let i=0; i<hits; i++){
        if(!aliveEs().length) break;
        if(tgt().hp <= 0) ensureTarget();
        let mult = sk.mult;
        if(sk.poisonAmp) mult = sk.mult * (1 + sk.poisonAmp * Math.min(DOT.stackCap, tgt().st.poison||0));
        dealToEnemy(mult, sk, sk);
      }
    }
  }
  if(aliveEs().length===0){ winBattle(); return; }
  renderBattle();
}

function applyStatus(target, ap, name){
  for(const [k,v] of Object.entries(ap)){
    if(k==='stun' && target.stunImm){ log('暈眩被抵抗了！','sys'); continue; }
    if(k==='poison' && target._immP){ log('☠️🚫 毒免——毒層無法施加。','sys'); continue; }
    if(k==='burn' && target._immB){ log('🔥🚫 燃免——燃層無法施加。','sys'); continue; }
    const cap = (k==='poison'||k==='burn') ? DOT.stackCap : 99;
    target[k] = Math.min(cap, (target[k]||0) + v);
  }
  const names = {poison:'中毒',burn:'燃燒',weak:'虛弱',vuln:'易傷',stun:'暈眩',wound:'重傷'};
  log((name?name+'：':'')+Object.entries(ap).filter(([k])=>!(k==='stun'&&target.stunImm)).map(([k,v])=>`${names[k]} +${v}`).join('、'));
}

function dealToEnemy(mult, sk, f){
  const e = tgt();
  const zone = 'ez-'+B.ti;
  // 無光教區：敵人閃避（首領除外）
  if(!e.boss && realmFor(R.floor) && realmFor(R.floor).rule==='dodge12' && Math.random()<0.12){
    floatDmg(zone, '閃避', 'blocked'); log(`${e.n} 閃過了你的攻擊。`,'sys');
    return;
  }
  let d = calcPlayerDmg(mult, f);
  if(sumAffix('exem') && e.hp <= e.maxhp*0.3) d = Math.round(d*1.5);
  if(f && f.execLine && e.hp <= e.maxhp*f.execLine) d = Math.round(d*1.5);
  if(chemOn('corrode') && e.st.poison && e.st.burn) d = Math.round(d*1.2); // 腐燃
  if(e.naked) d = Math.round(d*1.15); // 裸皮
  if(f && f.magic && weaponType().spellAmp) d = Math.round(d * (1 + weaponType().spellAmp)); // 杖·法術增傷
  let crit = false;
  if(B.nextCrit>0 || Math.random()*100 < playerCrit() + (weaponType().critRate||0)){
    let cm = sumAffix('luck7') ? 2.1 : 1.6;
    if(f && f.critBonus) cm += f.critBonus;
    d = Math.round(d*cm); crit = true;
    if(B.nextCrit>0) B.nextCrit--;
    if(sumAffix('spark') && B.sparkN < 1){ B.energy = Math.min(B.maxEnergy, B.energy+1); B.sparkN++; log('燧心：爆擊回復 1 行動點。','sys'); } }
  /* 蝕魂：攻擊轉中毒，每擊 2 層，受 10 層上限結構性封頂 */
  if(sumAffix('vform') && !(f && f.poisonAmp)){
    applyStatus(e.st, {poison:2});
    floatDmg(zone, '☠2', crit?'crit':'');
    log(`${sk.n} 化作 2 層蝕魂之毒${crit?'（爆擊！）':''}。`,'dmg');
    if(f && f.apply) applyStatus(e.st, f.apply);
    return;
  }
  let absorbed = 0;
  if(e.block > 0){
    // 對盾相性：物理走武器 blockMod；法術繞一半；pierce 完全無視
    let bm = (f && f.pierce) ? 0 : (f && f.magic) ? 0 : weaponType().blockMod;   // 法術無視格擋
    if(bm > 0 && weaponType().armorPen && !(f && f.magic) && !(f && f.pierce)) bm *= (1 - weaponType().armorPen); // 斧破防
    if(bm > 0){
      const effBlock = Math.round(e.block * bm);
      absorbed = Math.min(effBlock, d);
      e.block = Math.max(0, e.block - Math.round(absorbed / bm));
      d -= absorbed;
    }
  }
  if(f && f.shatter && e.block > 0){ log(`${sk.n} 擊碎了 ${e.n} 的格擋（${e.block}）。`,'sys'); e.block = 0; }
  e.hp -= d;
  const ic = $('eicon-'+B.ti);
  if(ic){ ic.classList.remove('hit'); void ic.offsetWidth; ic.classList.add('hit'); }
  floatDmg(zone, crit? d+'!':'-'+d, crit?'crit': d===0?'blocked':'');
  log(`${sk.n} 對 ${e.n} 造成 ${d} 傷害${crit?'（爆擊！）':''}${absorbed?`（${absorbed} 被格擋）`:''}。`,'dmg');
  if(d>0 && e.thorns){ damagePlayer(e.thorns, '荊棘反噬'); floatDmg('player-zone','-'+e.thorns,'');
    log(`荊棘反噬 ${e.thorns} 傷害。`,'dmg'); if(R.hp<=0){ playerDie(); return; } }
  if(d>0){
    const vamp = Math.min(VAMP_CAP, sumAffix('vamp')) + (f && f.drain? f.drain*100:0);
    if(vamp>0){
      const want = Math.max(1, Math.round(d*vamp/100));
      const real = healPlayer(want);
      if(real>0) log(`吸血回復 ${real}${B.st.wound?'（重傷減半）':''}。`,'heal');
      const over = want - real;
      if(over>0 && chemOn('overshield')){ // 溢血成盾
        const cap = Math.round(playerMaxHp()*0.2);
        const add = Math.min(over, cap - (B.chemShield||0));
        if(add>0){ B.shield += add; B.chemShield = (B.chemShield||0) + add;
          log(`溢血成盾：+${add} 護盾。`,'sys'); }
      }
    }
    if(f && f.manaGain && playerMaxMana()>0){
      const g = Math.round(playerMaxMana()*f.manaGain);
      R.mana = Math.min(playerMaxMana(), (R.mana||0)+g);
    }
    if(f && f.weakChance && Math.random() < f.weakChance) applyStatus(e.st, {weak:1}, sk.n);
    let pt = sumAffix('ptouch');
    if(pt && crit && chemOn('pcrit')) pt *= 2; // 毒爆
    if(pt) applyStatus(e.st, {poison:pt});
    const bt = sumAffix('btouch'); if(bt) applyStatus(e.st, {burn:bt});
  }
  if(f && f.apply) applyStatus(e.st, f.apply);
  if(f && f.poisonProc && e.st.poison && e.hp > 0){
    const pd = Math.ceil(e.maxhp * DOT.poisonPct * e.st.poison * (sumAffix('vform')?1.5:1) * (1 + sumAffix('ppyre')/100));
    e.hp -= pd; floatDmg(zone, '-'+pd, '');
    log(`催毒——${e.n} 的毒立即發作 ${pd} 傷害。`,'dmg');
  }
  if(e.boss && e.phaseTags && !e._p2 && e.hp > 0 && e.hp <= e.maxhp/2){
    e._p2 = true;
    applyTag(e, e.phaseTags[1]);
    log(`${e.n} 的外殼碎裂——性質改變了！（${ENEMY_TAGS[e.tag].i} ${ENEMY_TAGS[e.tag].n}）`,'sys');
  }
  if(e.hp<=0){
    onEnemySlain(e);
    if(f && f.killHeal){ const h = healPlayer(Math.round(playerMaxHp()*f.killHeal));
      if(h>0) log(`血償：回復 ${h} 生命。`,'heal'); }
    if(f && f.transferCurse){
      const others = aliveEs();
      if(others.length){
        const to = pick(others);
        const moved = {};
        for(const k of ['weak','vuln','poison','burn']) if(e.st[k]) moved[k] = e.st[k];
        if(Object.keys(moved).length){ applyStatus(to.st, moved, '輪迴咒'); }
      }
    }
    if(B.duo) log(e.n+' 倒下了。','sys');
  }
}

function onEnemySlain(e){
  if(e._slain) return; e._slain = true;
  if(e.st && (e.st.poison||e.st.burn)) bountyProgress('dotkill');   // 委託：中毒/燃燒擊殺
  if(sumAffix('wildfire') && e.st && e.st.burn){          // 延燒：把燃層傳給隨機存活敵人
    const others = aliveEs().filter(x=>x.hp>0 && x!==e);
    if(others.length) applyStatus(pick(others).st, {burn:e.st.burn}, '延燒');
  }
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
    const isEnemy = who.maxhp !== undefined;
    const maxhp = isEnemy ? who.maxhp : playerMaxHp();
    const pyre = isEnemy ? (1 + sumAffix('bpyre')/100) : 1;   // 烈焰：對敵燃傷加成
    const d = Math.ceil(maxhp * DOT.burnPct * who.st.burn * pyre);
    if(isEnemy){
      who.hp -= d;
      if(chemOn('burnvamp')){ const h = healPlayer(Math.ceil(d*0.3)); // 焚血
        if(h>0) log(`焚血：回復 ${h} 生命。`,'heal'); }
      if(sumAffix('dotdrain')){ const h = healPlayer(Math.ceil(d*sumAffix('dotdrain')/100)); // 蝕取
        if(h>0) log(`蝕取：回復 ${h} 生命。`,'heal'); }
    } else { damagePlayer(d, '燃燒'); }
    log(`${name} 被燃燒灼傷 ${d}（${who.st.burn} 層）。`,'dmg');
    if(zone) floatDmg(zone, '-'+d, '');
    if(isEnemy && sumAffix('ember')) who.st.burn -= 1;        // 餘燼：不減半，改每回合 −1
    else who.st.burn = Math.floor(who.st.burn/2);
    if(who.st.burn<=0) delete who.st.burn;
  }
}

function enemyTurn(){
  setTimeout(()=>{
    const _ra = B.rageAt || 8;
    let rageMul = 1;
    if(B.turn >= _ra){
      rageMul = 1 + (B.turn - (_ra-1)) * 0.15;
      if(!B.rageWarned){ B.rageWarned = true; log('深淵不耐煩了——敵人陷入狂怒，傷害開始遞增！','sys'); }
    }
    for(const e of B.es){
      if(e.hp<=0) continue;
      if(B.turn >= _ra) e.st.rage = B.turn - (_ra-1);
      if(e.st.poison){ const vf = sumAffix('vform') ? 1.5 : 1; // 蝕魂：中毒傷害 +50%
        const d = Math.ceil(e.maxhp * DOT.poisonPct * e.st.poison * vf * (1 + sumAffix('ppyre')/100)); e.hp -= d;
        log(`${e.n} 中毒受到 ${d} 傷害（${e.st.poison} 層）。`,'dmg'); floatDmg('ez-'+B.es.indexOf(e),'-'+d,'');
        if(sumAffix('symbio')){ const h = healPlayer(Math.ceil(d*0.5));
          if(h>0){ log(`腐生：回復 ${h} 生命。`,'heal'); } }
        if(chemOn('poisonvamp')){ const h = healPlayer(Math.ceil(d*0.3)); // 毒吸
          if(h>0){ log(`毒吸：回復 ${h} 生命。`,'heal'); } }
        if(sumAffix('dotdrain')){ const h = healPlayer(Math.ceil(d*sumAffix('dotdrain')/100)); // 蝕取
          if(h>0){ log(`蝕取：回復 ${h} 生命。`,'heal'); } }
        e.st.poison -= 1; if(e.st.poison<=0) delete e.st.poison;
        if(e.hp<=0){ log(e.n+' 被毒殺了。','sys'); onEnemySlain(e); continue; } }
      if(e.shell && !e.boss) e.block = Math.max(e.block, e.shell); // 重甲外殼恢復（王的殼只給一次，破了就破了）
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
            if(Math.random()*100 < dodgeRate()){
              log('你閃過了'+e.n+'的攻擊。','sys'); floatDmg('player-zone','閃避','blocked');
              const wt = sumAffix('thorns');
              if(wt && chemOn('windthorn')){ e.hp -= wt*2; log(`風棘——閃身反刺 ${wt*2} 傷害。`,'dmg'); }
              continue; }
            // 防禦結算：(敵傷 − 防禦力/10) × (1 − 防禦率) → 格擋最後吸收
            d = Math.max(1, Math.round((d - playerDef()/10) * (1 - defRate()/100)));
            let absorbed = 0;
            if(B.block>0){
              absorbed = Math.min(B.block, d); B.block -= absorbed; d -= absorbed;
              if(B.spike > 0 && absorbed > 0){
                const sp = Math.max(1, Math.round(absorbed * B.spike));
                e.hp -= sp; log(`尖壁反刺 ${sp} 傷害。`,'dmg');
              }
            }
            if(d>0 && B.shield>0){
              const sa = Math.min(B.shield, d); B.shield -= sa; d -= sa;
              if(B.reflect > 0 && sa > 0){
                const rf = Math.max(1, Math.round(sa * B.reflect));
                e.hp -= rf; log(`反射膜彈回 ${rf} 傷害。`,'dmg');
              }
              if(sa > 0) log(`護盾吸收了 ${sa} 傷害。`,'sys');
            }
            if(d>0){ damagePlayer(d, `${e.n}的${mv.nm||'攻擊'}`); totalDealt += d;
              floatDmg('player-zone','-'+d,''); }
            else floatDmg('player-zone','格擋','blocked');
            log(`${e.n} ${mv.nm||'攻擊'}造成 ${d} 傷害${absorbed?`（${absorbed} 被格擋）`:''}。`,'dmg');
            const th = sumAffix('thorns');
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
  let mendHeal = 0;
  if(mend){ mendHeal = Math.min(Math.round(playerMaxHp()*mend/100), playerMaxHp()-R.hp); if(mendHeal>0) R.hp += mendHeal; }
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
  if(B.boss){
    let ropeCh = Math.min(0.9, ROPE_DROP.boss + Math.max(0, R.floor-5) * ROPE_BOSS_RAMP); // 採深遞增
    if(R.floor >= ROPE_PITY) ropeCh = 1;   // 保底：25 層起首領必給
    tryDropRope(ropeCh, '首領');
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
  // 傳送點不再靠「打贏首領」解鎖——改為只有活著逃脫才記錄（見 retreat()）。
  if(R.cycle === 0 && R.floor === 50 && B.boss){ R.origDone = true; G.orig.done = true; }
  // 過關＝走到底打贏＝活著的證明，認證深度比照逃脫寫入（分本源/輪迴）
  // 免逃離認證唯一例外：本源打穿第50層（走到底＝活著的證明）；輪迴無此例外，只能靠逃離
  if(R.cycle === 0 && R.floor === 50 && isFinal){
    recordCert(0, 50);
  }
  bountyProgress('kill');
  if(B.boss) bountyProgress('boss');
  if(drops.length) bountyProgress('loot');
  bountyProgress('streakkill');
  if(B.noHit) bountyProgress('flawless');
  setTimeout(()=>{
    showLoot(drops, gold, B.boss?'👑':'⚔️', isFinal?'你打穿了深淵的心臟':(B.boss?'首領倒下了':'戰鬥勝利'),
      `獲得 ${gold} 碎銀` + (potionDrop? `，撿到 ${POTIONS[potionDrop].i}${POTIONS[potionDrop].n}`:'') + (potionOverflow? `，藥水袋滿——折成 ${potionOverflow} 碎銀`:'') + (matDrop? `，拾獲 ${MATS[matDrop].i}${MATS[matDrop].n} ×1`:''), mendHeal? `（急救回復 ${mendHeal} 血）`:'');
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
    const mm = playerMaxMana();
    if(mm > 0){ R.mana = Math.min(mm, (R.mana||0) + Math.round(mm*0.3)); }
    toast(`回復 ${h} 血${mm>0?'＋30%法力':''}`); if(inBattle){ log(`喝下治療藥水，回復 ${h} 血${B&&B.st.wound?'（重傷減半）':''}。`,'heal'); floatDmg('player-zone','+'+h,'heal'); } }
  else if(k==='energy'){ if(!inBattle) return toast('只能在戰鬥中用'); B.energy += 2; log('灌下烈酒，+2 行動點。','sys'); }
  else if(k==='bomb'){ if(!inBattle) return toast('只能在戰鬥中用'); const v = potPower(k); const e = tgt(); e.hp -= v; applyStatus(e.st, {vuln:2}); log(`火油瓶對 ${e.n} 炸出 ${v} 傷害，火光中破綻畢露（易傷 2）。`,'dmg'); floatDmg('ez-'+B.ti,'-'+v,''); }
  else if(k==='purge'){ B ? (B.st = {}) : null; toast('負面狀態已清除'); if(inBattle) log('淨化藥水洗去了所有異常。','sys'); }
  else if(k==='wrath'){ if(!inBattle) return toast('只能在戰鬥中用'); B.potRage = true; log('狂暴藥劑燒進血管——本場戰鬥傷害 +50%！','sys'); }
  else if(k==='stone'){ if(!inBattle) return toast('只能在戰鬥中用'); const v = potPower(k); B.block += v; log(`石膚藥劑：+${v} 格擋。`,'sys'); }
  else if(k==='holy'){ if(!inBattle) return toast('只能在戰鬥中用'); const v = potPower(k);
    for(const e of aliveEs()){ e.hp -= v; floatDmg('ez-'+B.es.indexOf(e),'-'+v,''); }
    log(`聖水潑灑——所有敵人受到 ${v} 傷害。`,'sys'); }
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

