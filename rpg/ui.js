'use strict';
// ============ ui.js — 介面：標題/選職業/營地/角色檢視/圖鑑/存檔管理/啟動 ============

function titleStart(){
  if(!G.cls){ renderClassSelect(); showScreen('s-class'); return; }
  if(R){ resumeRun(); return; }
  renderCamp(); showScreen('s-camp');
}

function wipeConfirm(){
  openSheet(`<h3>放棄一切？</h3><p class="base">職業、倉庫、紀錄全部歸零。這不是深淵的懲罰，是你自己選的。</p>
  <div class="row" style="margin-top:14px"><button class="btn danger" onclick="wipeAll()">歸零</button>
  <button class="btn" onclick="closeSheet()">算了</button></div>`);
}

function wipeAll(){ localStorage.removeItem(SAVE_KEY); G = newSave(); R=null; closeSheet(); titleStart(); }

let pendingClass = null;

function renderClassSelect(){
  const g = $('class-grid'); g.innerHTML = '';
  for(const [k,c] of Object.entries(CLASSES)){
    const d = document.createElement('div');
    d.className = 'class-card'; d.dataset.k = k;
    d.innerHTML = `<div class="ci">${c.icon}</div><div class="cn">${c.name}</div>
      <div class="cd">${c.desc}</div>
      <div style="font-size:11px;color:var(--dim)">❤️${c.hp}　🛡${c.def}　💨${c.dodge}%　🎯${c.crit}%${c.mana?'　🔮'+c.mana:''}</div>
      <div style="font-size:10px;color:var(--dim)">主素質：${STATS[c.mainStat].i}${STATS[c.mainStat].n}</div>`;
    d.onclick = ()=>{ document.querySelectorAll('.class-card').forEach(x=>x.classList.remove('selected'));
      d.classList.add('selected'); pendingClass = k; };
    g.appendChild(d);
  }
}

function confirmClass(){
  if(!pendingClass){ toast('先選一個職業'); return; }
  G.cls = pendingClass;
  if(!G.equip.w){
    const starter = {sword:['sword','傳家的舊劍'], assassin:['dagger','磨薄的短刃'],
                     white:['staff','見習法杖'], dark:['staff','裂紋咒杖']}[pendingClass];
    G.equip.w = {id:uid++, slot:'w', rar:0, up:0, banked:true, base:5,
                 wtype:starter[0], name:starter[1], affixes:[]};
  }
  save(); renderCamp(); showScreen('s-camp');
}

function renderCamp(){
  const c = CLASSES[G.cls];
  $('camp-cls').textContent = `${c.icon} ${c.name}`;
  $('camp-gold').textContent = G.gold;
  $('rec-deep').textContent = G.rec.deep;
  $('rec-runs').textContent = G.rec.runs;
  $('rec-boss').textContent = G.rec.boss;
  $('stash-count').textContent = `倉庫 ${G.stash.length} 件`;
  $('smith-hint').textContent = G.rec.deep>=10 ? '強化與重鑄' : '強化身上的武器與護甲';
  const cu = cyclesUnlocked();
  $('dive-hint').textContent = cu > 0
    ? `本源 ${G.orig.deep}${G.orig.done?'✓':''}｜輪迴 ${'I'.repeat(Math.min(cu,3))}${cu>3?'+'+(cu-3):''} 開放`
    : (G.orig.cp >= 5 ? `本源最深 ${G.orig.deep}｜傳送點至 ${G.orig.cp+1} 層` : '五十層的旅程，從這裡開始');
  const seen = Object.keys(G.codex).length;
  const total = Object.keys(ENEMIES).length + REALM_ELITES.length + MINI_BOSSES.length + LORD_BOSSES.length + 1;
  $('codex-hint').textContent = `收錄 ${seen}/${total}`;
  const mi = $('market-item');
  if(G.rec.deep >= 30){ mi.style.display='flex'; $('market-hint').textContent='封條盲盒——開了才算數'; }
  else mi.style.display='none';
  const ms = [];
  ms.push((G.rec.deep>=10?'✓':'🔒')+' 10層 鐵匠重鑄');
  ms.push((G.rec.deep>=20?'✓':'🔒')+' 20層 深層藥劑');
  ms.push((G.rec.deep>=30?'✓':'🔒')+' 30層 深淵黑市');
  if(G.rec.clear) ms.push('🫀 通關 ×'+G.rec.clear);
  const cun = cyclesUnlocked();
  if(cun) ms.push('🔄 輪迴 ×'+cun);
  if(G.orig.done) ms.push('🌅 本源完結');
  $('milestone-line').textContent = ms.join('　');
  save();
}

function openSaveMgr(){
  openSheet(`<h3>存檔管理</h3>
    <p class="base">瀏覽器可能在長期未使用後清除存檔。建議定期匯出備份，貼到備忘錄保存。</p>
    <button class="btn primary" onclick="exportSave()">匯出存檔</button>
    <div style="height:8px"></div>
    <button class="btn" onclick="importSaveUI()">匯入存檔</button>
    <div style="height:8px"></div>
    <button class="btn" onclick="closeSheet()">關閉</button>`);
}

function exportSave(){
  save();
  const code = btoa(unescape(encodeURIComponent(localStorage.getItem(SAVE_KEY))));
  openSheet(`<h3>匯出存檔</h3>
    <p class="base">全選複製下面這串，貼到備忘錄保存：</p>
    <textarea id="sv-out" readonly style="width:100%;height:120px;background:var(--panel);color:var(--text);border:1px solid var(--line);border-radius:8px;padding:8px;font-size:11px">${code}</textarea>
    <button class="btn primary" style="margin-top:8px" onclick="const t=document.getElementById('sv-out');t.select();t.setSelectionRange(0,999999);document.execCommand('copy');toast('已複製')">全選並複製</button>
    <button class="btn" style="margin-top:8px" onclick="closeSheet()">關閉</button>`);
}

function importSaveUI(){
  openSheet(`<h3>匯入存檔</h3>
    <p class="base">貼上之前匯出的存檔碼。<span style="color:var(--red)">會覆蓋現有進度。</span></p>
    <textarea id="sv-in" style="width:100%;height:120px;background:var(--panel);color:var(--text);border:1px solid var(--line);border-radius:8px;padding:8px;font-size:11px" placeholder="貼在這裡"></textarea>
    <button class="btn primary" style="margin-top:8px" onclick="importSave()">匯入並覆蓋</button>
    <button class="btn" style="margin-top:8px" onclick="closeSheet()">取消</button>`);
}

function importSave(){
  try{
    const raw = document.getElementById('sv-in').value.trim();
    const json = decodeURIComponent(escape(atob(raw)));
    const data = JSON.parse(json);
    if(!data.cls || !data.rec) throw new Error('格式不對');
    localStorage.setItem(SAVE_KEY, json);
    G = null; R = null; B = null; load();
    closeSheet(); renderCamp(); showScreen('s-camp');
    toast('匯入成功');
  }catch(e){ toast('匯入失敗：存檔碼無效'); }
}

function openCodex(){
  let html = '<h3>深淵圖鑑</h3><p class="base">殺過的東西會留在紙上。首次收錄 +30🪙。</p>';
  const row = e => {
    const kills = G.codex[e.key];
    return kills
      ? `<div class="item-row"><span class="in">${e.i} ${e.boss?'<span class="r-orange">'+e.n+'</span>':e.n}</span><span class="is">擊殺 ×${kills}</span></div>`
      : `<div class="item-row" style="opacity:.4"><span class="in">❓ ？？？</span><span class="is">未收錄</span></div>`;
  };
  REALMS.slice(0,5).forEach((z, ri)=>{
    html += `<div class="section-title">${z.i} ${z.n}</div><div class="item-list">`;
    for(const [k,e] of Object.entries(ENEMIES)) if(e.realm===ri) html += row({key:k, n:e.n, i:e.i});
    const re = REALM_ELITES[ri];
    html += row({key:re.key, n:re.n, i:re.i, boss:true});
    html += row({key:MINI_BOSSES[ri].key, n:MINI_BOSSES[ri].n, i:MINI_BOSSES[ri].i, boss:true});
    if(LORD_BOSSES[ri]) html += row({key:LORD_BOSSES[ri].key, n:LORD_BOSSES[ri].n, i:LORD_BOSSES[ri].i, boss:true});
    else html += row({key:'final', n:FINAL_BOSS.n, i:FINAL_BOSS.i, boss:true});
    html += '</div>';
  });
  html += '<button class="btn" style="margin-top:12px" onclick="closeSheet()">關閉</button>';
  openSheet(html);
}

function openRunStats(){
  const rows = [];
  const w = G.equip.w, wt = weaponType();
  rows.push([`${wt.i} ${w? (w.base+w.up):0}（${wt.magic?'魔攻':'物攻'}）`, '武器攻擊']);
  rows.push(['+'+mainStat(), STATS[CLASSES[G.cls].mainStat].i+' 主素質（'+STATS[CLASSES[G.cls].mainStat].n+'）']);
  rows.push([`${R? R.hp : playerMaxHp()}/${playerMaxHp()}`, '❤️ 生命']);
  if(playerMaxMana()>0) rows.push([`${R? (R.mana||0) : playerMaxMana()}/${playerMaxMana()}`, '🔮 法力（回 '+manaRegenPct()+'%/回合）']);
  rows.push([playerDef(), '🛡 防禦力（減 '+(playerDef()/10).toFixed(1)+' 點）']);
  const mkRate = (fn, statKey, label) => {
    const total = fn(), fromStat = rateFromStat(statTotal(statKey));
    return [total.toFixed(0)+'%'+(total>=RATE_CAP?'（頂）':''), label+(fromStat>0.5?'（素質貢獻 '+fromStat.toFixed(0)+'%）':'')];
  };
  rows.push(mkRate(defRate, 'vit', '🛡 防禦率'));
  rows.push(mkRate(dodgeRate, 'agi', '💨 閃避率'));
  rows.push(mkRate(critRate, 'spi', '🎯 爆擊率'));
  // 五素質列
  const statRow = ['str','int','vit','agi','spi']
    .map(k=>`${STATS[k].i}${statTotal(k)}`).join('　');
  // 功能與傳說
  const extra = [
    ['vamp','🩸 吸血', v=>Math.min(VAMP_CAP,v)+'%'+(v>VAMP_CAP?'（上限'+VAMP_CAP+'）':'')],
    ['thorns','🌵 荊棘', v=>'反彈 '+v], ['mend','💊 急救', v=>'戰後回 '+v+' 血'],
    ['ptouch','☠️ 淬毒', v=>'攻擊附 '+v+' 層'], ['btouch','🔥 燃焰', v=>'攻擊附 '+v+' 層'],
    ['greed','🪙 貪婪', v=>'+'+v+'%'],
    ['vform','✸ 蝕魂', v=>'攻擊轉中毒'], ['wall','✸ 壁壘', v=>'格擋不消失'],
    ['fury','✸ 狂血', v=>'傷害+40% 血-30%'], ['spark','✸ 燧心', v=>'爆擊回行動'],
    ['symbio','✸ 腐生', v=>'毒傷回血50%'], ['exem','✸ 斬首', v=>'低血敵+50%'],
    ['regen','✸ 血甲', v=>'每回合回3%血'], ['feast','✸ 貪食', v=>'擊殺回15%血'],
    ['guts','✸ 不屈', v=>'免死一次/場'], ['luck7','✸ 賭運', v=>'爆傷2.1倍'],
  ];
  for(const [k, label, fmt] of extra){ const v = sumAffix(k); if(v>0) rows.push([fmt(v), label]); }
  let html = '<h3>角色檢視</h3>' +
    `<div style="text-align:center;color:var(--gold);font-size:14px;margin:6px 0">${statRow}</div>` +
    '<div class="stat-grid" style="grid-template-columns:1fr 1fr">' +
    rows.map(([v,k])=>`<div class="stat-box"><div class="v" style="font-size:15px">${v}</div><div class="k">${k}</div></div>`).join('') + '</div>';
  html += '<div class="section-title">身上裝備</div>';
  for(const sk of ['w','a','t']){
    const it = G.equip[sk];
    if(!it){ html += `<div class="base">${slotName(sk)}：—</div>`; continue; }
    html += `<div class="loot-card ${RARITIES[it.rar].b}" style="margin:8px 0;padding:10px">
      <div class="${RARITIES[it.rar].cls}" style="font-size:15px">${it.name}${it.up?' +'+it.up:''}
        <span style="font-size:11px">${RARITIES[it.rar].n}${it.banked===false?'・<span style="color:var(--orange)">未保管</span>':''}</span></div>
      <div style="font-size:12px;color:var(--dim)">${slotName(sk)}｜${itemStatLine(it)}</div>
      ${affixHtml(it)}</div>`;
  }
  if(R && R.bless.length){
    html += '<div class="section-title">本次祝福</div>';
    const bn = {str:'力量',crit:'銳利',vamp:'血契',plate:'守勢',hp:'堅韌'};
    html += R.bless.map(b=>`<div class="affix">✦ ${bn[b.k]||b.k} +${b.v}</div>`).join('');
  }
  if(R && R.bag.length){
    html += `<div class="section-title">行囊（${R.bag.length} 件・未保管）</div><div class="item-list">`;
    for(const it of R.bag){
      html += `<div class="item-row ${RARITIES[it.rar].b}" onclick="openBagItem(${it.id})">
        <span class="in ${RARITIES[it.rar].cls}">${it.name}</span>
        <span class="is">${slotName(it.slot)}｜${itemStatLine(it)}</span></div>`;
    }
    html += '</div>';
  }
  html += '<button class="btn" style="margin-top:14px" onclick="closeSheet()">關閉</button>';
  openSheet(html);
}

function openBagItem(id){
  const it = R.bag.find(x=>x.id===id); if(!it) return;
  openItemSheet(it, 'bag');
}

(function init(){
  load();
  const hasSave = !!G.cls;
  $('btn-wipe').style.display = hasSave? 'block':'none';
  // 存檔中若卡在戰鬥，回到門的畫面重新選（血量保留）
  if(R && R.phase==='battle'){ R.phase='doors'; R.doors=null; R.forceDoor = R.lastDoor || 'fight'; }
  showScreen('s-title');
})();

