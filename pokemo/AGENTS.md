# 給接手的 AI／開發者（先讀這個）

1. 讀 `docs/GAME_PLAN.md`（完整規劃、設計支柱、規則、待辦）與 `docs/STORY.md`（劇情設定集）。
   - 這兩份 .md 是給 AI 看的正本；改完要重新輸出給使用者閱讀的 PDF（`python3 tools/md2pdf.py`，輸出在 pokemo 根目錄）。使用者電腦沒有 Office，只看 PDF。
2. 程式在 `src/template.html`；資料在 `data/`；圖在 `assets/`；工具在 `tools/`；測試在 `tests/`。
3. 打包：`python3 build.py` → `dist/index.html`（單檔，約 5 MB）。
4. 修改時請遵守「設計支柱」：攻擊與收服要取捨、沒有商店／徽章、不要留情機制。
5. 改平衡前先跑 `tools/balance_sim.py`；改完用 `tests/` 的 Playwright 測試驗證。
6. 美術一律由使用者用 ChatGPT 生成並提供（指令見 `docs/ART_PROMPTS.md`，原圖放 `art_in/`）；你負責切圖、去背（洋紅底）、整合；規格見 GAME_PLAN 第 6 節。
7. 版本紀錄寫在 `CHANGELOG.md`。
