'use strict';
/* ============================================================
   珠界：聖林神廟 — 村莊系統（village.js，在 adventure.js 之後載入；非 ES module）
   負責：背包／裝備畫面、旅商（買賣）、鐵匠（打造／升級）、賞金板、營火（休息＋日夜）、劍術教官（教學＋木樁挑戰）、
         村裡 NPC 的對話分支與村長的主線提示。台詞全部在 adventure.js 的 TEXT（npc／chief／shop／smith／bounty／camp／trainer）。
   用到的全域：ST、PS、EQUIP、EQUIP_SLOTS、SLOT_NAME、MATS、ITEMS、DAY、dayNow、eqStat、equip、giveItem、save、hud、advHud、
               ask、say、toast、openPanel、closePanel、EVT、ENEMIES、SHOTS、HOOKS、C、CURID、P、PL…

   ── 結構 ──
   數值表   SHOP（旅商商品、價格、上架條件、每次補貨的庫存）、SELL（材料收購價）、FORGE（鐵匠配方）、BOUNTY（賞金委託）、
            STAKE（木樁挑戰）、TRAIN_NEED（教學每課要做幾次）
   存檔     ST.vil：stock 商店剩餘庫存（以 SHOP 的 key 為鍵）｜up 擴充等級 {bomb:0～2,belt:0～1}｜info 已買藏寶情報｜seen 已看過的上架品項（新貨提示用）｜bq 進行中的委託 {id,n}｜bdone 已領賞的委託 id｜tr 教學進度（0～4，4＝結業）｜
                    best 木樁最佳｜crest 已領木樁獎勵｜trPaid 已領結業獎勵
   ============================================================ */

/* ================= 數值表 ================= */
// 旅商：key＝庫存鍵（存檔用，別改）｜give＝ITEMS 的 id（giveItem 給）｜tonic＝藥劑 id（game.js 的 TONIC）｜up＝擴充（bomb 炸彈袋第 lv 級、belt 藥水腰帶、info 藏寶情報）
//   n＝一次給幾個｜stock＝每次補貨補到幾份（打倒首領時補滿）｜once＝一次性／限量，買完不再補貨、從貨架消失｜cat＝面板分類
//   need＝條件（道具 id 或 ST.flags 鍵；沒達成時顯示但不能買）｜boss＝要打倒幾隻首領（林、焰、淵三隻）才上架（沒達成時不顯示）｜after＝另一件（key）買完才上架
const SHOP=[
  // 消耗品
  {key:'potion',     give:'potion', price:30, stock:3, cat:'use'},
  {key:'tonic_power',tonic:'power',  price:25, stock:3, cat:'use'},
  {key:'tonic_swift',tonic:'swift',  price:25, stock:3, boss:1, cat:'use'},
  {key:'tonic_guard',tonic:'guard',  price:30, stock:3, boss:2, cat:'use'},
  {key:'bombs',      give:'bombs', n:5, price:20, stock:4, need:'bomb', cat:'use'},
  // 擴充（一次性）
  {key:'bag1',  up:'bomb',lv:1, price:60,  stock:1, once:1, need:'bomb', cat:'ext', ic:'bomb'},
  {key:'bag2',  up:'bomb',lv:2, price:110, stock:1, once:1, need:'bomb', boss:2, after:'bag1', cat:'ext', ic:'bomb'},
  {key:'belt',  up:'belt',lv:1, price:80,  stock:1, once:1, boss:1, cat:'ext', ic:'potion'},
  {key:'piece1',give:'piece', price:90,  stock:1, once:1, cat:'ext'},
  {key:'piece2',give:'piece', price:140, stock:1, once:1, boss:2, cat:'ext'},
  // 材料
  {key:'shard', give:'shard', price:14, stock:3, cat:'mat'},
  {key:'ore',   give:'ore',   price:22, stock:2, boss:1, cat:'mat'},
  // 裝備（疾風靴在熔岩遺址的寶箱，maps.js ash_c2）
  {key:'iron_shield',give:'iron_shield', price:70, stock:1, cat:'gear'},
  {key:'scale_mail', give:'scale_mail',  price:90, stock:1, need:'bs:boss_forest', cat:'gear'},
  // 其他
  {key:'info',  up:'info', lv:1, price:40, stock:1, once:1, cat:'other', ic:'key'}
];
const SHOP_CATS=['use','ext','mat','gear','other'];
const BOSS_FLAGS=['bs:boss_forest','bs:boss_fire','bs:boss_water'];   // 「打倒 N 隻首領」只算這三隻（神廟首領是最後一戰）
const SELL={shard:4,ore:6};   // 材料收購價（首領核心不收）
// 鐵匠：from＝升級自哪件（要有，打造後收回、換成新的；穿著的話自動換上）
const FORGE=[
  {id:'iron_sword',  from:'wood_sword', money:40, mats:{ore:2,shard:2}},
  {id:'flame_sword', from:'iron_sword', money:90, mats:{core_fire:1,ore:2,shard:4}},
  {id:'star_sword',  from:'flame_sword',money:150,mats:{core_forest:1,core_water:1,shard:6}},
  {id:'prism_shield',from:'iron_shield',money:110,mats:{core_water:1,ore:3}},
  {id:'ember_mail',  from:'scale_mail', money:120,mats:{core_fire:1,ore:2,shard:3}}
];
// 賞金委託：一次接一張。kind：kill（k＝敵人種類，省略＝任何敵人）｜pot｜chest（chest＝寶箱 id）；night＝只算夜晚；need＝解鎖條件（ST.flags 鍵）
// reward：money 珠幣、item 物品 id（可帶 :數量）
const BOUNTY=[
  {id:'b_slime', title:'史萊姆清除令',   kind:'kill',k:'slime', n:5, reward:{money:25}},
  {id:'b_pot',   title:'陶罐回收',   kind:'pot',            n:8, reward:{item:'lucky_ring'}},
  {id:'b_deep',  title:'深林尋寶',   kind:'chest',chest:'deep_c2', n:1, reward:{money:30}},
  {id:'b_goblin',title:'哥布林清剿',   kind:'kill',k:'goblin',n:4, reward:{money:35,item:'shard:2'}},
  {id:'b_archer',title:'弓箭手清剿', kind:'kill',k:'archer',n:4, reward:{money:45}, need:'bs:boss_forest'},
  {id:'b_knight',title:'盾騎士討伐',   kind:'kill',k:'knight',n:3, reward:{money:40,item:'ore:3'}, need:'bs:boss_fire'},
  {id:'b_lake',  title:'湖畔尋寶',   kind:'chest',chest:'lake_c1', n:1, reward:{item:'piece'}, need:'bs:boss_fire'},
  {id:'b_night', title:'夜間巡查',         kind:'kill',night:true,n:6, reward:{money:60,item:'shard:3'}, need:'bs:boss_water'}
];
const TRAIN_NEED=[3,1,2,2];   // 教學：斬擊 3 次、旋轉斬 1 次、翻滾 2 次、擋箭 2 次
const TRAIN_PAY=20;           // 結業獎勵（珠幣）
const TRAIN_ARROW={every:1.6,spd:4.2};   // 舉盾課：教官每隔幾秒射一支練習箭（不會受傷）
const STAKE={time:30,count:4,goal:12,reward:'sword_crest',area:[24.6,16.2],rMin:1.2,rMax:3.2};   // 木樁挑戰：秒數、同時幾根、門檻、一次性獎勵、場地中心與半徑

/* ================= 共用 ================= */
const V=()=>ST.vil;
function vilInit(){const v=ST.vil;v.stock=v.stock||{};v.bdone=v.bdone||[];v.tr=v.tr|0;v.best=v.best|0;if(!v.up)v.up={bomb:0,belt:0};for(const s of SHOP)if(v.stock[s.key]==null)v.stock[s.key]=s.stock}
const bossCount=()=>BOSS_FLAGS.filter(f=>ST.flags[f]).length;
const shopName=s=>(TEXT.shop.items[s.key]||TEXT.shop.items['tonic_'+s.tonic]||{}).name||nameOf(s.give);
const shopSold=s=>!!s.once&&V().stock[s.key]<=0;                                               // 一次性品買完了
const shopShown=s=>bossCount()>=(s.boss|0)&&(!s.after||V().stock[s.after]<=0)&&!shopSold(s);   // 已上架（還沒賣完）
const shopPieces=()=>SHOP.filter(s=>s.give==='piece').length;                                   // 旅商賣的命珠碎片（算進「累計碎片 x/總數」的總數）
function shopFull(s){
  if(s.tonic)return ST.tonic[s.tonic]>=TONIC_MAX;
  if(s.up)return s.up==='info'?!!V().info:(V().up[s.up]|0)>=s.lv;
  if(s.give==='potion')return ST.bag.potion>=potMax();
  if(s.give==='bombs')return ST.bombs>=bombMax();
  return ITEMS[s.give].kind==='equip'&&ST.bag.equip.includes(s.give);
}
const nameOf=id=>(ITEMS[id]&&ITEMS[id].name)||id;
const metNeed=need=>!need||(ITEMS[need]&&ITEMS[need].kind==='tool'?ST.tools.includes(need):!!ST.flags[need]);
const NEED_TXT=need=>need==='bomb'?'要有炸彈袋':need==='bs:boss_forest'?'打倒林之首領後':need==='bs:boss_fire'?'打倒焰之首領後':need==='bs:boss_water'?'打倒淵之首領後':'';
function el(tag,cls,txt){const e=document.createElement(tag);if(cls)e.className=cls;if(txt!=null)e.textContent=txt;return e}
function row(body,name,desc,btn,onClick,opt={}){
  const r=el('div','prow'+(opt.on?' on':''));const i=el('div','pi'),pn=el('div','pn',name);
  if(opt.icon||opt.tonic){const ic=opt.tonic?tonicImg(opt.tonic):iconImg(opt.icon);if(ic)pn.prepend(ic)}   // 有選配小圖才加（opt.icon＝物品 id，opt.tonic＝藥劑 id，圖是 i-potion 疊色）
  i.append(pn);if(desc)i.append(el('div','pd',desc));r.append(i);
  if(btn!=null){const b=el('button',null,btn);b.disabled=!!opt.off;b.onclick=onClick;r.append(b)}
  body.append(r);return r;
}
const moneyTxt=()=>`${ST.money} ${MONEY}`;
const refresh=()=>{hud(true);advHud(true)};
const lootTxt=l=>parseLoot(l).map(({id,n})=>nameOf(id)+(n>1?' ×'+n:'')).join('、');

/* ================= 背包／裝備 ================= */
function statLine(){
  const a=eqStat('atk'),d=Math.round(eqStat('def')*100),g=Math.round((1-eqStat('guard'))*100),s=Math.round(eqStat('spd')*100);
  return `攻擊 ${a}・旋轉斬 ${Math.round(a*eqStat('spinMul'))}・減傷 ${d}%・舉盾擋 ${g}%`+(s?`・移速 +${s}%`:'');
}
function openBag(){
  if(typeof running!=='undefined'&&!running)return;
  openPanel({title:'背包',bag:true,tabs:[['eq','裝備'],['item','道具'],['mat','材料']],sub:()=>moneyTxt(),onClose:refresh,render(body,tab,redraw){
    if(tab==='eq'){
      body.append(el('div','psec','目前能力'),el('div','pd',statLine()));
      for(const s of EQUIP_SLOTS){
        body.append(el('div','psec',SLOT_NAME[s]));
        const own=ST.bag.equip.filter(id=>EQUIP[id]&&EQUIP[id].slot===s);
        if(!own.length)body.append(el('div','pd',TEXT.bag.empty));
        for(const id of own){const on=ST.eq[s]===id;
          row(body,EQUIP[id].name,EQUIP[id].desc,on?(s==='acc'?'卸下':'裝備中'):'裝備',()=>{equip(id);SFX.drop();save();redraw()},{on,off:on&&s!=='acc',icon:id})}
      }
    }else if(tab==='item'){
      body.append(el('div','psec','生命'));
      const g=el('div','pgrid');body.append(g);
      const chip=(n,v,dim,ic)=>{const c=el('div','pchip'+(dim?' dim':''),n);const im=ic&&iconImg(ic);if(im)c.prepend(im);c.append(el('b',null,v));g.append(c)};
      chip('心',`${ST.hearts}`,0,'heart');chip('命珠碎片',`${ST.pieces} / ${PL.piecesPerHeart}`,0,'piece');chip('累計碎片',`${ST.gotPieces} / ${totalGems()}`,0,'piece');chip('回復藥',`${ST.bag.potion} / ${potMax()}`,0,'potion');chip('小鑰匙',`${ST.keys}`,0,'key');
      body.append(el('div','psec','藥劑'));
      for(const id of TONIC_IDS){const it=TEXT.shop.items['tonic_'+id],t=Math.ceil(TN[id]);
        row(body,`${it.name}　${ST.tonic[id]} / ${TONIC_MAX}`,it.desc+(t>0?`\n生效中，剩 ${t} 秒`:''),'使用',()=>{useTonic(id);redraw()},{off:!ST.tonic[id],tonic:id,on:t>0})}
      body.append(el('div','psec','副道具'));
      if(!ST.tools.length)body.append(el('div','pd',TEXT.bag.empty));
      for(const id of TOOL_ORDER)if(ST.tools.includes(id))row(body,TOOLS[id].name+(id==='bomb'?`（${ST.bombs} / ${bombMax()}）`:''),(TEXT.tool[id]||'').replace(/^獲得「[^」]+」！/,''),ST.tool===id?'使用中':'選用',()=>{ST.tool=id;advHud(true);redraw()},{on:ST.tool===id,off:ST.tool===id,icon:id});
      body.append(el('div','psec','聖物'));
      const g2=el('div','pgrid');body.append(g2);
      for(const r of ['relic_forest','relic_fire','relic_water']){const c=el('div','pchip'+(ST.relics.includes(r)?'':' dim'),ITEMS[r].name);const im=iconImg(r);if(im)c.prepend(im);c.append(el('b',null,ST.relics.includes(r)?'✓':'—'));g2.append(c)}
    }else{
      const ids=Object.keys(MATS);
      body.append(el('div','psec','材料（鍛造用）'));
      const g=el('div','pgrid');body.append(g);
      for(const id of ids){const n=ST.mats[id]|0;const c=el('div','pchip'+(n?'':' dim'),MATS[id].name);const im=iconImg(id);if(im)c.prepend(im);c.append(el('b',null,n));g.append(c)}
      body.append(el('div','psec','時段'),el('div','pd',`現在是${dayNow().name}。在村子的營火可以切換。`));
    }
  }});
}
HOOKS.bag=openBag;

/* ================= 旅商 ================= */
function shopBuy(s){   // s＝SHOP 的項目或它的 key
  vilInit();if(typeof s==='string')s=SHOP.find(x=>x.key===s);if(!s||!shopShown(s))return false;
  const n=s.n||1;
  if(!metNeed(s.need)){toast(TEXT.shop.needBomb);return false}
  if(V().stock[s.key]<=0){toast(TEXT.shop.out);return false}
  if(ST.money<s.price){toast(TEXT.shop.poor);return false}
  if(shopFull(s)){toast(TEXT.shop.full);return false}
  ST.money-=s.price;V().stock[s.key]--;let msg=TEXT.shop.bought+shopName(s)+(n>1?' ×'+n:'');
  if(s.tonic)ST.tonic[s.tonic]++;
  else if(s.up==='info')V().info=1;
  else if(s.up)V().up[s.up]=Math.max(V().up[s.up]|0,s.lv);
  else{const r=giveItem(s.give,n);if(s.give==='piece')msg=TEXT.shop.bought+r}
  SFX.coin();toast(msg);save();refresh();return true;
}
function shopSell(id,n=1){
  if(!SELL[id]||(ST.mats[id]|0)<n)return false;
  ST.mats[id]-=n;ST.money+=SELL[id]*n;SFX.coin();toast(TEXT.shop.sold+MATS[id].name+(n>1?' ×'+n:''));save();refresh();return true;
}
function shopDesc(s){
  const it=TEXT.shop.items[s.key]||TEXT.shop.items['tonic_'+s.tonic];
  if(s.tonic)return `${it.desc}　身上 ${ST.tonic[s.tonic]}/${TONIC_MAX}`;
  if(s.give==='potion')return `生命歸零時自動喝下、回滿。身上 ${ST.bag.potion}/${potMax()}`;
  if(s.give==='bombs')return `身上 ${ST.bombs}/${bombMax()}`;
  if(ITEMS[s.give]&&ITEMS[s.give].kind==='equip')return EQUIP[s.give].desc;
  if(s.give==='shard'||s.give==='ore')return `${it.desc}身上 ${ST.mats[s.give]|0}`;
  return it?it.desc:'';
}
const shopList=()=>SHOP.filter(shopShown);   // 目前上架的品項
function openShop(tab){
  vilInit();
  openPanel({title:'旅商',tabs:[['buy','買'],['sell','賣']],tab,sub:()=>moneyTxt(),onClose:refresh,render(body,t,redraw){
    if(t==='buy'){
      for(const c of SHOP_CATS){
        const list=shopList().filter(s=>s.cat===c);if(!list.length)continue;
        body.append(el('div','psec',TEXT.shop.cat[c]));
        for(const s of list){
          const n=s.n||1,left=V().stock[s.key],owned=shopFull(s)&&(s.up||(ITEMS[s.give]&&ITEMS[s.give].kind==='equip')),ok=metNeed(s.need);
          const desc=shopDesc(s)+(ok?'':`（${NEED_TXT(s.need)}）`)+(s.once||owned?'':`　剩 ${left}`);
          row(body,`${shopName(s)}${n>1?' ×'+n:''}　${s.price} ${MONEY}`,desc,owned?'已擁有':left<=0?TEXT.shop.soldOut:'買',()=>{shopBuy(s);redraw()},{off:owned||!ok||left<=0||ST.money<s.price,icon:s.ic||s.give,tonic:s.tonic})}
      }
      if(SHOP.some(s=>bossCount()<(s.boss|0)))body.append(el('div','pd pmore',TEXT.shop.moreStock));
    }else{let any=false;
      for(const id in SELL){const n=ST.mats[id]|0;if(!n)continue;any=true;
        const r=row(body,`${MATS[id].name} ×${n}`,`一個 ${SELL[id]} ${MONEY}`,'賣 1',()=>{shopSell(id,1);redraw()},{icon:id});
        if(n>1){const b=el('button',null,'全賣');b.onclick=()=>{shopSell(id,ST.mats[id]|0);redraw()};r.append(b)}}
      if(!any)body.append(el('div','pd','沒有可以賣的材料。（首領的核心留著鍛造用）'));}
  }});
}
EVT.on('boss',()=>{vilInit();for(const s of SHOP)if(!s.once&&!EQUIP[s.give])V().stock[s.key]=s.stock});   // 打倒首領：消耗品與材料補貨（一次性品、裝備不補）

/* 藏寶情報：世界地圖上，去過的地圖旁標「寶箱 已開/總數」（index.html 的 drawWorld 呼叫） */
const mapChestIds=id=>{const M=MAPS[id]||{};const a=[...(M.chests||[]).map(c=>c.id),...(M.cracks||[]).filter(k=>k.chest).map(k=>k.chest.id)];if(M.blockReward)a.push(M.blockReward.id);return a};
function mapChestCount(id){const a=mapChestIds(id);return {open:a.filter(k=>ST.chests[k]).length,total:a.length}}   // 某張地圖的寶箱 已開/總數（獨立函式，新版世界地圖畫面直接呼叫；沒買藏寶情報時由呼叫端自行不顯示：看 shopHasInfo()）
const shopHasInfo=()=>!!V().info;
HOOKS.worldNote=id=>{if(!shopHasInfo())return null;const c=mapChestCount(id);return c.total?`${TEXT.shop.chestNote} ${c.open}/${c.total}`:null};   // 舊版世界地圖（drawWorld）用

/* ================= 鐵匠 ================= */
const recipeOK=f=>ST.money>=f.money&&Object.entries(f.mats).every(([k,n])=>(ST.mats[k]|0)>=n)&&ST.bag.equip.includes(f.from)&&!ST.bag.equip.includes(f.id);
function forge(id){
  const f=FORGE.find(x=>x.id===id);if(!f)return false;
  if(!recipeOK(f)){toast(TEXT.smith.lack);return false}
  ST.money-=f.money;for(const [k,n] of Object.entries(f.mats))ST.mats[k]-=n;
  const slot=EQUIP[f.id].slot,wore=ST.eq[slot]===f.from;
  ST.bag.equip=ST.bag.equip.filter(x=>x!==f.from);giveItem(f.id);if(wore||!ST.eq[slot])ST.eq[slot]=f.id;
  ASFX.clank();setTimeout(()=>ASFX.get(),150);toast(TEXT.smith.made+EQUIP[f.id].name);save();refresh();return true;
}
function openForge(){
  openPanel({title:'鐵匠',sub:()=>moneyTxt()+'・'+Object.keys(MATS).filter(k=>ST.mats[k]).map(k=>MATS[k].name+'×'+ST.mats[k]).join(' '),onClose:refresh,render(body,t,redraw){
    for(const f of FORGE){
      const done=ST.bag.equip.includes(f.id),hasFrom=ST.bag.equip.includes(f.from);
      const need=Object.entries(f.mats).map(([k,n])=>`${MATS[k].name} ${ST.mats[k]|0}/${n}`).join('、');
      row(body,`${EQUIP[f.id].name}　${f.money} ${MONEY}`,`${EQUIP[f.id].desc}\n升級自：${EQUIP[f.from].name}${hasFrom||done?'':'（還沒有）'}\n材料：${need}`,done?'已擁有':'打造',()=>{forge(f.id);redraw()},{off:done||!recipeOK(f),icon:f.id});
    }
  }});
}

/* ================= 賞金板 ================= */
const bq=()=>V().bq&&BOUNTY.find(b=>b.id===V().bq.id);
function bountyAccept(id){
  vilInit();const b=BOUNTY.find(x=>x.id===id);if(!b||V().bdone.includes(id)||!metNeed(b.need))return false;
  if(V().bq){toast(TEXT.bounty.busy);return false}
  V().bq={id,n:0};
  if(b.kind==='chest'&&ST.chests[b.chest]){V().bq.n=b.n;toast(TEXT.bounty.already)}else toast(TEXT.bounty.take+b.title);
  save();return true;
}
function bountyClaim(){
  const b=bq();if(!b||V().bq.n<b.n)return false;
  const got=[];if(b.reward.money){ST.money+=b.reward.money;got.push(b.reward.money+' '+MONEY)}
  if(b.reward.item)parseLoot(b.reward.item).forEach(({id,n})=>got.push(giveItem(id,n)));
  V().bdone.push(b.id);V().bq=null;ASFX.get();toast(TEXT.bounty.claim+got.join('、'));save();refresh();return true;
}
function bountyQuit(){if(!V().bq)return false;V().bq=null;toast(TEXT.bounty.quit);save();return true}
function bountyAdd(n){const b=bq();if(!b)return;const q=V().bq;if(q.n>=b.n)return;q.n=Math.min(b.n,q.n+n);if(q.n>=b.n){toast(TEXT.bounty.done);ASFX.get()}save()}
EVT.on('kill',e=>{const b=bq();if(!b||b.kind!=='kill'||e.boss||e.dummy)return;if(b.k&&e.k!==b.k)return;if(b.night&&ST.day!==2)return;bountyAdd(1)});
EVT.on('pot',()=>{const b=bq();if(b&&b.kind==='pot')bountyAdd(1)});
EVT.on('chest',p=>{const b=bq();if(b&&b.kind==='chest'&&p.id===b.chest)bountyAdd(1)});
function bountyDesc(b){const k=b.kind==='kill'?`打倒 ${b.n} 隻${b.k?ENEMY[b.k].name:'敵人'}${b.night?'（夜晚）':''}`:b.kind==='pot'?`打破 ${b.n} 個陶罐`:`找到寶箱（${b.chest==='deep_c2'?'古木林深處':'深淵湖畔'}）`;
  const r=[b.reward.money?b.reward.money+' '+MONEY:'',b.reward.item?lootTxt(b.reward.item):''].filter(Boolean).join('、');return `${k}　賞金：${r}`}
function openBoard(){
  vilInit();
  openPanel({title:'賞金板',sub:()=>moneyTxt(),onClose:refresh,render(body,t,redraw){
    const cur=bq();
    body.append(el('div','psec','進行中'));
    if(cur){const q=V().bq,done=q.n>=cur.n;
      const r=row(body,`${cur.title}　${q.n} / ${cur.n}`,bountyDesc(cur),done?'領賞':'放棄',()=>{done?bountyClaim():bountyQuit();redraw()},{on:done})}
    else body.append(el('div','pd','（沒有。從下面挑一張吧）'));
    body.append(el('div','psec','委託'));
    let any=false;
    for(const b of BOUNTY){if(V().bdone.includes(b.id)||(cur&&cur.id===b.id))continue;any=true;
      const ok=metNeed(b.need);row(body,b.title,bountyDesc(b)+(ok?'':`（${NEED_TXT(b.need)}）`),'接下',()=>{bountyAccept(b.id);redraw()},{off:!ok||!!cur})}
    if(!any)body.append(el('div','pd','（委託都完成了）'));
    if(V().bdone.length)body.append(el('div','psec',`已完成 ${V().bdone.length} / ${BOUNTY.length}`));
  }});
}

/* ================= 營火與日夜 ================= */
function setDay(i){ST.day=clamp(i|0,0,DAY.length-1);dayTag()}
function dayTag(){const t=document.getElementById('dayTag');if(!t)return;const d=dayNow();t.textContent=d.name;t.classList.toggle('on',ST.day>0)}
HOOKS.ambient=()=>{const d=dayNow();return d.dark||d.tint?{dark:d.dark,tint:d.tint}:null};
async function campMenu(p){
  const k=await ask([TEXT.camp.ask],TEXT.camp.opts);
  if(k>=DAY.length)return;
  setDay(k);restAt(p);toast(TEXT.camp.rested+DAY[k].name+'。');
}

/* ================= 劍術教官 ================= */
let LESSON=null,CHAL=null;   // 進行中的教學 {i,n,t}｜木樁挑戰 {t,score}
const trainer=()=>C.npcs.find(n=>n.id==='trainer');
function chalHud(txt){const c=document.getElementById('chal');if(!c)return;c.textContent=txt||'';c.classList.toggle('on',!!txt)}
function lessonHud(){if(!LESSON){chalHud('');return}const L=TEXT.trainer.lesson[LESSON.i];chalHud(`練習：${L[1]}（${LESSON.n} / ${TRAIN_NEED[LESSON.i]}）`)}
function startLesson(){vilInit();if(V().tr>=4)return false;LESSON={i:V().tr,n:0,t:0,prev:PS.act};lessonHud();return true}
function lessonCount(i){
  if(!LESSON||LESSON.i!==i)return;LESSON.n++;lessonHud();
  if(LESSON.n>=TRAIN_NEED[i]){V().tr=i+1;LESSON=null;ASFX.get();save();
    setTimeout(()=>{chalHud('');if(V().tr>=4){if(!V().trPaid){V().trPaid=1;ST.money+=TRAIN_PAY;save();refresh()}say([['劍術教官',TEXT.trainer.graduate],`獲得 ${TRAIN_PAY} ${MONEY}。`])}
      else{toast(TEXT.trainer.pass);startLesson();const t=trainer();if(t)say([['劍術教官',TEXT.trainer.lesson[V().tr][0]]])}},400)}
}
EVT.on('block',()=>lessonCount(3));
function lessonTick(dt){
  if(!LESSON)return;
  if(CURID!=='village'){LESSON=null;chalHud('');return}
  const a=PS.act;if(a!==LESSON.prev){if(a==='slash')lessonCount(0);else if(a==='spin')lessonCount(1);else if(a==='roll')lessonCount(2)}LESSON&&(LESSON.prev=a);
  if(LESSON&&LESSON.i===3){LESSON.t-=dt;const t=trainer();
    if(LESSON.t<=0&&t){LESSON.t=TRAIN_ARROW.every;const dx=P.x-t.x,dy=P.y-(t.y-.3),l=Math.hypot(dx,dy)||1;
      SHOTS.push({k:'arrow',x:t.x+dx/l*.5,y:t.y-.3+dy/l*.5,vx:dx/l*TRAIN_ARROW.spd,vy:dy/l*TRAIN_ARROW.spd,life:3,dmg:0,dead:0,practice:true});SFX.arrow()}}
}
// 木樁：不會動、不會打人；打一下就倒，倒了在附近換位置再立一根（不觸發 kill 事件，不掉錢）
function stakeSpot(){const [cx,cy]=STAKE.area;for(let k=0;k<60;k++){const a=Math.random()*Math.PI*2,r=rand(STAKE.rMin,STAKE.rMax),x=cx+Math.cos(a)*r,y=cy+Math.sin(a)*r;
  if(circleFree(x,y,.45)&&Math.hypot(x-P.x,y-P.y)>1.1&&!ENEMIES.some(e=>e.dummy&&!e.dead&&Math.hypot(e.x-x,e.y-y)<1))return [x,y]}return [cx+rand(-1,1),cy+rand(-1,1)]}
function makeStake(){const [x,y]=stakeSpot();
  const e={id:++EID,k:'stake',dummy:true,boss:true,D:{mass:99,gold:[0,0],heart:0,name:'木樁'},x,y,hx:x,hy:y,r:.32,hp:1,max:1,atk:0,spd:0,fa:0,fx:0,fy:1,st:'move',t:0,cd:0,anim:0,flash:0,blockT:0,kbx:0,kby:0,kbt:0,z:0,dead:false,dieT:0,dieMax:.35,moving:false};
  e.tick=(e,dt)=>{if(e.flash>0)e.flash-=dt};e.draw=drawStake;
  e.onHit=()=>{if(!CHAL||e.dead)return false;e.dead=true;e.dieT=.35;CHAL.score++;SFX.hit();sparks(e.x,e.y-.4,'#e8c890',8,3,.5);ENEMIES.push(makeStake());return false};
  return e;
}
function drawStake(c,e){
  const al=e.dead?clamp(e.dieT/.35,0,1):1;if(al<=0)return;c.save();c.globalAlpha=al;drawShadow(c,e.x,e.y+.02,.6,.2);
  const tilt=e.dead?(1-al)*1.2:0;c.translate(e.x,e.y);c.rotate(tilt);
  if(drawArtFit(c,'p-stake',0,0,.8,1.25)){c.restore();return}   // 有 p-stake 圖：用圖（倒下的傾斜與淡出沿用）
  c.fillStyle='#7a5530';c.fillRect(-.09,-.95,.18,.95);c.fillStyle='#a8784a';c.fillRect(-.26,-.8,.52,.16);
  c.fillStyle='#d8b07a';c.beginPath();c.arc(0,-1.02,.17,0,7);c.fill();c.strokeStyle='#5a3b1e';c.lineWidth=.03;c.stroke();
  c.strokeStyle='#c83a2a';c.lineWidth=.035;c.beginPath();c.arc(0,-1.02,.08,0,7);c.stroke();c.restore();
}
function startStakes(){
  vilInit();if(V().tr<4){say([['劍術教官',TEXT.trainer.needLesson]]);return false}
  CHAL={t:STAKE.time,score:0};ENEMIES=ENEMIES.filter(e=>!e.dummy);for(let i=0;i<STAKE.count;i++)ENEMIES.push(makeStake());return true;
}
async function endStakes(){
  const s=CHAL.score;CHAL=null;ENEMIES=ENEMIES.filter(e=>!e.dummy);chalHud('');
  const first=s>V().best;if(first)V().best=s;
  const lines=[['劍術教官',`${TEXT.trainer.stakeEnd}${s} 根。${TEXT.trainer.best}${V().best} 根。`]];
  if(s>=STAKE.goal&&!V().crest){V().crest=1;giveItem(STAKE.reward);lines.push(['劍術教官',TEXT.trainer.reward],`獲得「${EQUIP[STAKE.reward].name}」。`)}
  save();refresh();await say(lines);
}
function chalTick(dt){
  if(!CHAL)return;
  if(CURID!=='village'){CHAL=null;chalHud('');return}
  CHAL.t-=dt;chalHud(`木樁 ${CHAL.score}　剩 ${Math.max(0,CHAL.t).toFixed(1)} 秒`);
  if(CHAL.t<=0)endStakes();
}
async function talkTrainer(){
  vilInit();
  if(LESSON){say([['劍術教官',TEXT.trainer.lesson[LESSON.i][0]]]);return}
  const k=await ask([['劍術教官',TEXT.trainer.hi+(V().best?`（${TEXT.trainer.best}${V().best}）`:'')]],[{t:TEXT.trainer.ask[0]+(V().tr>=4?'（已結業）':`（${V().tr} / 4）`),off:V().tr>=4},{t:TEXT.trainer.ask[1],off:!!CHAL},TEXT.trainer.ask[2]]);
  if(k===0){startLesson();await say([['劍術教官',TEXT.trainer.lesson[V().tr][0]]])}
  else if(k===1){await say([['劍術教官',TEXT.trainer.stakeRule]]);startStakes()}
}

/* ================= 村長：依進度給主線提示 ================= */
function chiefGoal(){
  const F=ST.flags,G=TEXT.chief.goal;
  if(ST.cleared||F['bs:boss_temple'])return G.done;
  if(!F['bs:boss_forest'])return PROGRESS.has('deepgrove')?G.altarForest:G.grove;
  if(!F['al:altar_forest'])return G.claimForest;
  if(!F['bs:boss_fire'])return G.fire;
  if(!F['al:altar_fire'])return G.claimFire;
  if(!F['bs:boss_water'])return G.water;
  if(!F['al:altar_water'])return G.claimWater;
  return G.temple;
}
function chiefGoalMap(){   // 與 chiefGoal 同一套判斷，回傳「下一個主線目標」在哪張地圖（世界地圖畫小星用）；null＝已通關
  const F=ST.flags,H=id=>PROGRESS.has(id);
  if(ST.cleared||F['bs:boss_temple'])return null;
  if(!F['bs:boss_forest'])return H('deepgrove')?'altar_forest':'grove';
  if(!F['al:altar_forest'])return 'altar_forest';
  if(!F['bs:boss_fire'])return H('ashroad')?'altar_fire':'ashroad';
  if(!F['al:altar_fire'])return 'altar_fire';
  if(!F['bs:boss_water'])return H('lakeshore')?'altar_water':'lakeshore';
  if(!F['al:altar_water'])return 'altar_water';
  return H('templeyard')?'temple':'templeyard';
}
// 世界地圖畫面（index.html 的 drawWorld）要的資料
HOOKS.worldInfo=()=>({info:shopHasInfo(),chest:mapChestCount,goal:chiefGoalMap(),relics:ST.relics,chestsOpen:Object.keys(ST.chests).length,chestsTotal:totalChests(),gems:ST.gotPieces,gemsTotal:totalGems(),time:fmtTime(ST.time)});
async function talkChief(){
  const k=await ask([['村長',TEXT.npc.chief]],TEXT.chief.ask);
  if(k===0)await say([['村長',chiefGoal()]]);
  else if(k===1)await say(TEXT.chief.about.map(l=>['村長',l]));
}

/* ================= NPC 接線 ================= */
const NPC_ACT={
  chief:talkChief,
  smith:async()=>{const k=await ask([['鐵匠',TEXT.smith.hi]],TEXT.smith.ask);if(k===0)openForge()},
  merchant:async()=>{
    vilInit();const ids=shopList().map(x=>x.key),v=V(),fresh=v.seen?ids.filter(k=>!v.seen.includes(k)):(bossCount()>0?ids:[]);   // 第一次見面（沒有 seen）且還沒打首領：不提示
    v.seen=ids;if(fresh.length)save();
    const k=await ask([['旅商',TEXT.shop.hi],...(fresh.length?[['旅商',TEXT.shop.newStock]]:[])],TEXT.shop.ask);if(k===0)openShop('buy');else if(k===1)openShop('sell')},
  bounty:()=>openBoard(),
  trainer:talkTrainer,
  traveler:()=>say(TEXT.npc.traveler.map(l=>['營火旁的旅人',l])),
  villager:()=>say(TEXT.npc.villager.map(l=>['村民',l]))
};
/* 開場旁白：只有「重新開始／開始」的新遊戲，第一次進村莊時播放；旗標 ST.flags.introDone 存進存檔，「繼續」讀檔不播 */
let INTRO_PENDING=false;
const _vBegin=HOOKS.begin;
HOOKS.begin=mode=>{const r=_vBegin(mode);INTRO_PENDING=mode!=='continue';return r};
async function playIntro(){
  while(!running||document.getElementById('fade').classList.contains('on'))await sleep(100);   // 等標題淡出、地圖畫出來
  lock=true;await say(TEXT.intro);lock=false;
}
EVT.on('enter',id=>{
  vilInit();dayTag();
  if(INTRO_PENDING&&id==='village'&&!ST.flags.introDone){INTRO_PENDING=false;ST.flags.introDone=1;save();playIntro()}
  if(id!=='village'){LESSON=null;CHAL=null;chalHud('');return}
  for(const n of C.npcs){const f=NPC_ACT[n.id];if(f){n.act=f;n.label=n.id==='bounty'?'查看':'對話'}}
  for(const p of INTER)if(p.k==='campfire'){p.label='休息';p.act=()=>campMenu(p)}
});
// 練習箭（dmg 0）打到不扣血；hurtPlayer 已處理 0 傷害
const _vUpdate=HOOKS.update;
HOOKS.update=dt=>{_vUpdate(dt);if(FROZEN||PS.dead)return;lessonTick(dt);chalTick(dt)};

/* ================= 測試掛鉤（?debug=1） ================= */
if(window.__shrine){
  Object.defineProperties(window.__shrine,Object.getOwnPropertyDescriptors({
    V:{SHOP,SELL,mapChestCount,shopHasInfo,bossCount,shopList,shopFull,shopDesc,mapChestIds,FORGE,BOUNTY,STAKE,TRAIN_NEED,shopBuy,shopSell,forge,bountyAccept,bountyClaim,bountyQuit,setDay,startLesson,startStakes,endStakes,chiefGoal,openBag,openShop,openForge,openBoard,campMenu,NPC_ACT,
      get LESSON(){return LESSON},get CHAL(){return CHAL}}
  }));
}
window.SHRINE_VILLAGE={SHOP,FORGE,BOUNTY,openBag};
