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
  rageStr: 1,      // 熔獄規則：第 5 回合起，敵人每回合力量增加的量
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
  ram:    {n:'盾撞', cls:'sword', c:1, k:'atk', r:0, fn:'ram', bonus:0, t:'傷害＝格擋', long:'造成等同目前格擋的傷害（現在 {d}），格擋不會消失。', up:{bonus:4, t:'傷害＝格擋+4', long:'造成「目前格擋 +4」的傷害（現在 {d}），格擋不會消失。'}},
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
  hold:   {n:'堅守', cls:'sword', c:1, k:'def', r:2, blk:4, keep:1, t:'格擋 {b}\n下回合不衰減', long:'獲得 {b} 點格擋。下回合開始時，格擋不會減半。', up:{blk:8}},

  /* —— 技巧 —— */
  breath: {n:'喘息', c:1, k:'skl', r:1, draw:2, t:'抽 2', long:'抽 2 張。', up:{c:0}},
  shout:  {n:'戰吼', c:1, k:'skl', r:2, str:2, exhaust:1, t:'力量 +2\n本場消耗', long:'本場戰鬥力量 +2（每次攻擊傷害 +2）。使用後本場消耗。', up:{str:3, t:'力量 +3\n本場消耗', long:'本場戰鬥力量 +3（每次攻擊傷害 +3）。使用後本場消耗。'}},
  rage:   {n:'怒火', c:1, k:'skl', r:2, fn:'rage', exhaust:1, t:'傷痕全轉力量\n本場消耗', long:'清空傷痕，每層轉成 1 點力量。使用後本場消耗。', up:{c:0}},
  lick:   {n:'舔傷', c:1, k:'skl', r:1, heal:6, exhaust:1, t:'回復 6\n本場消耗', long:'回復 6 點生命。使用後本場消耗。', up:{heal:10, t:'回復 10\n本場消耗', long:'回復 10 點生命。使用後本場消耗。'}},
  lust:   {n:'貪念', c:0, k:'skl', r:2, ap:2, greed:5, exhaust:1, t:'行動點 +2\n貪婪 +5', long:'獲得 2 行動點，貪婪 +5。使用後本場消耗。', up:{ap:3, t:'行動點 +3\n貪婪 +5', long:'獲得 3 行動點，貪婪 +5。使用後本場消耗。'}},

  /* —— 盜賊專屬：毒（敵人身上，輪到牠行動時先受毒層傷害再 -1）、連擊（本回合已出的牌數）—— */
  jab:    {n:'小刀', cls:'rogue', c:1, k:'atk', r:0, dmg:5, t:'傷害 {d}', long:'造成 {d} 點傷害。', up:{dmg:8}},
  slip:   {n:'側閃', cls:'rogue', c:1, k:'def', r:0, blk:5, t:'格擋 {b}', long:'獲得 {b} 點格擋。', up:{blk:8}},
  coat:   {n:'淬毒', cls:'rogue', c:1, k:'atk', r:0, dmg:2, psn:3, t:'傷害 {d}\n毒 3', long:'造成 {d} 點傷害，目標中毒 3。', up:{dmg:3, psn:5, t:'傷害 {d}\n毒 5', long:'造成 {d} 點傷害，目標中毒 5。'}},
  quick:  {n:'疾步', cls:'rogue', c:0, k:'skl', r:0, draw:1, t:'抽 1', long:'抽 1 張。', up:{draw:2, t:'抽 2', long:'抽 2 張。'}},
  sting:  {n:'蜂針', cls:'rogue', c:0, k:'atk', r:1, dmg:2, psn:1, t:'傷害 {d}\n毒 1', long:'造成 {d} 點傷害，目標中毒 1。', up:{dmg:3, psn:2, t:'傷害 {d}\n毒 2', long:'造成 {d} 點傷害，目標中毒 2。'}},
  viper:  {n:'毒牙', cls:'rogue', c:1, k:'atk', r:1, dmg:4, psn:4, t:'傷害 {d}\n毒 4', long:'造成 {d} 點傷害，目標中毒 4。', up:{dmg:5, psn:6, t:'傷害 {d}\n毒 6', long:'造成 {d} 點傷害，目標中毒 6。'}},
  knives: {n:'飛刀網', cls:'rogue', c:1, k:'atk', r:1, dmg:3, all:1, apsn:1, t:'全體傷害 {d}\n全體毒 1', long:'對所有敵人造成 {d} 點傷害，並使他們中毒 1。', up:{dmg:4, apsn:2, t:'全體傷害 {d}\n全體毒 2', long:'對所有敵人造成 {d} 點傷害，並使他們中毒 2。'}},
  rush:   {n:'追擊', cls:'rogue', c:1, k:'atk', r:1, dmg:4, cmb:2, t:'傷害 {d}\n連擊每張+2', long:'造成 {d} 點傷害；本回合每已出一張牌，傷害再 +2（連擊）。', up:{dmg:5, cmb:3, t:'傷害 {d}\n連擊每張+3', long:'造成 {d} 點傷害；本回合每已出一張牌，傷害再 +3（連擊）。'}},
  flurry: {n:'連環刺', cls:'rogue', c:0, k:'atk', r:1, dmg:3, hits:2, t:'傷害 {d}×2', long:'造成 {d} 點傷害，共 2 次。', up:{dmg:4, hits:3, t:'傷害 {d}×3', long:'造成 {d} 點傷害，共 3 次。'}},
  smoke:  {n:'煙幕', cls:'rogue', c:1, k:'def', r:1, blk:8, t:'格擋 {b}', long:'獲得 {b} 點格擋。', up:{blk:12}},
  cloud:  {n:'毒霧', cls:'rogue', c:2, k:'skl', r:1, apsn:4, t:'全體毒 4', long:'所有敵人中毒 4。', up:{apsn:6, t:'全體毒 6', long:'所有敵人中毒 6。'}},
  rain:   {n:'刀雨', cls:'rogue', c:2, k:'atk', r:1, dmg:4, all:1, cmb:1, t:'全體傷害 {d}\n連擊每張+1', long:'對所有敵人造成 {d} 點傷害；本回合每已出一張牌，傷害再 +1（連擊）。', up:{dmg:5, cmb:2, t:'全體傷害 {d}\n連擊每張+2', long:'對所有敵人造成 {d} 點傷害；本回合每已出一張牌，傷害再 +2（連擊）。'}},
  finale: {n:'終結一擊', cls:'rogue', c:2, k:'atk', r:2, dmg:6, cmb:4, t:'傷害 {d}\n連擊每張+4', long:'造成 {d} 點傷害；本回合每已出一張牌，傷害再 +4（連擊）。先打出便宜的牌再用。', up:{dmg:8, cmb:5, t:'傷害 {d}\n連擊每張+5', long:'造成 {d} 點傷害；本回合每已出一張牌，傷害再 +5（連擊）。先打出便宜的牌再用。'}},
  pop:    {n:'引毒', cls:'rogue', c:1, k:'atk', r:2, fn:'pop', mul:2, t:'傷害＝毒×2\n毒清空', long:'造成「目標的毒層數 ×2」的傷害（現在 {d}），然後清除毒。', up:{mul:3, t:'傷害＝毒×3\n毒清空', long:'造成「目標的毒層數 ×3」的傷害（現在 {d}），然後清除毒。'}},
  catal:  {n:'催化', cls:'rogue', c:1, k:'skl', r:2, dpsn:1, t:'目標的毒加倍', long:'目標的毒層數變兩倍。', up:{c:0}},
  adren:  {n:'腎上腺素', cls:'rogue', c:0, k:'skl', r:2, ap:1, draw:1, exhaust:1, t:'行動點 +1\n抽 1・消耗', long:'獲得 1 行動點，抽 1 張。使用後本場消耗。', up:{draw:2, t:'行動點 +1\n抽 2・消耗', long:'獲得 1 行動點，抽 2 張。使用後本場消耗。'}},
  tox:    {n:'劇毒瓶', cls:'rogue', c:2, k:'skl', r:2, psn:9, t:'目標毒 9', long:'目標中毒 9。', up:{psn:14, t:'目標毒 14', long:'目標中毒 14。'}},

  /* —— 法師專屬：回合結束沒用完的行動點存成法力（上限 5，跨回合保留）。法術牌打出時吃掉全部法力，每點額外加成 —— */
  spark:  {n:'火花', cls:'mage', c:1, k:'atk', r:0, sp:1, dmg:7, mx:3, t:'法術 傷害 {d}\n每法力+3', long:'法術：造成 {d} 點傷害，並吃掉全部法力，每點法力傷害 +3。', up:{dmg:10, mx:4, t:'法術 傷害 {d}\n每法力+4', long:'法術：造成 {d} 點傷害，並吃掉全部法力，每點法力傷害 +4。'}},
  ward:   {n:'結界', cls:'mage', c:1, k:'def', r:0, blk:8, t:'格擋 {b}', long:'獲得 {b} 點格擋。', up:{blk:11}},
  bolt:   {n:'奧術彈', cls:'mage', c:2, k:'atk', r:0, sp:1, dmg:10, mx:4, t:'法術 傷害 {d}\n每法力+4', long:'法術：造成 {d} 點傷害，並吃掉全部法力，每點法力傷害 +4。', up:{dmg:14, mx:5, t:'法術 傷害 {d}\n每法力+5', long:'法術：造成 {d} 點傷害，並吃掉全部法力，每點法力傷害 +5。'}},
  focus:  {n:'凝神', cls:'mage', c:0, k:'skl', r:0, mana:2, t:'法力 +2', long:'獲得 2 點法力。', up:{mana:3, t:'法力 +3', long:'獲得 3 點法力。'}},
  shard:  {n:'魔晶', cls:'mage', c:1, k:'atk', r:1, dmg:6, mana:1, t:'傷害 {d}\n法力 +1', long:'造成 {d} 點傷害，獲得 1 點法力。', up:{dmg:9, mana:2, t:'傷害 {d}\n法力 +2', long:'造成 {d} 點傷害，獲得 2 點法力。'}},
  chill:  {n:'寒氣', cls:'mage', c:1, k:'atk', r:1, dmg:4, vuln:2, t:'傷害 {d}\n易傷 2', long:'造成 {d} 點傷害，並給予 2 回合易傷（受到的傷害 +50%）。', up:{dmg:6, vuln:3, t:'傷害 {d}\n易傷 3', long:'造成 {d} 點傷害，並給予 3 回合易傷（受到的傷害 +50%）。'}},
  siphon: {n:'汲取', cls:'mage', c:0, k:'skl', r:1, mana:2, t:'法力 +2', long:'獲得 2 點法力。', up:{mana:3, t:'法力 +3', long:'獲得 3 點法力。'}},
  arcane: {n:'秘藏', cls:'mage', c:1, k:'skl', r:1, draw:2, mana:1, t:'抽 2\n法力 +1', long:'抽 2 張，獲得 1 點法力。', up:{c:0}},
  bank:   {n:'儲能', cls:'mage', c:1, k:'def', r:1, blk:6, mana:1, t:'格擋 {b}\n法力 +1', long:'獲得 {b} 點格擋，獲得 1 點法力。', up:{blk:9}},
  prism:  {n:'稜鏡', cls:'mage', c:1, k:'atk', r:1, sp:1, dmg:3, hits:3, mx:1, t:'法術 傷害 {d}×3\n每法力+1', long:'法術：造成 {d} 點傷害，共 3 次，並吃掉全部法力，每點法力讓每次傷害 +1。', up:{dmg:4, mx:2, t:'法術 傷害 {d}×3\n每法力+2', long:'法術：造成 {d} 點傷害，共 3 次，並吃掉全部法力，每點法力讓每次傷害 +2。'}},
  barrier:{n:'魔力護盾', cls:'mage', c:1, k:'def', r:1, sp:1, blk:4, mb:3, t:'法術 格擋 {b}\n每法力+3', long:'法術：獲得 {b} 點格擋，並吃掉全部法力，每點法力格擋 +3。', up:{blk:6, mb:4, t:'法術 格擋 {b}\n每法力+4', long:'法術：獲得 {b} 點格擋，並吃掉全部法力，每點法力格擋 +4。'}},
  lance:  {n:'冰錐', cls:'mage', c:2, k:'atk', r:1, sp:1, dmg:10, mx:2, vuln:1, t:'法術 傷害 {d}\n易傷 1・每法力+2', long:'法術：造成 {d} 點傷害，給予 1 回合易傷，並吃掉全部法力，每點法力傷害 +2。', up:{dmg:13, mx:3, t:'法術 傷害 {d}\n易傷 1・每法力+3', long:'法術：造成 {d} 點傷害，給予 1 回合易傷，並吃掉全部法力，每點法力傷害 +3。'}},
  chain:  {n:'連鎖閃電', cls:'mage', c:2, k:'atk', r:2, sp:1, dmg:7, all:1, mx:2, t:'法術 全體傷害 {d}\n每法力+2', long:'法術：對所有敵人造成 {d} 點傷害，並吃掉全部法力，每點法力傷害 +2。', up:{dmg:9, mx:3, t:'法術 全體傷害 {d}\n每法力+3', long:'法術：對所有敵人造成 {d} 點傷害，並吃掉全部法力，每點法力傷害 +3。'}},
  meteor: {n:'隕石', cls:'mage', c:3, k:'atk', r:2, sp:1, dmg:18, mx:5, t:'法術 傷害 {d}\n每法力+5', long:'法術：造成 {d} 點傷害，並吃掉全部法力，每點法力傷害 +5。', up:{dmg:24, mx:6, t:'法術 傷害 {d}\n每法力+6', long:'法術：造成 {d} 點傷害，並吃掉全部法力，每點法力傷害 +6。'}},
  echo:   {n:'回響', cls:'mage', c:2, k:'atk', r:2, sp:1, nokeep:1, dmg:10, mx:2, t:'法術 傷害 {d}\n每法力+2・不耗法力', long:'法術：造成 {d} 點傷害，每點法力傷害 +2，但不會消耗法力。', up:{dmg:13, mx:3, t:'法術 傷害 {d}\n每法力+3・不耗法力', long:'法術：造成 {d} 點傷害，每點法力傷害 +3，但不會消耗法力。'}},
  overl:  {n:'超載', cls:'mage', c:0, k:'skl', r:2, mana:3, selfHp:4, exhaust:1, t:'法力 +3\n失去 4 生命・消耗', long:'失去 4 點生命（無視格擋），獲得 3 點法力。使用後本場消耗。', up:{mana:4, selfHp:3, t:'法力 +4\n失去 3 生命・消耗', long:'失去 3 點生命（無視格擋），獲得 4 點法力。使用後本場消耗。'}},

  /* —— 制魔師專屬：咒印（敵人身上，每層讓牠受到的每次傷害 +1，不會消失）與力量（整場疊加）。身上每件詛咒財寶，開場給全體敵人 1 層咒印 —— */
  dark:   {n:'暗刃', cls:'warlock', c:1, k:'atk', r:0, dmg:5, t:'傷害 {d}', long:'造成 {d} 點傷害。', up:{dmg:8}},
  charm:  {n:'護符', cls:'warlock', c:1, k:'def', r:0, blk:5, t:'格擋 {b}', long:'獲得 {b} 點格擋。', up:{blk:8}},
  brand:  {n:'烙印', cls:'warlock', c:1, k:'atk', r:0, dmg:3, mk:2, t:'傷害 {d}\n咒印 2', long:'造成 {d} 點傷害，目標 +2 咒印（每層讓牠受到的每次傷害 +1）。', up:{dmg:4, mk:3, t:'傷害 {d}\n咒印 3', long:'造成 {d} 點傷害，目標 +3 咒印（每層讓牠受到的每次傷害 +1）。'}},
  oath:   {n:'血契', cls:'warlock', c:0, k:'skl', r:0, str:1, selfHp:3, t:'力量 +1\n失去 3 生命', long:'失去 3 點生命（無視格擋），本場戰鬥力量 +1。', up:{str:2, t:'力量 +2\n失去 3 生命', long:'失去 3 點生命（無視格擋），本場戰鬥力量 +2。'}},
  hexall: {n:'蔓延', cls:'warlock', c:1, k:'skl', r:0, amk:1, t:'全體咒印 1', long:'所有敵人 +1 咒印。', up:{amk:2, t:'全體咒印 2', long:'所有敵人 +2 咒印。'}},
  touch:  {n:'詛咒觸', cls:'warlock', c:0, k:'atk', r:1, dmg:2, mk:1, t:'傷害 {d}\n咒印 1', long:'造成 {d} 點傷害，目標 +1 咒印。', up:{dmg:3, mk:2, t:'傷害 {d}\n咒印 2', long:'造成 {d} 點傷害，目標 +2 咒印。'}},
  drain:  {n:'吸魂', cls:'warlock', c:1, k:'atk', r:1, dmg:5, heal:3, t:'傷害 {d}\n回復 3', long:'造成 {d} 點傷害，回復 3 點生命。', up:{dmg:7, heal:5, t:'傷害 {d}\n回復 5', long:'造成 {d} 點傷害，回復 5 點生命。'}},
  sear:   {n:'灼印', cls:'warlock', c:2, k:'atk', r:1, dmg:6, mk:4, t:'傷害 {d}\n咒印 4', long:'造成 {d} 點傷害，目標 +4 咒印。', up:{dmg:8, mk:6, t:'傷害 {d}\n咒印 6', long:'造成 {d} 點傷害，目標 +6 咒印。'}},
  plague: {n:'疫咒', cls:'warlock', c:2, k:'skl', r:1, amk:3, t:'全體咒印 3', long:'所有敵人 +3 咒印。', up:{amk:5, t:'全體咒印 5', long:'所有敵人 +5 咒印。'}},
  rite:   {n:'祭儀', cls:'warlock', c:1, k:'skl', r:1, str:2, selfHp:3, t:'力量 +2\n失去 3 生命', long:'失去 3 點生命（無視格擋），本場戰鬥力量 +2。', up:{str:3, t:'力量 +3\n失去 3 生命', long:'失去 3 點生命（無視格擋），本場戰鬥力量 +3。'}},
  shroud: {n:'暗幕', cls:'warlock', c:1, k:'def', r:1, blk:8, t:'格擋 {b}', long:'獲得 {b} 點格擋。', up:{blk:12}},
  lash:   {n:'鞭笞', cls:'warlock', c:1, k:'atk', r:1, dmg:4, hits:2, mk:1, t:'傷害 {d}×2\n咒印 1', long:'造成 {d} 點傷害，共 2 次（每次都吃咒印加成），之後目標 +1 咒印。', up:{dmg:5, hits:3, t:'傷害 {d}×3\n咒印 1', long:'造成 {d} 點傷害，共 3 次（每次都吃咒印加成），之後目標 +1 咒印。'}},
  cblade: {n:'詛咒之刃', cls:'warlock', c:1, k:'atk', r:1, fn:'curse', base:6, per:3, t:'傷害 6\n每件詛咒財寶+3', long:'造成 6 點傷害，身上每件詛咒財寶再 +3（現在 {d}）。', up:{base:8, per:4, t:'傷害 8\n每件詛咒財寶+4', long:'造成 8 點傷害，身上每件詛咒財寶再 +4（現在 {d}）。'}},
  wither: {n:'枯萎', cls:'warlock', c:1, k:'atk', r:1, dmg:4, vuln:2, mk:1, t:'傷害 {d}\n易傷 2・咒印 1', long:'造成 {d} 點傷害，給予 2 回合易傷，目標 +1 咒印。', up:{dmg:6, vuln:3, t:'傷害 {d}\n易傷 3・咒印 1', long:'造成 {d} 點傷害，給予 3 回合易傷，目標 +1 咒印。'}},
  det:    {n:'引爆', cls:'warlock', c:1, k:'atk', r:2, fn:'det', per:3, t:'傷害＝咒印×3\n咒印清空', long:'造成「目標咒印層數 ×3」的傷害（現在 {d}），然後清除咒印。', up:{per:4, t:'傷害＝咒印×4\n咒印清空', long:'造成「目標咒印層數 ×4」的傷害（現在 {d}），然後清除咒印。'}},
  doom:   {n:'末日宣告', cls:'warlock', c:2, k:'atk', r:2, fn:'doom', base:10, per:2, t:'傷害 10\n咒印每層+2', long:'造成 10 點傷害，目標每層咒印再 +2（現在 {d}）。咒印不會消失。', up:{base:14, per:3, t:'傷害 14\n咒印每層+3', long:'造成 14 點傷害，目標每層咒印再 +3（現在 {d}）。咒印不會消失。'}},
  sac:    {n:'獻祭', cls:'warlock', c:1, k:'skl', r:2, fn:'sac', exhaust:1, str:3, amk:3, t:'燒最貴的詛咒財寶\n力量+3・全體咒印 3', long:'燒掉背包裡最值錢的詛咒財寶（沒有就沒效果），力量 +3，所有敵人 +3 咒印。本場消耗。', up:{str:4, amk:4, t:'燒最貴的詛咒財寶\n力量+4・全體咒印 4', long:'燒掉背包裡最值錢的詛咒財寶（沒有就沒效果），力量 +4，所有敵人 +4 咒印。本場消耗。'}},
  ritual: {n:'黑暗儀式', cls:'warlock', c:2, k:'skl', r:2, str:2, amk:3, exhaust:1, t:'力量 +2\n全體咒印 3・消耗', long:'力量 +2，所有敵人 +3 咒印。使用後本場消耗。', up:{str:3, amk:4, t:'力量 +3\n全體咒印 4・消耗', long:'力量 +3，所有敵人 +4 咒印。使用後本場消耗。'}},

  /* —— 成就解鎖的中立牌：ach＝達成該成就後才進獎勵牌池（S.unlocked 記錄）—— */
  scout:  {n:'探路', ach:'first', c:0, k:'skl', r:1, draw:1, exhaust:1, t:'抽 1\n本場消耗', long:'抽 1 張。使用後本場消耗。', up:{draw:2, t:'抽 2\n本場消耗', long:'抽 2 張。使用後本場消耗。'}},
  hoardhit:{n:'財寶重擊', ach:'hoard6', c:1, k:'atk', r:1, fn:'bagdmg', base:4, per:3, t:'傷害 4\n每件身上財寶+3', long:'造成 4 點傷害，身上每件財寶再 +3（現在 {d}）。帶得越滿越痛。', up:{base:6, per:4, t:'傷害 6\n每件身上財寶+4', long:'造成 6 點傷害，身上每件財寶再 +4（現在 {d}）。帶得越滿越痛。'}},
  cursewall:{n:'厄運壁', ach:'curse3', c:1, k:'def', r:1, blk:5, cb:4, t:'格擋 {b}\n每件詛咒財寶+4', long:'獲得 {b} 點格擋，身上每件詛咒財寶再 +4。', up:{blk:7, cb:5, t:'格擋 {b}\n每件詛咒財寶+5', long:'獲得 {b} 點格擋，身上每件詛咒財寶再 +5。'}},
  gazebite:{n:'深淵凝視', ach:'gaze', c:1, k:'atk', r:2, dmg:6, gt:4, t:'傷害 {d}\n貪婪階級每階+4', long:'造成 {d} 點傷害，貪婪階級每高一階再 +4（動心 +4、眼紅 +8…）。', up:{dmg:8, gt:5, t:'傷害 {d}\n貪婪階級每階+5', long:'造成 {d} 點傷害，貪婪階級每高一階再 +5。'}},
  ironwill:{n:'鐵骨', ach:'noheal', c:1, k:'skl', r:2, blk:8, str:1, exhaust:1, t:'格擋 {b}\n力量 +1・消耗', long:'獲得 {b} 點格擋，本場戰鬥力量 +1。使用後本場消耗。', up:{blk:12, str:2, t:'格擋 {b}\n力量 +2・消耗', long:'獲得 {b} 點格擋，本場戰鬥力量 +2。使用後本場消耗。'}},
  ashes:  {n:'灰燼', ach:'burn5', c:1, k:'skl', r:2, ap:1, draw:2, greed:-4, exhaust:1, t:'行動點 +1・抽 2\n貪婪 -4・消耗', long:'獲得 1 行動點，抽 2 張，貪婪 -4。使用後本場消耗。', up:{draw:3, t:'行動點 +1・抽 3\n貪婪 -4・消耗', long:'獲得 1 行動點，抽 3 張，貪婪 -4。使用後本場消耗。'}},

  /* —— 敵人塞進牌堆的雜物 —— */
  goo:    {n:'黏液', c:1, k:'bad', r:-1, exhaust:1, t:'沒有效果\n打掉才會消失', long:'沒有任何效果，只佔手牌。花 1 行動點打掉就會消失。'},
};
const STARTER_DECK = ['chop','chop','chop','chop','raise','raise','raise','raise','ram','rend'];

/* 職業。need：meta.depth 要達到幾（打贏第 N 層首領後解鎖，劍士一開始就有）。hand：每回合抽牌數（預設 GAME.hand）。
   deck：起始牌組。how：開場說明用的機制重點。牌池＝沒標 cls 的中立牌＋本職牌 */
const CLASSES = {
  sword:   {n:'劍士', hp:70, img:'ui/cls_sword.webp', need:0, deck:STARTER_DECK, line:'格擋只衰減一半，可以累積，慢慢堆出銅牆鐵壁再反擊。',
            how:'格擋每回合只衰減一半，所以防禦牌可以累積；盾撞會把格擋砸成傷害。'},
  rogue:   {n:'盜賊', hp:60, img:'ui/cls_assassin.webp', need:1, hand:6, deck:['jab','jab','jab','jab','slip','slip','slip','coat','coat','quick'], line:'抽牌多、牌便宜。疊毒讓敵人自己流血，再用連擊收尾。',
            how:'每回合抽 6 張。<b>毒</b>：掛在敵人身上，輪到牠行動時先受毒層數的傷害，然後毒 -1。<b>連擊</b>：本回合已出的牌數，追擊、終結一擊等牌依此加傷。格擋每回合清空。'},
  mage:    {n:'法師', hp:50, img:'ui/cls_white.webp', need:2, mana0:3, hand:6, deck:['spark','spark','spark','spark','ward','ward','ward','bolt','bolt','focus'], line:'血少，但回合結束沒用完的行動點會存成法力，蓄一回合、爆一回合。',
            how:'<b>法力</b>：回合結束沒用完的行動點會存成法力（上限 5，跨回合保留）。<b>法術</b>牌打出時吃掉全部法力，每點法力讓效果更強。格擋每回合清空。'},
  warlock: {n:'制魔師', hp:65, img:'ui/cls_dark.webp', need:3, deck:['dark','dark','dark','charm','charm','charm','brand','brand','oath','hexall'], line:'前期慢，咒印和力量越疊越強；詛咒財寶是你的朋友。',
            how:'<b>咒印</b>：掛在敵人身上，每層讓牠受到的每次傷害 +1，不會消失，部分牌可引爆。<b>力量</b>整場戰鬥疊加。身上每有一件詛咒財寶，開場給全體敵人 1 層咒印。格擋每回合清空。'},
};
const CLASS_ORDER = ['sword', 'rogue', 'mage', 'warlock'];
const MANA_MAX = 5;

/* 敵人
   pat 依序循環：a 攻擊（x 連擊）／d 格擋／weak·vuln·psn 附加狀態／charge 蓄力（這回合不攻擊、獲得 d 格擋，下一招必須是重擊；畫面會預告）
                 goo 塞雜物／steal 偷財寶／flee 帶著贓物逃跑／summon 叫小怪／str 加力量
   B1 新增（全部由資料驅動，畫面會預告）：drain 攻擊打掉的生命轉成自己的血／vuln 讓你易傷／burn 燃燒（你每回合結束失去等量生命，之後 -1）／
                 ap 燒掉你下回合的行動點／astr·ablk·aheal 替友軍加力量·格擋·治療（沒有友軍就給自己；all:1 連自己一起）／boom 攻擊後自爆
   敵人欄位：revive 倒下後站起來一次／dodge 閃避率／half:{str,nm} 血量過半後力量大增／
             form2:{n,art,pat,grow,heal} 血量過半換形態（招式重來、換名字換圖，grow 每回合結束力量成長，heal 換形態時回復的比例）
   nm：招式名（沒有就只顯示數字） */
const ENEMIES = {
  rat:    {n:'岩背豬',   hp:20, pat:[{a:5},{a:4,weak:1,nm:'撕咬'},{a:6}]},
  bat:    {n:'穴居蝠',   hp:14, pat:[{a:3,x:2},{a:4},{a:2,x:3}]},
  spider: {n:'食影絨團', hp:20, pat:[{a:3,psn:2,nm:'毒牙'},{d:5},{a:6}]},
  slime:  {n:'洞穴黏泥', hp:28, pat:[{a:4},{goo:2,nm:'噴黏液'},{a:6}]},
  skel:   {n:'骷髏兵',   hp:22, revive:0.4, pat:[{a:6},{d:6},{a:8}]},
  thief:  {n:'拾荒哥布林',hp:24, pat:[{a:4},{steal:1,nm:'順手牽羊'},{flee:1,nm:'開溜'}]},
  garg:   {n:'落石怪',   hp:36, pat:[{d:8},{charge:1,d:4,nm:'蓄力'},{a:15,nm:'崩落'}]},
  /* 菁英 */
  miner:  {n:'廢坑礦工', hp:62, elite:1, pat:[{a:8},{a:4,x:3,nm:'亂鎬'},{str:2,d:8,nm:'喃喃自語'}]},
  ratking:{n:'鼠王', hp:54, elite:1, pat:[{summon:'rat',nm:'呼朋引伴'},{a:9},{a:5,weak:2,nm:'咆哮'}]},
  mimic:  {n:'寶箱怪',   hp:58, elite:1, pat:[{a:12,nm:'咬合'},{steal:1,nm:'吞掉財寶'},{a:7,x:2}]},
  /* 首領 */
  /* 舊版首領圖（mb0 等）是元素系 Q 版角色，跟石棺對不上；先借用棺龕造型的 reliq，之後可換專屬圖 */
  sarc:   {n:'石棺守衛', art:'reliq', hp:220, boss:1, pat:[{a:10},{d:12},{charge:1,d:6,nm:'高舉棺蓋'},{a:22,nm:'棺蓋砸落'},{summon:'skel',nm:'開棺'},{a:6,x:2}]},
  /* —— 哥布林聚落 —— */
  drown:  {n:'火油哥布林', hp:22, pat:[{a:4},{vuln:1,nm:'潑油'},{a:7}]},
  eel:    {n:'骨哨斥候', hp:16, pat:[{a:3,x:3,nm:'連刺'},{a:4},{a:2,x:4,nm:'亂射'}]},
  sguard: {n:'廢鐵擂手', hp:30, pat:[{d:6},{charge:1,d:4,nm:'掄臂'},{a:14,nm:'擂擊'}]},
  jelly:  {n:'童兵團',   hp:12, pat:[{a:3},{a:4},{a:2,x:2}]},
  crab:   {n:'捕獸匠',   hp:26, pat:[{d:8,nm:'架網'},{a:12,nm:'獸夾'},{a:5}]},
  siren:  {n:'聚落薩滿', hp:20, pat:[{weak:1,nm:'詛咒'},{ablk:6,nm:'庇護'},{a:5}]},
  corpse2:{n:'食腐者',   hp:18, pat:[{a:4},{charge:1,nm:'鼓脹'},{a:13,boom:1,nm:'自爆'}]},
  priest: {n:'大酋長',   hp:60, elite:1, pat:[{summon:'jelly',nm:'召喚童兵'},{a:9},{a:5,weak:2,nm:'咆哮'}]},
  raider: {n:'掠奪長',   hp:56, elite:1, pat:[{a:8},{steal:1,nm:'搜刮'},{a:6,x:2},{d:8}]},
  /* —— 無光通道 —— */
  leech:  {n:'盲眼群蝠', hp:16, pat:[{a:3,x:2,drain:1,nm:'啃咬'},{a:4},{a:2,x:3,drain:1}]},
  clot:   {n:'回聲獵手', hp:18, pat:[{a:2,x:4,nm:'回聲'},{a:5},{a:3,x:3}]},
  eye:    {n:'深處之眼', hp:24, pat:[{charge:1,d:4,nm:'聚光'},{a:11,weak:1,vuln:1,nm:'光線'},{d:6}]},
  teeth:  {n:'岩肌盲獸', hp:32, pat:[{d:6},{a:12,nm:'重咬'},{a:5}]},
  hound:  {n:'噬光獸',   hp:22, pat:[{a:5},{ap:1,nm:'撲滅火光'},{a:3,goo:1,nm:'撕扯'}]},
  necro:  {n:'闇語者',   hp:22, pat:[{vuln:1,nm:'低語'},{summon:'leech',nm:'召喚蝠群'},{a:6}]},
  flower: {n:'盲蔓',     hp:32, pat:[{a:3,drain:1,nm:'纏繞'},{a:5,drain:1},{d:6}]},
  stitch: {n:'闇行者',   hp:54, elite:1, dodge:0.3, pat:[{a:7},{a:4,x:3},{d:6,weak:1}]},
  swarm:  {n:'群眼',     hp:50, elite:1, pat:[{a:2,x:3,str:1,nm:'注視'},{d:6},{a:2,x:4,str:1,nm:'無數的眼'}]},
  /* —— 舊都 —— */
  monk:   {n:'遊魂居民', hp:22, pat:[{a:5},{a:4,weak:1},{a:6}]},
  choir:  {n:'廣場悲鳴者',hp:20, pat:[{astr:1,all:1,nm:'悲鳴'},{a:4},{a:5}]},
  lantern:{n:'巡夜人',   hp:24, pat:[{a:4,burn:2,nm:'提燈'},{d:6},{a:6}]},
  knight: {n:'石衛',     hp:30, pat:[{d:10},{a:10,nm:'劈擊'},{d:8},{a:12,nm:'重劈'}]},
  zealot: {n:'殉城者',   hp:20, pat:[{a:4},{charge:1,nm:'祈禱'},{a:15,boom:1,nm:'殉城'}]},
  reliq:  {n:'遺物匣',   hp:26, pat:[{a:4,goo:1,nm:'裂開'},{a:6},{goo:2,nm:'吐出舊物'}]},
  sister: {n:'無聲居民', hp:20, pat:[{a:2,x:3},{aheal:6,nm:'安魂'},{a:5}]},
  inquis: {n:'執法官',   hp:60, elite:1, pat:[{a:8},{str:2,d:6,nm:'審判'},{a:5,x:2}]},
  warden: {n:'斷斧衛長', hp:64, elite:1, pat:[{a:9},{d:12},{charge:1,d:6,nm:'舉斧'},{a:20,nm:'斷斧'}]},
  /* —— 熔獄 —— */
  throm:  {n:'熔渣凝塊', hp:34, pat:[{d:6},{a:12,nm:'砸落'},{a:5}]},
  valve:  {n:'熔爐衛',   hp:28, pat:[{charge:1,d:6,nm:'加壓'},{a:15,nm:'噴爐'},{a:4}]},
  worm:   {n:'熔岩幼龍', hp:24, pat:[{a:4,psn:2,nm:'毒息'},{a:6},{d:6}]},
  pulse:  {n:'灰燼遊魂', hp:18, pat:[{weak:1,vuln:1,nm:'灰燼'},{a:5},{a:3,x:2}]},
  mist:   {n:'硫磺瘴',   hp:22, pat:[{a:4,drain:1,nm:'侵蝕'},{d:5},{a:6,drain:1}]},
  puppet: {n:'焦骨傀儡', hp:26, revive:0.4, pat:[{a:6},{charge:1,d:5,nm:'蓄勁'},{a:13,nm:'崩拳'}]},
  magma:  {n:'熔血魔',   hp:24, pat:[{a:4,burn:2,nm:'熔血'},{a:7},{d:5}]},
  acolyte:{n:'焚魂使者', hp:58, elite:1, pat:[{a:5,burn:3,nm:'焚魂'},{a:9},{d:8,burn:1,nm:'灼風'}]},
  stoker: {n:'提燈巡爐者',hp:56, elite:1, pat:[{astr:2,d:6,nm:'添柴'},{a:8},{a:5,x:2}]},
  /* —— 區域首領（美術借用 rpg/mon/，開頭 @ 的放在 rpg-next/art/；GitHub Pages 不部署底線開頭的資料夾，所以不能直接用 mon/_spare）—— */
  warlord:{n:'聚落霸主', art:'@art/boss_warlord.webp', hp:220, boss:1, pat:[{a:10},{summon:'jelly',nm:'吹哨集結'},{a:5,x:2},{charge:1,d:6,nm:'舉起大棒'},{a:23,nm:'碎顱重擊'},{d:10}]},
  brood:  {n:'闇域吞光者', art:'@art/boss_brood.webp', hp:220, boss:1, pat:[{a:8,drain:1,nm:'啃噬'},{goo:2,nm:'吐出瘴氣'},{a:5,x:2},{d:8,goo:1,nm:'盤踞'},{charge:1,d:6,nm:'深吸一口氣'},{a:18,drain:1,nm:'吞光'}]},
  citylord:{n:'亡城之主', art:'feign', hp:220, boss:1, half:{str:3, nm:'亡城之主怒吼'}, pat:[{a:9},{d:10},{a:5,x:2},{charge:1,d:6,nm:'舉劍'},{a:20,nm:'處決'},{weak:1,d:8,nm:'亡城詔令'}]},
  heart:  {n:'深淵之心', art:'final', hp:170, boss:1, pat:[{a:9},{d:12},{a:5,burn:2,nm:'灼熱脈動'},{charge:1,d:6,nm:'蓄血'},{a:20,nm:'心搏'}],
           form2:{n:'深淵之心（顯形）', art:'@art/boss_heart2.webp', heal:0.05, grow:1, pat:[{a:4,x:3,nm:'狂跳'},{a:5,x:3,weak:1},{a:3,x:5,nm:'亂搏'},{a:6,x:3,burn:1}]}},
};

/* 每一段地圖會遇到的組合（越下面越硬） */
const ENCOUNTERS = [
  [['rat'],['bat','bat'],['spider'],['slime']],
  [['rat','bat'],['skel'],['thief'],['garg'],['spider','bat'],['slime','bat']],
  [['skel','spider'],['garg','bat'],['thief','skel'],['slime','rat'],['garg','spider'],['rat','rat','bat']],
];
const ELITES = ['miner','ratking'];

/* 五個區域：由 depth % 5 決定，深度 ≥5 時循環，難度繼續由 DEPTH_K 放大。
   realm：背景（rpg/ui/realmN.webp，地圖與戰鬥都換）。rule：區域規則（id 由 core.js 實作）。
   enc：三段遭遇（比照 ENCOUNTERS）。elites：菁英（字串或陣列，陣列＝帶護衛）。boss：首領 key。
   win：打贏首領的文字；final：最終首領，打贏看結局 */
const REGIONS = [
  {n:'淺穴', realm:0, rule:null, enc:ENCOUNTERS, elites:ELITES, boss:'sarc',
   win:{title:'石棺開了', text:'棺底躺著一顆深淵晶，已經進了你的背包。其他的再挑一件。', out:'帶著石棺裡的東西爬回地面'}},
  {n:'哥布林聚落', realm:1, rule:{id:'ap', n:'擁擠的窄道', d:'每場戰鬥第一回合，行動點 -1'},
   enc:[[['drown'],['eel'],['jelly','jelly'],['crab']],
        [['drown','eel'],['sguard'],['siren','jelly'],['corpse2'],['crab','jelly'],['jelly','jelly','jelly']],
        [['sguard','siren'],['corpse2','eel'],['crab','drown'],['siren','jelly','jelly'],['sguard','jelly'],['corpse2','corpse2','eel']]],
   elites:['priest','raider'], boss:'warlord',
   win:{title:'霸主倒下了', text:'霸主的寶座底下壓著一顆深淵晶，已經進了你的背包。其他的再挑一件。', out:'扛著聚落的贓物爬回地面'}},
  {n:'無光通道', realm:2, rule:{id:'heal', n:'窒息的黑暗', d:'所有回復量 -25%（營火也是）'},
   enc:[[['leech'],['clot'],['teeth'],['flower']],
        [['leech','clot'],['eye'],['hound'],['necro'],['teeth','leech'],['flower','clot']],
        [['eye','leech'],['hound','clot'],['necro','flower'],['teeth','eye'],['hound','leech'],['clot','clot','leech']]],
   elites:['stitch','swarm'], boss:'brood',
   win:{title:'黑暗退了一些', text:'牠盤踞的巢底有一顆深淵晶，已經進了你的背包。其他的再挑一件。', out:'循著回聲摸回地面'}},
  {n:'舊都', realm:3, rule:{id:'dodge', n:'虛實難辨的亡魂', d:'敵人有 12% 機率閃避你的攻擊'},
   enc:[[['monk'],['choir'],['lantern'],['knight']],
        [['monk','choir'],['lantern','monk'],['knight'],['zealot'],['reliq'],['sister','monk']],
        [['knight','sister'],['choir','lantern','monk'],['zealot','monk'],['reliq','sister'],['knight','lantern'],['choir','zealot','sister']]],
   elites:['inquis','warden'], boss:'citylord',
   win:{title:'王座空了', text:'王座扶手上嵌著一顆深淵晶，已經進了你的背包。其他的再挑一件。', out:'穿過空蕩的城門爬回地面'}},
  {n:'熔獄', realm:4, rule:{id:'rage', n:'沸騰的熔爐', d:'第 5 回合起，每回合所有敵人力量增加'},
   enc:[[['throm'],['worm'],['pulse'],['magma']],
        [['throm','pulse'],['valve'],['mist','worm'],['puppet'],['magma','pulse'],['worm','magma']],
        [['valve','mist'],['puppet','magma'],['throm','worm'],['pulse','mist','magma'],['valve','puppet'],['throm','pulse','pulse']]],
   elites:['acolyte', ['stoker','magma']], boss:'heart', final:1,
   win:{title:'心臟停了', text:'熔岩凝固，最深處滾出一顆深淵晶，已經進了你的背包。其他的再挑一件。', out:'在寂靜中爬回地面'}},
];
const regionOf = d => REGIONS[d % REGIONS.length];
const ENDING = {
  first: ['最後一下心跳，在你手裡停了。', '整座深淵安靜下來，熔岩慢慢變黑。你一直以為在底下等你的是某個東西——原來只是一顆很大、很餓的心。', '繩梯還在。往上爬吧。下面還有很多層，但現在沒人在等你了。'],
  again: ['心又跳起來了，你又讓它停了一次。', '深淵總是會長回來。這一次，你已經知道怎麼收尾。']
};

/* 財寶分三類，價值與效果反向——讓玩家在「帶錢」和「變強」之間取捨：
   gold 金銀：沒效果，賣價高、貪婪也高；relic 遺物：幾乎不值錢，效果強；curse 詛咒：非常值錢，但帶著有負面效果。
   v 帶回去值多少金幣，g 帶在身上加多少貪婪，ef 是帶在身上時的效果（可疊加，燒掉或被偷就沒了）。
   各類內依 v 由低到高排列（抽財寶時依貪婪階級偏向後面）。
   icon 用內嵌向量圖（舊版 ui/coin.webp 其實是井，不能用）；cls:'clip' 裁掉圖檔的黑色方底。
   效果鍵：blk 開場格擋／str 力量／drawFirst 第一回合多抽／blkTurn 每回合格擋／apFirst 第一回合行動點／
           bleed 每回合開始失去生命／drawLess 每回合少抽（手牌至少留 1）／
           goo 每場開戰牌庫塞黏液／hurtPlus 受到的每次攻擊傷害加成／maxHp 最大生命增減（拿到、丟掉時立即增減） */
const TREASURES = [
  {id:'coin',    fam:'gold',  n:'碎銀',    icon:'gold',            v:30,  g:4,  ef:''},
  {id:'cup',     fam:'gold',  n:'金杯',    img:'ui/ev_can.webp', v:80,  g:9,  ef:''},
  {id:'gem',     fam:'gold',  n:'深淵晶',  img:'ui/gem.webp',      v:150, g:14, ef:'', cls:'clip'},
  {id:'pendant', fam:'relic', n:'骨墜',    img:'eq/pendant.webp',  v:10,  g:3,  blk:5,       ef:'開場格擋 +5'},
  {id:'ring',    fam:'relic', n:'無名指環',img:'eq/ring.webp',     v:15,  g:5,  str:1,       ef:'力量 +1'},
  {id:'watch',   fam:'relic', n:'停擺懷錶',img:'eq/watch.webp',    v:15,  g:4,  drawFirst:2, ef:'第一回合多抽 2'},
  {id:'lamp',    fam:'relic', n:'前人油燈',img:'eq/lamp.webp',     v:20,  g:6,  blkTurn:3,   ef:'每回合格擋 +3'},
  {id:'eye',     fam:'relic', n:'深淵之眼',img:'eq/bell.webp',     v:25,  g:8,  apFirst:1,   ef:'第一回合行動點 +1'},
  {id:'pact',    fam:'curse', n:'黑契約書',icon:'book',             v:180, g:12, goo:1,        ef:'每場開戰牌庫塞 1 張黏液'},
  {id:'crown',   fam:'curse', n:'染血金冠',icon:'poison',           v:220, g:16, bleed:2,     ef:'每回合開始失去 2 生命'},
  {id:'box',     fam:'curse', n:'裂魂匣',  icon:'energy',           v:260, g:18, hurtPlus:2,   ef:'受到的每次攻擊傷害 +2'},
  {id:'bone',    fam:'curse', n:'枯骨王冠',icon:'skull',            v:280, g:20, maxHp:-15,    ef:'最大生命 -15'},
  {id:'drill',   fam:'curse', n:'噬魂鑽',  icon:'skull',            v:320, g:22, drawLess:1,  ef:'每回合少抽 1 張'},
];
const FAM = {
  gold:  {n:'金銀', c:'#d8a84c', d:'沒有效果，但賣得貴'},
  relic: {n:'遺物', c:'#6fbf8f', d:'幾乎不值錢，帶著有強效果'},
  curse: {n:'詛咒', c:'#d05252', d:'非常值錢，但帶著有負面效果'},
};

/* 貪婪階級：同時決定敵人多凶、財寶多好。回程裝備稀有度另受下潛深度限制（上限＝深度 + 1）；首領只吃一半的血量／傷害加成。
   bias 越小，抽財寶越偏向貴重（rand^bias）。
   start：開場格擋；traits：每隻敵人開場帶幾個詞綴 */
const GREED_TIERS = [
  {min:0,  n:'知足',    hp:1.00, dmg:1.00, bias:2.6, start:0, traits:0, desc:'敵人維持原樣。回程裝備：普通。'},
  {min:12, n:'動心',    hp:1.10, dmg:1.10, bias:2.0, start:0, traits:0, desc:'敵人 +10%，財寶變好。回程裝備最高精良。'},
  {min:28, n:'眼紅',    hp:1.20, dmg:1.20, bias:1.6, start:5, traits:0, desc:'敵人 +20%，開場帶 5 格擋。回程裝備最高稀有（要下潛第 2 層以後）。'},
  {min:45, n:'貪得無厭',hp:1.30, dmg:1.30, bias:1.3, start:5, traits:1, desc:'敵人 +30%，每隻帶 1 個詞綴。回程裝備最高史詩（要下潛第 3 層以後）。'},
  {min:65, n:'深淵注視',hp:1.45, dmg:1.40, bias:1.0, start:8, traits:2, desc:'敵人 +40% 以上，每隻帶 2 個詞綴。回程裝備最高傳說（要下潛第 4 層以後）。'},
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

/* 事件：文字與選項在這裡，效果在 core.js 的 EVENT_FX（鍵＝選項 id，全部事件共用一張表，id 不可重複）。
   選項條件 need（空白分隔）：bag 背包有東西／gold 有金銀／curse 有詛咒／room 背包有空位／deck 牌組多於 5 張；
   hp 生命要大於這個數；heal 會回血（鍛爐異變下不能選）。同一趟不會重複遇到同一個事件。
   第一個選項放「最典型」的選法（模擬機器人固定選第一個能選的） */
const EVENTS = {
  corpse:{title:'前人的屍體', img:'ui/ev_corpse.webp',
    text:'一具還背著背包的屍體靠在岩壁上。背包的帶子被什麼東西咬過。',
    opts:[{id:'search', t:'翻背包', d:'可能拿到財寶，也可能被咬一口'},{id:'leave', t:'走開', d:'沒有效果'}]},
  dice:{title:'暗處的賭客', img:'ui/ev_dice.webp',
    text:'「押一件，贏了拿兩件更好的。」它把骰子在指節間滾來滾去，你看不見它的臉。',
    opts:[{id:'bet', t:'押最便宜的財寶', d:'一半機率換兩件，一半機率全沒', need:'bag'},{id:'leave', t:'不賭', d:'沒有效果'}]},
  shrine:{title:'血跡斑斑的祭壇', img:'ui/ev_shrine.webp',
    text:'祭壇上的凹槽剛好放得下一隻手。凹槽底部是乾掉的血，一層疊一層。',
    opts:[{id:'blood', t:'獻血', d:'失去 8 生命，從 3 張稀有技能選 1 張', hp:8},{id:'offer', t:'獻上最貴的財寶', d:'失去它，回復 25 生命', need:'bag heal'},{id:'leave', t:'走開', d:'沒有效果'}]},
  crack:{title:'發光的裂縫', img:'ui/ev_crack.webp',
    text:'岩縫裡滲出微光，靠近時你開始想著「再多拿一點也沒關係」。',
    opts:[{id:'stare', t:'盯著看', d:'貪婪 +10，最大生命 +8'},{id:'leave', t:'別過頭', d:'沒有效果'}]},
  merchant:{title:'流浪商人', img:'ui/ev_merchant.webp',
    text:'商人把貨架掛在背上，攤開來只有一塊布。「你背包裡的東西我都收，」他說，「看你想換什麼。」',
    opts:[{id:'m_remove', t:'賣最便宜的財寶', d:'失去它，從牌組移除一張技能', need:'bag deck'},
          {id:'m_relic', t:'賣最便宜的財寶', d:'失去它，從 3 件遺物中指定 1 件', need:'bag'},
          {id:'leave', t:'不買', d:'沒有效果'}]},
  well:{title:'許願井', img:'ui/ev_well.webp',
    text:'井底鋪滿了硬幣，有些還是新的。井水聽得到心跳聲。',
    opts:[{id:'wish_heal', t:'丟下最便宜的金銀', d:'失去它，回復 20 生命', need:'gold heal'},
          {id:'wish_relic', t:'丟下最貴的金銀', d:'失去它，換一件遺物', need:'gold'},
          {id:'leave', t:'走開', d:'沒有效果'}]},
  cart:{title:'翻倒的礦車', img:'ui/ev_cart.webp',
    text:'礦車卡在斜坡上，輪子還在轉。車裡有東西在晃，軌道一路通向黑暗。',
    opts:[{id:'ride', t:'跳上去', d:'一半機率撞出一件好財寶，一半機率摔傷 9 生命'},
          {id:'scrap', t:'拆輪子上的零件', d:'一定拿到碎銀，被割傷失去 3 生命', need:'room'},
          {id:'leave', t:'走開', d:'沒有效果'}]},
  confess:{title:'懺悔室', img:'ui/ev_confess.webp',
    text:'木格窗後面沒有人，只有一隻手從縫裡伸出來，掌心向上，等你放東西進去。',
    opts:[{id:'confess_burn', t:'交出最便宜的詛咒財寶', d:'失去它，回復一半最大生命', need:'curse heal'},
          {id:'confess_take', t:'接下遞出來的東西', d:'拿到一件詛咒財寶（很值錢，但帶著有代價）', need:'room'},
          {id:'leave', t:'關上門', d:'沒有效果'}]},
  door:{title:'裂開的門', img:'ui/ev_door.webp',
    text:'牆上裂開一道門縫，裡面有金屬的反光，也有呼吸聲。門縫比你的肩寬一點點。',
    opts:[{id:'door_open', t:'推開', d:'直接跟一隻菁英開打，贏了拿較好的財寶'},
          {id:'leave', t:'關回去', d:'沒有效果'}]},
  scroll:{title:'褪色的卷軸', img:'ui/ev_scroll.webp',
    text:'卷軸被人用刀刻過，字跡每讀一遍就換一種寫法。',
    opts:[{id:'scroll_read', t:'讀完它', d:'隨機強化兩張技能，貪婪 +5'},
          {id:'scroll_copy', t:'照著抄一份', d:'失去 6 生命，從 3 張稀有技能選 1 張', hp:6},
          {id:'leave', t:'捲起來放回去', d:'沒有效果'}]},
  lava:{title:'熔岩坑', img:'ui/ev_lava.webp',
    text:'坑底的岩漿慢慢翻動，漂著幾件還沒融化的東西。靠近時衣角開始冒煙。',
    opts:[{id:'lava_grab', t:'伸手撈', d:'失去 12 生命，撈到一件高價財寶', hp:12, need:'room'},
          {id:'lava_dive', t:'整條手臂伸進去', d:'失去 22 生命，撈到兩件高價財寶', hp:22, need:'room'},
          {id:'leave', t:'退後', d:'沒有效果'}]},
  mine:{title:'廢棄的礦脈', img:'ui/ev_mine.webp',
    text:'礦脈壁上還嵌著沒挖完的礦。鎬子斷在縫裡，像是有人走得很匆忙。',
    opts:[{id:'mine_pick', t:'敲下表面的礦石', d:'拿到碎銀，貪婪 +4', need:'room'},
          {id:'mine_deep', t:'往深處鑿', d:'四成機率挖到深淵晶，否則坍方失去 8 生命', need:'room'},
          {id:'leave', t:'走開', d:'沒有效果'}]},
  root:{title:'纏人的根鬚', img:'ui/ev_root.webp',
    text:'根鬚從天花板垂下來，在地上盤成一圈。結著幾顆發亮的果子，根鬚輕輕朝你這邊彎。',
    opts:[{id:'root_eat', t:'摘果子吃', d:'回復 12 生命，貪婪 +6', need:'heal'},
          {id:'root_feed', t:'餵它最便宜的財寶', d:'失去它，最大生命 +8', need:'bag'},
          {id:'leave', t:'繞過去', d:'沒有效果'}]},
  cyst:{title:'鼓脹的囊腫', img:'ui/ev_cyst.webp',
    text:'岩壁上長了一顆半透明的囊，裡面有東西隨著你的腳步轉動。',
    opts:[{id:'cyst_lance', t:'刺破它', d:'失去 7 生命，大概率取出一件遺物，也可能是空的', hp:7, need:'room'},
          {id:'leave', t:'別碰', d:'沒有效果'}]},
};

/* 異變：下潛前三選一（或不選），一趟一個規則，每個都同時有好處與代價。
   hp 敵人血量倍率／sell 全部財寶賣價倍率／sellFam 依類別再乘／step 每走一格貪婪多加／sight 地圖只看得到前方幾列／
   gearUp 回程裝備高一階／rest 營火回復倍率／trait 每隻敵人多帶詞綴／loot 戰利品選項加成／bag 背包格數增減／
   draw 每回合多抽／cards 獎勵技能選項加成／upCards 獎勵技能全部已強化／noHeal 營火以外不回血／
   hpMul 最大生命倍率／dmgOut 你造成傷害倍率／dmgIn 你受到傷害倍率。條件門檻：生還過至少 1 次 */
const MUTATIONS = {
  moon:   {n:'血月', good:'財寶賣價 +30%', bad:'敵人血量 +20%', hp:1.2, sell:1.3},
  flood:  {n:'急流', good:'財寶賣價 +35%', bad:'每走一格，貪婪多 +1', step:1, sell:1.35},
  dark:   {n:'黑暗', good:'回程裝備高一階', bad:'地圖只看得到接下來 2 列的節點類型（撤離點與首領不受影響）', sight:2, gearUp:1},
  famine: {n:'飢荒', good:'金銀與詛咒財寶賣價 +25%', bad:'營火回復減半', rest:0.5, sellFam:{gold:1.25, curse:1.25}},
  mirror: {n:'鏡像', good:'戰利品多一個選項；財寶賣價 +10%', bad:'每隻敵人（首領除外）多帶 1 個詞綴', trait:1, loot:1, sell:1.1},
  light:  {n:'輕裝', good:'每回合多抽 1 張', bad:'背包 -2 格', bag:-2, draw:1},
  forge:  {n:'鍛爐', good:'戰鬥獎勵的技能多 1 個選項，而且全部已強化', bad:'最大生命 -10%；營火以外沒有任何回血（舔傷、擊殺回復、事件都失效）', cards:1, upCards:1, noHeal:1, hpMul:0.9},
  allin:  {n:'孤注', good:'你造成的傷害 +30%', bad:'最大生命 -25%，你受到的傷害 +20%', hpMul:0.75, dmgOut:1.3, dmgIn:1.2},
};

/* 噩夢階：打贏深淵之心（最終首領）後開放。選 0～10 階，只能選到「已通關的最高階 +1」，規則逐階累積（選 5 就是 1～5 全部生效）。
   core.js 以 S.nm >= 階數 判斷。補償：財寶賣價每階 +10%（NM_SELL） */
const NM_SELL = 0.1;
const NIGHTMARES = [
  {n:'血肉增生', d:'敵人血量 +10%'},
  {n:'精銳恆強', d:'菁英多帶 1 個詞綴'},
  {n:'營火冷卻', d:'營火回復量 -30%'},
  {n:'首領強韌', d:'首領血量 +20%'},
  {n:'體魄受損', d:'起始與最大生命 -10%'},
  {n:'全員詞綴', d:'一般敵人各帶 1 個詞綴'},
  {n:'手腳遲滯', d:'每場戰鬥第一回合少抽 1 張'},
  {n:'吝嗇的戰利品', d:'戰利品與技能選項少 1 個（最少 2 個）'},
  {n:'致命的爪牙', d:'敵人傷害 +15%'},
  {n:'首領的怒意', d:'首領開場力量 +3'},
];

/* 成就：新達成時在結算畫面顯示。每個都給獎勵，而且只「解鎖新內容」，不鎖玩家現有的東西。
   reward：card 新牌（達成後才進獎勵牌池）／gear 新裝備（達成後才出現在鐵匠鋪與回程掉落）／gold 金幣。
   chk(m, r)：m 是 meta，r 是剛結算的一趟（載入時補發傳 null，只看 meta）。 */
const ACHIEVEMENTS = [
  {id:'first',  n:'初次撤離',   d:'活著回到地面一次',               reward:{card:'scout'},    chk:(m, r) => m.escapes >= 1},
  {id:'hoard6', n:'滿載而歸',   d:'撤離時身上帶著 6 件財寶',         reward:{card:'hoardhit'}, chk:(m, r) => !!r && r.ok && r.items.length >= 6},
  {id:'curse3', n:'與詛咒同行', d:'帶著 3 件詛咒財寶活著回來',       reward:{card:'cursewall'},chk:(m, r) => !!r && r.ok && r.items.filter(id => treasure(id).fam === 'curse').length >= 3},
  {id:'gaze',   n:'直視深淵',   d:'貪婪達到「深淵注視」後活著回來', reward:{card:'gazebite'}, chk:(m, r) => !!r && r.ok && (r.maxGreed || 0) >= 65},
  {id:'noheal', n:'鐵骨',       d:'整趟不回任何血，打贏首領',       reward:{card:'ironwill'}, chk:(m, r) => !!r && r.ok && r.bossDown && r.healed === 0},
  {id:'burn5',  n:'焚財',       d:'一趟燒掉 5 件財寶並活著回來',    reward:{card:'ashes'},    chk:(m, r) => !!r && r.ok && (r.burned || 0) >= 5},
  {id:'allcls', n:'四職皆勝',   d:'每個職業各打贏一次首領',         reward:{gear:'w8'},       chk:(m, r) => CLASS_ORDER.every(c => ((m.clsStats || {})[c] || {}).boss >= 1)},
  {id:'ending', n:'深淵終結',   d:'打贏最終首領深淵之心',           reward:{gear:'a8'},       chk:(m, r) => (m.cleared || 0) >= 1},
  {id:'nm5',    n:'噩夢五階',   d:'通關噩夢 5 階',                  reward:{gear:'t8'},       chk:(m, r) => (m.nmMax || 0) >= 5},
  {id:'nm1',    n:'噩夢初啟',   d:'通關噩夢 1 階',                  reward:{gold:600},         chk:(m, r) => (m.nmMax || 0) >= 1},
  {id:'nm10',   n:'噩夢盡頭',   d:'通關噩夢 10 階',                 reward:{gold:5000},        chk:(m, r) => (m.nmMax || 0) >= 10},
  {id:'mut5',   n:'異變老手',   d:'帶著異變活著回來 5 次',          reward:{gold:800},         chk:(m, r) => (m.mutEsc || 0) >= 5},
  {id:'legend', n:'傳說鍛造',   d:'在鐵匠鋪買下一件傳說裝備',       reward:{gold:1500},        chk:(m, r) => !!m.boughtLegend},
  {id:'boss1',  n:'石棺開啟',   d:'打贏第 1 層首領',                reward:{gold:200},         chk:(m, r) => (m.depth || 0) >= 1},
  {id:'depth5', n:'深入熔獄',   d:'打贏第 5 層首領',                reward:{gold:1000},        chk:(m, r) => (m.depth || 0) >= 5},
  {id:'runs20', n:'老練的潛行者',d:'累計下潛 20 次',                 reward:{gold:300},         chk:(m, r) => (m.runs || 0) >= 20},
];

/* 深度：打贏首領解鎖下一層。敵人變強、財寶更值錢；新敵人與新規則在第 3 階段補上，目前先換區域與數值 */
const DEPTHS = ['淺穴', '哥布林聚落', '無光通道', '舊都', '熔獄'];
const DEPTH_K = {hp: 0.8, dmg: 0.6, value: 0.25};
/* 深度倍率＝1 + K × d^P（d＝深度，從 0 起算）。d=1（第 2 層）與舊公式一樣；P<1 讓深層漲幅變緩，P=1 就是舊的直線。
   第 6 層之後循環時 d 繼續變大，倍率繼續往上長，只是比較慢。全部倍率走 depthMul 這一個函式 */
const DEPTH_P = {hp: 0.55, dmg: 0.55, value: 1};
const depthMul = (k, d) => d > 0 ? 1 + DEPTH_K[k] * Math.pow(d, DEPTH_P[k]) : 1;

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
  w5:{n:'連擊短刃',   slot:'weapon',  r:1, img:'eq/dagger.webp',  fx:{thirdAtk:1},         d:'每回合第 3 張攻擊牌傷害翻倍'},
  w6:{n:'貪婪之鉤',   slot:'weapon',  r:2, img:'eq/axe.webp',     fx:{greedDmg:2},         d:'傷害 +貪婪階級×2（動心 +2、眼紅 +4…）'},
  w7:{n:'盾擊戰錘',   slot:'weapon',  r:3, img:'eq/staff.webp',   fx:{blkSlam:0.5},        d:'回合結束時，對目標造成目前格擋 ×0.5 的傷害'},
  /* 護甲 */
  a0:{n:'舊皮甲',     slot:'armor',   r:0, img:'eq/leather.webp', fx:{hp:8},               d:'最大生命 +8'},
  a1:{n:'礦工鎖甲',   slot:'armor',   r:1, img:'eq/chain.webp',   fx:{blk:7},              d:'每場開場格擋 +7'},
  a2:{n:'穴居鱗甲',   slot:'armor',   r:2, img:'eq/scale.webp',   fx:{blkTurn:3},          d:'每回合格擋 +3'},
  a3:{n:'不退重板甲', slot:'armor',   r:3, img:'eq/plate.webp',   fx:{noDecay:1},          d:'格擋不再衰減'},
  a4:{n:'深淵斗篷',   slot:'armor',   r:4, img:'eq/cloak.webp',   fx:{hp:15, blkTurn:4},   d:'最大生命 +15，每回合格擋 +4'},
  a5:{n:'荊棘胸甲',   slot:'armor',   r:1, img:'eq/plate.webp',   fx:{thorns:3},           d:'被攻擊時反彈 3 傷害'},
  a6:{n:'賭徒背心',   slot:'armor',   r:2, img:'eq/leather.webp', fx:{gamble:1},           d:'生命低於一半時，每回合行動點 +1'},
  a7:{n:'血痕披風',   slot:'armor',   r:3, img:'eq/cloak.webp',   fx:{scarDmg:1},          d:'每層傷痕讓攻擊傷害 +1'},
  /* 飾品 */
  t0:{n:'銅戒',       slot:'trinket', r:0, img:'eq/ring.webp',    fx:{hp:4},               d:'最大生命 +4'},
  t1:{n:'獵人護符',   slot:'trinket', r:1, img:'eq/pendant.webp', fx:{killHeal:3},         d:'擊殺回復 3 生命'},
  t2:{n:'老工匠懷錶', slot:'trinket', r:2, img:'eq/watch.webp',   fx:{drawFirst:2},        d:'第一回合多抽 2'},
  t3:{n:'守夜人提燈', slot:'trinket', r:3, img:'eq/lamp.webp',    fx:{bag:1, blk:6},       d:'背包 +1 格，每場開場格擋 +6'},
  t4:{n:'深淵之鈴',   slot:'trinket', r:4, img:'eq/bell.webp',    fx:{ap:1},               d:'每回合行動點 +1'},
  t5:{n:'煉金戒',     slot:'trinket', r:1, img:'eq/ring.webp',    fx:{burnAp:1},           d:'燒財寶改換 2 行動點'},
  t6:{n:'黑契護符',   slot:'trinket', r:2, img:'eq/pendant.webp', fx:{curseStr:1},         d:'身上每件詛咒財寶，力量 +1'},
  t7:{n:'守財奴印',   slot:'trinket', r:3, img:'eq/tome.webp',    fx:{hoard:3},            d:'身上每件金銀，開場格擋 +3'},
  /* 成就解鎖（ach：達成該成就後才會出現在鐵匠鋪與回程掉落） */
  w8:{n:'迴響長劍',   slot:'weapon',  r:3, img:'eq/sword.webp',   fx:{echoHit:1}, ach:'allcls', d:'每回合第一張攻擊牌，會再追打一次 50% 傷害'},
  a8:{n:'不死者殮衣', slot:'armor',   r:3, img:'eq/cloak.webp',   fx:{lastStand:1}, ach:'ending', d:'每場戰鬥一次，致命傷改為剩 1 生命並獲得 8 格擋'},
  t8:{n:'貪婪天平',   slot:'trinket', r:3, img:'eq/watch.webp',   fx:{greedBlk:3}, ach:'nm5', d:'每回合開始，格擋 +貪婪階級×3'},
};
