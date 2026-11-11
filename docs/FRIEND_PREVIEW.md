# 朋友試用指南

先開啟 https://kelvin820.github.io/AIAC/ ，不用安裝即可試用 Mock Coaching、週計畫、完成度與 FIT 解析。資料只保存在自己的瀏覽器，沒有任何模型費用。以下是需要完整 LLM／線上資料連接時的本機版本啟動方式。

1. 安裝 Node.js 24 以上。
2. 下載 Repository ZIP 並解壓，或 git clone。
3. Windows 雙擊 start.cmd；macOS / Linux 執行 npm install，再執行 node server.mjs。
4. 瀏覽器開啟 http://127.0.0.1:3140 。

一開始使用 Mock，不需要提供任何 API Key，也不會消耗開發者的模型額度。Mock 回答只是操作示範；想評估真實教練品質，請在「資料與分析設定」填自己的 API Key 與模型名稱，並保留呼叫上限。

建議試用：

- 設定 Athlete Profile、偏好與每日時間／動機。
- 產生 Morning Coaching，聊天提出「今天只有 30 分鐘」。
- 比較調整前後課表，選擇接受或拒絕。
- 手動登錄一份實際活動，查看預計／實際／完成度。
- 拖入自己的 FIT，查看摘要、去重與課表對應。
- 重新整理或重啟，確認設定與對話保留。

Strava／MCP 需各自有效的授權與服務資格；Garmin Connect 自動同步與 AIAC 付款尚未開通。請勿把本機 data、原 FIT 或 .env 放上 GitHub。

回饋時請描述「做了什麼 → 預期什麼 → 實際發生什麼」，加上裝置及瀏覽器；截圖請先遮掉 API Key、個資與不想分享的活動內容。
