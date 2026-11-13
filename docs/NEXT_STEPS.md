# 接下來的計畫與使用者準備清單

2026-11-13 · Claude Code 整理。依使用者決策：不 fork Coach Watts、可重寫、試用期只有使用者本人（AI 費用自付）、資料以 intervals.icu 為主、未來部署 Vercel。進度記在 `docs/HANDOFF.md`。

## 開發步驟

| 步驟 | 內容 | 誰做 | 依賴 |
|---|---|---|---|
| S1 | 已驗證本機 intervals.icu 真實同步、活動負荷與每日體能／疲勞 | 使用者＋Codex | 本機 `.env` 填金鑰 |
| S2 | 已修正首頁「本週」，固定以今天所在週計算 | Codex | S1 |
| S3 | 已拆出共用請求處理與本機儲存介面。下一段接 Postgres、處理跨程序寫入及環境憑證 | 一個 agent 獨力完成（避免兩邊同時改） | S2 |
| S4 | 部署 Vercel：Neon Postgres、Blob、排程同步、網站保護 | Claude 或 Codex＋使用者開帳號 | S3 |
| S5 | 演算法核准：審 `docs/ALGORITHMS.md`；研究 R1–R10 候選給使用者選 | 使用者審、agent 研究 | 可與 S3 並行 |
| S6 | 定義「多種 AI 教練」：教練風格、語氣、適用對象、輸出格式 | 使用者主導，agent 寫成規格 | 可與 S3 並行 |
| S7 | 從 intervals.icu 匯入 GPS 路線與分圈；`app.js` 拆模組 | agent | S4 之後 |
| S8 | 收費營運前才做：Garmin 官方 API 申請、多人帳號、金流 | 之後再議 | 試用結論 |

## 使用者可以先準備的事

1. **intervals.icu 實測**（S1）：本機 `git pull origin main`，`.env` 加 `INTERVALS_API_KEY`、`INTERVALS_ATHLETE_ID`，重啟後在「資料」分頁立即同步。回報：是否連上、各頁數字是否合理、首頁體能／疲勞／狀態與 intervals.icu 是否一致。截圖前遮住金鑰。
2. **Vercel 帳號**（S4）：用 GitHub 登入 vercel.com 開免費 Hobby 帳號即可，先不用建專案。網域非必要。
3. **LLM 選擇與預算**：試用期要用哪家模型（Claude、OpenAI、Gemini 或相容服務），並在供應商後台設每月預算上限。金鑰不要貼在聊天或 GitHub。
4. **AI 教練構想**（S6）：一頁文字即可——想提供哪幾位教練（名稱、訓練理念、說話風格、適合誰），各給 2–3 個你期待的回答範例；以及「不同的 AI」是指教練風格、不同模型，或兩者。
5. **功能取捨**：每頁想要的功能，用截圖（Coach Watts 或其他 App）圈出並標「照做／參考／不要」；資料不足時要「先顯示資料不足」還是「整塊不做」。
6. **演算法審閱**（S5）：讀 `docs/ALGORITHMS.md`，優先看 A1（心率負荷公式）、B3（課表強度目標）、D1（準備度規則），標「核准／要改／待研究」。
7. **待回答的問題**：第一版運動項目（只做跑步，或也要騎車、游泳、肌力）；壺鈴功能是否保留在主線。

## 給 Codex 的分工建議

一次只讓一個 agent 改 `server.mjs`、`public/app.js`、`public/style.css`。S3 屬於大改，開工前在 `docs/HANDOFF.md` 註明，完成合併後另一方再接手。
