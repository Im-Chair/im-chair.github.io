'use strict';
// ============ ui.js — 介面：標題/選職業/營地/角色檢視/圖鑑/存檔管理/啟動 ============

function titleStart(){
  if(!ACC.chars.length){ newChar(); return; }   // 沒角色 → 直接創第一個
  openRoster();                                   // 有角色 → 角色選擇
}

function wipeConfirm(){
  openSheet(`<h3>放棄一切？</h3><p class="base">所有角色、共用倉庫、紀錄全部歸零。這不是深淵的懲罰，是你自己選的。</p>
  <div class="row" style="margin-top:14px"><button class="btn danger" onclick="wipeAll()">歸零</button>
  <button class="btn" onclick="closeSheet()">算了</button></div>`);
}

function wipeAll(){ localStorage.removeItem(ACC_KEY); localStorage.removeItem(SAVE_KEY); ACC={v:1,chars:[],active:0,sharedStash:[],uid:1}; G=null; R=null; closeSheet(); titleStart(); }

let pendingClass = null;

function renderClassSelect(){
  const g = $('class-grid'); g.innerHTML = '';
  for(const [k,c] of Object.entries(CLASSES)){
    const d = document.createElement('div');
    d.className = 'class-card'; d.dataset.k = k;
    d.innerHTML = `<div class="ci">${classIcon(k,'lg')}</div><div class="cn">${c.name}</div>
      <div class="cd">${c.desc}</div>
      <div style="font-size:11px;color:var(--dim)">${['str','int','vit','agi','spi'].filter(k=>c.baseStats[k]>0).map(k=>STATS[k].i+c.baseStats[k]).join('　')}</div>
      <div style="font-size:10px;color:var(--dim)">主素質：${STATS[c.mainStat].i}${STATS[c.mainStat].n}</div>`;
    d.onclick = ()=>{ document.querySelectorAll('.class-card').forEach(x=>x.classList.remove('selected'));
      d.classList.add('selected'); pendingClass = k; };
    g.appendChild(d);
  }
}

function confirmClass(){
  if(!pendingClass){ toast('先選一個職業'); return; }
  let c;
  if(pendingCreate || !G){ c = newSave(); ACC.chars.push(c); ACC.active = ACC.chars.length-1; G = c; R = null; B = null; }
  else { c = G; }
  pendingCreate = false;
  c.cls = pendingClass;
  if(!c.equip.w){
    const starter = {sword:['sword','傳家的舊劍'], assassin:['dagger','磨薄的短刃'],
                     white:['staff','見習法杖'], dark:['staff','裂紋咒杖']}[pendingClass];
    c.equip.w = {id:uid++, slot:'w', rar:0, up:0, banked:true, base:5,
                 wtype:starter[0], name:starter[1], affixes:[]};
  }
  save(); renderCamp(); showScreen('s-camp');
}

/* 熱區對位（v393 重寫）
   舊版在這裡算 cover 的縮放與裁切位移，圖寬高還寫死 1080×1747——那正是「同一組座標在不同手機
   落在圖片不同位置」的成因（實測 iPhone SE 與 Pixel 7 之間差了圖寬 5.5%）。
   現在 .camp-scene 是固定 2:3 + background-size:contain，容器比例＝圖片比例，
   百分比直接就是圖片百分比。不需要圖片尺寸、不需要位移、所有裝置一致。
   ⚠️ 換圖時若新圖不是 2:3，要同步改 style.css 的 aspect-ratio，否則這個保證就沒了。 */
let campRatio = 941/1672;   // camp3.webp。只需要「比例」，不需要絕對像素
/* 開機時從實際圖檔讀回比例，換圖也不會和這裡的常數脫節（舊版把 1080×1747 寫死，換圖就錯）。
   包 try 且不擋任何流程——非必要的東西不可以站在必要流程前面（v389 的教訓）。 */
try{
  if(typeof Image === 'function'){
    const _ci = new Image();
    _ci.onload = () => { if(_ci.naturalHeight){ campRatio = _ci.naturalWidth/_ci.naturalHeight; layoutCamp(); } };
    _ci.src = 'camp3.webp?v=' + window.IMG_VER;
  }
}catch(e){}

function layoutCamp(){
  const scene = document.querySelector('.camp-scene'); if(!scene) return;
  const cw = scene.clientWidth, ch = scene.clientHeight; if(!cw || !ch) return;
  // background-size:contain 的實際擺放，精確重算一次。
  // 舊版用的是 cover（Math.max）——cover 會裁切，容器百分比就不等於圖片百分比，
  // 那才是熱區在不同手機上漂移的真正成因（實測 iPhone SE 與 Pixel 7 差了圖寬 5.5%）。
  // contain 不裁切，所以這個換算是精確的，與裝置比例無關。
  const fit = cw/ch > campRatio;
  const dh = fit ? ch : cw/campRatio, dw = fit ? ch*campRatio : cw;
  const ox = (cw-dw)/2, oy = (ch-dh)/2;
  scene.querySelectorAll('.hot').forEach(h=>{
    const fx=+h.dataset.fx, fy=+h.dataset.fy, fw=+h.dataset.fw, fh=+h.dataset.fh;
    h.style.left=(ox+fx*dw)+'px'; h.style.top=(oy+fy*dh)+'px';
    h.style.width=(fw*dw)+'px';   h.style.height=(fh*dh)+'px';
  });
}
window.addEventListener('resize', layoutCamp);
function renderCamp(){
  if(!G || !G.cls) return;
  ensureBounties();
  const c = CLASSES[G.cls];
  const set = (id,v)=>{ const e=$(id); if(e) e.textContent = v; };
  set('camp-gold', G.gold);
  set('camp-gem', G.gems||0);
  const ci = $('camp-cls-ic'); if(ci) ci.innerHTML = classIcon(G.cls,'sm');
  set('camp-cls', c.name);
  set('camp-cert', '認證 '+certText(G.rec.cert));
  const ba = (G.bounties||[]).filter(b=>b.state==='active').length;
  const bb = $('bounty-badge'); if(bb){ bb.textContent = ba||''; bb.style.display = ba? '' : 'none'; }
  // 黑市未解鎖＝那格沒點燈（6.6）。玩家直接讀成「還沒開」，不必先點下去才知道
  // toggle(cls, force) 的第二參數在舊 WebView 不支援，用 add/remove 才安全
  const hm = $('hot-market');
  if(hm){ if(G.rec && G.rec.deep >= 30) hm.classList.remove('locked'); else hm.classList.add('locked'); }
  // 圖鑑改建中也一樣壓暗。原本只有點下去才吐 toast，等於「看得見、點得到、但沒有回應」——
  // 熱區的亮度本來就是「可不可點」的訊號，讓它自己說話
  const hc = $('hot-codex');
  if(hc){ if(CODEX_ENABLED) hc.classList.remove('locked'); else hc.classList.add('locked'); }
  save();
  preloadArt();   // 放最後：背景預載圖檔。它自己包了 try，但仍不放在任何必要流程前面
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
  const code = btoa(unescape(encodeURIComponent(localStorage.getItem(ACC_KEY))));
  openSheet(`<h3>匯出存檔</h3>
    <p class="base">全選複製下面這串，貼到備忘錄保存：</p>
    <textarea id="sv-out" readonly style="width:100%;height:120px;background:var(--panel);color:var(--text);border:1px solid var(--line);border-radius:8px;padding:8px;font-size:11px">${code}</textarea>
    <button class="btn primary" style="margin-top:8px" onclick="copySave()">全選並複製</button>
    <button class="btn" style="margin-top:8px" onclick="closeSheet()">關閉</button>`);
}

function copySave(){
  const t = document.getElementById('sv-out'); if(!t) return;
  if(navigator.clipboard && navigator.clipboard.writeText){
    navigator.clipboard.writeText(t.value).then(()=>toast('已複製')).catch(()=>fallbackCopy(t));
  } else fallbackCopy(t);
}
function fallbackCopy(t){   // 舊瀏覽器 / 非安全內容的退路
  t.select(); t.setSelectionRange(0,999999);
  try{ document.execCommand('copy'); toast('已複製'); }
  catch(e){ toast('複製失敗，請手動選取'); }
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
    let acc;
    if(data.chars) acc = data;                                                                            // 帳號格式
    else if(data.cls || data.rec) acc = {v:1, chars:[data], active:0, sharedStash:[], uid:data.uid||1};   // 舊單角色 → 包成帳號
    else throw new Error('格式不對');
    localStorage.setItem(ACC_KEY, JSON.stringify(acc));
    G = null; R = null; B = null; load();
    closeSheet();
    if(G && G.cls){ renderCamp(); showScreen('s-camp'); } else { showScreen('s-title'); }
    toast('匯入成功');
  }catch(e){ toast('匯入失敗：存檔碼無效'); }
}

function openCodex(){
  // 🔒 圖鑑暫時關閉（改建中）。關的只有「入口」——擊殺計數仍照常累積進 G.codex，
  //    重新開放時歷史完整不會斷層。要開回來把 CODEX_ENABLED 改 true 即可，介面程式碼原封不動保留在下面。
  if(!CODEX_ENABLED) return toast('圖鑑改建中——你殺過的東西還是有記著');
  let html = '<h3>深淵圖鑑</h3><p class="base">殺過的東西會留在紙上。首次收錄 +30<svg class="ic"><use href="#ic-gold"/></svg>。</p>';
  const row = e => {
    const kills = G.codex[e.key];
    const pic = kills && e.img ? monImg(e.key, 'cx-ic') : '';   // 未收錄的不洩漏長相
    return kills
      ? `<div class="item-row">${pic}<div class="ir-body"><span class="in">${e.boss?'<span class="r-orange">'+e.n+'</span>':e.n}</span><span class="is">擊殺 ×${kills}</span></div></div>`
      : `<div class="item-row" style="opacity:.4"><span class="in"><svg class="ic"><use href="#ic-unknown"/></svg> ？？？</span><span class="is">未收錄</span></div>`;
  };
  REALMS.slice(0,5).forEach((z, ri)=>{
    html += `<div class="section-title">${z.n}</div><div class="item-list">`;
    for(const [k,e] of Object.entries(ENEMIES)) if(e.realm===ri) html += row({key:k, n:e.n, i:e.i, img:e.img});
    for(const re of REALM_ELITES[ri]) html += row({key:re.key, n:re.n, i:re.i, img:re.img, boss:true});
    const mb = MINI_BOSSES[ri];
    html += row({key:mb.key, n:mb.n, i:mb.i, img:mb.img, boss:true});
    if(LORD_BOSSES[ri]){ const lb = LORD_BOSSES[ri]; html += row({key:lb.key, n:lb.n, i:lb.i, img:lb.img, boss:true}); }
    else html += row({key:'final', n:FINAL_BOSS.n, i:FINAL_BOSS.i, img:FINAL_BOSS.img, boss:true});
    html += '</div>';
  });
  html += '<button class="btn" style="margin-top:12px" onclick="closeSheet()">關閉</button>';
  openSheet(html);
}

function openRunStats(){
  const rows = [];
  const w = G.equip.w, wt = weaponType();
  const wVal = eqStat(w), msVal = mainStat(), msName = STATS[CLASSES[G.cls].mainStat].n;
  const cMagic = CLASSES[G.cls].mainStat==='int', misW = cMagic !== !!wt.magic;
  rows.push([`${wt.i} ${wVal+msVal}`, `攻擊力（武器${wVal}＋${msName}${msVal}）${misW?(cMagic?'｜<svg class="ic"><use href="#ic-warn"/></svg> 不合手·普攻武器×0.5、法術×0':'｜<svg class="ic"><use href="#ic-warn"/></svg> 不合手·武器攻擊×0'):(wt.magic?'｜普攻物理·法術對盾減半':'')}`]);
  rows.push([`${R? R.hp : playerMaxHp()}/${playerMaxHp()}`, '<svg class="ic"><use href="#ic-heart"/></svg> 生命']);
  if(playerMaxMana()>0) rows.push([`${R? (R.mana||0) : playerMaxMana()}/${playerMaxMana()}`, '<svg class="ic"><use href="#ic-mana"/></svg> 法力（回 '+Math.round(manaRegenPct())+'%/回合）']);
  rows.push([playerDef(), '<svg class="ic"><use href="#ic-shield"/></svg> 防禦力（減 '+(playerDef()/10).toFixed(1)+' 點）']);
  const mkRate = (fn, statKey, label) => {
    const total = fn(), fromStat = rateFromStat(statTotal(statKey));
    return [total.toFixed(0)+'%'+(total>=RATE_CAP?'（頂）':''), label+(fromStat>0.5?'（素質貢獻 '+fromStat.toFixed(0)+'%）':'')];
  };
  rows.push(mkRate(defRate, 'vit', '<svg class="ic"><use href="#ic-shield"/></svg> 防禦率'));
  rows.push(mkRate(dodgeRate, 'agi', '<svg class="ic"><use href="#ic-dodge"/></svg> 閃避率'));
  rows.push(mkRate(critRate, 'spi', '<svg class="ic"><use href="#ic-crit"/></svg> 爆擊率'));
  // 五素質列
  const statRow = ['str','int','vit','agi','spi']
    .map(k=>`${STATS[k].i}${statTotal(k)}`).join('　');
  // 功能與傳說
  const extra = [
    ['vamp','<svg class="ic"><use href="#ic-blood"/></svg> 吸血', v=>Math.min(VAMP_CAP,v)+'%'+(v>VAMP_CAP?'（上限'+VAMP_CAP+'）':'')],
    ['thorns','<svg class="ic"><use href="#ic-thorns"/></svg> 荊棘', v=>'反彈受到傷害 '+v+'%'], ['mend','<svg class="ic"><use href="#ic-heal"/></svg> 急救', v=>'戰後回 '+v+'%'],
    ['dotdrain','<svg class="ic"><use href="#ic-drain"/></svg> 蝕取', v=>'毒燃回血 '+v+'%'],
    ['ptouch','<svg class="ic"><use href="#ic-poison"/></svg> 淬毒', v=>'攻擊附 '+v+' 層'], ['btouch','<svg class="ic"><use href="#ic-fire"/></svg> 淬焰', v=>'攻擊附 '+v+' 層'],
    ['bpyre','<svg class="ic"><use href="#ic-fire"/></svg> 烈焰', v=>'燃傷 +'+v+'%'], ['ppyre','<svg class="ic"><use href="#ic-poison"/></svg> 劇毒', v=>'毒傷 +'+v+'%'],
    ['greed','<svg class="ic"><use href="#ic-gold"/></svg> 貪婪', v=>'+'+v+'%'],
    ['vform','<svg class="ic"><use href="#ic-legend"/></svg> 蝕魂', v=>'攻擊轉中毒'], ['wall','<svg class="ic"><use href="#ic-legend"/></svg> 壁壘', v=>'格擋不消失'],
    ['fury','<svg class="ic"><use href="#ic-legend"/></svg> 狂血', v=>'傷害+40% 血-30%'], ['spark','<svg class="ic"><use href="#ic-legend"/></svg> 燧心', v=>'爆擊回行動'],
    ['symbio','<svg class="ic"><use href="#ic-legend"/></svg> 腐生', v=>'毒傷回血50%'], ['exem','<svg class="ic"><use href="#ic-legend"/></svg> 斬首', v=>'低血敵+50%'],
    ['regen','<svg class="ic"><use href="#ic-legend"/></svg> 血甲', v=>'每回合回3%血'], ['feast','<svg class="ic"><use href="#ic-legend"/></svg> 貪食', v=>'擊殺回15%血'],
    ['guts','<svg class="ic"><use href="#ic-legend"/></svg> 不屈', v=>'免死一次/場'], ['luck7','<svg class="ic"><use href="#ic-legend"/></svg> 賭運', v=>'爆傷2.1倍'],
    ['ember','<svg class="ic"><use href="#ic-legend"/></svg> 餘燼', v=>'燃燒不減半'], ['wildfire','<svg class="ic"><use href="#ic-legend"/></svg> 延燒', v=>'擊殺傳燃層'],
  ];
  for(const [k, label, fmt] of extra){ const v = sumAffix(k); if(v>0) rows.push([fmt(v), label]); }
  let html = '<h3>角色檢視</h3>' +
    `<div style="text-align:center;color:var(--gold);font-size:14px;margin:6px 0">${statRow}</div>` +
    '<div class="stat-grid" style="grid-template-columns:1fr 1fr">' +
    rows.map(([v,k])=>`<div class="stat-box"><div class="v" style="font-size:15px">${v}</div><div class="k">${k}</div></div>`).join('') + '</div>';
  // 化學反應：純彩蛋——只在湊齊時顯示，沒湊到不提示
  const chemRows = [];
  for(const c of CHEMISTRY){
    if(c.need.every(k=>sumAffix(k)>0))
      chemRows.push(`<div class="base" style="color:var(--gold)">${c.i}【${c.n}】${c.d}</div>`);
  }
  if(chemRows.length) html += '<div class="section-title"><svg class="ic"><use href="#ic-flask"/></svg> 詞綴反應</div>' + chemRows.join('');
  html += `<button class="btn" style="margin-top:10px" onclick="openRunes()"><svg class="ic"><use href="#ic-star"/></svg> 符文槽 ${(G.runes||[]).filter(Boolean).length}/3${(G.runeBag||[]).length?'　（持有 '+G.runeBag.length+'）':''}</button>`;
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
    html += R.bless.map(b=>`<div class="affix"><svg class="ic"><use href="#ic-bless"/></svg> ${bn[b.k]||b.k} +${BLESS_SCALE_KEYS[b.k] ? Math.round(b.v*blessMult()) : b.v}</div>`).join('');
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
  $('btn-wipe').style.display = (ACC.chars.length>0)? 'block':'none';
  showScreen('s-title');
})();

