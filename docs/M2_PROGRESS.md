# 訓練完成度與資料接口 · 2026-11-11

已實作：預計與實際活動分離、每日及整週時間完成度、訓練目的差異、手動結果、FIT 拖拉／選檔匯入、官方 SDK 與 CRC、正規化、來源及時區、重複活動合併、本地摘要、課表對應、實際資料變更使舊提案失效。

連接設定：LLM BYOK／Mock、每日呼叫及單次輸出上限、Key 加密且不回傳前端、無環境開發者 Key 回退、Strava OAuth／refresh／分頁同步／撤銷、MCP Streamable HTTP／OAuth／工具 schema／唯讀呼叫與標準活動結果匯入。

20 項自動測試通過；HTTP 測試涵蓋真 FIT 上傳、重複匯入、對應與實際 Budget、重啟保存、舊提案拒絕；LLM 替身確認每日上限後不再發送請求，max_tokens 隨設定傳送；MCP 替身驗證 initialize、tools/list、tools/call 與寫入工具拒絕。

瀏覽器確認：週計畫顯示預計、實際、完成度與手動實際結果表單；資料頁顯示 FIT 上傳、Strava 狀態、LLM Key／額度及 MCP 入口。未修改使用者實際訓練資料；畫面見 weekly-comparison-preview.png、connections-preview.png。

未驗證／未完成：真實 LLM Key 呼叫、真實 Strava 帳戶 OAuth、官方 Strava MCP client 資格與授權、Garmin Connect 專用線上 adapter、Apple Health 原生輸入、雲端會員隔離、AIAC 付款／代管模型額度。沒有使用真實付費模型 token，也沒有發布上線。

介面明確區分已可運行功能與尚需外部設定的管道；本版不宣稱 M2 所有生理分析均已完成。原始 M1 驗收是歷史紀錄，當前行為以 README 與此文件為準。

更新 2026-11-13：跨週計畫（前週／本週／下週、歷史保留）與備份匯出／匯入已實作；每天第一次開啟時情境日期與課表週次自動跟到今天。
