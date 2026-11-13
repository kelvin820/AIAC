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
