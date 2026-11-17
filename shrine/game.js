'use strict';
/* ============================================================
   珠界：聖林神廟 — 戰鬥核心（game.js，在引擎 index.html 之後載入；非 ES module）
   引擎提供的全域：C（目前地圖）、CURID、P（玩家位置／面向）、MAPS、PROGRESS、HOOKS、
   circleFree、walkAt、wetAt、moveBy、inRect、go、fade、sleep、toast、render、mapArt、artGate、
   ART／ART_SRC／needArt、drawShadow、keys、running、lock、dlgOpen、worldOpen、PLAYER_R、HERO_*。
   這個檔掛上 HOOKS，負責：玩家戰鬥、敵人、飛行物、掉落、互動物、HUD、存檔、音效、標題按鈕。
   座標單位同引擎（1 單位＝48 CSS px），時間單位秒，生命以「半顆心」為 1。

   ── 結構 ──
   數值表   PL（玩家）、ENEMY（四種敵人）、MAP_POWER／POWER_TIER（地圖強度）、ITEMS（物品）、DROP（掉落）
   狀態     ST（會存檔：生命、錢、鑰匙、背包、已開寶箱、存檔點）、PS（戰鬥暫態）、IN（按鍵）
   實體     ENEMIES（敵人）、SHOTS（飛行物：箭）、DROPS（掉落物）、FX（特效粒子／弧光）
            每種實體都是純物件陣列＋各自的 tick／draw，下一階段的迴力鏢、炸彈、首領照同樣方式加清單
   事件     EVT.on(名稱, fn)：'kill'(敵人) 'pot'(陶罐) 'chest'(寶箱, 物品) 'hurt'(傷害) 'death' 'enter'(地圖 id)
            —— 道具、機關、首領、通關在 adventure.js（之後載入），從這些事件與實體欄位接：
            敵人實體可帶 tick／draw（自帶 AI 與繪製）、immune（打不到）、onHit、boss、stun（暈眩秒數）、dieMax（倒地動畫秒數）
   ============================================================ */

const MONEY='珠幣';
const SAVE_KEY='arcade-shrine-save',STATS_KEY='arcade-shrine-stats',SAVE_V=1;

/* ================= 數值表 ================= */
// 玩家（舊原型：木劍 12、受傷無敵 1.05s、翻滾 .28s／340px/s、蓄力 .65s；1 單位＝48px 換算）
const PL={
  hearts:5,maxHearts:20,piecesPerHeart:4,startMoney:20,
  atk:12,                    // 斬擊傷害
  slashT:.24,slashHit:.13,   // 斬擊動作時間／判定時間
  slashR:1.25,slashArc:1.35, // 斬擊半徑（從腳底算）／半角（弧度）
  chargeT:.6,chargeSpd:.5,   // 按住多久蓄滿（從按下算）／蓄力中移動倍率
  spinT:.36,spinR:1.6,spinMul:1.5,
  rollT:.28,rollSpd:7.2,rollInv:.34,rollCd:.42,
  shieldSpd:.45,shieldArc:1.2,shieldMul:.5,   // 舉盾移動倍率／正面判定半角／正面近戰傷害倍率
  hurtInv:1.0,hurtKb:7,hurtKbT:.14,
  hitStop:.065,blockStop:.045,hurtStop:.05,   // 停頓感（秒）
  kbEnemy:7.5,kbEnemyT:.13,                   // 命中擊退敵人
  deathLoss:.15,                              // 倒下時失去的錢比例
  pickR:.6
};
// 敵人（舊原型：slime 26hp/atk2、archer 36hp、knight 65hp/atk3、2.4 秒一箭；goblin 為新增）
const ENEMY={
  slime:{name:'史萊姆',hp:26,atk:2,spd:1.3,r:.32,mass:1,aggro:5,lose:8,leash:7,gold:[2,6],heart:.3,touch:true,
    leapRange:2.4,windT:.45,leapT:.34,leapSpd:6.5,restT:.55,cd:1.3},
  archer:{name:'弓箭手',hp:36,atk:2,spd:1.15,r:.3,mass:1,aggro:7.5,lose:10,leash:8,gold:[4,9],heart:.3,
    near:3.2,far:6,aimT:.6,shootCd:2.2,arrowSpd:5.5,arrowLife:2.4},
  knight:{name:'盾騎士',hp:65,atk:3,spd:1.05,r:.36,mass:2.2,aggro:5.5,lose:9,leash:7,gold:[8,15],heart:.4,
    reach:1.25,windT:.5,strikeT:.18,strikeSpd:4,recT:.75,cd:1.5,turn:2.4,guardArc:1.2},
  goblin:{name:'哥布林',hp:30,atk:2,spd:2.5,r:.3,mass:.9,aggro:6,lose:9,leash:8,gold:[3,8],heart:.3,
    reach:.95,windT:.22,stabT:.12,hopT:.28,hopSpd:6.5,cd:.9}
};
// 地圖強度：越遠越強。沒列到的地圖用主題推估
const MAP_POWER={village:0,grove:0,deepgrove:1,altar_forest:1,ashroad:2,altar_fire:2,lakeshore:2,altar_water:3,templeyard:3,temple:4};
const THEME_POWER={'':0,_marsh:1,_coast:2,_ember:2,_abyss:3,_sky:3};
const POWER_TIER=[
  {hp:1,   atk:1,  spd:1,   gold:1},
  {hp:1.2, atk:1,  spd:1.05,gold:1.2},
  {hp:1.45,atk:1.5,spd:1.1, gold:1.5},
  {hp:1.7, atk:1.5,spd:1.15,gold:1.8},
  {hp:2,   atk:2,  spd:1.2, gold:2.2}
];
// 物品：maps.js 寶箱 loot 填這裡的 id（或 'coin:30' 這種「id:數量」）。裝備這階段只記在背包、不生效
const ITEMS={
  coin:  {name:MONEY,kind:'money'},
  key:   {name:'小鑰匙',kind:'key'},
  gem:   {name:'命珠碎片',kind:'piece'},     // maps.js 的 'gem'＝命珠碎片（四片＝生命上限 +1）
  piece: {name:'命珠碎片',kind:'piece'},
  potion:{name:'回復藥',kind:'potion'},      // 收進背包；生命歸零時自動喝下
  heart: {name:'心',kind:'heal'},
  // 副道具（adventure.js 的 TOOLS 是數值與行為）：拿到就放進副道具欄
  boomerang:{name:'迴力鏢',kind:'tool'},
  bomb:     {name:'炸彈袋',kind:'tool'},     // 拿到時附 10 顆炸彈
  bombs:    {name:'炸彈',kind:'ammo'},       // 掉落補充用（'bombs:3'）
  lantern:  {name:'提燈',kind:'tool'},
  hookshot: {name:'勾爪',kind:'tool'},
  // 聖物與生命上限
  relic_forest:{name:'林之聖物',kind:'relic'},
  relic_fire:  {name:'焰之聖物',kind:'relic'},
  relic_water: {name:'淵之聖物',kind:'relic'},
  heart_full:  {name:'完整的心',kind:'container'},   // 生命上限 +1 並回滿
  iron_sword: {name:'鐵劍',kind:'equip',slot:'sword',atk:18},
  flame_sword:{name:'炎刃',kind:'equip',slot:'sword',atk:26},
  iron_shield:{name:'鐵盾',kind:'equip',slot:'shield',def:2},
  scale_mail: {name:'鱗甲',kind:'equip',slot:'armor',def:2},
  wind_boots: {name:'疾風靴',kind:'equip',slot:'boots',spd:.12}
};
// 掉落：陶罐 60% 掉東西（其中 70% 錢）；錢的顏色依面額
const DROP={potChance:.6,potCoin:.7,potCoinV:[1,3],life:14,blink:3,
  bombPot:.3,bombKill:.18,bombV:3};   // 有炸彈袋且沒滿時：陶罐／敵人改掉炸彈的機率、一次幾顆
const BOMB_MAX=10;                     // 炸彈上限
const COIN_COL=v=>v>=20?['#ff8a9a','#d23a52']:v>=5?['#9fd2ff','#2f7fd6']:['#b8ffcc','#2fbf6a'];
const FACE_V={down:[0,1],up:[0,-1],left:[-1,0],right:[1,0]};

/* ===== 怪物美術 =====
   art/mon.webp：8 種 × 3 幀，5 列（0 待機 1 移動 2 攻擊 3 受傷 4 倒地），每格 64×64，腳底貼齊格底
   種類欄：0 綠史萊姆 1 水史萊姆 2 石龜 3 狼 4 毒菇 5 樹精 6 火蜥蜴 7 骷髏劍士
   art/goblin.webp、art/archer.webp：單張 128×128（弓箭手是哥布林換色，弓用程式畫）
   size＝整格畫多大（單位），cx＝身體中心在格內的 x（像素） */
const MON_CELL=64;
ART_SRC.mon='art/mon.webp';ART_SRC.goblin='art/goblin.webp';ART_SRC.archer='art/archer.webp';
const MON_DRAW=[{size:1.3,cx:27},{size:1.3,cx:27},{size:1.35,cx:28},{size:1.35,cx:35},{size:1.3,cx:35},{size:1.4,cx:30},{size:1.35,cx:33},{size:1.55,cx:32}];
const SKIN={   // 敵人種類 → 外觀（數字＝mon.webp 的種類欄；字串＝單張圖），可依主題換
  slime:{'':0,_coast:1,_abyss:1,_marsh:4,_ember:6,_sky:0},
  knight:{'':7},
  goblin:{'':'goblin'},
  archer:{'':'archer'}
};
const SOLO_DRAW={goblin:{size:1.25,cx:58,cw:128},archer:{size:1.25,cx:58,cw:128}};

/* ================= 狀態 ================= */
// tools：拿到的副道具（照取得順序）、tool：目前選的、bombs：炸彈數、relics：聖物 id、flags：機關／首領／祭壇狀態（adventure.js）、
// deaths：倒下次數、time：遊玩秒數、gotPieces：累計拿到的命珠碎片、cleared：已通關
const ST_EXTRA=()=>({tools:[],tool:'',bombs:0,relics:[],flags:{},deaths:0,time:0,gotPieces:0,cleared:false});
const ST={hp:10,hearts:5,pieces:0,money:20,keys:0,bag:{potion:0,equip:[],misc:{}},chests:{},cp:null,...ST_EXTRA()};
const PS={act:'',t:0,inv:0,blink:false,kbx:0,kby:0,kbt:0,rollCd:0,rdx:0,rdy:0,charge:0,charged:false,shield:false,hit:new Set(),stop:0,flash:0,dead:false,deadT:0};
const IN={atk:false,shd:false};
let ENEMIES=[],SHOTS=[],DROPS=[],FX=[],INTER=[],EID=0,FROZEN=false,AI_OFF=false,GT=0;
const EVT={h:{},on(n,f){(this.h[n]=this.h[n]||[]).push(f)},emit(n,...a){(this.h[n]||[]).forEach(f=>{try{f(...a)}catch(e){console.error(e)}})}};
const rand=(a,b)=>a+Math.random()*(b-a);
const maxHp=()=>ST.hearts*2;

/* ================= 音效（WebAudio 即時合成；arcade-sound='off' 時連 AudioContext 都不建） ================= */
const SFX=(()=>{
  let ac=null,nb=null;
  const on=()=>{try{return localStorage.getItem('arcade-sound')!=='off'}catch(e){return true}};
  const ctx=()=>{if(!on())return null;try{ac=ac||new (window.AudioContext||window.webkitAudioContext)();if(ac.state==='suspended')ac.resume();return ac}catch(e){return null}};
  function tone(f,o={}){const a=ctx();if(!a)return;try{const t=a.currentTime+(o.delay||0),d=o.dur||.08,osc=a.createOscillator(),g=a.createGain();osc.type=o.type||'triangle';osc.frequency.setValueAtTime(f,t);if(o.slide)osc.frequency.exponentialRampToValueAtTime(f*o.slide,t+d);g.gain.setValueAtTime(o.vol||.05,t);g.gain.exponentialRampToValueAtTime(.0001,t+d);osc.connect(g);g.connect(a.destination);osc.start(t);osc.stop(t+d+.02)}catch(e){}}
  function noise(o={}){const a=ctx();if(!a)return;try{
    if(!nb){nb=a.createBuffer(1,a.sampleRate*.5|0,a.sampleRate);const d=nb.getChannelData(0);for(let i=0;i<d.length;i++)d[i]=Math.random()*2-1}
    const t=a.currentTime+(o.delay||0),d=o.dur||.1,s=a.createBufferSource(),f=a.createBiquadFilter(),g=a.createGain();
    s.buffer=nb;f.type=o.ft||'bandpass';f.frequency.setValueAtTime(o.f||1200,t);if(o.f2)f.frequency.exponentialRampToValueAtTime(o.f2,t+d);f.Q.value=o.q||1;
    g.gain.setValueAtTime(o.vol||.08,t);g.gain.exponentialRampToValueAtTime(.0001,t+d);s.connect(f);f.connect(g);g.connect(a.destination);s.start(t);s.stop(t+d+.02)}catch(e){}}
  return {
    swing:()=>noise({f:900,f2:2600,dur:.12,vol:.07,q:.8}),
    spin:()=>{noise({f:600,f2:3000,dur:.3,vol:.08});tone(330,{dur:.25,slide:2,vol:.03,type:'sawtooth'})},
    charged:()=>{tone(880,{dur:.08,vol:.04});tone(1320,{dur:.12,vol:.04,delay:.06})},
    hit:()=>{noise({f:500,dur:.08,vol:.12,ft:'lowpass'});tone(180,{dur:.08,vol:.06,type:'square',slide:.6})},
    kill:()=>{tone(520,{dur:.08,vol:.05});tone(390,{dur:.14,vol:.05,delay:.06,slide:.5})},
    block:()=>{tone(1400,{dur:.07,vol:.05,type:'square'});noise({f:3000,dur:.06,vol:.05,q:4})},
    hurt:()=>tone(220,{dur:.18,vol:.08,type:'sawtooth',slide:.5}),
    coin:()=>{tone(1047,{dur:.06,vol:.04});tone(1568,{dur:.1,vol:.04,delay:.05})},
    heart:()=>{tone(660,{dur:.08,vol:.05});tone(880,{dur:.12,vol:.05,delay:.07})},
    drop:()=>tone(740,{dur:.06,vol:.03,slide:1.3}),
    chest:()=>[523,659,784,1047].forEach((f,i)=>tone(f,{dur:.14,vol:.05,delay:i*.09})),
    pot:()=>{noise({f:2200,dur:.14,vol:.1,q:2});noise({f:700,dur:.1,vol:.06,delay:.03})},
    roll:()=>noise({f:400,f2:200,dur:.16,vol:.06,ft:'lowpass'}),
    arrow:()=>noise({f:2000,f2:900,dur:.1,vol:.04,q:3}),
    hop:()=>tone(300,{dur:.1,vol:.03,slide:1.6}),
    rest:()=>[392,523,659].forEach((f,i)=>tone(f,{dur:.25,vol:.04,delay:i*.12})),
    death:()=>[392,330,262,196].forEach((f,i)=>tone(f,{dur:.2,vol:.06,delay:i*.14})),
    tone,noise,   // adventure.js 用來合成道具、首領的音效
    get created(){return !!ac}
  };
})();

/* ================= 存檔 ================= */
function save(){
  if(!C||PS.dead)return false;
  // 首領戰中（或被勾爪拉著飛）存檔：位置改記這張圖的入口（存檔點），讀檔時不會直接卡在戰場裡
  const pos=(typeof ADV!=='undefined'&&ADV.savePos&&ADV.savePos())||{map:CURID,x:P.x,y:P.y,face:P.face};
  try{localStorage.setItem(SAVE_KEY,JSON.stringify({v:SAVE_V,map:pos.map,x:+pos.x.toFixed(2),y:+pos.y.toFixed(2),face:pos.face,
    hp:ST.hp,hearts:ST.hearts,pieces:ST.pieces,money:ST.money,keys:ST.keys,bag:ST.bag,chests:ST.chests,cp:ST.cp,progress:PROGRESS.toJSON(),
    tools:ST.tools,tool:ST.tool,bombs:ST.bombs,relics:ST.relics,flags:ST.flags,deaths:ST.deaths,time:Math.round(ST.time),gotPieces:ST.gotPieces,cleared:ST.cleared,t:Date.now()}));return true}catch(e){return false}
}
function loadSave(){try{const o=JSON.parse(localStorage.getItem(SAVE_KEY)||'null');return o&&o.v===SAVE_V&&MAPS[o.map]?o:null}catch(e){return null}}
function bumpPlays(){
  try{const s=JSON.parse(localStorage.getItem(STATS_KEY)||'null')||{};const m=s.story=s.story||{plays:0,wins:0,best:{}};m.plays=(m.plays|0)+1;m.wins=m.wins|0;m.best=m.best||{};localStorage.setItem(STATS_KEY,JSON.stringify(s))}catch(e){}
}
function resetState(){
  Object.assign(ST,{hp:PL.hearts*2,hearts:PL.hearts,pieces:0,money:PL.startMoney,keys:0,bag:{potion:0,equip:[],misc:{}},chests:{},cp:null},ST_EXTRA());
}
function applySave(o){
  resetState();
  ST.hearts=clamp(o.hearts|0||PL.hearts,1,PL.maxHearts);ST.hp=clamp(o.hp|0||ST.hearts*2,1,ST.hearts*2);
  ST.pieces=o.pieces|0;ST.money=Math.max(0,o.money|0);ST.keys=Math.max(0,o.keys|0);
  ST.bag=Object.assign({potion:0,equip:[],misc:{}},o.bag||{});ST.chests=o.chests||{};ST.cp=o.cp&&MAPS[o.cp.map]?o.cp:null;
  ST.tools=Array.isArray(o.tools)?o.tools.filter(t=>ITEMS[t]&&ITEMS[t].kind==='tool'):[];ST.tool=ST.tools.includes(o.tool)?o.tool:(ST.tools[0]||'');
  ST.bombs=Math.max(0,o.bombs|0);ST.relics=Array.isArray(o.relics)?o.relics.filter(r=>ITEMS[r]&&ITEMS[r].kind==='relic'):[];
  ST.flags=o.flags&&typeof o.flags==='object'?o.flags:{};ST.deaths=o.deaths|0;ST.time=+o.time||0;ST.gotPieces=o.gotPieces|0;ST.cleared=!!o.cleared;
  PROGRESS.load(o.progress);
}

/* ================= 物品 ================= */
function parseLoot(l){
  if(!l)return [];
  if(Array.isArray(l))return l.flatMap(parseLoot);
  if(typeof l==='object')return [{id:l.id,n:l.n||1}];
  const m=String(l).match(/^([a-z_]+)(?:[:x](\d+))?$/i);return m?[{id:m[1],n:+(m[2]||1)}]:[];
}
function giveItem(id,n=1){   // 回傳顯示用的文字
  const it=ITEMS[id]||(id==='money'?ITEMS.coin:null);
  if(!it){ST.bag.misc[id]=(ST.bag.misc[id]||0)+n;return id+(n>1?' ×'+n:'')}
  switch(it.kind){
    case 'money':ST.money+=n;return `${n} ${MONEY}`;
    case 'key':ST.keys+=n;return it.name+(n>1?' ×'+n:'');
    case 'potion':ST.bag.potion+=n;return it.name+(n>1?' ×'+n:'');
    case 'heal':ST.hp=Math.min(maxHp(),ST.hp+2*n);return it.name;
    case 'tool':{
      const fresh=!ST.tools.includes(id);if(fresh)ST.tools.push(id);if(fresh||!ST.tool)ST.tool=id;
      if(id==='bomb')ST.bombs=Math.max(ST.bombs,BOMB_MAX);
      return it.name+(id==='bomb'?`（炸彈 ×${BOMB_MAX}）`:'')}
    case 'ammo':ST.bombs=Math.min(BOMB_MAX,ST.bombs+n);return `${it.name} ×${n}`;
    case 'relic':if(!ST.relics.includes(id))ST.relics.push(id);return it.name;
    case 'container':ST.hearts=Math.min(PL.maxHearts,ST.hearts+n);ST.hp=maxHp();return `${it.name}——生命上限 +${n}！`;
    case 'piece':{
      ST.pieces+=n;ST.gotPieces+=n;let up=0;while(ST.pieces>=PL.piecesPerHeart&&ST.hearts<PL.maxHearts){ST.pieces-=PL.piecesPerHeart;ST.hearts++;up++}
      if(up)ST.hp=maxHp();
      return up?`${it.name}——生命上限 +${up}！`:`${it.name}（${ST.pieces}/${PL.piecesPerHeart}）`}
    case 'equip':if(!ST.bag.equip.includes(id))ST.bag.equip.push(id);return it.name+'（已放進背包）';
  }
  return it.name;
}

/* ================= 特效 ================= */
function sparks(x,y,col,n=7,spd=4,z=.4){for(let i=0;i<n;i++){const a=Math.random()*Math.PI*2,s=spd*(.5+Math.random()*.7);FX.push({k:'p',x,y,z,vx:Math.cos(a)*s,vy:Math.sin(a)*s*.6,vz:rand(1,3),life:rand(.22,.4),max:.4,col,sz:rand(.05,.09)})}}
function shards(x,y){for(let i=0;i<10;i++){const a=Math.random()*Math.PI*2,s=rand(1.5,3.5);FX.push({k:'p',x,y,z:.3,vx:Math.cos(a)*s,vy:Math.sin(a)*s*.6,vz:rand(2,4),g:14,life:rand(.4,.6),max:.6,col:i%2?'#c2783e':'#7a3f22',sz:rand(.06,.1),sq:1})}}
function puff(x,y,col='#cfc8e8'){for(let i=0;i<9;i++){const a=i/9*Math.PI*2;FX.push({k:'p',x:x+Math.cos(a)*.2,y:y+Math.sin(a)*.1,z:.3,vx:Math.cos(a)*1.2,vy:Math.sin(a)*.6,vz:.8,g:0,life:.5,max:.5,col,sz:.16,soft:1})}}
function ring(x,y,r,col){FX.push({k:'ring',x,y,r,col,life:.18,max:.18})}

/* ================= 玩家 ================= */
function faceVec(){return FACE_V[P.face]||FACE_V.down}
function press(name,down){
  if(name==='atk'){
    if(!down){IN.atk=false;if(PS.charged&&!PS.dead)spinAttack();else if(PS.act==='charge')PS.act='';PS.charge=0;PS.charged=false;return}
    if(IN.atk)return;IN.atk=true;
    if(PS.dead||lock||dlgOpen||worldOpen)return;
    if(PS.act===''||PS.act==='charge'||(PS.act==='slash'&&PS.t>PL.slashT*.6))slash();
  }else if(name==='roll'){
    if(down)roll();
  }else if(name==='shd')IN.shd=!!down;
}
function slash(){PS.act='slash';PS.t=0;PS.hit.clear();PS.charge=0;PS.charged=false;PS.shield=false;SFX.swing();
  const [fx,fy]=faceVec();FX.push({k:'arc',a:Math.atan2(fy,fx),half:PL.slashArc,r:PL.slashR,life:PL.slashT*.9,max:PL.slashT*.9})}
function spinAttack(){PS.act='spin';PS.t=0;PS.hit.clear();PS.charge=0;PS.charged=false;SFX.spin();FX.push({k:'spin',r:PL.spinR,life:PL.spinT+.08,max:PL.spinT+.08})}
function roll(){
  if(PS.dead||lock||dlgOpen||worldOpen||PS.rollCd>0||PS.kbt>0||!(PS.act===''||PS.act==='charge'))return;
  let ix=(keys.ArrowRight||keys.d?1:0)-(keys.ArrowLeft||keys.a?1:0)+joy.x,iy=(keys.ArrowDown||keys.s?1:0)-(keys.ArrowUp||keys.w?1:0)+joy.y;
  let l=Math.hypot(ix,iy);if(l<.15){[ix,iy]=faceVec();l=1}
  PS.rdx=ix/l;PS.rdy=iy/l;PS.act='roll';PS.t=PL.rollT;PS.inv=Math.max(PS.inv,PL.rollInv);PS.blink=false;PS.charge=0;PS.charged=false;IN.atk=false;
  if(Math.abs(PS.rdx)>Math.abs(PS.rdy))P.face=PS.rdx<0?'left':'right';else P.face=PS.rdy<0?'up':'down';
  SFX.roll();
}
// 每幀（引擎移動前）呼叫：回傳輸入移動的速度倍率（0＝這幀不准用輸入移動）
function playerTick(dt){
  GT+=dt;
  if(PS.dead)return 0;
  PS.shield=IN.shd&&PS.act==='';   // 停頓、擊退中也維持舉盾
  if(PS.stop>0){PS.stop-=dt;FROZEN=true;return 0}
  FROZEN=false;
  if(PS.inv>0)PS.inv-=dt;if(PS.rollCd>0)PS.rollCd-=dt;if(PS.flash>0)PS.flash-=dt;
  if(IN.atk&&(PS.act==='slash'||PS.act==='charge')){PS.charge+=dt;if(!PS.charged&&PS.charge>=PL.chargeT){PS.charged=true;SFX.charged();sparks(P.x+faceVec()[0]*.5,P.y+.05,'#fff6c8',5,2,.7)}}
  if(PS.kbt>0){PS.kbt-=dt;moveBy(PS.kbx*dt,PS.kby*dt);return 0}
  switch(PS.act){
    case 'roll':
      PS.t-=dt;moveBy(PS.rdx*PL.rollSpd*dt,PS.rdy*PL.rollSpd*dt);P.anim+=dt*2;
      if(PS.t<=0){PS.act='';PS.rollCd=PL.rollCd}
      return 0;
    case 'slash':
      PS.t+=dt;if(PS.t<=PL.slashHit)swingHits(false);
      if(PS.t>=PL.slashT)PS.act=IN.atk?'charge':'';
      return .15;
    case 'spin':
      PS.t+=dt;swingHits(true);if(PS.t>=PL.spinT)PS.act='';
      return .3;
    case 'charge':return PL.chargeSpd;
  }
  return PS.shield?PL.shieldSpd:1;
}
function faceLocked(){return PS.shield||PS.act==='charge'||PS.act==='slash'||PS.act==='spin'||PS.act==='roll'}
// 斬擊／旋轉斬判定：敵人與陶罐
function swingHits(spin){
  const [fx,fy]=faceVec(),R=spin?PL.spinR:PL.slashR,cosA=Math.cos(PL.slashArc),dmg=Math.round(PL.atk*(spin?PL.spinMul:1));
  const inArc=(x,y,r)=>{const dx=x-P.x,dy=y-P.y,d=Math.hypot(dx,dy);if(d-r>R)return false;if(spin||d<.4)return true;return (dx*fx+dy*fy)/d>=cosA};
  for(const e of ENEMIES){
    if(e.dead||PS.hit.has(e))continue;
    if(!inArc(e.x,e.y,e.r))continue;
    PS.hit.add(e);
    if(e.k==='knight'&&!spin&&knightGuards(e)){   // 盾騎士正面：無效
      PS.stop=Math.max(PS.stop,PL.blockStop);SFX.block();const mx=(e.x+P.x)/2,my=(e.y+P.y)/2;sparks(mx,my,'#dfe8ff',8,4,.6);ring(mx,my-.5,.35,'#dfe8ff');
      const dx=P.x-e.x,dy=P.y-e.y,l=Math.hypot(dx,dy)||1;PS.kbx=dx/l*4;PS.kby=dy/l*4;PS.kbt=.08;e.blockT=.25;
      continue;
    }
    damageEnemy(e,dmg,P.x,P.y);
  }
  for(const p of INTER){
    if(p.k!=='pot'||p.gone)continue;
    if(inArc(p.x,p.y-.15,.25))breakPot(p);
  }
}
function knightGuards(e){const dx=P.x-e.x,dy=P.y-e.y,l=Math.hypot(dx,dy)||1;return (dx*e.fx+dy*e.fy)/l>Math.cos(ENEMY.knight.guardArc)}
function hurtPlayer(dmg,sx,sy,o={}){
  if(PS.dead||PS.inv>0||ST.hp<=0)return false;
  let kb=PL.hurtKb*(o.kb!=null?o.kb:1);
  if(PS.shield&&!o.unblock){   // unblock：地面爆炸、地刺等擋不住的傷害
    const [fx,fy]=faceVec(),dx=sx-P.x,dy=sy-P.y,l=Math.hypot(dx,dy)||1;
    if((dx*fx+dy*fy)/l>Math.cos(PL.shieldArc)){
      SFX.block();sparks(P.x+fx*.35,P.y+fy*.35,'#fff1c0',7,3,.5);PS.stop=Math.max(PS.stop,PL.blockStop);
      if(o.arrow){EVT.emit('block',o);return 'block'}
      dmg=Math.max(1,Math.round(dmg*PL.shieldMul));kb*=.5;
    }
  }
  ST.hp=Math.max(0,ST.hp-dmg);PS.inv=PL.hurtInv;PS.blink=true;PS.flash=.28;PS.stop=Math.max(PS.stop,PL.hurtStop);
  const dx=P.x-sx,dy=P.y-sy,l=Math.hypot(dx,dy)||1;PS.kbx=dx/l*kb;PS.kby=dy/l*kb;PS.kbt=PL.hurtKbT;
  if(PS.act==='slash'||PS.act==='charge'){PS.act='';PS.charge=0;PS.charged=false}
  SFX.hurt();EVT.emit('hurt',dmg);
  if(ST.hp<=0){
    if(ST.bag.potion>0){ST.bag.potion--;ST.hp=maxHp();SFX.heart();toast('回復藥發揮效果，生命全滿！');sparks(P.x,P.y,'#ff8aa8',12,3,.8)}
    else die();
  }
  return true;
}
async function die(){
  if(PS.dead)return;
  PS.dead=true;PS.deadT=0;PS.act='';IN.atk=IN.shd=false;lock=true;ST.deaths++;SFX.death();EVT.emit('death');
  await sleep(900);await fade(true);
  const loss=Math.floor(ST.money*PL.deathLoss);ST.money-=loss;ST.hp=maxHp();
  const cp=ST.cp&&MAPS[ST.cp.map]?ST.cp:{map:'village',x:MAPS.village.spawn[0],y:MAPS.village.spawn[1],face:'down'};
  PS.dead=false;PS.kbt=0;PS.stop=0;
  go(cp.map,cp.x,cp.y,cp.face);
  await artGate(mapArt(cp.map),4000);render(performance.now());await sleep(60);
  PS.inv=1.2;PS.blink=true;hud(true);
  await fade(false);lock=false;
  toast(loss?`你倒下了……失去 ${loss} ${MONEY}`:'你倒下了……');
  save();
}

/* ================= 敵人 ================= */
function tierOf(id){const M=MAPS[id];return POWER_TIER[clamp(MAP_POWER[id]!=null?MAP_POWER[id]:THEME_POWER[(M&&M.theme)||'']||0,0,POWER_TIER.length-1)]}
function eFree(x,y,r){
  if(x<r||y<r||x>C.w-r||y>C.h-r)return false;
  for(const ex of C.exits)if(x>ex.x-r&&x<ex.x+ex.w+r&&y>ex.y-r&&y<ex.y+ex.h+r)return false;   // 不走出出口
  return circleFree(x,y,r);
}
function makeEnemy(k,x,y){
  const D=ENEMY[k];if(!D)return null;const T=tierOf(CURID),sk=SKIN[k],skin=sk[C.theme]!=null?sk[C.theme]:sk[''];
  const e={id:++EID,k,D,x,y,hx:x,hy:y,r:D.r,hp:Math.round(D.hp*T.hp),atk:Math.max(1,Math.round(D.atk*T.atk)),spd:D.spd*T.spd,gold:T.gold,skin,
    fa:Math.PI/2,fx:0,fy:1,mode:'idle',st:'move',t:0,cd:rand(.3,1.2),anim:Math.random()*3,flash:0,blockT:0,kbx:0,kby:0,kbt:0,z:0,
    side:Math.random()<.5?1:-1,wt:rand(.5,2),walking:false,wx:x,wy:y,dead:false,dieT:0,moving:false,aim:0,did:false};
  e.max=e.hp;
  if(!eFree(e.x,e.y,e.r)){   // 出生點被擋住：往外找最近的空位
    outer:for(let rr=.2;rr<3;rr+=.2)for(let a=0;a<16;a++){const nx=x+Math.cos(a/16*Math.PI*2)*rr,ny=y+Math.sin(a/16*Math.PI*2)*rr;if(eFree(nx,ny,e.r)){e.x=e.hx=nx;e.y=e.hy=ny;break outer}}
  }
  return e;
}
function spawnAll(){ENEMIES=[];(C.M.spawns||[]).forEach(s=>{const e=makeEnemy(s.k,s.x,s.y);if(e)ENEMIES.push(e)})}
// 沿遮罩與碰撞體移動：細分步長、被擋就只走單軸（沿牆滑）
function moveE(e,dx,dy){
  const L=Math.hypot(dx,dy);if(L<1e-6)return true;
  const n=Math.ceil(L/.06),sx=dx/n,sy=dy/n;let ok=true;
  for(let i=0;i<n;i++){
    if(eFree(e.x+sx,e.y+sy,e.r)){e.x+=sx;e.y+=sy}
    else if(sx&&eFree(e.x+sx,e.y,e.r)){e.x+=sx;ok=false}
    else if(sy&&eFree(e.x,e.y+sy,e.r)){e.y+=sy;ok=false}
    else return false;
  }
  return ok;
}
// 朝 (ux,uy) 走；前方被擋就依序試左右偏轉的方向（記住偏哪邊，避免左右抖）
const STEER_TRY=[0,.45,-.45,.9,-.9,1.35,-1.35,1.9,-1.9,2.5];
function steer(e,ux,uy,spd,dt){
  const step=spd*dt,a=Math.atan2(uy,ux),look=e.r+.3;
  for(const k of STEER_TRY){
    const b=a+k*e.side,cx=Math.cos(b),cy=Math.sin(b);
    if(!eFree(e.x+cx*look,e.y+cy*look,e.r*.9))continue;
    if(moveE(e,cx*step,cy*step)||k===0){e.moving=true;if(e.k!=='knight')setFace(e,cx,cy);return true}
  }
  e.side=-e.side;e.moving=false;return false;
}
function setFace(e,x,y){const l=Math.hypot(x,y);if(l<1e-6)return;e.fx=x/l;e.fy=y/l;e.fa=Math.atan2(e.fy,e.fx)}
function turnToward(e,x,y,rate,dt){let d=Math.atan2(y,x)-e.fa;while(d>Math.PI)d-=Math.PI*2;while(d<-Math.PI)d+=Math.PI*2;e.fa+=clamp(d,-rate*dt,rate*dt);e.fx=Math.cos(e.fa);e.fy=Math.sin(e.fa)}
function inCone(e,R,cosA){const dx=P.x-e.x,dy=P.y-e.y,d=Math.hypot(dx,dy);return d<R+PLAYER_R&&(d<.3||(dx*e.fx+dy*e.fy)/d>cosA)}
function damageEnemy(e,dmg,sx,sy){
  if(e.dead||e.immune)return;   // immune：首領潛入、瞬移中等
  if(e.onHit&&e.onHit(dmg,sx,sy)===false)return;
  e.hp-=dmg;e.flash=.13;
  const dx=e.x-sx,dy=e.y-sy,l=Math.hypot(dx,dy)||1,kb=PL.kbEnemy/(e.D.mass||1);
  e.kbx=dx/l*kb;e.kby=dy/l*kb;e.kbt=PL.kbEnemyT;e.mode='chase';
  PS.stop=Math.max(PS.stop,PL.hitStop);SFX.hit();sparks(e.x,e.y,'#fff6b0',8,4.5,.45);ring(e.x,e.y-.4,.4,'#ffffff');
  if(e.hp<=0){killEnemy(e);return}
  // 被打斷
  if(e.k==='slime'&&e.st!=='move'){e.st='rest';e.t=e.D.restT;e.z=0}
  else if(e.k==='goblin'){e.st='hop';e.t=e.D.hopT;setFace(e,-dx,-dy)}
  else if(e.k==='archer'&&e.st==='aim'){e.st='move';e.cd=.8}
}
function killEnemy(e){
  e.dead=true;e.dieT=e.dieMax||.45;e.hp=0;e.z=0;e.stun=0;SFX.kill();
  const D=e.D,v=Math.max(1,Math.round(rand(D.gold[0],D.gold[1]+.99)*e.gold|0));
  spawnDrop('coin',v,e.x,e.y);
  if(Math.random()<D.heart)spawnDrop('heart',1,e.x,e.y);
  else if(wantBombs()&&Math.random()<DROP.bombKill)spawnDrop('bomb',DROP.bombV,e.x,e.y);
  EVT.emit('kill',e);
}
function enemyTick(e,dt){
  if(e.dead){e.dieT-=dt;if(e.dieT<=0&&!e.puffed){e.puffed=1;puff(e.x,e.y)}return}
  if(e.tick){e.tick(e,dt);return}   // 首領等自帶 AI 的實體
  const D=e.D;e.anim+=dt;if(e.flash>0)e.flash-=dt;if(e.blockT>0)e.blockT-=dt;if(e.cd>0)e.cd-=dt;e.moving=false;
  if(e.kbt>0){e.kbt-=dt;moveE(e,e.kbx*dt,e.kby*dt);return}
  if(e.stun>0){e.stun-=dt;e.z=0;e.st='move';e.aim=0;return}   // 被迴力鏢／勾爪打暈
  const dx=P.x-e.x,dy=P.y-e.y,d=Math.hypot(dx,dy),hd=Math.hypot(e.x-e.hx,e.y-e.hy),ux=dx/(d||1),uy=dy/(d||1);
  const busy=e.st!=='move';
  if(e.mode!=='return'&&!busy&&(hd>D.leash||PS.dead||(e.mode==='chase'&&d>D.lose))){e.mode='return';e.st='move';e.z=0}
  if(e.mode==='return'){
    const l=hd||1;steer(e,(e.hx-e.x)/l,(e.hy-e.y)/l,e.spd*1.1,dt);
    if(hd<.4){e.mode='idle';e.hp=Math.min(e.max,e.hp+Math.ceil(e.max*.5))}
    return;
  }
  if(e.mode==='idle'){
    if(d<D.aggro&&!PS.dead){e.mode='chase';e.cd=Math.max(e.cd,.4)}
    else{wander(e,dt);return}
  }
  AI[e.k](e,dt,ux,uy,d);
  // 碰撞傷害（史萊姆）
  if(D.touch&&d<e.r+PLAYER_R+.04&&e.st!=='rest')hurtPlayer(e.atk,e.x,e.y);
}
function wander(e,dt){
  e.wt-=dt;
  if(e.wt<=0){if(e.walking){e.walking=false;e.wt=rand(1,2.5)}else{const a=Math.random()*Math.PI*2,r=rand(.4,1.6);e.wx=e.hx+Math.cos(a)*r;e.wy=e.hy+Math.sin(a)*r;e.walking=true;e.wt=2.5}}
  if(e.walking){const dx=e.wx-e.x,dy=e.wy-e.y,l=Math.hypot(dx,dy);if(l<.15)e.walking=false;else if(!steer(e,dx/l,dy/l,e.spd*.4,dt))e.walking=false}
}
const AI={
  slime(e,dt,ux,uy,d){const D=e.D;
    switch(e.st){
      case 'move':steer(e,ux,uy,e.spd,dt);if(d<D.leapRange&&e.cd<=0){e.st='wind';e.t=D.windT}break;
      case 'wind':e.t-=dt;setFace(e,ux,uy);if(e.t<=0){e.st='leap';e.t=D.leapT;e.lx=ux;e.ly=uy;SFX.hop()}break;
      case 'leap':e.t-=dt;moveE(e,e.lx*D.leapSpd*dt,e.ly*D.leapSpd*dt);e.z=Math.sin(clamp(1-e.t/D.leapT,0,1)*Math.PI)*.45;if(e.t<=0){e.st='rest';e.t=D.restT;e.cd=D.cd;e.z=0}break;
      case 'rest':e.t-=dt;if(e.t<=0)e.st='move';break;
    }
  },
  archer(e,dt,ux,uy,d){const D=e.D;
    setFace(e,ux,uy);
    switch(e.st){
      case 'move':
        if(d<D.near)steer(e,-ux,-uy,e.spd,dt);
        else if(d>D.far)steer(e,ux,uy,e.spd,dt);
        else{if(!steer(e,-uy*e.side,ux*e.side,e.spd*.45,dt))e.side=-e.side;setFace(e,ux,uy)}
        if(e.cd<=0&&d<D.far+1.5){e.st='aim';e.t=D.aimT}
        break;
      case 'aim':e.t-=dt;e.aim=1-e.t/D.aimT;if(e.t<=0){fireArrow(e,ux,uy);e.st='move';e.cd=D.shootCd;e.aim=0;e.rel=.18}break;
    }
    if(e.rel>0)e.rel-=dt;
  },
  knight(e,dt,ux,uy,d){const D=e.D;
    switch(e.st){
      case 'move':turnToward(e,ux,uy,D.turn,dt);if(d>D.reach*.85)steer(e,ux,uy,e.spd,dt);if(d<D.reach&&e.cd<=0){e.st='wind';e.t=D.windT}break;
      case 'wind':turnToward(e,ux,uy,D.turn*.7,dt);e.t-=dt;if(e.t<=0){e.st='strike';e.t=D.strikeT;e.did=false}break;
      case 'strike':e.t-=dt;moveE(e,e.fx*D.strikeSpd*dt,e.fy*D.strikeSpd*dt);
        if(!e.did&&inCone(e,D.reach+.15,Math.cos(1.1))){e.did=true;hurtPlayer(e.atk,e.x,e.y)}
        if(e.t<=0){e.st='rec';e.t=D.recT;e.cd=D.cd}break;
      case 'rec':e.t-=dt;if(e.t<=0)e.st='move';break;
    }
  },
  goblin(e,dt,ux,uy,d){const D=e.D;
    switch(e.st){
      case 'move':{const w=Math.sin(e.anim*5+e.id)*.55;steer(e,ux-uy*w,uy+ux*w,e.spd,dt);if(d<D.reach+.3&&e.cd<=0){e.st='wind';e.t=D.windT;setFace(e,ux,uy)}break}
      case 'wind':e.t-=dt;if(e.t<=0){e.st='stab';e.t=D.stabT;e.did=false;setFace(e,ux,uy)}break;
      case 'stab':e.t-=dt;moveE(e,e.fx*3*dt,e.fy*3*dt);if(!e.did&&inCone(e,D.reach+.2,Math.cos(.9))){e.did=true;hurtPlayer(e.atk,e.x,e.y)}
        if(e.t<=0){e.st='hop';e.t=D.hopT;SFX.hop()}break;
      case 'hop':e.t-=dt;moveE(e,-ux*D.hopSpd*dt,-uy*D.hopSpd*dt);e.z=Math.sin(clamp(1-e.t/D.hopT,0,1)*Math.PI)*.4;e.hops=(e.hops|0)+(e.t<=0?1:0);
        if(e.t<=0){e.st='pause';e.t=.35;e.z=0}break;
      case 'pause':e.t-=dt;setFace(e,ux,uy);if(e.t<=0){e.st='move';e.cd=D.cd}break;
    }
  }
};
function separate(){   // 敵人互相推開、不跟玩家重疊（只推敵人）
  for(let i=0;i<ENEMIES.length;i++){const a=ENEMIES[i];if(a.dead||a.boss)continue;   // 首領自己處理推擠（推玩家，不被推）
    const dx=a.x-P.x,dy=a.y-P.y,d=Math.hypot(dx,dy),m=a.r+PLAYER_R;
    if(d<m&&d>1e-4&&!PS.dead)moveE(a,dx/d*(m-d)*.6,dy/d*(m-d)*.6);
    for(let j=i+1;j<ENEMIES.length;j++){const b=ENEMIES[j];if(b.dead||b.boss)continue;const ex=b.x-a.x,ey=b.y-a.y,dd=Math.hypot(ex,ey),mm=a.r+b.r;
      if(dd<mm&&dd>1e-4){const p=(mm-dd)*.5;moveE(a,-ex/dd*p,-ey/dd*p);moveE(b,ex/dd*p,ey/dd*p)}}
  }
}

/* ================= 飛行物（箭）：遇到林地／岩壁或碰撞體就停，可越過水面 ================= */
function fireArrow(e,ux,uy){const D=e.D;SHOTS.push({k:'arrow',x:e.x+ux*.35,y:e.y+uy*.35,vx:ux*D.arrowSpd,vy:uy*D.arrowSpd,life:D.arrowLife,dmg:e.atk,dead:0});SFX.arrow()}
function shotTick(s,dt){
  if(s.dead){s.dead-=dt;s.x+=s.vx*dt;s.y+=s.vy*dt;s.vx*=.9;s.vy*=.9;s.z=(s.z||0)+s.vz*dt;s.vz-=10*dt;return s.dead>0}
  const n=Math.max(1,Math.ceil(Math.hypot(s.vx,s.vy)*dt/.1));
  for(let i=0;i<n;i++){
    s.x+=s.vx*dt/n;s.y+=s.vy*dt/n;
    if((!walkAt(C,s.x,s.y)&&!wetAt(C,s.x,s.y))||colsNear(s.x,s.y).some(c=>colHit(c,s.x,s.y,.03))){s.stuck=.6;return false}
    if(Math.hypot(s.x-P.x,s.y-P.y)<PLAYER_R+.15){
      const r=hurtPlayer(s.dmg,s.x-s.vx*.2,s.y-s.vy*.2,{arrow:true});
      if(r==='block'){s.vx=-s.vx*.35+rand(-1,1);s.vy=-s.vy*.35+rand(-1,1);s.dead=.45;s.vz=2.5;s.z=0;s.blocked=1;return true}
      if(r)return false;
    }
  }
  s.life-=dt;return s.life>0;
}

/* ================= 掉落物 ================= */
const wantBombs=()=>ST.tools.includes('bomb')&&ST.bombs<BOMB_MAX;
function spawnDrop(k,v,x,y){
  const a=Math.random()*Math.PI*2,s=rand(.6,1.4);
  DROPS.push({k,v,x,y,z:.2,vz:rand(3,4.2),vx:Math.cos(a)*s,vy:Math.sin(a)*s*.7,t:0});
}
function dropTick(o,dt){
  o.t+=dt;
  if(o.vz||o.z>0){o.z+=o.vz*dt;o.vz-=14*dt;if(o.z<=0){o.z=0;o.vz=Math.abs(o.vz)>1.2?-o.vz*.35:0;if(!o.vz)SFX.drop()}
    const nx=o.x+o.vx*dt,ny=o.y+o.vy*dt;if(walkAt(C,nx,ny)){o.x=nx;o.y=ny}else{o.vx=o.vy=0}o.vx*=.94;o.vy*=.94}
  if(o.t>.25&&o.z<.25&&!PS.dead&&Math.hypot(o.x-P.x,o.y-P.y)<PL.pickR){
    if(o.k==='coin'){ST.money+=o.v;SFX.coin()}else if(o.k==='bomb'){ST.bombs=Math.min(BOMB_MAX,ST.bombs+o.v);SFX.drop()}else{ST.hp=Math.min(maxHp(),ST.hp+2);SFX.heart()}
    sparks(o.x,o.y,o.k==='coin'?COIN_COL(o.v)[0]:o.k==='bomb'?'#ffd28a':'#ff8aa8',5,2,.3);return false;
  }
  return o.t<DROP.life;
}

/* ================= 互動物：陶罐、寶箱、營火 ================= */
function breakPot(p){
  p.gone=true;if(p.col)p.col.off=true;SFX.pot();shards(p.x,p.y);EVT.emit('pot',p);
  if(wantBombs()&&Math.random()<DROP.bombPot)spawnDrop('bomb',DROP.bombV,p.x,p.y-.1);
  else if(Math.random()<DROP.potChance){if(Math.random()<DROP.potCoin)spawnDrop('coin',Math.round(rand(DROP.potCoinV[0],DROP.potCoinV[1])),p.x,p.y-.1);else spawnDrop('heart',1,p.x,p.y-.1)}
}
function openChest(p){
  if(p.open)return;
  p.open=true;ST.chests[p.id]=1;SFX.chest();sparks(p.x,p.y-.5,'#ffe9a0',12,2.5,.6);
  const got=parseLoot(p.loot).map(({id,n})=>giveItem(id,n));
  toast('打開寶箱：獲得 '+(got.join('、')||'……空的'));
  EVT.emit('chest',p,p.loot);save();hud(true);
}
function restAt(p){
  ST.hp=maxHp();SFX.rest();sparks(p.x,p.y-.4,'#ffcf80',10,2,.6);
  // 存檔點設在營火旁的空地
  let sx=P.x,sy=P.y;for(let rr=.9;rr<2.5;rr+=.2){let ok=false;for(let a=0;a<12;a++){const ang=Math.PI/2+a/12*Math.PI*2,x=p.x+Math.cos(ang)*rr,y=p.y-.2+Math.sin(ang)*rr;if(circleFree(x,y,PLAYER_R)){sx=x;sy=y;ok=true;break}}if(ok)break}
  ST.cp={map:CURID,x:+sx.toFixed(2),y:+sy.toFixed(2),face:'up'};
  save();hud(true);toast('在營火旁休息。生命全滿，進度已存檔。');
}
function nearInteract(best){
  let hit=null;
  for(const p of INTER){
    if(p.k==='pot')continue;
    if(p.k==='chest'&&p.open)continue;
    const d=Math.hypot(p.x-P.x,p.y-.25-P.y);if(d<best){best=d;hit=p}
  }
  return hit;
}
function setupInteract(){
  INTER=C.props.filter(p=>p.k==='chest'||p.k==='pot'||p.k==='campfire');
  for(const p of INTER){
    if(p.k==='pot'){p.gone=false;if(p.col)p.col.off=false}
    else if(p.k==='chest'){p.open=!!ST.chests[p.id];p.label='開啟';p.act=()=>openChest(p)}
    else if(p.k==='campfire'){p.label='休息';p.act=()=>restAt(p)}
  }
}

/* ================= HOOKS：接上引擎 ================= */
HOOKS.player=(dt)=>playerTick(dt);
HOOKS.faceLock=faceLocked;
HOOKS.near=nearInteract;
HOOKS.art=()=>['mon','goblin','archer'];
HOOKS.enter=id=>{
  ENEMIES=[];SHOTS=[];DROPS=[];FX=[];
  Object.assign(PS,{act:'',kbt:0,stop:0,charge:0,charged:false,shield:false});
  setupInteract();spawnAll();
  ST.cp={map:id,x:+P.x.toFixed(2),y:+P.y.toFixed(2),face:P.face};
  EVT.emit('enter',id);save();hud(true);
};
HOOKS.update=dt=>{
  if(FROZEN)return;
  if(!AI_OFF){for(const e of ENEMIES)enemyTick(e,dt);separate()}
  ENEMIES=ENEMIES.filter(e=>!e.dead||e.dieT>-.05);
  SHOTS=SHOTS.filter(s=>{if(s.stuck){s.stuck-=dt;return s.stuck>0}return shotTick(s,dt)});
  DROPS=DROPS.filter(o=>dropTick(o,dt));
  for(const f of FX){f.life-=dt;if(f.k==='p'){f.x+=f.vx*dt;f.y+=f.vy*dt;f.z=Math.max(0,f.z+f.vz*dt);f.vz-=(f.g!=null?f.g:8)*dt}}
  FX=FX.filter(f=>f.life>0);
  hud();
};
HOOKS.begin=mode=>{
  const o=mode==='continue'?loadSave():null;
  if(o){applySave(o);return {map:o.map,x:o.x,y:o.y,face:o.face}}
  resetState();PROGRESS.load(null);try{localStorage.removeItem(SAVE_KEY)}catch(e){}bumpPlays();
  return {map:'village'};
};

/* ================= 繪製 ================= */
const WHITE={};
function whiteOf(k){   // 閃白用的白色剪影（Safari 不支援 ctx.filter）
  if(WHITE[k])return WHITE[k];const im=ART[k];if(!im)return null;
  const c=mk(im.width,im.height),g=c.getContext('2d');g.drawImage(im,0,0);g.globalCompositeOperation='source-in';g.fillStyle='#fff';g.fillRect(0,0,c.width,c.height);return WHITE[k]=c;
}
HOOKS.actors=(list,c,now)=>{
  for(const o of DROPS)list.push({sy:o.y,draw:()=>drawDrop(c,o,now)});
  for(const e of ENEMIES)list.push({sy:e.y,draw:()=>drawEnemy(c,e,now)});
  for(const s of SHOTS)list.push({sy:s.y+.3,draw:()=>drawShot(c,s)});
};
function drawDrop(c,o,now){
  if(o.t>DROP.life-DROP.blink&&Math.floor(now/90)%2)return;
  const y=o.y-o.z-.18-Math.sin(now/260+o.x)*.03*(o.z?0:1);
  drawShadow(c,o.x,o.y,.32,.12);
  if(o.k==='coin'){const [a,b]=COIN_COL(o.v),s=o.v>=5?.17:.13;   // 珠幣：發亮的小圓珠
    const g=c.createRadialGradient(o.x-s*.3,y-s*.3,0,o.x,y,s);g.addColorStop(0,'#fff');g.addColorStop(.35,a);g.addColorStop(1,b);c.fillStyle=g;c.beginPath();c.arc(o.x,y,s,0,7);c.fill();
    c.strokeStyle='rgba(0,0,0,.35)';c.lineWidth=.025;c.stroke()}
  else if(o.k==='bomb'){c.fillStyle='#2a2d3a';c.beginPath();c.arc(o.x,y-.02,.15,0,7);c.fill();c.fillStyle='rgba(255,255,255,.35)';c.beginPath();c.arc(o.x-.05,y-.07,.04,0,7);c.fill();
    c.strokeStyle='#c9a35a';c.lineWidth=.03;c.beginPath();c.moveTo(o.x+.08,y-.13);c.quadraticCurveTo(o.x+.16,y-.26,o.x+.2,y-.22);c.stroke();c.fillStyle='#fff';c.font='bold .16px sans-serif';c.textAlign='center';c.fillText('×'+o.v,o.x,y+.26)}
  else{c.fillStyle='#ff4a6a';heartPath(c,o.x,y-.16,.32);c.fill();c.strokeStyle='#7a1028';c.lineWidth=.03;c.stroke()}
}
function drawShot(c,s){
  const a=Math.atan2(s.vy,s.vx),z=.45+(s.z||0),al=s.stuck?Math.min(1,s.stuck/.3):s.dead?Math.min(1,s.dead/.3):1;
  if(!s.dead&&!s.stuck)drawShadow(c,s.x,s.y,.3,.08);
  c.save();c.globalAlpha=al;c.translate(s.x,s.y-z);c.rotate(s.dead?a+GT*20:a);
  c.strokeStyle='#6b4423';c.lineWidth=.05;c.beginPath();c.moveTo(-.32,0);c.lineTo(.22,0);c.stroke();
  c.fillStyle='#d8d8e0';c.beginPath();c.moveTo(.32,0);c.lineTo(.18,-.06);c.lineTo(.18,.06);c.closePath();c.fill();
  c.fillStyle='#e8e0c8';c.beginPath();c.moveTo(-.32,0);c.lineTo(-.4,-.07);c.lineTo(-.24,0);c.lineTo(-.4,.07);c.closePath();c.fill();
  c.restore();
}
function enemyRow(e){if(e.dead)return 4;if(e.flash>0||e.kbt>0)return 3;if(e.st==='wind'||e.st==='leap'||e.st==='strike'||e.st==='stab'||e.st==='aim')return 2;return e.moving?1:0}
function drawEnemy(c,e,now){
  if(e.draw){e.draw(c,e,now);return}   // 首領等自帶繪製
  const D=e.D,al=e.dead?clamp(e.dieT/.45,0,1):1;if(al<=0)return;
  if(e.stun>0&&!e.dead){const sy=e.y-1.15;for(let k=0;k<3;k++){const a=GT*5+k*2.1;c.fillStyle='#ffe66a';c.beginPath();c.arc(e.x+Math.cos(a)*.3,sy+Math.sin(a)*.08,.06,0,7);c.fill()}}
  c.save();c.globalAlpha=al;
  drawShadow(c,e.x,e.y+.02,e.r*2.3*(1-e.z*.5),e.r*.8*(1-e.z*.5));
  // 盾騎士：地上淡淡標出正面（盾擋得住的方向）
  if(e.k==='knight'&&!e.dead){c.fillStyle=e.blockT>0?'rgba(220,235,255,.35)':'rgba(190,210,255,.13)';c.beginPath();c.moveTo(e.x,e.y);c.arc(e.x,e.y,.85,e.fa-D.guardArc,e.fa+D.guardArc);c.closePath();c.fill()}
  let sx=1,sy=1;
  if(e.k==='slime'&&e.st==='wind'){const p=1-e.t/D.windT;sx=1+.18*p;sy=1-.2*p}
  if(e.st==='wind'&&e.k!=='slime'){c.translate(Math.sin(now/22)*.03,0)}
  const y=e.y-e.z,flip=e.fx>.15;
  const sk=e.skin,isMon=typeof sk==='number',key=isMon?'mon':sk,im=ART[key];
  if(!im&&!artFail[key])needArt(key);
  if(im){
    let cw,size,cx,sxp,syp;
    if(isMon){const md=MON_DRAW[sk];cw=MON_CELL;size=md.size;cx=md.cx;sxp=(sk*3+Math.floor(e.anim*(e.moving?8:4))%3)*cw;syp=enemyRow(e)*cw}
    else{const sd=SOLO_DRAW[sk];cw=sd.cw;size=sd.size;cx=sd.cx;sxp=0;syp=0}
    const w=size*sx,h=size*sy,ox=(cx/cw)*w;
    c.save();c.translate(e.x,y);if(flip)c.scale(-1,1);
    if(!isMon&&e.moving)c.rotate(Math.sin(e.anim*14)*.06);
    c.drawImage(im,sxp,syp,cw,cw,-ox,-h,w,h);
    if(e.flash>0){const wi=whiteOf(key);if(wi){c.globalAlpha=al*Math.min(1,e.flash/.08)*.85;c.drawImage(wi,sxp,syp,cw,cw,-ox,-h,w,h)}}
    c.restore();
  }else drawEnemyFallback(c,e,y,sx,sy);
  if(e.k==='archer'&&!e.dead)drawBow(c,e,y);
  if(e.hp<e.max&&!e.dead){const bw=.7,by=y-(e.k==='knight'?1.35:e.k==='slime'?.95:1.25);c.fillStyle='#17221d';c.fillRect(e.x-bw/2,by,bw,.08);c.fillStyle='#e05a4a';c.fillRect(e.x-bw/2,by,bw*e.hp/e.max,.08)}
  c.restore();
}
function drawBow(c,e,y){
  const ax=Math.atan2(e.fy,e.fx),pull=e.st==='aim'?e.aim:0;
  c.save();c.translate(e.x+e.fx*.18,y-.5);c.rotate(ax);
  c.strokeStyle='#704321';c.lineWidth=.06;c.lineCap='round';c.beginPath();c.moveTo(.05,-.32);c.quadraticCurveTo(.32,0,.05,.32);c.stroke();
  c.strokeStyle='#e8d7b0';c.lineWidth=.02;c.beginPath();c.moveTo(.05,-.32);c.lineTo(.05-pull*.18,0);c.lineTo(.05,.32);c.stroke();
  if(pull>0){c.strokeStyle='#f0dfb6';c.lineWidth=.035;c.beginPath();c.moveTo(.05-pull*.18,0);c.lineTo(.42,0);c.stroke()}
  if(e.rel>0){c.globalAlpha=e.rel/.18;c.strokeStyle='#fff3c8';c.lineWidth=.03;c.beginPath();c.moveTo(.1,0);c.lineTo(.6,0);c.stroke()}
  c.restore();
}
function drawEnemyFallback(c,e,y,sx,sy){   // 沒圖：程式畫
  const x=e.x,f=e.flash>0;
  if(e.k==='slime'){c.fillStyle=f?'#fff':'#6fcf4a';c.beginPath();c.ellipse(x,y-.25*sy,.34*sx,.27*sy,0,0,7);c.fill();c.fillStyle='#1a2a12';c.fillRect(x-.12,y-.32*sy,.05,.08);c.fillRect(x+.07,y-.32*sy,.05,.08)}
  else if(e.k==='knight'){c.fillStyle=f?'#fff':'#8a92a8';c.fillRect(x-.25,y-1.0,.5,.9);c.fillStyle='#d8dce8';c.beginPath();c.arc(x,y-1.1,.2,0,7);c.fill();c.fillStyle='#6a4a2a';c.beginPath();c.arc(x+e.fx*.3,y-.6+e.fy*.1,.22,0,7);c.fill()}
  else{c.fillStyle=f?'#fff':e.k==='archer'?'#3b5a8a':'#8a3b2a';c.beginPath();c.moveTo(x,y-1.1);c.lineTo(x+.3,y-.1);c.lineTo(x-.3,y-.1);c.closePath();c.fill();c.fillStyle='#7cbf4a';c.beginPath();c.arc(x,y-.75,.17,0,7);c.fill()}
}
const HERO_ROW={down:0,left:1,right:2,up:3},SPIN_ROWS=[0,2,3,1];
HOOKS.drawHero=c=>{
  const im=ART.hero,fx=P.x,fy=P.y+.12,h=HERO_H*HERO_CH/HERO_BODY,w=h*HERO_CW/HERO_CH;
  if(PS.dead){   // 倒下：轉成橫躺、淡出
    PS.deadT+=1/60;const t=Math.min(1,PS.deadT*2.5);drawShadow(c,fx,fy-.02,.66,.24);
    c.save();c.globalAlpha=1-Math.max(0,PS.deadT-.6)*1.2;c.translate(fx,fy-.25);c.rotate(t*Math.PI/2);
    if(im)c.drawImage(im,0,0,HERO_CW,HERO_CH,-w/2,-h+.25,w,h);c.restore();return;
  }
  drawShadow(c,fx,fy-.02,.66,.24);
  let fr=P.moving?1+(Math.floor(P.anim*8)%2):0,row=HERO_ROW[P.face]||0,sxk=1,syk=1;
  if(PS.act==='slash'||PS.act==='charge')fr=PS.act==='slash'?3:0;
  if(PS.act==='spin'){fr=3;row=SPIN_ROWS[Math.floor(PS.t/PL.spinT*8)%4]}
  if(PS.act==='roll'){fr=1+(Math.floor(GT*16)%2);sxk=1.1;syk=.82}
  const blink=PS.inv>0&&PS.blink&&Math.floor(GT*15)%2;
  c.save();if(blink)c.globalAlpha=.35;
  if(PS.shield&&P.face==='up')drawShield(c,fx,fy);
  if(PS.act==='roll'){c.globalAlpha*=.25;const bx=fx-PS.rdx*.35,by=fy-PS.rdy*.35;if(im)c.drawImage(im,fr*HERO_CW,row*HERO_CH,HERO_CW,HERO_CH,bx-w*sxk/2,by-h*syk,w*sxk,h*syk);c.globalAlpha/=.25}
  if(im)c.drawImage(im,fr*HERO_CW,row*HERO_CH,HERO_CW,HERO_CH,fx-w*sxk/2,fy-h*syk,w*sxk,h*syk);
  else{c.fillStyle='#2f7a3a';c.beginPath();c.arc(fx,fy-.45,.3,0,7);c.fill();c.fillStyle='#f0c9a0';c.beginPath();c.arc(fx,fy-.95,.22,0,7);c.fill()}
  if(PS.shield&&P.face!=='up')drawShield(c,fx,fy);
  c.restore();
  // 蓄力：腳下的進度圈，蓄滿後劍尖閃光
  if(PS.act==='charge'||(PS.act==='slash'&&IN.atk&&PS.charge>.12)){
    const p=Math.min(1,PS.charge/PL.chargeT);c.save();c.strokeStyle=PS.charged?'#fff6c8':'rgba(255,240,180,.7)';c.lineWidth=.05;
    c.beginPath();c.ellipse(fx,fy,.48,.2,0,-Math.PI/2,-Math.PI/2+p*Math.PI*2);c.stroke();
    if(PS.charged){const [vx,vy]=faceVec(),gx=fx+vx*.55,gy=fy-.5+vy*.35,s=.12+.06*Math.sin(GT*30);c.fillStyle='#fffbe6';c.beginPath();c.moveTo(gx,gy-s*2);c.lineTo(gx+s*.4,gy);c.lineTo(gx,gy+s*2);c.lineTo(gx-s*.4,gy);c.closePath();c.fill();c.beginPath();c.moveTo(gx-s*2,gy);c.lineTo(gx,gy+s*.4);c.lineTo(gx+s*2,gy);c.lineTo(gx,gy-s*.4);c.closePath();c.fill()}
    c.restore();
  }
};
function drawShield(c,fx,fy){
  const o={down:[.14,-.42,.95],left:[-.3,-.55,.55],right:[.3,-.55,.55],up:[-.12,-.62,.9]}[P.face],x=fx+o[0],y=fy+o[1];
  c.save();c.translate(x,y);c.scale(o[2],1);
  c.fillStyle='#8d5a2b';c.beginPath();c.arc(0,0,.25,0,7);c.fill();c.strokeStyle='#e6c27a';c.lineWidth=.05;c.stroke();
  c.fillStyle='#c9a35a';c.beginPath();c.arc(0,0,.07,0,7);c.fill();c.restore();
}
HOOKS.fx=(c,S,now)=>{
  const bx=P.x,by=P.y-.4;
  for(const f of FX){
    const a=clamp(f.life/f.max,0,1);
    if(f.k==='p'){c.globalAlpha=a;c.fillStyle=f.col;if(f.soft){c.beginPath();c.arc(f.x,f.y-f.z,f.sz*(1.6-a*.6),0,7);c.fill()}else c.fillRect(f.x-f.sz/2,f.y-f.z-f.sz/2,f.sz,f.sz)}
    else if(f.k==='ring'){c.globalAlpha=a;c.strokeStyle=f.col;c.lineWidth=.06*a;c.beginPath();c.arc(f.x,f.y,f.r*(1.6-a*.6),0,7);c.stroke()}
    else if(f.k==='arc'){   // 斬擊弧光：從一側掃到另一側的新月形
      const p=1-a,e=1-Math.pow(1-Math.min(1,p*1.8),3),a0=f.a-f.half,a1=a0+f.half*2*e,tail=Math.max(a0,a1-f.half*1.3);
      c.globalAlpha=Math.min(1,a*1.6);
      const g=c.createRadialGradient(bx,by,f.r*.35,bx,by,f.r);g.addColorStop(0,'rgba(255,255,255,0)');g.addColorStop(.7,'rgba(255,248,215,.55)');g.addColorStop(1,'rgba(255,255,255,.95)');
      c.fillStyle=g;c.beginPath();c.arc(bx,by,f.r,tail,a1);c.arc(bx,by,f.r*.45,a1,tail,true);c.closePath();c.fill();
      c.strokeStyle='rgba(255,255,255,.95)';c.lineWidth=.05;c.beginPath();c.arc(bx,by,f.r*.98,Math.max(tail,a1-.5),a1);c.stroke();
    }else if(f.k==='spin'){   // 旋轉斬：一整圈的光環
      const p=1-a,a1=-Math.PI/2+p*Math.PI*2.6;c.globalAlpha=Math.min(1,a*2);
      c.strokeStyle='rgba(255,250,220,.9)';c.lineWidth=.16*a+.04;c.beginPath();c.arc(bx,by+.2,f.r*.92,a1-Math.PI*1.2,a1);c.stroke();
      c.strokeStyle='rgba(255,255,255,.6)';c.lineWidth=.05;c.beginPath();c.arc(bx,by+.2,f.r*.6,a1-Math.PI,a1);c.stroke();
    }
  }
  c.globalAlpha=1;
  if(PS.flash>0){c.setTransform(1,0,0,1,0,0);const W=c.canvas.width,H=c.canvas.height,g=c.createRadialGradient(W/2,H/2,Math.min(W,H)*.3,W/2,H/2,Math.max(W,H)*.7);
    g.addColorStop(0,'rgba(255,0,0,0)');g.addColorStop(1,`rgba(220,20,40,${(PS.flash/.28*.45).toFixed(3)})`);c.fillStyle=g;c.fillRect(0,0,W,H)}
};

/* ================= HUD ================= */
let hudKey='';
function heartPath(g,x,y,s){g.beginPath();g.moveTo(x,y+s*.3);g.bezierCurveTo(x,y,x-s*.5,y,x-s*.5,y+s*.3);g.bezierCurveTo(x-s*.5,y+s*.6,x,y+s*.75,x,y+s*.95);g.bezierCurveTo(x,y+s*.75,x+s*.5,y+s*.6,x+s*.5,y+s*.3);g.bezierCurveTo(x+s*.5,y,x,y,x,y+s*.3)}
function hud(force){
  const k=ST.hp+'|'+ST.hearts+'|'+ST.pieces+'|'+ST.money+'|'+ST.keys+'|'+ST.bag.potion;
  if(k===hudKey&&!force)return;hudKey=k;
  const cv=document.getElementById('hpCv');if(cv){
    const n=ST.hearts,per=10,cols=Math.min(n,per),rows=Math.ceil(n/per),S=20,d=Math.min(2,devicePixelRatio||1);
    cv.width=Math.round(cols*S*d);cv.height=Math.round(rows*S*d);cv.style.width=cols*S+'px';cv.style.height=rows*S+'px';
    const g=cv.getContext('2d');g.setTransform(d,0,0,d,0,0);g.clearRect(0,0,cols*S,rows*S);
    for(let i=0;i<n;i++){const x=(i%per)*S+S/2,y=Math.floor(i/per)*S+2,v=clamp(ST.hp-i*2,0,2);
      g.fillStyle='#2a1018';heartPath(g,x,y,S*.86);g.fill();
      if(v>0){g.save();if(v===1){g.beginPath();g.rect(x-S,y-2,S,S+4);g.clip()}g.fillStyle='#ff4a6a';heartPath(g,x,y,S*.86);g.fill();g.fillStyle='rgba(255,255,255,.45)';g.beginPath();g.ellipse(x-S*.2,y+S*.25,S*.09,S*.06,-.6,0,7);g.fill();g.restore()}
      g.strokeStyle='#14060a';g.lineWidth=1.4;heartPath(g,x,y,S*.86);g.stroke()}
  }
  const set=(id,v)=>{const el=document.getElementById(id);if(el&&el.textContent!==String(v))el.textContent=v};
  set('hudMoney',ST.money);set('hudKeys',ST.keys);
  const pc=document.getElementById('hudPiece');if(pc){pc.style.display=ST.pieces?'':'none';pc.textContent=`命珠碎片 ${ST.pieces}/${PL.piecesPerHeart}`}
  const kw=document.getElementById('hudKeyWrap');if(kw)kw.style.display=ST.keys?'':'none';
}

/* ================= 輸入 ================= */
const KEY_ACT={j:'atk',z:'atk',k:'roll',x:'roll',l:'shd',c:'shd'};
addEventListener('keydown',e=>{
  if(!running||e.repeat||e.ctrlKey||e.metaKey)return;
  const a=KEY_ACT[e.key.length===1?e.key.toLowerCase():''];if(!a)return;
  if(dlgOpen||worldOpen||lock)return;
  e.preventDefault();press(a,true);
});
addEventListener('keyup',e=>{const a=KEY_ACT[e.key.length===1?e.key.toLowerCase():''];if(a&&a!=='roll')press(a,false)});
addEventListener('blur',()=>{IN.atk=false;IN.shd=false;PS.charge=0;PS.charged=false});
function holdBtn(id,name){
  const el=document.getElementById(id);if(!el)return;let pid=null;
  el.addEventListener('pointerdown',e=>{e.preventDefault();pid=e.pointerId;try{el.setPointerCapture(pid)}catch(_){}el.classList.add('down');press(name,true)});
  const up=e=>{if(e.pointerId!==pid)return;pid=null;el.classList.remove('down');if(name!=='roll')press(name,false)};
  el.addEventListener('pointerup',up);el.addEventListener('pointercancel',up);
  el.addEventListener('contextmenu',e=>e.preventDefault());
}
holdBtn('atkBtn','atk');holdBtn('rollBtn','roll');holdBtn('shdBtn','shd');

/* ================= 標題畫面：繼續／重新開始（重新開始要再按一次確認） ================= */
(function(){
  const bc=document.getElementById('btnCont'),bs=document.getElementById('btnStart');if(!bs)return;
  let confirmT=null;
  const refresh=()=>{const has=!!loadSave();if(bc)bc.style.display=has?'':'none';bs.textContent=has?'重新開始':'開始';bs.classList.toggle('pri',!has)};
  refresh();
  if(bc)bc.addEventListener('click',()=>start('continue'));
  bs.addEventListener('click',()=>{
    if(loadSave()&&!confirmT){bs.textContent='再按一次確認（進度會清除）';confirmT=setTimeout(()=>{confirmT=null;refresh()},3000);return}
    clearTimeout(confirmT);confirmT=null;start('new');
  });
})();

/* ================= 測試掛鉤（?debug=1） ================= */
if(window.__shrine)Object.defineProperties(window.__shrine,Object.getOwnPropertyDescriptors({   // 保留 getter（Object.assign 會把 getter 變成當下的值）
  hurt:(n=2,sx,sy)=>hurtPlayer(n,sx!=null?sx:P.x+FACE_V[P.face][0],sy!=null?sy:P.y+FACE_V[P.face][1]),
  spawn:(k,x,y)=>{const e=makeEnemy(k,x!=null?x:P.x+2,y!=null?y:P.y);if(!e)return null;ENEMIES.push(e);return e.id},
  give:(id,n=1)=>{const r=giveItem(id,n);hud(true);return r},
  killAll:(boss)=>{let n=0;for(const e of ENEMIES)if(!e.dead&&(!e.boss||boss)){killEnemy(e);n++}return n},   // 首領要傳 true 才一起殺
  act:(name,down=true)=>press(name,down),
  aiOff:on=>{AI_OFF=!!on},
  get combat(){return {hp:ST.hp,maxHp:maxHp(),hearts:ST.hearts,pieces:ST.pieces,money:ST.money,keys:ST.keys,bag:JSON.parse(JSON.stringify(ST.bag)),
    chests:Object.keys(ST.chests),cp:ST.cp,act:PS.act,inv:+PS.inv.toFixed(3),shield:PS.shield,dead:PS.dead,charge:+PS.charge.toFixed(3),charged:PS.charged,
    enemies:ENEMIES.map(e=>({id:e.id,k:e.k,x:+e.x.toFixed(3),y:+e.y.toFixed(3),hp:e.hp,max:e.max,atk:e.atk,st:e.st,mode:e.mode,dead:e.dead,fx:+e.fx.toFixed(3),fy:+e.fy.toFixed(3),hops:e.hops|0})),
    shots:SHOTS.map(s=>({x:+s.x.toFixed(2),y:+s.y.toFixed(2),blocked:!!s.blocked,stuck:!!s.stuck})),drops:DROPS.map(o=>({k:o.k,v:o.v,x:+o.x.toFixed(2),y:+o.y.toFixed(2)})),
    pots:INTER.filter(p=>p.k==='pot').map(p=>({x:p.x,y:p.y,gone:!!p.gone})),chestsHere:INTER.filter(p=>p.k==='chest').map(p=>({id:p.id,x:p.x,y:p.y,open:!!p.open,loot:p.loot})),
    audio:SFX.created,frozen:FROZEN}},
  G:{ST,PS,IN,PL,ENEMY,ITEMS,MAP_POWER,POWER_TIER,EVT,save,loadSave,hurtPlayer,damageEnemy,openChest,breakPot,restAt,eFree,get ENEMIES(){return ENEMIES},get SHOTS(){return SHOTS},get DROPS(){return DROPS}}
}));
window.SHRINE_GAME={EVT,ST,ITEMS,giveItem,save};   // 下一階段（道具、首領、商店）掛事件用
