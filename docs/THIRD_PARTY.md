# 第三方程式碼與素材

AIAC 借用或改寫的第三方內容。新增借用時，在借用的檔案頂端註明出處與「已修改」，並在此列出。

## Coach Watts

- 來源：https://github.com/watt-mind/coach（commit `4d8d65c`）
- 授權：Apache License 2.0，Copyright Coach Watts contributors。授權全文：https://www.apache.org/licenses/LICENSE-2.0
- 借用內容：訓練負荷計算的公式與取用順序（功率 TSS、心率 HRSS、心率估算、時間估算）、CTL／ATL／TSB 計算、TSB 狀態分級。出處檔案為 `server/utils/normalize-tss.ts`、`server/utils/training-stress.ts`、`docs/02-features/analytics/training-stress-metrics.md`。
- AIAC 的修改：改寫為瀏覽器可用的純函式（`src/training-load.mjs`）；新增跑步配速分數；每筆分數附來源與可信度；逐日計算含無訓練日；未使用 Coach Watts 的名稱、標誌或品牌色。
- 另借用：目標的四種類型與欄位（Coach Watts `prisma` Goal 模型、`docs/02-features/goals`），改寫為 `src/goals.mjs`，進度改由 AIAC 資料自動計算並標示來源。
- 另借用：訓練計畫的週目標規則（Coach Watts `server/utils/plans/week-targets.ts`：恢復週 × 0.6、Peak 區塊逐週減量、近 4 週平均 × 1.2 的起始上限與每負荷週 × 1.1、240 分鐘下限），改寫為 `src/training-plan.mjs`，加上跑步的每日安排、預覽確認與受保護日。
- 另借用：結構化課表的步驟格式與「重複組必須含恢復步驟」規則（Coach Watts `server/utils/structured-workout-validation.ts`），改寫為 `src/workout-structure.mjs`，加上跑步模板、配速／心率／RPE 目標與執行比對。
- 另借用：健康紀錄欄位與「以 HRV 和安靜心率估算準備度」的概念（Coach Watts `prisma` Wellness 模型、`fitness` 頁），改寫為 `src/wellness.mjs`，以個人 28 天基準的具名警訊取代分數。
- 另借用：intervals.icu API 的端點、認證方式與欄位對應（Coach Watts `server/utils/intervals.ts`、`services/intervalsService.ts`），改寫為 `src/intervals.mjs`。
- 規劃中的借用（尚未實作）見 `docs/COACH_WATTS_ADOPTION.md`。

## 字體

- Archivo（`public/assets/fonts/archivo-latin.woff2`）：SIL Open Font License 1.1，授權見同目錄 `Archivo-OFL.txt`。
