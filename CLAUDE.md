# CLAUDE.md

給 Claude Code / AI 協作者的專案指引。

## 專案概覽

**ARCADE**（`im-chair.github.io`）是一個部署在 GitHub Pages 的個人手工遊戲集，純前端、可離線遊玩的 PWA。首頁是遊戲卡片列表，各遊戲放在獨立子資料夾。

- **零依賴、零 build**：全部原生 HTML / CSS / JS，沒有框架、打包器或套件管理。直接編輯檔案即可。
- **唯一外部資源**：Google Fonts（Syne + DM Mono）與部分遊戲圖示（game-icons.net，CC BY 3.0；RPG 的雜魚圖示 v379 起改用自製點陣圖，首領與 UI 仍用 game-icons.net，授權標註不可移除）。
- **語言**：介面與程式註解皆為繁體中文。

## 目錄結構

```
/
├── index.html          # 遊戲集首頁（卡片列表 + localStorage 遊玩次數）
├── manifest.json       # 根 PWA 設定（ARCADE）
├── sw.js               # 根 Service Worker（快取名 arcade-vN，network-first）
├── icon.png            # PWA 圖示
├── sudoku/             # 數獨（單一 index.html，另自帶 manifest/sw/icons，獨立 PWA）
├── minesweeper/        # 掃雷（單一 index.html）
├── bulls-cows/         # 幾A幾B（單一 index.html）
├── solitaire/          # 接龍（單一 index.html）
├── tower-orbs/         # 轉珠之塔（單一 index.html，另自帶 manifest/sw，獨立 PWA）
├── rpg/                # 貪婪深淵（Roguelite，模組化多檔案 — 見下）
├── icons/              # 首頁卡片圖示 <遊戲>.webp（可缺，缺的卡片沿用 emoji）
└── tools/process_art.py  # 小遊戲美術後製（Pillow；不是網站的一部分）。流程見 美術需求_ChatGPT出圖.md
```

### 小遊戲共通慣例

- **存檔／紀錄**：各遊戲用 localStorage `arcade-<遊戲>-save`（進行中的局）與 `arcade-<遊戲>-stats`（`{ 模式: { plays, wins, best: {…越小越好} } }`）。首頁卡片會讀這兩個 key 顯示最佳紀錄與「進行中」。
- **每日挑戰**（數獨、掃雷、幾A幾B）：以日期字串為種子（`seededRng('<遊戲>-YYYY-MM-DD')`），同一天大家同一題、一天一次。紀錄在 `arcade-<遊戲>-daily`（`{ last, streak, best, lastWin }`），進度另存 `arcade-<遊戲>-daily-save`，與一般模式互不覆蓋。**改動產生器或亂數消耗順序會讓同一天的題目變掉**，上線當天別改。
- **音效**：各小遊戲內嵌一段 `SFX`（WebAudio 即時合成，無音檔）；總開關在首頁統計列，localStorage `arcade-sound`（`'off'` 為關，每次出聲前重讀）。
- **選配美術**：圖檔存在就換上、不存在維持 emoji／CSS（首頁 `icons/`、接龍 `back.webp`/`felt.webp`、掃雷 `flag.webp`/`mine.webp`）。
- **Service Worker 快取**：三支 SW（根、`sudoku/`、`tower-orbs/`）的 activate 只能刪**自己前綴**的舊快取——快取空間整站共用。

## 兩種遊戲型態

1. **單檔遊戲**（數獨、掃雷、幾A幾B、接龍）：整個遊戲的 HTML / CSS / JS 全部內嵌在該資料夾的 `index.html`。改這些遊戲只需動一個檔案。
2. **模組化遊戲**（rpg/貪婪深淵）：拆成多個 `.js` 檔，用 `<script src>` 依序載入，共享全域變數，無模組系統（非 ES modules）。

## RPG（貪婪深淵）架構

`rpg/index.html` 依固定順序載入以下腳本，**順序不可隨意調換**（後面的檔案依賴前面定義的全域）：

```
data.js → core.js → account.js → items.js → battle.js → run.js → ui.js
```

| 檔案 | 職責 |
|------|------|
| `data.js` | 靜態資料/設定：職業、敵人、道具、詞綴、常數（`CLASSES`、`POTIONS`、`AFFIXES`、`REALMS` 等） |
| `core.js` | 核心：存讀檔、全域狀態、屬性彙總公式、共用工具 |
| `account.js` | 帳號/多角色存檔的建立與遷移 |
| `items.js` | 裝備、詞綴、道具系統 |
| `battle.js` | 回合制戰鬥邏輯 |
| `run.js` | 單局 roguelite 流程（門/事件/戰利品/結算） |
| `ui.js` | 畫面渲染與版面（如 `layoutCamp`） |

`rpg/mon/` 放敵人圖示（`<ENEMIES 的 key>.webp`，160×160 去背）。渲染唯一入口是 `battle.js` 的 `enemyIcon(e)`：data.js 標了 `img:1` 的走圖檔，其餘回落內嵌 SVG，**所以圖可以一隻一隻補**。新增圖時三件事要一起做：放檔（檔名＝key）、data.js 該筆加 `img:1`、`sw.js` 的 `RPG_MON` 加一筆。`rpg/mon/_spare/` 是未使用的備用素材，不會被載入。

### RPG 全域慣例（重要）

- **三個核心全域狀態**（定義於 `core.js`）：
  - `G` — 永久資料（角色、金錢、倉庫、裝備、紀錄）
  - `R` — 本次探索（run）的狀態
  - `B` — 當前戰鬥狀態
- **存檔**：`localStorage`，key = `abyss-save-v1`。存讀檔走 `save()` / `load()`，多角色遷移在 `account.js` 的 `accSave()` / `accLoad()`。
- **畫面切換**：`showScreen('s-xxx')`；畫面容器是 `index.html` 裡的 `.screen` 區塊，用 `onclick="funcName()"` 直接綁全域函式。
- **小工具**：`$ = id => getElementById`、`toast(msg)`、`openSheet(html)` / `closeSheet()`、`rnd(a,b)`、`pick(arr)`。

### RPG 版本號與快取破除

RPG 內部版號已集中到 `rpg/index.html` `<head>` 的單一常數 **`RPG_VER`**（例如 `'349'`）。它會自動套用到:CSS 連結、所有 `<script src>` 的 `?v=`、以及標題畫面顯示的 `V3.NN`。**修改任何 rpg 的 js/css 後，只要改 `RPG_VER` 這一個數字**即可破除瀏覽器/SW 快取，不必再逐一改。

例外:`rpg/style.css` 裡營地背景圖 `camp.webp?v=NNN` 有自己一個版號（圖片素材，極少變動），換圖時才需手動調。

站台層級的離線快取由**根目錄 `sw.js` 的 `CACHE`**（`arcade-vN`）控制，與 `RPG_VER` 是兩套獨立機制——改動需要讓「已安裝 App 的舊使用者」立即拿到的資源時，把 `CACHE` 版本號 +1。

## Service Worker / 快取注意事項

- 根 `sw.js` 採 **network-first**（先抓網路、失敗才用快取）。快取名為 `arcade-vN`；**改動需要立即生效的資源時，把 `CACHE` 版本號 +1**，舊快取會在 activate 時清除。
- `sudoku/` 有自己一套 `manifest.json` + `sw.js` + `icons/`，是獨立 PWA，與根設定分開維護。

## 本機預覽

純靜態站，用任意靜態伺服器即可（Service Worker 需要 `http://`，直接開 `file://` 部分功能會失效）：

```bash
python -m http.server 8000
# 然後開 http://localhost:8000
```

## 部署

推到 GitHub Pages（`im-chair.github.io` repo）即上線，無 CI/build 步驟。

## 慣例小結（改動前請遵守）

- 維持繁體中文介面與註解。
- 沿用既有暗色美術系統：背景 `#080808`、accent 螢光綠 `#c8f135`、字型 Syne（標題）/ DM Mono（內文）。
- 不要引入框架、build 工具或 npm 依賴，除非有明確需求並先討論。
- 動到 rpg 檔案 → 更新 `rpg/index.html` 的 `RPG_VER` 一處；動到需即時更新的快取資源 → 更新對應 `sw.js` 的 `CACHE` 版本。
- 新增遊戲：建子資料夾放 `index.html`，並在根 `index.html` 的 `.games` 區塊加一張 `.game-card` 卡片、更新 `#game-count` 數字。
```
