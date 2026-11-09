---
日期: 2026-11-09 18:53:41
作者: 翊文
AI: Claude Sonnet 5.5（Claude Code）
類型: 新功能
範圍: [shared/casino_econ.js, shared/casino_text.js, shared/config.js, shared/notices.js, functions/casino.js, web/src/ui_casino.js, web/src/css/casino.css, web/src/css/landscape.css, content/排程說明.md, test/casino_econ.test.cjs]
PR: 無
版本: 2026.11.08-1
測試: npm test 全過、npx vite build 成功、模擬器實測 econ
狀態: 待合併
相關: [docs/決定/0040-Hamachi賭場.md, docs/決定/0048-世界觀和政治新梗.md, docs/決定/0052-拚經濟和YugaBot身世.md]
---

## 為什麼要改

> 「拚經濟、實況和斗內、Yuga Bot 的身世，這幾個安排進規劃」
>
> 「可以開始做了」

## 改了什麼

- 新 `shared/casino_econ.js`（純規則，亂數由參數傳入）：亂數 r 是 0～100，大於 30 成功，莊家 +r×30000、約 8% 多一張大禮包券（要先開過今天的大禮包）；否則失敗，莊家 -r×10000，約 55% 按的人撈到同額的油水。一人一天 3 次（`NUM.casino.econ.perDay`，新的，等翊文），台灣 05:00 換日。錢包多一欄 `ec`（今天幾次、累計成功、失敗、油水、把莊家拚回正幾次）。
- `functions/casino.js` 新 act `econ`：走現有的 `play` 交易，伺服器用 crypto 亂數，結果、莊家的錢、錢包一起寫；連點和超過次數被擋（交易一個一個排隊）。每個成功的回答（shape）多帶今天還剩幾次 `econ`。
- 莊家破產（負的）時拚回正：回 `rescued`，畫面跳「把莊家拚回來了」。不改 houseReopen：換日還是負的才借，拚回正了就不會被借。
- `shared/casino_text.js` 新 `CAS_ECON`：8 個政策口號、七大策略、歐債那句、演出的字、荷官的身世閒聊（沒有畫圖、沒有 Pepe）。文字界線照決定 0048：沒有真人名字、綽號、頭銜、政黨；失敗和撈油水的句子不接任何政策名字。
- 畫面：賭場新頁籤「拚經濟」（`ui_casino.js` 的 `econPane`、`econGo`），顯示今天還剩幾次，按了壹行壹行跳字，跳完才更新籌碼和莊家的數字；演出中按鈕和頁籤都不能按；減少動態時幾乎立刻跳完、沒有彈出動畫。CSS 在 `css/casino.css`，手機橫向在 `landscape.css`。
- `content/排程說明.md` 新增「一之五、Yuga Bot 的身世」：五層、每週最多往下壹層、不動 `main.theme`、不寫真人。
- `shared/notices.js` 新公告 `casino-econ`。
- 測試 `test/casino_econ.test.cjs`（19 項）接進 `run_all.cjs`、`load_shared.cjs`、`esm_smoke.mjs`。

## 怎麼確認的

- `npm test` 全過、`npx vite build` 成功。
- 模擬器（第 4 套，連接埠 5284，測完關掉）：同一人連叫 4 次，前 3 次成功（成功時莊家 +177 萬、+111 萬；失敗那次莊家 -19 萬、按的人 +19 萬油水），第 4 次回「今天拚夠了」；同一人 5 個並行請求，剛好 3 個算數。莊家從 1.08 億變 1.09 億。

## 還沒做、要注意

- 畫面沒有在瀏覽器實際看過（只過了打包和 import 檢查）：跳字節奏、手機直向和橫向、減少動態都要有人看。
- 莊家破產中拚回正，只有單元測試，模擬器沒有真的把莊家弄成負的來試。
- 壹天 3 次、演出節奏是我先定的，等翊文。

## 給下一個人

- 「拚經濟」頁籤是第 4 個頁籤，橫向手機頁籤列本來就會橫向捲動。
- 新排程文字的「一之五」要等排程下次跑才會用到；要不要現在手動排壹層，主線決定。
- 實況和斗內還沒做（`docs/賭場規劃.md` 第三節）。
