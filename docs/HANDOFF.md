# 交接紀錄

Codex 與 Claude Code 輪流開發 AIAC，彼此看不到對方的對話，靠這份紀錄接力。規則見 [`AGENTS.md`](../AGENTS.md)。

- **新紀錄加在最上方**，舊紀錄不要改寫（只能補一行「更正：…」）。
- 每次收工前寫一則，即使只是小修正。
- 寫給下一位接手的人看：他沒有你的對話記錄。

## 格式

```markdown
### YYYY-MM-DD · Codex|Claude Code · 分支名稱
- **做了什麼**：…
- **狀態**：已合併 main／已推分支待合併／進行中
- **測試**：node --test 通過幾項；手動驗證了什麼
- **未完成／注意**：…（刻意不做的事、已知問題、下一步建議）
```

---

### 2026-11-13 · Claude Code · claude/eloquent-meitner-mz160y
- **做了什麼**：使用者要求圖示更鮮豔（參考 Coach Watts）。側欄每個分頁一個鮮豔顏色（今日橘、課表綠、我 青、日誌紫、資料藍，CSS `--ic`），選中時整格以同色淡底＋色條標示；KPI 標籤加彩色小圖示；訓練類型色提高飽和度，課表進度環改用該天的訓練類型色；品牌綠改為 `#2FE39A`。
- **狀態**：已推分支，待合併（PR #2）。
- **測試**：node --test 34 項通過；build-demo 成功；截圖已更新。
- **未完成／注意**：使用 `color-mix()`（現代瀏覽器皆支援）。

### 2026-11-13 · Claude Code · claude/eloquent-meitner-mz160y
- **做了什麼**：使用者看過暖色版後認為「太 low」，並以 Stryd 儀表板為參考。改為深色、資料優先的效能儀表板（自創配色，未使用 Stryd 品牌元素）：深綠黑底、窄圖示側欄、杏桃色只標每區最重要的數字、訓練類型以顏色編碼（Zone2 綠、恢復藍、Tempo 黃、Interval 珊瑚、長跑紫、室內藍紫、休息灰，CSS `[data-type]`）。今日頁新增 KPI 列（`#kpis`：本週實際、課表規劃、課表完成度、品質課）與每週預計／實際長條圖（SVG，`weekChart()`）；週節奏卡片移除重複的大數字。頁面大標題縮小為精簡標題列。字體由 Nunito 改為 Archivo（OFL，自帶 `public/assets/fonts/archivo-latin.woff2`）。
- **狀態**：已推分支，待使用者看效果後合併（PR #2）。
- **測試**：node --test 34 項通過；build-demo 成功；Playwright 截圖桌面／手機各頁、試用版字體載入且無 console 錯誤。截圖已更新 `docs/aiac-redesign-*.png`。
- **未完成／注意**：圖表與 KPI 只用現有資料，沒有負荷模型（RSS、RSB 類指標尚未實作，不要捏造）。Leaflet 地圖底圖仍為淺色 OSM。今日表單仍是一般欄位。

### 2026-11-13 · Claude Code · claude/eloquent-meitner-mz160y
- **做了什麼**：安裝 Anthropic 官方 skills（anthropics/skills，Apache 2.0）：`frontend-design`、`webapp-testing`、`theme-factory`、`canvas-design`、`brand-guidelines`。完整內容在 `.agents/skills/<name>/`（附 `SOURCE.md`），`.claude/skills/<name>/SKILL.md` 為轉介檔。安裝前已讀過全部文字檔與腳本：`webapp-testing/scripts/with_server.py` 只啟動指定伺服器並執行指令；PDF 無內嵌腳本；字體為 OFL TTF（3 個被 `file` 誤判，已確認字型表正常）。`AGENTS.md` skill 表已補上用途與限制。
- **狀態**：已推分支，待合併（PR #2）。
- **測試**：未改程式碼。
- **未完成／注意**：`brand-guidelines` 是 Anthropic 品牌，不可用於 AIAC 介面。`frontend-design` 指出「暖米色底＋陶土色強調」是 AI 生成設計的常見樣式；目前改版雖用綠＋杏桃、非陶土色，之後調整時可參考它的原則讓 AIAC 更有辨識度。`canvas-design` 字體約 5.5 MB。

### 2026-11-13 · Claude Code · claude/eloquent-meitner-mz160y
- **做了什麼**：依 `web-design-engineer` skill 做第一版視覺改版（Redesign · Overhaul，溫暖療癒／Headspace 風，使用者選定）。重寫 `public/style.css`：暖米杏底、深綠文字（保留品牌）、杏桃強調色（取自 logo 圓點）、大圓角、膠囊按鈕、柔和陰影與入場動畫（尊重 prefers-reduced-motion）、內文 16px、手機改底部分頁列。字體 Nunito（OFL）自帶於 `public/assets/fonts/`，不連 Google；server 白名單與 `scripts/build-demo.mjs` 已加入字體。HTML 只換側欄 SVG 圖示與英文標題／小標為中文；`app.js` 只改顯示樣板：課表每天的實際結果改為 SVG 進度環＋一行摘要、今天加標記、對話角色中文化。表單欄位名稱、id、data-* 選擇器、API 都未改。
- **狀態**：已推分支，待使用者看效果後合併。
- **測試**：node --test 34 項通過；build-demo 成功；Playwright 截圖桌面與手機四個分頁無跑版，試用版字體載入且無 console 錯誤。截圖：`docs/aiac-redesign-*.png`。
- **未完成／注意**：server CSP 為 `style-src 'self'`，會擋 inline `style` 屬性，動態樣式請用 class 或 SVG 屬性，不要放寬 CSP。中文字仍用系統字體（正黑體／蘋方）。尚未做深色模式；今日表單尚未改成問句卡片（等使用者回饋）。

### 2026-11-13 · Claude Code · claude/eloquent-meitner-mz160y
- **做了什麼**：安裝第三方 skill `web-design-engineer`（ConardLi/garden-skills，MIT，v1.3.0）。完整內容在 `.agents/skills/web-design-engineer/`（Codex 讀這裡），`.claude/skills/web-design-engineer/SKILL.md` 只是轉介檔。安裝前已讀過 SKILL.md 並掃描 references：純 Markdown、無腳本、無下載執行或外傳資料指示。`AGENTS.md` 新增「共用 Skills」一節。
- **狀態**：已推分支，待合併（與前一則同一個 PR）。
- **測試**：未改程式碼。
- **未完成／注意**：使用者要求「美化網頁」。依 skill 流程，改版前要先決定模式（Preserve／Overhaul）並宣告設計系統，取得使用者確認才動 `public/`；目前在等使用者確認方向。

### 2026-11-13 · Claude Code · claude/eloquent-meitner-mz160y
- **做了什麼**：發現 `context.date`（「今天」）只在初次建立時設定，之後不會更新，跨日／跨週後 TODAY 標記、晨間 Coaching 與課表都停在舊日期。新增 `advanceToToday`／`todayIn`（`src/plan-weeks.mjs`）：每天第一次讀取狀態（本機 `GET /api/state`、試用版 `state`）時，把過時的情境日期改為當天；若目前課表正顯示舊日期所在週，跟著切到本週，舊週存入 `planHistory`。以新欄位 `lastOpenedOn` 判斷「新的一天」，當天手動選的過去日期保留到隔天。備份還原會清掉 `lastOpenedOn`，讓還原後第一次開啟也跳到今天。同步更新 README 與 `docs/M2_PROGRESS.md` 的過時描述。
- **狀態**：已推分支，待合併。
- **測試**：node --test 34 項通過（新增 `tests/plan-weeks.test.mjs` 4 項、demo 1 項；demo 備份測試的最後比對改為排除 `lastOpenedOn`）。以過時資料目錄實際啟動 server 驗證：開啟後日期與週次已切到今天，舊週保留在歷史。`node scripts/build-demo.mjs` 成功。
- **未完成／注意**：更正前一則的建議：「跨週與歷史保留」與「備份」其實已在 commit 1103111 實作，下一步不是它們。新週次目前預設全為 Rest／0 分鐘，可考慮「沿用上週課表」；`docs/ROADMAP.md` 階段 1 的剩餘項目（FIT 對應課程、重複活動提示、手機表單）尚待逐項檢查。

### 2026-11-13 · Claude Code · claude/eloquent-meitner-mz160y
- **做了什麼**：新增 `AGENTS.md`（Codex 與 Claude Code 共用規則）、`CLAUDE.md`（匯入 AGENTS.md）、本交接紀錄檔。未改動任何程式碼。
- **狀態**：已推分支，待使用者合併到 main。
- **測試**：node --test 29 項全數通過。
- **未完成／注意**：依 `docs/ROADMAP.md`，下一個功能建議為「跨週與歷史保留」（前週／本週／下週），其次為「FIT 對應與備份」。

### 2026-11-11 · Codex（推定）· main
- **做了什麼**：發布 AIAC 原型與瀏覽器試用版；FIT 匯入顯示 GPS 路線與分圈；Garmin FIT 同步與每週活動對應。
- **狀態**：已在 main。
- **未完成／注意**：見 `docs/M2_PROGRESS.md`「未驗證／未完成」一段。此則由 Claude Code 依 git 歷史補記。
