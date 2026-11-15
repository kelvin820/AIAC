# AIAC 個人雲端試用

## 交接狀態

2026-11-15 已在 Vercel CKM 工作區看到 Neon 資料庫 `neon-copper-window`（Free，Available）。該資料庫的 Projects 頁顯示 **No connections yet**。使用者確認 AIAC 尚未部署到 Vercel，本輪只移交 GitHub。先前 Vercel API 嘗試建立專案回 403。Neon 真實讀寫、Vercel 入口路由、私有 Blob、部署保護與 Cron 均待遠端驗收。

單人雲端試用的原始實作在 `245bc33`，接手請拉 `codex/claude-handoff`。Vercel 提供靜態介面與 API，Neon Postgres 保存課表、活動與健康資料，私有 Vercel Blob 保存原始 FIT。第一次使用時建立單一擁有者的 `aiac_state`。先用示範資料驗收，再由擁有者決定何時匯入本機備份或開啟 intervals.icu 同步。

## 部署狀態（2026-11-15，Claude Code）

- Vercel 專案 `aiac`（CKM 團隊），連 GitHub `kelvin820/AIAC` 的 `main`，推送到 `main` 會自動部署正式版。正式網址 `https://aiac-teal.vercel.app`。
- **框架必須是 Other（`framework: null`）**：Vercel 曾自動判成 Node 伺服器，把前端 `app.js` 當伺服器執行而全部 500。已在專案設定改為 Other；若重建專案要記得改。
- Node 24、安裝 `pnpm install --frozen-lockfile`。
- 環境變數：Neon 已連（`DATABASE_URL` 等）、私有 Blob `aiac-fit-private`（東京）已連、`AIAC_PREVIEW_PASSWORD` 與 `INTERVALS_API_KEY`（使用者自行設定）、`INTERVALS_ATHLETE_ID=0`、`CRON_SECRET`。未設 LLM 金鑰，教練為 Mock。
- 團隊預設的 Vercel Authentication 保護所有 `.vercel.app` 網址：先登入 Vercel，再以 `aiac`＋試用密碼登入 AIAC。
- 已驗證：建置成功、首頁 200、未登入的資料 API 回 401。待使用者實際登入走同步、路線庫、天氣與校正。

## 設定

| 環境變數 | 用途 |
|---|---|
| `DATABASE_URL` | Neon 的 pooled Postgres 連線。從 Vercel 的 Neon 資源按 Connect to Project，核對正確的部署環境已取得這個變數。 |
| `AIAC_PREVIEW_PASSWORD` | 個人試用的瀏覽器登入密碼，至少 16 字元。使用者名稱為 `aiac`。 |
| `CRON_SECRET` | Vercel 排程使用的獨立 Bearer 憑證。 |
| `BLOB_READ_WRITE_TOKEN` | 專用私有 Blob 的存取權，用於上傳與讀取 FIT。 |
| `INTERVALS_API_KEY`、`INTERVALS_ATHLETE_ID` | 選填，供手動同步與每日排程。測試第一輪先用合成活動。 |
| `AIAC_LLM_API_KEY`、`AIAC_LLM_BASE_URL`、`AIAC_LLM_MODEL` | 選填，保留空白時使用 Mock。只有本人確認要用的模型和費用後才填入。 |

## 排入部署時的操作與驗收

1. 使用者準備部署時，在 Vercel 匯入既有 GitHub 倉庫 `kelvin820/AIAC`，以交接分支或其後繼分支建立測試部署。依 `vercel.json` 使用 `node scripts/build-demo.mjs --cloud` 並發布 `dist`，確認 Function API 與重寫規則命中。GitHub Pages 依原本的靜態流程運作。
2. 將現有 Neon 資源連到 AIAC 的測試環境，設定單人登入密碼與專用私有 Blob。預覽與正式環境各自使用獨立資料庫或 Neon 資料庫分支。測試先使用合成 FIT 與空白帳戶。
3. 驗證未登入的資料 API 回 401。首頁的「登入雲端試用」開啟瀏覽器登入，成功後返回首頁。該密碼保護 AIAC API；使用真實健康及 GPS 資料前，另確認 Vercel Deployment Protection 的入口策略及資料 API 的存取。現階段登入代表單一擁有者。
4. 儲存一筆測試訓練並確認 Neon 寫入。重新開瀏覽器或另一個工作階段登入，檢查活動、完成度與備份可讀。上傳合成 FIT 後確認地圖、分圈與活動詳情；檢查只有經驗證的 API 能讀原始檔案。併發更新若遇鎖定會收到 409，可以再試。
5. 驗證下載與還原 JSON 備份。雲端 FIT 上傳和 JSON 還原上限各 4 MB，本機版可處理較大的檔案。較大的本機備份需要另議可驗證的搬移方式。把原始 FIT 另存並核對引用，JSON 備份沒有原始檔或憑證。
6. 在擁有者同意使用真實來源後才設定 intervals.icu，確認手動同步與正式部署 Cron 的 Bearer 驗證。預設 UTC 21:00（台北次日 05:00）。另確認當前 Vercel 方案的 Cron 支援與部署保護是否影響任何入口。

短期可繼續用本機或獨立的 GitHub Pages 試用版。雲端分支目前以 intervals.icu 和 FIT 為主要入口，Garmin Personal／Strava／MCP 留在本機。多人註冊與資料隔離需另外實作。
