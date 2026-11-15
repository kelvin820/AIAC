# AIAC 個人雲端試用

Vercel 提供網站與 API，Neon Postgres 保存課表、活動及健康資料，私有 Vercel Blob 保存原始 FIT。新資料庫從空白帳戶狀態開始。先用示範資料驗證登入及備份，之後由擁有者決定何時匯入本機備份或開啟 intervals.icu 同步。

| 設定 | 用途 |
|---|---|
| `DATABASE_URL` | Neon 的 pooled Postgres 連線。服務首次使用時建立 AIAC 狀態表。 |
| `AIAC_PREVIEW_PASSWORD` | 個人試用的瀏覽器登入密碼，至少 16 字元。使用者名稱為 `aiac`。 |
| `CRON_SECRET` | 排程的獨立 Bearer 憑證。 |
| `BLOB_READ_WRITE_TOKEN` | 專用私有 Blob 的存取權，用於上傳與讀取 FIT。 |
| `INTERVALS_API_KEY`、`INTERVALS_ATHLETE_ID` | 選填。開啟手動同步與每日排程。 |
| `AIAC_LLM_API_KEY`、`AIAC_LLM_BASE_URL`、`AIAC_LLM_MODEL` | 選填。全部設定後才啟用教練模型。 |

1. 在 Vercel 匯入 GitHub 分支。建置使用 `node scripts/build-demo.mjs --cloud`。對含真實資料的部署啟用 Vercel Deployment Protection。
2. 建立 AIAC 專用的 Neon 資料庫和私有 Blob，將上表設定放進對應部署環境。預覽與正式環境各自連到自己的資料庫。
3. 確認 API 未登入時回 401。登入後儲存一筆測試紀錄，重新載入並讀取備份。兩個同時寫入的操作會收到其中一個 409，稍後可重試。
4. 確認手動同步，並在正式部署驗證每日排程。預設排在 UTC 21:00。雲端 FIT 上傳與還原備份各限 4 MB。本機版可處理較大的檔案。

在網站首頁按「登入雲端試用」，輸入帳密後會回到首頁。現階段為單一擁有者。原有 GitHub Pages 是獨立的瀏覽器示範。
