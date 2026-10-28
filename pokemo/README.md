# 珠界：歸一之子（orb-rpg）

寶可夢式探索 × 神魔之塔式轉珠戰鬥的手機單檔 HTML RPG。

## 打包
```
python3 build.py        # 產生 dist/index.html（單檔，內嵌所有圖片）
```
需要 Python 3；不需其他套件。

## 資料夾
| 路徑 | 內容 |
|---|---|
| `src/template.html` | 遊戲主程式（HTML/CSS/JS），圖片以 `__XXX__` 佔位，由 build.py 內嵌 |
| `data/roster.json` | 110 隻怪物資料（屬性、星級、進化線、數值、出沒區域） |
| `assets/ui` | 珠子、守衛圖、戰鬥背景 |
| `assets/art` | 地圖地磚與物件 |
| `assets/chars` | 角色圖（主角為 4 方向 × 3 格走路圖）與頭像 |
| `assets/monsters` | 五屬性怪物圖集（每張 6×4，格大小 192px） |
| `tools/` | 切圖／重排／走路圖處理腳本（repack.py、walk.py）、怪物名冊產生器（roster.py） |
| `tests/` | Playwright 測試（需 python playwright） |
| `docs/` | 設計文件：`GAME_PLAN.md` 規劃書、`STORY.md` 劇情設定集（AI 讀的正本）、地圖提案圖 |
| 根目錄 PDF | 給人看的版本：遊戲規劃書、故事設定集（由 `tools/md2pdf.py` 從 docs 的 .md 產生） |

## 流程
ChatGPT 出圖 → `tools/` 切圖入 `assets/` → `build.py` → `dist/index.html`
