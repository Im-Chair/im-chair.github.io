// 貪婪深淵 — 流程冒煙測試（無瀏覽器）。重點：模擬瀏覽器對未綁定 requestIdleCallback 丟 Illegal invocation。
const fs=require('fs'), vm=require('vm'), path=require('path').dirname(require('fs').realpathSync(__filename))+'/';
function el(id){ const e={id,_t:'',_h:'',style:{},classList:{add(){},remove(){},toggle(){},contains:()=>false},dataset:{},children:[],
  appendChild(c){this.children.push(c)}, insertAdjacentHTML(){}, remove(){},
  querySelectorAll:()=>[], querySelector:()=>el('stub'),
  addEventListener(){}, select(){}, setSelectionRange(){}, focus(){}, scrollTop:0, clientWidth:390, clientHeight:700};
  Object.defineProperty(e,'textContent',{get(){return e._t},set(v){e._t=String(v)}});
  Object.defineProperty(e,'innerHTML',{get(){return e._h},set(v){e._h=String(v)}});
  return e; }
const store={}, els={}, screens=[];
const doc={ getElementById:id=>els[id]||(els[id]=el(id)),
  createElement:t=>el('<'+t+'>'), querySelectorAll:()=>[], querySelector:()=>el('stub'),
  addEventListener(){} };
// 真瀏覽器的行為：requestIdleCallback 脫離 window 呼叫會丟 TypeError
const win={ RPG_VER:'389', addEventListener(){},
  requestIdleCallback(cb){ if(this!==win) throw new TypeError('Illegal invocation'); setTimeout(cb,0); } };
const ctx={ console, window:win, document:doc, navigator:{}, location:{href:''},
  localStorage:{getItem:k=>store[k]||null, setItem:(k,v)=>store[k]=String(v), removeItem:k=>delete store[k]},
  setTimeout:(f)=>{ try{f()}catch(e){ throw e } }, clearTimeout(){}, requestAnimationFrame:f=>f(),
  Image:function(){ this.src=''; }, btoa:s=>Buffer.from(s,'binary').toString('base64'),
  atob:s=>Buffer.from(s,'base64').toString('binary'), escape:global.escape, unescape:global.unescape };
ctx.window.document=doc; vm.createContext(ctx);
for(const f of ['data.js','core.js','account.js','items.js','battle.js','run.js','ui.js'])
  vm.runInContext(fs.readFileSync(path+f,'utf8'), ctx, {filename:f});
// 攔截 showScreen 記錄畫面切換
vm.runInContext(`const _ss=showScreen; showScreen=function(id){ __screens.push(id); return _ss(id); };`,
  Object.assign(ctx,{__screens:screens}));
function step(name, code){
  try{ vm.runInContext(code, ctx); console.log('  ✅ '+name); return true; }
  catch(e){ console.log('  ❌ '+name+' → '+e.constructor.name+': '+e.message); return false; }
}
console.log('=== 新玩家:創角 → 選職業 → 進營地 ===');
let ok = step('init（讀檔/建帳號）', 'load(); if(!ACC) throw new Error("ACC 沒建立");');
ok = step('titleStart → newChar', 'titleStart();') && ok;
ok = step('renderClassSelect', 'renderClassSelect();') && ok;
ok = step('選劍士 → confirmClass', 'pendingClass="sword"; confirmClass();') && ok;
const last = screens[screens.length-1];
console.log('  畫面軌跡: '+screens.join(' → '));
if(last==='s-camp') console.log('  ✅ 停在營地');
else { console.log('  ❌ 卡在 '+last+'（應為 s-camp）'); ok=false; }
console.log('\n=== 切換角色 ===');
ok = step('openRoster（角色清單）','openRoster();') && ok;
ok = step('selectChar(0)','selectChar(0);') && ok;
console.log('  畫面軌跡: '+screens.slice(-2).join(' → '));
console.log('\n=== 下潛流程 ===');
ok = step('openDivePicker','openDivePicker();') && ok;
ok = step('startRun(0,1) → 門','R=null; startRun(0,1);') && ok;
ok = step('showDoors','showDoors();') && ok;
ok = step('進戰鬥門','enterDoor({t:"fight"});') && ok;
ok = step('renderBattle','renderBattle();') && ok;
console.log('\n'+(ok?'✅ 全部通過':'❌ 有失敗'));
process.exit(ok?0:1);
