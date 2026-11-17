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

/* —— 異變：所有影響都從這一個入口讀，沒有異變就是空物件 —— */
const NO_MUT = {};
const mutOf = S => MUTATIONS[S.mutation] || NO_MUT;
/* 下潛前三選一用：rnd 是 0~1 的亂數函式（用當下時間亂數就傳 Math.random，不影響 S.rng） */
function pickMutations(n, rnd){
  const ids = Object.keys(MUTATIONS);
  for(let i = ids.length - 1; i > 0; i--){ const j = Math.floor(rnd() * (i + 1)); [ids[i], ids[j]] = [ids[j], ids[i]]; }
  return ids.slice(0, n);
}
/* —— 區域：規則與敵人資料都從這裡讀（舊存檔沒有的欄位就當沒有） —— */
const regionIdx = d => (d || 0) % REGIONS.length;
const ruleOf = S => { const r = regionOf(S.depth || 0).rule; return r ? r.id : ''; };
/* 目前形態的敵人資料（深淵之心過半血換形態後，招式、名字、圖都換） */
const edef = e => { const d = ENEMIES[e.key]; return e.form && d.form2 ? Object.assign({}, d, d.form2) : d; };
const pickElite = S => { const el = rpick(S, regionOf(S.depth || 0).elites); return Array.isArray(el) ? el.slice() : [el]; };
const bossName = S => ENEMIES[regionOf(S.depth || 0).boss].n;

/* —— 各區第二條規則（data.js 的 rule2；常數 GOB_STEAL_TURN、LAMP_*、TOLL_*、HEART_*）——
   run 狀態：pouch 贓物袋（財寶 id 陣列，不在身上＝不給效果、不計貪婪）、lamp 燈油、toll 累計過路費、heart 心臟倒數、bossBack 打贏首領時歸還的件數（可能讓背包暫時超格）。
   梅姐線的任務物品（帳本）是 S.book 旗標，不是背包裡的財寶，所以偷、吞、燒都碰不到它；刻痕銀器照一般財寶處理 */
const rule2Of = S => { const r = regionOf(S.depth || 0).rule2; return r ? r.id : ''; };
const lampDark = S => rule2Of(S) === 'lamp' && (S.lamp | 0) <= 0;
/* 下一步要付的過路費（這趟第一個節點不收；身上貪婪為 0 不收） */
const tollNext = S => rule2Of(S) === 'toll' && S.at ? Math.round((S.greed || 0) * TOLL_K) : 0;
/* 結算時實際從賣價扣掉的過路費：累計額，最多扣到所得的 TOLL_MAX */
const tollPaid = (S, gross) => Math.min(Math.max(0, S.toll | 0), Math.round(Math.max(0, gross) * TOLL_MAX));
const fixHp = S => { S.hp = Math.max(1, Math.min(S.hp, S.maxHp)); };
/* 每進一個（非撤離點）節點：在 enterNode 加貪婪之前呼叫 */
function enterRule2(S){
  const id = rule2Of(S);
  if(id === 'lamp'){
    S.lamp = Math.max(0, (S.lamp | 0) - 1);
    if(S.lamp === 0) emit(S, {k: 'toast', t: '提燈滅了'});
    else if(S.lamp === 1) emit(S, {k: 'toast', t: '提燈快沒油了'});
  }else if(id === 'toll'){
    if(S.stats.steps > 1){
      const t = Math.round((S.greed || 0) * TOLL_K);
      if(t > 0){ S.toll = (S.toll | 0) + t; emit(S, {k: 'toast', t: `亡魂收了 ${t} 過路費，累計 ${S.toll}`}); }
    }
  }else if(id === 'heart'){
    S.heart = (S.heart | 0) - 1;
    if(S.heart <= 0){
      S.heart = HEART_EVERY;
      if(S.bag.length){
        let bi = 0;
        S.bag.forEach((x, i) => { if(treasureValue(S, x) > treasureValue(S, S.bag[bi])) bi = i; });
        const id2 = removeTreasure(S, bi);
        fixHp(S);
        emit(S, {k: 'toast', t: `心臟收縮，吞掉了${treasure(id2).n}`});
      }else{
        const lose = Math.max(1, Math.round(S.maxHp * HEART_HP));
        S.hp = Math.max(1, S.hp - lose);
        emit(S, {k: 'toast', t: `心臟收縮，身上沒東西可吞，吞了你 ${lose} 點生命`});
      }
    }
  }
}
/* 在地圖上主動拿一件財寶（添油、餵食共用）：貪婪隨之下降，算一次「餵食」（別餵東西的委託也會看到） */
function burnOnMap(S, idx){
  if(S.screen !== 'map' || !S.bag[idx]) return null;
  const id = removeTreasure(S, idx);
  fixHp(S);
  S.stats.burned++;
  emit(S, {k: 'burn'});
  return id;
}
function lampRefuel(S, idx){
  if(rule2Of(S) !== 'lamp') return false;
  const id = burnOnMap(S, idx);
  if(id === null) return false;
  S.lamp = (S.lamp | 0) + LAMP_BURN;
  emit(S, {k: 'toast', t: `拿${treasure(id).n}添了油，燈油 +${LAMP_BURN}`});
  return true;
}
function heartFeed(S, idx){
  if(rule2Of(S) !== 'heart' || (S.heart | 0) >= HEART_EVERY) return false;   // 倒數是滿的，餵了也白餵
  const id = burnOnMap(S, idx);
  if(id === null) return false;
  S.heart = HEART_EVERY;
  emit(S, {k: 'toast', t: `餵了${treasure(id).n}，心臟安靜了`});
  return true;
}
/* 哥布林：贓物歸還。boss＝true 時全數歸還（不看背包格數，這一趟反正要結束）；菁英只還到背包塞得下 */
function returnPouch(S, boss){
  const p = S.pouch || (S.pouch = []);
  if(!p.length) return;
  let n = 0;
  while(p.length && (boss || S.bag.length < S.bagCap)){ addTreasure(S, p.shift()); n++; }
  if(boss) S.bossBack = (S.bossBack | 0) + n;
  if(n) emit(S, {k: 'toast', t: `贓物拿回來了，${n} 件${p.length ? `（背包裝不下，還有 ${p.length} 件留在袋裡）` : ''}`});
}
function stealOnWin(S, b){
  if(b.kind === 'boss'){ returnPouch(S, true); return; }
  if(b.kind === 'elite'){ returnPouch(S, false); return; }
  if(b.turn <= GOB_STEAL_TURN || !S.bag.length) return;
  const id = removeTreasure(S, rint(S, S.bag.length));
  fixHp(S);
  (S.pouch || (S.pouch = [])).push(id);
  emit(S, {k: 'toast', t: `這場拖了 ${b.turn} 回合，哥布林順走了${treasure(id).n}`});
}
/* 玩家傷害（含異變）：我方所有輸出都過這裡 */
const dmgOut = (S, v) => Math.floor(v * (mutOf(S).dmgOut || 1));

/* —— 職業 —— */
const clsOf = S => (S && CLASSES[S.cls]) ? S.cls : 'sword';       // 舊局沒有 cls ＝ 劍士
const clsDef = S => CLASSES[clsOf(S)];
const clsUnlocked = (meta, id) => !!CLASSES[id] && (meta.depth || 0) >= CLASSES[id].need;
const clsHand = S => clsDef(S).hand || GAME.hand;
/* 噩夢階：S.nm 是這趟的階數（舊局沒有 ＝ 0），規則逐階累積，條件一律寫 nmOn(S, 階數) */
const nmOn = (S, k) => (S.nm || 0) >= k;
const hasAch = (S, id) => (S.unlocked || []).includes(id);   // 這一趟開局時已達成的成就（解鎖牌與裝備用）
const curseCount = S => S.bag.filter(id => treasure(id).fam === 'curse').length;

/* —— 建立新的一趟 —— */
/* 一趟的存檔格式版本：2＝台階改造（有 mats、敵人帶固定的 dm／seg）。1 的舊局由 migrateRun 升級或作廢 */
const RUN_VER = 2;
/* own：玩家已擁有的裝備 id 清單（回程補缺用；要可 JSON 化，所以直接存進 S）。
   mutation：這一趟的異變 id（MUTATIONS 的鍵）。own、mutation 舊呼叫不傳也行 */
/* qx：委託板帶進來的設定 {quests:[接下的委託 id], markOn:這趟有沒有刻痕, meiStage:梅姐線這趟開放第幾段(0＝沒有)}，由 questStart 產生 */
function newRun(seed, load, depth, own, mutation, cls, nm, unlocked, sup, qx){
  load = load || {};
  depth = Math.max(0, Math.min(DIVE_MAX, depth | 0));   // 一區一階，通關後不再循環加深
  const mu = MUTATIONS[mutation] || {};
  cls = CLASSES[cls] ? cls : 'sword';
  nm = Math.max(0, Math.min(NIGHTMARES.length, nm | 0));
  const hp0 = Math.round((CLASSES[cls].hp + (load.hp || 0)) * (mu.hpMul || 1) * (nm >= 5 ? 0.9 : 1));
  const S = {
    v: RUN_VER, rng: seed | 0, uid: 1, screen: 'map', mats: 0,   // mats：這趟拿到的該區材料份數（活著回去才入帳）
    cls, nm, unlocked: (unlocked || []).slice(), hp: hp0, maxHp: hp0, greed: 0, mutation: MUTATIONS[mutation] ? mutation : null, evSeen: [],
    load, depth, own: (own || []).slice(), bagCap: Math.max(2, GAME.bag + (load.bag || 0) + (mu.bag || 0)),
    deck: CLASSES[cls].deck.map(id => ({id, up: 0})),
    bag: [], at: null, map: null, battle: null, reward: null, event: null, result: null,
    stats: {kills: 0, steps: 0, burned: 0, healed: 0, maxGreed: 0},
    pouch: [], lamp: LAMP_START, heart: HEART_EVERY, toll: 0, bossBack: 0,   // 各區第二條規則的狀態（見 rule2Of）
    sup: {}, supHit: {},   // 出發前補給：sup[id]＝1 還沒用上（0＝已用掉）；supHit 記觸發次數
    quests: [], markOn: 0, meiStage: 0, book: 0, qc: newQc(),   // 委託：接下的委託、刻痕開關、梅姐線這趟開放第幾段、有沒有帳本、整趟計數器
  };
  SUPPLIES.forEach(u => { if(sup && sup[u.id]) S.sup[u.id] = 1; });
  qx = qx || {};
  S.quests = [...new Set(qx.quests || [])].filter(id => QUESTS[id]).slice(0, QUEST_MAX);
  S.markOn = qx.markOn ? 1 : 0;
  S.meiStage = qx.meiStage | 0;
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
  /* 梅姐第三段、下潛到舊都：中段保證一個銀匠密室（換掉該列一個節點；每個節點都有進有出，所以一定走得到） */
  if(S.meiStage === 3 && regionIdx(S.depth) === MEI_STAGES[2].region){
    const row = rows[Math.min(VAULT_ROW, rows.length - 2)], n = row[rint(S, row.length)];
    n.t = 'vault';
    delete n.reward;
  }
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
const stepGreedOf = S => GAME.stepGreed + (mutOf(S).step || 0);
function addGreed(S, n){
  const before = greedTierIndex(S.greed);
  S.greed = Math.max(0, S.greed + n);
  S.stats.maxGreed = Math.max(S.stats.maxGreed || 0, S.greed);
  const after = greedTierIndex(S.greed);
  if(S.qc) S.qc.maxTier = Math.max(S.qc.maxTier || 0, after);
  if(after !== before) emit(S, {k: 'tier', up: after > before, n: GREED_TIERS[after].n});
}

/* —— 財寶 —— */
const FAM_ORDER = ['gold', 'relic', 'curse'];
const FAM_W = {gold: 0.4, relic: 0.4, curse: 0.2};   // 不指定類別時的抽中比例
function rollFam(S){
  let x = rand(S);
  for(const f of FAM_ORDER){ if((x -= FAM_W[f]) < 0) return f; }
  return 'gold';
}
/* 在某一類內抽一件：貪婪階級的 bias 越小越偏向該類較貴重（較後面）的；boost 直接往後推 */
function rollTreasure(S, boost, fam){
  fam = fam || rollFam(S);
  const pool = TREASURES.filter(t => t.fam === fam);
  const p = greedTier(S).bias;
  /* 深層撿到的東西往貴的那頭偏一格：淺層與深層的報酬是兩個台階，要不要往下仍是貪婪的抉擇 */
  const i = Math.min(pool.length - 1, Math.floor(Math.pow(rand(S), p) * pool.length) + (boost || 0) + segOf(S));
  /* 刻痕只出現在金銀類，而且這趟要有開（meta.depth ≥ MEI_MARK_NEED）；沒開的局不多抽這一次亂數，舊的亂數順序不變 */
  if(S.markOn && fam === 'gold' && rand(S) < MEI_MARK_P) return pool[i].id + '*';
  return pool[i].id;
}
/* 三角刻痕（梅姐線）：帶刻痕的財寶，id 後面多一個 '*'。刻痕跟著財寶實例走（背包、獎勵選項、被偷再拿回來都不會丟），所以讀財寶資料一律走 treasure() */
const isMarked = id => typeof id === 'string' && id.endsWith('*');
const baseId = id => isMarked(id) ? id.slice(0, -1) : id;
const treasure = id => TREASURES.find(t => t.id === baseId(id));
/* 三選一要混類：有多個選項時至少一個遺物、至少一個金銀或詛咒；同一次不重複 */
function rollLoot(S, n, boost){
  if(n >= 3){ n += mutOf(S).loot || 0; if(nmOn(S, 8)) n = Math.max(2, n - 1); }   // 鏡像：多一個選項；噩夢 8：少一個（最少 2）
  const out = [];
  const add = fam => {
    for(let g = 0; g < 12; g++){
      const id = rollTreasure(S, boost, fam);
      if(!out.includes(id)){ out.push(id); return; }
    }
  };
  if(n >= 2){ add('relic'); add(rand(S) < 0.35 ? 'curse' : 'gold'); }
  let guard = 0;
  while(out.length < n && guard++ < 40) add(null);
  return shuffle(S, out);
}
/* 賣價倍率（異變）。撤離確認、背包、戰利品、結算全部走 treasureValue，數字才會一致 */
function sellMul(S, id){
  const m = mutOf(S);
  return (m.sell || 1) * ((m.sellFam && m.sellFam[treasure(id).fam]) || 1) * (1 + NM_SELL * (S.nm || 0));   // 噩夢：每階賣價 +10%
}
/* 每一區一個價格台階（TIER_VALUE） */
const treasureValue = (S, id) => Math.round(treasure(id).v * TIER_VALUE[tierIdx(S)] * sellMul(S, id));
const bagValue = S => S.bag.reduce((s, id) => s + treasureValue(S, id), 0);
function addTreasure(S, id){
  S.bag.push(id);
  addGreed(S, treasure(id).g);
  const mh = treasure(id).maxHp;
  if(mh){ S.maxHp += mh; S.hp = Math.max(1, Math.min(S.hp, S.maxHp)); }
  emit(S, {k: 'coin'});
}
function removeTreasure(S, idx){
  const [id] = S.bag.splice(idx, 1);
  addGreed(S, -treasure(id).g);
  if(treasure(id).maxHp) S.maxHp -= treasure(id).maxHp;   // 丟掉最大生命的詛咒，上限回來（生命不會跟著補）
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
/* 某一類財寶裡最便宜／最貴的那件（沒有回 -1） */
function famIdx(S, fam, pricey){
  let b = -1;
  S.bag.forEach((id, i) => {
    const t = treasure(id);
    if(t.fam !== fam) return;
    if(b < 0 || (pricey ? t.v > treasure(S.bag[b]).v : t.v < treasure(S.bag[b]).v)) b = i;
  });
  return b;
}

/* —— 技能資料（套用強化） —— */
function cardDef(c){
  const d = CARDS[c.id];
  return c.up ? Object.assign({}, d, d.up) : d;
}
function rollCards(S, n, rareBias){
  const cl = clsOf(S);
  const pool = Object.keys(CARDS).filter(id => CARDS[id].r >= 1 && (!CARDS[id].cls || CARDS[id].cls === cl) && (!CARDS[id].ach || hasAch(S, CARDS[id].ach)));
  const out = [];
  let guard = 0;
  while(out.length < n && guard++ < 60){
    const wantRare = rand(S) < rareBias;
    const id = rpick(S, pool.filter(k => (CARDS[k].r === 2) === wantRare));
    if(!out.includes(id)) out.push(id);
  }
  return out;
}

/* 戰鬥獎勵的技能選項數（鍛爐多 1 個，而且全部已強化） */
const cardOptN = S => Math.max(2, 3 + (mutOf(S).cards || 0) - (nmOn(S, 8) ? 1 : 0));

/* —— 進入節點 —— */
function canEnter(S, r, c){ return reachable(S).some(p => p[0] === r && p[1] === c); }
function enterNode(S, r, c){
  if(S.screen !== 'map' || !canEnter(S, r, c)) return false;
  const n = S.map[r][c];
  S.at = [r, c];
  n.done = 1;
  S.stats.steps++;
  if(n.t !== 'exit') enterRule2(S);
  addGreed(S, stepGreedOf(S));
  if(S.qc){
    if(n.t === 'boss'){ S.qc.bossFights = S.qc.fights; S.qc.bossStops = S.qc.stops; }   // 進首領房的那一刻，記下這趟打過幾場、停過幾處
    else if(n.t === 'chest' || n.t === 'rest' || n.t === 'event' || n.t === 'vault') S.qc.stops++;
  }
  if(n.t === 'exit'){ finishRun(S, true, '從繩梯爬回地面'); return true; }
  if(n.t === 'fight') startBattle(S, encounter(S, r), 'fight', n.reward);
  else if(n.t === 'elite') startBattle(S, pickElite(S), 'elite');
  else if(n.t === 'boss') startBattle(S, [regionOf(S.depth).boss], 'boss');
  else if(n.t === 'rest') S.screen = 'rest';
  else if(n.t === 'chest') openChest(S);
  else if(n.t === 'event') startEvent(S);
  else if(n.t === 'vault'){ S.vault = {n: 1}; S.screen = 'vault'; }
  return true;
}
/* 淺層從第 0、1 組抽，深層從第 1、2 組抽（同一段內不再一列比一列硬） */
function encounter(S, r){
  const enc = regionOf(S.depth || 0).enc;
  return rpick(S, r < DEEP_ROW ? enc[0].concat(enc[1]) : enc[1].concat(enc[2])).slice();
}
/* —— 台階：現在在哪一段（0 淺層／1 深層），敵人強度與財寶都看這個 —— */
const segOf = S => (S.at && S.at[0] >= DEEP_ROW) ? 1 : 0;
const tierIdx = S => Math.max(0, Math.min(TIER_FOE.length - 1, regionIdx(S.depth)));
/* 某種敵人在這一區、這一段的固定倍率（不含貪婪／異變／噩夢）。boss 一律用 TIER_BOSS */
function tierMul(S, d, k){
  const t = tierIdx(S);
  if(d.boss) return TIER_BOSS[t][k];
  return TIER_FOE[t][k] * (segOf(S) ? SEG_DEEP[k] : 1);
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
/* 首領只吃一半的貪婪倍率（血量、傷害）；一般敵與菁英全吃 */
const bossShare = (d, m) => d && d.boss ? 1 + (m - 1) / 2 : m;
/* 敵人的數值在出生時就定案：hp 與傷害倍率 dm 都存在敵人身上，整場不再變（貪婪階級是玩家自己選的，打到一半貪婪變了，傷害照當下的階級算） */
function spawn(S, key){
  const d = ENEMIES[key], T = greedTier(S);
  const hp = Math.round(d.hp * bossShare(d, T.hp) * tierMul(S, d, 'hp') * (mutOf(S).hp || 1) * (nmOn(S, 1) ? 1.1 : 1) * (d.boss && nmOn(S, 4) ? 1.2 : 1));
  const e = {uid: S.uid++, key, n: d.n, hp, max: hp, block: d.boss ? Math.floor(T.start / 2) : T.start, step: 0, str: d.boss && nmOn(S, 10) ? 3 : 0, weak: 0, vuln: 0, psn: 0, mk: 0,
             traits: [], revived: 0, loot: [], gone: 0, boss: !!d.boss, elite: !!d.elite,
             dm: tierMul(S, d, 'dmg'), seg: d.boss ? 2 : segOf(S), buffed: 0};
  const pool = shuffle(S, Object.keys(TRAITS));
  const nmTrait = d.boss ? 0 : d.elite ? (nmOn(S, 2) ? 1 : 0) : (nmOn(S, 6) ? 1 : 0);   // 噩夢 2：菁英；噩夢 6：一般敵
  e.traits = pool.slice(0, T.traits + (d.boss ? 0 : mutOf(S).trait || 0) + nmTrait);
  return e;
}
function startBattle(S, keys, kind, reward){
  const cards = S.deck.map(c => ({id: c.id, up: c.up}));
  for(let i = carry(S).goo; i > 0; i--) cards.push({id: 'goo', up: 0});   // 黑契約書
  const b = {
    kind, reward: reward || null, turn: 0, phase: 'player', ei: 0,
    enemies: keys.map(k => spawn(S, k)), target: 0,
    draw: shuffle(S, cards.map(c => ({id: c.id, up: c.up, uid: S.uid++}))), hand: [], disc: [], exh: [],
    ap: 0, block: 0, str: 0, weak: 0, vuln: lampDark(S) ? LAMP_DARK_VULN : 0, psn: 0, scars: 0, keep: 0, burned: 0, burn: 0, apLoss: 0,
    mana: clsDef(S).mana0 || 0, played: 0, counter: 0, spikes: 0, still: 0,
  };
  S.battle = b;
  S.screen = 'battle';
  emit(S, {k: 'battle'});
  if(lampDark(S)) emit(S, {k: 'toast', t: `燈滅了，開場帶 ${LAMP_DARK_VULN} 層易傷`});
  /* 制魔師：身上每件詛咒財寶，開場給全體敵人 1 層咒印 */
  if(clsOf(S) === 'warlock'){
    const n = curseCount(S);
    if(n) b.enemies.forEach(e => { e.mk += n; });
  }
  startTurn(S);
  if(S.screen !== 'battle') return;   // 詛咒的失血在第一回合就可能致死
  /* 素質、裝備、身上財寶的開場效果。放在 startTurn 之後，開場格擋才不會被第一回合的衰減砍半 */
  const c = carry(S);
  b.str += (S.load.str || 0) + c.str;
  b.block += (S.load.blk || 0) + c.blk + (S.load.hoard || 0) * S.bag.filter(id => treasure(id).fam === 'gold').length;   // 守財奴印
  b.ap += c.apFirst;
  if(S.sup && S.sup.wine){   // 出發前補給：烈酒，只有第一場戰鬥
    S.sup.wine = 0;
    S.supHit.wine = (S.supHit.wine || 0) + 1;
    b.ap += 1;
    emit(S, {k: 'toast', t: '烈酒下肚，這一場行動點 +1'});
  }
  /* 職業與貪婪／財寶的互動被動 */
  const gi = greedTierIndex(S.greed);
  let itch = 0;
  if(clsOf(S) === 'sword' && S.bag.length){
    const n = S.bag.length * SWORD_LOAD_BLK;
    b.block += n;
    emit(S, {k: 'toast', t: `負重：格擋 +${n}`});
  }
  if(clsOf(S) === 'rogue' && gi > 0){
    itch = Math.min(ROGUE_ITCH_MAX, gi);
    emit(S, {k: 'toast', t: `手癢：多抽 ${itch} 張`});
  }
  if(clsOf(S) === 'mage' && gi > 0){
    const n = Math.min(MAGE_RESO_MAX, gi);
    gainMana(S, n);
    emit(S, {k: 'toast', t: `共鳴：法力 +${n}`});
  }
  drawCards(S, (S.load.drawFirst || 0) + c.drawFirst + itch);
}
/* 制魔師「飼主」：戰鬥中餵掉一件財寶（行動點、獻祭、熔金都算）的額外好處；詛咒財寶加倍 */
function feedBonus(S, id){
  if(clsOf(S) !== 'warlock' || !S.battle || S.screen !== 'battle') return;
  const m = treasure(id).fam === 'curse' ? 2 : 1;
  S.battle.str += LOCK_FEED_STR * m;
  emit(S, {k: 'buff', t: `飼主：力量 +${LOCK_FEED_STR * m}`});
  heal(S, LOCK_FEED_HEAL * m);
}
/* 身上財寶的效果加總：撿到就生效，餵掉或被偷就沒了 */
function carry(S){
  const c = {blk: 0, str: 0, drawFirst: 0, blkTurn: 0, apFirst: 0, bleed: 0, drawLess: 0, goo: 0, hurtPlus: 0};
  S.bag.forEach(id => { const t = treasure(id); for(const k in c) c[k] += t[k] || 0; });
  return c;
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
  b.counter = 0;   // 反擊架勢只管一個回合
  b.ap = GAME.ap + (S.load.ap || 0) + (S.load.gamble && S.hp * 2 < S.maxHp ? 1 : 0);   // 賭徒背心：生命低於一半
  /* 燒掉行動點（噬光獸）：至少留 1 點。聚落：第一回合再少 1 */
  if(b.apLoss){ b.ap = Math.max(1, b.ap - b.apLoss); b.apLoss = 0; }
  if(b.turn === 1 && ruleOf(S) === 'ap') b.ap = Math.max(1, b.ap - 1);
  /* 熔獄：第 rageTurn 回合熔爐沸騰一次，敵人力量 +rageStr（放在回合開始，意圖的數字才看得到）。一場只有一次 */
  if(b.turn === GAME.rageTurn && ruleOf(S) === 'rage' && !b.raged){
    b.raged = 1;
    alive(b).forEach(e => { e.str += GAME.rageStr; emit(S, {k: 'ebuff', uid: e.uid, t: `沸騰！力量 +${GAME.rageStr}`}); });
    emit(S, {k: 'toast', t: `熔爐沸騰了一次：敵人力量 +${GAME.rageStr}（這一場不會再沸騰）`});
  }
  b.burned = 0;
  b.atkUsed = 0;
  b.played = 0;
  /* 劍士的職業規則：格擋只衰減一半，所以防禦可以累積；其他職業每回合清空 */
  if(clsOf(S) === 'sword') b.block = (b.keep || b.still || S.load.noDecay) ? b.block : Math.floor(b.block / 2);
  else b.block = (S.load.noDecay || b.still) ? b.block : 0;
  b.keep = 0;
  b.block += (S.load.blkTurn || 0) + carry(S).blkTurn;
  if(b.psn > 0){
    loseHp(S, b.psn, 'poison');
    b.psn--;
    if(S.screen !== 'battle') return;
  }
  const c = carry(S);
  if(c.bleed){
    loseHp(S, c.bleed, 'curse');
    if(S.screen !== 'battle') return;
  }
  if(S.load.greedBlk) b.block += S.load.greedBlk * greedTierIndex(S.greed);   // 貪婪天平
  drawCards(S, Math.max(1, clsHand(S) + (mutOf(S).draw || 0) - c.drawLess - (b.turn === 1 && nmOn(S, 7) ? 1 : 0)));
  fixTarget(b);
}

/* 預覽與結算共用同一條公式，卡面數字才不會跟實際打出去的不一樣 */
function baseDmg(S, def, t){
  const b = S.battle;
  if(def.fn === 'ram') return b.block + (def.bonus || 0);
  if(def.fn === 'debt') return def.base + def.per * b.scars;
  if(def.fn === 'fling') return def.base + Math.floor(S.greed / 4);
  if(def.fn === 'melt') return S.bag.length ? def.base : 0;
  if(def.fn === 'heavy') return def.dmg + (b.block >= def.thr ? def.plus : 0);
  if(def.fn === 'allin') return Math.floor(b.block * def.mul);
  if(def.fn === 'pop') return t ? (t.psn || 0) * def.mul : 0;
  if(def.fn === 'det') return t ? (t.mk || 0) * def.per : 0;
  if(def.fn === 'doom') return def.base + def.per * (t ? t.mk || 0 : 0);
  if(def.fn === 'curse') return def.base + def.per * curseCount(S);
  if(def.fn === 'bagdmg') return def.base + def.per * S.bag.length;
  if(def.fn === 'finish' && t && t.hp < t.max * 0.4) return def.dmg * 2;
  return def.dmg || 0;
}
function calcDmg(S, def, t){
  const b = S.battle;
  const base = baseDmg(S, def, t);
  if(base <= 0) return 0;
  const L = S.load, atk = def.k === 'atk';
  let v = base + b.str;
  if(def.sp && def.mx) v += def.mx * (b.mana || 0);                // 法師：法術吃法力
  if(def.cmb) v += def.cmb * (b.played || 0);                      // 盜賊：連擊
  if(t && t.mk) v += t.mk;                                         // 制魔師：咒印
  if(L.curseStr) v += L.curseStr * S.bag.filter(id => treasure(id).fam === 'curse').length;   // 黑契護符
  if(def.gt) v += def.gt * greedTierIndex(S.greed);                                            // 深淵凝視
  if(L.greedDmg) v += L.greedDmg * greedTierIndex(S.greed);                                    // 貪婪之鉤
  if(atk && L.scarDmg) v += L.scarDmg * b.scars;                                               // 血痕披風
  if(L.firstAtk && !b.atkUsed && atk) v += L.firstAtk;
  if(L.thirdAtk && atk && b.atkUsed === 2) v *= 2;                                             // 連擊短刃：本回合第 3 張攻擊牌
  if(b.weak > 0) v *= 0.75;
  if(t && t.vuln > 0) v *= 1.5;
  return dmgOut(S, v);
}
function hitEnemy(S, e, amt){
  if(S.screen !== 'battle' || e.hp <= 0 || e.gone) return;   // 帶刺反彈可能在連擊中途打死玩家
  /* 閃避：敵人自己的閃避率，加上舊都的區域規則（12%）。有機率才抽，不影響沒有閃避的區域的亂數 */
  const dg = 1 - (1 - (ENEMIES[e.key].dodge || 0)) * (1 - (ruleOf(S) === 'dodge' ? 0.12 : 0));
  if(dg > 0 && rand(S) < dg){ emit(S, {k: 'dodge', uid: e.uid}); return; }
  const absorbed = Math.min(e.block, amt);
  e.block -= absorbed;
  const real = amt - absorbed;
  e.hp -= real;
  emit(S, {k: 'hit', uid: e.uid, amt: real, blocked: absorbed});
  if(e.traits.includes('thorn')) hitPlayer(S, 2);
  if(S.screen !== 'battle') return;
  if(e.hp > 0){ checkPhase(S, e); return; }
  killEnemy(S, e);
}
/* 敵人生命歸零的統一收尾（攻擊、反彈、毒都走這裡）：復活、擊殺回復、歸還贓物、首領倒下小怪散掉 */
function killEnemy(S, e){
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
  if(S.load.killHeal) heal(S, S.load.killHeal);
  e.loot.forEach(id => { addTreasure(S, id); emit(S, {k: 'toast', t: `拿回了${treasure(id).n}`}); });
  e.loot = [];
  /* 首領一倒，叫出來的小怪跟著散掉，不用再清場 */
  if(e.boss) S.battle.enemies.forEach(x => { if(x !== e && x.hp > 0) x.gone = 1; });
}
/* 血量過半：力量大增（亡城之主）、換形態（深淵之心） */
function checkPhase(S, e){
  const d = ENEMIES[e.key];
  if(e.hp <= 0 || e.hp > e.max / 2) return;
  /* 嗜血詞綴：過半時力量 +3，一場一次（不再每回合疊） */
  if(e.traits.includes('frenzy') && !e.frenzied){
    e.frenzied = 1;
    e.str += 3;
    emit(S, {k: 'ebuff', uid: e.uid, t: '嗜血！力量 +3'});
  }
  if(d.half && !e.half){
    e.half = 1;
    e.str += d.half.str;
    emit(S, {k: 'ebuff', uid: e.uid, t: `${d.half.nm || '狂怒'}！力量 +${d.half.str}`});
  }
  if(d.form2 && !e.form){
    e.form = 1;
    e.step = 0;
    e.charged = 0;
    e.n = d.form2.n || e.n;
    const h = Math.round(e.max * (d.form2.heal || 0));
    e.hp = Math.min(e.max, e.hp + h);
    if(d.form2.str) e.str += d.form2.str;   // 換形態時一次加力量（不再每回合成長）
    emit(S, {k: 'form', uid: e.uid, t: `${e.n}！${d.form2.str ? `力量 +${d.form2.str}` : ''}`});
  }
}
/* 走格擋的傷害 */
/* 玩家實際承受的傷害：異變倍率與裂魂匣。意圖數字（enemyHitValue）已經算過，所以敵人攻擊傳 final 不再算第二次 */
function playerTakes(S, v){
  if(v <= 0) return v;
  return Math.floor(v * (mutOf(S).dmgIn || 1)) + carry(S).hurtPlus;
}
function hitPlayer(S, amt, srcUid, final){
  const b = S.battle;
  if(!final) amt = playerTakes(S, amt);
  const absorbed = Math.min(b.block, amt);
  b.block -= absorbed;
  const real = amt - absorbed;
  emit(S, {k: 'hurt', amt: real, blocked: absorbed, src: srcUid});
  if(real > 0){
    b.scars++;
    S.hp -= real;
    checkDead(S);
  }
  /* 荊棘胸甲：被敵人攻擊就反彈（有格擋擋下也算） */
  if(S.load.thorns && srcUid && S.screen === 'battle'){
    const e = b.enemies.find(x => x.uid === srcUid);
    if(e) hitEnemy(S, e, dmgOut(S, S.load.thorns));
  }
  /* 劍士的反擊架勢（本回合）與釘刺盾（整場）：被攻擊就反彈，有格擋擋下也算 */
  const refl = (b.counter || 0) + (b.spikes || 0);
  if(refl > 0 && srcUid && S.screen === 'battle'){
    const e = b.enemies.find(x => x.uid === srcUid);
    if(e) hitEnemy(S, e, dmgOut(S, refl));
  }
}
/* 不走格擋的失血（毒、搏命），不算傷痕 */
function loseHp(S, amt, why){
  S.hp -= amt;
  emit(S, {k: 'hurt', amt, blocked: 0, why});
  checkDead(S);
}
function checkDead(S){
  /* 不死者殮衣：每場戰鬥一次，致命傷改為剩 1 生命並獲得 8 格擋 */
  if(S.hp <= 0 && S.screen === 'battle' && S.load.lastStand && !S.battle.lastUsed){
    S.battle.lastUsed = 1;
    S.hp = 1;
    S.battle.block += 8;
    emit(S, {k: 'toast', t: '殮衣替你擋下致命一擊'});
    return;
  }
  if(S.hp <= 0 && S.screen === 'battle'){
    S.hp = 0;
    finishRun(S, false, S.battle.kind === 'boss' ? `倒在${bossName(S)}前` : `倒在${depthName(S.depth)}裡`);
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
const DMG_FN = ['ram', 'heavy', 'allin', 'debt', 'fling', 'pop', 'det', 'doom', 'curse', 'bagdmg'];
/* 法師：法力上限 MANA_MAX，跨回合保留 */
function gainMana(S, n){
  const b = S.battle, before = b.mana || 0;
  b.mana = Math.min(MANA_MAX, before + n);
  if(b.mana > before) emit(S, {k: 'mana', amt: b.mana - before});
}
/* 格擋牌的實際格擋值（法術牌每點法力加成），卡面與實際打出共用 */
function blockOf(S, d){
  const b = S.battle;
  return (d.blk || 0) + (d.sp && d.mb && b ? d.mb * (b.mana || 0) : 0) + (d.cb ? d.cb * curseCount(S) : 0);
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
    /* 先算傷害（calcDmg 要看背包有沒有東西）再餵 */
    const dmg = calcDmg(S, d, t);
    const k = cheapestIdx(S);
    if(k >= 0){ const fid = removeTreasure(S, k); S.stats.burned++; emit(S, {k: 'burn'}); feedBonus(S, fid); hitEnemy(S, t, dmg); }
  }else if(d.all && (d.dmg || d.fn)){
    alive(b).forEach(e => { if(S.screen === 'battle') hitEnemy(S, e, calcDmg(S, d, e)); });
  }else if(d.dmg || DMG_FN.includes(d.fn)){
    const hits = d.hits || 1;
    const echo = S.load.echoHit && d.k === 'atk' && !b.atkUsed;   // 迴響長劍：每回合第一張攻擊牌，最後再追打一次一半傷害
    for(let h = 0; h < hits; h++){
      if(S.screen !== 'battle' || t.hp <= 0 || t.gone) break;
      hitEnemy(S, t, calcDmg(S, d, t));
    }
    if(echo && S.screen === 'battle' && t.hp > 0 && !t.gone) hitEnemy(S, t, Math.max(1, Math.floor(calcDmg(S, d, t) / 2)));
  }
  if(S.screen !== 'battle') return true;
  if(d.vuln && t.hp > 0) t.vuln += d.vuln;
  if(d.fn === 'allin') b.block = 0;
  if(d.fn === 'still') b.still = 1;
  if(d.counter) b.counter = (b.counter || 0) + d.counter;
  if(d.spikes) b.spikes = (b.spikes || 0) + d.spikes;
  if(d.fn === 'pop' || d.fn === 'det'){ if(d.fn === 'pop') t.psn = 0; else t.mk = 0; }
  if(d.psn && t.hp > 0){ t.psn += d.psn; emit(S, {k: 'epsn', uid: t.uid, t: `毒 +${d.psn}`}); }
  if(d.dpsn && t.hp > 0 && t.psn){ t.psn *= 2; emit(S, {k: 'epsn', uid: t.uid, t: `毒 ×2（${t.psn}）`}); }
  if(d.apsn) alive(b).forEach(e => { e.psn += d.apsn; emit(S, {k: 'epsn', uid: e.uid, t: `毒 +${d.apsn}`}); });
  if(d.mk && t.hp > 0){ t.mk = (t.mk || 0) + d.mk; emit(S, {k: 'emk', uid: t.uid, t: `咒印 +${d.mk}`}); }
  if(d.fn === 'sac'){
    const k = famIdx(S, 'curse', true);
    if(k >= 0){ const fid = removeTreasure(S, k); S.stats.burned++; emit(S, {k: 'burn'}); feedBonus(S, fid); }
    else { emit(S, {k: 'toast', t: '身上沒有詛咒財寶，獻祭沒有效果'}); }
    if(k < 0){ b.disc.push(c); b.played++; return true; }
  }
  if(d.amk) alive(b).forEach(e => { e.mk = (e.mk || 0) + d.amk; emit(S, {k: 'emk', uid: e.uid, t: `咒印 +${d.amk}`}); });
  if(d.mana) gainMana(S, d.mana);
  const blkv = blockOf(S, d);
  if(blkv){ b.block += blkv; emit(S, {k: 'block', amt: blkv}); }
  if(d.sp && !d.nokeep && b.mana){ emit(S, {k: 'toast', t: `法力 ${b.mana} 化為法術`}); b.mana = 0; }
  if(d.keep) b.keep = 1;
  if(d.str){ b.str += d.str; emit(S, {k: 'buff', t: `力量 +${d.str}`}); }
  if(d.fn === 'rage'){ if(b.scars){ b.str += b.scars; emit(S, {k: 'buff', t: `力量 +${b.scars}`}); } b.scars = 0; }
  if(d.heal){ heal(S, d.heal); }
  if(d.ap) b.ap += d.ap;
  if(d.greed) addGreed(S, d.greed);
  if(d.draw) drawCards(S, d.draw);
  if(d.k === 'atk') b.atkUsed = (b.atkUsed || 0) + 1;
  b.played = (b.played || 0) + 1;
  (d.exhaust ? b.exh : b.disc).push(c);
  checkWin(S);
  if(S.screen === 'battle') fixTarget(b);
  return true;
}
/* 回血的單一入口。鍛爐異變下只有營火（force）能回血 */
const healAllowed = S => !mutOf(S).noHeal;
/* 無光通道：所有回復量 -25% */
const healScale = (S, n) => ruleOf(S) === 'heal' && n > 0 ? Math.max(1, Math.round(n * 0.75)) : n;
function heal(S, n, force, scaled){
  if(!force && !healAllowed(S)) return;
  if(!scaled) n = healScale(S, n);
  const before = S.hp;
  S.hp = Math.min(S.maxHp, S.hp + n);
  if(S.hp > before){ emit(S, {k: 'heal', amt: S.hp - before}); S.stats.healed = (S.stats.healed || 0) + (S.hp - before); }
}
const burnApGain = S => GAME.burnAp + (S.load.burnAp || 0);   // 煉金戒
/* 餵食財寶：每回合一次，換行動點，貪婪也跟著降——危急時的買命錢 */
function burnTreasure(S, idx){
  const b = S.battle;
  if(!b || b.phase !== 'player' || b.burned || !S.bag[idx]) return false;
  const fid = removeTreasure(S, idx);
  b.burned = 1;
  b.ap += burnApGain(S);
  S.stats.burned++;
  emit(S, {k: 'burn'});
  feedBonus(S, fid);
  return true;
}
function endTurn(S){
  const b = S.battle;
  if(!b || b.phase !== 'player') return false;
  /* 盾擊戰錘：回合結束，把手上的格擋砸出去（可能打死最後一隻，這時戰鬥已結束） */
  if(S.load.blkSlam && b.block > 0){
    fixTarget(b);
    const t = b.enemies[b.target];
    if(t && t.hp > 0 && !t.gone) hitEnemy(S, t, dmgOut(S, Math.floor(b.block * S.load.blkSlam)));
    if(checkWin(S) || S.screen !== 'battle') return true;
  }
  /* 燃燒：回合結束失去生命（不走格擋），之後減 1 */
  if(b.burn > 0){
    const n = b.burn;
    b.burn--;
    loseHp(S, n, 'burn');
    if(S.screen !== 'battle') return true;
  }
  /* 法師：沒用完的行動點存成法力 */
  if(clsOf(S) === 'mage' && b.ap > 0) gainMana(S, b.ap);
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
/* 加力量的招式（str 給自己、astr 給友軍）每隻敵人一場只生效一次；用過之後同一招只剩其他效果，
   什麼都不剩就換成 alt（沒有 alt 就格擋 5）。預告與實際行動都走這裡 */
function spentMove(p){
  const q = Object.assign({}, p);
  delete q.str; delete q.astr; delete q.all; delete q.alt;
  const left = Object.keys(q).some(k => k !== 'nm' && q[k]);
  return left ? q : (p.alt || {d: 5, nm: p.nm});
}
function intent(S, e){
  const pat = edef(e).pat;
  const p = pat[e.step % pat.length];
  return e.buffed && (p.str || p.astr) ? spentMove(p) : p;
}
/* 敵人的傷害倍率：出生時定案的 e.dm（舊局沒有就照現在的段落補算） */
const foeDm = (S, e) => Number.isFinite(e.dm) ? e.dm : tierMul(S, edef(e), 'dmg');
function enemyHitValue(S, e, base){
  const b = S.battle;
  let v = Math.round(base * bossShare(edef(e), greedTier(S).dmg) * foeDm(S, e) * (nmOn(S, 9) ? 1.15 : 1)) + e.str;
  if(e.weak > 0) v *= 0.75;
  if(b.vuln > 0) v *= 1.5;
  return playerTakes(S, Math.floor(v));
}
function enemyAct(S, e){
  const b = S.battle;
  if(e.traits.includes('tough')) e.block += 4;
  if(e.psn > 0){
    e.hp -= e.psn;
    emit(S, {k: 'hit', uid: e.uid, amt: e.psn, blocked: 0});
    e.psn--;
    if(e.hp <= 0){ killEnemy(S, e); return; }   // 毒殺與普通擊殺一致（復活也行）；戰鬥是否結束由 enemyStep 的 checkWin 判斷
    checkPhase(S, e);
  }
  const p = intent(S, e);
  e.step++;
  if(p.str || p.astr) e.buffed = 1;   // 加力量的招式只生效這一次
  e.charged = p.charge ? 1 : 0;   // 蓄力：這回合不攻擊，下一招（資料保證是攻擊）就是重擊
  emit(S, {k: 'act', uid: e.uid, nm: p.nm || ''});
  if(p.a){
    const x = p.x || 1, hp0 = S.hp;
    for(let i = 0; i < x && S.screen === 'battle' && e.hp > 0 && !e.gone; i++) hitPlayer(S, enemyHitValue(S, e, p.a), e.uid, true);
    if(S.screen !== 'battle') return;
    /* 吸血：打掉你多少生命，自己就回多少（被格擋擋掉的不算） */
    const lost = hp0 - S.hp;
    if(p.drain && lost > 0 && e.hp > 0){
      const g = Math.min(e.max - e.hp, lost);
      if(g > 0){ e.hp += g; emit(S, {k: 'eheal', uid: e.uid, amt: g}); }
    }
  }
  if(p.d){ e.block += p.d; emit(S, {k: 'eblock', uid: e.uid, amt: p.d}); }
  if(p.str){ e.str += p.str; }
  /* 友軍增益：不含自己；場上沒有友軍就給自己。all:1 連自己一起 */
  if(p.astr || p.ablk || p.aheal){
    const tg = alive(b).filter(x => x !== e);
    if(!tg.length || p.all) tg.push(e);
    tg.forEach(x => {
      if(p.astr){ x.str += p.astr; emit(S, {k: 'ebuff', uid: x.uid, t: `力量 +${p.astr}`}); }
      if(p.ablk){ x.block += p.ablk; emit(S, {k: 'eblock', uid: x.uid, amt: p.ablk}); }
      if(p.aheal){ const g = Math.min(x.max - x.hp, p.aheal); if(g > 0){ x.hp += g; emit(S, {k: 'eheal', uid: x.uid, amt: g}); } }
    });
  }
  if(p.vuln){ b.vuln += p.vuln; emit(S, {k: 'debuff', t: `易傷 ${p.vuln}`}); }
  if(p.burn){ b.burn = (b.burn || 0) + p.burn; emit(S, {k: 'debuff', t: `燃燒 ${p.burn}`}); }
  if(p.ap){ b.apLoss = (b.apLoss || 0) + p.ap; emit(S, {k: 'debuff', t: `下回合行動點 -${p.ap}`}); }
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
      hitPlayer(S, enemyHitValue(S, e, 7), e.uid, true);
    }
  }
  if(p.flee){
    if(e.loot.length){
      e.gone = 1;
      emit(S, {k: 'flee', uid: e.uid, t: `${e.n}帶著贓物跑了`});
    }else{
      hitPlayer(S, enemyHitValue(S, e, 5), e.uid, true);
    }
  }
  if(S.screen !== 'battle') return;
  /* 自爆：打完這一下就死了（沒算擊殺；偷來的東西還你） */
  if(p.boom && e.hp > 0){
    e.hp = 0;
    emit(S, {k: 'die', uid: e.uid});
    e.loot.forEach(id => { addTreasure(S, id); emit(S, {k: 'toast', t: `拿回了${treasure(id).n}`}); });
    e.loot = [];
    return;
  }
}
function winBattle(S){
  const b = S.battle;
  emit(S, {k: 'win'});
  if(rule2Of(S) === 'steal') stealOnWin(S, b);
  if(S.qc && b.kind !== 'boss'){ S.qc.fights++; if(b.kind === 'elite') S.qc.elites++; }   // 委託計數：打贏的戰鬥（含事件與寶箱怪帶出來的菁英戰）
  const after = b.kind === 'boss' ? 'clear' : 'map';
  /* 材料：菁英、首領一定掉；深層的一般戰鬥有機率掉 1 份（只在深層才抽亂數） */
  const mat = b.kind === 'boss' ? MAT_BOSS : b.kind === 'elite' ? MAT_ELITE : (segOf(S) && rand(S) < MAT_DEEP_P ? 1 : 0);
  if(mat) gainMat(S, mat);
  if(b.kind === 'boss'){
    /* 打贏首領要明顯比中途撤離划算：棺底的深淵晶直接入帳（滿了也塞得進去，算額外獎賞），再挑一件 */
    S.bag.push('gem');
    addGreed(S, treasure('gem').g);
    emit(S, {k: 'coin'});
    const win = regionOf(S.depth || 0).win;
    S.reward = {title: win.title, text: win.text, loot: rollLoot(S, 3, 2), cards: null, after};
  }else if(b.kind === 'elite'){
    S.reward = {title: '戰利品', text: b.rich ? '門後的東西，比菁英身上的還好。' : '菁英身上的東西比較值錢。', loot: rollLoot(S, 3, b.rich ? 2 : 1), cards: rollCards(S, cardOptN(S), 0.4), up: mutOf(S).upCards ? 1 : 0, after};
  }else if(b.reward === 'loot'){
    S.reward = {title: '戰利品', text: '挑一件帶走，或者空手以保持清醒。', loot: rollLoot(S, 3, 0), cards: null, after};
  }else{
    S.reward = {title: '有所領悟', text: '這場仗教了你一招。', loot: null, cards: rollCards(S, cardOptN(S), 0.15), up: mutOf(S).upCards ? 1 : 0, after};
  }
  if(mat) S.reward.mat = mat;   // 獎勵畫面顯示「材料 +n」
  S.battle = null;
  S.screen = 'reward';
}
/* 這趟拿到的材料（不佔背包、不加貪婪；活著回去才入帳） */
function gainMat(S, n){
  S.mats = (S.mats | 0) + n;
  emit(S, {k: 'toast', t: `拿到${MATS[tierIdx(S)].n} ×${n}（這趟共 ${S.mats}）`});
}

/* —— 獎勵 —— */
/* 背包滿了要傳 dropIdx 指定換掉哪一件；回傳 'full' 代表需要先選 */
function takeLoot(S, i, dropIdx){
  const R = S.reward;
  if(!R || !R.loot || !R.loot[i]) return false;
  if(S.bag.length >= S.bagCap){
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
  const id = R.cards[i];
  S.deck.push({id, up: R.up && CARDS[id].up ? 1 : 0});   // 鍛爐：獎勵的技能已強化
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
  if(R && R.after === 'clear') finishRun(S, true, regionOf(S.depth || 0).win.out);
  else S.screen = 'map';
}

/* —— 營火 —— */
const restHealAmt = S => {
  const m = mutOf(S);
  return healScale(S, Math.round(S.maxHp * GAME.restHeal * (m.rest === undefined ? 1 : m.rest) * (nmOn(S, 3) ? 0.7 : 1)));
};
function restHeal(S){
  if(S.screen !== 'rest') return;
  heal(S, restHealAmt(S), true, true);   // 營火是鍛爐下唯一的回血（區域扣減已含在 restHealAmt）
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
/* 同一趟不重複遇到同一個事件（舊存檔沒有 evSeen） */
function startEvent(S){
  S.evSeen = S.evSeen || [];
  let pool = Object.keys(EVENTS).filter(k => !S.evSeen.includes(k));
  if(!pool.length) pool = Object.keys(EVENTS);
  const id = rpick(S, pool);
  S.evSeen.push(id);
  S.event = {id};
  S.screen = 'event';
}
function eventOptEnabled(S, o){
  const need = (o.need || '').split(' ');
  if(need.includes('bag') && !S.bag.length) return false;
  if(need.includes('gold') && famIdx(S, 'gold') < 0) return false;
  if(need.includes('curse') && famIdx(S, 'curse') < 0) return false;
  if(need.includes('room') && S.bag.length >= S.bagCap) return false;
  if(need.includes('deck') && S.deck.length <= 5) return false;
  if(need.includes('heal') && !healAllowed(S)) return false;
  if(o.hp && S.hp <= o.hp) return false;
  return true;
}
/* 事件失血：不會致死（至少留 1），也不算傷痕 */
function evHurt(S, n){
  S.hp = Math.max(1, S.hp - n);
  emit(S, {k: 'hurt', amt: n, blocked: 0});
}
/* 把財寶放進背包；塞不下回傳 false */
function evGive(S, id){
  if(S.bag.length >= S.bagCap) return false;
  addTreasure(S, id);
  return true;
}
const tn = id => treasure(id).n;
/* 回傳：字串＝結果文字（按「繼續」離開）／'reward' 轉到獎勵畫面／'battle' 已進入戰鬥／'pick' 還要挑一張牌／null 直接離開 */
const EVENT_FX = {
  leave(S){ return null; },
  search(S){
    if(rand(S) < 0.55){
      const id = rollTreasure(S, 1);
      if(evGive(S, id)) return `背包底部壓著${tn(id)}。`;
      return `背包底部壓著${tn(id)}，但你已經拿不下了。`;
    }
    evHurt(S, 7);
    return '背包裡有東西先咬了你。失去 7 生命。';
  },
  bet(S){
    const k = cheapestIdx(S);
    const old = removeTreasure(S, k);
    if(rand(S) < 0.5){
      const a = rollTreasure(S, 1), c = rollTreasure(S, 1);
      addTreasure(S, a);
      if(S.bag.length < S.bagCap) addTreasure(S, c);
      return `贏了。它把${tn(a)}和${tn(c)}推過來，笑得很難聽。`;
    }
    return `輸了。${tn(old)}消失在它袖子裡。`;
  },
  blood(S){
    evHurt(S, 8);
    S.reward = {title: '祭壇的回應', text: '血被吸乾了。腦中多了一些不屬於你的招式。', loot: null, cards: rollCards(S, 3, 1), after: 'map'};
    return 'reward';
  },
  offer(S){
    const id = removeTreasure(S, priciestIdx(S));
    heal(S, 25);
    return `${tn(id)}沉進血裡，傷口開始收合。回復 25 生命。`;
  },
  stare(S){
    addGreed(S, 10);
    S.maxHp += 8;
    S.hp += 8;
    return '你覺得自己撐得住更多了。也想要更多了。';
  },
  /* 流浪商人 */
  m_remove(S){
    const old = removeTreasure(S, cheapestIdx(S));
    S.event.pick = 'remove';
    S.event.note = `商人把${tn(old)}塞進袖口。「想讓哪一張技能從你腦子裡消失？」`;
    return 'pick';
  },
  m_relic(S){
    const old = removeTreasure(S, cheapestIdx(S));
    const loot = [];
    for(let g = 0; g < 20 && loot.length < 3; g++){ const id = rollTreasure(S, 1, 'relic'); if(!loot.includes(id)) loot.push(id); }
    S.reward = {title: '商人的貨架', text: `${tn(old)}換到一次挑選的機會。`, loot, cards: null, after: 'map'};
    return 'reward';
  },
  /* 許願井 */
  wish_heal(S){
    const id = removeTreasure(S, famIdx(S, 'gold'));
    heal(S, 20);
    return `${tn(id)}沉下去，沒有聲音。傷口暖了起來，回復 20 生命。`;
  },
  wish_relic(S){
    const id = removeTreasure(S, famIdx(S, 'gold', true));
    const r = rollTreasure(S, 1, 'relic');
    addTreasure(S, r);
    return `${tn(id)}沉下去。井水吐出了${tn(r)}。`;
  },
  /* 翻倒的礦車 */
  ride(S){
    if(rand(S) < 0.5){
      const id = rollTreasure(S, 2, rand(S) < 0.5 ? 'gold' : 'curse');
      return evGive(S, id) ? `礦車衝到底撞開一個木箱，裡面是${tn(id)}。` : `礦車撞開一個木箱，裡面是${tn(id)}，但你已經拿不下了。`;
    }
    evHurt(S, 9);
    return '礦車脫軌，你被甩進岩壁。失去 9 生命。';
  },
  scrap(S){
    evHurt(S, 3);
    evGive(S, 'coin');
    return '你撬下一塊鍍銀的零件，手也被割開了。失去 3 生命。';
  },
  /* 懺悔室 */
  confess_burn(S){
    const id = removeTreasure(S, famIdx(S, 'curse'));
    heal(S, Math.round(S.maxHp * 0.5));
    return `手收走了${tn(id)}。你覺得身體輕了，回復一半最大生命。`;
  },
  confess_take(S){
    const id = rollTreasure(S, 1, 'curse');
    evGive(S, id);
    return `手遞給你${tn(id)}，用很輕的聲音說：「這個很值錢。」`;
  },
  /* 裂開的門 */
  door_open(S){
    startBattle(S, pickElite(S), 'elite');
    if(S.battle) S.battle.rich = 1;   // 開場就被詛咒的失血打死時沒有戰鬥
    return 'battle';
  },
  /* 褪色的卷軸 */
  scroll_read(S){
    const idx = S.deck.map((c, i) => i).filter(i => !S.deck[i].up && CARDS[S.deck[i].id].up);
    shuffle(S, idx);
    const got = idx.slice(0, 2);
    got.forEach(i => { S.deck[i].up = 1; });
    addGreed(S, 5);
    emit(S, {k: 'pick'});
    return got.length ? `字跡鑽進腦子裡。${got.map(i => CARDS[S.deck[i].id].n).join('、')}變強了，貪婪 +5。` : '沒有能再強化的技能了。貪婪 +5。';
  },
  scroll_copy(S){
    evHurt(S, 6);
    S.reward = {title: '抄寫', text: '用自己的血寫出來的，不會錯。', loot: null, cards: rollCards(S, 3, 1), after: 'map'};
    return 'reward';
  },
  /* 熔岩坑 */
  lava_grab(S){
    evHurt(S, 12);
    const id = rollTreasure(S, 2, rand(S) < 0.5 ? 'gold' : 'curse');
    evGive(S, id);
    return `手背燙出一片水泡，你撈上來${tn(id)}。失去 12 生命。`;
  },
  lava_dive(S){
    evHurt(S, 22);
    const a = rollTreasure(S, 2, 'gold'), c = rollTreasure(S, 2, 'curse');
    evGive(S, a);
    evGive(S, c);
    return `你咬著牙撈上來${tn(a)}和${tn(c)}。失去 22 生命。`;
  },
  /* 廢棄的礦脈 */
  mine_pick(S){
    evGive(S, 'coin');
    addGreed(S, 4);
    return '礦石在鎬下碎開，一小片碎銀掉出來。敲擊聲傳得很遠，貪婪 +4。';
  },
  mine_deep(S){
    if(rand(S) < 0.4){
      evGive(S, 'gem');
      return '岩壁裂開，一顆深淵晶躺在裡面。';
    }
    evHurt(S, 8);
    return '頭頂的石頭落了下來。什麼都沒挖到，失去 8 生命。';
  },
  /* 纏人的根鬚 */
  root_eat(S){
    heal(S, 12);
    addGreed(S, 6);
    return '果子很甜。回復 12 生命，嘴裡有一股想再吃的味道，貪婪 +6。';
  },
  root_feed(S){
    const id = removeTreasure(S, cheapestIdx(S));
    S.maxHp += 8;
    S.hp += 8;
    return `根鬚把${tn(id)}捲進土裡，順著你的腳踝爬上來一陣暖意。最大生命 +8。`;
  },
  /* 鼓脹的囊腫 */
  cyst_lance(S){
    evHurt(S, 7);
    if(rand(S) < 0.65){
      const id = rollTreasure(S, 1, 'relic');
      evGive(S, id);
      return `囊破開了，掉出${tn(id)}。失去 7 生命。`;
    }
    return '囊裡只有一灘溫熱的液體。失去 7 生命。';
  },
};
/* 商人移除技能：挑哪一張 */
function eventPick(S, i){
  const ev = S.event;
  if(!ev || ev.pick !== 'remove' || !S.deck[i]) return false;
  const c = S.deck.splice(i, 1)[0];
  ev.pick = null;
  ev.result = `${CARDS[c.id].n}從你的腦子裡消失了。`;
  emit(S, {k: 'pick'});
  return true;
}
function chooseEvent(S, optId){
  const ev = S.event;
  if(!ev || ev.result || ev.pick) return;
  const o = EVENTS[ev.id].opts.find(x => x.id === optId);
  if(!o || !eventOptEnabled(S, o)) return;
  const r = EVENT_FX[optId](S);
  if(r === 'reward'){ S.event = null; S.screen = 'reward'; return; }
  if(r === 'battle'){ S.event = null; return; }
  if(r === 'pick') return;
  if(r === null){ S.event = null; S.screen = 'map'; return; }
  ev.result = r;
}
function closeEvent(S){ S.event = null; S.screen = 'map'; }

/* —— 結算 —— */
function finishRun(S, ok, why){
  const items = S.bag.slice();
  const bossDown = ok && S.at && S.at[0] === GAME.rows - 1;
  /* 不再每趟送裝備。活著回去：這趟撿到的材料＋依最終貪婪階級的材料（黑暗異變再多）；死了材料留在下面 */
  const matGreed = ok ? exitMats(S, S.greed) : 0;
  /* 死了：這趟撿到的材料留一半（無條件捨去），其餘留在下面；活著：全部＋貪婪加給的 */
  const mats = ok ? (S.mats | 0) + matGreed : Math.floor((S.mats | 0) * MAT_KEEP_DEATH);
  const ending = !!(bossDown && regionOf(S.depth || 0).final);
  /* 保命繩：死亡時仍帶回背包裡價值最高的一件（只一次），照撤離的方式結算那一件 */
  let saved = null;
  if(!ok && S.sup && S.sup.rope && items.length){
    let bi = 0;
    items.forEach((id, i) => { if(treasureValue(S, id) > treasureValue(S, items[bi])) bi = i; });
    saved = items.splice(bi, 1)[0];
    S.sup.rope = 0;
    S.supHit.rope = (S.supHit.rope || 0) + 1;
    emit(S, {k: 'toast', t: `保命繩拉回了${treasure(saved).n}`});
  }
  const gross = ok ? bagValue(S) : saved ? treasureValue(S, saved) : 0;
  const toll = tollPaid(S, gross);   // 舊都過路費：從賣價扣
  const back = ok ? items : saved ? [saved] : [];   // 這一趟實際帶回的財寶（保命繩那一件也算，但不算撤離）
  const fams = {gold: 0, relic: 0, curse: 0};
  back.forEach(id => { fams[treasure(id).fam]++; });
  S.result = {ok, why, ending, items: ok ? items : saved ? [saved] : [], lost: ok ? [] : items, value: gross - toll, toll, pouch: (S.pouch || []).slice(), rope: saved, greed: S.greed,
              steps: S.stats.steps, kills: S.stats.kills, burned: S.stats.burned, mats, matGreed, matLost: ok ? 0 : (S.mats | 0) - mats, tier: tierIdx(S), bossDown, depth: S.depth, mutation: S.mutation || null, cls: clsOf(S), nm: S.nm || 0,
              maxGreed: S.stats.maxGreed || 0, healed: S.stats.healed === undefined ? 1 : S.stats.healed,
              /* 委託結算要用的：接下的委託、整趟計數器、帶回各類財寶件數、帶回的刻痕件數、有沒有帶著帳本撤離、這趟梅姐線開放第幾段 */
              quests: (S.quests || []).slice(), qc: Object.assign({}, S.qc), fams, mark: ok ? items.filter(isMarked).length : 0, book: ok && S.book ? 1 : 0, meiStage: S.meiStage || 0,
              react: reactOf(S, back)};   // 舊局沒記錄過回血 ＝ 不確定，當作有回過
  S.battle = null;
  S.reward = null;
  S.event = null;
  S.screen = 'result';
  emit(S, {k: ok ? 'extract' : 'death'});
}

/* 回營時 NPC 的反應：帶回 ≥2 件詛咒 → 隨機一位的 curse；一件都沒帶回 → 隨機一位的 empty；都不是就沒有。只在要說話時才抽亂數 */
function reactOf(S, back){
  const ids = Object.keys(NPCS).filter(k => NPCS[k].react);
  const curse = back.filter(id => treasure(id).fam === 'curse').length;
  const kind = curse >= 2 ? 'curse' : back.length === 0 ? 'empty' : null;
  if(!kind || !ids.length) return null;
  const id = rpick(S, ids);
  return {npc: id, t: NPCS[id].react[kind]};
}

const depthName = d => DEPTHS[d % DEPTHS.length] + (d >= DEPTHS.length ? ' ' + (Math.floor(d / DEPTHS.length) + 1) : '');

/* —— 營地：永久成長。meta 是存在 localStorage 的帳號資料 —— */
/* 活著回去時依貪婪階級多拿的材料（黑暗異變再多 matUp）。撤離確認與結算都走這裡 */
const exitMats = (S, greed) => MAT_GREED[greedTierIndex(greed)] + (mutOf(S).matUp || 0);
/* —— 裝備階 —— */
const gearTier = id => GEAR[id].r + 1;                                   // 一階～五階
const craftMaxTier = meta => Math.min(RARITY.length, (meta.depth || 0) + 1);   // 能打造的最高階＝已解鎖的區 + 1
const matOf = (meta, ti) => ((meta.mats || {})[ti] | 0);                 // ti＝區索引（＝階 − 1）
/* 某階某部位的候選（不含還沒解鎖的成就裝備） */
const tierSlotGear = (meta, r, slot) => Object.keys(GEAR).filter(id => GEAR[id].r === r && GEAR[id].slot === slot && (!GEAR[id].ach || (meta.ach || {})[GEAR[id].ach]));
function statCost(k, lv){ return Math.round(STAT_UPS[k].base * Math.pow(STAT_UPS[k].mult, lv)); }
/* 這項素質目前可升到幾級：依已打贏首領的最深層數（meta.depth）查 STAT_CAPS，不超過 max */
function statCap(meta, k){
  const t = STAT_CAPS[k], d = Math.max(0, Math.min(meta.depth || 0, t.length - 1));
  return Math.min(STAT_UPS[k].max, t[d]);
}
/* 下一級是不是超出目前正常上限（要加價） */
const statOver = (meta, k) => (meta.stats[k] || 0) >= statCap(meta, k);
/* 下一級的實際價格：超過 statCap 的等級乘 STAT_OVER_MULT。買素質與畫面都走這裡。已滿級回傳 0 */
function statPrice(meta, k){
  const lv = meta.stats[k] || 0;
  if(lv >= STAT_UPS[k].max) return 0;
  return statCost(k, lv) * (statOver(meta, k) ? STAT_OVER_MULT : 1);
}
/* 要打贏第幾層首領才能升到 lv+1 級；已是最高級回傳 0 */
function statUnlockAt(k, lv){
  if(lv >= STAT_UPS[k].max) return 0;
  const t = STAT_CAPS[k];
  for(let i = 0; i < t.length; i++) if(t[i] > lv) return i;
  return t.length - 1;
}
/* 遷移（只在 v3 以下升上來時跑一次）：超過上限的等級退掉，依價格公式全額退金幣。v4 起超額可加價購買，不可再 clamp；回傳退還的金幣 */
function clampStats(meta){
  let refund = 0;
  meta.stats = meta.stats || {};
  for(const k in STAT_UPS){
    const cap = statCap(meta, k);
    let lv = meta.stats[k] || 0;
    while(lv > cap){ lv--; refund += statCost(k, lv); }
    if(meta.stats[k] !== undefined || lv > 0) meta.stats[k] = lv;
  }
  meta.gold = (meta.gold || 0) + refund;
  return refund;
}
function buyStat(meta, k){
  const u = STAT_UPS[k], lv = meta.stats[k] || 0;
  if(!u || lv >= u.max) return false;
  const price = statPrice(meta, k);
  if(meta.gold < price) return false;
  meta.gold -= price;
  meta.stats[k] = lv + 1;
  return true;
}
/* —— 出發前補給 —— */
/* 價格隨這一趟要下的層數（depth 從 0 起）上升 */
const supplyPrice = (id, depth) => Math.round(SUPPLIES.find(u => u.id === id).base * (1 + SUPPLY_DEPTH_K * Math.max(0, depth | 0)));
const supplyTotal = (ids, depth) => ids.reduce((s, id) => s + supplyPrice(id, depth), 0);
/* 一次買下勾選的補給：id 必須有效、不重複、總價付得起，否則什麼都不扣、回傳 null。成功回傳 {id:1}（交給 newRun） */
function buySupplies(meta, ids, depth){
  const uniq = [...new Set(ids)];
  if(!uniq.every(id => SUPPLIES.some(u => u.id === id))) return null;
  const total = supplyTotal(uniq, depth);
  if(meta.gold < total) return null;
  meta.gold -= total;
  const sel = {};
  uniq.forEach(id => { sel[id] = 1; });
  return sel;
}
/* 鐵匠打造：金幣＋該區材料。能打造的最高階＝已解鎖的區 + 1。回傳 ok／owned／ach／locked／poor（金幣不夠）／nomat（材料不夠） */
function craftState(meta, id){
  const g = GEAR[id];
  if(meta.owned.includes(id)) return 'owned';
  if(g.ach && !(meta.ach || {})[g.ach]) return 'ach';   // 成就解鎖的裝備：還沒達成
  if(gearTier(id) > craftMaxTier(meta)) return 'locked';
  const c = CRAFT[g.r];
  if(matOf(meta, g.r) < c.mats) return 'nomat';
  return meta.gold < c.gold ? 'poor' : 'ok';
}
function craftGear(meta, id){
  if(!GEAR[id] || craftState(meta, id) !== 'ok') return false;
  const g = GEAR[id], c = CRAFT[g.r];
  meta.gold -= c.gold;
  meta.mats = meta.mats || {};
  meta.mats[g.r] = matOf(meta, g.r) - c.mats;
  meta.owned.push(id);
  if(g.r >= RARITY.length - 1) meta.boughtLegend = 1;   // 「傳說鍛造」成就
  const cur = meta.equip[g.slot];
  if(!cur || GEAR[cur].r < g.r) meta.equip[g.slot] = id;   // 該部位空著或比較低階，直接穿上
  checkAchievements(meta, null);
  return true;
}
/* 首領首殺的招牌：第 ti 區、職業 cls。回傳要給的裝備 id；同階全都有了回傳 null（改給材料） */
function signatureOf(meta, ti, cls){
  const slot = (SIG_SLOT[cls] || SIG_SLOT.sword)[ti] || 'weapon';
  const main = GEAR_MAIN[ti][slot];
  if(!meta.owned.includes(main)) return main;
  const order = [slot, ...Object.keys(SLOTS).filter(s => s !== slot)];
  for(const s of order){
    const c = tierSlotGear(meta, ti, s).find(id => !meta.owned.includes(id));
    if(c) return c;
  }
  return null;
}
/* —— 本區門檻：營地面板、首領房前提醒、模擬機器人共用 ——
   回傳 {ti, stats:[{k,n,need,have,ok}], gear:{tier,need,have,ok,missing:[部位名]}, met, total, lacks:[還差什麼的短句]} */
function bossGate(meta, ti){
  ti = Math.max(0, Math.min(DIVE_MAX, ti | 0));
  const L = meta.stats || {};
  const stats = GATE_STATS.map(k => {
    const need = Math.min(STAT_UPS[k].max, STAT_CAPS[k][Math.min(ti, STAT_CAPS[k].length - 1)]), have = L[k] || 0;
    return {k, n: STAT_UPS[k].n, need, have, ok: have >= need};
  });
  const tier = ti + 1, eq = meta.equip || {};
  const at = Object.keys(SLOTS).filter(s => eq[s] && GEAR[eq[s]] && gearTier(eq[s]) >= tier);
  const missing = Object.keys(SLOTS).filter(s => !at.includes(s)).map(s => SLOTS[s]);
  const gear = {tier, need: GATE_GEAR[ti], have: at.length, ok: at.length >= GATE_GEAR[ti], missing};
  const lacks = stats.filter(s => !s.ok).map(s => `${s.n}再 ${s.need - s.have} 級`);
  if(!gear.ok) lacks.push(`還差 ${gear.need - gear.have} 件${RARITY[ti].n}裝備（${missing.join('、')}還不是${RARITY[ti].n}）`);
  const met = stats.filter(s => s.ok).length + (gear.ok ? 1 : 0);
  return {ti, stats, gear, met, total: stats.length + 1, lacks};
}
/* 開新局時帶進去的已擁有清單（回程補缺用） */
const ownedOf = meta => meta.owned.slice();
/* 已達成、且帶來新牌或新裝備的成就 id（開局存進 S.unlocked） */
const unlockedOf = meta => ACHIEVEMENTS.filter(a => (meta.ach || {})[a.id] && (a.reward.card || a.reward.gear)).map(a => a.id);
/* 噩夢階可選上限：通關過才開放，最高到「已通關的最高階 +1」 */
const nmLimit = meta => (meta.cleared || 0) >= 1 ? Math.min(NIGHTMARES.length, (meta.nmMax || 0) + 1) : 0;
/* 檢查成就，回傳這次新達成的清單；金幣獎勵直接入帳。r＝剛結算的一趟（載入補發時傳 null） */
function checkAchievements(meta, r){
  meta.ach = meta.ach || {};
  const got = [];
  ACHIEVEMENTS.forEach(a => {
    if(meta.ach[a.id] || !a.chk(meta, r)) return;
    meta.ach[a.id] = 1;
    if(a.reward.gold) meta.gold += a.reward.gold;
    got.push(a.id);
  });
  if(r && got.length) r.newAch = (r.newAch || []).concat(got);
  return got;
}
function equipGear(meta, id){
  if(!meta.owned.includes(id)) return false;
  meta.equip[GEAR[id].slot] = id;
  return true;
}
/* 素質＋裝備 → 這一趟的起始加成 */
function loadoutFrom(meta){
  const L = {};
  for(const k in meta.stats) L[STAT_UPS[k].key] = (L[STAT_UPS[k].key] || 0) + STAT_UPS[k].per * meta.stats[k];
  Object.values(meta.equip).forEach(id => {
    const fx = GEAR[id].fx;
    for(const k in fx) L[k] = (L[k] || 0) + fx[k];
  });
  return L;
}
/* 把結算入帳。重複的裝備換成金幣；該欄空著就直接穿上 */
function bankRewards(meta, r){
  if(r.banked) return;
  r.banked = 1;
  meta.runs++;
  const cs = ((meta.clsStats = meta.clsStats || {})[r.cls || 'sword'] = meta.clsStats[r.cls || 'sword'] || {dives: 0, escapes: 0, boss: 0, deep: 0, nm: 0});
  r.sold = Math.round(r.value * (1 + (meta.meiBonus || 0)));   // 賣財寶實際入帳：梅姐線第三段完成後 +10%（先算，這一趟才新拿到的加成從下一趟起算）
  settleQuests(meta, r);                                       // 要在更新 meta.depth 之前，梅姐線各段的門檻看的是出發時的進度
  if(!r.ok){
    if(r.rope && r.value > 0){ meta.bank += r.sold; meta.gold += r.sold; meta.best = Math.max(meta.best, r.sold); }   // 保命繩帶回的那一件
    if(r.mats){ const tD = Number.isFinite(r.tier) ? r.tier : Math.min(DIVE_MAX, r.depth || 0); meta.mats = meta.mats || {}; meta.mats[tD] = matOf(meta, tD) + r.mats; }   // 死亡保住的一半材料
    checkAchievements(meta, r); return;
  }
  meta.escapes++;
  cs.escapes++;
  if(r.bossDown){ cs.boss++; cs.nm = Math.max(cs.nm || 0, r.nm || 0); }
  if(r.mutation) meta.mutEsc = (meta.mutEsc || 0) + 1;
  meta.bank += r.sold;
  meta.gold += r.sold;
  meta.best = Math.max(meta.best, r.sold);
  const ti = Number.isFinite(r.tier) ? r.tier : Math.min(DIVE_MAX, r.depth || 0);
  meta.mats = meta.mats || {};
  if(r.mats) meta.mats[ti] = matOf(meta, ti) + r.mats;
  /* 首次打倒這一區的首領：給該階招牌（同階都有了改給材料），並記下「新一階解鎖」給結算畫面 */
  meta.bossFirst = meta.bossFirst || {};
  if(r.bossDown && !meta.bossFirst[ti]){
    meta.bossFirst[ti] = 1;
    const sig = signatureOf(meta, ti, r.cls || 'sword');
    if(sig){
      meta.owned.push(sig);
      const cur = meta.equip[GEAR[sig].slot];
      if(!cur || GEAR[cur].r < GEAR[sig].r){ meta.equip[GEAR[sig].slot] = sig; r.autoEquip = 1; }
      r.sig = sig;
    }else{
      r.sigMats = CRAFT[ti].mats;
      meta.mats[ti] = matOf(meta, ti) + r.sigMats;
    }
  }
  if(r.bossDown && r.depth >= meta.depth){
    const caps0 = GATE_STATS.map(k => statCap(meta, k)), craft0 = craftMaxTier(meta);
    meta.depth = r.depth + 1; r.newDepth = meta.depth;
    /* 新一階解鎖：可打造的階、素質上限（只列有提高的）、下一區 */
    r.unlock = {craft: craftMaxTier(meta) > craft0 ? craftMaxTier(meta) : 0,
                caps: GATE_STATS.map((k, i) => ({k, n: STAT_UPS[k].n, from: caps0[i], to: statCap(meta, k)})).filter(x => x.to > x.from),
                region: meta.depth <= DIVE_MAX ? meta.depth : -1};
  }
  if(r.ending){
    const lim0 = nmLimit(meta);
    meta.cleared = (meta.cleared || 0) + 1;   // 打贏深淵之心的次數
    meta.nmMax = Math.max(meta.nmMax || 0, r.nm || 0);   // 通關第 N 階，開放第 N+1 階
    if(nmLimit(meta) > lim0) r.newNm = nmLimit(meta);
  }
  checkAchievements(meta, r);
}

/* —— 存檔遷移（台階改造）——
   meta v5 → v6：①裝備 id 不變，稀有度直接變成階（r＋1）。②高於「能打造的最高階」的裝備降成同部位該階的基本款，
   每降一階補 1 份該階材料（不能靠舊存檔直接跨過下一道牆）。③已通關的區：每個部位至少補到「最後通關那一區」的階（基本款），
   遷移後打得了已通關的區。④素質、金幣、成就、故事進度原樣保留；首殺紀錄依已通關的區補上（不重發招牌）。
   回傳遷移紀要 {down:[[舊,新]], fill:[id], mats:{區:份}}（給 UI 提示與測試用） */
/* 存檔改版說明只給看一次：取出遷移紀錄與作廢退款，並把旗標清掉（畫面負責存檔）。沒有要說的回傳 null */
function takeMigNote(meta){
  const note = meta.migNote || null, refund = meta.runRefund | 0;
  delete meta.migNote; delete meta.runRefund;
  return note || refund ? {note, refund} : null;
}
function migrateMetaV6(meta){
  const note = {down: [], fill: [], mats: {}};
  meta.owned = Array.isArray(meta.owned) ? meta.owned.filter(id => GEAR[id]) : [];
  meta.equip = meta.equip || {};
  meta.mats = meta.mats || {};
  meta.bossFirst = meta.bossFirst || {};
  const maxR = craftMaxTier(meta) - 1;
  const owned = [];
  const swap = {};
  meta.owned.forEach(id => {
    const g = GEAR[id];
    let nid = id;
    if(g.r > maxR){
      nid = GEAR_MAIN[maxR][g.slot];
      note.down.push([id, nid]);
      note.mats[maxR] = (note.mats[maxR] || 0) + (g.r - maxR);
    }
    swap[id] = nid;
    if(!owned.includes(nid)) owned.push(nid);
  });
  for(const k in note.mats) meta.mats[k] = matOf(meta, +k) + note.mats[k];
  for(const s in meta.equip){ const id = meta.equip[s]; meta.equip[s] = GEAR[id] && swap[id] ? swap[id] : (GEAR[id] && owned.includes(id) ? id : undefined); if(!meta.equip[s]) delete meta.equip[s]; }
  const cleared = Math.min(DIVE_MAX + 1, meta.depth || 0);
  for(let i = 0; i < cleared; i++) meta.bossFirst[i] = 1;
  if(cleared > 0){
    const floorR = Math.min(maxR, cleared - 1);
    Object.keys(SLOTS).forEach(s => {
      const best = owned.filter(id => GEAR[id].slot === s).reduce((m, id) => Math.max(m, GEAR[id].r), -1);
      if(best >= floorR) return;
      const id = GEAR_MAIN[floorR][s];
      if(!owned.includes(id)) owned.push(id);
      note.fill.push(id);
    });
  }
  meta.owned = owned;
  /* 每個部位穿上最高階的那件（原本穿著同階的就不動） */
  Object.keys(SLOTS).forEach(s => {
    const mine = owned.filter(id => GEAR[id].slot === s);
    if(!mine.length) return;
    const top = mine.reduce((m, id) => GEAR[id].r > GEAR[m].r ? id : m, mine[0]);
    const cur = meta.equip[s];
    if(!cur || GEAR[cur].r < GEAR[top].r) meta.equip[s] = top;
  });
  return note;
}
/* 一趟的存檔升級：v1（台階改造前）→ v2。下潛深度超過最後一區（舊的循環深度）沒辦法對應，安全作廢：
   照身上財寶的賣價退金幣（新公式、不扣過路費）。回傳 {run: 升級後的局或 null, refund: 退還金幣} */
function migrateRun(r){
  if(!r || typeof r !== 'object') return {run: null, refund: 0};
  if(r.v === RUN_VER) return {run: r, refund: 0};
  if(r.v !== 1) return {run: null, refund: 0};
  const bag = Array.isArray(r.bag) ? r.bag.filter(id => typeof id === 'string' && treasure(id)) : [];
  if((r.depth || 0) > DIVE_MAX || r.screen === 'result'){
    const probe = {depth: Math.min(DIVE_MAX, r.depth || 0), mutation: r.mutation, nm: r.nm || 0};
    return {run: null, refund: bag.reduce((a, id) => a + treasureValue(probe, id), 0)};
  }
  r.v = RUN_VER;
  r.mats = r.mats | 0;
  return {run: r, refund: 0};
}

/* —— 故事進度（NPC 對話、各層進場劇情、見聞）。文本在 story.js；meta.talk / seenEnter / seenLore 都是 {鍵:1} —— */
const STORY_MAX = 5;
const storyStage = meta => Math.max(0, Math.min((meta && meta.depth) || 0, STORY_MAX));   // 打贏第 N 層首領後＝N，超過 5 一律當 5
const talkKey = (meta, id) => id + ':' + storyStage(meta);
const talkUnread = (meta, id) => !((meta.talk || {})[talkKey(meta, id)]);
const markTalk = (meta, id) => { meta.talk = meta.talk || {}; const k = talkKey(meta, id); const fresh = !meta.talk[k]; meta.talk[k] = 1; return fresh; };
const talkUnreadCount = meta => Object.keys(NPCS).filter(id => talkUnread(meta, id)).length;
const loreVisible = meta => LORE.filter(l => l.need <= storyStage(meta));
const loreUnread = (meta, id) => !((meta.seenLore || {})[id]);
const loreUnreadCount = meta => loreVisible(meta).filter(l => loreUnread(meta, l.id)).length;
const markLore = (meta, id) => { meta.seenLore = meta.seenLore || {}; const fresh = !meta.seenLore[id]; meta.seenLore[id] = 1; return fresh; };
const enterRegion = depth => (depth || 0) % REGION_STORY.length;
const enterSeen = (meta, depth) => !!(meta.seenEnter || {})[enterRegion(depth)];
const markEnter = (meta, depth) => { meta.seenEnter = meta.seenEnter || {}; meta.seenEnter[enterRegion(depth)] = 1; };

/* —— 委託板與梅姐線（資料在 data.js 的 QUESTS、MEI_STAGES）—— */
/* 整趟計數器（存在 S.qc，隨存檔存讀）：fights 打贏幾場、elites 打贏幾場菁英、stops 停過幾處（寶箱／營火／未知／密室）、
   maxTier 貪婪到過的最高階級、bossFights／bossStops＝進首領房那一刻的 fights／stops（沒進過＝null） */
const newQc = () => ({fights: 0, elites: 0, stops: 0, maxTier: 0, bossFights: null, bossStops: null});
/* 讀舊局時補預設值（委託上線前的存檔沒有這些欄位） */
function ensureQuestState(S){
  S.quests = Array.isArray(S.quests) ? S.quests.filter(id => QUESTS[id]) : [];
  S.markOn = S.markOn ? 1 : 0;
  S.meiStage = S.meiStage | 0;
  S.book = S.book ? 1 : 0;
  const q = S.qc = Object.assign(newQc(), S.qc || {});
  q.maxTier = Math.max(q.maxTier || 0, greedTierIndex((S.stats && S.stats.maxGreed) || S.greed || 0));
  return ensureRuleState(S);
}
/* 讀舊局時補各區第二條規則的狀態：沒有就依已走的步數推回去 */
function ensureRuleState(S){
  const st = (S.stats && S.stats.steps) | 0;
  S.pouch = Array.isArray(S.pouch) ? S.pouch.filter(id => typeof id === 'string' && treasure(id)) : [];
  S.lamp = Number.isFinite(S.lamp) ? Math.max(0, S.lamp) : Math.max(0, LAMP_START - st);
  S.heart = Number.isFinite(S.heart) && S.heart >= 1 ? Math.min(S.heart, HEART_EVERY) : HEART_EVERY - (st % HEART_EVERY);
  S.toll = Number.isFinite(S.toll) ? Math.max(0, S.toll) : 0;
  S.bossBack = S.bossBack | 0;
  S.mats = S.mats | 0;
  return S;
}
const questReward = (id, depth) => Math.round(QUESTS[id].gold * (1 + QUEST_DEPTH_K * Math.max(0, depth | 0)));
const questPool = meta => QUEST_ORDER.filter(id => QUESTS[id].need <= (meta.depth || 0));
/* 目前的委託板（3 張）：meta.board.ids。沒有或不合法才重抽（rnd＝0~1 的亂數函式，UI 傳 Math.random，不碰 S.rng）；出發時 questStart 會清掉，下一趟才重抽 */
function ensureBoard(meta, rnd){
  const pool = questPool(meta), b = meta.board;
  if(b && Array.isArray(b.ids) && b.ids.length && b.ids.every(id => pool.includes(id))) return b.ids;
  const ids = pool.slice();
  for(let i = ids.length - 1; i > 0; i--){ const j = Math.floor(rnd() * (i + 1)); [ids[i], ids[j]] = [ids[j], ids[i]]; }
  meta.board = {ids: ids.slice(0, QUEST_SHOW)};
  return meta.board.ids;
}
/* 勾選／取消一張委託：只能接板上的，最多 QUEST_MAX 張。回傳新的選取清單 */
function toggleQuest(meta, sel, id){
  const ids = (meta.board && meta.board.ids) || [];
  if(sel.includes(id)) return sel.filter(x => x !== id);
  if(!ids.includes(id) || sel.length >= QUEST_MAX) return sel;
  return [...sel, id];
}
/* 梅姐線目前開放第幾段（1～3）；沒開放或全部辦完回 0 */
function meiActive(meta){
  const st = (meta.mei && meta.mei.stage) | 0;
  if(st >= MEI_STAGES.length) return 0;
  return (meta.depth || 0) >= MEI_STAGES[st].need ? st + 1 : 0;
}
const meiDone = meta => ((meta.mei && meta.mei.stage) | 0) >= MEI_STAGES.length;
/* 出發：把勾選的委託與梅姐線狀態變成 newRun 的 qx，並清掉這張委託板（下一趟重抽） */
function questStart(meta, sel){
  const ids = (meta.board && meta.board.ids) || [];
  const quests = [...new Set(sel || [])].filter(id => ids.includes(id)).slice(0, QUEST_MAX);
  meta.board = null;
  return {quests, markOn: (meta.depth || 0) >= MEI_MARK_NEED, meiStage: meiActive(meta)};
}
/* 一張委託完成了沒。r 是 finishRun 做出來的結算：不是活著回營（死亡、保命繩）一律不算 */
function questDone(id, r){
  const q = QUESTS[id];
  if(!q || !r || !r.ok) return false;
  const qc = r.qc || {}, f = r.fams || {};
  switch(q.k){
    case 'fam': return (f[q.fam] || 0) >= q.cnt;
    case 'noburn': return (r.burned || 0) === 0 && r.items.length >= 1;
    case 'elite': return (qc.elites || 0) >= q.cnt;
    case 'fewfight': return qc.bossFights != null && qc.bossFights <= QUEST_FEWFIGHT_MAX;
    case 'greedout': return (qc.maxTier || 0) >= QUEST_HIGH_TIER;
    case 'rush': return qc.bossStops != null && qc.bossStops <= QUEST_RUSH_MAX_STOPS;
  }
  return false;
}
/* 結算委託與梅姐線（bankRewards 呼叫，已有 r.banked 擋重複）：獎勵直接入帳，結果寫進 r.qres／r.mei。失敗不罰 */
function settleQuests(meta, r){
  r.qres = (r.quests || []).filter(id => QUESTS[id]).map(id => {
    const ok = questDone(id, r), gold = ok ? questReward(id, r.depth) : 0;
    meta.gold += gold;
    return {id, ok, gold};
  });
  const st = r.meiStage | 0;
  if(!st) return;
  const m = meta.mei = Object.assign({stage: 0, n: 0}, meta.mei || {});
  if(m.stage !== st - 1) return;   // 這一段已經辦完（或進度對不上），不重複發獎
  const def = MEI_STAGES[st - 1], qc = r.qc || {};
  let done = false;
  if(r.ok){
    if(st === 1){ m.n += r.mark | 0; done = m.n >= def.cnt; }
    else if(st === 2) done = (r.mark | 0) >= 1 && (qc.maxTier || 0) >= QUEST_HIGH_TIER;
    else if(st === 3) done = !!r.book;
  }
  r.mei = {stage: st, done, gold: done ? def.gold : 0, n: m.n};
  if(!done) return;
  m.stage = st;
  meta.gold += def.gold;
  meta.meiSay = (meta.meiSay || []).concat(st);   // 回營後播完成台詞（播完才清）
  if(st === 3) meta.meiBonus = MEI_BONUS;
}
/* 這趟進行中的進度一行字（地圖上的委託列、委託面板用） */
function questLive(S, id){
  const q = QUESTS[id], qc = S.qc || newQc();
  const fam = f => S.bag.filter(x => treasure(x).fam === f).length;
  switch(q.k){
    case 'fam': return `${FAM[q.fam].n} ${fam(q.fam)}/${q.cnt}`;
    case 'noburn': return S.stats.burned ? '已經餵過了' : '還沒餵過';
    case 'elite': return `菁英 ${qc.elites}/${q.cnt}`;
    case 'fewfight': return qc.bossFights != null ? `進首領房時打過 ${qc.bossFights} 場` : `已打 ${qc.fights} 場（上限 ${QUEST_FEWFIGHT_MAX}）`;
    case 'greedout': return qc.maxTier >= QUEST_HIGH_TIER ? '貪婪夠高了，活著撤離' : '貪婪還不夠高';
    case 'rush': return qc.bossStops != null ? `進首領房時停過 ${qc.bossStops} 處` : `已停 ${qc.stops} 處（上限 ${QUEST_RUSH_MAX_STOPS}）`;
  }
  return '';
}
/* 還有沒有希望：已經確定做不到的（燒過、戰鬥場數超過…）回 false，UI 可以變灰 */
function questAlive(S, id){
  const q = QUESTS[id], qc = S.qc || newQc();
  if(q.k === 'noburn') return !S.stats.burned;
  if(q.k === 'fewfight') return (qc.bossFights != null ? qc.bossFights : qc.fights) <= QUEST_FEWFIGHT_MAX;
  if(q.k === 'rush') return (qc.bossStops != null ? qc.bossStops : qc.stops) <= QUEST_RUSH_MAX_STOPS;
  return true;
}
/* 梅姐線這一趟的進度（meiStage 1～3）：回傳一行字 */
function meiLive(S, meta){
  const st = S.meiStage | 0;
  if(!st) return '';
  const def = MEI_STAGES[st - 1], marked = S.bag.filter(isMarked).length;
  if(st === 1) return `${def.n}：身上刻痕銀器 ${marked}（累計已帶回 ${(meta && meta.mei && meta.mei.n) | 0}/${def.cnt}）`;
  if(st === 2) return `${def.n}：身上刻痕銀器 ${marked}・${S.qc.maxTier >= QUEST_HIGH_TIER ? '貪婪夠高了' : '貪婪還不夠高'}`;
  return `${def.n}：${S.book ? '已拿到帳本，活著撤離' : regionIdx(S.depth) === def.region ? '找到銀匠密室' : '這一層沒有密室'}`;
}

/* —— 銀匠密室：三段敘事看完，帶走帳本（任務物品，不佔背包、不加貪婪；死了留在下面，下次再來） —— */
function vaultNext(S){
  if(S.screen !== 'vault' || !S.vault) return false;
  if(S.vault.n < VAULT_STORY.length){ S.vault.n++; return true; }
  S.book = 1;
  S.vault = null;
  S.screen = 'map';
  emit(S, {k: 'toast', t: '帶走了帳本'});
  return true;
}
