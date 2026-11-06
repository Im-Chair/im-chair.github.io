'use strict';
/* ============ data.js — 新版貪婪深淵的純資料：技能、敵人、財寶、貪婪階級、事件文字。
   調平衡改這裡；規則本身在 core.js。 ============ */

/* 美術沿用舊版 rpg/。之後新版取代 rpg/ 時，把這裡改成 './' 即可 */
const ART = '../rpg/';

const GAME = {
  hp: 70,          // 起始生命
  ap: 3,           // 每回合行動點
  hand: 5,         // 每回合抽牌數
  bag: 6,          // 背包格數
  rows: 10,        // 地圖列數（最後一列是首領）
  exitRows: [4, 7],// 這幾列多一個撤離點
  stepGreed: 1,    // 每走一格增加的貪婪
  restHeal: 0.3,   // 營火回復比例
  chestMimic: 0.35,// 寶箱「再翻一次」遇到寶箱怪的機率
  burnAp: 1,       // 燒一件財寶換到的行動點（每回合一次）
};

/* 技能
   k：atk 攻擊／def 防禦／skl 技巧／bad 雜物
   r：0 基礎（獎勵不出）／1 普通／2 稀有
   t：卡面短文字，{d} 傷害（含加成）、{b} 格擋、其他由 up 覆寫
   long：長按時的完整說明
   up：強化後覆寫的欄位 */
const CARDS = {
  /* —— 起始牌 —— */
  chop:   {n:'劈砍', c:1, k:'atk', r:0, dmg:6, t:'傷害 {d}', long:'造成 {d} 點傷害。', up:{dmg:9}},
  raise:  {n:'舉盾', c:1, k:'def', r:0, blk:6, t:'格擋 {b}', long:'獲得 {b} 點格擋。', up:{blk:9}},
  ram:    {n:'盾撞', c:1, k:'atk', r:0, fn:'ram', bonus:0, t:'傷害＝格擋', long:'造成等同目前格擋的傷害（現在 {d}），格擋不會消失。', up:{bonus:4, t:'傷害＝格擋+4', long:'造成「目前格擋 +4」的傷害（現在 {d}），格擋不會消失。'}},
  rend:   {n:'裂甲', c:2, k:'atk', r:0, dmg:8, vuln:2, t:'傷害 {d}\n易傷 2', long:'造成 {d} 點傷害，並給予 2 回合易傷（受到的傷害 +50%）。', up:{dmg:11, vuln:3, t:'傷害 {d}\n易傷 3', long:'造成 {d} 點傷害，並給予 3 回合易傷（受到的傷害 +50%）。'}},

  /* —— 攻擊 —— */
  twin:   {n:'連斬', c:1, k:'atk', r:1, dmg:4, hits:2, t:'傷害 {d}×2', long:'造成 {d} 點傷害，共 2 次。力量每次都算。', up:{dmg:5, hits:3, t:'傷害 {d}×3', long:'造成 {d} 點傷害，共 3 次。力量每次都算。'}},
  cleave: {n:'重劈', c:2, k:'atk', r:1, dmg:15, t:'傷害 {d}', long:'造成 {d} 點傷害。', up:{dmg:21}},
  sweep:  {n:'橫掃', c:1, k:'atk', r:1, dmg:5, all:1, t:'全體傷害 {d}', long:'對所有敵人造成 {d} 點傷害。', up:{dmg:8}},
  finish: {n:'處決', c:2, k:'atk', r:1, dmg:9, fn:'finish', t:'傷害 {d}\n殘血×2', long:'造成 {d} 點傷害；目標生命低於 40% 時傷害加倍。', up:{dmg:13}},
  stake:  {n:'搏命', c:0, k:'atk', r:1, dmg:8, selfHp:3, t:'傷害 {d}\n失去 3 生命', long:'失去 3 點生命（無視格擋），造成 {d} 點傷害。', up:{dmg:12}},
  debt:   {n:'血債', c:1, k:'atk', r:1, fn:'debt', base:4, per:3, t:'傷害 4\n傷痕每層+3', long:'造成 4 點傷害，本場每層傷痕再 +3（現在 {d}）。傷痕：每次被打到掉血時 +1。', up:{base:6, per:4, t:'傷害 6\n傷痕每層+4', long:'造成 6 點傷害，本場每層傷痕再 +4（現在 {d}）。傷痕：每次被打到掉血時 +1。'}},
  fling:  {n:'擲金', c:1, k:'atk', r:1, fn:'fling', base:3, t:'傷害 3\n+貪婪÷4', long:'造成 3 點傷害，再加上貪婪值 ÷4（現在 {d}）。越貪越痛。', up:{base:6, t:'傷害 6\n+貪婪÷4', long:'造成 6 點傷害，再加上貪婪值 ÷4（現在 {d}）。越貪越痛。'}},
  melt:   {n:'熔金', c:1, k:'atk', r:2, fn:'melt', base:18, exhaust:1, t:'燒最便宜財寶\n傷害 {d}', long:'燒掉背包裡最便宜的財寶（貪婪隨之下降），造成 {d} 點傷害。背包沒東西就沒傷害。本場消耗。', up:{base:26}},

  /* —— 防禦 —— */
  wall:   {n:'鐵壁', c:2, k:'def', r:1, blk:14, t:'格擋 {b}', long:'獲得 {b} 點格擋。', up:{blk:20}},
  parry:  {n:'招架', c:1, k:'def', r:1, blk:4, draw:1, t:'格擋 {b}\n抽 1', long:'獲得 {b} 點格擋，抽 1 張。', up:{blk:7}},
  hold:   {n:'堅守', c:1, k:'def', r:2, blk:4, keep:1, t:'格擋 {b}\n下回合不衰減', long:'獲得 {b} 點格擋。下回合開始時，格擋不會減半。', up:{blk:8}},

  /* —— 技巧 —— */
  breath: {n:'喘息', c:1, k:'skl', r:1, draw:2, t:'抽 2', long:'抽 2 張。', up:{c:0}},
  shout:  {n:'戰吼', c:1, k:'skl', r:2, str:2, exhaust:1, t:'力量 +2\n本場消耗', long:'本場戰鬥力量 +2（每次攻擊傷害 +2）。使用後本場消耗。', up:{str:3, t:'力量 +3\n本場消耗', long:'本場戰鬥力量 +3（每次攻擊傷害 +3）。使用後本場消耗。'}},
  rage:   {n:'怒火', c:1, k:'skl', r:2, fn:'rage', exhaust:1, t:'傷痕全轉力量\n本場消耗', long:'清空傷痕，每層轉成 1 點力量。使用後本場消耗。', up:{c:0}},
  lick:   {n:'舔傷', c:1, k:'skl', r:1, heal:6, exhaust:1, t:'回復 6\n本場消耗', long:'回復 6 點生命。使用後本場消耗。', up:{heal:10, t:'回復 10\n本場消耗', long:'回復 10 點生命。使用後本場消耗。'}},
  lust:   {n:'貪念', c:0, k:'skl', r:2, ap:2, greed:5, exhaust:1, t:'行動點 +2\n貪婪 +5', long:'獲得 2 行動點，貪婪 +5。使用後本場消耗。', up:{ap:3, t:'行動點 +3\n貪婪 +5', long:'獲得 3 行動點，貪婪 +5。使用後本場消耗。'}},

  /* —— 敵人塞進牌堆的雜物 —— */
  goo:    {n:'黏液', c:1, k:'bad', r:-1, exhaust:1, t:'沒有效果\n打掉才會消失', long:'沒有任何效果，只佔手牌。花 1 行動點打掉就會消失。'},
};
const STARTER_DECK = ['chop','chop','chop','chop','raise','raise','raise','raise','ram','rend'];

/* 敵人
   pat 依序循環：a 攻擊（x 連擊）／d 格擋／weak·vuln·psn 附加狀態／charge 蓄力（只是預告）
                 goo 塞雜物／steal 偷財寶／flee 帶著贓物逃跑／summon 叫小怪／str 加力量
   nm：招式名（沒有就只顯示數字） */
const ENEMIES = {
  rat:    {n:'岩背豬',   hp:20, pat:[{a:5},{a:4,weak:1,nm:'撕咬'},{a:6}]},
  bat:    {n:'穴居蝠',   hp:14, pat:[{a:3,x:2},{a:4},{a:2,x:3}]},
  spider: {n:'食影絨團', hp:20, pat:[{a:3,psn:2,nm:'毒牙'},{d:5},{a:6}]},
  slime:  {n:'洞穴黏泥', hp:28, pat:[{a:4},{goo:2,nm:'噴黏液'},{a:6}]},
  skel:   {n:'骷髏兵',   hp:22, revive:0.4, pat:[{a:6},{d:6},{a:8}]},
  thief:  {n:'拾荒哥布林',hp:24, pat:[{a:4},{steal:1,nm:'順手牽羊'},{flee:1,nm:'開溜'}]},
  garg:   {n:'落石怪',   hp:36, pat:[{d:8},{charge:1,nm:'蓄力'},{a:15,nm:'崩落'}]},
  /* 菁英 */
  miner:  {n:'廢坑礦工', hp:62, elite:1, pat:[{a:8},{a:4,x:3,nm:'亂鎬'},{str:2,d:8,nm:'喃喃自語'}]},
  ratking:{n:'鼠王', hp:54, elite:1, pat:[{summon:'rat',nm:'呼朋引伴'},{a:9},{a:5,weak:2,nm:'咆哮'}]},
  mimic:  {n:'寶箱怪',   hp:58, elite:1, pat:[{a:12,nm:'咬合'},{steal:1,nm:'吞掉財寶'},{a:7,x:2}]},
  /* 首領 */
  /* 舊版首領圖（mb0 等）是元素系 Q 版角色，跟石棺對不上；先借用棺龕造型的 reliq，之後可換專屬圖 */
  sarc:   {n:'石棺守衛', art:'reliq', hp:220, boss:1, pat:[{a:10},{d:12},{charge:1,nm:'高舉棺蓋'},{a:22,nm:'棺蓋砸落'},{summon:'skel',nm:'開棺'},{a:6,x:2}]},
};

/* 每一段地圖會遇到的組合（越下面越硬） */
const ENCOUNTERS = [
  [['rat'],['bat','bat'],['spider'],['slime']],
  [['rat','bat'],['skel'],['thief'],['garg'],['spider','bat'],['slime','bat']],
  [['skel','spider'],['garg','bat'],['thief','skel'],['slime','rat'],['garg','spider'],['rat','rat','bat']],
];
const ELITES = ['miner','ratking'];

/* 財寶分三類，價值與效果反向——讓玩家在「帶錢」和「變強」之間取捨：
   gold 金銀：沒效果，賣價高、貪婪也高；relic 遺物：幾乎不值錢，效果強；curse 詛咒：非常值錢，但帶著有負面效果。
   v 帶回去值多少金幣，g 帶在身上加多少貪婪，ef 是帶在身上時的效果（可疊加，燒掉或被偷就沒了）。
   各類內依 v 由低到高排列（抽財寶時依貪婪階級偏向後面）。
   icon 用內嵌向量圖（舊版 ui/coin.webp 其實是井，不能用）；cls:'clip' 裁掉圖檔的黑色方底。
   效果鍵：blk 開場格擋／str 力量／drawFirst 第一回合多抽／blkTurn 每回合格擋／apFirst 第一回合行動點／
           bleed 每回合開始失去生命／drawLess 每回合少抽（手牌至少留 1） */
const TREASURES = [
  {id:'coin',    fam:'gold',  n:'碎銀',    icon:'gold',            v:30,  g:4,  ef:''},
  {id:'cup',     fam:'gold',  n:'金杯',    img:'ui/ev_can.webp', v:80,  g:9,  ef:''},
  {id:'gem',     fam:'gold',  n:'深淵晶',  img:'ui/gem.webp',      v:150, g:14, ef:'', cls:'clip'},
  {id:'pendant', fam:'relic', n:'骨墜',    img:'eq/pendant.webp',  v:10,  g:3,  blk:5,       ef:'開場格擋 +5'},
  {id:'ring',    fam:'relic', n:'無名指環',img:'eq/ring.webp',     v:15,  g:5,  str:1,       ef:'力量 +1'},
  {id:'watch',   fam:'relic', n:'停擺懷錶',img:'eq/watch.webp',    v:15,  g:4,  drawFirst:2, ef:'第一回合多抽 2'},
  {id:'lamp',    fam:'relic', n:'前人油燈',img:'eq/lamp.webp',     v:20,  g:6,  blkTurn:3,   ef:'每回合格擋 +3'},
  {id:'eye',     fam:'relic', n:'深淵之眼',img:'eq/bell.webp',     v:25,  g:8,  apFirst:1,   ef:'第一回合行動點 +1'},
  {id:'crown',   fam:'curse', n:'染血金冠',icon:'poison',           v:220, g:16, bleed:2,     ef:'每回合開始失去 2 生命'},
  {id:'drill',   fam:'curse', n:'噬魂鑽',  icon:'skull',            v:320, g:22, drawLess:1,  ef:'每回合少抽 1 張'},
];
const FAM = {
  gold:  {n:'金銀', c:'#d8a84c', d:'沒有效果，但賣得貴'},
  relic: {n:'遺物', c:'#6fbf8f', d:'幾乎不值錢，帶著有強效果'},
  curse: {n:'詛咒', c:'#d05252', d:'非常值錢，但帶著有負面效果'},
};

/* 貪婪階級：同時決定敵人多凶、財寶多好。
   bias 越小，抽財寶越偏向貴重（rand^bias）。
   start：開場格擋；traits：每隻敵人開場帶幾個詞綴 */
const GREED_TIERS = [
  {min:0,  n:'知足',    hp:1.00, dmg:1.00, bias:2.6, start:0, traits:0, desc:'敵人維持原樣。活著回去拿普通裝備。'},
  {min:12, n:'動心',    hp:1.10, dmg:1.10, bias:2.0, start:0, traits:0, desc:'敵人 +10%，財寶變好。回去拿精良裝備。'},
  {min:28, n:'眼紅',    hp:1.20, dmg:1.20, bias:1.6, start:5, traits:0, desc:'敵人 +20%，開場帶 5 格擋。回去拿稀有裝備。'},
  {min:45, n:'貪得無厭',hp:1.30, dmg:1.30, bias:1.3, start:5, traits:1, desc:'敵人 +30%，每隻帶 1 個詞綴。回去拿史詩裝備。'},
  {min:65, n:'深淵注視',hp:1.45, dmg:1.40, bias:1.0, start:8, traits:2, desc:'敵人 +40% 以上，每隻帶 2 個詞綴。回去拿傳說裝備。'},
];
const TRAITS = {
  thorn: {n:'帶刺', d:'每次被攻擊，反彈 2 點傷害'},
  tough: {n:'硬殼', d:'每回合開始獲得 4 格擋'},
  frenzy:{n:'嗜血', d:'每回合力量 +1'},
};

/* 地圖節點 */
const NODE_ART = {
  fight:'ui/door_fight.webp', elite:'ui/door_elite.webp', chest:'ui/door_chest.webp',
  rest:'ui/door_rest.webp', event:'ui/door_unknown.webp', exit:'ui/ev_rope.webp', boss:'mon/reliq.webp',
};
const NODE_NAME = {fight:'戰鬥', elite:'菁英', chest:'寶箱', rest:'營火', event:'未知', exit:'撤離', boss:'首領'};

/* 事件：文字與選項在這裡，效果在 core.js 的 EVENT_FX */
const EVENTS = {
  corpse:{title:'前人的屍體', img:'ui/ev_corpse.webp',
    text:'一具還背著背包的屍體靠在岩壁上。背包的帶子被什麼東西咬過。',
    opts:[{id:'search', t:'翻背包', d:'可能拿到財寶，也可能被咬一口'},{id:'leave', t:'走開', d:'沒有效果'}]},
  dice:{title:'暗處的賭客', img:'ui/ev_dice.webp',
    text:'「押一件，贏了拿兩件更好的。」它把骰子在指節間滾來滾去，你看不見它的臉。',
    opts:[{id:'bet', t:'押最便宜的財寶', d:'一半機率換兩件，一半機率全沒', need:'bag'},{id:'leave', t:'不賭', d:'沒有效果'}]},
  shrine:{title:'血跡斑斑的祭壇', img:'ui/ev_shrine.webp',
    text:'祭壇上的凹槽剛好放得下一隻手。凹槽底部是乾掉的血，一層疊一層。',
    opts:[{id:'blood', t:'獻血', d:'失去 8 生命，從 3 張稀有技能選 1 張'},{id:'offer', t:'獻上最貴的財寶', d:'失去它，回復 25 生命', need:'bag'},{id:'leave', t:'走開', d:'沒有效果'}]},
  crack:{title:'發光的裂縫', img:'ui/ev_crack.webp',
    text:'岩縫裡滲出微光，靠近時你開始想著「再多拿一點也沒關係」。',
    opts:[{id:'stare', t:'盯著看', d:'貪婪 +10，最大生命 +8'},{id:'leave', t:'別過頭', d:'沒有效果'}]},
};

/* 深度：打贏首領解鎖下一層。敵人變強、財寶更值錢；新敵人與新規則在第 3 階段補上，目前先換區域與數值 */
const DEPTHS = ['淺穴', '哥布林聚落', '無光通道', '舊都', '熔獄'];
const DEPTH_K = {hp: 0.8, dmg: 0.6, value: 0.25};

/* —— 回到營地之後 —— */
/* 素質：花金幣永久提升。第 lv 級（從 0 起算）的價格＝round(base × mult^lv) */
const STAT_UPS = {
  hp:  {n:'體魄',   d:'最大生命 +5',     key:'hp',  per:5, max:20, base:60,  mult:1.25},
  blk: {n:'架勢',   d:'每場開場格擋 +2', key:'blk', per:2, max:10, base:80,  mult:1.3},
  str: {n:'臂力',   d:'力量 +1',         key:'str', per:1, max:8,  base:250, mult:1.6},
  bag: {n:'大背包', d:'背包 +1 格',      key:'bag', per:1, max:3,  base:400, mult:2.5},
};
/* 裝備：活著回來時依最終貪婪階級給一件（打贏首領再高一階），優先補沒有的部位；已有的會換成金幣。
   也可以在營地鐵匠鋪用 buy 價直接買，能買的稀有度上限＝已解鎖深度 */
const RARITY = [
  {n:'普通', c:'#b8bcc8', sell:15,  buy:300},
  {n:'精良', c:'#6fbf8f', sell:40,  buy:800},
  {n:'稀有', c:'#5a9bd4', sell:80,  buy:2000},
  {n:'史詩', c:'#b98ae0', sell:160, buy:5000},
  {n:'傳說', c:'#e0813f', sell:300, buy:12000},
];
const SLOTS = {weapon:'武器', armor:'護甲', trinket:'飾品'};
const GEAR = {
  /* 武器 */
  w0:{n:'鏽蝕短劍',   slot:'weapon',  r:0, img:'eq/sword.webp',   fx:{str:1},              d:'力量 +1'},
  w1:{n:'碎骨斧',     slot:'weapon',  r:1, img:'eq/axe.webp',     fx:{str:2},              d:'力量 +2'},
  w2:{n:'放血匕首',   slot:'weapon',  r:2, img:'eq/dagger.webp',  fx:{firstAtk:6},         d:'每回合第一張攻擊牌傷害 +6'},
  w3:{n:'處刑者重斧', slot:'weapon',  r:3, img:'eq/axe.webp',     fx:{str:4},              d:'力量 +4'},
  w4:{n:'深淵之刃',   slot:'weapon',  r:4, img:'eq/sword.webp',   fx:{str:3, killHeal:6},  d:'力量 +3，擊殺回復 6 生命'},
  /* 護甲 */
  a0:{n:'舊皮甲',     slot:'armor',   r:0, img:'eq/leather.webp', fx:{hp:8},               d:'最大生命 +8'},
  a1:{n:'礦工鎖甲',   slot:'armor',   r:1, img:'eq/chain.webp',   fx:{blk:7},              d:'每場開場格擋 +7'},
  a2:{n:'穴居鱗甲',   slot:'armor',   r:2, img:'eq/scale.webp',   fx:{blkTurn:3},          d:'每回合格擋 +3'},
  a3:{n:'不退重板甲', slot:'armor',   r:3, img:'eq/plate.webp',   fx:{noDecay:1},          d:'格擋不再衰減'},
  a4:{n:'深淵斗篷',   slot:'armor',   r:4, img:'eq/cloak.webp',   fx:{hp:15, blkTurn:4},   d:'最大生命 +15，每回合格擋 +4'},
  /* 飾品 */
  t0:{n:'銅戒',       slot:'trinket', r:0, img:'eq/ring.webp',    fx:{hp:4},               d:'最大生命 +4'},
  t1:{n:'獵人護符',   slot:'trinket', r:1, img:'eq/pendant.webp', fx:{killHeal:3},         d:'擊殺回復 3 生命'},
  t2:{n:'老工匠懷錶', slot:'trinket', r:2, img:'eq/watch.webp',   fx:{drawFirst:2},        d:'第一回合多抽 2'},
  t3:{n:'守夜人提燈', slot:'trinket', r:3, img:'eq/lamp.webp',    fx:{bag:1, blk:6},       d:'背包 +1 格，每場開場格擋 +6'},
  t4:{n:'深淵之鈴',   slot:'trinket', r:4, img:'eq/bell.webp',    fx:{ap:1},               d:'每回合行動點 +1'},
};
