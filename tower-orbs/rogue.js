/* ================= 地城（Roguelike 模式）=================
   一局 = 選隊長 → 10 層分支路線（戰鬥／精英／營火）→ 第 10 層魔王。死亡即結束，不能用魔石復活。
   隊伍每局重新組：隊長＋兩名同屬性隊員起手，之後靠三選一招募與訓練成長，跟背包收藏完全分開。
   戰鬥直接沿用主程式的盤面與流程，主程式只在 stageInfo / genWaves / startBattle / win / lose / giveup
   各留一行 `kind==='rogue'` 的掛勾，進到這裡處理。共用主程式的全域（S、B、CARD、mkEnemy…），
   所以本檔必須在主程式之後載入（init 改在 DOMContentLoaded 才執行，見 index.html 最後）。

   階段規劃（見對話紀錄）：1 骨架（本檔）→ 2 流派與遺物 → 3 敵人行為與 Boss 機制 → 4 事件、商店、解鎖。
   擴充時盡量新增 RG_* 表格與 rg* 函式，別把邏輯塞回主程式。 */

const RG_KEY = 'tower_orbs_rogue_v1';
const RG_FLOORS = 10;   // 第 10 層是魔王
const RG_COST = 10;     // 進入一局扣一次體力，房間之間不再扣
const RG_NODE = {
  battle: { n: '戰鬥', e: '⚔️', d: '兩波敵人，穩定取得獎勵' },
  elite:  { n: '精英', e: '💀', d: '強敵坐鎮，獎勵的隊員更稀有' },
  rest:   { n: '營火', e: '🔥', d: '回復生命，或讓全隊訓練' },
  boss:   { n: '魔王', e: '👑', d: '擊敗它，完成這次地城' },
};

// 存檔：run＝進行中的一局（null 表示沒有）；meta＝跨局紀錄
let RG = (() => {
  try { const d = JSON.parse(localStorage.getItem(RG_KEY)); if (d && d.meta) return d; } catch (e) {}
  return { run: null, meta: { runs: 0, clears: 0, best: 0 } };
})();
function rgSave() { try { localStorage.setItem(RG_KEY, JSON.stringify(RG)) } catch (e) {} }

/* ---------- 難度曲線 ----------
   地城第 F 層對應到塔的強度 fEff，直接丟進主程式的 mkEnemy。
   起手隊伍（4★ Lv20 隊長＋兩張 3★ Lv15）打第 1 層約 2～3 回合一波；
   第 10 層魔王約等於塔 24 層的魔王，需要途中招募／訓練過的隊伍。 */
const rgFEff = F => Math.round(2 + F * 2.2);
const rgRecruitR = (F, elite) => clamp((F <= 3 ? 3 : F <= 6 ? 4 : 5) + (elite ? 1 : 0), 3, 6);
const rgRecruitLv = (r, F) => Math.min(maxLv(r), Math.round(maxLv(r) * .4) + F * 2);
const RG_TRAIN = 6;     // 全隊訓練：每人 +6 級
const RG_REST_HEAL = .5;

/* ---------- 路線 ---------- */
function rgChoices(F) {
  if (F >= RG_FLOORS) return ['boss'];
  if (F === 1) return ['battle', 'battle'];
  if (F === RG_FLOORS - 1) return ['rest', 'battle', 'elite'];   // 魔王前一定有營火可選
  const w = { battle: 5, elite: F >= 3 ? 2 : 0, rest: F >= 3 ? 2 : 0 };
  const out = [];
  for (let i = 0; i < 3; i++) out.push(wpick(Object.keys(w), k => w[k]));
  return out.sort((a, b) => ['battle', 'elite', 'rest'].indexOf(a) - ['battle', 'elite', 'rest'].indexOf(b));
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

/* ---------- 主畫面（爬塔 → 地城 分頁） ---------- */
function rRogue() {
  const run = RG.run, M = RG.meta;
  if (!run) {
    return `<div class="hint">每次進入地城都從頭組隊：選一位隊長出發，沿途在三選一中招募隊員、訓練隊伍，
      走過 ${RG_FLOORS} 層分支路線後挑戰魔王。<b>倒下就結束</b>，不能用魔石復活。
      <br>隊伍與背包收藏分開，抽卡運氣不影響這裡的強弱。通關可帶回魔石與金幣。</div>
      <div class="panel"><h3>🌀 深淵地城</h3>
        <div class="statline"><div>挑戰<b>${M.runs}</b></div><div>通關<b>${M.clears}</b></div><div>最深<b>${M.best} 層</b></div></div>
        <button class="btn gold full" style="margin-top:10px" data-act="rgStart">進入地城　${ico('stam')}${RG_COST}</button>
      </div>`;
  }
  const hp = Math.round(run.hpR * 100);
  let h = `<div class="panel">
    <div style="display:flex;justify-content:space-between;align-items:baseline"><h3 style="margin:0">🌀 地城 第 ${run.floor} / ${RG_FLOORS} 層</h3><span>${ico('coin')}${fmt(run.gold)}</span></div>
    <div style="margin:8px 0 2px;font-size:12px;color:var(--muted)">隊伍生命 ${hp}%</div>
    <div style="height:8px;border-radius:4px;background:#0006;overflow:hidden"><i style="display:block;height:100%;width:${hp}%;background:${hp < 30 ? 'var(--bad)' : 'var(--ok)'}"></i></div>
    <div style="margin-top:10px">${rgTeamHTML('rgMember')}</div>
  </div>`;
  if (run.phase === 'reward') {
    h += `<button class="btn gold full" data-act="rgReward">🎁 領取戰鬥獎勵</button>`;
  } else {
    h += `<div class="hint" style="margin-top:4px">選擇下一個房間：</div>`;
    run.choices.forEach((k, i) => {
      const n = RG_NODE[k], a = ATTRS[(run.floor + i) % 5];
      h += `<div class="floor a-${a}" data-act="rgGo" data-i="${i}"><div class="fn" style="font-size:26px">${n.e}</div>
        <div class="fi"><b>${n.n}</b><div>${n.d}</div></div><div class="fc">${k === 'rest' ? '' : AE[a]}</div></div>`;
    });
  }
  h += `<div class="row"><button class="btn ghost" data-act="rgQuit">放棄這次地城</button></div>`;
  return h;
}

/* ---------- 開局：選隊長 ---------- */
ACT.rgStart = () => {
  if (S.stam < RG_COST) return toast('體力不足');
  const attrs = [...ATTRS].sort(() => Math.random() - .5).slice(0, 3);
  UI.rgLead = attrs.map(a => rgCardOf(a, 4));
  openModal(`<h3>選擇隊長</h3><div class="hint" style="margin:0 0 8px">隊長技會影響整局。隊長之外，會再給你兩名同屬性的 3★ 隊員。</div>
    ${UI.rgLead.map((id, i) => { const d = CARD[id]; return `<div class="sec" data-act="rgLead" data-i="${i}" style="cursor:pointer;display:flex;gap:10px;align-items:center">
      <div style="width:64px;flex:none">${miniD(d, { lv: 20 })}</div>
      <div><b>${chip(d.attr)} ${d.name}</b><br><small>👑 ${lsText(d.ls)}</small>${d.as ? `<br><small>✨ ${SKN[d.as.type]}：${skText(d.as)}</small>` : ''}</div></div>`; }).join('')}
    <button class="btn ghost full" style="margin-top:8px" data-act="close">取消</button>`, 'wide');
};
ACT.rgLead = t => {
  const lead = CARD[UI.rgLead[+t.dataset.i]];
  if (S.stam < RG_COST) return toast('體力不足');
  const wasFull = S.stam >= stamMax(); S.stam -= RG_COST; if (wasFull) S.stamT = Date.now(); save(); hud();
  RG.run = {
    floor: 1, hpR: 1, gold: 0, phase: 'map',
    team: [{ id: lead.id, lv: 20 }, { id: rgCardOf(lead.attr, 3, lead.fam), lv: 15 }, { id: rgCardOf(lead.attr, 3, lead.fam), lv: 15 }],
    choices: rgChoices(1),
  };
  RG.meta.runs++; rgSave(); closeAll(); render();
};

/* ---------- 選房間 ---------- */
ACT.rgGo = t => {
  const run = RG.run; if (!run || run.phase !== 'map') return;
  const k = run.choices[+t.dataset.i];
  if (k === 'rest') return rgRest();
  startBattle({ kind: 'rogue', node: k, F: run.floor, a: ATTRS[(run.floor + +t.dataset.i) % 5] }, null);
};

// 主程式 stageInfo / genWaves 的地城分支
function rgStageInfo(s) {
  const n = RG_NODE[s.node];
  return { f: rgFEff(s.F), name: `地城 ${s.F}F · ${n.n}`, sub: n.d, attr: s.a, cost: 0, exp: 0, coins: 0, first: 0, tb: 6 };
}
function rgGenWaves(s, info) {
  const f = info.f, a = info.attr, mob = n => Array.from({ length: n }, () => mkEnemy(f, pick(ATTRS), false));
  let waves;
  if (s.node === 'battle') waves = [mob(ri(2, 3)), mob(ri(2, 3))];
  else if (s.node === 'elite') {
    const e = mkEnemy(f, a, false, { hp: 3.2, atk: 1.35 }); e.name = '精英·' + e.name; e.elite = true; e.cd = e.cdMax = 3;
    waves = [mob(2), [e]];
  } else waves = [mob(3), [mkEnemy(f, a, true, { hp: 1.8, atk: 1.15 })]];   // boss
  waves.flat().forEach(e => { e.coin = ri(6, 12) + s.F * 2; e.drops = [] });
  return waves;
}
// 生命跨房間延續（主程式開戰時會設成滿血，這裡改回本局剩餘比例）
function rgOnBattleStart(b) { b.hp = Math.max(1, Math.round(b.max * RG.run.hpR)) }

/* ---------- 戰鬥結束 ---------- */
function rgOnWin() {
  const run = RG.run, node = B.spec.node, elite = node === 'elite';
  B.over = true; B.phase = 'end';
  run.hpR = B.hp / B.max; run.gold += B.coins;
  beep(784, .4, 'triangle');
  if (node === 'boss') { closeAll(); endBattle(); return rgFinish(true) }
  run.phase = 'reward'; run.reward = rgRollRewards(run.floor, elite); rgSave();
  closeAll(); endBattle(); rgShowReward();
}
function rgOnLose() {
  B.over = true; B.phase = 'dead';
  closeAll(); endBattle(); rgFinish(false);
}

/* ---------- 三選一獎勵 ---------- */
function rgRollRewards(F, elite) {
  const r = rgRecruitR(F, elite), lv = rgRecruitLv(r, F);
  const rec = () => ({ t: 'recruit', id: pick(POOL[r]), lv });
  const extra = elite ? { t: 'train', n: RG_TRAIN + 4 } : pick([{ t: 'train', n: RG_TRAIN }, { t: 'heal', p: .35 }]);
  return [rec(), rec(), extra];
}
function rgRewardHTML(o, i) {
  const wrap = (art, title, desc) => `<div class="sec" data-act="rgPick" data-i="${i}" style="cursor:pointer;display:flex;gap:10px;align-items:center">
    <div style="width:64px;flex:none;text-align:center;font-size:34px">${art}</div><div><b>${title}</b><br><small>${desc}</small></div></div>`;
  if (o.t === 'recruit') {
    const d = CARD[o.id];
    return wrap(miniD(d, { lv: o.lv }), `招募 ${chip(d.attr)} ${d.name}`,
      `${d.ls ? '👑 ' + lsText(d.ls) + '<br>' : ''}${d.as ? '✨ ' + SKN[d.as.type] + '：' + skText(d.as) : '沒有主動技'}`);
  }
  if (o.t === 'train') return wrap('📈', `全隊訓練 +${o.n} 級`, '所有隊員等級提升（不超過該稀有度上限）');
  return wrap('💖', `回復 ${Math.round(o.p * 100)}% 生命`, `目前 ${Math.round(RG.run.hpR * 100)}%`);
}
function rgShowReward() {
  const run = RG.run;
  openModal(`<h2 class="win">🏆 第 ${run.floor} 層突破</h2>
    <div class="hint" style="margin:0 0 8px;text-align:center">選一項帶走（隊伍 ${run.team.length} / 5）</div>
    ${run.reward.map(rgRewardHTML).join('')}
    <button class="btn ghost full" style="margin-top:8px" data-act="rgSkip">都不要，繼續前進</button>`, 'wide', true);
}
ACT.rgReward = () => rgShowReward();
ACT.rgSkip = () => { closeAll(); rgNextFloor() };
ACT.rgPick = t => {
  const run = RG.run, o = run.reward[+t.dataset.i];
  if (o.t === 'recruit') {
    if (run.team.length < 5) { run.team.push({ id: o.id, lv: o.lv }); closeAll(); return rgNextFloor() }
    UI.rgRecruit = o;   // 隊伍滿了：選一位替換（隊長不能換）
    return openModal(`<h3>隊伍已滿，要替換誰？</h3><div class="hint" style="margin:0 0 8px">隊長不能替換。</div>
      ${rgTeamHTML('rgReplace')}<button class="btn ghost full" style="margin-top:10px" data-act="close">返回</button>`, 'wide');
  }
  if (o.t === 'train') rgTrain(o.n);
  else run.hpR = Math.min(1, run.hpR + o.p);
  closeAll(); rgNextFloor();
};
ACT.rgReplace = t => {
  const i = +t.dataset.id; if (!i) return toast('隊長不能替換');
  RG.run.team[i] = { id: UI.rgRecruit.id, lv: UI.rgRecruit.lv };
  closeAll(); rgNextFloor();
};
function rgTrain(n) { RG.run.team.forEach(m => m.lv = Math.min(maxLv(CARD[m.id].rarity), m.lv + n)) }

/* ---------- 營火 ---------- */
function rgRest() {
  const run = RG.run;
  openModal(`<h2 class="win">🔥 營火</h2><div class="hint" style="margin:0 0 8px;text-align:center">在火邊歇一會兒。只能選一件事。</div>
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
  run.floor++; run.phase = 'map'; run.reward = null; run.choices = rgChoices(run.floor);
  rgSave(); UI.tab = 'tower'; UI.sub = 'rogue'; render();
}

/* ---------- 結算 ---------- */
function rgFinish(won) {
  const run = RG.run, M = RG.meta, F = run.floor;
  const firstClear = won && !M.clears;
  let gems = 0, coins = won ? run.gold * 2 + 500 : Math.round(run.gold / 2);
  if (won) { M.clears++; gems = 5 + (firstClear ? 10 : 0) }
  M.best = Math.max(M.best, won ? RG_FLOORS : F - 1);
  S.coins += coins; S.gems += gems; save(); hud();
  RG.run = null; rgSave();
  UI.tab = 'tower'; UI.sub = 'rogue'; render();
  openModal(`<h2 class="win" ${won ? '' : 'style="color:var(--bad);text-shadow:none"'}>${won ? '👑 地城通關！' : '💀 倒在了第 ' + F + ' 層'}</h2>
    <div class="rw"><span>帶回金幣</span><b>${ico('coin')} +${fmt(coins)}</b></div>
    ${gems ? `<div class="rw"><span>${firstClear ? '首次通關' : '通關獎勵'}</span><b>${ico('gem')} +${gems}</b></div>` : ''}
    <div class="hint" style="margin-top:8px;text-align:center">${won ? '下一次，換一位隊長試試別的打法。' : '隊伍會重新組過——下一局又是新的開始。'}</div>
    <button class="btn gold full" style="margin-top:10px" data-act="close">返回</button>`, '', true);
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
