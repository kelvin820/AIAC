# 第三方程式碼與素材

AIAC 借用或改寫的第三方內容。新增借用時，在借用的檔案頂端註明出處與「已修改」，並在此列出。

## Coach Watts

- 來源：https://github.com/watt-mind/coach（commit `4d8d65c`）
- 授權：Apache License 2.0，Copyright Coach Watts contributors。授權全文：https://www.apache.org/licenses/LICENSE-2.0
- 借用內容：訓練負荷計算的公式與取用順序（功率 TSS、心率 HRSS、心率估算、時間估算）、CTL／ATL／TSB 計算、TSB 狀態分級。出處檔案為 `server/utils/normalize-tss.ts`、`server/utils/training-stress.ts`、`docs/02-features/analytics/training-stress-metrics.md`。
- AIAC 的修改：改寫為瀏覽器可用的純函式（`src/training-load.mjs`）；新增跑步配速分數；每筆分數附來源與可信度；逐日計算含無訓練日；未使用 Coach Watts 的名稱、標誌或品牌色。
- 另借用：目標的四種類型與欄位（Coach Watts `prisma` Goal 模型、`docs/02-features/goals`），改寫為 `src/goals.mjs`，進度改由 AIAC 資料自動計算並標示來源。
- 規劃中的借用（尚未實作）見 `docs/COACH_WATTS_ADOPTION.md`。

## 字體

- Archivo（`public/assets/fonts/archivo-latin.woff2`）：SIL Open Font License 1.1，授權見同目錄 `Archivo-OFL.txt`。
