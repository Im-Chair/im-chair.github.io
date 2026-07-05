'use strict';
// ============ data.js — 純資料層：職業/技能/敵人/Boss/詞綴/藥水/域/事件常數/平衡參數。
// 調平衡改這裡：STAT_CAPS 百分比上限、CYC_MULT 輪迴強度、CYC_NEXT 輪迴解鎖深度 ============

const CLASSES = {
  sword:{name:'劍士', icon:'🛡️', hp:78, crit:5,
    desc:'穩紮穩打。格擋與破甲，把仗打成自己的節奏。',
    skills:['slash','guard','sunder','execute']},
  assassin:{name:'兇解者', icon:'🗡️', hp:62, crit:15,
    desc:'高爆擊。淬毒與暗影，讓敵人死在倒數計時裡。',
    skills:['stab','venom','shadow','garrote']},
  white:{name:'法師', icon:'✨', hp:68, crit:5,
    desc:'白魔法。能打能補能撐盾，活得最久的人贏。',
    skills:['smite','mend','aegis','judge']},
  dark:{name:'制魔師', icon:'🌑', hp:66, crit:8,
    desc:'黑魔法。詛咒與吸命，用敵人的血付自己的帳。',
    skills:['bolt','drain','hex','hellfire']},
};

const SKILLS = {
  slash:{n:'斬擊',c:1,d:'造成 7 點傷害',f:{dmg:7}},
  guard:{n:'堅守',c:1,d:'獲得 8 點格擋',f:{block:8}},
  sunder:{n:'破甲斬',c:2,d:'造成 9 點傷害，敵人易傷 2 回合',f:{dmg:9,apply:{vuln:2}}},
  execute:{n:'處決',c:2,d:'造成 13 點傷害；擊殺時回復 2 能量（下場戰鬥）與 6 血',f:{dmg:13,execKill:true}},
  stab:{n:'疾刺',c:1,d:'造成 6 點傷害',f:{dmg:6}},
  venom:{n:'淬毒',c:1,d:'施加 4 層中毒（每回合受層數傷害，遞減）',f:{apply:{poison:4}}},
  shadow:{n:'暗影步',c:1,d:'獲得 6 點格擋，下一次攻擊必定爆擊',f:{block:6,nextCrit:true}},
  garrote:{n:'絞殺',c:2,d:'造成中毒層數 ×4 的傷害（無中毒則 5）',f:{poisonDmg:4}},
  smite:{n:'聖光',c:1,d:'造成 7 點傷害',f:{dmg:7}},
  mend:{n:'治癒',c:1,d:'回復 9 點生命',f:{heal:9}},
  aegis:{n:'庇護',c:2,d:'獲得 14 點格擋',f:{block:14}},
  judge:{n:'制裁',c:3,d:'造成 24 點傷害',f:{dmg:24}},
  bolt:{n:'暗蝕',c:1,d:'造成 6 點傷害，敵人虛弱 1 回合',f:{dmg:6,apply:{weak:1}}},
  drain:{n:'吸命',c:2,d:'造成 11 點傷害，回復造成傷害的一半',f:{dmg:11,drain:.5}},
  hex:{n:'詛咒',c:1,d:'敵人易傷、虛弱各 2 回合',f:{apply:{vuln:2,weak:2}}},
  hellfire:{n:'冥火',c:3,d:'造成 17 點傷害，施加 6 層燃燒（回合結束受傷後減半）',f:{dmg:17,apply:{burn:6}}},
};
/* 技能精進：每招兩個分支，營火擇一，本次探索有效 */

const SKILL_UPS = {
  slash:  {a:{n:'利刃斬', d:'造成 11 點傷害', mod:f=>{f.dmg=11;}},
           b:{n:'破勢斬', d:'造成 7 點傷害，敵人易傷 1 回合', mod:f=>{f.apply={vuln:1};}}},
  guard:  {a:{n:'壁守', d:'獲得 12 點格擋', mod:f=>{f.block=12;}},
           b:{n:'反守', d:'獲得 8 點格擋，反刺 6 傷害', mod:f=>{f.thornHit=6;}}},
  sunder: {a:{n:'碎甲斬', d:'造成 14 點傷害，敵人易傷 2 回合', mod:f=>{f.dmg=14;}},
           b:{n:'裂魂斬', d:'造成 9 點傷害，敵人易傷 3 回合', mod:f=>{f.apply={vuln:3};}}},
  execute:{a:{n:'斷頭台', d:'造成 19 點傷害；擊殺獎勵不變', mod:f=>{f.dmg=19;}},
           b:{n:'收割者', d:'造成 13 點傷害；擊殺回 3 能量與 12 血', mod:f=>{f.execEnergy=3;f.execHeal=12;}}},
  stab:   {a:{n:'穿刺', d:'造成 9 點傷害', mod:f=>{f.dmg=9;}},
           b:{n:'毒刺', d:'造成 6 點傷害，附 2 層中毒', mod:f=>{f.apply={poison:2};}}},
  venom:  {a:{n:'劇毒', d:'施加 6 層中毒', mod:f=>{f.apply={poison:6};}},
           b:{n:'毒霧', d:'施加 4 層中毒，獲得 4 格擋', mod:f=>{f.block=4;}}},
  shadow: {a:{n:'影遁', d:'獲得 10 點格擋，下次攻擊必爆', mod:f=>{f.block=10;}},
           b:{n:'雙影', d:'獲得 6 點格擋，下兩次攻擊必爆', mod:f=>{f.nextCrit=2;}}},
  garrote:{a:{n:'絞刑', d:'傷害提升為中毒層數 ×5', mod:f=>{f.poisonDmg=5;}},
           b:{n:'速殺', d:'消耗降為 1 能量', mod:(f,sk)=>{sk.c=1;}}},
  smite:  {a:{n:'聖焰', d:'造成 10 點傷害', mod:f=>{f.dmg=10;}},
           b:{n:'懲戒', d:'造成 7 點傷害，敵人虛弱 1 回合', mod:f=>{f.apply={weak:1};}}},
  mend:   {a:{n:'大治癒', d:'回復 14 點生命', mod:f=>{f.heal=14;}},
           b:{n:'聖護', d:'回復 9 血，獲得 5 格擋', mod:f=>{f.block=5;}}},
  aegis:  {a:{n:'聖壁', d:'獲得 20 點格擋', mod:f=>{f.block=20;}},
           b:{n:'荊冠', d:'獲得 14 點格擋，反刺 8 傷害', mod:f=>{f.thornHit=8;}}},
  judge:  {a:{n:'天罰', d:'造成 32 點傷害', mod:f=>{f.dmg=32;}},
           b:{n:'審判', d:'造成 24 點傷害，暈眩 1 回合', mod:f=>{f.apply={stun:1};}}},
  bolt:   {a:{n:'蝕光', d:'造成 9 點傷害，虛弱 1 回合', mod:f=>{f.dmg=9;}},
           b:{n:'衰蝕', d:'造成 6 點傷害，虛弱 2 回合', mod:f=>{f.apply={weak:2};}}},
  drain:  {a:{n:'噬命', d:'造成 15 點傷害，回復一半', mod:f=>{f.dmg=15;}},
           b:{n:'鯨吞', d:'造成 11 點傷害，回復全額', mod:f=>{f.drain=1;}}},
  hex:    {a:{n:'厄咒', d:'易傷、虛弱各 3 回合', mod:f=>{f.apply={vuln:3,weak:3};}},
           b:{n:'腐咒', d:'易傷、虛弱各 2 回合，附 2 層中毒', mod:f=>{f.apply={vuln:2,weak:2,poison:2};}}},
  hellfire:{a:{n:'獄炎', d:'造成 24 點傷害，6 層燃燒', mod:f=>{f.dmg=24;}},
           b:{n:'業火', d:'造成 17 點傷害，10 層燃燒', mod:f=>{f.apply={burn:10};}}},
};
/* 敵人動作: a=攻擊 h=重擊 m=連擊 d=防禦 c=詛咒 v=吸血 s=偷竊 g=蓄力 */

const ENEMIES = {
  /* 淺穴 1-10 */
  rat:   {n:'洞穴巨鼠', i:'🐀', hp:16, realm:0, pat:[{t:'a',v:4},{t:'a',v:5},{t:'a',v:3,ap:{weak:1},nm:'撕咬'}]},
  slime: {n:'腐蝕黏液', i:'🟢', hp:22, realm:0, pat:[{t:'a',v:5,ap:{weak:1},nm:'酸液'},{t:'d',v:5},{t:'a',v:6}]},
  skel:  {n:'骷髏兵',   i:'💀', hp:24, realm:0, pat:[{t:'a',v:6},{t:'d',v:6},{t:'a',v:8}]},
  bat:   {n:'蝙蝠群',   i:'🦇', hp:19, realm:0, pat:[{t:'m',v:3,x:2},{t:'a',v:4},{t:'m',v:2,x:3}]},
  spider:{n:'穴居蛛',   i:'🕷️', hp:21, realm:0, pat:[{t:'a',v:4,ap:{poison:2},nm:'毒牙'},{t:'d',v:5},{t:'a',v:6}]},
  thief: {n:'盜墓賊',   i:'🥷', hp:26, realm:0, pat:[{t:'s',v:6,nm:'搶奪'},{t:'a',v:7},{t:'d',v:6}]},
  garg:  {n:'石像鬼',   i:'🗿', hp:30, realm:0, pat:[{t:'d',v:8},{t:'g',nm:'蓄力'},{t:'h',v:15}]},
  /* 沉沒王國 11-20 */
  drown: {n:'溺水者',   i:'🧟', hp:34, realm:1, pat:[{t:'a',v:9},{t:'v',v:8,nm:'拖拽'},{t:'a',v:10}]},
  eel:   {n:'窟窿鰻',   i:'🐍', hp:30, realm:1, pat:[{t:'m',v:5,x:2},{t:'a',v:11},{t:'d',v:8}]},
  sguard:{n:'沉沒衛兵', i:'♜', hp:40, realm:1, pat:[{t:'d',v:10},{t:'a',v:11},{t:'h',v:15}]},
  jelly: {n:'水母群',   i:'🪼', hp:28, realm:1, pat:[{t:'a',v:8,ap:{weak:1},nm:'螫刺'},{t:'c',ap:{vuln:2},nm:'纏繞'},{t:'a',v:10}]},
  crab:  {n:'珍珠蟹',   i:'🦀', hp:38, realm:1, pat:[{t:'d',v:12},{t:'h',v:15},{t:'a',v:9}]},
  siren: {n:'海妖歌者', i:'🧜', hp:32, realm:1, pat:[{t:'c',ap:{weak:2},nm:'魅歌'},{t:'a',v:10},{t:'v',v:10,nm:'汲取'}]},
  corpse2:{n:'浮屍',    i:'⚰️', hp:36, realm:1, pat:[{t:'a',v:10},{t:'a',v:11},{t:'g',nm:'鼓脹'},{t:'h',v:17,nm:'脹裂'}]},
  /* 血肉迴廊 21-30 */
  leech: {n:'血蛭',     i:'🪱', hp:42, realm:2, pat:[{t:'v',v:11,nm:'吸附'},{t:'v',v:13,nm:'吸附'},{t:'a',v:12}]},
  clot:  {n:'蠕行血塊', i:'🩸', hp:46, realm:2, pat:[{t:'a',v:12},{t:'m',v:7,x:2},{t:'a',v:14}]},
  eye:   {n:'眼球簇',   i:'👁️', hp:40, realm:2, pat:[{t:'c',ap:{weak:2,vuln:2},nm:'凝視'},{t:'g',nm:'蓄力'},{t:'h',v:21,nm:'湮滅光線'}]},
  teeth: {n:'齒牆',     i:'🦷', hp:52, realm:2, pat:[{t:'d',v:13},{t:'a',v:14},{t:'h',v:19,nm:'咬合'}]},
  hound: {n:'雙頭地獄犬',i:'🐕', hp:46, realm:2, pat:[{t:'m',v:7,x:2},{t:'a',v:13},{t:'a',v:10,ap:{weak:2},nm:'咆哮撕咬'}]},
  necro: {n:'亡靈法師', i:'🧙', hp:42, realm:2, pat:[{t:'c',ap:{vuln:2},nm:'咒言'},{t:'a',v:12},{t:'a',v:13}]},
  flower:{n:'食人魔花', i:'🌺', hp:44, realm:2, pat:[{t:'v',v:11,nm:'吸食'},{t:'a',v:13},{t:'v',v:12,nm:'吸食'}]},
  /* 無光教區 31-40 */
  monk:  {n:'苦修士',   i:'🧎', hp:52, realm:3, pat:[{t:'a',v:15},{t:'d',v:13},{t:'a',v:16,ap:{wound:1},nm:'鞭笞'}]},
  choir: {n:'唱詩者',   i:'🎭', hp:48, realm:3, pat:[{t:'c',ap:{weak:2},nm:'低吟'},{t:'a',v:15},{t:'c',ap:{vuln:2},nm:'高音'}]},
  lantern:{n:'提燈人',  i:'🏮', hp:50, realm:3, pat:[{t:'a',v:14,ap:{burn:2},nm:'燈油'},{t:'d',v:13},{t:'h',v:20,ap:{burn:2},nm:'潑焚'}]},
  knight:{n:'深淵騎士', i:'♞', hp:58, realm:3, pat:[{t:'d',v:14},{t:'a',v:16},{t:'h',v:21}]},
  zealot:{n:'盲信者',   i:'🙇', hp:54, realm:3, pat:[{t:'a',v:15},{t:'a',v:15},{t:'g',nm:'禱告'},{t:'h',v:25,nm:'殉道'}]},
  reliq: {n:'聖物匣',   i:'🏺', hp:60, realm:3, pat:[{t:'d',v:16},{t:'c',ap:{wound:2},nm:'聖灰'},{t:'h',v:22}]},
  sister:{n:'影修女',   i:'👥', hp:50, realm:3, pat:[{t:'m',v:8,x:2},{t:'a',v:16,ap:{weak:1},nm:'割禮'},{t:'d',v:12}]},
  /* 心室 41-50 */
  throm: {n:'血栓',     i:'🫘', hp:66, realm:4, pat:[{t:'d',v:17},{t:'a',v:18},{t:'h',v:24,nm:'栓塞'}]},
  valve: {n:'瓣膜守衛', i:'🦾', hp:70, realm:4, pat:[{t:'d',v:19},{t:'h',v:26,nm:'閉鎖'},{t:'a',v:17}]},
  worm:  {n:'心蟲',     i:'🐛', hp:58, realm:4, pat:[{t:'a',v:16,ap:{poison:2},nm:'鑽咬'},{t:'m',v:9,x:2},{t:'a',v:18}]},
  pulse: {n:'脈搏亡魂', i:'👻', hp:60, realm:4, pat:[{t:'a',v:18},{t:'c',ap:{weak:2,vuln:1},nm:'共振'},{t:'h',v:25}]},
  mist:  {n:'血霧',     i:'🌫️', hp:56, realm:4, pat:[{t:'m',v:7,x:3},{t:'v',v:14,nm:'滲透'}]},
  puppet:{n:'腔室傀儡', i:'🪆', hp:72, realm:4, pat:[{t:'d',v:19},{t:'a',v:19},{t:'g',nm:'上弦'},{t:'h',v:31,nm:'斷弦'}]},
  magma: {n:'沸血魔',   i:'🌋', hp:62, realm:4, pat:[{t:'a',v:17,ap:{burn:3},nm:'噴濺'},{t:'d',v:15},{t:'h',v:23,ap:{burn:2,wound:2},nm:'沸流'}]},
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
   pat:[{t:'a',v:10,ap:{poison:3,wound:2},nm:'毒牙'},{t:'v',v:15,nm:'吸食'},{t:'c',ap:{weak:2,vuln:2},nm:'織網'},{t:'h',v:22,nm:'撲殺'}]},
  {key:'bb3', n:'盲眼主教', i:'🛐', hp:215, intro:'主教的眼睛在很多年前獻給了深淵。他朝你的方向精準地轉過頭：「看，多虔誠的祭品，自己走上了祭壇。」',
   pat:[{t:'c',ap:{wound:2,vuln:2},nm:'禱告'},{t:'a',v:17,ap:{wound:1},nm:'聖鞭'},{t:'d',v:18},{t:'g',nm:'冷燭齊燃'},{t:'h',v:31,nm:'神罰'}]},
];
/* 詞綴 */

const AFFIXES = {
  str:  {n:'力量',   fmt:v=>`所有傷害 +${v}`,        min:1, max:4,  slots:'wt'},
  vamp: {n:'吸血',   fmt:v=>`攻擊吸血 ${v}%`,        min:10,max:25, slots:'wt'},
  crit: {n:'銳利',   fmt:v=>`爆擊率 +${v}%`,         min:5, max:18, slots:'wt'},
  ptouch:{n:'淬毒之刃',fmt:v=>`攻擊附加 ${v} 層中毒`, min:1, max:2,  slots:'w'},
  btouch:{n:'燃焰',  fmt:v=>`攻擊附加 ${v} 層燃燒`,   min:1, max:2,  slots:'w'},
  plate:{n:'守勢',   fmt:v=>`每回合開始 +${v} 格擋`,  min:2, max:5,  slots:'at'},
  hp:   {n:'堅韌',   fmt:v=>`生命上限 +${v}`,        min:8, max:24, slots:'at'},
  agile:{n:'輕盈',   fmt:v=>`閃避率 +${v}%`,         min:5, max:14, slots:'at'},
  thorn:{n:'荊棘',   fmt:v=>`反彈近身傷害 ${v}`,      min:2, max:6,  slots:'at'},
  mend: {n:'急救',   fmt:v=>`戰鬥勝利後回復 ${v} 血`, min:4, max:10, slots:'at'},
  greed:{n:'貪婪',   fmt:v=>`碎銀獲取 +${v}%`,       min:20,max:60, slots:'t'},
  ener: {n:'蓄能',   fmt:v=>`每場戰鬥第一回合 +1 能量`,min:1, max:1,  slots:'wt'},
  /* 傳說專屬：改變玩法的機制詞綴 */
  vform:{n:'蝕魂',   fmt:v=>`攻擊不再造成傷害，改為施加其 60% 的中毒層數（以毒為源的傷害除外）`, min:1, max:1, slots:'w', leg:true},
  wall: {n:'壁壘',   fmt:v=>`格擋不再於回合開始時消失`, min:1, max:1, slots:'a', leg:true},
  fury: {n:'狂血',   fmt:v=>`所有傷害 +40%，但生命上限 -30%`, min:1, max:1, slots:'w', leg:true},
  spark:{n:'燧心',   fmt:v=>`爆擊回復 1 能量（每回合至多 2 次）`, min:1, max:1, slots:'t', leg:true},
  guts: {n:'不屈',   fmt:v=>`每場戰鬥第一次受到致死傷害時，改為保留 1 點生命`, min:1, max:1, slots:'a', leg:true},
  luck7:{n:'賭運',   fmt:v=>`爆擊傷害倍率 1.6 → 2.1`, min:1, max:1, slots:'t', leg:true},
  /* 詛咒（只出現在詛咒裝上） */
  symbio:{n:'腐生',  fmt:v=>`敵人因中毒受傷時，你回復其 50% 的生命`, min:1, max:1, slots:'w', leg:true},
  exem:  {n:'斬首',  fmt:v=>`對生命低於 30% 的敵人，傷害 +50%`, min:1, max:1, slots:'w', leg:true},
  regen: {n:'血甲',  fmt:v=>`每回合開始回復 3 點生命`, min:1, max:1, slots:'a', leg:true},
  feast: {n:'貪食',  fmt:v=>`擊殺敵人時回復 15% 生命上限`, min:1, max:1, slots:'t', leg:true},
  bloodtax:{n:'血稅', fmt:v=>`每深入一層，失去 ${v} 點生命`, min:3, max:3, slots:'wat', curse:true},
  heavy2:  {n:'沉重', fmt:v=>`閃避率歸零`, min:1, max:1, slots:'wat', curse:true},
  frail:   {n:'脆弱', fmt:v=>`受到的傷害 +15%`, min:1, max:1, slots:'wat', curse:true},
};

const CURSE_KEYS = ['bloodtax','heavy2','frail'];

const LEG_KEYS = ['vform','wall','fury','spark','guts','luck7','symbio','exem','regen','feast'];

const RARITIES = [
  {id:'white', n:'普通', cls:'r-white', b:'b-white', afx:[0,1], mult:0, val:0.7, upCap:3},
  {id:'blue',  n:'精良', cls:'r-blue',  b:'b-blue',  afx:[1,2], mult:1, val:1.0, upCap:6},
  {id:'gold',  n:'稀有', cls:'r-gold',  b:'b-gold',  afx:[2,3], mult:2, val:1.35, upCap:9},
  {id:'orange',n:'傳說', cls:'r-orange',b:'b-orange',afx:[3,4], mult:4, val:1.8, upCap:12},
];

const WEAPON_NAMES = ['短劍','彎刀','手斧','刺劍','法杖','骨刃','戰錘','雙刃'];

const ARMOR_NAMES  = ['皮甲','鎖甲','法袍','胸甲','斗篷','鱗甲'];

const TRINKET_NAMES= ['戒指','護符','懷錶','骨墜','油燈','指環'];

const PREFIX = {white:['破舊的','素面的','無名的'], blue:['精良的','工匠的','磨亮的'],
  gold:['符文','低語的','深淵紋'], orange:['王殞','噬光','無面','母巢']};

const POTIONS = {
  heal:{n:'治療藥水', i:'🧪', d:'回復 22 點生命', battle:true, any:true},
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
  cyst:'黏膩的搏動', vein:'血腥味', confess:'壓低的呼吸聲', candle:'蠟味', bloodspring:'溫熱的水氣', calcified:'一動不動的人影'};

const STAT_CAPS = {agile:35, vamp:60, crit:75};  // 百分比屬性上限（可調）

const PCT_KEYS = ['agile','vamp','crit'];        // 退出稀有度倍率的百分比詞綴

const CYC_MULT = [1.6, 2.4, 3.5];           // 輪迴 I/II/III 強度

const CYC_VAL  = [0.10, 0.25, 0.40];         // 詞綴數值加成

const CYC_NEXT = 50;                          // 輪迴 N 到此深度解鎖 N+1（可調）

const CYC_PREFIX = [
  {n:'荊棘的', mod:(e,c)=>{ e.thorns = 2 + c*2; }},
  {n:'吸血的', mod:(e,c)=>{ e.evamp = 0.4; }},
  {n:'堅殼的', mod:(e,c)=>{ e.autoblock = 4 + c*3; }},
  {n:'狂怒的', mod:(e,c)=>{ e.dmgMul = 1.25; }},
];

