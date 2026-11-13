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

在「今日訓練」或「週課表」可排全身壺鈴間歇。填可用時間與器材，預覽 4–5 個動作與 2–5 輪。每輪沿用同一套動作，可在動作開始前替換同類站點。計時段結束後確認結果，支援暫停、續練、加休息和提前結束。壺鈴使用完整輪數與動作秒數對照計畫；保留被替代的跑步課程，不換算跑步里程。「訓練研究」提供可搜尋的研究結論、限制與原文連結。

課表預覽和訓練中的「看 3D 示範」可播放動作、切換角度、半速觀看或暫停。示範由 Three.js 在瀏覽器繪製，開啟後才載入；若無法啟用 WebGL 2，仍可讀動作要點。硬舉、深蹲與擺盪的動作重點參考 [ACE 入門指導](https://www.acefitness.org/resources/pros/expert-articles/5269/how-to-get-started-with-kettlebells/)與 [ACE 雙手擺盪教學](https://www.acefitness.org/resources/everyone/exercise-library/391/swing/)。

壺鈴課表、進度及訓練紀錄保存在 `data/state.json`，納入備份／還原。靜態試用版存在目前瀏覽器的 localStorage。組課、計時和研究搜尋都不呼叫 LLM，也不需要 API Key。若同一堂課也用手錶記錄，先同步裝置或匯入 FIT，再從壺鈴結果的「同一堂課的裝置紀錄」確認對應。同一堂課可對應多個來源。各筆裝置活動、時間與心率仍可查閱，週進度、活動行事曆及表現分析以 AIAC 計時列入一次。訓練負荷與心率區間採用一筆裝置紀錄，優先取有平均心率的資料。解除對應後，裝置活動恢復單獨計算。

「今日訓練」顯示今天的課與最近同步活動。確認器材後可選「照原計畫」保存選擇，或補充可用時間與調整方向，再按「請教練幫我調整」取得建議。

## FIT 與活動

- 使用 Garmin 官方 @garmin/fitsdk，檢查 FIT 完整性／CRC。解析 session 開始時間、運動時間、距離、平均心率及可用 lap 摘要；多 session 分開保存。上限 20 MB。原檔在 data/uploads，不送 LLM。
- 去重依同來源 ID、相同 FIT SHA-256，或非手動活動同運動類型、開始相差 30 秒內、時間相差 60 秒內、距離相差 100 m 內合併來源。這是啟發式；缺少距離時僅用精確 ID／雜湊。
- 時間、距離、配速、平均心率與缺失標示在本地計算，不耗 token；未實作完整心率漂移與生理模型。
- Apple Watch／Garmin 可透過支援的工具匯出 FIT，或先轉為下方 JSON；不直接讀取 Apple Health XML／HealthKit。
- 本機版支援 Garmin Connect Personal API。將個人金鑰填入本機 `.env` 的 `GARMIN_PERSONAL_API_KEY` 並重啟，從「同步與設定 → 裝置同步」手動同步最近 30 天的原始 FIT。每次最多嘗試下載 10 筆，已成功匯入的活動會跳過。原檔保存在 `data/uploads`，活動頁可讀取 GPS、分圈與逐點曲線。設定 Garmin 金鑰時，背景同步每約 15 分鐘使用 Garmin，Strava 可手動同步。

標準 JSON 頂層為陣列；時間用含 offset 的 ISO 8601，秒／公尺／bpm：

```json
[{"sourceId":"workout-1","startedAt":"2026-11-11T07:00:00+08:00","durationSeconds":2400,"distanceMeters":6000,"avgHeartRate":140,"sport":"running","name":"晨跑"}]
```

## 訓練負荷與狀態

在「運動員與記憶」設定訓練閾值（最大心率、安靜心率、LTHR、臨界配速、FTP、體重，都可留白）。每筆活動依可用資料計算負荷分數，順序為：功率 TSS → 心率 HRSS → 跑步配速分數 → 心率估算 → 只有時間的估算。每筆都標示計算方式與可信度，估算不會當成量測值。

首頁顯示體能（CTL，42 天加權平均）、疲勞（ATL，7 天）與狀態（TSB＝CTL－ATL），以及 7 天變化與近 42 天走勢；資料不足約 6 週時會提示數值尚未穩定。全部在本地計算，不呼叫 LLM。公式改寫自 Coach Watts（Apache 2.0），見 `docs/THIRD_PARTY.md`。

## 活動行事曆

「活動」分頁以月曆顯示每天的計畫課程（虛線框，依訓練類型上色）與實際活動（實心色塊，時間與距離），右側為每週實際時間、計畫時間與負荷合計。點日期看當天計畫與活動，點活動看單次訓練詳情：時間、距離、配速、平均心率與區間、負荷（含計算方式與可信度）、計畫與實際對照、分圈。地圖、曲線與課表對應設定仍在「資料」分頁。

## 訓練計畫

「課表」分頁的「訓練計畫」可依目標與每週可用時間產生週期化課表：基礎期、強化期、減量期（8 週以上 2 週、4 週以上 1 週），綁定賽事目標時最後一週為比賽週，週數依比賽日自動計算，比賽日排在目標日期。每週目標：恢復週（可設每 3 或 4 週）為 × 0.6，減量期逐週遞減；第一個負荷週不超過近 4 週平均 × 1.2（下限 240 分鐘），之後每週最多增加 10%。每天的安排：長跑排在指定日，品質課（Tempo／Interval）不與長跑或彼此相鄰，長跑隔天恢復跑，其餘 Zone2；訓練天數不足時排入分鐘可能少於目標，不硬塞課。

產生後先預覽（區塊、每週目標與排入分鐘、前兩週與比賽週的每日課程），確認才寫入。已過去、已有實際紀錄或已排壺鈴課的日子不會被改動，預覽會列出保留天數；本週課表變動會記入修改紀錄。「我的計畫」列出執行中、已被取代與已封存的計畫，可用同樣設定重新產生。課表格式每天上限 180 分鐘，超過的比賽目標時間以 180 分鐘表示。教練請求會附上目前計畫所在週與區塊。

## 結構化課表

每堂計畫課（休息日與壺鈴課除外）會自動拆成步驟，總時間等於當天分鐘數：Zone2／長跑／室內為暖身、穩定有氧、緩和；恢復跑為單段輕鬆；Tempo 為暖身 15 分、節奏段（超過 30 分鐘分兩段，中間慢跑 3 分）、緩和；Interval 為暖身 15 分、3–8 組「4 分快跑＋2 分慢跑」、緩和（至少需 38 分鐘，太短的品質課改為穩定有氧並註明）。強度目標依序使用臨界配速、LTHR、最大心率 90% 估算的閾值心率，三者皆無時用自覺強度 RPE，並標示依據。步驟不另存，課表或閾值修改時自動更新。

步驟顯示在首頁「今日課表」、課表每天的「課表內容」與行事曆當天。活動對應課表後，單次訓練詳情顯示執行比對：實際與計畫時間、平均心率或平均配速（含暖身緩和，故目標區間放寬 5%）與主課目標，間歇則計算落在目標內的分圈數；沒有分圈時標示無法比對。只陳述量測值，不推論訓練效果。教練請求會附上今天的步驟。

## 目標

「目標」分頁可設定四類目標：賽事（比賽日、距離、目標完賽時間，顯示倒數與當下體能、狀態）、表現（體能 CTL、臨界配速、近 4 週平均每週分鐘，或自訂指標）、體重（讀取訓練閾值的體重）、規律性（每週訓練次數）。能從 AIAC 資料算出的目前值會自動更新，卡片標示資料來源；自訂指標需手動更新。進度為「起始 → 目前 → 目標」的比例，配速這類越小越好的指標也正確計算。規律性與每週分鐘把壺鈴課算進去，同一堂課的裝置紀錄不重複計算。

可設定優先順序、標記完成、封存或刪除。首頁頂端顯示主要目標（進行中、未過期、優先順序最高、日期最近）。目標隨備份匯出；舊備份沒有目標時還原為空清單。

## 表現分析

「表現分析」分頁可切換 7／30／90／180 天或全部：期間的訓練時間、距離、總負荷與體能變化速度；體能、疲勞、狀態與每日負荷的長期走勢（游標停在圖上可看單日數值）；依訓練類型堆疊的每週訓練量；依 LTHR（未設定時以最大心率 90% 估）五區間的強度分布；個人最佳。

資料限制會直接標示：強度分布依每筆活動的平均心率歸類，不是逐秒區間時間；個人最佳只列量測到的紀錄（最快 1 公里分圈需含分圈的 FIT、5／10 公里以上的最佳平均配速、最長距離與時間），不推算比賽成績。

## 自帶 LLM 與費用

在「同步與設定 → 教練與額度」貼自己的 API Key、Base URL 與模型 ID。接口需相容 `/chat/completions`、`response_format: json_object`、`max_tokens`。支援 HTTPS，本機模型可用 localhost HTTP。

- 預設 Mock。即使環境有 LLM_API_KEY 也不會自動使用；舊 .env LLM 設定請改由畫面明確設定，避免燒開發者額度。
- 開頁、編輯、匯入、同步、完成度與本地摘要都不呼叫 LLM。
- 選擇照原計畫只保存情境。外部模型模式下，請教練調整、送出對話或分析單筆活動時才會呼叫供應商。
- 每日嘗試上限預設 5 次，單次輸出上限 800 tokens，可調整。失敗也占額度，供應商可能仍計費。輸入亦計費，因此這不是精確金額上限。
- 輸入情境最多 32000 字元，最近 12 則對話每則最多 1200 字元、10 筆活動摘要、20 筆記憶。不傳 FIT 原始位元組與逐秒紀錄。
- 傳送範圍：Profile、進行中的目標（最多 5 個）、目前訓練計畫的週次與區塊、今天的結構化課表、Daily Context、週計畫、Budget、已確認記憶、有限活動摘要及對話。移除 Key 會切回 Mock。Mock 不是 LLM，也不是科學驗證的訓練引擎。
- AIAC 付費代管尚未開通；沒有結帳、錢包、多用戶額度或共享 Key，尚不收費。

Strava 匯入資料限本機摘要與對照。合併 Garmin 與 Strava 的單筆活動若有本機原始 FIT，可從 FIT 重建分析摘要並交給已設定的外部模型。

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
