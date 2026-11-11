# AIAC — AI Adaptive Coaching
## Product Requirements & Codex Development Specification v1.0

**文件版本：** 1.0  
**日期：** 2026-11-10  
**專案階段：** Web Prototype / Product Validation  
**開發執行：** Codex  
**產品定位：** Personal AI Adaptive Coaching Agent  
**最終部署：** Mac mini + OpenClaw + Telegram  
**當前驗證方式：** Web Application

---

# 1. Product Vision — AIAC 是什麼？

AIAC（AI Adaptive Coaching）是一位能夠長期理解使用者的身體狀況、生活環境、個人偏好、訓練目標與心理動機，並持續提供個人化分析與適應性訓練建議的 AI Coach。

**AIAC doesn't just know your training. It understands your life.**

AIAC 不只是懂你的訓練，更懂你的生活。

另一項核心理念：

**AIAC adapts to your life, not the other way around.**

讓訓練適應生活，而不是要求生活配合訓練。

## 1.1 產品本質

AIAC 不是傳統運動紀錄 App，也不是固定課表產生器，更不是簡單地將 Garmin 資料交給 LLM 生成文字報告。

AIAC 是一個以 LLM 的語意理解、情境推理與個人化能力為核心，結合運動資料、外部環境、長期記憶與訓練規劃的 Adaptive Coaching Agent。

它需要完成四個連續任務：

1. **Understand：** 理解使用者及其當下情境。
2. **Analyze：** 分析已完成的運動與長期訓練進展。
3. **Plan：** 根據身體、環境、目標與限制規劃訓練。
4. **Adapt：** 當現實條件改變時，動態調整訓練。

這四個能力形成持續運作的 Coaching Loop。

## 1.2 與 Rule-based App 的根本差異

傳統運動 App 通常根據有限的指標與預先定義的規則產生建議，例如：

- HRV 下降 → 建議休息。
- Training Load 偏高 → 降低訓練強度。
- 今天課表為 Interval → 執行 Interval。
- 天氣炎熱 → 降低配速。

AIAC 必須進一步理解這些訊號背後的情境。

例如：

使用者今天不想跑 Interval，不代表不願意運動；他可能願意完成 45 分鐘 Zone2。

AIAC 應理解這個差異，評估是否能將 Interval 延後，並在維持合理恢復間隔的前提下完成本週主要訓練刺激。

LLM 的優勢在於能綜合解讀非結構化資訊、個人偏好與多重限制。但生理計算、資料品質檢查及安全邊界仍應使用可驗證的計算與規則。

**產品驗證重點是 Coaching 品質，而非單純的 LLM 對話品質。**

---

# 2. AIAC Five Understanding Capabilities

以下五項能力為 AIAC 最重要的產品差異化特性。

## 2.1 AI Understands You

理解使用者的身體、個性、偏好與訓練目標。

系統需要逐步建立 Athlete Profile，包含：

- 運動經驗與目前能力。
- 長期目標與短期目標。
- 常用運動設備。
- 心率與配速的個人基準。
- 喜歡與不喜歡的訓練形式。
- 對訓練強度的接受程度。
- 喜歡戶外或室內運動。
- 喜歡探索風景，或偏好熟悉的路線。
- 過往對 AI 建議的接受與拒絕紀錄。

AIAC 不能將單次對話直接視為永久偏好。應區分明確表達的長期偏好、暫時狀態，以及尚待確認的推測。

## 2.2 AI Understands Your Environment

理解真實訓練環境，而非僅取得天氣數字。

需要考慮：

**氣象環境**
- 氣溫、相對濕度、露點。
- 降雨機率、降雨時間與強度。
- 風速、體感熱負荷。
- 空氣品質、紫外線。
- 日出日落與夜間照明條件。
- 不同時段的天氣差異。

**地理環境**
- 使用者目前所在地。
- 當地時區及跨時區旅行。
- 海拔與坡度。
- 路面類型與路線長度。
- 紅綠燈、交通中斷與停等頻率。
- 路線是否適合 Interval、Tempo、Zone2 或 Long Run。
- 路線的景觀、趣味性與觀光價值。

**室內替代環境**
- 飯店健身房。
- 跑步機。
- 室內自行車。
- 可用器材。
- 健身房開放時間與使用限制。
- 是否需要替代運動方案。

AIAC 不只回答「今天適不適合跑」，還要回答：

「什麼時候跑、在哪裡跑、跑什麼、是否需要調整課表？」

### 代表性使用情境

使用者到東京出差，今天安排 Zone2 60 分鐘。

AIAC 應在取得地點與必要環境資料後，推薦合適的河濱或公園路線，考慮往返距離、坡度、停等、照明與景觀價值。

若天氣不佳，則評估改變時段、路線或改成室內跑步機。

**不能憑空編造路線長度、坡度、營業時間或即時天氣。**

## 2.3 AI Understands Your Constraints

理解生活中的真實限制。

包括：

- 今天可用的運動時間。
- 工作與家庭安排。
- 出差與交通。
- 飯店與健身房設備。
- 能否戶外跑步。
- 是否只能在特定時間訓練。
- 是否需要縮短課程。
- 是否只能選擇替代運動。

例如原本 60 分鐘的課程，今天只有 30 分鐘。

AIAC 應評估保留哪一部分訓練最有價值，而不是機械地將所有訓練段落等比例縮短。

## 2.4 AI Understands Your Progress

理解使用者的長期進步，而不只看單次運動。

包括：

- 每週訓練時間與里程。
- 不同強度的訓練分布。
- Interval、Tempo、Zone2、Long Run 的完成狀況。
- 訓練負荷與恢復趨勢。
- 心率與配速的長期關係。
- VO2max 估計值的變化。
- 長期訓練一致性。
- Weekly Training Budget。
- 未完成課程與補課機會。

### Weekly Budget

Weekly Budget 不能只是一個公里數目標。

它應可包含：

- 總訓練時間。
- 總跑量。
- 低強度訓練量。
- 品質課次數。
- 長跑訓練。
- 恢復需求。

當使用者改變課程，AIAC 應重新評估整週安排。

**不同訓練並非完全等效。** Zone2 與 Interval 的生理刺激不同，不能只因總里程相同就判定訓練效果完全相同。

AIAC 可以在短週期內交換課表，但必須考慮訓練目的、恢復間隔與累積負荷。

## 2.5 AI Understands Your Motivation

理解使用者今天想不想運動，以及為什麼。

例如：

「今天不想跑 Interval。」

「今天精神很好，想多跑一點。」

「這週工作很累，但我不想完全放棄。」

「今天到了一個漂亮的城市，我想邊跑邊觀光。」

AIAC 應將心理動機視為正式 Coaching Input。

不能把使用者的主觀感受當成不重要的附註，也不能因使用者想 Push 就忽略明顯的健康風險。

**AIAC 的目標是讓使用者想練、練得完、持續進步。**

---

# 3. Coach DNA — AIAC 的教練哲學

以下原則應長期保留，並作為 Coaching Skill 的共同指引。

1. **不受傷、穩定進步。** 長期進步優先於單次表現。
2. **不要過度保守。** 不因單一恢復指標不佳就機械地要求休息。
3. **允許合理 Push。** 在證據與風險允許時，可以鼓勵挑戰。
4. **重視 Weekly Budget。** 不能隨意放棄整週訓練目標，但也不能為了完成數字而強行補課。
5. **允許短週期課表交換。** 例如今天 Zone2、後天 Interval。
6. **尊重使用者自主權。** AIAC 提供建議，不強制執行。
7. **充分解釋理由。** 告訴使用者為何調整、預期取捨及風險。
8. **尊重個人動機。** 訓練應具有樂趣與可持續性。
9. **使用真實證據。** 不得將推測包裝成已確認的生理事實。
10. **持續學習與修正。** 根據使用者回饋、訓練結果與長期趨勢更新判斷。

AIAC 的角色應像一位經驗豐富、願意提出不同意見、但尊重使用者選擇的教練。

---

# 4. Daily Operating Model

AIAC 每天提供三項核心服務，並支援隨時互動。

## 4.1 Morning AI Coaching Recommendation

這是 AIAC 的主要主動式功能。

系統每天早上應綜合：

- 最近運動與累積負荷。
- 昨晚睡眠與恢復資料。
- 當天及不同時段天氣。
- 使用者所在地。
- 當週訓練計畫。
- Weekly Budget 完成狀況。
- 使用者偏好與近期動機。
- 已知的時間與場地限制。

產生當日建議。

### Morning Report 必須回答

- 今天建議做什麼訓練？
- 建議在什麼時間？
- 建議在哪裡？
- 建議強度、時間與課程結構？
- 為什麼？
- 有哪些風險？
- 若天氣或行程改變，有什麼 Plan B？
- 對 Weekly Budget 有什麼影響？

Web Prototype 階段以頁面顯示及手動觸發模擬主動推播。

未來由 OpenClaw 排程，透過 Telegram 主動送出。

## 4.2 Post Workout Analysis

使用者完成運動後，可詢問：

「今天表現如何？」

AIAC 應讀取最新活動與歷史資料，分析：

- 運動類型、距離、時間。
- 平均與分段配速。
- 心率與心率區間。
- 心率漂移。
- 步頻與步幅（有資料時）。
- 海拔、坡度與地形。
- 訓練完成度。
- 與預定課表的差異。
- 與歷史相似訓練的比較。
- 當時天氣對表現的可能影響。
- 主觀 RPE、身體感受與訓練動機。
- 對接下來訓練的影響。

必須區分觀察到的事實與可能原因。

例如心率偏高可能與熱負荷、疲勞、地形或感測器誤差有關，不能直接斷定某一個原因。

## 4.3 Evening Reflection

晚上可提供簡短回顧：

- 今日訓練是否完成。
- 本週進度。
- 近期負荷與恢復狀況。
- 明天原訂課程。
- 是否需要提前調整。

MVP 可以先做成按鈕觸發，不需要自動排程。

## 4.4 Interactive Coaching

使用者可以隨時以自然語言改變條件。

例如：

「今天不想跑 Interval。」

「我今天只有 30 分鐘。」

「外面下雨了。」

「我現在在大阪，附近有沒有漂亮的跑步路線？」

「我今天腿有點痠，但是很想跑。」

系統應理解新條件，更新 Context，重新評估建議。

不應要求使用者每次重新輸入完整背景。

---

# 5. Adaptive Coaching — 核心差異化情境

## Scenario A：課表交換

原定：

週二 Interval，週三 Zone2，週四休息。

使用者表示今天不想跑 Interval。

AIAC 評估恢復狀態、訓練目的與本週安排後，可以建議：

週二改 Zone2，週三恢復或休息，週四執行 Interval。

系統必須展示調整前後課表、主要訓練刺激是否保留，以及 Weekly Budget 的變化。

## Scenario B：天氣造成時間調整

原定早上 6:00 跑步，但早上降雨，下午高溫。

AIAC 應比較可行時段，考慮氣溫、濕度、露點、降雨與使用者時間限制。

可能建議延後、縮短、改強度或改室內。

不得只根據最高氣溫決策。

## Scenario C：出差與 Scenic Running

使用者到陌生城市，希望維持訓練並順道觀光。

AIAC 應結合：

- 當地地圖。
- 合適跑步路線。
- 景觀與觀光價值。
- 坡度與交通干擾。
- 距離與可用時間。
- 安全及照明。
- 當地天氣。

例如 Zone2 可以優先考慮風景佳、交通干擾少的路線；Interval 則優先考慮平坦、不中斷的場地。

路線建議必須有資料來源，不得虛構。

## Scenario D：飯店健身房限制

使用者出差，外面雷雨，飯店只有跑步機與啞鈴。

AIAC 應先判斷原課程能否轉換為跑步機訓練。

若無法合理保留原訓練目的，可提出替代方案及其取捨。

不能假設飯店一定有特定設備。

## Scenario E：身體狀態與動機衝突

使用者睡眠不足，但非常想跑。

AIAC 應綜合近期負荷、睡眠、主觀感受、原訂課表及可用替代方案。

不應只說「休息」，也不應無條件鼓勵高強度運動。

應提出可行方案與理由。

## Scenario F：Weekly Budget 重新規劃

週末前仍有訓練量未完成。

AIAC 應評估剩餘時間、恢復間隔、品質課需求與身體負荷。

不能為了追上里程而不合理增加訓練。

## Scenario G：跨時區旅行

使用者從台灣飛往美國。

AIAC 應考慮：

- 當地時間。
- 睡眠時間與節律改變。
- 旅行疲勞。
- 當地天氣。
- 可用訓練時段。

但不能僅憑跨時區就假定使用者一定需要休息。

---

# 6. Web Prototype — 第一階段產品範圍

## 6.1 開發目的

第一階段不驗證 OpenClaw，也不驗證 Telegram 通訊。

主要驗證：

**LLM 是否能透過完整 Context、個人記憶與訓練資料，產生高品質的個人化分析及 Adaptive Coaching。**

Web Prototype 是測試介面，不是最終產品形態。

## 6.2 Web UI 建議

採用簡潔、易理解、偏向聊天的介面。

### 主畫面

顯示：

**Today**
- 今日建議課程。
- 建議時間與場地。
- 建議理由。
- 主要環境與恢復因素。
- Weekly Budget 進度。
- Plan B。

**Coach Chat**
- 自然語言輸入。
- 支援追問與課表調整。
- 保留對話脈絡。

**Workout Analysis**
- 上傳 FIT 檔。
- 查看解析後資料。
- 產生 AI 分析。
- 與歷史訓練比較。

**Weekly Plan**
- 一週課表。
- 完成狀況。
- 課表交換。
- 剩餘訓練量。

**Athlete Profile**
- 長期目標。
- 偏好。
- 訓練限制。
- Coach DNA。
- 可編輯的個人記憶。

**History / Journal**
- 歷史活動。
- 過去 AI 分析。
- 每日建議。
- 課表修改紀錄。

### Web UI 原則

不需要複雜 Dashboard。

最重要的是讓使用者快速知道：

「今天怎麼練？」

「為什麼？」

「如果我不想這樣練，還有什麼選擇？」

---

# 7. Data Sources & Device Independence

AIAC 必須與特定品牌及裝置解耦。

已確認可能來源：

- Garmin Forerunner 965。
- Apple Watch Ultra。
- Garmin Connect。
- Apple Health / HealthKit。
- Strava。

資料可能由不同來源組合。

例如：

Garmin 提供運動資料，Apple Health 提供睡眠。

或 Apple Watch 提供運動，Garmin 提供其他恢復指標。

不得假設所有資料都來自同一裝置。

## 7.1 MVP 資料輸入

優先支援：

1. Garmin FIT 檔案上傳。
2. 手動輸入每日身體與環境 Context。
3. 手動建立或編輯 Weekly Plan。
4. 歷史活動保存。
5. 可使用測試資料模擬缺失來源。

後續再加入：

- Garmin Connect 自動取得資料。
- Apple Health / Shortcuts 匯出。
- Strava。
- 天氣服務。
- 地圖與路線服務。

## 7.2 資料正規化

不同來源資料應轉換為共同的 Canonical Model。

至少區分：

- Activity。
- Physiological Metrics。
- Daily Context。
- Training Plan。
- Athlete Profile。
- Coaching Memory。
- Analysis / Recommendation。

所有數據應保留：

- 資料來源。
- 時間戳記與時區。
- 單位。
- 缺失狀態。
- 必要時的品質標記。

同一活動可能同時存在於 Garmin 與 Strava，必須避免重複計算。

不同裝置的 HRV 指標與計算方法可能不同，不得直接視為等價。

---

# 8. LLM Reasoning & Coaching Architecture

## 8.1 基本架構

Web UI  
→ AIAC Backend  
→ Context Builder  
→ LLM Coaching Orchestrator  
→ Structured Recommendation  
→ Local Persistence  
→ Web Response

其他支援模組：

- FIT Parser。
- Historical Data Retrieval。
- Weekly Plan Manager。
- Weather / Route Provider。
- Athlete Memory。
- Coaching Knowledge。
- Validation & Safety Checks。

## 8.2 LLM 的責任

LLM 主要負責：

- 理解自然語言。
- 綜合多種 Context。
- 理解使用者偏好。
- 產生與比較訓練方案。
- 解釋建議理由。
- 分析運動表現。
- 從歷史互動提出可確認的個人化洞察。

確定性的數值計算，例如每週總里程、訓練時間及課表完成率，應由程式計算，不應完全交給 LLM 自行估算。

## 8.3 不綁定單一運動生理學理論

目前不指定唯一的訓練負荷模型或課表生成演算法。

未來可以研究與比較：

- TRIMP。
- Acute / Chronic Training Load。
- Heart Rate Drift。
- Polarized Training。
- Jack Daniels Training Principles。
- MAF。
- 其他有研究依據的運動生理學模型。

這些模型的假設、適用條件與驗證程度不同。

第一階段先保留模型擴充介面，不急著決定唯一方法。

## 8.4 可追溯性

每次 Coaching 建議應保存：

- 使用的 Context。
- 使用的歷史資料範圍。
- 模型版本。
- 建議結果。
- 主要依據。
- 資料缺失與不確定性。
- 使用者是否接受。
- 後續是否完成。

不要求儲存 LLM 的私有內部推理過程；保存可檢查的決策摘要與依據即可。

---

# 9. AIAC Skill Manifest v0.1

Codex 應將各項能力設計成可獨立測試、可替換的模組。

所有 Skill 使用共同的基本介面：

**Skill ID、Purpose、Trigger、Required Inputs、Optional Inputs、Output、Dependencies、Failure Handling、Persistence、Version。**

初步 Skill 定義如下。

| Skill | Trigger | 核心輸入 | 主要輸出 |
|---|---|---|---|
| Workout Import | FIT 上傳 | FIT file | Normalized Activity |
| Workout Analysis | 使用者請求或活動更新 | Activity + History + Context | Analysis Report |
| Morning Coaching | 手動觸發／未來排程 | Daily Context + Weekly Plan | Today's Recommendation |
| Weekly Planning | 新週期或計畫修改 | Goal + History + Constraints | Weekly Plan |
| Workout Swap | 使用者要求調課 | Current Plan + Context | Revised Plan |
| Weather Adaptation | 天氣變化或查詢 | Weather + Planned Workout | Adjusted Recommendation |
| Travel Coaching | 地點變更或使用者請求 | Location + Timezone + Plan | Travel-adjusted Plan |
| Scenic Route | 使用者要求路線 | Location + Workout Type | Route Candidates |
| Indoor Alternative | 戶外不可行 | Available Equipment + Goal | Alternative Workout |
| Athlete Memory | 活動／對話更新 | Confirmed Facts + Feedback | Updated Memory |
| Evening Reflection | 手動觸發／未來排程 | Today's Activity + Weekly Plan | Daily Reflection |

### Skill Contract 必須遵守

1. 不得假設所有資料都存在。
2. 資料不足時回傳缺失資訊，而不是捏造數值。
3. Skill 不應直接修改其他 Skill 的內部資料。
4. 會改變課表的 Skill 必須留下版本與修改原因。
5. 使用者明確拒絕的建議，不得直接視為已接受。
6. 外部 API 失敗時，應允許部分功能繼續運作。
7. 需要真實世界資訊的 Skill 必須有可追溯來源。
8. 各 Skill 應具備獨立測試案例。

這是第一版邏輯契約，Codex 可自行選擇合適的程式介面實現。

---

# 10. Athlete Memory & Journal

AIAC 必須具有跨日期的持續記憶。

## 10.1 Athlete Profile

保存相對穩定的個人資訊與偏好。

## 10.2 Daily Journal

保存每天的：

- 身體與環境 Context。
- 運動活動。
- Morning Recommendation。
- Workout Analysis。
- Evening Reflection。
- 課表變更。
- 使用者回饋。

## 10.3 Training History

保存可供長期比較的運動資料。

## 10.4 Coaching Memory

記錄有助於未來建議的資訊，例如：

- 使用者偏好早晨運動。
- 不喜歡過度保守的建議。
- 出差時偏好有景觀的跑步路線。
- 某些訓練形式容易造成低動機。
- 過去某種調整是否成功。

記憶必須能讓使用者檢視、更正與刪除。

**AIAC 不能把 AI 推測當成使用者已確認的事實。**

---

# 11. Technology & Deployment

## 11.1 Web Prototype

建議採用易於開發與維護的技術組合。

參考架構：

- Frontend：React + TypeScript。
- Backend：Python + FastAPI。
- Storage：SQLite + Local JSON / FIT Files。
- LLM：可配置的 API Provider。
- FIT Parser：成熟的 FIT 解析套件。
- Configuration：環境變數。
- Tests：自動化單元測試與基本端對端測試。

這是建議技術棧，不是既有決策。Codex 可以提出更簡單且適合快速驗證的方案。

MVP 優先採單體式架構，不需要微服務、Kubernetes、獨立 Event Bus 或 Vector Database。

## 11.2 Future OpenClaw Integration

最終架構：

Mac mini  
→ OpenClaw Runtime  
→ AIAC Skills / Coaching Services  
→ LLM API  
→ Local Storage  
→ Telegram

OpenClaw 預期負責：

- Agent Runtime。
- Tool / Skill Invocation。
- Messaging。
- Scheduling。
- Session Handling。

AIAC 專注：

- Coaching Knowledge。
- Context Understanding。
- Workout Analysis。
- Planning。
- Memory。
- Adaptive Recommendations。

Web Prototype 的核心 Coaching Service 應盡量可重用。

不能將核心邏輯寫死在 React 元件或 Telegram Handler 中。

OpenClaw 的實際 Skill Interface 與排程能力應於整合階段依當時官方文件確認。

---

# 12. Security & Privacy

AIAC 會處理敏感的個人運動與健康資訊。

第一階段要求：

- 運動原始資料優先保存在本地。
- 不將 FIT 檔案提交到公開 Git Repository。
- API Key 不寫入原始碼。
- 使用環境變數管理機密。
- 避免在 Log 中輸出帳號密碼與 Token。
- 明確告知哪些資料會送往外部 LLM API。
- 使用者可以刪除個人歷史與記憶。
- LLM 不得任意讀取本機其他檔案。

Garmin Connect 自動登入屬後續功能，應使用安全的憑證管理機制，不得將明文密碼寫進 JSON 或程式碼。

正式上線時還需要處理登入授權、遠端存取與資料備份。

---

# 13. MVP Scope & Priorities

## P0 — 必須完成

1. Web Chat Interface。
2. FIT File Upload & Parsing。
3. Activity Normalization。
4. Athlete Profile。
5. Weekly Training Plan。
6. Workout Analysis。
7. Morning Coaching Recommendation（手動觸發）。
8. 自然語言修改訓練安排。
9. Weekly Budget Tracking。
10. Athlete Journal & Persistent Memory。
11. LLM API Integration。
12. 本地資料保存與重新讀取。

## P1 — 第二輪驗證

1. Weather API。
2. 不同時段天氣比較。
3. Travel Context。
4. Scenic Route Recommendation。
5. Indoor / Gym Alternatives。
6. Apple Health Data Import。
7. Strava Data Import。
8. Evening Reflection。
9. 更完整的運動生理分析。

## P2 — Agent Deployment

1. Mac mini 部署。
2. OpenClaw Integration。
3. Telegram Bot。
4. Garmin Connect 自動同步。
5. Morning Scheduled Push。
6. Post Workout Event Trigger。
7. Weather Change Alerts。
8. 自動備份與服務健康監控。

---

# 14. Codex Implementation Milestones

## M1 — Functional Web Prototype

交付：

- 可執行 Web App。
- LLM Chat。
- Athlete Profile。
- Weekly Plan。
- 模擬 Daily Context。
- Morning Recommendation。

驗收：

使用者可以透過自然語言描述今天的情況，獲得合理且有理由的訓練建議。

## M2 — Real Workout Data

交付：

- FIT Import。
- Normalized Activity。
- Workout Analysis。
- History Persistence。

驗收：

上傳真實 FIT 後，可以分析訓練並保存結果；重新啟動系統後資料仍存在。

## M3 — Adaptive Coaching

交付：

- Workout Swap。
- Weekly Budget Recalculation。
- Motivation-aware Coaching。
- Planning History。

驗收：

使用者說「今天不想 Interval」，AIAC 可以提出可行的替代安排，並正確更新整週課表。

## M4 — Real-world Context

交付：

- Weather Context。
- Travel Context。
- Route / Indoor Alternatives。

驗收：

在不同天氣、地點及時間限制下，AIAC 能提出不同且有依據的建議。

## M5 — Agent Integration

交付：

- OpenClaw Integration。
- Telegram。
- Scheduled Morning Coaching。
- Automatic Data Collection。

驗收：

使用者不需打開 Web App，即可收到主動建議，並透過 Telegram 完成互動與分析。

---

# 15. Acceptance Test Scenarios

Codex 應建立以下情境測試，不能只驗證頁面能否顯示。

### Test 01 — Post Workout Analysis

輸入一份 Garmin FIT。

預期：

正確解析活動、產生分析、標示資料缺失，並儲存歷史紀錄。

### Test 02 — Motivation-aware Swap

使用者：

「今天不想跑 Interval，改 Zone2 好嗎？」

預期：

評估整週課表、恢復與品質課安排，提出可行替代方案，不直接取消 Interval，也不強迫執行。

### Test 03 — Heat Adaptation

今天下午高溫高濕，早晨相對涼爽。

預期：

比較不同時段，解釋熱負荷對訓練的影響，必要時調整課程。

### Test 04 — Travel Running

使用者在陌生城市，想跑 8 公里並順道觀光。

預期：

提供與訓練類型相符的路線建議；若無地圖服務，不得捏造具體路線。

### Test 05 — Indoor Alternative

使用者說外面雷雨，飯店只有跑步機。

預期：

產生合理的室內替代課程，並說明與原課程的差異。

### Test 06 — Weekly Budget

本週已有多次訓練，剩餘兩天仍有未完成目標。

預期：

評估合理可完成量，不能單純把剩餘里程平均塞入最後兩天。

### Test 07 — Missing Recovery Data

沒有睡眠或 HRV 資料。

預期：

仍可提供有限度的建議，清楚說明不確定性，不捏造恢復分數。

### Test 08 — Athlete Memory

使用者多次表示喜歡旅行時跑景觀路線，並確認這是長期偏好。

預期：

下次旅行時可運用此偏好，且允許使用者修改。

### Test 09 — Duplicate Activities

同一活動分別從 Garmin 與 Strava 匯入。

預期：

不重複計算 Weekly Budget。

### Test 10 — Safety & User Autonomy

使用者想在明顯不適的情況下完成高強度課程。

預期：

AIAC 應提出風險、適當降低或停止訓練的建議，而不是為完成 Weekly Budget 無條件鼓勵。

---

# 16. Non-goals — 目前不要做的事

第一階段不要：

- 開發 iOS / Android Native App。
- 自製穿戴裝置。
- 自行開發 FIT Binary Parser。
- 建立雲端資料融合平台。
- 建立複雜多 Agent 系統。
- 自行訓練大型語言模型。
- 立即決定唯一的運動生理演算法。
- 建立過度複雜的資料庫。
- 實作未經驗證的自動訓練負荷演算法。
- 為了自動化而延後 Coaching 功能驗證。

**現成工具優先，能用成熟套件就不要重造輪子。**

---

# 17. Codex Development Instructions

Codex 請以此文件作為產品需求基準。

開發時遵守以下規則：

1. 先檢查既有 Repository，不要無條件覆蓋原始程式。
2. 優先建立可運行的 Web Prototype。
3. 核心 Coaching Logic 必須與 Web UI 分離。
4. 使用真實 LLM API，並提供測試用 Mock Mode。
5. 資料來源與模型供應商必須可替換。
6. 所有重要資料必須持久化。
7. 提供簡單的啟動方式，避免要求使用者手動執行多個 Python 指令。
8. 每個 Milestone 都要有可見、可測試的功能。
9. 對未定義的運動生理算法，使用明確的可替換介面與保守的示範實作，不得假裝已完成科學驗證。
10. 不要自行增加大量未要求的功能。
11. 所有重要修改應包含測試、使用說明與驗收結果。
12. 若需變更產品定位、資料隱私原則或重大技術方向，先提出理由與替代方案。

## 第一個開發任務

**請先完成 M1 — Functional Web Prototype。**

M1 應使用模擬資料，先驗證 Coaching 品質。

第一個可展示版本應允許使用者：

- 設定 Athlete Profile。
- 查看與編輯一週訓練計畫。
- 輸入今天的身體、環境、時間與動機。
- 點擊「Generate Morning Coaching」。
- 獲得 LLM 產生的個人化建議。
- 透過聊天要求修改今天的課表。
- 查看更新後的 Weekly Plan。
- 重新開啟頁面後保留設定及對話。

M1 完成後再整合 FIT，避免重新陷入資料擷取工程而延誤產品價值驗證。

**Definition of Done：系統能完成一輪「理解情境 → 產生建議 → 使用者提出改變 → 重新規劃 → 保存結果」的完整互動。**

---

# 18. Final Product Principle

AIAC 的成功不以程式碼數量、資料欄位數量或 Dashboard 複雜度衡量。

真正的成功標準是：

**使用者是否感覺 AIAC 比傳統訓練 App 更了解自己，而且提出的建議真的能幫助自己持續、愉快、安全地進步。**

AIAC 的核心承諾：

**Understanding Before Coaching.**

先理解，再指導。

**AIAC — AI Adaptive Coaching**

*Your life changes. Your coaching adapts.*
