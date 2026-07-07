'use strict';
// ============ data.js — 純資料層：職業/技能/敵人/Boss/詞綴/藥水/域/事件常數/平衡參數。
// 調平衡改這裡：RATE_CAP 三率上限、STAT_DIV 換算分段、CURVE 供需曲線、DOT 毒燃參數、CYC_MULT 輪迴強度 ============

const CLASSES = {
  sword:{name:'劍士', icon:'🛡️', mainStat:'str',
    baseStats:{str:40, int:0, vit:30, agi:0, spi:10},
    baseRates:{dodge:0, crit:5, def:8},
    desc:'鐵罐。高物攻高防，站著換血，把仗打成自己的節奏。',
    skills:['slash','guard','sunder','execute']},
  assassin:{name:'盜賊', icon:'🗡️', mainStat:'str',
    baseStats:{str:30, int:0, vit:5, agi:40, spi:15},
    baseRates:{dodge:15, crit:12, def:0},
    desc:'影子。中傷高敏多段觸發，讓敵人死在千百道小傷口裡。',
    skills:['stab','venom','shadow','garrote']},
  white:{name:'法師', icon:'🔮', mainStat:'int',
    baseStats:{str:0, int:40, vit:0, agi:0, spi:20},
    baseRates:{dodge:3, crit:5, def:0},
    desc:'玻璃砲。高魔攻脆皮，法力傾瀉的一輪爆發。',
    skills:['smite','shield','fireball','oblivion']},
  dark:{name:'制魔師', icon:'🕯️', mainStat:'int',
    baseStats:{str:0, int:30, vit:15, agi:0, spi:40},
    baseRates:{dodge:3, crit:5, def:4},
    desc:'韌法。buff 與 debuff 的操盤手，越拖越強的收割者。',
    skills:['wstrike','hex','siphon','calam']},
};
/* 全職通用底值：一切從素質長出，這些是不吃素質的硬底 */
const BASE_HP = 50;    // 基礎生命（再加 體力×2）
const BASE_MANA = 20;  // 基礎法力（再加 精神×1.5）——僅智力主素質職業啟用
const BASE_DEF = 0;    // 基礎防禦力（再加護甲）
/* 五素質定義 */
const STATS = {
  str:{n:'力量', i:'💪', d:'物理攻擊加成'},
  int:{n:'智力', i:'🧠', d:'法術攻擊加成'},
  vit:{n:'體力', i:'🫀', d:'生命＋防禦率＋格擋量'},
  agi:{n:'敏捷', i:'🦶', d:'行動點＋閃避率'},
  spi:{n:'精神', i:'✨', d:'法力＋爆擊率'},
};
const SKILLS = {
  /* 結算規則 (§6/§9)：
     費用 = 武器行動點 × costW（fixed 招式固定費用，不經武器）
     傷害 = (武器攻擊＋主素質) × 武器係數 × mult
     magic 招式吃法力、以法術判定對盾（繞一半；pierce=完全無視格擋） */
  /* —— 🛡️ 劍士 —— */
  slash:  {n:'揮擊',   slot:'普', costW:1, mult:1.0, d:'基礎攻擊'},
  guard:  {n:'壁壘',   slot:'輔', fixed:1, blockCoef:0.5, d:'獲得格擋（10＋體力×0.5）'},
  sunder: {n:'破甲斬', slot:'中', costW:2, mult:1.6, apply:{vuln:2}, d:'重擊並附加易傷'},
  execute:{n:'處決',   slot:'大', costW:3, mult:2.5, execLine:0.3, d:'斬殺一擊，低血敵人加倍'},
  /* —— 🗡️ 盜賊 —— */
  stab:   {n:'刺擊',   slot:'普', costW:1, mult:1.0, d:'基礎攻擊'},
  venom:  {n:'淬毒',   slot:'輔', fixed:1, applyOnly:{poison:3}, d:'對目標上毒'},
  shadow: {n:'連環刃', slot:'中', costW:2, mult:0.6, hits:3, d:'三段攻擊，各自觸發爆擊與附加效果'},
  garrote:{n:'絞殺',   slot:'大', costW:3, mult:2.0, poisonAmp:0.15, d:'依目標毒層加成的收割一擊（只讀不耗）'},
  /* —— 🔮 法師 —— */
  smite:  {n:'敲擊',   slot:'普', costW:1, mult:1.0, d:'物理保底攻擊'},
  shield: {n:'屏障',   slot:'輔', fixed:1, mana:15, shieldCoef:1.2, d:'獲得護盾（10＋智力×1.2，可疊加）'},
  fireball:{n:'火球',  slot:'中', costW:2, mana:20, mult:1.6, magic:true, apply:{burn:2}, d:'法術轟擊並點燃'},
  oblivion:{n:'湮滅',  slot:'大', costW:3, mana:40, mult:2.8, magic:true, pierce:true, d:'無視格擋的毀滅法術'},
  /* —— 🕯️ 制魔師 —— */
  wstrike:{n:'杖擊',   slot:'普', costW:1, mult:1.0, d:'物理保底攻擊'},
  hex:    {n:'蝕咒',   slot:'輔', fixed:1, mana:10, applyOnly:{weak:2,vuln:2}, d:'對目標同時施加虛弱與易傷'},
  siphon: {n:'汲取',   slot:'中', costW:2, mana:20, mult:1.4, magic:true, drain:0.5, d:'法術吸取，傷害半數轉為回血'},
  calam:  {n:'災厄',   slot:'大', costW:3, mana:35, mult:1.2, magic:true, aoe:true, debuffAmp:0.3,
           d:'全體法術，目標每種負面狀態加傷；單體時強化並鋪滿負面'},
};
/* 精進三十二分支 (§10)：純參數變形、比例制、只讀不耗 */
const SKILL_UPS = {
  slash:  {a:{n:'重手', d:'倍率 1.0→1.3', mod:s=>{s.mult=1.3;}},
           b:{n:'輕靈', d:'費用 ×0.5、倍率 ×0.7', mod:s=>{s.costMul=0.5; s.mult=+(s.mult*0.7).toFixed(2);}}},
  guard:  {a:{n:'厚壁', d:'體力係數 0.5→0.9', mod:s=>{s.blockCoef=0.9;}},
           b:{n:'尖壁', d:'格擋存在期間，受擊反彈格擋值 30%', mod:s=>{s.spike=0.3;}}},
  sunder: {a:{n:'撕裂', d:'易傷 2→4 層', mod:s=>{s.apply={vuln:4};}},
           b:{n:'碎盾', d:'額外移除目標全部格擋（倍率 1.6→1.3）', mod:s=>{s.mult=1.3; s.shatter=true;}}},
  execute:{a:{n:'梟首', d:'斬殺線 30%→45%', mod:s=>{s.execLine=0.45;}},
           b:{n:'血償', d:'擊殺時回復 15% 生命', mod:s=>{s.killHeal=0.15;}}},
  stab:   {a:{n:'淬鋒', d:'此招爆擊傷害 +50%', mod:s=>{s.critBonus=0.5;}},
           b:{n:'毒鋒', d:'命中附毒 1 層', mod:s=>{s.apply=Object.assign({},s.apply,{poison:1});}}},
  venom:  {a:{n:'濃毒', d:'3→5 層', mod:s=>{s.applyOnly={poison:5};}},
           b:{n:'潑毒', d:'改為全體各上毒 2 層', mod:s=>{s.applyOnly={poison:2}; s.aoe=true;}}},
  shadow: {a:{n:'亂舞', d:'3 段→5 段、各 0.6→0.45', mod:s=>{s.hits=5; s.mult=0.45;}},
           b:{n:'重段', d:'3 段各 0.6→0.85', mod:s=>{s.mult=0.85;}}},
  garrote:{a:{n:'深絞', d:'每層毒 0.15→0.20（封頂 +200%）', mod:s=>{s.poisonAmp=0.20;}},
           b:{n:'催毒', d:'命中後目標毒立即額外跳一次（不動層數）', mod:s=>{s.poisonProc=true;}}},
  smite:  {a:{n:'重敲', d:'倍率 1.0→1.3', mod:s=>{s.mult=1.3;}},
           b:{n:'引流', d:'命中回復 5% 法力', mod:s=>{s.manaGain=0.05;}}},
  shield: {a:{n:'堅壁', d:'智力係數 1.2→1.8', mod:s=>{s.shieldCoef=1.8;}},
           b:{n:'反射膜', d:'護盾存在期間受擊反彈 10% 傷害', mod:s=>{s.reflect=0.10;}}},
  fireball:{a:{n:'燎原', d:'燃 2→4 層', mod:s=>{s.apply={burn:4};}},
           b:{n:'速唱', d:'費用 ×0.75、法力 −25%', mod:s=>{s.costMul=0.75; s.manaMul=0.75;}}},
  oblivion:{a:{n:'過載', d:'倍率 2.8→3.5、法力 +40%', mod:s=>{s.mult=3.5; s.manaMul=1.4;}},
           b:{n:'餘燼', d:'倍率 →2.0、附燃 5 層', mod:s=>{s.mult=2.0; s.apply={burn:5};}}},
  wstrike:{a:{n:'重擊', d:'倍率 1.0→1.3', mod:s=>{s.mult=1.3;}},
           b:{n:'蝕擊', d:'命中 30% 機率附虛弱 1 層', mod:s=>{s.weakChance=0.3;}}},
  hex:    {a:{n:'深蝕', d:'虛弱易傷各 2→3', mod:s=>{s.applyOnly={weak:3,vuln:3};}},
           b:{n:'廣蝕', d:'改為全體各 2 層', mod:s=>{s.aoe=true;}}},
  siphon: {a:{n:'貪飲', d:'回血 50%→80%', mod:s=>{s.drain=0.8;}},
           b:{n:'裂魂', d:'倍率 1.4→1.8、回血 →25%', mod:s=>{s.mult=1.8; s.drain=0.25;}}},
  calam:  {a:{n:'絕望', d:'每種負面 0.3→0.4（封頂 +160%）', mod:s=>{s.debuffAmp=0.4;}},
           b:{n:'輪迴咒', d:'擊殺時目標身上的負面轉移至隨機存活敵人', mod:s=>{s.transferCurse=true;}}},
};
const ENEMIES = {
  /* 淺穴 1-10 */
  rat:   {n:'洞穴巨鼠', i:'🐀', hp:16, realm:0, pat:[{t:'a',v:4},{t:'a',v:5},{t:'a',v:3,ap:{weak:1},nm:'撕咬'}]},
  slime: {n:'腐蝕黏液', i:'🟢', hp:22, tag:'bImm', realm:0, pat:[{t:'a',v:5,ap:{weak:1},nm:'酸液'},{t:'d',v:5},{t:'a',v:6}]},
  skel:  {n:'骷髏兵',   i:'💀', hp:24, tag:'pImm', realm:0, pat:[{t:'a',v:6},{t:'d',v:6},{t:'a',v:8}]},
  bat:   {n:'蝙蝠群',   i:'🦇', hp:19, tag:'naked', realm:0, pat:[{t:'m',v:3,x:2},{t:'a',v:4},{t:'m',v:2,x:3}]},
  spider:{n:'穴居蛛',   i:'🕷️', hp:21, realm:0, pat:[{t:'a',v:4,ap:{poison:2},nm:'毒牙'},{t:'d',v:5},{t:'a',v:6}]},
  thief: {n:'盜墓賊',   i:'🥷', hp:26, realm:0, pat:[{t:'s',v:6,nm:'搶奪'},{t:'a',v:7},{t:'d',v:6}]},
  garg:  {n:'石像鬼',   i:'🗿', hp:30, tag:'heavy', realm:0, pat:[{t:'d',v:8},{t:'g',nm:'蓄力'},{t:'h',v:15}]},
  /* 沉沒王國 11-20 */
  drown: {n:'溺水者',   i:'🧟', hp:34, tag:'bImm', realm:1, pat:[{t:'a',v:9},{t:'v',v:8,nm:'拖拽'},{t:'a',v:10}]},
  eel:   {n:'窟窿鰻',   i:'🐍', hp:30, realm:1, pat:[{t:'m',v:5,x:2},{t:'a',v:11},{t:'d',v:8}]},
  sguard:{n:'沉沒衛兵', i:'♜', hp:40, tag:'heavy', realm:1, pat:[{t:'d',v:10},{t:'a',v:11},{t:'h',v:15}]},
  jelly: {n:'水母群',   i:'🪼', hp:28, tag:'naked', realm:1, pat:[{t:'a',v:8,ap:{weak:1},nm:'螫刺'},{t:'c',ap:{vuln:2},nm:'纏繞'},{t:'a',v:10}]},
  crab:  {n:'珍珠蟹',   i:'🦀', hp:38, realm:1, pat:[{t:'d',v:12},{t:'h',v:15},{t:'a',v:9}]},
  siren: {n:'海妖歌者', i:'🧜', hp:32, realm:1, pat:[{t:'c',ap:{weak:2},nm:'魅歌'},{t:'a',v:10},{t:'v',v:10,nm:'汲取'}]},
  corpse2:{n:'浮屍',    i:'⚰️', hp:36, tag:'pImm', realm:1, pat:[{t:'a',v:10},{t:'a',v:11},{t:'g',nm:'鼓脹'},{t:'h',v:17,nm:'脹裂'}]},
  /* 血肉迴廊 21-30 */
  leech: {n:'血蛭',     i:'🪱', hp:42, tag:'naked', realm:2, pat:[{t:'v',v:11,nm:'吸附'},{t:'v',v:13,nm:'吸附'},{t:'a',v:12}]},
  clot:  {n:'蠕行血塊', i:'🩸', hp:46, realm:2, pat:[{t:'a',v:12},{t:'m',v:7,x:2},{t:'a',v:14}]},
  eye:   {n:'眼球簇',   i:'👁️', hp:40, realm:2, pat:[{t:'c',ap:{weak:2,vuln:2},nm:'凝視'},{t:'g',nm:'蓄力'},{t:'h',v:21,nm:'湮滅光線'}]},
  teeth: {n:'齒牆',     i:'🦷', hp:52, tag:'heavy', realm:2, pat:[{t:'d',v:13},{t:'a',v:14},{t:'h',v:19,nm:'咬合'}]},
  hound: {n:'雙頭地獄犬',i:'🐕', hp:46, tag:'bImm', realm:2, pat:[{t:'m',v:7,x:2},{t:'a',v:13},{t:'a',v:10,ap:{weak:2},nm:'咆哮撕咬'}]},
  necro: {n:'亡靈法師', i:'🧙', hp:42, tag:'pImm', realm:2, pat:[{t:'c',ap:{vuln:2},nm:'咒言'},{t:'a',v:12},{t:'a',v:13}]},
  flower:{n:'食人魔花', i:'🌺', hp:44, realm:2, pat:[{t:'v',v:11,nm:'吸食'},{t:'a',v:13},{t:'v',v:12,nm:'吸食'}]},
  /* 無光教區 31-40 */
  monk:  {n:'苦修士',   i:'🧎', hp:52, realm:3, pat:[{t:'a',v:15},{t:'d',v:13},{t:'a',v:16,ap:{wound:1},nm:'鞭笞'}]},
  choir: {n:'唱詩者',   i:'🎭', hp:48, tag:'naked', realm:3, pat:[{t:'c',ap:{weak:2},nm:'低吟'},{t:'a',v:15},{t:'c',ap:{vuln:2},nm:'高音'}]},
  lantern:{n:'提燈人',  i:'🏮', hp:50, tag:'bImm', realm:3, pat:[{t:'a',v:14,ap:{burn:2},nm:'燈油'},{t:'d',v:13},{t:'h',v:20,ap:{burn:2},nm:'潑焚'}]},
  knight:{n:'深淵騎士', i:'♞', hp:58, tag:'heavy', realm:3, pat:[{t:'d',v:14},{t:'a',v:16},{t:'h',v:21}]},
  zealot:{n:'盲信者',   i:'🙇', hp:54, realm:3, pat:[{t:'a',v:15},{t:'a',v:15},{t:'g',nm:'禱告'},{t:'h',v:25,nm:'殉道'}]},
  reliq: {n:'聖物匣',   i:'🏺', hp:60, tag:'pImm', realm:3, pat:[{t:'d',v:16},{t:'c',ap:{wound:2},nm:'聖灰'},{t:'h',v:22}]},
  sister:{n:'影修女',   i:'👥', hp:50, realm:3, pat:[{t:'m',v:8,x:2},{t:'a',v:16,ap:{weak:1},nm:'割禮'},{t:'d',v:12}]},
  /* 心室 41-50 */
  throm: {n:'血栓',     i:'🫘', hp:66, realm:4, pat:[{t:'d',v:17},{t:'a',v:18},{t:'h',v:24,nm:'栓塞'}]},
  valve: {n:'瓣膜守衛', i:'🦾', hp:70, tag:'heavy', realm:4, pat:[{t:'d',v:19},{t:'h',v:26,nm:'閉鎖'},{t:'a',v:17}]},
  worm:  {n:'心蟲',     i:'🐛', hp:58, realm:4, pat:[{t:'a',v:16,ap:{poison:2},nm:'鑽咬'},{t:'m',v:9,x:2},{t:'a',v:18}]},
  pulse: {n:'脈搏亡魂', i:'👻', hp:60, realm:4, pat:[{t:'a',v:18},{t:'c',ap:{weak:2,vuln:1},nm:'共振'},{t:'h',v:25}]},
  mist:  {n:'血霧',     i:'🌫️', hp:56, tag:'naked', realm:4, pat:[{t:'m',v:7,x:3},{t:'v',v:14,nm:'滲透'}]},
  puppet:{n:'腔室傀儡', i:'🪆', hp:72, tag:'pImm', realm:4, pat:[{t:'d',v:19},{t:'a',v:19},{t:'g',nm:'上弦'},{t:'h',v:31,nm:'斷弦'}]},
  magma: {n:'沸血魔',   i:'🌋', hp:62, tag:'bImm', realm:4, pat:[{t:'a',v:17,ap:{burn:3},nm:'噴濺'},{t:'d',v:15},{t:'h',v:23,ap:{burn:2,wound:2},nm:'沸流'}]},
};
/* 域限精英：精英門機率出現，帶域主題機制 */

const REALM_ELITES = [
  {key:'ratking', n:'鼠王',       i:'🐭', hp:55,  pat:[{t:'m',v:4,x:2},{t:'a',v:9},{t:'g',nm:'尖嘯召群'},{t:'m',v:4,x:4,nm:'鼠潮'}]},
  {key:'priest',  n:'深潛者祭司', i:'🐙', hp:80,  pat:[{t:'c',ap:{weak:2,vuln:2},nm:'深淵禱詞'},{t:'v',v:13,nm:'觸手汲取'},{t:'h',v:19}]},
  {key:'stitch',  n:'縫合巨人',   i:'🧌', hp:110, pat:[{t:'h',v:18},{t:'d',v:15},{t:'m',v:9,x:2},{t:'g',nm:'掄臂'},{t:'h',v:27,nm:'砸落'}]},
  {key:'inquis',  n:'異端審判官', i:'⚖️', hp:120, pat:[{t:'c',ap:{wound:2,vuln:2},nm:'判罪'},{t:'h',v:24,nm:'火刑'},{t:'d',v:16},{t:'h',v:28,nm:'處決'}]},
  {key:'acolyte', n:'心之侍者',   i:'⚕️', hp:135, pat:[{t:'v',v:17,nm:'輸血'},{t:'c',ap:{wound:3},nm:'放血'},{t:'h',v:29},{t:'g',nm:'縫合'},{t:'h',v:37,nm:'心搏停止'}]},
];

const FINAL_BOSS = {n:'深淵之心', i:'🫀',
  intro:'第二十五層沒有地板，沒有牆。只有一顆懸在黑暗中央、有三層樓高的心臟，隨著你的心跳一起搏動。\n\n你終於明白了——深淵不是一個地方。深淵是活的，而你一直走在它的血管裡。',
  intro2:'心臟裂開了。裡面沒有血，只有你一路走來丟下的東西：撤退的猶豫、搬開的石堆、闔上的眼睛。\n\n它用你的聲音說：「再貪一層。」',
  pat:[{t:'a',v:11,nm:'脈搏'},{t:'c',ap:{wound:2,weak:2},nm:'凋朽'},{t:'d',v:14},{t:'h',v:21,nm:'心跳'}],
  pat2:[{t:'m',v:7,x:3,nm:'血潮'},{t:'c',ap:{vuln:2},nm:'剖白'},{t:'g',nm:'凝聚萬象'},{t:'h',v:27,nm:'終焉'}]};

const MINI_BOSSES = [
  {key:'mb0', n:'石棺守衛', i:'🪦', hp:70,  intro:'一具披著鏽甲的骸骨從石棺裡坐起。棺蓋上刻著：「看守者永不下班」。',
   pat:[{t:'a',v:9},{t:'d',v:10},{t:'g',nm:'高舉棺蓋'},{t:'h',v:18,nm:'棺蓋砸落'}]},
  {key:'mb1', n:'珊瑚騎士', i:'🪸', hp:95,  intro:'鎧甲早就鏽穿了，珊瑚沿著騎士的骨架長成了新的甲冑。它舉起長成劍形的珊瑚枝。',
   pat:[{t:'a',v:12},{t:'d',v:13},{t:'h',v:18},{t:'m',v:7,x:2,nm:'連刺'}]},
  {key:'mb2', n:'無面王', i:'🫥', hp:115, intro:'王座上的東西沒有臉。它戴上一張哭臉——然後開始笑。',
   pat:[{t:'m',v:6,x:3,nm:'千手'},{t:'d',v:14},{t:'c',ap:{vuln:2},nm:'摘面'},{t:'g',nm:'凝聚'},{t:'h',v:24,nm:'王之一擊'}]},
  {key:'mb3', n:'苦修大司祭', i:'📿', hp:130, intro:'他的眼睛縫得最緊，念珠上每一顆都是一枚人牙。「你來懺悔的路走得太慢了。」',
   pat:[{t:'c',ap:{wound:2,weak:2},nm:'降罪'},{t:'a',v:16},{t:'d',v:15},{t:'h',v:26,nm:'苦行杖'}]},
  {key:'mb4', n:'心瓣守衛', i:'🔱', hp:150, intro:'兩扇肉質的巨門之間站著它——深淵用最好的血肉鑄的鎖。',
   pat:[{t:'d',v:19},{t:'h',v:28,nm:'閉鎖'},{t:'a',v:17},{t:'g',nm:'蓄壓'},{t:'h',v:34,nm:'噴射'}]},
];

const LORD_BOSSES = [
  {key:'bb0', n:'守墓人', i:'⚰️', hp:120, intro:'一具拖著巨鏟的乾屍擋在路中央。它替整座淺穴收屍——現在輪到量你的尺寸了。',
   pat:[{t:'a',v:11},{t:'d',v:12},{t:'c',ap:{weak:2},nm:'撒墓土'},{t:'g',nm:'高舉巨鏟'},{t:'h',v:23,nm:'落葬'}]},
  {key:'bb1', n:'溺亡之王', i:'👑', hp:155, intro:'王座淹在水裡，泡脹的君主仍端坐著。王冠下的臉轉向你：「朕的國，不缺子民。」',
   pat:[{t:'v',v:13,nm:'萬民供奉'},{t:'c',ap:{weak:2,vuln:1},nm:'溺令'},{t:'d',v:15},{t:'g',nm:'漲潮'},{t:'h',v:26,nm:'滅頂'}]},
  {key:'bb2', n:'深淵之母', i:'🕷️', hp:185, intro:'無數細足在血肉的甬道裡沙沙作響。牠孵化了你一路殺過來的所有東西，而牠記仇。',
   pat:[{t:'a',v:10,ap:{poison:2,wound:1},nm:'毒牙'},{t:'v',v:15,nm:'吸食'},{t:'c',ap:{weak:2,vuln:1},nm:'織網'},{t:'h',v:20,nm:'撲殺'}]},
  {key:'bb3', n:'盲眼主教', i:'🛐', hp:215, intro:'主教的眼睛在很多年前獻給了深淵。他朝你的方向精準地轉過頭：「看，多虔誠的祭品，自己走上了祭壇。」',
   pat:[{t:'c',ap:{wound:2,vuln:2},nm:'禱告'},{t:'a',v:17,ap:{wound:1},nm:'聖鞭'},{t:'d',v:18},{t:'g',nm:'冷燭齊燃'},{t:'h',v:31,nm:'神罰'}]},
];
/* 詞綴 */

/* 武器四柱 (§3)：行動點費用第3批上線，本批先落地 係數/類型/對盾 */
const WEAPON_TYPES = {
  dagger:{n:'匕首', i:'🗡️', ap:0.5, coef:0.6, blockMod:1.5, magic:false},
  sword: {n:'劍',   i:'⚔️', ap:1.0, coef:1.0, blockMod:1.0, magic:false},
  axe:   {n:'斧',   i:'🪓', ap:1.5, coef:1.5, blockMod:0.5, magic:false},
  staff: {n:'杖',   i:'🪄', ap:1.0, coef:1.0, blockMod:0.5, magic:true},
};
/* 供需曲線 (§13)：全部可調 */
const CURVE = {
  wpnBase: f => 6 + f*0.9,          // 武器攻擊力
  armBase: f => 3 + f*0.5,          // 護甲防禦力
  rarMult: [0.8, 1.0, 1.2, 1.4],    // 白藍金橙
  mobHP:   f => f<=10 ? f*23 : 70 + f*16,     // 雜魚血量目標（1-10層俯衝、10層起接 §13 對表）
  mobDMG:  f => f<=10 ? f*1.8 : 3 + f*1.5,    // 雜魚單發目標
  eliteHP: 1.8, miniHP: 2.2, lordHP: 2.6, finalHP: 2.9,  // 相對雜魚（第6批校準：域主≈8回合）
  bossDMG: 1.1,
  duoStart: 20, duoRate: 0.03, duoLock: 40,   // 多敵曲線：20層起 (f-20)×3%，40+ 固定雙怪
};
/* 異常狀態 (§8)：毒燃吃目標最大生命% */
const DOT = {
  poisonPct: 0.012, burnPct: 0.02, stackCap: 10,
};
/* 詞綴化學反應 (§批4)：兩詞綴齊備自動啟動的隱藏協同——配方可調 */
const CHEMISTRY = [
  {id:'pcrit',     n:'毒爆',     i:'\u2620\ufe0f\ud83c\udfaf', need:['ptouch','crit'],  d:'爆擊時，淬毒之刃的層數加倍施加'},
  {id:'burnvamp',  n:'焚血',     i:'\ud83d\udd25\ud83e\ude78', need:['btouch','vamp'],  d:'敵人燃燒跳傷時，你回復其 30%'},
  {id:'windthorn', n:'風棘',     i:'\ud83d\udca8\ud83c\udf35', need:['agile','thorns'], d:'成功閃避時，反彈荊棘值 ×2 的傷害'},
  {id:'overshield',n:'溢血成盾', i:'\ud83e\ude78\ud83d\udd37', need:['vamp','hp'],      d:'吸血溢出時轉為護盾（每場上限 20% 生命上限）'},
  {id:'corrode',   n:'腐燃',     i:'\u2620\ufe0f\ud83d\udd25', need:['ptouch','btouch'],d:'對同時中毒與燃燒的目標，傷害 +20%'},
];
const AFFIXES = {
  /* —— 素質類（吃樓層 +0.3/層）—— */
  str:  {n:'力量', fmt:v=>`力量 +${v}`, min:3, max:24, slots:'w', stat:true},
  int:  {n:'智力', fmt:v=>`智力 +${v}`, min:3, max:24, slots:'w', stat:true},
  spi:  {n:'精神', fmt:v=>`精神 +${v}`, min:3, max:24, slots:'w', stat:true},
  vit:  {n:'體力', fmt:v=>`體力 +${v}`, min:3, max:24, slots:'a', stat:true},
  agi:  {n:'敏捷', fmt:v=>`敏捷 +${v}`, min:3, max:24, slots:'a', stat:true},
  /* —— 生命／法力 —— */
  hp:   {n:'生命', fmt:v=>`生命上限 +${v}`, min:8, max:46, slots:'at'},
  mp:   {n:'法力上限', fmt:v=>`法力上限 +${v}`, min:6, max:35, slots:'at'},
  /* —— 率類（不吃樓層）—— */
  crit: {n:'爆擊率', fmt:v=>`爆擊率 +${v}%`, min:2, max:12, slots:'wt', rate:true},
  defr: {n:'防禦率', fmt:v=>`防禦率 +${v}%`, min:2, max:12, slots:'at', rate:true},
  agile:{n:'閃避率', fmt:v=>`閃避率 +${v}%`, min:2, max:12, slots:'at', rate:true},
  /* —— 功能類 —— */
  vamp: {n:'吸血', fmt:v=>`攻擊吸血 ${v}%（彙總上限 60%）`, min:4, max:22, slots:'w'},
  ptouch:{n:'淬毒之刃', fmt:v=>`攻擊附加 ${v} 層中毒`, min:1, max:3, slots:'w'},
  btouch:{n:'淬焰之刃', fmt:v=>`攻擊附加 ${v} 層燃燒`, min:1, max:3, slots:'w'},
  thorns:{n:'荊棘', fmt:v=>`受擊反彈 ${v} 點傷害`, min:2, max:16, slots:'a'},
  mend: {n:'急救', fmt:v=>`戰鬥勝利回復 ${v} 血`, min:3, max:18, slots:'a'},
  greed:{n:'貪婪', fmt:v=>`碎銀獲取 +${v}%`, min:8, max:40, slots:'t'},
  mregen:{n:'回法', fmt:v=>`每回合額外回復 ${v}% 法力（彙總上限 100%）`, min:5, max:28, slots:'t'},
  /* —— 傳說（橙裝保底一條）—— */
  vform:{n:'蝕魂', fmt:v=>`攻擊不再造成傷害，改為施加 2 層中毒；你的中毒傷害 +50%`, min:1, max:1, slots:'w', leg:true},
  exem: {n:'斬首', fmt:v=>`對生命低於 30% 的敵人，傷害 +50%`, min:1, max:1, slots:'w', leg:true},
  symbio:{n:'腐生', fmt:v=>`敵人因中毒受傷時，你回復其 50% 的生命`, min:1, max:1, slots:'w', leg:true},
  fury: {n:'狂血', fmt:v=>`造成的傷害 +40%，生命上限 -30%`, min:1, max:1, slots:'w', leg:true},
  wall: {n:'壁壘', fmt:v=>`格擋在回合結束時不再清零`, min:1, max:1, slots:'a', leg:true},
  guts: {n:'不屈', fmt:v=>`每場戰鬥第一次受到致死傷害時，改為保留 1 點生命`, min:1, max:1, slots:'a', leg:true},
  regen:{n:'血甲', fmt:v=>`每回合開始回復 3% 生命上限`, min:1, max:1, slots:'a', leg:true},
  spark:{n:'燧心', fmt:v=>`爆擊回復行動點（每回合上限 1 點）`, min:1, max:1, slots:'t', leg:true},
  luck7:{n:'賭運', fmt:v=>`爆擊傷害倍率 1.6 → 2.1`, min:1, max:1, slots:'t', leg:true},
  feast:{n:'貪食', fmt:v=>`擊殺敵人時回復 15% 生命上限`, min:1, max:1, slots:'t', leg:true},
  /* —— 詛咒 —— */
  bloodtax:{n:'血稅', fmt:v=>`每深入一層，失去 ${v} 點生命`, min:3, max:3, slots:'wat', curse:true},
  heavy2:  {n:'沉重', fmt:v=>`閃避率歸零`, min:1, max:1, slots:'wat', curse:true},
  frail:   {n:'脆弱', fmt:v=>`受到的傷害 +15%`, min:1, max:1, slots:'wat', curse:true},
};
/* 各稀有度滾值區間 (§4)：素質/生命/法力/功能走 band，率類走 rateBand */
const ROLL_BANDS = {
  stat:  [[3,6],[5,10],[8,16],[12,24]],
  hp:    [[8,14],[12,22],[18,32],[26,46]],
  mp:    [[6,10],[10,16],[14,24],[20,35]],
  rate:  [[2,4],[3,6],[5,9],[7,12]],
  vamp:  [[4,8],[6,12],[9,16],[12,22]],
  touch: [[1,1],[1,1],[2,2],[2,3]],
  thorns:[[2,4],[4,7],[6,11],[9,16]],
  mend:  [[3,5],[5,8],[7,12],[10,18]],
  greed: [[8,14],[12,20],[16,28],[22,40]],
  mregen:[[5,8],[8,13],[12,19],[16,28]],
};
const AFFIX_BAND = {str:'stat',int:'stat',spi:'stat',vit:'stat',agi:'stat',hp:'hp',mp:'mp',
  crit:'rate',defr:'rate',agile:'rate',vamp:'vamp',ptouch:'touch',btouch:'touch',
  thorns:'thorns',mend:'mend',greed:'greed',mregen:'mregen'};
const CURSE_KEYS = ['bloodtax','heavy2','frail'];

const LEG_KEYS = ['vform','wall','fury','spark','guts','luck7','symbio','exem','regen','feast'];

const RARITIES = [
  {id:'white', n:'普通', cls:'r-white', b:'b-white', afx:[0,1], mult:0, val:0.7, upCap:3},
  {id:'blue',  n:'精良', cls:'r-blue',  b:'b-blue',  afx:[1,2], mult:1, val:1.0, upCap:6},
  {id:'gold',  n:'稀有', cls:'r-gold',  b:'b-gold',  afx:[2,3], mult:2, val:1.35, upCap:9},
  {id:'orange',n:'傳說', cls:'r-orange',b:'b-orange',afx:[3,4], mult:4, val:1.8, upCap:12},
];

const WEAPON_NAMES = {
  dagger:['短刃','彎匕','刺針','骨錐','剃刀','袖劍'],
  sword: ['短劍','彎刀','刺劍','雙刃','長劍','闊劍'],
  axe:   ['手斧','戰錘','巨斧','裂顱者','碎骨錘','斬馬斧'],
  staff: ['法杖','骨杖','燭杖','咒杖','引雷杖','牧杖'],
};

const ARMOR_NAMES  = ['皮甲','鎖甲','法袍','胸甲','斗篷','鱗甲'];

const TRINKET_NAMES= ['戒指','護符','懷錶','骨墜','油燈','指環'];

const PREFIX = {white:['破舊的','素面的','無名的'], blue:['精良的','工匠的','磨亮的'],
  gold:['符文','低語的','深淵紋'], orange:['王殞','噬光','無面','母巢']};

const POTIONS = {
  heal:{n:'恢復藥水', i:'🧪', d:'回復 22 點生命', battle:true, any:true},
  energy:{n:'烈酒',   i:'🍶', d:'本回合 +2 能量', battle:true, any:false},
  bomb:{n:'火油瓶',   i:'🔥', d:'對敵人造成 16 點傷害', battle:true, any:false},
  purge:{n:'淨化藥水', i:'💧', d:'清除自身所有負面狀態', battle:true, any:true},
  wrath:{n:'狂暴藥劑', i:'🧨', d:'本場戰鬥傷害 +50%', battle:true, any:false, m:20},
  stone:{n:'石膚藥劑', i:'🪨', d:'獲得 20 點格擋', battle:true, any:false, m:20},
  holy:{n:'聖水',     i:'💦', d:'對所有敵人 14 傷害，清除自身異常', battle:true, any:false, m:20},
};

const MATS = {iron:{n:'沉鐵', i:'⛓️', d:'沉到這個深度的鐵，比地面的密'}, steel:{n:'心鋼', i:'🔩', d:'離心臟越近的金屬，越記得跳動'}};

const REALMS = [
  {n:'淺穴',     i:'🕳️', from:1,  to:10,  intro:'潮濕的岩壁上還留著前人的火把痕跡。這裡死的人最多——因為來的人最多。'},
  {n:'沉沒王國', i:'🏛️', from:11, to:20,  intro:'一座整個沉進深淵的古國。街道還在，只是走在上面的東西換了。水從天花板往上流。'},
  {n:'血肉迴廊', i:'🫁', from:21, to:30,  rule:'heal75', intro:'牆壁是溫的，而且有脈搏。你走的不是通道，是血管。\n\n此域一切回復效果 -25%。'},
  {n:'無光教區', i:'🕯️', from:31, to:40,  intro:'地底的教團在這裡崇拜深淵。他們縫上了自己的眼睛——「看不見的信仰才純粹」。\n\n燭火全是冷的。'},
  {n:'心室',     i:'🫀', from:41, to:50,  intro:'越走越熱，牆壁的搏動和你的心跳漸漸同步。你已經在它的心臟裡了。'},
  {n:'淵底',     i:'🌑', from:51, to:99999, intro:'心臟之下還有東西。沒有人到過這裡——現在有了。'},
];

const BLESSINGS = [
  {k:'str', v:2, n:'力量的祝福：所有傷害 +2'},
  {k:'crit', v:10, n:'銳利的祝福：爆擊率 +10%'},
  {k:'vamp', v:12, n:'血契的祝福：攻擊吸血 12%'},
  {k:'plate', v:3, n:'守勢的祝福：每回合 +3 格擋'},
  {k:'hp', v:15, n:'堅韌的祝福：生命上限 +15'},
];

const EV_REALM = {mine:0, oldfire:0, wreck:1, wishwell:1, cyst:2, vein:2, confess:3, candle:3, bloodspring:4, calcified:4};

const EV_HINTS = {shrine:'香灰味', gambler:'骰子聲', merchant:'燈籠的紅光', spring:'水聲', can:'金屬滾動聲',
  rock:'碎石味', corpse:'腐味', crack:'微光', box:'鐵鏽味', whisper:'低語聲',
  mine:'鎬敲石的回音', oldfire:'煙味', wreck:'船木吱呀聲', wishwell:'銅錢落水聲',
  cyst:'黏膩的搏動', vein:'血腥味', confess:'壓低的呼吸聲', candle:'蠟味', bloodspring:'溫熱的水氣', calcified:'一動不動的人影', scroll:'紙頁翻動聲'};

const RATE_CAP = 70;   // 三率上限% (§5)
const VAMP_CAP = 60;   // 吸血彙總上限%
const MREGEN_CAP = 100; // 回法彙總上限%
const STAT_DIV = [[100,8],[200,16],[Infinity,32]]; // 素質→率 分段換算 (§5)


/* 敵人標籤 (§11)：免疫制門檻 */
const ENEMY_TAGS = {
  pImm: {n:'毒免', i:'☠️🚫', d:'免疫中毒——毒層無法施加，這場改打直傷'},
  bImm: {n:'燃免', i:'🔥🚫', d:'免疫燃燒——燃層無法施加'},
  heavy:{n:'重甲', i:'🪨',   d:'常駐格擋外殼，每回合恢復——斧碾盾、法術繞盾、毒燃無視'},
  naked:{n:'裸皮', i:'🩸',   d:'受到的直接傷害 +15%——快點集火'},
};
const HEAVY_SHELL = 0.12;   // 重甲外殼＝血量×此係數
const LORD_PHASE_TAGS = [   // 域主上/下半場標籤（血線 50% 切換）
  ['heavy','naked'], ['pImm','bImm'], ['bImm','pImm'], ['naked','heavy'],
];
const CYC_MULT = [1.9, 5.5, 15.7];          // 輪迴 I/II/III 強度（§9 錨反解，等比×2.86）

const CYC_VAL  = [0.7, 1.9, 3.9];           // 輪迴裝備價值（×1.7/重）

const CYC_NEXT = 50;                          // 輪迴 N 到此深度解鎖 N+1（可調）

const CYC_PREFIX = [
  {n:'荊棘的', mod:(e,c)=>{ e.thorns = 2 + c*2; }},
  {n:'吸血的', mod:(e,c)=>{ e.evamp = 0.4; }},
  {n:'堅殼的', mod:(e,c)=>{ e.autoblock = 4 + c*3; }},
  {n:'狂怒的', mod:(e,c)=>{ e.dmgMul = 1.25; }},
];

