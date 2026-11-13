# 運動生理演算法登記表

AIAC 用到的所有運動生理計算都登記在這裡：公式、出處、程式位置、用在哪裡、限制，以及使用者是否核准。**新增或修改演算法前先更新本檔，並由使用者核准。** Codex 與 Claude Code 共用。

狀態：**待核准**（使用中，尚未經使用者確認）、**核准**、**待研究**（尚未實作，需先整理候選方法給使用者選）、**淘汰**。

出處分三類：原始方法（論文、書、公開方法）、借用的開源程式（Coach Watts，Apache 2.0，見 `docs/THIRD_PARTY.md`）、AIAC 自訂（我們自己定的規則，最需要使用者審視）。

## A. 訓練負荷

### A1. 單次活動負荷分數（依資料取用順序）· 待核准
- 程式：`src/training-load.mjs` `activityLoad`
- 用在：首頁負荷卡、表現頁、活動列、行事曆、目標（CTL）、訓練計畫的近期量
- 順序與公式：
  0. **intervals.icu 負荷**（`icu_training_load`）：有就直接採用，標示來源 intervals.icu。可信度：高（intervals.icu 以完整紀錄計算）。2026-11-13 使用者決定。
  1. **功率 TSS**（需標準化功率 NP 與 FTP）：`時數 × (NP/FTP)² × 100`。原始方法：Coggan／TrainingPeaks 的 TSS。改寫自 Coach Watts `normalize-tss.ts`。可信度：高。
  2. **心率 HRSS**（需平均心率、最大心率、安靜心率）：`秒 × 平均心率 × HRR ÷ (LTHR × 3600) × 100`，HRR＝(平均心率－安靜)÷(最大－安靜)，無 LTHR 時以最大心率 90% 代替。出處：Coach Watts 的簡化版。**注意：這不是 TrainingPeaks 標準 hrTSS（後者以 TRIMP 相對於閾值 1 小時的 TRIMP 計算），數值會不同。** 可信度：中。
  3. **跑步配速分數**（需臨界配速）：`時數 × (臨界配速 ÷ 平均配速)² × 100`。AIAC 自訂的簡化 rTSS，未計坡度與分段強度。可信度：中。
  4. **心率估算**（只有最大心率）：`時數 × 100 × (平均心率/最大心率)²`，低於 55% 打 0.75 折。出處：Coach Watts。可信度：低。
  5. **時間估算**：每小時 36。出處：Coach Watts。可信度：低。
- 限制：只用整筆平均值，沒有逐秒串流；間歇課會被低估。

### A2. 以 intervals.icu 為優先 · 核准（2026-11-13）
- 使用者決定：**intervals.icu 有算的就用 intervals.icu 的，沒有的再用 AIAC 的算法。**
- 活動負荷：有 `icu_training_load` 即採用（A1 第 0 步）。
- 體能／疲勞：intervals.icu 健康紀錄中每天的 `ctl`、`atl` 存為 `state.intervalsFitness`，見 A3。

### A3. 體能／疲勞／狀態（CTL／ATL／TSB）· 待核准
- 程式：`src/training-load.mjs` `performanceSeries`
- 公式：`CTL += (負荷 − CTL)/42`、`ATL += (負荷 − ATL)/7`、`TSB = CTL − ATL`，逐日計算，無訓練日負荷為 0，從第一筆活動起算。
- 原始方法：Banister 衝量反應模型，Coggan 的 Performance Management Chart。改寫自 Coach Watts `training-stress.ts`。
- **intervals.icu 錨點**（A2）：有 intervals.icu 當天 `ctl`／`atl` 的日子直接採用其數值，其餘日子由 AIAC 公式從前一天接續計算；序列從第一筆活動或第一個錨點開始。每天標示來源（`intervals`／`aiac`）。
- 限制：沒有錨點時，前約 6 週數值偏低（起始值為 0）。

### A4. 狀態分級（TSB 區間）· 待核准
- 程式：`formStatus`
- 區間：> +25 體能流失、+5～+25 巔峰、−10～+5 維持、−25～−10 有效訓練、−40～−25 注意、< −40 過度。
- 出處：Coach Watts 文件 `training-stress-metrics.md`（常見的 PMC 解讀，非單一論文）。

## B. 心率與強度

### B1. 心率五區（相對 LTHR）· 待核准
- 程式：`src/performance.mjs` `HR_ZONES`
- 上限：Z1 <85%、Z2 85–89%、Z3 90–94%、Z4 95–99%、Z5 ≥100% LTHR。
- 原始方法：近似 Joe Friel 的跑步 LTHR 區間（Friel 原版 Z5 再細分為 5a／5b／5c）。
- 限制：強度分布以每筆平均心率歸類，不是逐秒區間時間。

### B2. 無 LTHR 時以最大心率 90% 估算閾值心率 · 待核准
- 程式：`training-load.mjs`、`performance.mjs`、`workout-structure.mjs`
- 出處：Coach Watts 的經驗值。個人差異大，介面會標示「估算」。

### B3. 結構化課表的強度目標 · 待核准（AIAC 自訂，最需要審視）
- 程式：`src/workout-structure.mjs` `INTENSITY`
- 配速（臨界配速的倍數，數字大＝慢）：恢復 1.30–1.45、輕鬆 1.15–1.30、節奏 1.03–1.08、間歇 0.93–0.98。
- 心率（LTHR 比例）：恢復 75–85%、輕鬆 85–90%、節奏 92–98%、間歇 98–105%。
- RPE：恢復 2–3、輕鬆 3–4、節奏 6–7、間歇 8–9。
- 出處：AIAC 自訂，參考 Daniels 配速區間與 Friel 心率區間的大致比例，**未逐項對照原始表格**。

## C. 計畫

### C1. 週目標（恢復週、減量、增量上限）· 待核准
- 程式：`src/training-plan.mjs` `weekTargets`
- 規則：恢復週 × 0.6；減量期逐週 × (1 − 週序/週數 × 0.5)；第一個負荷週不超過近 4 週平均 × 1.2（下限 240 分鐘），之後每個負荷週最多 × 1.1；比賽週 × 0.4。
- 出處：Coach Watts `plans/week-targets.ts`（比賽週 0.4 為 AIAC 自訂）。

### C2. 區塊切分與每日安排 · 待核准（AIAC 自訂）
- 程式：`planBlocks`、`layoutWeek`
- 減量：8 週以上 2 週、4 週以上 1 週；其餘約 40% 基礎、60% 強化。長跑約週量 30%（上限 150 分）；品質課約 15%（30–75 分）；品質課不與長跑或彼此相鄰；恢復週無品質課。
- 出處：AIAC 自訂的常見週期化做法，非特定教練法。

## D. 健康

### D1. 準備度（個人基準的具名警訊）· 待核准（AIAC 自訂）
- 程式：`src/wellness.mjs` `readiness`
- 基準：前 28 天、至少 7 筆的平均與標準差（不含當天）。警訊：HRV < 平均 − max(1 SD, 1)；安靜心率 > 平均 + max(1 SD, 1) 或 ≥ 平均 + 5；睡眠 < 6 小時；疲勞或痠痛 ≥ 4。0 個良好、1 個留意、≥2 個偏低；可判斷指標少於 2 項為資料不足。
- 概念出處：Coach Watts「以 HRV 與安靜心率估算準備度」；常見做法另有以 ln rMSSD 的 7 日平均對照 60 日正常範圍（Plews 等人），見 R5。

### D2. intervals.icu 主觀分數換算 · 待核准
- 程式：`src/intervals.mjs` `mapWellness`
- intervals.icu 1–4 → AIAC 1–5：睡眠品質與心情（1 最好）→ 5/4/2/1；疲勞、痠痛、壓力（1 最低）→ 1/2/4/5。
- 出處：方向依 Coach Watts `intervals.ts` 的對應註解。

## E. 其他

### E1. 個人最佳 · 待核准
- 程式：`src/performance.mjs` `personalBests`。只列量測值：最快 1 公里分圈（950–1050 m）、5／10 公里以上的最佳平均配速、最長距離與時間。不推算比賽成績。

### E2. 活動去重 · 待核准
- 程式：`src/activity-core.mjs` `importActivities`。同來源 ID、相同 FIT 雜湊，或同運動、開始相差 ≤30 秒、時間相差 ≤60 秒、距離相差 ≤100 m 視為同一筆。AIAC 既有規則。

### E3. 目標進度 · 待核准
- 程式：`src/goals.mjs` `metricProgress`。`(目前 − 起始) ÷ (目標 − 起始)`，限制在 0–1。

## R. 待研究（尚未實作，先整理候選給使用者選）

| 編號 | 主題 | 用途 | 候選方向 |
|---|---|---|---|
| R1 | 坡度修正配速（GAP／NGP） | 越野與爬坡的配速、負荷 | Minetti 能量成本曲線、Strava GAP、TrainingPeaks NGP |
| R2 | 臨界速度／臨界配速估算 | 自動估臨界配速，不必手填 | 兩點或多點 CS 模型（Monod）、3／12 分鐘測試、由最佳成績回推 |
| R3 | 比賽成績預測 | 賽事目標可行性 | Riegel 公式、Daniels VDOT、Cameron 模型 |
| R4 | VO2max 估算 | 體能趨勢 | 由配速與心率估算（Firstbeat 類方法，公開程度不一）、由 VDOT 換算 |
| R5 | HRV 準備度 | 取代或改良 D1 | ln rMSSD 7 日平均對照 60 日正常範圍（Plews、Kiviniemi） |
| R6 | 有氧心率漂移（Pa:HR decoupling） | 有氧基礎評估 | Friel 的前後半段配速／心率比 |
| R7 | 訓練單調度與壓力 | 過度訓練風險 | Foster 的 monotony／strain |
| R8 | 急慢性負荷比（ACWR） | 增量風險 | Gabbett 的 ACWR（EWMA 版本），注意學界爭議 |
| R9 | 其他心率區間模型 | 讓使用者選 | Karvonen（心率儲備）、最大心率百分比、Seiler 三區 |
| R10 | 跑步功率 | 有功率計者 | Stryd 臨界功率等，視資料而定 |

整理方式：每項列出候選方法、出處、所需資料、優缺點與建議，使用者核准後才實作。
