# 交接紀錄

Codex 與 Claude Code 輪流開發 AIAC，彼此看不到對方的對話，靠這份紀錄接力。規則見 [`AGENTS.md`](../AGENTS.md)。

- **新紀錄加在最上方**，舊紀錄不要改寫（只能補一行「更正：…」）。
- 每次收工前寫一則，即使只是小修正。
- 寫給下一位接手的人看：他沒有你的對話記錄。

## 格式

```markdown
### YYYY-MM-DD · Codex|Claude Code · 分支名稱
- **做了什麼**：…
- **狀態**：已合併 main／已推分支待合併／進行中
- **測試**：node --test 通過幾項；手動驗證了什麼
- **未完成／注意**：…（刻意不做的事、已知問題、下一步建議）
```

---

### 2026-11-13 · Codex · codex/cloud-preview-and-training-details

- **做了什麼**　S3 加入可獨立執行的 Postgres 存取與交易鎖。S4 備妥 Vercel 建置、單人 API 登入、私有 Blob 介面與每日排程。S5 整理 R1–R10 審閱單，S6 提供三種風格的對照規格。S7 讓活動頁按需讀取 intervals.icu 路線、曲線及分段，並把此功能拆成獨立前端模組。
- **狀態**　Vercel 團隊可讀取，建立新專案回 403。實際部署、Neon 連線、私有 Blob 和平台排程待遠端驗收。
- **測試**　101 項通過。已用 PostgreSQL 引擎驗證登入、保存與回復，另測交易鎖拒絕競爭請求。用真實 Garmin 跑步活動與手機寬度的 Chrome 驗證路線、曲線及分段。GitHub Pages 與雲端建置分開。
- **未完成／注意**　雲端試用只開單人 API。4 MB 上傳上限及設定方式見 `CLOUD_PREVIEW.md`。新生理公式與教練風格待審。其餘前端按功能拆分。

### 2026-11-13 · Codex · codex/api-storage-boundary

- **做了什麼**　完成 S1 真實同步，與來源核對活動負荷及每日體能、疲勞。S2 首頁週次修正在前一個提交。S3 第一段將 HTTP 請求與同步流程移到 `src/application.mjs`，由啟動端提供可非同步的狀態儲存、憑證庫及 FIT 存取；本機仍讀原有資料目錄。手動與背景 intervals.icu 同步共用保存及重試排程，金鑰遭拒後暫停自動同步。
- **狀態**　分支包含 `codex/current-week-dashboard` 的首頁修正。
- **測試**　97 項測試全數通過，試用版建置成功。以替身儲存走過 FIT 上傳、讀取與重設。真實資料留在本機。
- **未完成／注意**　S3 下一段接 Postgres，處理跨程序的寫入衝突，並接雲端環境憑證。上線前需一起驗證私有 FIT 儲存、網站保護與排程。

### 2026-11-13 · Codex · codex/current-week-dashboard

- **做了什麼**　完成 S2 的首頁週次修正。首頁依使用者時區讀取今天所在週的課表、實際訓練和完成度。課表頁保留目前瀏覽的週次。
- **狀態**　基於 PR #9 合併提交 `a567c98`，整合分支供審查。
- **測試**　96 項測試全數通過，靜態試用版建置成功。用 Chrome 在本機版及靜態試用版切到上週，確認首頁日期、摘要與圖表仍為本週。
- **未完成／注意**　S1 等使用者設定本機 intervals.icu 憑證後實測，再處理同步結果及 S3。

### 2026-11-13 · Claude Code · claude/eloquent-meitner-mz160y
- **使用者決定**：intervals.icu 有算的就用 intervals.icu 的，沒有才用 AIAC 算法（`docs/ALGORITHMS.md` A2 已核准）。
- **做了什麼**：`activityLoad` 第 0 步採用 `intervalsLoad`（來源 `intervals`、高可信度）；`performanceSeries` 新增 `anchors` 參數，`state.intervalsFitness`（來自 intervals.icu 健康紀錄的每日 `ctl`／`atl`，`mergeFitness` 寫入，最多保存 800 天）有值的日子直接採用，其餘由 AIAC 公式接續，每天標示來源；`loadSummary`、`performanceData`、目標的 CTL 都改用錨點。備份含 `intervalsFitness` 並驗證，舊備份為空。負荷卡註明體能與疲勞來自 intervals.icu；活動負荷來源名稱新增「intervals.icu」。
- **狀態**：已推分支，與前一則同一個 PR（kelvin820/AIAC#8）。
- **測試**：node --test 通過（新增 3 項：負荷優先、錨點接續、體能資料驗證與上限）。
- **未完成／注意**：同前一則。

### 2026-11-13 · Claude Code · claude/eloquent-meitner-mz160y
- **使用者決策（重要）**：不 fork Coach Watts（UI 不要像），只借功能與演算法，可重寫；試用期只有使用者本人，AI 費用自付；未來部署到 Vercel（不用 Docker）。資料來源以 intervals.icu 為主（Garmin 經 intervals.icu 轉入），其後 Garmin 官方 API、Strava、MCP。所有運動生理演算法需登記出處並經使用者核准。真人教練帶多位學員暫不做。
- **路線**：1) 本機接 intervals.icu（本則）→ 2) 拆架構：請求處理共用化、資料存取介面化（檔案／Postgres）→ 3) 部署 Vercel（Neon Postgres、Blob、排程、網站保護；免費方案排程頻率不足時改為開頁同步＋手動）→ 4) 前端 `app.js` 拆模組 → 5) 一步步定義功能與多種 AI 教練。
- **做了什麼**：新增 `src/intervals.mjs`：fetch-only 客戶端（Basic `API_KEY:<key>`，需運動員 ID）、`mapActivity`、`mapWellness`（1–4 換 1–5）、`mergeWellness`（intervals 優先、保留手填與備註）、`syncRange`（首次 90 天、之後重疊 2 天）、`syncIntervals`。`importActivities` 去重時補上 `normalizedPower`、`intervalsLoad`。`server.mjs`：`.env` 的 `INTERVALS_API_KEY`／`INTERVALS_ATHLETE_ID`、`POST /api/intervals-sync`（可補抓 30/90/180/365 天）、背景每 15 分鐘優先同步 intervals.icu、金鑰被拒時停止自動重試。「資料」分頁新增 intervals.icu 卡片。新增 `docs/ALGORITHMS.md`（現有演算法登記、出處、待核准與待研究清單）；`AGENTS.md` 加上演算法須登記核准的規則。
- **狀態**：已推分支，待合併。使用者需在本機 `.env` 填入 intervals.icu 金鑰實測。
- **測試**：node --test 92 項通過（新增 `tests/intervals.test.mjs` 7 項，用假 fetch；抓到未設定運動員 ID 時崩潰的 bug 並修正）。本環境無法連到 intervals.icu，欄位依 Coach Watts 的實作，尚未以真實帳號驗證。
- **未完成／注意**：GPS 路線與分圈尚未從 intervals.icu 匯入（可用 `/activity/{id}/streams`、`/intervals`）；intervals.icu 的負荷要不要取代 AIAC 自算（ALGORITHMS A2）待使用者決定。

### 2026-11-13 · Claude Code · claude/eloquent-meitner-mz160y
- **做了什麼**：PR #7（健康）已合併並部署。記錄使用者決定：第 8 期 8b「真人教練帶多位學員」暫不做；整體推進方向由使用者檢視後再決定。借用計畫第 1–7 期皆已合併到 `main`。
- **狀態**：本則只改文件，推在分支上，未開 PR（可併入下一個 PR）。
- **測試**：未改程式碼；`main` 上 node --test 85 項通過。
- **未完成／注意**：待決定：8a AI 教練強化、首頁 KPI 應固定以今天所在週計算（見前一則）、Garmin 健康資料匯入、結構化課表匯出到手錶、FIT 功率解析（功率曲線／FTP 演進）。

### 2026-11-13 · Claude Code · claude/eloquent-meitner-mz160y
- **做了什麼**：完成借用計畫第 7 期 Fitness／Health。新增 `src/wellness.mjs`（純函式）：`WELLNESS_FIELDS`、`validateWellness`、`wellnessAction`（save 依日期覆蓋、拒絕未來日期；delete；apply-threshold 只允許安靜心率與體重且經 `validateAthlete`）、`baseline`（前 28 天、至少 7 筆、不含當天）、`readiness`（具名警訊：HRV、安靜心率、睡眠 <6h、疲勞／痠痛 ≥4；good／watch／low／insufficient／none）、`wellnessView`（近一年紀錄、準備度、基準、閾值建議）、`validateStoredWellness`。狀態新增 `state.wellness`；`POST /api/wellness` 與試用版同名；`view()` 新增 `wellnessView`；備份含健康紀錄並驗證；LLM 輸入加入 `readiness`（README 已更新）。前端：側欄「健康」分頁（第 7 個，紅色；手機底部導覽改 10 欄）：紀錄表單、準備度卡（訊號清單與規則說明）、更新閾值建議、14/30/90/365 天趨勢（睡眠長條、安靜心率與 HRV 含個人基準帶、體重）、近期紀錄表（編輯／刪除）；首頁新增一行今日準備度。截圖 `docs/aiac-health.png`。
- **狀態**：已推分支，待合併。
- **測試**：node --test 85 項通過（新增 `tests/wellness.test.mjs` 7 項、HTTP 健康端點）；build-demo 成功；Playwright 以 30 天示範健康資料實際填寫、判定、套用閾值、切換期間，本機與試用版無 console 錯誤。
- **未完成／注意**：健康資料只能手動輸入，Garmin 健康資料尚未接。已知 UX 問題（非本期造成）：首頁 KPI 依「課表頁目前選取的週」計算，若在課表頁瀏覽到其他週，首頁的「本週」會顯示那一週，直到新的一天自動跳回本週；建議改為首頁固定以今天所在週計算。下一步第 8 期 Coaching（8a AI 教練強化）。

### 2026-11-13 · Claude Code · claude/eloquent-meitner-mz160y
- **做了什麼**：完成借用計畫第 6 期結構化 Workout。新增 `src/workout-structure.mjs`（純函式）：`INTENSITY`（恢復／輕鬆／節奏／間歇對應配速倍數、閾值心率比例、RPE）、`targetBasis`（臨界配速 → LTHR → 最大心率 90% → RPE）、`buildStructure`（依課表類型與分鐘產生步驟，總時間恆等於分鐘數；Interval 需 ≥38 分、Tempo ≥30 分，否則改穩定有氧並加 note）、`validateStructure`（重複組須含 rest）、`mainSteps`、`executionCheck`（時間比、平均心率或平均配速對主課目標、間歇分圈命中數；無分圈標 unknown）、`workoutsView`（今天前 35 天到後 70 天的課表日，跳過壺鈴日）。`view()` 新增 `workouts`；LLM 輸入加入 `todayWorkout`（README 已更新）。前端：共用 `renderStructure`（強度時間軸＋步驟清單）出現在首頁今日課表、課表每天、行事曆當天；單次訓練詳情新增執行比對。截圖 `docs/aiac-structured-workout.png`。
- **狀態**：已推分支，待合併。
- **測試**：node --test 78 項通過（新增 `tests/workout-structure.test.mjs` 6 項，含 6 種類型 × 9 種分鐘數的總時間與驗證不變量；測試抓到 30 分鐘 Interval 會超時的 bug，已改為 38 分鐘門檻）；build-demo 成功；Playwright 本機與試用版無 console 錯誤。
- **未完成／注意**：步驟不存檔，也還不能手動編輯或匯出到 Garmin／FIT workout。執行比對只用平均值與分圈摘要，未讀逐秒串流。下一步第 7 期 Fitness／Health。

### 2026-11-13 · Claude Code · claude/eloquent-meitner-mz160y
- **做了什麼**：完成借用計畫第 5 期 Training Plan 與 My Plan。新增 `src/training-plan.mjs`（純函式）：`validatePlanSettings`、`planBlocks`、`weekTargets`（Coach Watts 週目標規則）、`layoutWeek`（依長跑日的固定分散模式 `DAY_PATTERNS`；品質課優先週二／週四相對位置，不與長跑或彼此相鄰；恢復週無品質課；比賽週依目標日期）、`recentWeeklyAverage`（含壺鈴課）、`generatePlan`、`protectedReason`（已過去／已有實際紀錄／已排壺鈴課）、`applyPreview`、`applyPlan`（只寫未受保護日、本週變動記入 revisions、舊執行中計畫標為 replaced）、`trainingPlanAction`（preview／apply／archive；賽事目標自動算週數）、`activePlanStatus`、`validateStoredPlans`。`coach.mjs` 的 `hasRecordedActivity` 改為 export 供共用。狀態新增 `state.trainingPlans`；`POST /api/training-plan`（preview 只回 `{preview}` 不存檔）與試用版同名路徑；`view()` 新增 `planStatus`；備份含計畫並驗證；LLM 輸入加入 `trainingPlan`（README 已更新）。前端在「課表」分頁新增「訓練計畫」卡（執行中狀態、表單、預覽：區塊條、每週目標與排入長條、前兩週與比賽週每日、套用說明）與「我的計畫」清單（重新產生、封存）。截圖 `docs/aiac-training-plan.png`。
- **狀態**：已推分支，待合併。
- **測試**：node --test 72 項通過（新增 `tests/training-plan.test.mjs` 9 項，含 2–7 天 × 4 種長跑日 × 各區塊的「高強度日不相鄰、分鐘合法」不變量；HTTP 預覽不存檔、錯誤與封存）；build-demo 成功；Playwright 於本機（6 週示範資料＋賽事目標）與試用版實際建立、預覽、套用、封存，無 console 錯誤。
- **未完成／注意**：課表格式每天上限 180 分鐘（`validatePlan`），比賽日超過時以 180 表示。計畫只寫週課表，不產生結構化課表（第 6 期）。下一步第 6 期結構化 Workout。

### 2026-11-13 · Claude Code · claude/eloquent-meitner-mz160y
- **做了什麼**：完成借用計畫第 4 期 Goals（以 Codex 的 PR #3 合併後 `main` 為基準）。新增 `src/goals.mjs`（純函式）：`validateGoal`（event／performance／body／consistency）、`metricValue`（CTL、臨界配速、近 4 週每週分鐘、體重自動帶入並附來源）、`metricProgress`（支援越小越好）、`goalProgress`、`goalsSummary`（排序與主要目標）、`goalsForCoach`、`applyGoalAction`、`trainingSessions`（獨立活動＋壺鈴課，裝置紀錄不重複）。狀態新增 `state.goals`；`POST /api/goal` 與試用版 `goal`；`view()` 新增 `goalsView`（不覆蓋原始 `goals`）；備份含目標並逐筆驗證，舊備份缺目標時為空；LLM 輸入加入進行中的目標（README 傳送範圍已更新）。前端：側欄「目標」分頁（粉紅，第 6 個）、目標卡片（倒數、進度條、來源、編輯／完成／封存／刪除）、依類型與指標切換欄位的表單（配速 分:秒、完賽時間 時:分:秒、新增時自動帶入起始值）、首頁頂端主要目標條。截圖 `docs/aiac-goals.png`。
- **修正 main 上的 CSS bug**：PR #3 合併時 `public/style.css` 少了行事曆手機版 `@media(max-width:760px){` 的結尾 `}`，導致其後所有樣式（含 Codex 新增的頁首、壺鈴等 234 行）只在手機寬度生效，桌面版線上試用版因此缺樣式。已補回；修正後桌面各分頁逐一截圖確認。手機底部導覽改為 9 欄（多了「紀錄」與「目標」）。
- **狀態**：已推分支，待合併。
- **測試**：node --test 63 項通過（新增 `tests/goals.test.mjs` 7 項、coach 1 項、HTTP 目標端點）；build-demo 成功；Playwright 實際新增三類目標、驗證錯誤訊息、完成與封存，本機與試用版無 console 錯誤。
- **未完成／注意**：CSS 檔改動前建議先檢查大括號平衡（`python3` 數 `{` `}` 即可）。下一步第 5 期 Training Plan 與 My Plan（依目標產生週期化計畫）。

### 2026-11-13 · Codex · codex/kettlebell-integration

- **做了什麼**　從 `0042afb` 整合本機壺鈴組課、計時、12 個 Three.js 動作示範、訓練研究與裝置對應，沿用 GitHub 版的深色設計、Archivo、訓練負荷、表現分析與行事曆。備份同時支援運動員閾值與壺鈴資料。新增固定版本 Three.js，在使用者開啟示範時才載入。
- **衝突處理**　保留新版自動切日、閾值與月曆，同時接回本機的今日情境、活動管理、週課表完成度和 Garmin 同步狀態。壺鈴課在月曆與表現頁各只列一次，已對應的裝置活動仍可在活動頁查看。訓練時間以 AIAC 計時為準，負荷和心率區間採同一筆裝置資料，優先選有心率的紀錄。
- **測試**　`node --test` 55 項通過，`node scripts/build-demo.mjs` 成功。
- **未完成／注意**　整合分支供審查。沒有對應裝置的壺鈴課列入活動時間，負荷欄留待有裝置紀錄時補上。

### 2026-11-13 · Claude Code · claude/eloquent-meitner-mz160y
- **做了什麼**：完成借用計畫第 3 期。新增「活動行事曆」分頁（側欄第 3 個，珊瑚色）：月曆（週一起始，8 欄含週合計：實際時間、計畫時間、負荷）、計畫課虛線框與實際活動實心色塊依訓練類型上色、當日負荷、上／下月與本月切換；點日期展開當天計畫與活動；點活動開啟單次訓練詳情（5 個數值、負荷計算方式、計畫與實際對照與時間完成度、分圈表、前往資料分頁）。全部前端組合現有 state（`plan`、`planHistory`、`activities`、`load.perActivity`、`performance.activities`），無新 API。手機版月曆縮成色條。截圖 `docs/aiac-calendar.png`。
- **狀態**：已推分支，待合併（PR #2）。
- **測試**：node --test 46 項通過（本期無新增純函式）；Playwright 操作本機版與試用版行事曆（點日期、點活動、切月）無 console 錯誤。
- **未完成／注意**：月曆邏輯在 `public/app.js`，尚無單元測試；若要測試可抽到 `src/` 並在 server 白名單提供。地圖沒有搬進詳情面板（Leaflet 初始化綁在資料分頁）。下一步第 4 期 Goals。

### 2026-11-13 · Claude Code · claude/eloquent-meitner-mz160y
- **做了什麼**：完成借用計畫第 2 期 Performance。新增 `src/performance.mjs`（純函式）：`performanceData` 回傳完整 PMC、每筆活動摘要（週、分鐘、距離、負荷、可信度、類型、心率區間）、區間界線、個人最佳；`HR_ZONES`（LTHR 五區）、`thresholdHeartRate`（無 LTHR 用最大心率 90% 並標示估算）、`personalBests`（最快 1 km 分圈、5K／10K 以上最佳均速、最長距離／時間，只用量測值）。`view()` 新增 `performance`。前端新增「表現分析」分頁（側欄第 3 個，黃色）：期間切換（前端過濾，不重打 API）、4 個期間 KPI、PMC 大圖（整數刻度、每日負荷長條、原生 tooltip，手機可橫向捲動）、每週訓練量（依類型堆疊，未標類型時用對應課表類型）、強度分布、個人最佳。截圖 `docs/aiac-performance.png`。
- **狀態**：已推分支，待合併（PR #2）。
- **測試**：node --test 46 項通過（新增 `tests/performance.test.mjs` 3 項）；build-demo 成功，試用版表現頁切換期間無 console 錯誤。
- **未完成／注意**：功率曲線、FTP 演進需要功率資料，FIT 解析尚未讀出功率，暫不做。強度分布是每筆平均心率歸類，不是逐秒；要逐秒需讀 FIT record 心率串流。下一步第 3 期 Activities 行事曆與 Workout 詳情。

### 2026-11-13 · Claude Code · claude/eloquent-meitner-mz160y
- **做了什麼**：完成 Coach Watts 借用計畫第 1 期「訓練負荷引擎與運動員檔案」。新增 `src/training-load.mjs`（純函式，本機與試用版共用）：`activityLoad`（功率 TSS → 心率 HRSS → 配速分數 → 心率估算 → 時間估算，每筆附 source／confidence／method）、`performanceSeries`（逐日 CTL 42 天／ATL 7 天，含無訓練日）、`formStatus`、`loadSummary`、`validateAthlete`。狀態新增 `state.athlete`（獨立於 profile，避免舊備份還原失敗）；`POST /api/athlete` 與試用版 `athlete`；`view()` 加 `load`；備份含 athlete，舊備份缺 athlete 時用預設值。介面：「我」頁訓練閾值表單（臨界配速以 分:秒 輸入）、首頁「訓練負荷與狀態」卡片（三數值、7 天變化、狀態標籤、42 天走勢、估算提示）、活動列顯示負荷與可信度。`docs/THIRD_PARTY.md` 記錄 Apache 2.0 出處；README 新增說明。使用者決定 Coaching 兩種都要，已寫入計畫。
- **狀態**：已推分支，待合併（PR #2）。
- **測試**：node --test 43 項通過（新增 `tests/training-load.test.mjs` 9 項、HTTP 測試補 athlete 端點與字體 Content-Type）。以 6 週示範資料實際啟動 server 截圖確認。
- **未完成／注意**：下一步第 2 期 Performance 頁（PMC 大圖、期間切換、強度分布、每週量、個人最佳）。FIT 匯入目前沒有 normalizedPower 欄位，功率 TSS 只在 Strava weightedWatts 或日後補上 NP 時生效。配速分數未計坡度。

### 2026-11-13 · Claude Code · claude/eloquent-meitner-mz160y
- **做了什麼**：深讀 watt-mind/coach（Coach Watts，Apache 2.0），寫成 `docs/COACH_WATTS_ADOPTION.md`：授權與借用原則、九個模組對照、可借用的公式（TSS／HRSS／估算、CTL／ATL／TSB、週目標與恢復週、結構化課表格式）、8 期分期計畫。未改程式碼。
- **狀態**：已推分支（PR #2）。
- **測試**：未改程式碼。
- **未完成／注意**：等使用者確認「Coaching」範圍與順序；建議先做第 1 期「訓練負荷引擎與運動員檔案」。借用程式碼時要標註來源並加 `docs/THIRD_PARTY.md`。

### 2026-11-13 · Claude Code · claude/eloquent-meitner-mz160y
- **做了什麼**：使用者要求圖示更鮮豔（參考 Coach Watts）。側欄每個分頁一個鮮豔顏色（今日橘、課表綠、我 青、日誌紫、資料藍，CSS `--ic`），選中時整格以同色淡底＋色條標示；KPI 標籤加彩色小圖示；訓練類型色提高飽和度，課表進度環改用該天的訓練類型色；品牌綠改為 `#2FE39A`。
- **狀態**：已推分支，待合併（PR #2）。
- **測試**：node --test 34 項通過；build-demo 成功；截圖已更新。
- **未完成／注意**：使用 `color-mix()`（現代瀏覽器皆支援）。

### 2026-11-13 · Claude Code · claude/eloquent-meitner-mz160y
- **做了什麼**：使用者看過暖色版後認為「太 low」，並以 Stryd 儀表板為參考。改為深色、資料優先的效能儀表板（自創配色，未使用 Stryd 品牌元素）：深綠黑底、窄圖示側欄、杏桃色只標每區最重要的數字、訓練類型以顏色編碼（Zone2 綠、恢復藍、Tempo 黃、Interval 珊瑚、長跑紫、室內藍紫、休息灰，CSS `[data-type]`）。今日頁新增 KPI 列（`#kpis`：本週實際、課表規劃、課表完成度、品質課）與每週預計／實際長條圖（SVG，`weekChart()`）；週節奏卡片移除重複的大數字。頁面大標題縮小為精簡標題列。字體由 Nunito 改為 Archivo（OFL，自帶 `public/assets/fonts/archivo-latin.woff2`）。
- **狀態**：已推分支，待使用者看效果後合併（PR #2）。
- **測試**：node --test 34 項通過；build-demo 成功；Playwright 截圖桌面／手機各頁、試用版字體載入且無 console 錯誤。截圖已更新 `docs/aiac-redesign-*.png`。
- **未完成／注意**：圖表與 KPI 只用現有資料，沒有負荷模型（RSS、RSB 類指標尚未實作，不要捏造）。Leaflet 地圖底圖仍為淺色 OSM。今日表單仍是一般欄位。

### 2026-11-13 · Claude Code · claude/eloquent-meitner-mz160y
- **做了什麼**：安裝 Anthropic 官方 skills（anthropics/skills，Apache 2.0）：`frontend-design`、`webapp-testing`、`theme-factory`、`canvas-design`、`brand-guidelines`。完整內容在 `.agents/skills/<name>/`（附 `SOURCE.md`），`.claude/skills/<name>/SKILL.md` 為轉介檔。安裝前已讀過全部文字檔與腳本：`webapp-testing/scripts/with_server.py` 只啟動指定伺服器並執行指令；PDF 無內嵌腳本；字體為 OFL TTF（3 個被 `file` 誤判，已確認字型表正常）。`AGENTS.md` skill 表已補上用途與限制。
- **狀態**：已推分支，待合併（PR #2）。
- **測試**：未改程式碼。
- **未完成／注意**：`brand-guidelines` 是 Anthropic 品牌，不可用於 AIAC 介面。`frontend-design` 指出「暖米色底＋陶土色強調」是 AI 生成設計的常見樣式；目前改版雖用綠＋杏桃、非陶土色，之後調整時可參考它的原則讓 AIAC 更有辨識度。`canvas-design` 字體約 5.5 MB。

### 2026-11-13 · Claude Code · claude/eloquent-meitner-mz160y
- **做了什麼**：依 `web-design-engineer` skill 做第一版視覺改版（Redesign · Overhaul，溫暖療癒／Headspace 風，使用者選定）。重寫 `public/style.css`：暖米杏底、深綠文字（保留品牌）、杏桃強調色（取自 logo 圓點）、大圓角、膠囊按鈕、柔和陰影與入場動畫（尊重 prefers-reduced-motion）、內文 16px、手機改底部分頁列。字體 Nunito（OFL）自帶於 `public/assets/fonts/`，不連 Google；server 白名單與 `scripts/build-demo.mjs` 已加入字體。HTML 只換側欄 SVG 圖示與英文標題／小標為中文；`app.js` 只改顯示樣板：課表每天的實際結果改為 SVG 進度環＋一行摘要、今天加標記、對話角色中文化。表單欄位名稱、id、data-* 選擇器、API 都未改。
- **狀態**：已推分支，待使用者看效果後合併。
- **測試**：node --test 34 項通過；build-demo 成功；Playwright 截圖桌面與手機四個分頁無跑版，試用版字體載入且無 console 錯誤。截圖：`docs/aiac-redesign-*.png`。
- **未完成／注意**：server CSP 為 `style-src 'self'`，會擋 inline `style` 屬性，動態樣式請用 class 或 SVG 屬性，不要放寬 CSP。中文字仍用系統字體（正黑體／蘋方）。尚未做深色模式；今日表單尚未改成問句卡片（等使用者回饋）。

### 2026-11-13 · Claude Code · claude/eloquent-meitner-mz160y
- **做了什麼**：安裝第三方 skill `web-design-engineer`（ConardLi/garden-skills，MIT，v1.3.0）。完整內容在 `.agents/skills/web-design-engineer/`（Codex 讀這裡），`.claude/skills/web-design-engineer/SKILL.md` 只是轉介檔。安裝前已讀過 SKILL.md 並掃描 references：純 Markdown、無腳本、無下載執行或外傳資料指示。`AGENTS.md` 新增「共用 Skills」一節。
- **狀態**：已推分支，待合併（與前一則同一個 PR）。
- **測試**：未改程式碼。
- **未完成／注意**：使用者要求「美化網頁」。依 skill 流程，改版前要先決定模式（Preserve／Overhaul）並宣告設計系統，取得使用者確認才動 `public/`；目前在等使用者確認方向。

### 2026-11-13 · Claude Code · claude/eloquent-meitner-mz160y
- **做了什麼**：發現 `context.date`（「今天」）只在初次建立時設定，之後不會更新，跨日／跨週後 TODAY 標記、晨間 Coaching 與課表都停在舊日期。新增 `advanceToToday`／`todayIn`（`src/plan-weeks.mjs`）：每天第一次讀取狀態（本機 `GET /api/state`、試用版 `state`）時，把過時的情境日期改為當天；若目前課表正顯示舊日期所在週，跟著切到本週，舊週存入 `planHistory`。以新欄位 `lastOpenedOn` 判斷「新的一天」，當天手動選的過去日期保留到隔天。備份還原會清掉 `lastOpenedOn`，讓還原後第一次開啟也跳到今天。同步更新 README 與 `docs/M2_PROGRESS.md` 的過時描述。
- **狀態**：已推分支，待合併。
- **測試**：node --test 34 項通過（新增 `tests/plan-weeks.test.mjs` 4 項、demo 1 項；demo 備份測試的最後比對改為排除 `lastOpenedOn`）。以過時資料目錄實際啟動 server 驗證：開啟後日期與週次已切到今天，舊週保留在歷史。`node scripts/build-demo.mjs` 成功。
- **未完成／注意**：更正前一則的建議：「跨週與歷史保留」與「備份」其實已在 commit 1103111 實作，下一步不是它們。新週次目前預設全為 Rest／0 分鐘，可考慮「沿用上週課表」；`docs/ROADMAP.md` 階段 1 的剩餘項目（FIT 對應課程、重複活動提示、手機表單）尚待逐項檢查。

### 2026-11-13 · Claude Code · claude/eloquent-meitner-mz160y
- **做了什麼**：新增 `AGENTS.md`（Codex 與 Claude Code 共用規則）、`CLAUDE.md`（匯入 AGENTS.md）、本交接紀錄檔。未改動任何程式碼。
- **狀態**：已推分支，待使用者合併到 main。
- **測試**：node --test 29 項全數通過。
- **未完成／注意**：依 `docs/ROADMAP.md`，下一個功能建議為「跨週與歷史保留」（前週／本週／下週），其次為「FIT 對應與備份」。

### 2026-11-11 · Codex（推定）· main
- **做了什麼**：發布 AIAC 原型與瀏覽器試用版；FIT 匯入顯示 GPS 路線與分圈；Garmin FIT 同步與每週活動對應。
- **狀態**：已在 main。
- **未完成／注意**：見 `docs/M2_PROGRESS.md`「未驗證／未完成」一段。此則由 Claude Code 依 git 歷史補記。
