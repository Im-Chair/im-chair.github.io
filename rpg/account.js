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
    const dp = Math.min(c.rec.deep||0, 50);
    c.orig = {deep:dp, cp:Math.min(41, dp), done:false};
    c.cycData = {};
    const map = {boss0:'bb0', boss1:'bb2', boss2:'mb2'};
    for(const [ok,nk] of Object.entries(map)){ if(c.codex[ok]){ c.codex[nk] = (c.codex[nk]||0) + c.codex[ok]; delete c.codex[ok]; } }
    c.run = null;
  }
  if(!c.cycData) c.cycData = {};
  if(!c.bounties) c.bounties = [];
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

function charLabel(c){ return (c && c.cls) ? `${CLASSES[c.cls].icon} ${CLASSES[c.cls].name}` : '（未創建）'; }

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
