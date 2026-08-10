'use strict';
// ============ core.js — 核心：存檔(save/load)、全域狀態(G/R/B)、公用工具、屬性彙總 ============

function hasCurse(key){ for(const sl of ['w','a','t']){ const it=G.equip[sl]; if(it && it.affixes.some(a=>a.k===key)) return true; } return false; }

function potionPool(){ return Object.keys(POTIONS).filter(k=>!POTIONS[k].m || G.rec.deep >= POTIONS[k].m); }

function potPower(k){
  const f = R? R.floor : 1;
  if(k==='heal') return Math.round(playerMaxHp()*0.3);
  if(k==='bomb') return 12 + Math.round(f*1.5);
  if(k==='stone') return 14 + Math.round(f*0.6);
  if(k==='holy') return 10 + Math.round(f*0.5);
  return 0;
}

function pdesc(k){
  const p = POTIONS[k];
  if(k==='heal') return `回復 ${potPower(k)} 點生命＋30% 法力`;
  if(k==='bomb') return `對敵人造成 ${potPower(k)} 點傷害，易傷 2 回合`;
  if(k==='stone') return `獲得 ${potPower(k)} 點格擋`;
  if(k==='holy') return `對所有敵人 ${potPower(k)} 傷害，清除自身異常`;
  return p.d;
}

function potAdd(k){
  if(!R.pots) R.pots = {};
  R.pots[k] = (R.pots[k]||0) + 1; return true; // 無上限：種類與數量皆不限（已移除 4種×3瓶 上限）
}

function potTotal(){ return R && R.pots ? Object.values(R.pots).reduce((a,b)=>a+b,0) : 0; }

const SAVE_KEY = 'abyss-save-v1';

let G = null;       // 永久資料

let R = null;       // 本次探索

let B = null;       // 戰鬥

let uid = 1;

const rnd = (a,b)=>a+Math.floor(Math.random()*(b-a+1));

const pick = arr=>arr[Math.floor(Math.random()*arr.length)];
const $ = id=>document.getElementById(id);

function newSave(){ return {v3:1, cls:null, gold:0, stash:[], equip:{w:null,a:null,t:null},
  rec:{deep:0,cert:null,runs:0,boss:0}, mats:{iron:0,steel:0}, codex:{}, cyc:{unlocked:0},
  orig:{deep:0,cp:0,done:false}, cycData:{}, bounties:[], runes:[null,null,null], runeBag:[], gems:0, run:null, uid:1,
  // v424 四個新系統的欄位。這裡與 migrateChar 必須一模一樣，只改一邊會讓新舊角色分岔。
  statBuy:{str:0,int:0,spi:0,vit:0,agi:0},   // 素質提升：各素質已購點數（0～40）
  runeSeen:{},                                // 成就：各詞綴「曾取得過」的最高數值（見 seenRune）
  achv:{},                                    // 成就：id → 取得時間戳
  sigils:{equipped:[], owned:[], slots:0},    // 魔符：已裝備欄位／已擁有清單／已購買的格數
  killBest:0}; }                              // 單場殺怪數的歷史最高

// ⚠️ 僅供「最高成就徽章」排序與顯示，勿再用於任何難度判定（黑市/懸賞/解鎖請用 certPool() 與 cd(n).cp）。
// 理由：cycle*1000+floor 讓輪迴階級碾壓樓層，輪迴III 第1層會蓋掉輪迴II 100。
function certScore(cert){ // 認證難度分數：輪迴階級碾壓層數（輪迴I-1 > 本源-50）
  if(!cert) return -1;
  return cert.cycle * 1000 + cert.floor;
}
function recordCert(cycle, floor){ // 只保留最難的認證成就
  const cand = {cycle, floor};
  if(certScore(cand) > certScore(G.rec.cert)) G.rec.cert = cand;
}
function certifyDepth(cycle, floor){ // 唯一入口：只在「逃脫」或「通關」呼叫——認證＋解鎖該深度傳送點一起做
  recordCert(cycle, floor);
  if(cycle === 0) G.orig.cp = Math.max(G.orig.cp, Math.min(floor, 41)); // 本源傳送點上限 41
  else { const c = cd(cycle); c.cp = Math.max(c.cp, floor); }           // 輪迴無傳送上限（樓層本身封 100）
}
function certGearCtx(){ // 營地生裝備的唯一難度來源：直接綁認證的「樓層＋輪迴」（無認證則回退最深樓層）
  const c = G.rec.cert;
  return c ? {floor: c.floor, cyc: c.cycle} : {floor: Math.max(12, G.rec.deep||10), cyc: 0};
}
/* 每個輪迴各自的認證深度（資料本來就分開存在 G.orig.cp / G.cycData[c].cp，不必動存檔結構）。
   G.rec.cert 只留給「最高成就徽章」顯示；黑市與懸賞一律改讀這裡——
   否則踏進輪迴III 逃脫第1層就會蓋掉輪迴II 100，營地整個崩掉（certScore 用 cycle*1000+floor 編碼，階級碾壓樓層）。
   eq = 等效樓層 = floor × cycK(cycle)，這是跨輪迴比較強度的唯一正確基準。 */
/* 該輪迴的「認證深度」＝成功回營過的最深樓層。
   ⚠️ 不可以用 cp（傳送點）代替:本源的 cp 被刻意封在 41(不讓你傳送過 50 層首領),
      拿 cp 當認證會讓打穿本源 50 的玩家只買得到 31–41 層的貨。cycle 1+ 兩者才碰巧相等。
   deep 與 cp 同樣只在 bankRun(逃脫/通關) 推進,規則一致;取 max 是為了相容任何 cp>deep 的舊檔。 */
function certDepthOf(cyc){
  if(cyc === 0) return Math.max(G.orig.deep||0, G.orig.cp||0);
  const c = cd(cyc); return Math.max(c.deep||0, c.cp||0);
}
function certPool(){
  const out = [];
  if(G.orig && certDepthOf(0) > 0) out.push({cyc:0, floor:certDepthOf(0)});
  for(const k of Object.keys(G.cycData||{})){
    const c = +k;
    if(c > 0 && certDepthOf(c) > 0) out.push({cyc:c, floor:certDepthOf(c)});
  }
  for(const e of out) e.eq = e.floor * cycK(e.cyc);
  out.sort((a,b)=>b.eq-a.eq);
  if(!out.length){ const g = certGearCtx(); out.push({cyc:g.cyc, floor:g.floor, eq:g.floor*cycK(g.cyc)}); }
  // 自動隱藏過期分頁：等效樓層低於最強者 25% 的不再顯示，免得累積出三頁沒人看的垃圾。
  // 25% 而非 40%：低分頁的價值是「便宜」，錢不夠時仍是真選項；卡太緊會讓分頁在最常見的情境下整個消失。
  const top = out[0].eq;
  return out.filter(e=>e.eq >= top*0.25);
}
function certText(cert){ // 認證成就顯示文字
  if(!cert) return '—';
  if(cert.cycle === 0) return '本源 '+cert.floor+(cert.floor>=50?'✓':'');
  if(cert.cycle >= 4) return '無限 '+cert.floor;
  return '輪迴'+'I'.repeat(cert.cycle)+' '+cert.floor;
}
function realmFor(floor){ return REALMS[realmIdx(floor)]; }   // 依 realmIdx 取域（過 50 層後 5 域循環，規則跟著繞回）

function healMult(){ const z = R? realmFor(R.floor):null; return (z && z.rule==='heal75')? 0.75 : 1; }

/* 異常狀態 (§8)：毒/燃分段傷害＋職業專精上限 */
function dotPct(kind, layers){   // 該回合傷害佔目標最大生命的比例（前10層各1.5%；尾段 毒0.5%/燃1%）
  const head = Math.min(layers, 10) * DOT.base;
  const tail = Math.max(0, layers - 10) * (kind==='poison' ? DOT.poisonTail : DOT.burnTail);
  return head + tail;
}
function dotCap(kind, onEnemy){   // 層數上限：對敵人吃職業專精（盜賊毒20/法師燃15），對自己（敵人下的）維持10
  if(!onEnemy) return DOT.baseCap;
  if(kind==='poison') return (G && G.cls==='assassin') ? DOT.poisonSpecCap : DOT.baseCap;
  if(kind==='burn')   return (G && G.cls==='white')    ? DOT.burnSpecCap   : DOT.baseCap;
  return DOT.baseCap;
}

function blessMult(){   // 數值型祝福隨深度/輪迴縮放（見 data.js BLESS_SCALE_KEYS）；率型/吸血維持固定
  const f = R ? R.floor : 1, c = R ? (R.cycle||0) : 0;
  return 1 + (f-1)*0.05 + blessCyc(c)*0.5;   // 每層 +5%、每重輪迴再加 blessCyc×0.5（起點值，可調）
}

/* 貨幣顯示的唯一入口。
   以前每個畫面各自寫一份（save() 寫 camp-gold、renderCamp 寫 camp-gem、renderMarket 寫 mk-gem），
   所以「回報懸賞拿到鑽石」之後只有一部分畫面更新 → 營地與黑市的鑽石數字對不上。碎銀之前也犯過同一件事。
   現在一律在這裡從 G 讀，並由 save() 統一觸發——任何改動金錢的地方本來都會 save()。
   新增顯示點只要往 WALLET 加一筆，不要再在各自的 render 裡另寫。 */
const WALLET = [['camp-gold', g=>g.gold, 0], ['camp-gem', g=>g.gems||0, 0],
                ['mk-gold', g=>g.gold, 1], ['mk-gem', g=>g.gems||0, 1],
                ['gear-gold', g=>g.gold, 1], ['sm-gold', g=>g.gold, 1],
                ['bn-gold', g=>g.gold, 1], ['bn-gem', g=>g.gems||0, 1]];
function syncWallet(){
  if(!G) return;
  for(const [id, get, withIcon] of WALLET){
    const el = document.getElementById(id); if(!el) continue;
    const ic = id.slice(-3) === 'gem' ? 'ic-gem' : 'ic-gold';
    if(withIcon) el.innerHTML = '<svg class="ic"><use href="#' + ic + '"/></svg> ' + get(G);
    else el.textContent = get(G);
  }
  const sc = document.getElementById('stash-count'); if(sc) sc.textContent = '倉庫 ' + G.stash.length + ' 件';
}
function save(){ if(G) G.run = R; accSave(); syncWallet(); }

function load(){ try{
  accLoad();                       // 建立/遷移帳號、挑出當前角色到 G（每角色遷移在 account.js）
  if(!G) return false;             // 沒有任何角色 → 交由流程去創角
  R = G.run || null;
  if(R && Array.isArray(R.potions)){ R.pots = {}; for(const k of R.potions) R.pots[k] = Math.min(3,(R.pots[k]||0)+1); delete R.potions; }
  if(R && !R.pots) R.pots = {};
  return true;
}catch(e){ console.warn('[abyss] 讀檔失敗，將以空存檔開始：', e); } G = null; R = null; return false; }

/* ── 圖片預載 ──
   問題：<img> 是渲染當下才建立的，瀏覽器到那一刻才開始下載 → 進戰鬥/開倉庫會看到圖慢一拍才出現。
   解法：一進營地就在背景把所有圖抓進瀏覽器快取。三個資料夾加起來約 1.15 MB，
        分批（每批 8 張）送出避免一次塞爆連線，並在 requestIdleCallback 裡跑，不跟開場渲染搶資源。
   註：Service Worker 的預快取只保障「離線可用」，第一次線上遊玩仍要走網路，所以這層還是需要。 */
const _preloaded = [];   // 持有 reference，避免被 GC 掉又要重抓
let _preloadDone = false;
function preloadArt(){
  if(_preloadDone) return; _preloadDone = true;
  // ⚠️ 整段包 try：預載只是最佳化，絕對不能因為它壞掉就擋住遊戲流程。
  //    （踩過：這函式在 renderCamp 第一行丟例外 → confirmClass 的 showScreen('s-camp') 跑不到 → 卡在選職業）
  try{
    const v = '?v=' + window.IMG_VER;   // 圖片一律吃 IMG_VER，見 index.html 的說明
    const urls = [];
    // 職業圖排最前面：選職業畫面緊接在標題之後，是全流程最早需要圖的地方
    for(const c in CLASSES) if(CLASSES[c].img) urls.push('ui/'+CLASSES[c].img+'.webp'+v);
    for(const k in ENEMIES) if(ENEMIES[k].img) urls.push('mon/'+k+'.webp'+v);
    for(const b of MINI_BOSSES.concat(LORD_BOSSES)) if(b.img) urls.push('mon/'+b.key+'.webp'+v);
    if(FINAL_BOSS.img) urls.push('mon/final.webp'+v);
    // ⚠️ REALM_ELITES 是「每域一個子陣列」的巢狀結構，要跑兩層。
    //    v446 之前只跑一層，e 拿到的是陣列、e.img 恆為 undefined ——
    //    10 隻域限精英一張都沒預載，症狀是「進精英戰圖慢一拍」。
    for(const arr of REALM_ELITES) for(const e of arr) if(e.img) urls.push('mon/'+e.key+'.webp'+v);
    for(const k of RUNTIME_MON_IMG) urls.push('mon/'+k+'.webp'+v);   // imgKey 借用的圖，資料表推導不到
    for(const w in WEAPON_TYPES) urls.push('eq/'+w+'.webp'+v);
    for(const s of new Set(Object.values(ITEM_ICON))) urls.push('eq/'+s+'.webp'+v);
    for(const s of new Set(Object.values(DOOR_IMG))) urls.push('ui/'+s+'.webp'+v);
    for(const k in POTIONS) if(POTIONS[k].img) urls.push('ui/'+POTIONS[k].img+'.webp'+v);
    for(const s of new Set(Object.values(EV_IMG))) urls.push('ui/'+s+'.webp'+v);
    for(const z of REALMS) if(z.bg) urls.push('ui/'+z.bg+'.webp'+v);   // 進域橫幅
    urls.push('ui/res_death.webp'+v, 'ui/smith.webp'+v,
              'ui/npc_smith.webp'+v, 'ui/bg_market.webp'+v,           // 鐵匠與黑市的場景圖
              'camp3.webp'+v);                                        // 營地底圖（第一次進營地就要）
    // title_bg 由 CSS 直接引用，瀏覽器解析 style.css 時就會抓，不需要在這裡預載
    let i = 0;
    const batch = ()=>{
      try{
        for(let n=0; n<12 && i<urls.length; n++, i++){   // 資產量從 79 成長到 120+，批次跟著加大
          const im = new Image(); im.decoding = 'async'; im.src = urls[i]; _preloaded.push(im);
          // 一定要 decode()：只等下載完成的話，解碼仍會發生在第一次繪製的當下——
          // 也就是玩家看得到的那一格。失敗（404／格式壞）只是少預載一張，不能讓它冒出來
          if(im.decode) im.decode().catch(()=>{});
        }
        if(i < urls.length) setTimeout(batch, 120);
      }catch(e){ console.warn('[abyss] 預載中止：', e); }
    };
    // ⚠️ requestIdleCallback 一定要綁 window——把它從 window 取出來直接呼叫，
    //    Chrome/Safari 會丟 "Illegal invocation"。
    if(typeof window.requestIdleCallback === 'function') window.requestIdleCallback(batch);
    else setTimeout(batch, 300);
  }catch(e){ console.warn('[abyss] 預載略過：', e); }
}

function showScreen(id){
  document.querySelectorAll('.screen').forEach(s=>s.classList.remove('show'));
  $(id).classList.add('show');
  $(id).scrollTop = 0;
  if(id==='s-camp' && typeof layoutCamp==='function') requestAnimationFrame(layoutCamp);
}

let toastT = null;

function toast(msg){ const t=$('toast'); t.innerHTML=msg;   // v393：改吃 HTML，讓 toast 也能放 SVG 圖示（呼叫點全是內部字串） t.classList.add('show');
  clearTimeout(toastT); toastT=setTimeout(()=>t.classList.remove('show'),1600); }

function sumAffix(key){
  let v = 0;
  for(const s of ['w','a','t']){
    const it = G.equip[s]; if(!it) continue;
    for(const a of it.affixes) if(a.k===key && !AFFIXES[a.k].curse) v += a.v;
  }
  if(G.runes) for(const rn of G.runes){ if(rn) for(const a of rn.affixes) if(a.k===key && !AFFIXES[a.k].curse && !a.mul) v += a.v; } // 符文被動（乘法型 mul 另由 runeMul 計）
  if(R && R.bless) for(const b of R.bless) if(b.k===key && !BLESS_NOT_AFFIX[b.k]) v += (BLESS_SCALE_KEYS[b.k] ? Math.round(b.v * blessMult()) : b.v);
  if(R && R.quench && R.quench.battles>0 && R.quench.k===key) v += R.quench.v;
  return v;
}

function runeMul(key){ // 素質/上限型符文（mul）：回傳總乘率 1 + Σ%/100
  let p = 0;
  if(G.runes) for(const rn of G.runes){ if(rn) for(const a of rn.affixes) if(a.mul && a.k===key) p += a.v; }
  return 1 + p/100;
}
function runeFmt(a){ // 符文詞綴顯示：乘法型顯示 +X%，其餘沿用原 fmt
  return a.mul ? `${AFFIXES[a.k].n} +${a.v}%` : AFFIXES[a.k].fmt(a.v);
}
function statTotal(key){ // 五素質彙總（出廠 baseStats ＋ 裝備詞綴 ＋ 素質符文乘法）
  const base = (G.cls && CLASSES[G.cls].baseStats) ? (CLASSES[G.cls].baseStats[key]||0) : 0;
  return Math.round((base + sumAffix(key)) * runeMul(key));
}
function rateFromStat(v){ // 素質→率 換算（見 data.js 的 STAT_DIV：近線性，每 ~3.5 素質換 1% 率）
  let r = 0, used = 0;
  for(const [cap, div] of STAT_DIV){
    const seg = Math.min(v, cap) - used;
    if(seg <= 0) break;
    r += seg / div;
    used += seg;
  }
  return r;
}
function defRate(){ return Math.min(RATE_CAP, (CLASSES[G.cls].baseRates.def||0) + rateFromStat(statTotal('vit')) + sumAffix('defr')); }
function dodgeRate(){ return hasCurse('heavy2') ? 0 : Math.min(RATE_CAP, (CLASSES[G.cls].baseRates.dodge||0) + rateFromStat(statTotal('agi')) + sumAffix('agile')); }
function critRate(){ return Math.min(RATE_CAP, (CLASSES[G.cls].baseRates.crit||0) + rateFromStat(statTotal('spi')) + sumAffix('crit')); }
function upBonus(up){ let b=0; for(let l=1;l<=(up||0);l++) b += l<=6?1:l<=9?2:3; return b; }   // 精煉增益：+1~6每級+1、+7~9+2、+10~12+3
function eqStat(it){ return it ? it.base + upBonus(it.up) : 0; }
function playerDef(){ // 防禦力（點數）：全職通用底＋護甲面板
  const a = G.equip.a;
  return BASE_DEF + eqStat(a);
}
function playerMaxHp(){
  let hp = Math.round((BASE_HP + statTotal('vit')*2 + sumAffix('hp')) * runeMul('hp'));
  if(sumAffix('fury')) hp = Math.round(hp*0.7);
  if(R && R.hpCut) hp = Math.round(hp * (1 - R.hpCut)); // 殘卷血契 (§10)
  return Math.max(1, hp);
}
function playerMaxMana(){   // 全職業統一：所有人都有魔力（魔符系統的前提），差別在精神高低
  return Math.round((BASE_MANA + statTotal('spi')*2 + sumAffix('mp')) * runeMul('mp'));
}
function manaRegenPct(){ return Math.min(MREGEN_CAP, 25 + statTotal('spi')/10 + sumAffix('mregen')); }   // 精神同時提升回魔速度（成本改%制後，回魔率＝施法頻率）
function weaponType(){ const w = G.equip.w; return WEAPON_TYPES[(w && w.wtype) || 'sword']; }
function mainStat(){ return statTotal(CLASSES[G.cls].mainStat); }
/* 六格技能的唯一來源。任何要列出「玩家現在能用哪些招」的地方都必須走這裡，
   不准再直接讀 CLASSES[G.cls].skills——拆卸與魔符只在這一支裡結算。

   回傳固定長度 4 + SIGIL_SLOTS 的陣列，空格是 null；長度固定所以戰鬥畫面高度恆定。
   G.sigils.equipped 的索引約定：
     0 .. swap.length-1        職業自帶的拆卸格（法師 2、制魔師 1、劍士盜賊 0）
     swap.length .. 之後        花錢買來的魔符格（上限 SIGIL_SLOTS）
   equipped 是空陣列時回傳值與改動前的 CLASSES[G.cls].skills 完全相同，行為不變。 */
function activeSkills(){
  const cls = CLASSES[G.cls];
  const eq = (G && G.sigils && G.sigils.equipped) || [];
  const swap = cls.swap || [];
  const out = cls.skills.slice();
  swap.forEach((sid, i) => {                      // 拆掉的本職技換成該格裝的魔符
    const s = eq[i];
    if(!s) return;
    const p = out.indexOf(sid);
    if(p >= 0) out[p] = s;
  });
  for(let i = 0; i < SIGIL_SLOTS; i++) out.push(eq[swap.length + i] || null);
  return out;
}
/* 空魔符格要顯示的字，三種狀態。戰鬥畫面與角色檢視共用這一支，不要各寫一份。
   k＝這是第幾個「花錢買的」格子（0 起算）；職業自帶的拆卸格不會走到這裡。 */
function sigilSlotHint(k){
  if(!G.orig.done) return '未開放';
  return k < sigilSlots() ? '未裝備' : '未購買';
}
function sigilSlots(){ return (G.sigils && G.sigils.slots) || 0; }   // 已購買的魔符格數，唯一入口
/* 力量祝福＝武器攻擊乘率，唯一入口（v436）。
   改成乘率是為了跨職業一致：舊制加的是「力量」素質，而傷害公式讀的是 mainStat()，
   主素質為 int 的法師／制魔師拿到等於沒拿。乘率掛在武器攻擊上，四個職業都吃得到。
   任何要顯示或計算武器攻擊的地方都要經過這裡，不要另外寫一份 1+v/100。 */
function blessWpnMult(){
  let p = 0;
  if(R && R.bless) for(const b of R.bless) if(b.k === 'str') p += b.v;
  return 1 + p/100;
}
function wpnAtk(){ return Math.round(eqStat(G.equip.w) * blessWpnMult()); }   // 顯示用武器攻擊（含祝福）
function playerAtk(){ // 顯示用：武器攻擊＋主素質
  return wpnAtk() + mainStat();
}
function playerCrit(){ return critRate(); }

function chemOn(id){ // 化學反應是否啟動：配方所需詞綴齊備
  const c = CHEMISTRY.find(x=>x.id===id);
  return !!c && c.need.every(k=>sumAffix(k)>0);
}

/* ⚠️ scrollTop 一定要歸零：.sheet 是 max-height:78vh + overflow-y:auto。
   從長表（角色檢視）切到短表（符文）時舊的捲動位置會留著 → 使用者看到一片空白、
   「關閉」鍵被捲到視窗外，點下去當然沒反應。這就是「符文的關閉鍵沒功能」的成因。 */
function openSheet(html){ const el = $('sheet'); el.innerHTML = html; el.scrollTop = 0; $('sheet-mask').classList.add('show'); }

function closeSheet(){ $('sheet-mask').classList.remove('show'); }

function cyclesUnlocked(){
  // 開輪迴 I：必須打穿本源 50 通關；開輪迴 II+：前一輪「認證深度」≥ CYC_NEXT（逃離才算）
  const legacy = G.cyc && G.cyc.unlocked > 0;
  if(!G.orig.done && !legacy) return 0;
  // 改讀「該輪迴自己的認證深度」，不再依賴 certScore 的 cycle*1000+floor 編碼
  let n = 1;
  while(n < 3 && certDepthOf(n) >= CYC_NEXT) n++;   // 輪迴 I→II→III：逃離認證 50 解鎖下一階
  if(n === 3 && certDepthOf(3) >= 100) n = 4;        // 無限(cycle 4)：打穿輪迴III 100 才解鎖
  return n;                                    // 封頂 4：無限是終極模式，不再增生
}

function cd(c){ if(!G.cycData[c]) G.cycData[c] = {deep:0, cp:0}; return G.cycData[c]; }

function cycMult(c){ if(c<=0) return 1; return c<=3 ? CYC_MULT[c-1] : CYC_MULT[2]*Math.pow(2.86, c-3); } // 等比×2.86/重 (§9)

function cycK(c){ if(c<=0) return 1; return c<=3 ? CYC_K[c-1] : CYC_K[2]*Math.pow(2.3, c-3); } // 裝備樓層成長倍率：只乘樓層項（基礎值/詞綴同軸），無限段 ×2.3/重

function blessCyc(c){ if(c<=0) return 0; return c<=3 ? BLESS_CYC[c-1] : (1+BLESS_CYC[2])*Math.pow(2.3, c-3) - 1; } // 祝福縮放專用（凍結舊 cycVal 曲線）

/* ⚠️ 死程式（保留不刪）：scaleMult 目前全域無人呼叫，怪物成長改由別處處理。
   接上會讓怪物在線性成長之外再吃一層指數，直接打壞平衡；刪掉則失去這條曲線的紀錄。
   決議：註記保留，不接上也不刪除。 */
function scaleMult(floor){
  const base = 1 + (floor-1)*0.08 + Math.max(0, floor-50)*0.04;
  return base * cycMult((R&&R.cycle)||0);
}

function realmIdx(floor){ return (Math.ceil(floor/10) - 1) % 5; }   // 每 10 層一域；過 50 層循環回域 0（1-10→0…41-50→4、51-60→0…）

