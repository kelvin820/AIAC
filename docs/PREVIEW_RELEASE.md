# 朋友試用版 · 2026-11-11

公開原始碼：https://github.com/kelvin820/AIAC

線上入口：https://kelvin820.github.io/AIAC/

範圍：保留 AIAC 主識別；使用者提供的 SVG 以頁尾小型署名呈現，可點擊／鍵盤展開檢視，關閉後不佔主要工作空間。

線上版支援 Profile、Daily Context、Mock Morning Coaching、聊天換課提案及接受／拒絕、週計畫、實際結果、完成度、FIT SDK 解析與去重、個人記憶／日誌。狀態保存在訪客各自的 localStorage；原始 FIT 不上傳至伺服器。線上版不收 Key，不執行付費 LLM／Strava／MCP；完整能力仍在 Repository 的本機版本。

驗證：23 項自動測試通過，涵蓋共用核心、HTTP、BYOK 次數上限、MCP、FIT、瀏覽器資料隔離與保存失敗回滾；靜態版建置成功。瀏覽器實際確認 Logo 展開、聊天提出 30 分鐘課表、接受後整週計畫更新，重新整理後結果仍保存。

發布採 GitHub Pages 靜態輸出，GitHub Actions 負責測試與建置。不會把本機 data、憑證或 .env 發布到網站。這是介面與流程試用，不代表真實 LLM Coaching 品質已驗收。
