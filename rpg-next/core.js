'use strict';
/* ============ core.js — 純邏輯，不碰 DOM，可以用 node 跑模擬。
   整趟下潛是一個可 JSON 化的狀態 S（亂數狀態也在裡面，讀檔不能刷結果）。
   畫面要演出的事放進 S.fx（傷害數字、音效），由 ui.js 取走；存檔時不存 fx。
   S.screen：map / battle / reward / rest / event / result ============ */

/* —— 亂數 —— */
function rand(S){
  S.rng = (S.rng + 0x6D2B79F5) | 0;
  let t = S.rng;
  t = Math.imul(t ^ (t >>> 15), t | 1);
  t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
  return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
}
const rint = (S, n) => Math.floor(rand(S) * n);
const rpick = (S, a) => a[rint(S, a.length)];
function shuffle(S, a){
  for(let i = a.length - 1; i > 0; i--){ const j = rint(S, i + 1); [a[i], a[j]] = [a[j], a[i]]; }
  return a;
}
const emit = (S, e) => { (S.fx = S.fx || []).push(e); };

/* —— 建立新的一趟 —— */
function newRun(seed){
  const S = {
    v: 1, rng: seed | 0, uid: 1, screen: 'map',
    hp: GAME.hp, maxHp: GAME.hp, greed: 0,
    deck: STARTER_DECK.map(id => ({id, up: 0})),
    bag: [], at: null, map: null, battle: null, reward: null, event: null, result: null,
    stats: {kills: 0, steps: 0, burned: 0},
  };
  S.map = genMap(S);
  return S;
}

/* —— 地圖 —— */
function genMap(S){
  const rows = [];
  for(let r = 0; r < GAME.rows; r++){
    const boss = r === GAME.rows - 1;
    const count = boss ? 1 : (r === 0 ? 3 : 2 + rint(S, 3));
    const row = [];
    for(let i = 0; i < count; i++) row.push(makeNode(S, r, boss));
    if(r === 5) row[rint(S, row.length)] = {t: 'rest', next: []};   // 中段保證有一處可以喘息
    if(r === GAME.rows - 2) row.forEach((n, i) => { if(i % 2 === 0) row[i] = {t: 'rest', next: []}; });
    row.forEach((n, i) => { n.x = (i + 1) / (count + 1) + (rand(S) - 0.5) * 0.05; });
    rows.push(row);
  }
  /* 雙指標合併連線：不交叉，而且每個節點都有進有出 */
  for(let r = 0; r < rows.length - 1; r++){
    const a = rows[r], b = rows[r + 1];
    let i = 0, j = 0;
    a[0].next.push(0);
    while(i < a.length - 1 || j < b.length - 1){
      if(j >= b.length - 1 || (i < a.length - 1 && (i + 1) / a.length <= (j + 1) / b.length)) i++; else j++;
      a[i].next.push(j);
    }
  }
  /* 撤離點掛在該列最右邊，只從前一列最右的節點走得到，走進去就結束 */
  GAME.exitRows.forEach(r => {
    const row = rows[r], prev = rows[r - 1];
    row.forEach((n, i) => { n.x = (i + 1) / (row.length + 2); });
    row.push({t: 'exit', x: 0.9, next: []});
    prev[prev.length - 1].next.push(row.length - 1);
  });
  return rows;
}
function makeNode(S, r, boss){
  if(boss) return {t: 'boss', next: []};
  const n = {next: []};
  const x = rand(S);
  if(r === 0) n.t = 'fight';
  else if(r < 3) n.t = x < 0.62 ? 'fight' : x < 0.82 ? 'event' : 'chest';
  else n.t = x < 0.46 ? 'fight' : x < 0.68 ? 'elite' : x < 0.84 ? 'event' : x < 0.94 ? 'chest' : 'rest';
  if(n.t === 'fight') n.reward = rand(S) < 0.55 ? 'card' : 'loot';
  return n;
}
function reachable(S){
  if(!S.at) return S.map[0].map((_, c) => [0, c]);
  return S.map[S.at[0]][S.at[1]].next.map(c => [S.at[0] + 1, c]);
}

/* —— 貪婪 —— */
function greedTierIndex(g){
  let t = 0;
  GREED_TIERS.forEach((x, i) => { if(g >= x.min) t = i; });
  return t;
}
const greedTier = S => GREED_TIERS[greedTierIndex(S.greed)];
function addGreed(S, n){
  const before = greedTierIndex(S.greed);
  S.greed = Math.max(0, S.greed + n);
  const after = greedTierIndex(S.greed);
  if(after !== before) emit(S, {k: 'tier', up: after > before, n: GREED_TIERS[after].n});
}

/* —— 財寶 —— */
function rollTreasure(S, boost){
  const p = greedTier(S).bias;
  const i = Math.min(TREASURES.length - 1, Math.floor(Math.pow(rand(S), p) * TREASURES.length) + (boost || 0));
  return TREASURES[i].id;
}
const treasure = id => TREASURES.find(t => t.id === id);
function rollLoot(S, n, boost){
  const out = [];
  let guard = 0;
  while(out.length < n && guard++ < 40){
    const id = rollTreasure(S, boost);
    if(!out.includes(id)) out.push(id);
  }
  return out;
}
const bagValue = S => S.bag.reduce((s, id) => s + treasure(id).v, 0);
function addTreasure(S, id){
  S.bag.push(id);
  addGreed(S, treasure(id).g);
  emit(S, {k: 'coin'});
}
function removeTreasure(S, idx){
  const [id] = S.bag.splice(idx, 1);
  addGreed(S, -treasure(id).g);
  return id;
}
function cheapestIdx(S){
  let b = -1;
  S.bag.forEach((id, i) => { if(b < 0 || treasure(id).v < treasure(S.bag[b]).v) b = i; });
  return b;
}
function priciestIdx(S){
  let b = -1;
  S.bag.forEach((id, i) => { if(b < 0 || treasure(id).v > treasure(S.bag[b]).v) b = i; });
  return b;
}

/* —— 技能資料（套用強化） —— */
function cardDef(c){
  const d = CARDS[c.id];
  return c.up ? Object.assign({}, d, d.up) : d;
}
function rollCards(S, n, rareBias){
  const pool = Object.keys(CARDS).filter(id => CARDS[id].r >= 1);
  const out = [];
  let guard = 0;
  while(out.length < n && guard++ < 60){
    const wantRare = rand(S) < rareBias;
    const id = rpick(S, pool.filter(k => (CARDS[k].r === 2) === wantRare));
    if(!out.includes(id)) out.push(id);
  }
  return out;
}

/* —— 進入節點 —— */
function canEnter(S, r, c){ return reachable(S).some(p => p[0] === r && p[1] === c); }
function enterNode(S, r, c){
  if(S.screen !== 'map' || !canEnter(S, r, c)) return false;
  const n = S.map[r][c];
  S.at = [r, c];
  n.done = 1;
  S.stats.steps++;
  addGreed(S, GAME.stepGreed);
  if(n.t === 'exit'){ finishRun(S, true, '從繩梯爬回地面'); return true; }
  if(n.t === 'fight') startBattle(S, encounter(S, r), 'fight', n.reward);
  else if(n.t === 'elite') startBattle(S, [rpick(S, ELITES)], 'elite');
  else if(n.t === 'boss') startBattle(S, ['sarc'], 'boss');
  else if(n.t === 'rest') S.screen = 'rest';
  else if(n.t === 'chest') openChest(S);
  else if(n.t === 'event') startEvent(S);
  return true;
}
function encounter(S, r){
  const seg = r < 3 ? 0 : r < 6 ? 1 : 2;
  return rpick(S, ENCOUNTERS[seg]).slice();
}

/* —— 寶箱：拿一件之後可以賭下一件 —— */
function openChest(S){
  S.reward = {title: '寶箱', text: '挑一件。翻得越久，裡面的東西越不像寶箱。', loot: rollLoot(S, 3, 1), cards: null, again: 1, after: 'map'};
  S.screen = 'reward';
}
function chestAgain(S){
  const R = S.reward;
  if(!R || !R.again || R.loot) return;
  if(rand(S) < GAME.chestMimic){
    S.reward = null;
    emit(S, {k: 'toast', t: '寶箱張開了嘴！'});
    startBattle(S, ['mimic'], 'elite');
    return;
  }
  R.loot = rollLoot(S, 3, 1);
  R.text = '還有。手再伸進去一點。';
}

/* —— 戰鬥 —— */
function spawn(S, key){
  const d = ENEMIES[key], T = greedTier(S);
  const hp = Math.round(d.hp * T.hp);
  const e = {uid: S.uid++, key, n: d.n, hp, max: hp, block: T.start, step: 0, str: 0, weak: 0, vuln: 0, psn: 0,
             traits: [], revived: 0, loot: [], gone: 0, boss: !!d.boss, elite: !!d.elite};
  const pool = shuffle(S, Object.keys(TRAITS));
  e.traits = pool.slice(0, T.traits);
  return e;
}
function startBattle(S, keys, kind, reward){
  const b = {
    kind, reward: reward || null, turn: 0, phase: 'player', ei: 0,
    enemies: keys.map(k => spawn(S, k)), target: 0,
    draw: shuffle(S, S.deck.map(c => ({id: c.id, up: c.up, uid: S.uid++}))), hand: [], disc: [], exh: [],
    ap: 0, block: 0, str: 0, weak: 0, vuln: 0, psn: 0, scars: 0, keep: 0, burned: 0,
  };
  S.battle = b;
  S.screen = 'battle';
  emit(S, {k: 'battle'});
  startTurn(S);
}
const alive = b => b.enemies.filter(e => e.hp > 0 && !e.gone);
function fixTarget(b){
  const t = b.enemies[b.target];
  if(!t || t.hp <= 0 || t.gone){
    const i = b.enemies.findIndex(e => e.hp > 0 && !e.gone);
    b.target = Math.max(0, i);
  }
}
function setTarget(S, i){
  const b = S.battle, e = b && b.enemies[i];
  if(e && e.hp > 0 && !e.gone) b.target = i;
}
function drawCards(S, n){
  const b = S.battle;
  for(let i = 0; i < n; i++){
    if(!b.draw.length){
      if(!b.disc.length) return;
      b.draw = shuffle(S, b.disc);
      b.disc = [];
    }
    b.hand.push(b.draw.pop());
  }
}
function startTurn(S){
  const b = S.battle;
  b.turn++;
  b.phase = 'player';
  b.ap = GAME.ap;
  b.burned = 0;
  /* 劍士的職業規則：格擋只衰減一半，所以防禦可以累積 */
  b.block = b.keep ? b.block : Math.floor(b.block / 2);
  b.keep = 0;
  if(b.psn > 0){
    loseHp(S, b.psn, 'poison');
    b.psn--;
    if(S.screen !== 'battle') return;
  }
  drawCards(S, GAME.hand);
  fixTarget(b);
}

/* 預覽與結算共用同一條公式，卡面數字才不會跟實際打出去的不一樣 */
function baseDmg(S, def, t){
  const b = S.battle;
  if(def.fn === 'ram') return b.block + (def.bonus || 0);
  if(def.fn === 'debt') return def.base + def.per * b.scars;
  if(def.fn === 'fling') return def.base + Math.floor(S.greed / 4);
  if(def.fn === 'melt') return S.bag.length ? def.base : 0;
  if(def.fn === 'finish' && t && t.hp < t.max * 0.4) return def.dmg * 2;
  return def.dmg || 0;
}
function calcDmg(S, def, t){
  const b = S.battle;
  const base = baseDmg(S, def, t);
  if(base <= 0) return 0;
  let v = base + b.str;
  if(b.weak > 0) v *= 0.75;
  if(t && t.vuln > 0) v *= 1.5;
  return Math.floor(v);
}
function hitEnemy(S, e, amt){
  if(S.screen !== 'battle' || e.hp <= 0 || e.gone) return;   // 帶刺反彈可能在連擊中途打死玩家
  const absorbed = Math.min(e.block, amt);
  e.block -= absorbed;
  const real = amt - absorbed;
  e.hp -= real;
  emit(S, {k: 'hit', uid: e.uid, amt: real, blocked: absorbed});
  if(e.traits.includes('thorn')) hitPlayer(S, 2);
  if(S.screen !== 'battle' || e.hp > 0) return;
  const d = ENEMIES[e.key];
  if(d.revive && !e.revived){
    e.revived = 1;
    e.hp = Math.round(e.max * d.revive);
    e.block = 0;
    emit(S, {k: 'revive', uid: e.uid});
    return;
  }
  e.hp = 0;
  S.stats.kills++;
  emit(S, {k: 'die', uid: e.uid});
  e.loot.forEach(id => { addTreasure(S, id); emit(S, {k: 'toast', t: `拿回了${treasure(id).n}`}); });
  e.loot = [];
  /* 首領一倒，叫出來的小怪跟著散掉，不用再清場 */
  if(e.boss) S.battle.enemies.forEach(x => { if(x !== e && x.hp > 0) x.gone = 1; });
}
/* 走格擋的傷害 */
function hitPlayer(S, amt, srcUid){
  const b = S.battle;
  const absorbed = Math.min(b.block, amt);
  b.block -= absorbed;
  const real = amt - absorbed;
  emit(S, {k: 'hurt', amt: real, blocked: absorbed, src: srcUid});
  if(real > 0){
    b.scars++;
    S.hp -= real;
    checkDead(S);
  }
}
/* 不走格擋的失血（毒、搏命），不算傷痕 */
function loseHp(S, amt, why){
  S.hp -= amt;
  emit(S, {k: 'hurt', amt, blocked: 0, why});
  checkDead(S);
}
function checkDead(S){
  if(S.hp <= 0 && S.screen === 'battle'){
    S.hp = 0;
    finishRun(S, false, S.battle.kind === 'boss' ? '倒在石棺前' : '倒在淺穴裡');
  }
}
function checkWin(S){
  if(S.screen !== 'battle') return true;
  const b = S.battle;
  if(alive(b).length) return false;
  winBattle(S);
  return true;
}
function playable(S, i){
  const b = S.battle;
  if(!b || b.phase !== 'player') return false;
  const c = b.hand[i];
  return !!c && cardDef(c).c <= b.ap;
}
function playCard(S, i){
  if(S.screen !== 'battle' || !playable(S, i)) return false;
  const b = S.battle;
  const c = b.hand[i], d = cardDef(c);
  fixTarget(b);
  const t = b.enemies[b.target];
  b.hand.splice(i, 1);
  b.ap -= d.c;
  emit(S, {k: 'card', ct: d.k});
  if(d.selfHp){ loseHp(S, d.selfHp, 'self'); if(S.screen !== 'battle') return true; }
  if(d.fn === 'melt'){
    /* 先算傷害（calcDmg 要看背包有沒有東西）再燒 */
    const dmg = calcDmg(S, d, t);
    const k = cheapestIdx(S);
    if(k >= 0){ removeTreasure(S, k); S.stats.burned++; emit(S, {k: 'burn'}); hitEnemy(S, t, dmg); }
  }else if(d.all){
    alive(b).forEach(e => { if(S.screen === 'battle') hitEnemy(S, e, calcDmg(S, d, e)); });
  }else if(d.dmg || d.fn === 'ram' || d.fn === 'debt' || d.fn === 'fling'){
    const hits = d.hits || 1;
    for(let h = 0; h < hits; h++){
      if(S.screen !== 'battle' || t.hp <= 0 || t.gone) break;
      hitEnemy(S, t, calcDmg(S, d, t));
    }
  }
  if(S.screen !== 'battle') return true;
  if(d.vuln && t.hp > 0) t.vuln += d.vuln;
  if(d.blk){ b.block += d.blk; emit(S, {k: 'block', amt: d.blk}); }
  if(d.keep) b.keep = 1;
  if(d.str){ b.str += d.str; emit(S, {k: 'buff', t: `力量 +${d.str}`}); }
  if(d.fn === 'rage'){ if(b.scars){ b.str += b.scars; emit(S, {k: 'buff', t: `力量 +${b.scars}`}); } b.scars = 0; }
  if(d.heal){ heal(S, d.heal); }
  if(d.ap) b.ap += d.ap;
  if(d.greed) addGreed(S, d.greed);
  if(d.draw) drawCards(S, d.draw);
  (d.exhaust ? b.exh : b.disc).push(c);
  checkWin(S);
  if(S.screen === 'battle') fixTarget(b);
  return true;
}
function heal(S, n){
  const before = S.hp;
  S.hp = Math.min(S.maxHp, S.hp + n);
  if(S.hp > before) emit(S, {k: 'heal', amt: S.hp - before});
}
/* 燒財寶：每回合一次，換行動點，貪婪也跟著降——危急時的買命錢 */
function burnTreasure(S, idx){
  const b = S.battle;
  if(!b || b.phase !== 'player' || b.burned || !S.bag[idx]) return false;
  removeTreasure(S, idx);
  b.burned = 1;
  b.ap += GAME.burnAp;
  S.stats.burned++;
  emit(S, {k: 'burn'});
  return true;
}
function endTurn(S){
  const b = S.battle;
  if(!b || b.phase !== 'player') return false;
  b.disc.push(...b.hand);
  b.hand = [];
  if(b.weak > 0) b.weak--;
  if(b.vuln > 0) b.vuln--;
  b.phase = 'enemy';
  b.ei = 0;
  return true;
}
/* 一次動一隻敵人，畫面才能一隻一隻演。回傳 false 代表敵方回合結束、已開始下一個玩家回合 */
function enemyStep(S){
  const b = S.battle;
  if(!b || b.phase !== 'enemy') return false;
  while(b.ei < b.enemies.length && (b.enemies[b.ei].hp <= 0 || b.enemies[b.ei].gone)) b.ei++;
  if(b.ei >= b.enemies.length){
    startTurn(S);
    return false;
  }
  const actor = b.enemies[b.ei];
  enemyAct(S, actor);
  if(actor.vuln > 0) actor.vuln--;
  if(actor.weak > 0) actor.weak--;
  b.ei++;
  if(checkWin(S)) return false;
  return true;
}
/* 看下一招（意圖）。數字含力量、虛弱、易傷，顯示多少就打多少 */
function intent(S, e){
  const d = ENEMIES[e.key];
  return d.pat[e.step % d.pat.length];
}
function enemyHitValue(S, e, base){
  const b = S.battle;
  let v = Math.round(base * greedTier(S).dmg) + e.str;
  if(e.weak > 0) v *= 0.75;
  if(b.vuln > 0) v *= 1.5;
  return Math.floor(v);
}
function enemyAct(S, e){
  const b = S.battle;
  if(e.traits.includes('tough')) e.block += 4;
  if(e.traits.includes('frenzy')) e.str += 1;
  if(e.psn > 0){
    e.hp -= e.psn;
    emit(S, {k: 'hit', uid: e.uid, amt: e.psn, blocked: 0});
    e.psn--;
    if(e.hp <= 0){ e.hp = 0; S.stats.kills++; emit(S, {k: 'die', uid: e.uid}); return; }
  }
  const p = intent(S, e);
  e.step++;
  emit(S, {k: 'act', uid: e.uid, nm: p.nm || ''});
  if(p.a){
    const x = p.x || 1;
    for(let i = 0; i < x && S.screen === 'battle'; i++) hitPlayer(S, enemyHitValue(S, e, p.a), e.uid);
    if(S.screen !== 'battle') return;
  }
  if(p.d){ e.block += p.d; emit(S, {k: 'eblock', uid: e.uid, amt: p.d}); }
  if(p.str){ e.str += p.str; }
  if(p.weak){ b.weak += p.weak; emit(S, {k: 'debuff', t: `虛弱 ${p.weak}`}); }
  if(p.psn){ b.psn += p.psn; emit(S, {k: 'debuff', t: `中毒 ${p.psn}`}); }
  if(p.goo){
    for(let i = 0; i < p.goo; i++) b.disc.push({id: 'goo', up: 0, uid: S.uid++});
    emit(S, {k: 'debuff', t: `${p.goo} 張黏液混進棄牌堆`});
  }
  if(p.summon && alive(b).length < 3){
    const n = spawn(S, p.summon);
    n.hp = n.max = Math.round(n.max * 0.7);
    n.block = 0;
    n.traits = [];
    b.enemies.push(n);
    emit(S, {k: 'summon', uid: n.uid});
  }
  if(p.steal){
    const k = priciestIdx(S);
    if(k >= 0){
      const id = removeTreasure(S, k);
      e.loot.push(id);
      emit(S, {k: 'steal', uid: e.uid, t: `被偷走${treasure(id).n}！打倒牠才拿得回來`});
    }else{
      hitPlayer(S, enemyHitValue(S, e, 7), e.uid);
    }
  }
  if(p.flee){
    if(e.loot.length){
      e.gone = 1;
      emit(S, {k: 'flee', uid: e.uid, t: `${e.n}帶著贓物跑了`});
    }else{
      hitPlayer(S, enemyHitValue(S, e, 5), e.uid);
    }
  }
}
function winBattle(S){
  const b = S.battle;
  emit(S, {k: 'win'});
  const after = b.kind === 'boss' ? 'clear' : 'map';
  if(b.kind === 'boss'){
    /* 打贏首領要明顯比中途撤離划算：棺底的深淵晶直接入帳（滿了也塞得進去，算額外獎賞），再挑一件 */
    S.bag.push('gem');
    addGreed(S, treasure('gem').g);
    emit(S, {k: 'coin'});
    S.reward = {title: '石棺開了', text: '棺底躺著一顆深淵晶，已經進了你的背包。其他的再挑一件。', loot: rollLoot(S, 3, 3), cards: null, after};
  }else if(b.kind === 'elite'){
    S.reward = {title: '戰利品', text: '菁英身上的東西比較值錢。', loot: rollLoot(S, 3, 1), cards: rollCards(S, 3, 0.4), after};
  }else if(b.reward === 'loot'){
    S.reward = {title: '戰利品', text: '挑一件帶走，或者空手以保持清醒。', loot: rollLoot(S, 3, 0), cards: null, after};
  }else{
    S.reward = {title: '有所領悟', text: '這場仗教了你一招。', loot: null, cards: rollCards(S, 3, 0.15), after};
  }
  S.battle = null;
  S.screen = 'reward';
}

/* —— 獎勵 —— */
/* 背包滿了要傳 dropIdx 指定換掉哪一件；回傳 'full' 代表需要先選 */
function takeLoot(S, i, dropIdx){
  const R = S.reward;
  if(!R || !R.loot || !R.loot[i]) return false;
  if(S.bag.length >= GAME.bag){
    if(dropIdx === undefined || dropIdx === null) return 'full';
    removeTreasure(S, dropIdx);
  }
  addTreasure(S, R.loot[i]);
  R.loot = null;
  afterPick(S);
  return true;
}
function skipLoot(S){
  const R = S.reward;
  if(!R) return;
  R.loot = null;
  afterPick(S);
}
function takeCard(S, i){
  const R = S.reward;
  if(!R || !R.cards || !R.cards[i]) return false;
  S.deck.push({id: R.cards[i], up: 0});
  emit(S, {k: 'pick'});
  R.cards = null;
  afterPick(S);
  return true;
}
function skipCards(S){
  const R = S.reward;
  if(!R) return;
  R.cards = null;
  afterPick(S);
}
/* 寶箱拿完還可以賭一次，所以不自動結束 */
function afterPick(S){
  const R = S.reward;
  if(R.loot || R.cards) return;
  if(R.again) return;
  closeReward(S);
}
function closeReward(S){
  const R = S.reward;
  S.reward = null;
  if(R && R.after === 'clear') finishRun(S, true, '帶著石棺裡的東西爬回地面');
  else S.screen = 'map';
}

/* —— 營火 —— */
function restHeal(S){
  if(S.screen !== 'rest') return;
  heal(S, Math.round(S.maxHp * GAME.restHeal));
  S.screen = 'map';
}
function restUpgrade(S, i){
  if(S.screen !== 'rest' || !S.deck[i] || S.deck[i].up || !CARDS[S.deck[i].id].up) return false;
  S.deck[i].up = 1;
  emit(S, {k: 'pick'});
  S.screen = 'map';
  return true;
}
function restRemove(S, i){
  if(S.screen !== 'rest' || !S.deck[i] || S.deck.length <= 5) return false;
  S.deck.splice(i, 1);
  emit(S, {k: 'pick'});
  S.screen = 'map';
  return true;
}

/* —— 事件 —— */
function startEvent(S){
  S.event = {id: rpick(S, Object.keys(EVENTS))};
  S.screen = 'event';
}
function eventOptEnabled(S, o){ return o.need !== 'bag' || S.bag.length > 0; }
const EVENT_FX = {
  leave(S){ return null; },
  search(S){
    if(rand(S) < 0.55){
      const id = rollTreasure(S, 1);
      if(S.bag.length < GAME.bag){ addTreasure(S, id); return `背包底部壓著${treasure(id).n}。`; }
      return `背包底部壓著${treasure(id).n}，但你已經拿不下了。`;
    }
    S.hp = Math.max(1, S.hp - 7);
    emit(S, {k: 'hurt', amt: 7, blocked: 0});
    return '背包裡有東西先咬了你。失去 7 生命。';
  },
  bet(S){
    const k = cheapestIdx(S);
    const old = removeTreasure(S, k);
    if(rand(S) < 0.5){
      const a = rollTreasure(S, 1), c = rollTreasure(S, 1);
      addTreasure(S, a);
      if(S.bag.length < GAME.bag) addTreasure(S, c);
      return `贏了。它把${treasure(a).n}和${treasure(c).n}推過來，笑得很難聽。`;
    }
    return `輸了。${treasure(old).n}消失在它袖子裡。`;
  },
  blood(S){
    S.hp = Math.max(1, S.hp - 8);
    emit(S, {k: 'hurt', amt: 8, blocked: 0});
    S.reward = {title: '祭壇的回應', text: '血被吸乾了。腦中多了一些不屬於你的招式。', loot: null, cards: rollCards(S, 3, 1), after: 'map'};
    return 'reward';
  },
  offer(S){
    const id = removeTreasure(S, priciestIdx(S));
    heal(S, 25);
    return `${treasure(id).n}沉進血裡，傷口開始收合。回復 25 生命。`;
  },
  stare(S){
    addGreed(S, 10);
    S.maxHp += 8;
    S.hp += 8;
    return '你覺得自己撐得住更多了。也想要更多了。';
  },
};
function chooseEvent(S, optId){
  const ev = S.event;
  if(!ev || ev.result) return;
  const o = EVENTS[ev.id].opts.find(x => x.id === optId);
  if(!o || !eventOptEnabled(S, o)) return;
  const r = EVENT_FX[optId](S);
  if(r === 'reward'){ S.event = null; S.screen = 'reward'; return; }
  if(r === null){ S.event = null; S.screen = 'map'; return; }
  ev.result = r;
}
function closeEvent(S){ S.event = null; S.screen = 'map'; }

/* —— 結算 —— */
function finishRun(S, ok, why){
  const items = S.bag.slice();
  S.result = {ok, why, items: ok ? items : [], lost: ok ? [] : items, value: ok ? bagValue(S) : 0, greed: S.greed,
              steps: S.stats.steps, kills: S.stats.kills, burned: S.stats.burned};
  S.battle = null;
  S.reward = null;
  S.event = null;
  S.screen = 'result';
  emit(S, {k: ok ? 'extract' : 'death'});
}
