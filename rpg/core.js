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
  if(R.pots[k]){ if(R.pots[k] >= 3) return false; R.pots[k]++; return true; }
  if(Object.keys(R.pots).length >= 4) return false;
  R.pots[k] = 1; return true;
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
  orig:{deep:0,cp:0,done:false}, cycData:{}, run:null, uid:1}; }

function certScore(cert){ // 認證難度分數：輪迴階級碾壓層數（輪迴I-1 > 本源-50）
  if(!cert) return -1;
  return cert.cycle * 1000 + cert.floor;
}
function recordCert(cycle, floor){ // 只保留最難的認證成就
  const cand = {cycle, floor};
  if(certScore(cand) > certScore(G.rec.cert)) G.rec.cert = cand;
}
function certText(cert){ // 認證成就顯示文字
  if(!cert) return '—';
  if(cert.cycle === 0) return '本源 '+cert.floor+(cert.floor>=50?'✓':'');
  const roman = 'I'.repeat(Math.min(cert.cycle,3)) + (cert.cycle>3?'+'+(cert.cycle-3):'');
  return '輪迴'+roman+' '+cert.floor;
}
function realmFor(floor){ return REALMS.find(z=>floor>=z.from && floor<=z.to); }

function healMult(){ const z = R? realmFor(R.floor):null; return (z && z.rule==='heal75')? 0.75 : 1; }

function save(){ G.run = R; G.uid = uid; localStorage.setItem(SAVE_KEY, JSON.stringify(G));
  const cg = document.getElementById('camp-gold'); if(cg) cg.textContent = G.gold;
  const sc = document.getElementById('stash-count'); if(sc) sc.textContent = `倉庫 ${G.stash.length} 件`;
  const gg = document.getElementById('gear-gold'); if(gg) gg.textContent = '🪙 ' + G.gold;
}

function load(){ try{ const d = localStorage.getItem(SAVE_KEY); if(d){ G = JSON.parse(d);
  if(!G.v3){ G = newSave(); localStorage.removeItem(SAVE_KEY); return false; } // v3 結構重製，舊檔重開（已拍板）
  uid = G.uid||1; R = G.run||null;
  if(!G.mats) G.mats = {iron:0, steel:0};
  if(!G.codex) G.codex = {};
  if(!G.cyc) G.cyc = {unlocked: G.rec.clear? 1:0};
  if(!G.orig){
    const dp = Math.min(G.rec.deep||0, 50);
    G.orig = {deep:dp, cp:Math.min(45, Math.max(0, Math.floor((dp-1)/5)*5)), done:false};
    G.cycData = {};
    const map = {boss0:'bb0', boss1:'bb2', boss2:'mb2'};
    for(const [ok,nk] of Object.entries(map)){
      if(G.codex[ok]){ G.codex[nk] = (G.codex[nk]||0) + G.codex[ok]; delete G.codex[ok]; }
    }
    R = null; G.run = null; // v2 結構變動過大，舊探索不續
  }
  if(!G.cycData) G.cycData = {};
  if(R && Array.isArray(R.potions)){ R.pots = {}; for(const k of R.potions) R.pots[k] = Math.min(3,(R.pots[k]||0)+1); delete R.potions; }
  if(R && !R.pots) R.pots = {};
  return true; } }catch(e){} G = newSave(); return false; }

function showScreen(id){
  document.querySelectorAll('.screen').forEach(s=>s.classList.remove('show'));
  $(id).classList.add('show');
  $(id).scrollTop = 0;
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
  if(R && R.bless) for(const b of R.bless) if(b.k===key) v += b.v;
  if(R && R.quench && R.quench.battles>0 && R.quench.k===key) v += R.quench.v;
  return v;
}

function statTotal(key){ // 五素質彙總（出廠 baseStats ＋ 裝備詞綴）
  const base = (G.cls && CLASSES[G.cls].baseStats) ? (CLASSES[G.cls].baseStats[key]||0) : 0;
  return base + sumAffix(key);
}
function rateFromStat(v){ // 素質→率 分段換算：前100÷8、100-200÷16、200+÷32
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
function playerDef(){ // 防禦力（點數）：全職通用底＋護甲面板
  const a = G.equip.a;
  return BASE_DEF + (a ? a.base + a.up : 0);
}
function playerMaxHp(){
  let hp = BASE_HP + statTotal('vit')*2 + sumAffix('hp');
  if(sumAffix('fury')) hp = Math.round(hp*0.7);
  if(R && R.hpCut) hp = Math.round(hp * (1 - R.hpCut)); // 殘卷血契 (§10)
  return Math.max(1, hp);
}
function playerMaxMana(){
  if(CLASSES[G.cls].mainStat !== 'int') return sumAffix('mp'); // 物攻職業無基礎法力（除非裝備給）
  return Math.round(BASE_MANA + statTotal('spi')*1.5 + sumAffix('mp'));
}
function manaRegenPct(){ return Math.min(MREGEN_CAP, 15 + sumAffix('mregen')); }
function weaponType(){ const w = G.equip.w; return WEAPON_TYPES[(w && w.wtype) || 'sword']; }
function mainStat(){ return statTotal(CLASSES[G.cls].mainStat); }
function playerAtk(){ // 顯示用：武器攻擊＋主素質
  const w = G.equip.w;
  return (w ? w.base + w.up : 0) + mainStat();
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
  while(certScore(G.rec.cert) >= (n)*1000 + CYC_NEXT) n++;  // 認證已達輪迴n且深度≥門檻 → 解鎖 n+1
  return n;
}

function cd(c){ if(!G.cycData[c]) G.cycData[c] = {deep:0, cp:0}; return G.cycData[c]; }

function cycMult(c){ if(c<=0) return 1; return c<=3 ? CYC_MULT[c-1] : CYC_MULT[2]*Math.pow(2.86, c-3); } // 等比×2.86/重 (§9)

function cycVal(c){ if(c<=0) return 0; return c<=3 ? CYC_VAL[c-1] : (1+CYC_VAL[2])*Math.pow(1.7, c-3) - 1; } // 裝備價值×1.7/重

function scaleMult(floor){
  const base = 1 + (floor-1)*0.08 + Math.max(0, floor-50)*0.04;
  return base * cycMult((R&&R.cycle)||0);
}

function realmIdx(floor){ return Math.min(4, Math.floor((Math.min(floor,50)-1)/10)); }

