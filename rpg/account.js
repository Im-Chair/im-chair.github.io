'use strict';
// ============ account.js — 帳號層：多角色槽、共用倉庫、角色選擇/新建/切換 ============
const ACC_KEY = 'abyss-acc-v1';
const MAX_CHARS = 4;
let ACC = null;
let pendingCreate = false;

function accSave(){ if(!ACC) return; ACC.uid = uid; localStorage.setItem(ACC_KEY, JSON.stringify(ACC)); }

function migrateChar(c){
  if(!c) return;
  if(!c.v3) c.v3 = 1;
  if(!c.rec) c.rec = {deep:0,cert:null,runs:0,boss:0};
  if(!c.mats) c.mats = {iron:0, steel:0};
  if(!c.codex) c.codex = {};
  if(!c.cyc) c.cyc = {unlocked: c.rec.clear? 1:0};
  if(!c.orig){
    const dp = Math.min(c.rec.deep||0, ORIG_DEPTH);
    c.orig = {deep:dp, cp:Math.min(TP.origCap, dp), done:false};
    c.cycData = {};
    const map = {boss0:'bb0', boss1:'bb2', boss2:'mb2'};
    for(const [ok,nk] of Object.entries(map)){ if(c.codex[ok]){ c.codex[nk] = (c.codex[nk]||0) + c.codex[ok]; delete c.codex[ok]; } }
    c.run = null;
  }
  if(!c.cycData) c.cycData = {};
  if(!c.bounties) c.bounties = [];
  if(!c.runes) c.runes = newRuneSlots();
  if(!c.runeBag) c.runeBag = [];
  if(c.gems===undefined) c.gems = 0;

  /* v424：四個新系統（素質提升／魔符／成就／離線化）的欄位一次補完。
     與 core.js 的 newSave() 必須一模一樣，只改一邊會讓新舊角色分岔。 */
  if(!c.statBuy) c.statBuy = {str:0,int:0,spi:0,vit:0,agi:0};
  else for(const k of ['str','int','spi','vit','agi']) if(c.statBuy[k]===undefined) c.statBuy[k] = 0;
  if(!c.achv) c.achv = {};
  if(!c.sigils) c.sigils = {equipped:[], owned:[], slots:0};
  if(!c.sigils.equipped) c.sigils.equipped = [];
  if(!c.sigils.owned) c.sigils.owned = [];
  if(typeof c.sigils.slots !== 'number') c.sigils.slots = 0;   // v424 建欄位時還沒有格數，舊存檔補 0
  if(c.killBest===undefined) c.killBest = 0;

  /* runeSeen 的補登：舊存檔沒有這個欄位，老角色手上的符文若不補進去，
     集齊成就會從零開始算，等於白玩。只能補到「現在還持有的」——賣掉或換掉的追不回來。 */
  if(!c.runeSeen){
    c.runeSeen = {};
    for(const rn of (c.runes||[])) seenRune(rn, c);
    for(const rn of (c.runeBag||[])) seenRune(rn, c);
  }
}

function accLoad(){
  try{
    const a = localStorage.getItem(ACC_KEY);
    if(a){ ACC = JSON.parse(a); }
    else {
      const old = localStorage.getItem(SAVE_KEY);           // 舊單角色存檔自動遷移
      if(old){ const oc = JSON.parse(old); ACC = {v:1, chars:[oc], active:0, sharedStash:[], uid: oc.uid||1}; }
      else { ACC = {v:1, chars:[], active:0, sharedStash:[], uid:1}; }
    }
  }catch(e){ ACC = {v:1, chars:[], active:0, sharedStash:[], uid:1}; }
  if(!Array.isArray(ACC.chars)) ACC.chars = [];
  if(!Array.isArray(ACC.sharedStash)) ACC.sharedStash = [];
  ACC.chars.forEach(migrateChar);
  if(typeof ACC.active !== 'number' || ACC.active < 0 || ACC.active >= ACC.chars.length) ACC.active = 0;
  uid = ACC.uid || 1;
  G = ACC.chars.length ? ACC.chars[ACC.active] : null;
}

function charLabel(c){ return (c && c.cls) ? classLabel(c.cls) : '（未創建）'; }   // 圖示統一走 classIcon（battle.js）

function openRoster(){
  let html = '<h3>角色</h3><p class="base">每個角色的職業、裝備、碎銀、認證、輪迴進度、個人倉庫都獨立；共用倉庫全帳號共享。</p><div class="item-list" style="margin-top:8px">';
  ACC.chars.forEach((c,i)=>{
    const info = c.cls ? certText(c.rec.cert) : '未創建';
    const cur = i===ACC.active ? '　<span style="color:var(--gold)">目前</span>' : '';
    html += `<div class="item-row" onclick="selectCharUI(${i})"><span class="in">${charLabel(c)}${cur}</span><span class="is">${info}　<span style="color:var(--red);cursor:pointer" onclick="event.stopPropagation();deleteChar(${i})">刪除</span></span></div>`;
  });
  html += '</div>';
  if(ACC.chars.length < MAX_CHARS) html += `<button class="btn primary" style="margin-top:10px" onclick="newChar()">＋ 新建角色（${ACC.chars.length}/${MAX_CHARS}）</button>`;
  html += '<button class="btn" style="margin-top:8px" onclick="closeSheet()">關閉</button>';
  openSheet(html);
}
function selectCharUI(i){ closeSheet(); selectChar(i); }
function selectChar(i){
  if(i<0 || i>=ACC.chars.length) return;
  if(G) G.run = R;
  ACC.active = i; G = ACC.chars[i]; migrateChar(G);
  R = G.run || null; B = null;
  if(R && Array.isArray(R.potions)){ R.pots = {}; for(const k of R.potions) R.pots[k] = Math.min(3,(R.pots[k]||0)+1); delete R.potions; }
  if(R && !R.pots) R.pots = {};
  save();
  if(!G.cls){ pendingCreate=false; pendingClass=null; renderClassSelect(); showScreen('s-class'); return; }
  if(R && R.phase==='battle'){ R.phase='doors'; R.doors=null; R.forceDoor = R.lastDoor || 'fight'; }
  renderCamp();
  if(R){ resumeRun(); } else { showScreen('s-camp'); }
}
function newChar(){
  if(ACC.chars.length >= MAX_CHARS){ toast(`最多 ${MAX_CHARS} 個角色`); return; }
  pendingCreate = true; pendingClass = null; closeSheet();
  renderClassSelect(); showScreen('s-class');
}
function deleteChar(i){
  openSheet(`<h3>刪除角色？</h3><p class="base">${charLabel(ACC.chars[i])} 的職業、裝備、認證、個人倉庫全部消失（共用倉庫不受影響）。無法復原。</p><div class="row" style="margin-top:14px"><button class="btn danger" onclick="doDeleteChar(${i})">刪除</button><button class="btn" onclick="openRoster()">算了</button></div>`);
}
function doDeleteChar(i){
  ACC.chars.splice(i,1);
  if(ACC.active >= ACC.chars.length) ACC.active = Math.max(0, ACC.chars.length-1);
  G = ACC.chars.length ? ACC.chars[ACC.active] : null; R = (G && G.run) || null;
  accSave(); closeSheet();
  if(ACC.chars.length) openRoster(); else titleStart();
}
