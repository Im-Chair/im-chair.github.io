'use strict';
/* ============================================================
   珠界：聖林神廟 — 冒險層（adventure.js，在 game.js 之後載入；非 ES module）
   負責：四樣副道具、機關（火盆、鎖、可推石塊、裂牆、勾爪樁）、四隻首領、祭壇獎勵、通關結尾。
   直接用 game.js／引擎的全域：ST、PS、ENEMIES、DROPS、INTER、FX、EVT、SFX、hurtPlayer、damageEnemy、killEnemy、
   makeEnemy、breakPot、openChest、giveItem、save、hud、sparks、puff、ring、C、CURID、P、HOOKS、go、say、toast、lock…

   ── 結構 ──
   文字     TEXT（祭壇、首領、結尾的台詞都在這裡，之後潤稿只改這裡）
   數值表   TOOLS（四樣道具）、ALTAR_REWARD（祭壇獎勵）、BOSS_DEF（四隻首領：血量、傷害、招式表、冷卻、預兆時間）
   狀態     存檔的部分都在 ST（tools、tool、bombs、relics、flags、deaths、time、gotPieces、cleared）
            ST.flags 鍵：br:<圖>:<火盆id> 已點亮｜lk:<圖>:<序號> 鎖已開｜ck:<圖>:<裂牆id> 已炸開｜bk:<圖>:<序號> 石塊位置 [x,y]
                         bs:<首領id> 已打倒｜al:<祭壇id> 獎勵已拿
   暫態     TFX（道具實體：迴力鏢、炸彈、勾爪）、HAZ（首領招式：警示圈、直線、飛彈、拋物熔岩、火池、遲緩區）、
            FIGHT（首領戰：場地中心、半徑、首領實體）、CAM（鏡頭焦點覆寫）
   ============================================================ */

/* ================= 文字（佔位，之後請人潤稿） ================= */
const TEXT={
  bossIntro:{boss_forest:'盤踞的古根破土而出，樹冠落下黑霧。',boss_fire:'熔岩翻湧，石縫間亮起兩道赤紅的眼眸。',boss_water:'潭水驟冷，龐大的黑影自水底緩緩浮現。',boss_temple:'星輪驟轉，殿內的燭火一齊熄滅。'},
  bossRage:{boss_forest:'巴爾幹發出嘶吼，枯枝纏滿黑紫的瘴氣。',boss_fire:'伊格尼斯的胸口裂開，岩漿湧了出來。',boss_water:'利維坦翻身攪動深潭，巨浪撲面而來。',boss_temple:'星輪越轉越快，光芒刺得人睜不開眼。'},
  bossDown:'祭壇恢復了平靜。去看看吧。',
  altar:{
    altar_forest:['翠綠的光芒從祭壇中央浮起，凝成一枚結晶。','獲得「林之聖物」。'],
    altar_fire:['祭壇上的火焰收攏起來，凝成一枚赤紅的結晶。','獲得「焰之聖物」。'],
    altar_water:['散落水面的光點逐漸聚集，凝成一枚湛藍的結晶。','獲得「淵之聖物」。']
  },
  heart:'獲得「完整的心」，生命上限 +1，生命全滿。',
  tool:{
    boomerang:'獲得「迴力鏢」！投擲後會自行飛回，能擊暈敵人、遠距離打破陶罐，也能撿回掉落物。',
    bomb:'獲得「炸彈袋」！放下炸彈後會引爆，可炸開有裂縫的牆。陶罐和敵人都可能掉落炸彈。',
    lantern:'獲得「提燈」！能點燃火盆，也能照亮暗處，讓你看清前方。',
    hookshot:'獲得「勾爪」！瞄準木樁上的鐵環使用，就能將自己拉過水面或熔岩。'
  },
  toolHint:'按 I 或 V 使用道具，按 Q／E 或數字鍵切換。',
  relicDoor:'三枚聖物同時發出光芒，神廟大門緩緩開啟。',
  brazierDoor:'最後一座火盆亮了。石門深處傳來聲響。',
  keyDoor:'小鑰匙轉動，門鎖應聲而開。',
  crack:'碎石落下，牆壁被炸開了。',
  blocks:'石塊歸位。深處傳來一聲沉重的機關聲。',
  needFire:'火盆沒有反應。需要提燈才能點燃。',
  noBomb:'沒有炸彈了。打破陶罐或打倒敵人可以補充。',
  /* 開場旁白：新遊戲第一次進村莊時逐句顯示（village.js） */
  intro:[
    '千年前，大地裂開了一道口子。',
    '黑紫色的瘴氣從地縫滲出，無聲無息地漫過聖林。',
    '溫馴的珠獸染上瘴氣，紅著眼四處狂奔。',
    '村裡的老人說，神廟深處的光能鎮住裂痕。要進神廟，得先取得三座祭壇的信物。',
    '可就連守著祭壇的巨獸，也已經被瘴氣吞沒了神智。',
    '你握緊手裡的劍，轉身走進起霧的古木林。'
  ],
  ending:[
    ['','星輪停轉，克洛諾斯無聲倒下。大殿裡只剩風聲。'],
    ['','神廟深處傳來一聲低沉的鐘鳴，林間的瘴氣正緩緩退去。'],
    ['','你停在光核前，手微微發抖，最後還是伸手把它拿走了。']
  ],
  /* ── 村莊（village.js 用；全部是佔位句，之後潤稿） ── */
  npc:{
    chief:'我這把年紀，別人的傳聞一概不記，只記自己親眼看過的。想問什麼就說吧。',
    villager:['一大早去林邊摘果子，風裡全是焦土味，連鳥都不叫了。','平常蹭過來討果子吃的毛球，昨天竟然對我齜牙咧嘴……你進林子要小心喔。'],
    traveler:['火還暖著，坐吧。是誰惹出來的，晚點再問——先救還活著的人。','在火邊歇一會兒能回復體力，也能等到黃昏或入夜。夜裡怪物兇得多，掉的好東西也多。']
  },
  chief:{
    ask:['接下來該往哪裡走？','村子裡有哪些設施？','暫時沒事。'],
    about:['旅商賣藥和炸彈，也會收購你帶回來的材料。','鐵匠能用珠幣和材料打造裝備，手藝還不錯。','賞金板上有不少委託，完成後記得回來領珠幣。','教官能教你劍術。營火可以休息，也能改變時段。'],
    goal:{
      grove:'先往東邊的古木林看看。最近那裡不太對勁。',
      altarForest:'古木林深處有座林之祭壇。往北走就能找到。',
      claimForest:'巴爾幹已經安靜下來了。別忘了取得祭壇上的聖物。',
      fire:'北邊是熔岩遺址，焰之祭壇在西側。記得用勾爪越過熔岩。',
      claimFire:'焰之祭壇已經恢復平靜。去取得上面的聖物吧。',
      water:'西南過橋是深淵湖畔，淵之祭壇在海蝕洞裡。裡面的火盆得用提燈點亮。',
      claimWater:'湖底的動靜總算停了。記得去取得淵之祭壇的聖物。',
      temple:'三件聖物都拿到了。往東走進入古木林深處，就能找到神廟外庭。',
      done:'林子的黑霧散了。你走進神廟後發生了什麼，我沒親眼見著。村子保住了，這就夠了。'
    }
  },
  /* ── 世界地圖：標籤與各地點簡介 ── */
  world:{explored:'已探索',chest:'寶箱',gem:'命珠碎片',time:'遊玩時間',unknown:'尚未探索。',
    village:'聖林邊緣的小村子。有旅商、鐵匠和一座營火。',
    grove:'村子東邊的林子入口。樹冠遮住了天光，小徑還看得見。',
    deepgrove:'古木盤根錯節的林子深處。腳下的路時有時無。',
    altar_forest:'藏在古木深處的石壇。四周安靜得不尋常。',
    ashroad:'焦黑的石頭遺址，地面的裂縫裡流著熔岩。',
    altar_fire:'火山口邊的石壇。空氣燙得讓人睜不開眼。',
    lakeshore:'村子西南的湖畔。木棧橋通向水邊的洞窟。',
    altar_water:'湖邊海蝕洞裡的石壇。水聲在洞中迴響。',
    templeyard:'古木林盡頭的外庭。石柱與階梯通向神廟。',
    temple:'外庭之後的神廟內殿。村裡沒人說得清裡面的事。'},
  shop:{hi:'好貨不等人。藥水、炸彈隨你挑，包裡的材料我也收，價錢好談。',ask:['買東西','賣掉材料','先不用了'],bought:'買了 ',sold:'賣掉 ',poor:'這點珠幣不夠喔。先去林子裡轉轉再來吧。',full:'你這包袱塞得比我的貨箱還滿，先清出點空位吧。',out:'這批貨全讓你掃光了，等下回補貨再來吧。',needBomb:'得先有炸彈袋，才能買這個。',
    newStock:'進了新貨，看看吧。',moreStock:'打倒更多首領後進貨',soldOut:'售完',tonicUse:'喝下了',tonicShort:{power:'力',swift:'疾',guard:'守'},chestNote:'寶箱',
    cat:{use:'消耗品',ext:'擴充',mat:'材料',gear:'裝備',other:'其他'},
    // 新品項的品名與說明（效果數值要和 game.js 的 TONIC、BOMB_CAPS、POTION_MAX_BELT 對得上）
    items:{
      tonic_power:{name:'力量藥劑',desc:'喝下後 60 秒內，斬擊傷害 +30%。同種再喝只會重算時間。'},
      tonic_swift:{name:'疾行藥劑',desc:'喝下後 60 秒內，移動速度 +20%，翻滾冷卻縮短三成。'},
      tonic_guard:{name:'守護藥劑',desc:'喝下後 60 秒內，受到的傷害減少三成。'},
      bag1:{name:'炸彈袋擴充・一',desc:'炸彈上限從 10 顆增加到 15 顆。'},
      bag2:{name:'炸彈袋擴充・二',desc:'炸彈上限從 15 顆增加到 20 顆。'},
      belt:{name:'藥水腰帶',desc:'回復藥可帶的數量從 3 瓶增加到 5 瓶。'},
      piece1:{name:'命珠碎片',desc:'和寶箱裡的一樣，集滿四片，生命上限 +1。限量一片，不補貨。'},
      piece2:{name:'命珠碎片',desc:'和寶箱裡的一樣，集滿四片，生命上限 +1。最後一片，不補貨。'},
      shard:{name:'魔晶',desc:'鍛造用的材料。'},
      ore:{name:'鐵礦石',desc:'鍛造用的材料。'},
      info:{name:'藏寶情報',desc:'買了之後，世界地圖會顯示各地點的寶箱「已開／總數」。一次性。'}
    }},
  smith:{hi:'……要打傢伙？材料跟珠幣放桌上。',ask:['打造裝備','先不用了'],made:'打造完成：',lack:'材料不夠，珠幣也差一點。湊齊了再來。'},
  bounty:{done:'委託完成了！回村子的賞金板領取獎勵吧。',take:'接下委託：',claim:'領到賞金：',busy:'別太貪心，手上這張辦妥了再接下一張。',already:'這個寶箱你早就開過了。這張直接算完成。',quit:'委託已放棄。'},
  camp:{ask:'要在營火旁休息嗎？生命會恢復，進度也會儲存。',opts:['休息到白天','休息到黃昏','休息到夜晚','先不用'],rested:'休息好了。現在是'},
  trainer:{
    hi:'想學劍？先讓我看看你的底子。',
    ask:['開始上課','木樁挑戰','改天再來'],
    lesson:[
      ['第一課：斬擊。按 J 或 Z（手機按「攻擊」）揮三次劍。','斬擊'],
      ['第二課：旋轉斬。按住攻擊鍵蓄力，放開就能轉身揮斬。','旋轉斬'],
      ['第三課：翻滾。按 K 或 X（手機按「翻滾」）翻滾兩次，翻滾時不會受傷。','翻滾'],
      ['第四課：舉盾。按住 L 或 C（手機按「舉盾」）面向我，擋下兩支練習箭。','舉盾']
    ],
    pass:'下盤穩了點，總算像個拿劍的樣子。繼續。',
    graduate:'四招都摸熟了。哪天有人能跟珠獸並肩，而不是拿劍對著牠們——我倒想看看。去試試木樁吧。',
    needLesson:'基本招式還沒學全就想打木樁？先把課上完。',
    stakeRule:'三十秒內盡量打倒木樁。十二根以上，我就送你一份獎品。',
    stakeEnd:'時間到！你打倒了 ',
    reward:'身手夠俐落。這枚徽章拿去，別丟我的臉。',
    best:'最佳紀錄：'
  },
  bag:{empty:'這裡還沒有東西。'},
  endTitle:'守界英雄錄',
  endLines:['少年擊敗了失控的守護者，帶走了神廟深處的光核。','守界盟史冊記為：初代珠師艾瑟爾平息災厄、封印珠核，世人尊他為守界英雄。','——後來進過內殿的人說，地磚上連一道劍痕都沒有。']
};

/* ================= 數值表 ================= */
const TOOL_ORDER=['boomerang','bomb','lantern','hookshot'];   // 數字鍵 1～4 對應
const TOOLS={
  boomerang:{name:'迴力鏢',spd:9.5,out:.42,back:10.5,dmg:4,bossDmg:3,stun:1.4,r:.32},
  bomb:     {name:'炸彈',fuse:1.5,r:1.7,dmg:40,bossDmg:30,self:2,maxOut:2},
  lantern:  {name:'提燈',reach:.95,r:.9,dmg:6,bossDmg:4,light:5.8,cd:.45},
  hookshot: {name:'勾爪',range:8,side:.7,minD:1,spd:18,pull:13,dmg:6,stun:1}
};
// 祭壇獎勵：聖物＋完整的心（＋道具）。取得順序：林（勾爪）→ 焰（提燈）→ 淵
const ALTAR_REWARD={
  altar_forest:{relic:'relic_forest',tool:'hookshot',boss:'boss_forest'},
  altar_fire:  {relic:'relic_fire',tool:'lantern',boss:'boss_fire'},
  altar_water: {relic:'relic_water',boss:'boss_water'}
};
/* 首領（舊原型：巴爾幹 260hp/atk3、利維坦 320/4、伊格尼斯 380/5、克洛諾斯 460/5）
   v1.0 依模擬機器人（shrine/_bossbot.js，開發用、不部署）重新平衡：目標是「當時應有的心數＋裝備、只會翻滾走位」約一半到六成勝率。
   預期配備：林 5 心木劍｜焰 6 心鐵劍｜淵 8 心炎刃＋鱗甲｜神廟 10 心星輝劍＋焰鱗鎧＋劍士徽章
   counterN 連續挨打幾下就「震開」[一階, 二階]｜counterR 震開半徑｜counterWarn 震開預兆秒數｜core 掉落的鍛造核心
   hp 血量｜atk 招式傷害（半顆心）｜touch 碰撞傷害｜r 碰撞半徑｜size 圖高（單位）｜spd 走路速度
   moves1／moves2 第一／第二階段的招式輪替（照順序循環，每種都會出現）｜cd 招式間隔 [一階, 二階]｜warn 預兆時間倍率 [一階, 二階] */
const BOSS_DEF={
  boss_forest:{name:'巴爾幹',title:'寄生古樹精',art:'boss_forest',hp:800,atk:2,touch:2,r:.85,size:3.6,spd:.55,gold:[25,35],aura:'#8cff8c',
    moves1:['vines','roots','summon','roots','vines'],moves2:['vines','spores','roots','summon','spores','roots'],cd:[1.5,1.05],warn:[1,.85],
    counterN:[8,7],counterR:2.2,counterWarn:.6,counterStyle:'root',core:'core_forest'},
  boss_fire:{name:'伊格尼斯',title:'熔核巨像',art:'boss_fire',hp:1550,atk:2,touch:2,r:.95,size:3.6,spd:.8,gold:[30,40],aura:'#ffa040',
    moves1:['lava','cross','slam'],moves2:['lava','charge','cross','slam','charge'],cd:[1.45,1.0],warn:[1,.85],
    counterN:[8,7],counterR:2.3,counterWarn:.5,core:'core_fire'},
  boss_water:{name:'利維坦',title:'深淵巨蟒',art:'boss_water',hp:1750,atk:3,touch:2,r:.85,size:3.5,spd:1.2,gold:[30,40],aura:'#7aa8ff',flip:true,
    moves1:['dive','pillars','spit'],moves2:['dive','chain','spit','pillars','dive','chain'],cd:[1.35,.95],warn:[1,.85],
    counterN:[8,7],counterR:2.2,counterWarn:.5,counterStyle:'water',core:'core_water'},
  boss_temple:{name:'克洛諾斯',title:'星輪魔導士',art:'boss_temple_img',hp:2600,atk:4,big:3,touch:2,r:.7,size:3.3,spd:1.3,gold:[50,60],aura:'#ffd86a',
    moves1:['orbs','vines','lava','blink','pillars'],moves2:['shift','orbs','chain','blink','lava','vines','pillars'],cd:[1.35,.85],warn:[1,.85],
    counterN:[8,7],counterR:2.2,counterWarn:.45,counterStyle:'star'}
};
const BOSS_HIT_DECAY=1.2;   // 首領「連續挨打」計數每秒消退幾下（停手一陣子就不會被震開）
ART_SRC.boss_forest=`art/boss_forest.webp?v=${SHRINE_VER}`;ART_SRC.boss_fire=`art/boss_fire.webp?v=${SHRINE_VER}`;ART_SRC.boss_water=`art/boss_water.webp?v=${SHRINE_VER}`;ART_SRC.boss_temple_img=`art/boss_time.webp?v=${SHRINE_VER}`;   // 帶版號：換新圖後升 SHRINE_VER
const BOSS_ARENA_IN=.7;   // 走進場地半徑內多深才觸發
const HZ_COL={vine:'#7cff5a',root:'#c89a5a',spore:'#c6ff7a',lava:'#ff7a2a',fire:'#ffa040',slam:'#ffcf6a',water:'#6ac8ff',bite:'#9fd0ff',star:'#ffe27a',slow:'#c8a0ff',arrow:'#ffb070'};

/* ================= 狀態 ================= */
let TFX=[],HAZ=[],FIGHT=null,CAM=null,SLOW=0,TOOL_CD=0,HOOK=null;
const ADV={
  savePos(){   // 首領戰、勾爪飛行中：存檔位置改記入口
    if((FIGHT&&!FIGHT.over)||HOOK)return ST.cp&&MAPS[ST.cp.map]?ST.cp:null;
    return null;
  }
};
const has=t=>ST.tools.includes(t);
// 注意：resetState／applySave 會換掉 ST.flags 物件，所以一律現讀 ST.flags，不要先存參照
const fk=(kind,id)=>kind+':'+CURID+':'+id;
const near2=(ax,ay,bx,by)=>Math.hypot(ax-bx,ay-by);
const segDist=(px,py,x,y,a,len)=>{const ux=Math.cos(a),uy=Math.sin(a),t=clamp((px-x)*ux+(py-y)*uy,0,len);return Math.hypot(px-(x+ux*t),py-(y+uy*t))};

/* ================= 音效（借 game.js 的合成器） ================= */
const ASFX={
  boom:()=>{SFX.noise({f:300,f2:60,dur:.5,vol:.18,ft:'lowpass'});SFX.tone(90,{dur:.35,vol:.08,type:'sawtooth',slide:.4})},
  fuse:()=>SFX.noise({f:5000,dur:.05,vol:.02,q:5}),
  whoosh:()=>SFX.noise({f:1400,f2:700,dur:.16,vol:.04,q:2}),
  clank:()=>{SFX.tone(1600,{dur:.05,vol:.04,type:'square'});SFX.tone(1100,{dur:.08,vol:.03,type:'square',delay:.03})},
  chain:()=>SFX.noise({f:3500,f2:2000,dur:.18,vol:.04,q:6}),
  flame:()=>SFX.noise({f:700,f2:300,dur:.3,vol:.08,q:.7}),
  lit:()=>{SFX.noise({f:600,f2:2000,dur:.35,vol:.07});SFX.tone(523,{dur:.2,vol:.03,delay:.1})},
  door:()=>{SFX.noise({f:200,dur:.8,vol:.12,ft:'lowpass'});[392,523,659,784].forEach((f,i)=>SFX.tone(f,{dur:.18,vol:.04,delay:.3+i*.1}))},
  push:()=>SFX.noise({f:260,f2:180,dur:.25,vol:.08,ft:'lowpass'}),
  roar:()=>{SFX.tone(110,{dur:.6,vol:.09,type:'sawtooth',slide:.6});SFX.noise({f:400,f2:150,dur:.6,vol:.1})},
  warn:()=>SFX.tone(880,{dur:.07,vol:.025,type:'square'}),
  burst:()=>SFX.noise({f:900,f2:300,dur:.22,vol:.08}),
  splash:()=>SFX.noise({f:1800,f2:600,dur:.3,vol:.08,q:.8}),
  zap:()=>{SFX.tone(1320,{dur:.12,vol:.03,slide:.5});SFX.tone(660,{dur:.15,vol:.03,delay:.05})},
  fanfare:()=>[523,659,784,1047,784,1047,1319].forEach((f,i)=>SFX.tone(f,{dur:.22,vol:.05,delay:i*.13})),
  get:()=>[659,784,988,1319].forEach((f,i)=>SFX.tone(f,{dur:.18,vol:.05,delay:i*.1}))
};

// 先試真實音效檔（SND 在 game.js），沒有才用上面的合成音
sndWrap(ASFX,Object.keys(ASFX));

/* ================= 動態加物件（裂牆後的寶箱、石塊獎勵寶箱）與碰撞體索引 ================= */
function colCells(col){const cx=col.r!=null?col.x:(col.x0+col.x1)/2,cy=col.r!=null?col.y:(col.y0+col.y1)/2,ext=col.r!=null?col.r:Math.max(col.x1-col.x0,col.y1-col.y0)/2,out=[];
  for(let j=Math.floor((cy-ext)/2);j<=Math.floor((cy+ext)/2);j++)for(let i=Math.floor((cx-ext)/2);i<=Math.floor((cx+ext)/2);i++)out.push(i+','+j);return out}
function colAdd(c,col){for(const k of colCells(col)){const a=c.cols.get(k)||c.cols.set(k,[]).get(k);if(!a.includes(col))a.push(col)}}
function colDel(c,col){for(const [k,a] of c.cols){const i=a.indexOf(col);if(i>=0)a.splice(i,1)}}
function addChest(c,o){   // 回傳寶箱物件；已經有了就不重複加
  let p=c.props.find(q=>q.k==='chest'&&q.id===o.id);
  if(!p){p=makeProp('chest',o.x,o.y,1,false);p.id=o.id;p.loot=o.loot;c.props.push(p);c.props.sort((a,b)=>a.sy-b.sy);colAdd(c,p.col)}
  if(c===C&&!INTER.includes(p)){p.open=!!ST.chests[p.id];p.label='開啟';p.act=()=>openChest(p);INTER.push(p)}
  return p;
}

/* ================= 裂牆：炸開後在牆裡挖出小洞 ================= */
function crackRect(k){const L=k.len||2.4,W=k.w||2,h=W/2;
  switch(k.dir){case 'e':return {x0:k.x-.4,y0:k.y-h,x1:k.x+L,y1:k.y+h,cx:k.x+L-.8,cy:k.y+.35};
    case 'w':return {x0:k.x-L,y0:k.y-h,x1:k.x+.4,y1:k.y+h,cx:k.x-L+.8,cy:k.y+.35};
    case 'n':return {x0:k.x-h,y0:k.y-L,x1:k.x+h,y1:k.y+.4,cx:k.x,cy:k.y-L+1.1};
    default:return {x0:k.x-h,y0:k.y-.4,x1:k.x+h,y1:k.y+L,cx:k.x,cy:k.y+L-.4}}}
function carve(c,k){
  c._carved=c._carved||{};if(c._carved[k.id])return;c._carved[k.id]=1;
  const r=crackRect(k),rad=.45;
  for(let y=Math.floor(r.y0*MASK_RES);y<Math.ceil(r.y1*MASK_RES);y++)for(let x=Math.floor(r.x0*MASK_RES);x<Math.ceil(r.x1*MASK_RES);x++){
    if(x<0||y<0||x>=c.mw||y>=c.mh)continue;const px=(x+.5)/MASK_RES,py=(y+.5)/MASK_RES;
    const qx=clamp(px,r.x0+rad,r.x1-rad),qy=clamp(py,r.y0+rad,r.y1-rad);if(Math.hypot(px-qx,py-qy)>rad)continue;   // 圓角
    c.walk[y*c.mw+x]=1;c.wet[y*c.mw+x]=0;
  }
  if(k.chest)addChest(c,{id:k.chest.id,x:r.cx,y:r.cy,loot:k.chest.loot});
}
function openCrack(k){
  if(ST.flags[fk('ck',k.id)])return;ST.flags[fk('ck',k.id)]=1;carve(C,k);
  const r=crackRect(k);for(let i=0;i<14;i++)FX.push({k:'p',x:rand(r.x0,r.x1),y:rand(r.y0,r.y1),z:.4,vx:rand(-2,2),vy:rand(-1,1),vz:rand(2,4),g:14,life:rand(.5,.8),max:.8,col:i%2?'#7a7468':'#4a443a',sz:rand(.08,.16),sq:1});
  toast(TEXT.crack);ASFX.door();save();
}

/* ================= 每張圖進場：照存檔還原機關，產生首領 ================= */
EVT.on('enter',id=>{
  TFX=[];HAZ=[];FIGHT=null;CAM=null;SLOW=0;HOOK=null;TOOL_CD=0;bossBar(null);
  if(PS.act==='tool')PS.act='';
  const M=C.M;
  for(const p of C.props){
    if(p.k==='brazier')p.lit=!!(M.braziers.find(b=>b.id===p.id)||{}).lit||!!ST.flags[fk('br',p.id)];
    else if(p.k==='lock'){const i=C.locks.indexOf(p.lock),open=!!ST.flags[fk('lk',i)];p.lock.open=open;p.col.off=open}
    else if(p.k==='altar'){const rw=ALTAR_REWARD[p.id];p.awake=!!(rw&&ST.flags['bs:'+rw.boss]);p.taken=!!ST.flags['al:'+p.id]}
  }
  (M.cracks||[]).forEach(k=>{if(ST.flags[fk('ck',k.id)])carve(C,k)});
  // 石塊：還原位置（存檔裡沒有就回到起點）
  C.props.filter(p=>p.k==='block').forEach((p,i)=>{const b=M.blocks[i];p.bi=i;const s=ST.flags[fk('bk',i)]||[b.x,b.y];placeBlock(p,s[0],s[1])});
  if(M.blockReward&&(blocksSolved()||ST.flags[fk('bk','done')]))addChest(C,M.blockReward);
  // 首領：沒打倒就放回場地中央（沉睡，走進場地才醒）
  if(M.boss&&!ST.flags['bs:'+M.boss.id]&&BOSS_DEF[M.boss.id])ENEMIES.push(makeBoss(M.boss));
});
EVT.on('death',()=>{HOOK=null;SLOW=0;HAZ=[];if(PS.act==='tool')PS.act=''});

/* ================= 火盆 ================= */
function lightBrazier(p){
  if(p.lit)return false;p.lit=true;ST.flags[fk('br',p.id)]=1;ASFX.lit();sparks(p.x,p.y-.7,'#ffcf80',12,2.2,.8);
  const all=C.props.filter(q=>q.k==='brazier'),n=all.filter(q=>q.lit).length;
  if(n<all.length)toast(`點亮了火盆（${n}/${all.length}）`);
  save();return true;
}
function tryLight(p){if(has('lantern')){useLanternAt(p.x,p.y);lightBrazier(p)}else toast(TEXT.needFire)}

/* ================= 鎖 ================= */
async function openLock(p,msg,cam){
  const l=p.lock,i=C.locks.indexOf(l);if(l.open)return;
  l.open=true;p.col.off=true;ST.flags[fk('lk',i)]=1;save();
  if(cam&&!lock){   // 鏡頭看過去：鎖住輸入一下
    lock=true;CAM={x:l.x+l.w/2,y:l.y+l.h/2};await sleep(450);ASFX.door();sparks(l.x+l.w/2,l.y,'#ffe9a0',16,3,1.2);toast(msg);await sleep(950);CAM=null;lock=false;
  }else{ASFX.door();toast(msg)}
}
function lockTick(){
  const brz=C.props.filter(q=>q.k==='brazier'),lit=brz.filter(q=>q.lit).length;
  for(const p of C.props){if(p.k!=='lock'||p.lock.open)continue;const l=p.lock,d=rectDist(l,P.x,P.y);
    if(/^brazier\d+$/.test(l.need)){l.fill=lit;if(brz.length&&lit>=brz.length)openLock(p,TEXT.brazierDoor,true)}
    else if(l.need==='key'){if(d<1.0&&ST.keys>0){ST.keys--;openLock(p,TEXT.keyDoor,false);hud(true)}}
    else if(l.need==='relic3'){l.fill=ST.relics.length;if(d<2.4&&ST.relics.length>=3)openLock(p,TEXT.relicDoor,true)}
  }
}

/* ================= 可推石塊（沿固定直線來回推，推到壓板就解開） ================= */
// 石塊的碰撞體換成方形（圓形碰撞體會讓玩家自動繞開、推不到）；bx,by＝實際位置（腳底），x,y＝畫的位置（推動時補間）
function placeBlock(p,x,y){colDel(C,p.col);p.bx=x;p.by=y;p.x=x;p.y=y;p.sy=y;p.mv=null;p.col={x0:x-.47,y0:y-.9,x1:x+.47,y1:y-.02};colAdd(C,p.col);C.props.sort((a,b)=>a.sy-b.sy)}
const blocksSolved=()=>{const bl=C.M.blocks||[];return bl.length>0&&bl.every((b,i)=>{const s=ST.flags[fk('bk',i)];return b.tx!=null&&s&&Math.abs(s[0]-b.tx)<.05&&Math.abs(s[1]-b.ty)<.05})};
let pushT=0,pushP=null;
function blockTick(dt){
  for(const p of C.props)if(p.k==='block'&&p.mv){const m=p.mv;m.t+=dt;const k=Math.min(1,m.t/.28);p.x=m.fx+(m.tx-m.fx)*k;p.y=m.fy+(m.ty-m.fy)*k;p.sy=p.y;if(k>=1){p.mv=null;C.props.sort((a,b)=>a.sy-b.sy)}}
  let ix=(keys.ArrowRight||keys.d?1:0)-(keys.ArrowLeft||keys.a?1:0)+joy.x,iy=(keys.ArrowDown||keys.s?1:0)-(keys.ArrowUp||keys.w?1:0)+joy.y;
  const ax=Math.abs(ix)>.5&&Math.abs(iy)<.35?Math.sign(ix):0,ay=Math.abs(iy)>.5&&Math.abs(ix)<.35?Math.sign(iy):0;
  let target=null;
  if((ax||ay)&&PS.act===''){
    for(const p of C.props){if(p.k!=='block'||p.mv)continue;const b=C.M.blocks[p.bi];if(!b||b.tx==null)continue;
      const dx=p.bx-P.x,dy=p.by-.46-P.y;
      if(ax&&Math.sign(dx)===ax&&Math.abs(dy)<.55&&Math.abs(dx)<.47+PLAYER_R+.15)target=p;
      if(ay&&Math.sign(dy)===ay&&Math.abs(dx)<.55&&Math.abs(dy)<.44+PLAYER_R+.15)target=p}
  }
  if(target!==pushP){pushP=target;pushT=0}
  if(!target)return;
  pushT+=dt;if(pushT<.35)return;pushT=0;
  const b=C.M.blocks[target.bi],nx=+(target.bx+ax).toFixed(2),ny=+(target.by+ay).toFixed(2);
  const lo=(s,t)=>Math.min(s,t)-.01,hi=(s,t)=>Math.max(s,t)+.01;
  if(nx<lo(b.x,b.tx)||nx>hi(b.x,b.tx)||ny<lo(b.y,b.ty)||ny>hi(b.y,b.ty))return;   // 只能沿軌道
  if(ax&&b.x===b.tx||ay&&b.y===b.ty)return;
  // 目的地要空：可走遮罩＋不壓到其他碰撞體
  const ccx=nx,ccy=ny-.45,r=.44;
  for(let k=0;k<16;k++){const a=k/16*Math.PI*2;if(!walkAt(C,ccx+Math.cos(a)*r,ccy+Math.sin(a)*r))return}
  for(const col of colsNear(ccx,ccy))if(col!==target.col&&!col.off&&colHit(col,ccx,ccy,r))return;
  if(Math.hypot(P.x-ccx,P.y-ccy)<r+PLAYER_R-.05)return;
  const fx=target.x,fy=target.y;placeBlock(target,nx,ny);target.x=fx;target.y=fy;target.sy=fy;target.mv={fx,fy,tx:nx,ty:ny,t:0};
  ST.flags[fk('bk',target.bi)]=[nx,ny];ASFX.push();
  if(blocksSolved()&&C.M.blockReward&&!ST.flags[fk('bk','done')]){ST.flags[fk('bk','done')]=1;const rw=C.M.blockReward;setTimeout(()=>{if(C.M.blockReward!==rw)return;addChest(C,rw);sparks(rw.x,rw.y-.4,'#ffe9a0',14,2.5,.8);ASFX.get();toast(TEXT.blocks)},300)}
  save();
}

/* ================= 道具 ================= */
function toolReady(){return !(PS.dead||lock||dlgOpen||worldOpen||PS.kbt>0||PS.stop>0||(PS.act!==''&&PS.act!=='charge'))}
function inputDir(){let ix=(keys.ArrowRight||keys.d?1:0)-(keys.ArrowLeft||keys.a?1:0)+joy.x,iy=(keys.ArrowDown||keys.s?1:0)-(keys.ArrowUp||keys.w?1:0)+joy.y;const l=Math.hypot(ix,iy);return l>.3?[ix/l,iy/l]:faceVec()}
function useTool(id){
  id=id||ST.tool;if(!id||!has(id)||!toolReady()||TOOL_CD>0)return false;
  if(PS.act==='charge'){PS.act='';PS.charge=0;PS.charged=false}
  switch(id){
    case 'boomerang':{if(TFX.some(t=>t.k==='boomerang'))return false;const [dx,dy]=inputDir(),T=TOOLS.boomerang;
      TFX.push({k:'boomerang',x:P.x+dx*.3,y:P.y+dy*.3,vx:dx*T.spd,vy:dy*T.spd,t:0,ret:false,hit:new Set(),carry:[]});ASFX.whoosh();TOOL_CD=.15;return true}
    case 'bomb':{if(ST.bombs<=0){toast(TEXT.noBomb);return false}if(TFX.filter(t=>t.k==='bomb').length>=TOOLS.bomb.maxOut)return false;
      const [fx,fy]=faceVec();let bx=P.x+fx*.55,by=P.y+fy*.55;if(!walkAt(C,bx,by)){bx=P.x;by=P.y}
      ST.bombs--;TFX.push({k:'bomb',x:bx,y:by,t:0});ASFX.fuse();TOOL_CD=.3;hud(true);return true}
    case 'lantern':{const [fx,fy]=faceVec();useLanternAt(P.x+fx*TOOLS.lantern.reach,P.y+fy*TOOLS.lantern.reach);TOOL_CD=TOOLS.lantern.cd;return true}
    case 'hookshot':return fireHook();
  }
  return false;
}
function useLanternAt(x,y){
  const T=TOOLS.lantern;ASFX.flame();
  for(let i=0;i<14;i++){const a=Math.random()*Math.PI*2,s=rand(.6,1.8);FX.push({k:'p',x:x+Math.cos(a)*.15,y:y+Math.sin(a)*.1,z:.5,vx:Math.cos(a)*s,vy:Math.sin(a)*s*.5,vz:rand(1.5,3),g:-1,life:rand(.3,.5),max:.5,col:i%3?'#ffb040':'#fff0a0',sz:rand(.08,.14),soft:1})}
  for(const e of ENEMIES){if(e.dead||Math.hypot(e.x-x,e.y-y)>T.r+e.r)continue;damageEnemy(e,e.boss?T.bossDmg:T.dmg,P.x,P.y)}
  for(const p of C.props)if(p.k==='brazier'&&!p.lit&&(Math.hypot(p.x-x,p.y-.2-y)<1.5||Math.hypot(p.x-P.x,p.y-.2-P.y)<1.4))lightBrazier(p);
}
function cycleTool(d){if(!ST.tools.length)return;const own=TOOL_ORDER.filter(has),i=own.indexOf(ST.tool);ST.tool=own[((i<0?0:i)+d+own.length)%own.length];ASFX.clank();hud(true)}
function selectTool(n){const id=TOOL_ORDER[n];if(id&&has(id)){ST.tool=id;ASFX.clank();hud(true)}}

// 迴力鏢、炸彈、勾爪的每幀更新
function blockedAt(x,y){return (!walkAt(C,x,y)&&!wetAt(C,x,y))||colsNear(x,y).some(c=>colHit(c,x,y,.04))}
function tfxTick(t,dt){
  if(t.k==='boomerang'){
    const T=TOOLS.boomerang;t.t+=dt;
    if(!t.ret){const n=Math.max(1,Math.ceil(Math.hypot(t.vx,t.vy)*dt/.1));for(let i=0;i<n;i++){t.x+=t.vx*dt/n;t.y+=t.vy*dt/n;if(blockedAt(t.x,t.y)){t.ret=true;ASFX.clank();sparks(t.x,t.y,'#fff',4,2,.5);break}}if(t.t>=T.out)t.ret=true}
    else{const dx=P.x-t.x,dy=P.y-t.y,d=Math.hypot(dx,dy);if(d<.45||t.t>4){for(const o of t.carry){o.x=P.x;o.y=P.y;o.t=Math.max(o.t,.3)}return false}const s=Math.min(d,T.back*dt);t.x+=dx/d*s;t.y+=dy/d*s}
    for(const e of ENEMIES){if(e.dead||t.hit.has(e)||Math.hypot(e.x-t.x,e.y-t.y)>e.r+T.r)continue;t.hit.add(e);t.ret=true;
      if(e.boss){if(!e.immune){if(e.onBoomerang)e.onBoomerang();damageEnemy(e,T.bossDmg+eqStat('boomAdd'),t.x,t.y)}else ASFX.clank()}
      else{damageEnemy(e,T.dmg+eqStat('boomAdd'),t.x,t.y);if(!e.dead){e.stun=T.stun;e.kbt=0}}}
    for(const p of INTER)if(p.k==='pot'&&!p.gone&&Math.hypot(p.x-t.x,p.y-.2-t.y)<.45)breakPot(p);
    for(const o of DROPS)if(!t.carry.includes(o)&&Math.hypot(o.x-t.x,o.y-t.y)<.55){t.carry.push(o);t.ret=true}
    for(const o of t.carry){o.x=t.x;o.y=t.y;o.z=0;o.vz=0;o.vx=o.vy=0;o.t=Math.min(o.t,DROP.life-4)}
    if(Math.floor(t.t*8)!==Math.floor((t.t-dt)*8))ASFX.whoosh();
    return true;
  }
  if(t.k==='bomb'){
    t.t+=dt;if(Math.floor(t.t*6)!==Math.floor((t.t-dt)*6))ASFX.fuse();
    if(t.t>=TOOLS.bomb.fuse){explode(t.x,t.y);return false}
    return true;
  }
  return false;
}
function explode(x,y){
  const T=TOOLS.bomb;ASFX.boom();
  FX.push({k:'ring',x,y,r:T.r*.7,col:'#ffd28a',life:.35,max:.35});
  for(let i=0;i<26;i++){const a=Math.random()*Math.PI*2,s=rand(1.5,5);FX.push({k:'p',x,y,z:.3,vx:Math.cos(a)*s,vy:Math.sin(a)*s*.6,vz:rand(1,4),life:rand(.3,.6),max:.6,col:i%3?'#ff9a3a':'#fff0a0',sz:rand(.08,.16),soft:i%2})}
  for(let i=0;i<10;i++){const a=Math.random()*Math.PI*2;FX.push({k:'p',x:x+Math.cos(a)*.5,y:y+Math.sin(a)*.3,z:.4,vx:Math.cos(a)*.8,vy:Math.sin(a)*.4,vz:1,g:0,life:.9,max:.9,col:'#6a6470',sz:.28,soft:1})}
  for(const e of ENEMIES){if(e.dead||Math.hypot(e.x-x,e.y-y)>T.r+e.r)continue;damageEnemy(e,e.boss?T.bossDmg:T.dmg,x,y)}
  for(const p of INTER)if(p.k==='pot'&&!p.gone&&Math.hypot(p.x-x,p.y-y)<T.r)breakPot(p);
  if(Math.hypot(P.x-x,P.y-y)<T.r*.85)hurtPlayer(T.self,x,y,{unblock:true});
  for(const k of C.M.cracks||[])if(!ST.flags[fk('ck',k.id)]&&Math.hypot(k.x-x,k.y-y)<T.r+.7)openCrack(k);
}
// 勾爪：面向的直線上找木樁 → 飛出去 → 勾到就把玩家拉過去
function hookTarget(dx,dy){
  const T=TOOLS.hookshot;let best=null;
  for(const p of C.props){if(p.k!=='hook')continue;const rx=p.x-P.x,ry=p.y-P.y,proj=rx*dx+ry*dy,side=Math.abs(rx*dy-ry*dx);
    if(proj<T.minD||proj>T.range||side>T.side)continue;if(!best||proj<best.proj)best={p,proj}}
  return best;
}
function hookLanding(p,dx,dy){
  for(const d of [.55,.75,.95,1.2]){const x=p.x-dx*d,y=p.y-dy*d;if(circleFree(x,y,PLAYER_R))return [x,y]}
  let best=null;const px=p.x-dx*.7,py=p.y-dy*.7;
  for(let rr=.45;rr<=1.7;rr+=.15)for(let a=0;a<20;a++){const x=p.x+Math.cos(a/20*Math.PI*2)*rr,y=p.y+Math.sin(a/20*Math.PI*2)*rr;if(!circleFree(x,y,PLAYER_R))continue;const s=Math.hypot(x-px,y-py);if(!best||s<best[2])best=[x,y,s]}
  return best?[best[0],best[1]]:null;
}
function fireHook(){
  if(HOOK)return false;const [dx,dy]=faceVec(),T=TOOLS.hookshot;
  const tg=hookTarget(dx,dy);let max=tg?tg.proj:T.range,land=null,post=null;
  if(tg){land=hookLanding(tg.p,dx,dy);if(!land||(FIGHT&&!FIGHT.over&&Math.hypot(land[0]-FIGHT.cx,land[1]-FIGHT.cy)+PLAYER_R>FIGHT.R))land=null;else post=tg.p}
  // 路上的牆、碰撞體會擋住（水面、熔岩不擋）。有目標時沿「玩家→木樁」這條線檢查（木樁可能稍微偏離面向）
  if(post){const L=Math.hypot(post.x-P.x,post.y-P.y),ux=(post.x-P.x)/L,uy=(post.y-P.y)/L;
    for(let s=.3;s<L-.35;s+=.1)if(blockedAt(P.x+ux*s,P.y+uy*s)){max=s;post=null;land=null;break}}
  else for(let s=.3;s<max;s+=.1)if(blockedAt(P.x+dx*s,P.y+dy*s)){max=s;break}
  HOOK={dx,dy,len:0,max,post,land,phase:'out',hit:null};PS.act='tool';ASFX.chain();return true;
}
function hookPlayer(dt){   // 回傳 true＝這幀由勾爪控制玩家
  const H=HOOK,T=TOOLS.hookshot;if(!H)return false;
  if(H.phase==='out'){H.len+=T.spd*dt;
    const hx=P.x+H.dx*H.len,hy=P.y+H.dy*H.len;
    for(const e of ENEMIES){if(e.dead||H.hit||Math.hypot(e.x-hx,e.y-hy)>e.r+.2)continue;H.hit=e;
      if(e.boss){if(!e.immune)damageEnemy(e,T.dmg,P.x,P.y)}else{damageEnemy(e,T.dmg,P.x,P.y);if(!e.dead){e.stun=T.stun;e.kbt=0}}H.phase='back';H.post=null}
    if(H.phase==='out'&&H.len>=H.max){H.len=H.max;if(H.post){H.phase='pull';ASFX.clank();sparks(H.post.x,H.post.y-.95,'#fff',5,2,.3)}else{H.phase='back';ASFX.clank()}}
  }else if(H.phase==='back'){H.len-=T.spd*1.2*dt;if(H.len<=0){HOOK=null;if(PS.act==='tool')PS.act=''}}
  else if(H.phase==='pull'){
    const [lx,ly]=H.land,dx=lx-P.x,dy=ly-P.y,d=Math.hypot(dx,dy),s=T.pull*dt;PS.inv=Math.max(PS.inv,.15);PS.blink=false;
    if(d<=s){P.x=lx;P.y=ly;HOOK=null;if(PS.act==='tool')PS.act='';ASFX.push()}else{P.x+=dx/d*s;P.y+=dy/d*s;P.anim+=dt*3}
    if(HOOK)H.len=Math.hypot(H.post.x-P.x,H.post.y-P.y);
  }
  return true;
}

/* ================= 首領：通用框架 ================= */
function makeBoss(b){
  const D=Object.assign({id:b.id,mass:60,gold:[20,30],heart:1},BOSS_DEF[b.id]);
  const e={id:++EID,k:'boss',boss:true,D,x:b.x,y:b.y,hx:b.x,hy:b.y,r:D.r,hp:D.hp,max:D.hp,atk:D.atk,spd:D.spd,gold:1,skin:null,
    fa:Math.PI/2,fx:0,fy:1,mode:'boss',st:'sleep',t:0,cd:1,anim:Math.random()*3,flash:0,blockT:0,kbx:0,kby:0,kbt:0,z:0,dead:false,dieT:0,dieMax:1.8,
    phase:1,mi:0,mv:'',mt:0,ms:0,immune:true,alpha:1,seen:{},fastT:0,dizzy:0,surf:0,arena:b.arena||4.4};
  e.tick=bossTick;e.draw=drawBoss;
  e.hitAcc=0;e.onHit=()=>{e.hitAcc++;return true};   // 連續挨打計數：到 counterN 就震開（不讓玩家一直貼著砍）
  e.onBoomerang=()=>{if(e.mv==='dive'&&e.ms===3){e.mt=Math.min(e.mt,.2);e.dizzy=1.2;toast('迴力鏢擊中了利維坦！牠暫時動不了了。')}};
  return e;
}
function arenaClamp(e,x,y){const dx=x-FIGHT.cx,dy=y-FIGHT.cy,d=Math.hypot(dx,dy),R=FIGHT.R-e.r*.7;if(d>R){x=FIGHT.cx+dx/d*R;y=FIGHT.cy+dy/d*R}return [x,y]}
function bossMove(e,dx,dy){if(!FIGHT)return;let [x,y]=arenaClamp(e,e.x+dx,e.y+dy);if(walkAt(C,x,y)){e.x=x;e.y=y;return true}if(walkAt(C,x,e.y)){e.x=x;return true}if(walkAt(C,e.x,y)){e.y=y;return true}return false}
function arenaPoint(minFromP,maxR){for(let k=0;k<40;k++){const a=Math.random()*Math.PI*2,r=Math.sqrt(Math.random())*(maxR||FIGHT.R-1),x=FIGHT.cx+Math.cos(a)*r,y=FIGHT.cy+Math.sin(a)*r;if(walkAt(C,x,y)&&Math.hypot(x-P.x,y-P.y)>=(minFromP||0))return [x,y]}return [FIGHT.cx,FIGHT.cy]}
const W=e=>Math.max(.6,(e.D.warn[e.phase-1]||1)*(e.fastT>0?.85:1));   // 預兆時間倍率
function hz(o){const h=Object.assign({t:0,hit:false},o);HAZ.push(h);return h}
async function startFight(e,instant){
  const b=C.M.boss;FIGHT={cx:b.x,cy:b.y,R:b.arena||4.4,e,over:false};
  // 玩家要在結界內
  const dx=P.x-FIGHT.cx,dy=P.y-FIGHT.cy,d=Math.hypot(dx,dy),mx=FIGHT.R-PLAYER_R-.15;if(d>mx){P.x=FIGHT.cx+dx/d*mx;P.y=FIGHT.cy+dy/d*mx}
  bossBar(e);e.st='intro';ASFX.roar();
  if(!instant){lock=true;CAM={x:e.x,y:e.y-1};toast(TEXT.bossIntro[e.D.id]||'');await sleep(1300);CAM=null;lock=false}
  if(e.dead||!FIGHT||FIGHT.e!==e)return;
  e.st='idle';e.immune=false;e.cd=.7;
}
function bossBar(e){
  const el=document.getElementById('bossBar');if(!el)return;
  if(!e){el.classList.remove('on','p2');el._k='';return}
  el.classList.add('on');el.classList.toggle('p2',e.phase===2);
  const k=e.D.id+'|'+e.hp+'|'+e.phase;if(el._k===k)return;el._k=k;
  const nm=document.getElementById('bossName');if(nm._id!==e.D.id){nm._id=e.D.id;nm.innerHTML='';const s=document.createElement('small');s.textContent=e.D.title;nm.append(s,e.D.name)}
  el.querySelector('#bossHp b').style.width=(Math.max(0,e.hp)/e.max*100).toFixed(1)+'%';
}
function bossTick(e,dt){
  const D=e.D;e.anim+=dt;if(e.flash>0)e.flash-=dt;e.kbt=0;
  if(e.st==='sleep'){e.immune=true;
    if(!PS.dead&&!lock&&Math.hypot(P.x-e.hx,P.y-e.hy)<e.arena-BOSS_ARENA_IN)startFight(e,false);
    return}
  if(e.st==='intro'||!FIGHT)return;
  bossBar(e);
  if(e.fastT>0)e.fastT-=dt;
  if(e.dizzy>0){e.dizzy-=dt;return}
  const sp=e.fastT>0?1.6:1;
  // 第二階段：半血
  if(e.phase===1&&e.hp<=e.max/2&&e.st!=='roar'&&(e.st==='idle'||e.mv!=='dive')){e.st='roar';e.t=1.1;e.immune=true;e.mv='';e.alpha=1;ASFX.roar();toast(TEXT.bossRage[D.id]||'');HAZ=HAZ.filter(h=>h.k==='puddle');e.seenP2=true}
  if(e.st==='roar'){e.t-=dt;if(e.t<=0){e.phase=2;e.st='idle';e.immune=false;e.mi=0;e.cd=.5;bossBar(e)}return}
  const dx=P.x-e.x,dy=P.y-e.y,d=Math.hypot(dx,dy)||1;
  if(e.st==='idle'){
    e.cd-=dt*sp;
    // 走位
    if(D.id==='boss_forest'&&d>2.2)bossMove(e,dx/d*e.spd*dt,dy/d*e.spd*dt);
    else if(D.id==='boss_fire'&&d>1.8)bossMove(e,dx/d*e.spd*dt*sp,dy/d*e.spd*dt*sp);
    else if(D.id==='boss_water'){const a=e.anim*.7;bossMove(e,Math.cos(a)*e.spd*dt,Math.sin(a*1.3)*e.spd*.6*dt)}
    else if(D.id==='boss_temple'){const want=d<2.6?-1:d>3.6?1:0;bossMove(e,(dx/d*want-dy/d*.5)*e.spd*sp*dt,(dy/d*want+dx/d*.5)*e.spd*sp*dt)}
    if(e.hitAcc>0)e.hitAcc=Math.max(0,e.hitAcc-dt*BOSS_HIT_DECAY);
    if(D.counterN&&e.hitAcc>=D.counterN[e.phase-1]){e.hitAcc=0;e.mv='quake';e.mt=0;e.ms=0;e.st='move';e.seen.quake=(e.seen.quake||0)+1}
    else if(e.cd<=0){const list=e.phase===1?D.moves1:D.moves2;e.mv=list[e.mi%list.length];e.mi++;e.mt=0;e.ms=0;e.st='move';e.seen[e.mv]=(e.seen[e.mv]||0)+1;if(e.phase===2)e.seen['p2:'+e.mv]=1;MOVES[e.mv].start&&MOVES[e.mv].start(e)}
  }else if(e.st==='move'){
    e.mt+=dt*sp;
    if(MOVES[e.mv].tick(e,dt*sp,dx/d,dy/d,d)){e.st='idle';e.mv='';e.cd=D.cd[e.phase-1];e.immune=false;e.alpha=1}
  }
  // 碰撞：推開玩家＋碰撞傷害（潛入、瞬移中不算）
  if(!e.immune&&!e.under&&!PS.dead){const m=e.r+PLAYER_R;if(d<m){const k=(m-d)+.02;moveBy(dx/d*k,dy/d*k);hurtPlayer(D.touch,e.x,e.y)}}
}
function minions(){return ENEMIES.filter(x=>x.minion&&!x.dead)}

/* ===== 招式：start(e) 開始；tick(e,dt,ux,uy,d) 回傳 true＝結束 ===== */
const MOVES={
  // 共通：震開——被連續砍到 counterN 下後，身邊一圈爆開（預兆短，貼太緊會吃到）
  quake:{tick(e){
    const wt=e.D.counterWarn*W(e);
    if(e.ms===0){e.ms=1;hz({k:'circle',x:e.x,y:e.y,r:e.D.counterR,warn:wt,act:.25,dmg:e.atk,style:e.D.counterStyle||'slam',follow:e});ASFX.warn()}
    if(e.ms===1&&e.mt>=wt){e.ms=2;ASFX.boom()}
    return e.mt>wt+.55}},
  // 林：藤蔓突刺——朝玩家扇形冒出幾條藤蔓（地上先出現虛線警示）
  vines:{tick(e,dt,ux,uy){
    if(e.ms===0&&e.mt>=.35){e.ms=1;const n=e.phase===1?3:5,base=Math.atan2(uy,ux),st=e.D.id==='boss_temple'?'star':'vine';
      for(let i=0;i<n;i++)hz({k:'line',x:e.x,y:e.y-.05,a:base+(i-(n-1)/2)*.42,len:7,w:.7,warn:.85*W(e),act:.42,dmg:e.atk,style:st});ASFX.warn()}
    return e.ms===1&&e.mt>.35+.85*W(e)+.6}},
  // 林：根鬚陷阱——玩家腳下與周圍冒出根刺
  roots:{tick(e){
    if(e.ms===0&&e.mt>=.25){e.ms=1;const n=e.phase===1?3:5;hz({k:'circle',x:P.x,y:P.y,r:.85,warn:.95*W(e),act:.35,dmg:e.atk,style:'root'});
      for(let i=1;i<n;i++){const a=Math.random()*Math.PI*2,r=rand(1.3,2.4);hz({k:'circle',x:P.x+Math.cos(a)*r,y:P.y+Math.sin(a)*r,r:.85,warn:(.95+i*.08)*W(e),act:.35,dmg:e.atk,style:'root'})}ASFX.warn()}
    return e.mt>.25+1.4*W(e)}},
  // 林：召喚史萊姆（場上已經夠多就跳過）
  summon:{start(e){if(minions().length>=(e.phase===1?2:3))e.ms=9},tick(e){
    if(e.ms===9)return true;
    if(e.ms===0&&e.mt>=.8){e.ms=1;for(let i=0;i<2;i++){const [x,y]=arenaPoint(2,FIGHT.R-1),m=makeEnemy('slime',x,y);if(m){m.minion=true;m.atk=1;m.hp=m.max=20;m.mode='chase';m.hx=FIGHT.cx;m.hy=FIGHT.cy;m.cd=1;ENEMIES.push(m);puff(m.x,m.y,'#9cff9c')}}ASFX.zap()}
    return e.mt>1.2}},
  // 林二階：孢子彈（舉盾擋得住）
  spores:{tick(e,dt,ux,uy){
    for(const k of [0,1])if(e.ms===k&&e.mt>=.3+k*.55){e.ms=k+1;const base=Math.atan2(uy,ux);for(let i=0;i<5;i++){const a=base+(i-2)*.3;hz({k:'shot',x:e.x,y:e.y-.1,vx:Math.cos(a)*3.4,vy:Math.sin(a)*3.4,r:.22,dmg:e.atk,life:3.5,style:'spore',block:true})}ASFX.whoosh()}
    return e.mt>1.4}},
  // 焰：熔岩彈——拋向玩家，落點先出現紅圈，落地留下火池
  lava:{tick(e){
    if(e.ms===0&&e.mt>=.45){e.ms=1;const n=e.phase===1?3:5;for(let i=0;i<n;i++){let x=P.x,y=P.y;if(i){const a=Math.random()*Math.PI*2,r=rand(1.2,2.6);x+=Math.cos(a)*r;y+=Math.sin(a)*r}
      hz({k:'lob',x0:e.x,y0:e.y-1.6,x,y,T:(1.0+i*.12)*Math.max(.85,W(e)),r:.85,dmg:e.atk,style:'lava'})}ASFX.whoosh()}
    return e.mt>.45+1.7}},
  // 焰：火線——十字（二階再補一道斜十字）
  cross:{tick(e){
    const wv=e.phase===2?2:1;
    for(let k=0;k<wv;k++)if(e.ms===k&&e.mt>=.3+k*.6){e.ms=k+1;const off=k?Math.PI/4:(Math.random()<.5?0:Math.PI/4);for(let i=0;i<4;i++)hz({k:'line',x:e.x,y:e.y-.05,a:off+i*Math.PI/2,len:7,w:.85,warn:.9*W(e),act:.5,dmg:e.atk,style:'fire'});ASFX.warn()}
    return e.mt>.3+(wv-1)*.6+.9*W(e)+.7}},
  // 焰：震地——蓄力下蹲，周圍一圈爆炸；之後喘一口氣（好打的時機）
  slam:{tick(e){
    if(e.ms===0){e.ms=1;hz({k:'circle',x:e.x,y:e.y,r:2.3,warn:.85*W(e),act:.2,dmg:e.atk,style:'slam',follow:e});ASFX.warn()}
    if(e.ms===1&&e.mt>=.85*W(e)){e.ms=2;ASFX.boom()}
    return e.mt>.85*W(e)+1.1}},
  // 焰二階：衝撞——先畫出衝刺方向，再直線衝過去，撞到牆或結界會暈一下
  charge:{tick(e,dt,ux,uy){
    if(e.ms===0){e.ms=1;e.ca=Math.atan2(uy,ux);hz({k:'line',x:e.x,y:e.y,a:e.ca,len:6,w:1.6,warn:.75*W(e),act:0,dmg:0,style:'arrow'});ASFX.warn()}
    if(e.ms===1&&e.mt>=.75*W(e)){e.ms=2;e.cdist=0}
    if(e.ms===2){const s=8*dt,ok=bossMove(e,Math.cos(e.ca)*s,Math.sin(e.ca)*s);e.cdist+=s;
      if(Math.hypot(P.x-e.x,P.y-e.y)<e.r+PLAYER_R+.1)hurtPlayer(e.atk,e.x,e.y);
      const [cx,cy]=arenaClamp(e,e.x+Math.cos(e.ca)*.2,e.y+Math.sin(e.ca)*.2);if(!ok||e.cdist>7||Math.hypot(cx-e.x-Math.cos(e.ca)*.2,cy-e.y-Math.sin(e.ca)*.2)>.05){e.ms=3;e.mt=0;e.dizzy=1.0;ASFX.boom();sparks(e.x,e.y-.6,'#ffcf80',10,3,.6)}}
    return e.ms===3}},
  // 淵：潛入——沉下去（打不到）、水紋追著玩家，最後在玩家腳下咬上來；浮出後有一段破綻
  dive:{start(e){e.immune=true},tick(e,dt,ux,uy,d){
    if(e.ms===0){e.alpha=Math.max(0,1-e.mt/.5);if(e.mt>=.5){e.ms=1;e.mt=0;e.under=true;ASFX.splash()}}
    else if(e.ms===1){const s=3.2*dt;if(d>.2)bossMove(e,ux*Math.min(s,d),uy*Math.min(s,d));if(e.mt>=1.4){e.ms=2;e.mt=0;e.bx=P.x;e.by=P.y;hz({k:'circle',x:P.x,y:P.y,r:1.05,warn:.8*W(e),act:.3,dmg:e.atk,style:'bite'});ASFX.warn()}}
    else if(e.ms===2){const k=Math.min(1,dt*6);const [bx,by]=arenaClamp(e,e.bx,e.by);e.x+=(bx-e.x)*k;e.y+=(by-e.y)*k;if(e.mt>=.8*W(e)){e.ms=3;e.mt=0;e.under=false;e.immune=false;e.alpha=1;ASFX.splash();sparks(e.x,e.y-.3,'#9fd0ff',14,3,.8)}}
    else if(e.ms===3)return e.mt>=(e.phase===1?1.6:1.2);
    return false}},
  // 淵：水柱——場地上一圈警示圈（二階內外各補一圈）
  pillars:{tick(e){
    const style=e.D.id==='boss_temple'?'star':'water';
    if(e.ms===0&&e.mt>=.3){e.ms=1;const off=Math.random()*Math.PI;for(let i=0;i<6;i++){const a=off+i*Math.PI/3;hz({k:'circle',x:FIGHT.cx+Math.cos(a)*2.6,y:FIGHT.cy+Math.sin(a)*2.6,r:.8,warn:.95*W(e),act:.45,dmg:e.atk,style})}
      hz({k:'circle',x:P.x,y:P.y,r:.8,warn:1.05*W(e),act:.45,dmg:e.atk,style});ASFX.warn()}
    if(e.phase===2&&e.ms===1&&e.mt>=.9){e.ms=2;const off=Math.random()*Math.PI;for(let i=0;i<4;i++){const a=off+i*Math.PI/2;hz({k:'circle',x:FIGHT.cx+Math.cos(a)*1.2,y:FIGHT.cy+Math.sin(a)*1.2,r:.8,warn:.95*W(e),act:.45,dmg:e.atk,style})}
      for(let i=0;i<8;i++){const a=off+i*Math.PI/4+.4;const x=FIGHT.cx+Math.cos(a)*3.7,y=FIGHT.cy+Math.sin(a)*3.7;if(walkAt(C,x,y))hz({k:'circle',x,y,r:.75,warn:.95*W(e),act:.45,dmg:e.atk,style})}ASFX.warn()}
    return e.mt>(e.phase===2?2.5:1.8)}},
  // 淵：水彈（舉盾擋得住）
  spit:{tick(e,dt,ux,uy){
    if(e.ms===0&&e.mt>=.4){e.ms=1;const n=e.phase===1?3:5,base=Math.atan2(uy,ux);for(let i=0;i<n;i++){const a=base+(i-(n-1)/2)*.28;hz({k:'shot',x:e.x,y:e.y-.2,vx:Math.cos(a)*4.6,vy:Math.sin(a)*4.6,r:.24,dmg:e.atk,life:3,style:'water',block:true})}ASFX.splash()}
    return e.mt>1}},
  // 淵二階／最終：連環水柱——一圈接一圈追著玩家
  chain:{tick(e){
    const style=e.D.id==='boss_temple'?'star':'water';
    for(let k=0;k<5;k++)if(e.ms===k&&e.mt>=.25+k*.38){e.ms=k+1;hz({k:'circle',x:P.x,y:P.y,r:.8,warn:.75*W(e),act:.3,dmg:e.atk,style});ASFX.warn()}
    return e.mt>.25+4*.38+1.2}},
  // 最終：星彈環（舉盾擋得住；二階兩圈）
  orbs:{tick(e){
    const wv=e.phase===2?2:1,n=e.phase===2?14:10;
    for(let k=0;k<wv;k++)if(e.ms===k&&e.mt>=.45+k*.6){e.ms=k+1;const off=k*Math.PI/n;for(let i=0;i<n;i++){const a=off+i/n*Math.PI*2;hz({k:'shot',x:e.x,y:e.y-.3,vx:Math.cos(a)*3,vy:Math.sin(a)*3,r:.22,dmg:e.atk,life:3.2,style:'star',block:true})}ASFX.zap()}
    return e.mt>.45+(wv-1)*.6+.8}},
  // 最終：瞬移
  blink:{start(e){e.immune=true},tick(e){
    if(e.ms===0){e.alpha=Math.max(0,1-e.mt/.35);if(e.mt>=.35){e.ms=1;const [x,y]=arenaPoint(2.6,FIGHT.R-1.2);e.x=x;e.y=y;ASFX.zap()}}
    else{e.alpha=Math.min(1,(e.mt-.35)/.35);if(e.mt>=.7){e.immune=false;e.alpha=1;return true}}
    return false}},
  // 最終二階：變速——星輪加速（招式間隔變短、走得更快），同時在玩家腳下張開遲緩區
  shift:{tick(e){
    if(e.ms===0&&e.mt>=.6){e.ms=1;e.fastT=5;hz({k:'zone',x:P.x,y:P.y,r:1.8,warn:.9,act:2.6,style:'slow'});ASFX.zap();toast('星輪轉得更快了！')}
    return e.mt>1}}
};

/* ===== 招式實體（警示圈、直線、飛彈、拋物熔岩、火池、遲緩區） ===== */
function hazTick(h,dt){
  h.t+=dt;
  const inR=(x,y,r)=>Math.hypot(P.x-x,P.y-y)<r+PLAYER_R*.5;
  switch(h.k){
    case 'circle':
      if(h.follow&&h.t<h.warn){h.x=h.follow.x;h.y=h.follow.y}
      if(h.t>=h.warn&&!h.fired){h.fired=1;if(h.style==='water')ASFX.splash();else if(h.style!=='slam')ASFX.burst();sparks(h.x,h.y-.2,HZ_COL[h.style]||'#fff',8,3,.6)}
      if(h.t>=h.warn&&h.t<h.warn+h.act&&!h.hit&&h.dmg&&inR(h.x,h.y,h.r)){h.hit=true;hurtPlayer(h.dmg,h.x,h.y,{unblock:true})}
      return h.t<h.warn+h.act+.15;
    case 'line':
      if(h.t>=h.warn&&!h.fired){h.fired=1;if(h.act)ASFX.burst()}
      if(h.t>=h.warn&&h.t<h.warn+h.act&&!h.hit&&h.dmg&&segDist(P.x,P.y,h.x,h.y,h.a,h.len)<h.w/2+PLAYER_R*.5){h.hit=true;hurtPlayer(h.dmg,h.x,h.y,{unblock:true})}
      return h.t<h.warn+h.act+.15;
    case 'shot':{
      h.x+=h.vx*dt;h.y+=h.vy*dt;h.life-=dt;
      if(h.life<=0||(!walkAt(C,h.x,h.y)&&!wetAt(C,h.x,h.y)))return false;
      if(inR(h.x,h.y,h.r)){const r=hurtPlayer(h.dmg,h.x-h.vx*.2,h.y-h.vy*.2,{arrow:!!h.block});if(r==='reflect'){reflectShot(h.x,h.y,h.vx,h.vy);return false}if(r==='block'){sparks(h.x,h.y,HZ_COL[h.style],6,2,.5);return false}if(r)return false}
      return true}
    case 'lob':
      if(h.t>=h.T){if(inR(h.x,h.y,h.r))hurtPlayer(h.dmg,h.x,h.y,{unblock:true});ASFX.burst();sparks(h.x,h.y-.2,'#ff9a3a',12,3.5,.5);
        if(walkAt(C,h.x,h.y))hz({k:'puddle',x:h.x,y:h.y,r:.7,life:2.4,dmg:1,tick:0});return false}
      return true;
    case 'puddle':
      h.life-=dt;h.tick-=dt;if(h.tick<=0&&inR(h.x,h.y,h.r*.85)){h.tick=.7;hurtPlayer(h.dmg,h.x,h.y,{unblock:true,kb:.3,fire:true})}
      return h.life>0;
    case 'zone':
      if(h.t>=h.warn&&h.t<h.warn+h.act&&inR(h.x,h.y,h.r))SLOW=.25;
      return h.t<h.warn+h.act;
  }
  return false;
}

/* ===== 首領倒下 ===== */
EVT.on('kill',e=>{
  if(e.minion&&FIGHT)return;
  if(!e.boss)return;
  const D=e.D;ST.flags['bs:'+D.id]=1;HAZ=[];SLOW=0;
  if(D.core){giveItem(D.core,BOSS_CORE_N);setTimeout(()=>toast(`獲得 ${MATS[D.core].name} ×${BOSS_CORE_N}（鍛造材料）`),3600)}
  EVT.emit('boss',D.id);
  for(const m of minions())killEnemy(m);
  if(FIGHT)FIGHT.over=true;
  ASFX.fanfare();
  for(let i=0;i<4;i++)setTimeout(()=>{sparks(e.x+rand(-.6,.6),e.y-rand(.5,2),D.aura,16,4,1);ring(e.x,e.y-1,1.2,'#fff')},i*300);
  setTimeout(()=>{bossBar(null);if(FIGHT&&FIGHT.e===e)FIGHT=null},1600);
  for(const p of C.props)if(p.k==='altar'&&ALTAR_REWARD[p.id]&&ALTAR_REWARD[p.id].boss===D.id)p.awake=true;
  save();
  if(D.id==='boss_temple')ending();
  else setTimeout(()=>toast(TEXT.bossDown),1800);
});

/* ===== 祭壇：取得聖物＋完整的心（＋道具） ===== */
async function claimAltar(p,quiet){
  if(p.taken||!p.awake)return false;
  const rw=ALTAR_REWARD[p.id];if(!rw)return false;
  p.taken=true;ST.flags['al:'+p.id]=1;
  giveItem(rw.relic);giveItem('heart_full');if(rw.tool)giveItem(rw.tool);
  ST.hp=maxHp();ASFX.get();sparks(p.x,p.y-1.5,'#ffffff',20,3,1.2);save();hud(true);
  if(quiet)return true;
  const lines=[...(TEXT.altar[p.id]||[]),TEXT.heart];if(rw.tool){lines.push(TEXT.tool[rw.tool]);if(ST.tools.length===1)lines.push(TEXT.toolHint)}
  await say(lines);
  return true;
}
// 寶箱拿到道具時補一句說明
EVT.on('chest',(p,loot)=>{const ids=parseLoot(loot).map(o=>o.id).filter(id=>TEXT.tool[id]);if(ids.length)setTimeout(()=>{if(!dlgOpen)say([...ids.map(id=>TEXT.tool[id]),...(ST.tools.length===1?[TEXT.toolHint]:[])])},250)});

/* ===== 通關 ===== */
const fmtTime=s=>{s=Math.round(s);const h=Math.floor(s/3600),m=Math.floor(s/60)%60,ss=s%60;return (h?h+':'+String(m).padStart(2,'0'):m)+':'+String(ss).padStart(2,'0')};
function totalGems(){let n=0;const isGem=l=>parseLoot(l).reduce((a,o)=>a+((o.id==='gem'||o.id==='piece')?o.n:0),0);
  for(const M of Object.values(MAPS)){(M.chests||[]).forEach(c=>n+=isGem(c.loot));(M.cracks||[]).forEach(k=>k.chest&&(n+=isGem(k.chest.loot)));if(M.blockReward)n+=isGem(M.blockReward.loot)}return n+(typeof shopPieces==='function'?shopPieces():0)}   // 旅商賣的命珠碎片也算進總數（village.js）
function totalChests(){let n=0;for(const M of Object.values(MAPS)){n+=(M.chests||[]).length+(M.cracks||[]).filter(k=>k.chest).length+(M.blockReward?1:0)}return n}
function recordWin(){
  try{const s=JSON.parse(localStorage.getItem(STATS_KEY)||'null')||{};const m=s.story=s.story||{plays:0,wins:0,best:{}};m.plays=m.plays|0;m.wins=(m.wins|0)+1;m.best=m.best||{};
    const t=Math.round(ST.time);if(m.best.time==null||t<m.best.time)m.best.time=t;if(m.best.deaths==null||ST.deaths<m.best.deaths)m.best.deaths=ST.deaths;
    localStorage.setItem(STATS_KEY,JSON.stringify(s));return m}catch(e){return null}
}
let ENDING=false;
async function ending(){
  if(ENDING)return;ENDING=true;
  const first=!ST.cleared;ST.cleared=true;ST.flags['bs:boss_temple']=1;save();
  if(first)recordWin();
  await sleep(1800);
  if(!PS.dead)await say(TEXT.ending);
  lock=true;await fade(true);
  document.getElementById('endTitle').textContent=TEXT.endTitle;
  const ln=document.getElementById('endLines');ln.innerHTML='';TEXT.endLines.forEach((t,i)=>{const d=document.createElement('div');d.textContent=t;if(i===TEXT.endLines.length-1)d.className='note';ln.append(d)});
  const st=document.getElementById('endStats');st.innerHTML='';
  [['遊玩時間',fmtTime(ST.time)],['倒下次數',ST.deaths+' 次'],['命珠碎片',`${ST.gotPieces} / ${totalGems()}`],['寶箱',`${Object.keys(ST.chests).length} / ${totalChests()}`]].forEach(([a,b])=>{const s1=document.createElement('span');s1.textContent=a;const s2=document.createElement('b');s2.textContent=b;st.append(s1,s2)});
  document.getElementById('sMap').classList.remove('on');document.getElementById('sEnd').classList.add('on');
  running=false;lock=false;
  await sleep(60);document.getElementById('fade').classList.remove('on');
}
document.getElementById('btnEnd').addEventListener('click',()=>location.reload());

/* ================= HOOKS：接上引擎與 game.js ================= */
const _player=HOOKS.player,_update=HOOKS.update,_near=HOOKS.near,_actors=HOOKS.actors,_fx=HOOKS.fx;
HOOKS.player=dt=>{
  const m=_player(dt);if(PS.dead||FROZEN)return m;
  if(HOOK){hookPlayer(dt);return 0}
  return SLOW>0?m*.45:m;
};
HOOKS.update=dt=>{
  ST.time+=dt;
  _update(dt);
  if(FROZEN)return;
  if(TOOL_CD>0)TOOL_CD-=dt;if(SLOW>0)SLOW-=dt;
  TFX=TFX.filter(t=>tfxTick(t,dt));
  HAZ=HAZ.filter(h=>hazTick(h,dt));
  if(!PS.dead){lockTick();blockTick(dt)}
  advHud();
};
HOOKS.near=best=>{
  let hit=null;
  for(const p of C.props){
    if(p.k==='brazier'&&!p.lit){const d=Math.hypot(p.x-P.x,p.y-.25-P.y);if(d<best){best=d;hit=p;p.label='點火';p.act=()=>tryLight(p)}}
    else if(p.k==='altar'&&p.awake&&!p.taken){const d=Math.hypot(p.x-P.x,p.y+.3-P.y);if(d<Math.max(best,1.9)){best=d;hit=p;p.label='取得聖物';p.act=()=>claimAltar(p)}}
  }
  return _near(best)||hit;
};
HOOKS.blocked=(x,y,r)=>!!(FIGHT&&!FIGHT.over&&Math.hypot(x-FIGHT.cx,y-FIGHT.cy)+r>FIGHT.R);
HOOKS.light=()=>has('lantern')?TOOLS.lantern.light:3.4;
HOOKS.camera=()=>CAM;
const _art=HOOKS.art;HOOKS.art=id=>{const a=_art(id),b=MAPS[id]&&MAPS[id].boss;if(b&&BOSS_DEF[b.id])a.push(BOSS_DEF[b.id].art);return a};
HOOKS.actors=(list,c,now)=>{
  _actors(list,c,now);
  for(const t of TFX)list.push({sy:t.y+(t.k==='bomb'?0:.3),draw:()=>drawTfx(c,t,now)});
  for(const h of HAZ)if(h.k==='shot'||h.k==='lob')list.push({sy:h.k==='lob'?h.y+1:h.y+.3,draw:()=>drawShotHz(c,h,now)});
  else if(h.k==='circle'&&h.t>=h.warn&&(h.style==='water'||h.style==='root'||h.style==='star'))list.push({sy:h.y+.05,draw:()=>drawBurst(c,h,now)});
};
HOOKS.fx=(c,S,now)=>{
  if(HOOK){const H=HOOK,hx=H.phase==='pull'?H.post.x:P.x+H.dx*H.len,hy=H.phase==='pull'?H.post.y-.95:P.y+H.dy*H.len-.5,sx=P.x+H.dx*.25,sy=P.y-.5;
    c.strokeStyle='#9aa0b0';c.lineWidth=.05;c.setLineDash([.08,.06]);c.beginPath();c.moveTo(sx,sy);c.lineTo(hx,hy);c.stroke();c.setLineDash([]);
    c.save();c.translate(hx,hy);c.rotate(Math.atan2(H.dy,H.dx));c.fillStyle='#d8dce8';c.beginPath();c.moveTo(.2,0);c.lineTo(-.05,-.14);c.lineTo(0,0);c.lineTo(-.05,.14);c.closePath();c.fill();c.restore()}
  // 被打倒、還沒拿獎勵的祭壇：大光暈＋往上飄的光點
  for(const p of C.props)if(p.k==='altar'&&p.awake&&!p.taken){const col=ALTAR_COL[p.id]||'#fff',r=2.2+.25*Math.sin(now/300);c.save();c.globalCompositeOperation='lighter';
    const g=c.createRadialGradient(p.x,p.y-1.4,0,p.x,p.y-1.4,r);g.addColorStop(0,col+'aa');g.addColorStop(1,col+'00');c.fillStyle=g;c.fillRect(p.x-r,p.y-1.4-r,r*2,r*2);c.restore();
    if(Math.random()<.15)FX.push({k:'p',x:p.x+rand(-.6,.6),y:p.y-rand(.3,1.4),z:0,vx:0,vy:-.6,vz:.6,g:0,life:.9,max:.9,col,sz:.07,soft:1})}
  _fx(c,S,now);
};
HOOKS.ground=(c,now)=>{
  // 石塊壓板
  (C.M.blocks||[]).forEach((b,i)=>{if(b.tx==null)return;const on=(ST.flags[fk('bk',i)]||[])[0]===b.tx&&(ST.flags[fk('bk',i)]||[])[1]===b.ty;
    c.fillStyle=on?'rgba(255,230,140,.55)':'rgba(20,16,10,.45)';rr(c,b.tx-.55,b.ty-.95,1.1,.9,.1);c.fill();c.strokeStyle=on?'#ffe9a0':'rgba(220,210,180,.5)';c.lineWidth=.05;c.stroke();
    c.strokeStyle='rgba(220,210,180,.18)';c.setLineDash([.12,.12]);c.beginPath();c.moveTo(b.x,b.y-.45);c.lineTo(b.tx,b.ty-.45);c.stroke();c.setLineDash([])});
  // 裂牆：沒炸開＝牆面上的裂痕；炸開＝洞裡的地面
  (C.M.cracks||[]).forEach(k=>{const open=!!ST.flags[fk('ck',k.id)],r=crackRect(k);
    if(open){c.save();c.fillStyle=TEXP.floor||'#6a6458';rr(c,r.x0,r.y0,r.x1-r.x0,r.y1-r.y0,.45);c.fill();c.fillStyle='rgba(0,0,0,.35)';rr(c,r.x0,r.y0,r.x1-r.x0,r.y1-r.y0,.45);c.fill();c.restore();return}
    const R=rng(hashStr(k.id));c.strokeStyle='rgba(20,14,8,.85)';c.lineWidth=.06;
    for(let j=0;j<4;j++){let x=k.x,y=k.y-.3;c.beginPath();c.moveTo(x,y);for(let s=0;s<4;s++){x+=(R()-.5)*.5+(k.dir==='e'?.12:k.dir==='w'?-.12:0);y+=(R()-.6)*.45;c.lineTo(x,y)}c.stroke()}
    c.fillStyle='rgba(110,100,86,.9)';for(let j=0;j<5;j++){c.beginPath();c.ellipse(k.x+(R()-.5)*1.1,k.y+(R()-.3)*.4,.1+R()*.08,.07,0,0,7);c.fill()}});
  // 首領戰結界
  if(FIGHT&&!FIGHT.over){const a=.35+.15*Math.sin(now/200);c.save();c.strokeStyle=`rgba(255,230,160,${a})`;c.lineWidth=.12;c.beginPath();c.arc(FIGHT.cx,FIGHT.cy,FIGHT.R,0,7);c.stroke();
    c.strokeStyle=`rgba(255,200,120,${a*.5})`;c.lineWidth=.04;c.setLineDash([.3,.2]);c.beginPath();c.arc(FIGHT.cx,FIGHT.cy,FIGHT.R-.2,now/2000,now/2000+7);c.stroke();c.restore()}
  // 招式警示與地面效果
  for(const h of HAZ)drawHzGround(c,h,now);
};

/* ================= 繪製 ================= */
function drawHzGround(c,h,now){
  const col=HZ_COL[h.style]||'#ff5a5a';
  if(h.k==='circle'||(h.k==='lob')){
    const warn=h.k==='lob'?h.T:h.warn,p=clamp(h.t/warn,0,1);
    if(h.t<warn){c.save();c.globalAlpha=.25+.15*Math.sin(now/70);c.fillStyle=col;c.beginPath();c.ellipse(h.x,h.y,h.r*p,h.r*p*.6,0,0,7);c.fill();c.globalAlpha=.85;c.strokeStyle=col;c.lineWidth=.06;c.beginPath();c.ellipse(h.x,h.y,h.r,h.r*.6,0,0,7);c.stroke();c.restore()}
    else if(h.k==='circle'){const a=clamp(1-(h.t-h.warn)/(h.act+.15),0,1);c.save();c.globalAlpha=a;
      if(h.style==='slam'){c.strokeStyle='#fff3c0';c.lineWidth=.18*a+.04;c.beginPath();c.ellipse(h.x,h.y,h.r*(1.05-a*.2),h.r*.6*(1.05-a*.2),0,0,7);c.stroke()}
      else{c.fillStyle=col;c.beginPath();c.ellipse(h.x,h.y,h.r,h.r*.6,0,0,7);c.fill()}c.restore()}
  }else if(h.k==='line'){
    const p=clamp(h.t/h.warn,0,1);c.save();c.translate(h.x,h.y);c.rotate(h.a);
    if(h.t<h.warn){c.globalAlpha=.18+.12*Math.sin(now/70);c.fillStyle=col;c.fillRect(0,-h.w/2,h.len*p,h.w);c.globalAlpha=.8;c.strokeStyle=col;c.lineWidth=.04;c.setLineDash([.18,.12]);c.strokeRect(0,-h.w/2,h.len,h.w);c.setLineDash([])}
    else if(h.act){const a=clamp(1-(h.t-h.warn)/(h.act+.15),0,1);c.globalAlpha=a;
      if(h.style==='vine'){c.strokeStyle='#3f8a2a';c.lineWidth=h.w*.55;c.lineCap='round';c.beginPath();c.moveTo(0,0);for(let x=.3;x<=h.len;x+=.3)c.lineTo(x,Math.sin(x*3+h.a*5)*.12);c.stroke();c.strokeStyle='#8cff6a';c.lineWidth=.06;c.stroke();
        c.fillStyle='#c8ff9a';for(let x=.5;x<h.len;x+=.6){c.beginPath();c.moveTo(x,-.05);c.lineTo(x+.12,-h.w*.5);c.lineTo(x+.2,-.05);c.fill()}}
      else{const g=c.createLinearGradient(0,-h.w/2,0,h.w/2);g.addColorStop(0,'rgba(0,0,0,0)');g.addColorStop(.5,h.style==='fire'?'#fff0a0':'#fffbe0');g.addColorStop(1,'rgba(0,0,0,0)');c.fillStyle=g;c.fillRect(0,-h.w/2,h.len,h.w);
        c.globalAlpha=a*.7;c.fillStyle=col;c.fillRect(0,-h.w*.35,h.len,h.w*.7)}}
    c.restore();
  }else if(h.k==='puddle'){const a=clamp(h.life/.5,0,1);c.save();c.globalAlpha=a*(.55+.15*Math.sin(now/120+h.x));const g=c.createRadialGradient(h.x,h.y,0,h.x,h.y,h.r);g.addColorStop(0,'#ffd060');g.addColorStop(.6,'#ff6a1a');g.addColorStop(1,'rgba(120,20,0,0)');c.fillStyle=g;c.beginPath();c.ellipse(h.x,h.y,h.r,h.r*.6,0,0,7);c.fill();c.restore()}
  else if(h.k==='zone'){const on=h.t>=h.warn;c.save();c.globalAlpha=on?.28:.2+.1*Math.sin(now/80);c.fillStyle=HZ_COL.slow;c.beginPath();c.ellipse(h.x,h.y,h.r,h.r*.6,0,0,7);c.fill();c.globalAlpha=.8;c.strokeStyle=HZ_COL.slow;c.lineWidth=.05;c.setLineDash([.2,.15]);c.stroke();c.setLineDash([]);
    if(on){const a=now/(SLOW>0?900:300);c.beginPath();c.moveTo(h.x,h.y);c.lineTo(h.x+Math.cos(a)*h.r*.7,h.y+Math.sin(a)*h.r*.42);c.moveTo(h.x,h.y);c.lineTo(h.x+Math.cos(a/12)*h.r*.45,h.y+Math.sin(a/12)*h.r*.27);c.stroke()}c.restore()}
}
function drawBurst(c,h,now){   // 水柱、根刺、星光柱（站起來的部分，要跟角色排前後）
  const a=clamp(1-(h.t-h.warn)/(h.act+.15),0,1),H=h.style==='water'?2.2:h.style==='star'?2.6:1.1;c.save();c.globalAlpha=a;
  if(h.style==='root'){c.fillStyle='#7a5530';for(let i=0;i<6;i++){const ang=i/6*Math.PI*2,x=h.x+Math.cos(ang)*h.r*.5,y=h.y+Math.sin(ang)*h.r*.3;c.beginPath();c.moveTo(x-.1,y);c.lineTo(x+Math.cos(ang)*.1,y-H*(.7+.3*((i*7)%3)/2));c.lineTo(x+.1,y);c.fill()}}
  else{const g=c.createLinearGradient(0,h.y-H,0,h.y);g.addColorStop(0,'rgba(255,255,255,0)');g.addColorStop(.3,h.style==='water'?'rgba(150,220,255,.85)':'rgba(255,240,170,.85)');g.addColorStop(1,h.style==='water'?'rgba(60,150,230,.9)':'rgba(255,200,80,.9)');
    c.fillStyle=g;const w=h.r*.7*(1+.08*Math.sin(now/50));c.beginPath();c.moveTo(h.x-w,h.y);c.quadraticCurveTo(h.x-w*.6,h.y-H*.5,h.x-w*.3,h.y-H);c.lineTo(h.x+w*.3,h.y-H);c.quadraticCurveTo(h.x+w*.6,h.y-H*.5,h.x+w,h.y);c.closePath();c.fill()}
  c.restore();
}
function drawShotHz(c,h,now){
  const col=HZ_COL[h.style]||'#fff';
  if(h.k==='lob'){const p=clamp(h.t/h.T,0,1),x=h.x0+(h.x-h.x0)*p,gy=h.y0+1.6+(h.y-h.y0-1.6)*p,z=1.6*(1-p)+Math.sin(p*Math.PI)*2.4;drawShadow(c,x,gy,.5,.2);
    const g=c.createRadialGradient(x,gy-z,0,x,gy-z,.3);g.addColorStop(0,'#fff0a0');g.addColorStop(.5,'#ff8a2a');g.addColorStop(1,'#8a2000');c.fillStyle=g;c.beginPath();c.arc(x,gy-z,.26,0,7);c.fill();return}
  const z=.45;drawShadow(c,h.x,h.y,.3,.1);const g=c.createRadialGradient(h.x,h.y-z,0,h.x,h.y-z,h.r*1.6);g.addColorStop(0,'#fff');g.addColorStop(.4,col);g.addColorStop(1,col+'00');c.fillStyle=g;c.beginPath();c.arc(h.x,h.y-z,h.r*1.6,0,7);c.fill();
}
function drawTfx(c,t,now){
  if(t.k==='boomerang'){drawShadow(c,t.x,t.y,.4,.14);c.save();c.translate(t.x,t.y-.5);c.rotate(t.t*22);toolShape(c,'boomerang',.55);c.restore()}
  else if(t.k==='bomb'){const blink=t.t>TOOLS.bomb.fuse-.6&&Math.floor(t.t*14)%2;drawShadow(c,t.x,t.y,.5,.18);c.save();c.translate(t.x,t.y-.22);const s=1+.08*Math.sin(t.t*20);c.scale(s,s);toolShape(c,'bomb',.5,blink);c.restore();
    if(Math.random()<.5)FX.push({k:'p',x:t.x+.12,y:t.y-.02,z:.42,vx:rand(-.5,.5),vy:rand(-.3,.3),vz:rand(.5,1.5),life:.2,max:.2,col:'#ffe08a',sz:.05})}
}
// 道具圖示（世界與 HUD 共用）：以 (0,0) 為中心、s＝大約的直徑
function toolShape(c,id,s,alt){
  c.save();c.scale(s,s);
  const ia=ICON_OF[id];
  if(ia&&SART.has(ia)){   // 選配圖 i-<道具>：等比縮進 s×s 的框；還在載入就先不畫
    const im=sImg(ia);
    if(im){const k=1/Math.max(im.width,im.height),w=im.width*k,h=im.height*k;c.drawImage(im,-w/2,-h/2,w,h);
      if(alt){c.globalCompositeOperation='lighter';c.globalAlpha=.55;const g=c.createRadialGradient(0,0,0,0,0,.4);g.addColorStop(0,'#ff6040');g.addColorStop(1,'rgba(255,60,30,0)');c.fillStyle=g;c.beginPath();c.arc(0,0,.4,0,7);c.fill()}}
    c.restore();return;
  }
  switch(id){
    case 'boomerang':c.fillStyle='#c8803a';c.strokeStyle='#5a3010';c.lineWidth=.06;c.beginPath();c.moveTo(-.45,-.12);c.quadraticCurveTo(0,-.55,.45,-.12);c.lineTo(.4,.05);c.quadraticCurveTo(0,-.28,-.4,.05);c.closePath();c.fill();c.stroke();
      c.fillStyle='#ffe08a';c.fillRect(-.05,-.38,.1,.1);break;
    case 'bomb':c.fillStyle=alt?'#ff4a3a':'#2a2d3a';c.beginPath();c.arc(0,.06,.36,0,7);c.fill();c.fillStyle='rgba(255,255,255,.35)';c.beginPath();c.arc(-.12,-.06,.09,0,7);c.fill();
      c.fillStyle='#8a8f9a';c.fillRect(-.09,-.36,.18,.1);c.strokeStyle='#c9a35a';c.lineWidth=.06;c.beginPath();c.moveTo(0,-.36);c.quadraticCurveTo(.12,-.5,.24,-.44);c.stroke();c.fillStyle='#ffe08a';c.beginPath();c.arc(.26,-.45,.07,0,7);c.fill();break;
    case 'lantern':{c.strokeStyle='#c9a35a';c.lineWidth=.06;c.beginPath();c.arc(0,-.38,.1,Math.PI,0);c.stroke();c.fillStyle='#6b4423';c.fillRect(-.26,-.3,.52,.08);c.fillRect(-.26,.3,.52,.08);
      const g=c.createRadialGradient(0,0,0,0,0,.3);g.addColorStop(0,'#fffbe0');g.addColorStop(.5,'#ffb040');g.addColorStop(1,'#a0501a');c.fillStyle=g;c.fillRect(-.2,-.22,.4,.52);
      c.strokeStyle='#6b4423';c.lineWidth=.05;c.strokeRect(-.2,-.22,.4,.52);break}
    case 'hookshot':c.strokeStyle='#9aa0b0';c.lineWidth=.07;c.setLineDash([.08,.05]);c.beginPath();c.moveTo(-.42,.36);c.lineTo(.08,-.14);c.stroke();c.setLineDash([]);
      c.fillStyle='#d8dce8';c.beginPath();c.moveTo(.4,-.42);c.lineTo(.02,-.22);c.lineTo(.12,-.12);c.lineTo(.22,-.04);c.closePath();c.fill();c.strokeStyle='#d8dce8';c.lineWidth=.07;c.beginPath();c.arc(.18,-.16,.18,-.4,1.6);c.stroke();
      c.fillStyle='#6b4423';c.fillRect(-.5,.3,.18,.14);break;
  }
  c.restore();
}
function drawBoss(c,e,now){
  const D=e.D,im=ART[D.art];if(!im&&!artFail[D.art])needArt(D.art);
  let al=e.alpha;if(e.dead)al=clamp(e.dieT/e.dieMax,0,1);if(e.st==='sleep')al*=.85;
  // 潛入中：只畫水紋
  if(e.under){c.save();for(let k=0;k<3;k++){const p=((now/600)+k/3)%1;c.globalAlpha=(1-p)*.6;c.strokeStyle='#bfe6ff';c.lineWidth=.05;c.beginPath();c.ellipse(e.x,e.y,.4+p*1.1,(.4+p*1.1)*.5,0,0,7);c.stroke()}
    c.globalAlpha=.35;c.fillStyle='#0a2a4a';c.beginPath();c.ellipse(e.x,e.y,.9,.4,0,0,7);c.fill();c.restore();return}
  if(al<=0)return;
  c.save();c.globalAlpha=al;
  drawShadow(c,e.x,e.y+.02,e.r*2.6,e.r*.9);
  // 背光：讓首領從地面跳出來（暗色地面上也看得清楚）
  {const gy=e.y-D.size*.5,gr=D.size*.62,g=c.createRadialGradient(e.x,gy,0,e.x,gy,gr);g.addColorStop(0,D.aura+(e.st==='sleep'?'30':'55'));g.addColorStop(1,D.aura+'00');c.fillStyle=g;c.fillRect(e.x-gr,gy-gr,gr*2,gr*2)}
  // 二階的光暈、加速的星輪
  if(e.phase===2&&!e.dead){const r=1.5+.15*Math.sin(now/150);c.save();c.globalCompositeOperation='lighter';const g=c.createRadialGradient(e.x,e.y-1.2,0,e.x,e.y-1.2,r);g.addColorStop(0,'rgba(255,60,40,.35)');g.addColorStop(1,'rgba(255,60,40,0)');c.fillStyle=g;c.fillRect(e.x-r,e.y-1.2-r,r*2,r*2);c.restore()}
  if(e.fastT>0){c.save();c.strokeStyle='rgba(255,226,122,.7)';c.lineWidth=.05;c.beginPath();c.ellipse(e.x,e.y,1.3,.55,0,0,7);c.stroke();for(let k=0;k<12;k++){const a=k/12*Math.PI*2+now/250;c.beginPath();c.moveTo(e.x+Math.cos(a)*1.15,e.y+Math.sin(a)*.48);c.lineTo(e.x+Math.cos(a)*1.3,e.y+Math.sin(a)*.55);c.stroke()}c.restore()}
  let sx=1,sy=1+.03*Math.sin(e.anim*2.5),ox=0;
  const busy=e.st==='move'&&e.mt<.5||e.st==='roar'||(e.mv==='slam'&&e.ms===1);
  if(busy){ox=Math.sin(now/25)*.04;if(e.mv==='slam'){sy*=.9;sx*=1.06}}
  if(e.dead)ox=Math.sin(now/18)*.08;
  const h=D.size,w=h,flip=D.flip&&P.x>e.x;
  c.translate(e.x+ox,e.y);if(flip)c.scale(-1,1);c.scale(sx,sy);
  if(im){c.drawImage(im,-w/2,-h,w,h);
    const wf=e.flash>0||(e.dead&&Math.floor(now/90)%2);if(wf){const wi=whiteOf(D.art);if(wi){c.globalAlpha=al*.8;c.drawImage(wi,-w/2,-h,w,h)}}}
  else{c.fillStyle=e.flash>0?'#fff':D.aura;c.beginPath();c.ellipse(0,-h*.45,h*.32,h*.45,0,0,7);c.fill()}
  c.restore();
  if(e.dizzy>0&&!e.dead){for(let k=0;k<4;k++){const a=GT*5+k*1.6;c.fillStyle='#ffe66a';c.beginPath();c.arc(e.x+Math.cos(a)*.5,e.y-D.size-.1+Math.sin(a)*.12,.08,0,7);c.fill()}}
  if(e.st==='sleep'&&Math.floor(now/700)%2){c.fillStyle='rgba(255,255,255,.6)';c.font='bold .4px sans-serif';c.textAlign='center';c.fillText('…',e.x,e.y-D.size-.2)}
}

/* ================= HUD（副道具欄、炸彈數、聖物、手機道具鈕） ================= */
let advKey='';
function drawIconOn(cv,id,n){
  if(!cv)return;const g=cv.getContext('2d'),W0=cv.width;g.setTransform(1,0,0,1,0,0);g.clearRect(0,0,W0,W0);if(!id)return;
  g.translate(W0/2,W0/2);g.scale(W0,W0);toolShape(g,id,.85);
}
function advHud(force){
  const k=ST.tool+'|'+ST.tools.length+'|'+ST.bombs+'|'+ST.relics.join()+'|'+document.body.classList.contains('touch');
  if(k===advKey&&!force)return;advKey=k;
  const tb=document.getElementById('toolBox');if(tb){tb.classList.toggle('on',ST.tools.length>0);
    document.getElementById('toolName').textContent=ST.tool?TOOLS[ST.tool].name:'';
    document.getElementById('toolN').textContent=ST.tool==='bomb'?'×'+ST.bombs:(ST.tools.length>1?'':'');
    drawIconOn(document.getElementById('toolCv'),ST.tool)}
  const rl=document.getElementById('relics');if(rl){rl.classList.toggle('on',ST.relics.length>0);const cols={relic_forest:'#8cff8c',relic_fire:'#ffa040',relic_water:'#7aa8ff'};
    [...rl.children].forEach((el,i)=>{const id=['relic_forest','relic_fire','relic_water'][i],own=ST.relics.includes(id),ra=ICON_OF[id];
      if(own&&SART.has(ra)){el.style.background=`url(art/${ra}.webp?v=${SHRINE_VER}) center/contain no-repeat`;el.style.clipPath='none';el.style.width=el.style.height='18px';el.style.boxShadow=''}   // 有 i-relic-* 圖：換成圖示
      else{el.style.clipPath='';el.style.width=el.style.height='';el.style.background=own?cols[id]:'#333a50';el.style.boxShadow=own?`0 0 6px ${cols[id]}`:''}})}
  const ib=document.getElementById('itemBtn'),cb=document.getElementById('cycBtn');
  if(ib){ib.classList.toggle('on',ST.tools.length>0);drawIconOn(document.getElementById('itemCv'),ST.tool);document.getElementById('itemN').textContent=ST.tool==='bomb'?ST.bombs:''}
  if(cb)cb.classList.toggle('on',ST.tools.length>1);
}

/* ================= 輸入 ================= */
addEventListener('keydown',e=>{
  if(!running||e.repeat||e.ctrlKey||e.metaKey||e.altKey)return;
  const k=e.key.length===1?e.key.toLowerCase():'';
  if(dlgOpen||worldOpen||lock||panelOpen)return;
  if(k==='i'||k==='v'){e.preventDefault();useTool()}
  else if(k==='q'){e.preventDefault();cycleTool(-1)}
  else if(k==='e'){e.preventDefault();cycleTool(1)}
  else if(k>='1'&&k<='4'){e.preventDefault();selectTool(+k-1)}
});
(function(){
  const ib=document.getElementById('itemBtn'),cb=document.getElementById('cycBtn');if(!ib)return;
  let pid=null,timer=null,longed=false;
  ib.addEventListener('pointerdown',e=>{e.preventDefault();pid=e.pointerId;try{ib.setPointerCapture(pid)}catch(_){}ib.classList.add('down');longed=false;clearTimeout(timer);timer=setTimeout(()=>{longed=true;cycleTool(1)},450)});
  const up=e=>{if(e.pointerId!==pid)return;pid=null;ib.classList.remove('down');clearTimeout(timer);if(!longed&&e.type==='pointerup')useTool()};
  ib.addEventListener('pointerup',up);ib.addEventListener('pointercancel',up);ib.addEventListener('contextmenu',e=>e.preventDefault());
  if(cb)cb.addEventListener('pointerdown',e=>{e.preventDefault();cycleTool(1)});
  const tb=document.getElementById('toolBox');if(tb)tb.addEventListener('click',()=>cycleTool(1));
})();
// 關掉或切走頁面也存檔
document.addEventListener('visibilitychange',()=>{if(document.hidden&&running)save()});
addEventListener('pagehide',()=>{if(running)save()});

/* ================= 測試掛鉤（?debug=1） ================= */
if(window.__shrine){
  const T=window.__shrine,baseGive=T.give;
  Object.defineProperties(T,Object.getOwnPropertyDescriptors({
    give:(id,n=1)=>{
      if(id==='tools'){TOOL_ORDER.forEach(t=>giveItem(t));hud(true);advHud(true);return ST.tools.slice()}
      if(id==='relics'){['relic_forest','relic_fire','relic_water'].forEach(r=>giveItem(r));hud(true);advHud(true);return ST.relics.slice()}
      const r=baseGive(id,n);advHud(true);return r},
    use:id=>useTool(id),
    select:id=>{if(has(id)){ST.tool=id;advHud(true);return true}return false},
    boss:(id)=>{   // 傳到首領場地並直接開打
      const mid=Object.keys(MAPS).find(m=>MAPS[m].boss&&MAPS[m].boss.id===id);if(!mid)return false;
      const b=MAPS[mid].boss;delete ST.flags['bs:'+id];
      go(mid,b.x,b.y+b.arena-1.3,'up');const e=ENEMIES.find(x=>x.boss);if(!e)return false;
      startFight(e,true);if(running)render(performance.now());return true},
    unlock:need=>{let n=0;
      for(const mid in MAPS){const M=MAPS[mid];(M.locks||[]).forEach((l,i)=>{if(l.need===need||need==='all'){ST.flags['lk:'+mid+':'+i]=1;n++}});
        if(need==='crack'||need==='all')(M.cracks||[]).forEach(k=>{ST.flags['ck:'+mid+':'+k.id]=1;n++})}
      for(const p of C.props)if(p.k==='lock'&&ST.flags[fk('lk',C.locks.indexOf(p.lock))]){p.lock.open=true;p.col.off=true}
      (C.M.cracks||[]).forEach(k=>{if(ST.flags[fk('ck',k.id)])carve(C,k)});save();return n},
    win:()=>{ending();return true},
    hooks:()=>C.props.filter(p=>p.k==='hook').map(p=>({x:p.x,y:p.y})),
    claim:()=>{const p=C.props.find(q=>q.k==='altar');return p?claimAltar(p,true):false},
    light:()=>{let n=0;for(const p of C.props)if(p.k==='brazier'&&lightBrazier(p))n++;return n},
    get adv(){const e=ENEMIES.find(x=>x.boss);return {fight:FIGHT?{cx:FIGHT.cx,cy:FIGHT.cy,R:FIGHT.R,over:FIGHT.over}:null,
      boss:e?{id:e.D.id,hp:e.hp,max:e.max,phase:e.phase,st:e.st,mv:e.mv,ms:e.ms,immune:!!e.immune,under:!!e.under,x:+e.x.toFixed(2),y:+e.y.toFixed(2),seen:Object.assign({},e.seen),dead:e.dead}:null,
      haz:HAZ.map(h=>h.k+':'+(h.style||'')),tfx:TFX.map(t=>t.k),hook:HOOK?{phase:HOOK.phase,len:+HOOK.len.toFixed(2),post:!!HOOK.post}:null,
      tools:ST.tools.slice(),tool:ST.tool,bombs:ST.bombs,relics:ST.relics.slice(),flags:JSON.parse(JSON.stringify(ST.flags)),deaths:ST.deaths,time:+ST.time.toFixed(1),cleared:ST.cleared,slow:SLOW>0,cam:CAM,
      locks:C.props.filter(p=>p.k==='lock').map(p=>({need:p.lock.need,open:!!p.lock.open})),braziers:C.props.filter(p=>p.k==='brazier').map(p=>({id:p.id,lit:!!p.lit})),
      blocks:C.props.filter(p=>p.k==='block').map(p=>({x:p.bx,y:p.by})),minions:minions().length}},
    A:{ADV,TOOLS,BOSS_DEF,MOVES,TEXT,useTool,explode,openCrack,claimAltar,startFight,ending,crackRect,hookTarget,get HAZ(){return HAZ},get FIGHT(){return FIGHT},get TFX(){return TFX}}
  }));
}
window.SHRINE_ADV={TOOLS,BOSS_DEF,TEXT,useTool,cycleTool};
