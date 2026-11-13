# AIAC · AI Adaptive Coaching

**[直接開啟線上試用版](https://kelvin820.github.io/AIAC/)** · [回饋與建議](https://github.com/kelvin820/AIAC/issues/new/choose)

線上版使用瀏覽器本地保存與 Mock Coaching，可操作課表、完成度及 FIT 解析，不收集 API Key、不呼叫付費模型。完整 LLM／Strava／MCP 功能請使用下方本機版。個人署名標誌位於頁尾，點擊可展開，AIAC 主識別維持原樣。

本地 Web Prototype：Coaching、預計／實際訓練對照、FIT 活動與使用者自帶 LLM／資料連接。

## 啟動

需要 Node.js 24 以上。Windows 雙擊 start.cmd；第一次會以 pnpm 或 npm 安裝官方 FIT 與 MCP SDK。也可先執行 `pnpm install --frozen-lockfile`，再執行：

```powershell
node --env-file-if-exists=.env server.mjs
```

開啟 http://127.0.0.1:3140 。Ctrl+C 停止。僅監聽本機，適合單使用者、單一程序。尚未實作雲端會員與多使用者資料隔離。

## 預計與實際完成度

「每週訓練計畫」保留教練預計類型與分鐘，旁邊呈現實際時間、距離、時間完成度與訓練目的差異。完成度 = 已對應活動時間 ÷ 預計時間，可超過 100%。Zone2 不因時間相同被視為完成 Interval；實際目的由使用者確認，否則顯示待確認。

可手動登錄結果，或在資料頁拖入 FIT。匯入後選擇對應課表，避免同日多次活動自動誤配。未對應活動仍按匯入時指定時區的當地日期計入週總時間，但不計課表完成度。舊版完成勾選保留供參考，不再生成假定的實際分鐘。

修改課表保留版本紀錄，不覆寫活動。Coaching 提案需確認才套用；已有實際結果的課程不可被提案改寫，活動變動後舊提案失效。可切換前一週／本週／下一週；切換時保留各週課表與已對應的實際活動，新週次預設為休息日。每天第一次開啟時，若「今天」的情境日期已過時，會自動改為當天，原本顯示舊日期所在週的課表也會跟著切到本週；當天手動選的過去日期會保留到隔天。

## FIT 與活動

- 使用 Garmin 官方 @garmin/fitsdk，檢查 FIT 完整性／CRC。解析 session 開始時間、運動時間、距離、平均心率及可用 lap 摘要；多 session 分開保存。上限 20 MB。原檔在 data/uploads，不送 LLM。
- 去重依同來源 ID、相同 FIT SHA-256，或非手動活動同運動類型、開始相差 30 秒內、時間相差 60 秒內、距離相差 100 m 內合併來源。這是啟發式；缺少距離時僅用精確 ID／雜湊。
- 時間、距離、配速、平均心率與缺失標示在本地計算，不耗 token；未實作完整心率漂移與生理模型。
- Apple Watch／Garmin 可透過支援的工具匯出 FIT，或先轉為下方 JSON；不直接讀取 Apple Health XML／HealthKit。
- 本機版支援 Garmin Connect Personal API。將個人金鑰填入本機 `.env` 的 `GARMIN_PERSONAL_API_KEY` 並重啟，從「資料與分析設定」手動同步最近 30 天的原始 FIT。每次最多嘗試下載 10 筆，已成功匯入的活動會跳過。原檔保存在 `data/uploads`，活動頁可讀取 GPS、分圈與逐點曲線。設定 Garmin 金鑰時，背景同步每約 15 分鐘使用 Garmin，Strava 可手動同步。

標準 JSON 頂層為陣列；時間用含 offset 的 ISO 8601，秒／公尺／bpm：

```json
[{"sourceId":"workout-1","startedAt":"2026-11-11T07:00:00+08:00","durationSeconds":2400,"distanceMeters":6000,"avgHeartRate":140,"sport":"running","name":"晨跑"}]
```

## 訓練負荷與狀態

在「運動員與記憶」設定訓練閾值（最大心率、安靜心率、LTHR、臨界配速、FTP、體重，都可留白）。每筆活動依可用資料計算負荷分數，順序為：功率 TSS → 心率 HRSS → 跑步配速分數 → 心率估算 → 只有時間的估算。每筆都標示計算方式與可信度，估算不會當成量測值。

首頁顯示體能（CTL，42 天加權平均）、疲勞（ATL，7 天）與狀態（TSB＝CTL－ATL），以及 7 天變化與近 42 天走勢；資料不足約 6 週時會提示數值尚未穩定。全部在本地計算，不呼叫 LLM。公式改寫自 Coach Watts（Apache 2.0），見 `docs/THIRD_PARTY.md`。

## 表現分析

「表現分析」分頁可切換 7／30／90／180 天或全部：期間的訓練時間、距離、總負荷與體能變化速度；體能、疲勞、狀態與每日負荷的長期走勢（游標停在圖上可看單日數值）；依訓練類型堆疊的每週訓練量；依 LTHR（未設定時以最大心率 90% 估）五區間的強度分布；個人最佳。

資料限制會直接標示：強度分布依每筆活動的平均心率歸類，不是逐秒區間時間；個人最佳只列量測到的紀錄（最快 1 公里分圈需含分圈的 FIT、5／10 公里以上的最佳平均配速、最長距離與時間），不推算比賽成績。

## 自帶 LLM 與費用

「資料與分析設定」貼自己的 API Key、Base URL 與模型 ID。接口需相容 `/chat/completions`、`response_format: json_object`、`max_tokens`。支援 HTTPS，本機模型可用 localhost HTTP。

- 預設 Mock。即使環境有 LLM_API_KEY 也不會自動使用；舊 .env LLM 設定請改由畫面明確設定，避免燒開發者額度。
- 開頁、編輯、匯入、同步、完成度與本地摘要都不呼叫 LLM。
- 只有點晨間建議、送出對話、點活動教練分析才會呼叫。沒有背景分析、自動重試或共享 Key 回退。
- 每日嘗試上限預設 5 次，單次輸出上限 800 tokens，可調整。失敗也占額度，供應商可能仍計費。輸入亦計費，因此這不是精確金額上限。
- 輸入情境最多 32000 字元，最近 12 則對話每則最多 1200 字元、10 筆活動摘要、20 筆記憶。不傳 FIT 原始位元組與逐秒紀錄。
- 傳送範圍：Profile、Daily Context、週計畫、Budget、已確認記憶、有限活動摘要及對話。移除 Key 會切回 Mock。Mock 不是 LLM，也不是科學驗證的訓練引擎。
- AIAC 付費代管尚未開通；沒有結帳、錢包、多用戶額度或共享 Key，尚不收費。

Strava 匯入活動目前限本地摘要與對照，不直接交給自訂 LLM；官方 MCP 的 AI 使用須依服務商支援與資料政策進行。

## Strava

已實作 OAuth、state、callback、加密 token 保存、refresh、分頁活動同步與遠端撤銷。需開發者建立 App，在 .env 設 STRAVA_CLIENT_ID、STRAVA_CLIENT_SECRET。Callback domain 為 127.0.0.1；回呼 `http://127.0.0.1:3140/auth/strava/callback` 隨 PORT 調整。使用者在 Strava 網站登入授權 activity:read_all，不把密碼交給 AIAC。

本機 AIAC 服務執行期間，Strava 授權完成後會自動同步，即使瀏覽器已關閉。首次讀取最近七天，之後約每 15 分鐘增量同步，保留一天重疊以讀取稍晚上傳的活動。同一筆活動仍會去重。服務重啟後接續上次成功進度，停止服務期間暫停同步。首頁顯示最新同步活動，資料設定頁可查看同步時間和錯誤，也可立即同步。

每次最多讀取 10 頁，每頁 100 筆。超過上限或 API 錯誤時保留上次成功進度，授權失效則暫停至重新登入。需要有效 App、帳戶資格、授權與服務額度，尚待真實帳戶驗證。GitHub Pages 試用版不會執行背景同步。

## MCP

使用官方 MCP SDK，支援 Streamable HTTP、Bearer、標準 OAuth discovery／動態註冊／PKCE。儲存網址後連接；需授權時顯示服務商登入連結。服務商不支援動態註冊或不接受此 client 時，仍需額外資格，不能只貼網址就取得資料。

列出工具與 JSON schema 後，由使用者填參數執行 readOnlyHint 明確為真的工具。結果先預覽，不自動改課表／記憶或呼叫 LLM。結果為標準活動陣列或 structuredContent.activities 時可確認匯入；其他結構請轉為標準 JSON，不從自由文字猜數據。不支援 stdio、任意寫入工具或把任意 MCP 當成 LLM 供應商。MCP 服務也可能有自己的費用。

Strava 官方 endpoint：`https://mcp.strava.com/mcp`，需要訂閱與 OAuth。官方 client 支援範圍可能不同；本版通過協定替身測試，未宣稱已通過 Strava 官方帳戶授權。

## 憑證與資料

一般狀態在 data/state.json；原 FIT 在 data/uploads。API Key／OAuth token 以 AES-256-GCM 存於 data/vault.enc，金鑰在 data/vault.key。不回傳前端、不進 localStorage 或一般 state JSON。這不是 OS Keychain：取得整個 data 目錄者仍可解密，請用本機帳戶權限保護並成組備份。

.env、data、node_modules、FIT 不進 Git。日誌的全部重設會刪本地活動、原檔、記憶、憑證與額度紀錄；不會刪供應商帳單或自行備份。Strava 撤銷會呼叫遠端；MCP 移除僅刪本機，遠端請到服務商撤銷。

## 測試與架構

`node --test`。使用本地 HTTP／LLM／MCP 替身，不耗真實 token。核心在 src/ 的 coach、activities、store、vault、providers、mcp、strava，與 HTTP／UI 分離。UI 為原生 ES modules，單一 Node 服務。

驗證紀錄見 docs/M2_PROGRESS.md。FIT 真實編碼與 CRC、去重、實際完成度、持久化、提案決策、加密／遮蔽、環境 Key 不回退、每日硬上限、唯讀 MCP 均有測試。

官方來源（2026-11-11 查核）：

- [Garmin FIT SDK](https://github.com/garmin/fit-javascript-sdk)
- [Garmin Connect](https://developer.garmin.com/gc-developer-program/overview/)
- [Strava OAuth](https://developers.strava.com/docs/authentication/)
- [Strava API](https://developers.strava.com/docs/reference/)
- [Strava MCP](https://support.strava.com/en-us/articles/15401531-how-do-i-connect-strava-to-an-ai-assistant)
- [Strava 資料使用說明](https://communityhub.strava.com/developers-knowledge-base-14/strava-api-faq-12906)

## 建置線上試用版

執行 `node scripts/build-demo.mjs` 產生 dist，再執行 `node scripts/preview-demo.mjs` 於 http://127.0.0.1:3141/AIAC/ 預覽。公開部署由 GitHub Actions 建置；dist 不含 data、.env 或任何使用者憑證。Mock 與活動計算沿用共用核心。訪客各自在瀏覽器 localStorage 保存，清除瀏覽器資料會清除試用紀錄，原始 FIT 不上傳也不保存。線上 LLM Key／Strava／MCP 按鈕停用，不把本機單使用者服務直接公開。
