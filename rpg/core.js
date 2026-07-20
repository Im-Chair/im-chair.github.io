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
  orig:{deep:0,cp:0,done:false}, cycData:{}, bounties:[], runes:[null,null,null], runeBag:[], gems:0, run:null, uid:1}; }

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

function save(){ if(G) G.run = R; accSave();   // 寫回帳號（G 就是當前角色，已在 ACC 內）
  const cg = document.getElementById('camp-gold'); if(cg && G) cg.textContent = G.gold;
  const sc = document.getElementById('stash-count'); if(sc && G) sc.textContent = `倉庫 ${G.stash.length} 件`;
  const gg = document.getElementById('gear-gold'); if(gg && G) gg.textContent = '🪙 ' + G.gold;
}

function load(){ try{
  accLoad();                       // 建立/遷移帳號、挑出當前角色到 G（每角色遷移在 account.js）
  if(!G) return false;             // 沒有任何角色 → 交由流程去創角
  R = G.run || null;
  if(R && Array.isArray(R.potions)){ R.pots = {}; for(const k of R.potions) R.pots[k] = Math.min(3,(R.pots[k]||0)+1); delete R.potions; }
  if(R && !R.pots) R.pots = {};
  return true;
}catch(e){ console.warn('[abyss] 讀檔失敗，將以空存檔開始：', e); } G = null; R = null; return false; }

function showScreen(id){
  document.querySelectorAll('.screen').forEach(s=>s.classList.remove('show'));
  $(id).classList.add('show');
  $(id).scrollTop = 0;
  if(id==='s-camp' && typeof layoutCamp==='function') requestAnimationFrame(layoutCamp);
}

let toastT = null;

function toast(msg){ const t=$('toast'); t.textContent=msg; t.classList.add('show');
  clearTimeout(toastT); toastT=setTimeout(()=>t.classList.remove('show'),1600); }

function sumAffix(key){
  let v = 0;
  for(const s of ['w','a','t']){
    const it = G.equip[s]; if(!it) continue;
    for(const a of it.affixes) if(a.k===key && !AFFIXES[a.k].curse) v += a.v;
  }
  if(G.runes) for(const rn of G.runes){ if(rn) for(const a of rn.affixes) if(a.k===key && !AFFIXES[a.k].curse && !a.mul) v += a.v; } // 符文被動（乘法型 mul 另由 runeMul 計）
  if(R && R.bless) for(const b of R.bless) if(b.k===key) v += (BLESS_SCALE_KEYS[b.k] ? Math.round(b.v * blessMult()) : b.v);
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
function playerMaxMana(){
  if(CLASSES[G.cls].mainStat !== 'int') return Math.round(sumAffix('mp') * runeMul('mp')); // 物攻職業無基礎法力（除非裝備給）
  return Math.round((BASE_MANA + statTotal('spi')*2 + sumAffix('mp')) * runeMul('mp'));
}
function manaRegenPct(){ return Math.min(MREGEN_CAP, 25 + sumAffix('mregen')); }
function weaponType(){ const w = G.equip.w; return WEAPON_TYPES[(w && w.wtype) || 'sword']; }
function mainStat(){ return statTotal(CLASSES[G.cls].mainStat); }
function playerAtk(){ // 顯示用：武器攻擊＋主素質
  const w = G.equip.w;
  return eqStat(w) + mainStat();
}
function playerCrit(){ return critRate(); }

function chemOn(id){ // 化學反應是否啟動：配方所需詞綴齊備
  const c = CHEMISTRY.find(x=>x.id===id);
  return !!c && c.need.every(k=>sumAffix(k)>0);
}

function openSheet(html){ $('sheet').innerHTML = html; $('sheet-mask').classList.add('show'); }

function closeSheet(){ $('sheet-mask').classList.remove('show'); }

function cyclesUnlocked(){
  // 開輪迴 I：必須打穿本源 50 通關；開輪迴 II+：前一輪「認證深度」≥ CYC_NEXT（逃離才算）
  const legacy = G.cyc && G.cyc.unlocked > 0;
  if(!G.orig.done && !legacy) return 0;
  let n = 1;
  while(n < 3 && certScore(G.rec.cert) >= n*1000 + CYC_NEXT) n++;   // 輪迴 I→II→III：逃離認證 50 解鎖下一階
  if(n === 3 && certScore(G.rec.cert) >= 3*1000 + 100) n = 4;        // 無限(cycle 4)：打穿輪迴III 100 才解鎖
  return n;                                                          // 封頂 4：無限是終極模式，不再增生
}

function cd(c){ if(!G.cycData[c]) G.cycData[c] = {deep:0, cp:0}; return G.cycData[c]; }

function cycMult(c){ if(c<=0) return 1; return c<=3 ? CYC_MULT[c-1] : CYC_MULT[2]*Math.pow(2.86, c-3); } // 等比×2.86/重 (§9)

function cycK(c){ if(c<=0) return 1; return c<=3 ? CYC_K[c-1] : CYC_K[2]*Math.pow(2.3, c-3); } // 裝備樓層成長倍率：只乘樓層項（基礎值/詞綴同軸），無限段 ×2.3/重

function blessCyc(c){ if(c<=0) return 0; return c<=3 ? BLESS_CYC[c-1] : (1+BLESS_CYC[2])*Math.pow(2.3, c-3) - 1; } // 祝福縮放專用（凍結舊 cycVal 曲線）

function scaleMult(floor){
  const base = 1 + (floor-1)*0.08 + Math.max(0, floor-50)*0.04;
  return base * cycMult((R&&R.cycle)||0);
}

function realmIdx(floor){ return (Math.ceil(floor/10) - 1) % 5; }   // 每 10 層一域；過 50 層循環回域 0（1-10→0…41-50→4、51-60→0…）

