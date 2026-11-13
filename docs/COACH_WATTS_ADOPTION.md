# 借用 Coach Watts 功能：對照與分期計畫

2026-11-13 · Claude Code 讀完 [watt-mind/coach](https://github.com/watt-mind/coach)（commit `4d8d65c`，2026-09-01）後整理。Codex 與 Claude Code 共用此計畫；做完一期就在本檔勾選並寫 `docs/HANDOFF.md`。

## 授權與借用原則

- Coach Watts 為 **Apache 2.0**。可以借用程式碼，但必須：保留其授權與版權聲明、在借用的檔案標註來源與「已修改」、在 `NOTICE` 或 `docs/THIRD_PARTY.md` 列出。
- **不借用品牌**：名稱 Coach Watts、標誌、品牌綠 `#00DC82`、文案口號都不用。只借功能設計與計算邏輯。
- **技術架構不同，不能整包搬**：Coach Watts 是 Nuxt 4／Vue＋Prisma／Postgres＋Trigger.dev 背景工作＋Gemini。AIAC 是單一 Node 服務＋原生 JS＋JSON 檔。實際做法是把它的公式與資料模型改寫成 `src/` 下的純函式，再接上我們的 API 與介面。
- **AIAC 紅線優先**（見 `AGENTS.md` 第 8 節）。Coach Watts 有背景 AI 分析、自動產生洞察、自動評分；這些在 AIAC 一律改成「使用者按了才呼叫 LLM」，或改用本地規則計算。所有估算值標示來源與可信度，不捏造生理數據。

## Coach Watts 各模組在做什麼

| 模組 | Coach Watts 路徑 | 主要內容 |
|---|---|---|
| Dashboard | `/dashboard` | 運動員簡介（最大心率、安靜心率、LTHR、FTP、體重）、訓練負荷與狀態（CTL／ATL／TSB 與變化）、今日訓練、近期健康、績效分數、月累積 TSS 比較、近期活動 |
| Activities | `/activities` | 活動行事曆（月／週）、已完成與計畫課並排、上傳、去重 |
| Performance | `/performance` | PMC 圖（體能／疲勞／狀態）、強度分布、FTP 演進、功率曲線、個人最佳、效率趨勢、可選的 AI 洞察 |
| Training Plan | `/plan` | 依目標產生週期化計畫：區塊（Base／Build／Peak／Race）→ 週（分鐘與 TSS 目標、恢復週、減量）→ 每日計畫課 |
| My Plan | `/plans` | 我的計畫庫：進行中、歷史、存成範本、從範本建立 |
| Workout | `/workouts`、`/workouts/[id]`、`/workouts/planned/[id]` | 活動詳情（分圈、區間、地圖、圖表）、結構化計畫課（暖身／重複組／緩和，配速或心率目標）、執行比對 |
| Fitness / Health | `/fitness`、`/recovery` | 健康數據趨勢：HRV、安靜心率、睡眠、體重、準備度（HRV＋RHR）、恢復紀錄、手動事件、每日報到 |
| Goals | `/profile/goals` | 四類目標：賽事、表現（如 FTP 300W）、體重、規律性；優先級、目標日期、起始／目前／目標值、進度 |
| Coaching | `/coaching/*`、`/chat`、`/recommendations` | Coach Watts 的 Coaching 選單是**真人教練管理多位運動員**；AI 教練功能在 Chat 與 Recommendations |

## 可直接借用的計算邏輯

出處：`server/utils/normalize-tss.ts`、`training-stress.ts`、`plans/week-targets.ts`、`docs/02-features/analytics/training-stress-metrics.md`。

- **訓練負荷分數，依資料取用順序**：功率 TSS（NP、IF、FTP）→ 心率 HRSS（平均心率、HRR、LTHR；無 LTHR 時以最大心率 90% 估）→ TRIMP → 時間加心率估算（`時數 × 100 × (平均心率／最大心率)²`，低於 55% 打折）→ 無心率時每小時 36。每筆都記錄 `source` 與 `confidence`（high／medium／low）。跑步另可做配速版（rTSS，需臨界配速）。
- **PMC**：`CTL += (TSS − CTL)/42`、`ATL += (TSS − ATL)/7`、`TSB = CTL − ATL`，逐日計算（無訓練日 TSS＝0）。
- **狀態分級（TSB）**：> +25 體能流失、+5～+25 巔峰、−10～+5 維持、−25～−10 有效訓練、−40～−25 注意、< −40 過度。
- **週目標**：預設每週 450 分鐘（低 240、高 600），恢復週 × 0.6，Peak 區塊逐週減量；新計畫第一週上限為「近 4 週平均 × 1.2」（下限 240），之後每個負荷週最多 × 1.1；週 TSS 目標 ＝ 分鐘 ÷ 60 × 50。
- **結構化課表格式**：步驟陣列，每步有 `type`（warmup／active／rest／cooldown）、`durationSeconds` 或 `distance`、強度目標（功率、心率或配速區間），可巢狀 `reps` 重複組；重複組必須含恢復步驟。

## 分期計畫

每一期都能單獨合併、可用，並附測試。

- [x] **第 1 期 · 訓練負荷引擎與運動員檔案**（其他模組都依賴它）· 2026-11-13 完成
  - 運動員檔案新增：最大心率、安靜心率、LTHR、臨界配速／FTP（選填）、體重。
  - `src/training-load.mjs`：每筆活動的負荷分數＋來源＋可信度；逐日 CTL／ATL／TSB；狀態分級。
  - 首頁 KPI 加體能、疲勞、狀態。
- [x] **第 2 期 · Performance 頁**（2026-11-13 完成；功率曲線與 FTP 演進待有功率資料再做）：PMC 圖（期間切換 7／30／90 天／全部）、強度分布、每週量趨勢、個人最佳（依 FIT 分圈：1K、5K、10K 最快）。
- [x] **第 3 期 · Activities 行事曆與 Workout 詳情**（2026-11-13 完成；地圖與 FIT 曲線沿用資料分頁）：月／週行事曆；活動詳情整合現有地圖、分圈、新增負荷與心率區間分布。
- [x] **第 4 期 · Goals**（2026-11-13 完成）：四類目標 CRUD、進度、優先級、賽事日期；首頁顯示主要目標倒數。
- [x] **第 5 期 · Training Plan 與 My Plan**（2026-11-13 完成；範本庫以「用此設定重新產生」代替）：依目標產生週期化計畫（區塊／週／日），套用週目標規則；計畫庫、範本；與現有週課表、提案確認流程整合。
- [x] **第 6 期 · 結構化 Workout**（2026-11-13 完成；尚未匯出到手錶）：計畫課的暖身／重複組／緩和；依配速或心率區間；執行比對。
- [ ] **第 7 期 · Fitness / Health**：每日手動健康紀錄（睡眠、安靜心率、HRV、體重、主觀疲勞）與趨勢圖、簡單準備度；之後再接 Garmin 健康資料。
- [ ] **第 8 期 · Coaching**：8a AI 教練強化（晨間報到問答、建議紀錄頁、對話記憶）；8b 真人教練帶多位學員（需帳號系統，排在 ROADMAP 第 4 階段）。

## 使用者決定（2026-11-13）

1. **Coaching 兩種都要**：先做 AI 教練強化（晨間報到、建議紀錄、對話記憶）；真人教練管理多位學員排在註冊登入與資料隔離之後（ROADMAP 第 4 階段）。
2. **順序**：照分期，第 1 期先做。
