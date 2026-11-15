# AIAC 接手與後續行動

2026-11-15 · Codex 交接給 Claude Code。工作基準是 `origin/codex/claude-handoff`。這個分支以雲端試用提交 `245bc33` 為起點，已包含 GitHub 主線 `a567c98`（PR #9）及其先前合入的壺鈴功能（PR #3）。`main` 是 GitHub Pages 的部署來源。

## 接手

在乾淨的 clone 或另開的工作樹接手。原 Windows 的 AIAC 工作目錄 還有舊版未提交改動。已核對壺鈴、Garmin 錯誤處理、跨週與教練等主要邏輯在新版已有對應實作；舊版淺色版面與部分舊程式仍保留在原工作區。以交接分支的整合版為開發基準。

```bash
git fetch origin
git worktree add -b claude/aiac-next ../AIAC-claude origin/codex/claude-handoff
cd ../AIAC-claude
pnpm install --frozen-lockfile
node --test
```

需要 Node.js 24 以上。進入後先讀 `CLAUDE.md`、`AGENTS.md`、[交接紀錄](HANDOFF.md)及本頁。若接手環境只能選分支，選 `codex/claude-handoff` 再從該分支開始工作。只在 `main` 執行 `git pull` 會取得已合併的功能，雲端儲存與活動詳情需要這個交接分支。

本機啟動用 `node --env-file-if-exists=.env server.mjs`，預設在 `http://127.0.0.1:3140/`。本次以凍結鎖檔安裝依賴，101 項本機測試通過，靜態版和雲端前端都能本機建置。測試使用本機替身與 PGlite，不消耗 LLM 額度。Vercel、Neon 真實連線、私有 Blob 和排程待部署後驗收。

## 功能與決策

- **訓練與資料**　首頁的「本週」固定依個人時區。週課表與活動行事曆對照預計課程、實際活動、完成時間與訓練目的；已有實績的課程受保護。主線另包含表現分析、負荷、目標、週期化訓練計畫、結構化課表及健康紀錄。
- **運動來源**　現階段優先走 intervals.icu（可由 Garmin 轉入）。來源有提供的活動負荷及每日 CTL／ATL 優先採用，缺值才使用 AIAC 計算。個人 Garmin Personal API 可在本機抓原始 FIT。Strava 透過使用者既有帳號 OAuth 登入同意授權，應用程式的 Client ID／Secret 由部署者設定。Apple Watch 可經相容工具匯出 FIT；Apple Health／HealthKit 直連待開發。活動詳情已有 FIT 路徑、分圈與曲線，intervals.icu 活動詳情可按需讀取路線、曲線與分段。有 GPS 時地圖應預設展開。
- **壺鈴**　全身間歇是第一版主流程，可作為無法跑步時的另一種訓練。選定 4–5 個動作並在各輪沿用，允許替換個別站點。已有計時、暫停／續練、完成度、Three.js 3D 動作示範及訓練研究區。壺鈴使用輪數和動作秒數評估，不折算跑步里程或假定等效訓練。可把同一堂課的裝置紀錄與壺鈴結果配對，防止時間和負荷重複計入。真實壺鈴配對仍待使用者案例。
- **教練**　預設 Mock。開頁、編輯、匯入、同步、計時與完成度均走程式邏輯。BYOK 在使用者主動請教練或分析時才呼叫外部模型，並有每日次數及輸出上限。FIT 原始檔與逐秒紀錄留在資料層。MCP 連線為本機唯讀資料工具，匯入前需確認。AIAC 代管模型、付費及多人帳號尚未開通。
- **產品範圍**　延用 AIAC 介面與品牌。可研究 Coach Watts 的功能與公式並依規範註明出處；不 fork。新的負荷、閾值、恢復與訓練計畫公式先登記在 [演算法清單](ALGORITHMS.md) 並取得核准。單人雲端試用是目前目標。

## 資料放在哪裡

| 版本 | 資料位置與搬移方式 |
|---|---|
| 本機 Node | `data/state.json` 存課表、活動、健康與壺鈴等狀態，`data/uploads/` 存原始 FIT，`data/vault.enc` 和 `data/vault.key` 保存本機加密憑證。從畫面匯出 JSON 備份可帶走訓練狀態。原始 FIT 與連線憑證需另外保留。 |
| GitHub Pages | [公開試用版](https://kelvin820.github.io/AIAC/) 使用該瀏覽器的 localStorage，支援本地 FIT 解析和 Mock。每台瀏覽器的試用資料可由畫面匯出備份。 |
| Vercel 雲端方案 | Neon Postgres 存單一擁有者的訓練狀態（`aiac_state`），私有 Vercel Blob 存原始 FIT，憑證放 Vercel 對應環境。細節見 [雲端試用](CLOUD_PREVIEW.md)。此版本尚未部署。 |

換環境時，由使用者以安全方式移交必要的本機備份或自行重填憑證。先用測試活動驗證匯入、保存、讀回、匯出與還原，再由本人決定真實資料的搬移範圍。GitHub 交接包含程式、研究摘要、文件與測試，訓練資料及密鑰留在本機。

## 後續行動

| 步驟 | 現況 | Claude Code 接手後 |
|---|---|---|
| S1　intervals.icu | 本機曾用真實帳戶核對活動負荷、CTL／ATL | 追蹤來源標籤、去重、時間區間與缺值。可用測試資料檢查同一筆 Garmin FIT 與 intervals.icu 活動合併後仍保留精細 FIT 資料。 |
| S2　首頁本週 | 已修正，含歷史課表與跨週測試 | 若改首頁或導覽，驗收瀏覽前週時首頁仍顯示本週。 |
| S3　資料層 | API 與儲存已分離；本機檔案和 Postgres 路徑均可執行 | 先熟悉 `src/application.mjs`、`src/store.mjs`、`src/postgres-store.mjs`、`src/cloud-handler.mjs`。維持備份相容與寫入衝突處理。真實 Neon 讀寫待 S4。 |
| S4　個人雲端試用 | Vercel API、單人登入、Neon 介面、私有 Blob 介面與每日排程已備妥。使用者已建立 Neon，但尚未建立部署 | 等使用者重新排入部署工作後，按 [雲端驗收步驟](CLOUD_PREVIEW.md) 以測試資料走一次完整流程。 |
| S5　演算法 | [R1–R10 審閱單](ALGORITHM_REVIEW.md) 已備妥 | 先送使用者核准，優先看負荷、課表強度與準備度。核准後才調整公式並附驗證案例。 |
| S6　教練風格 | [三種教練風格規格](COACH_STYLES.md) 已列對照案例 | 等使用者選風格及預期回覆，再做提示詞與評估，先用 Mock 或本機替身。 |
| S7　活動與介面 | intervals.icu 活動詳情已獨立為前端模組 | 優先整理資料來源標籤與資料不足狀態，再按使用流程拆主前端。用真實壺鈴活動驗證配對與解除配對，另檢查手機上的訓練計時和 3D fallback。 |
| S8　多人與營運 | 家用試用後再議 | 有需求時規劃各帳號的資料隔離、Garmin 正式 API、Apple Health、教練代管與費用。結構化課表的手錶匯出、FIT 功率曲線與原生 App 可另排。 |

使用者目前無需操作 Vercel。需要測真實來源時，沿用本機 `.env` 的 `INTERVALS_API_KEY`、`INTERVALS_ATHLETE_ID`，必要時加 `GARMIN_PERSONAL_API_KEY`。從「資料」分頁同步並核對來源。有 LLM 需求再請使用者在設定畫面填自己的 Key 並設定預算。
