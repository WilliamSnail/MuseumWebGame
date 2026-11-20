---
日期: 2026-11-13 15:45:00
作者: Claude
AI: Claude Sonnet 5.5（Claude Code）
類型: 新功能
範圍: [shared/stocks_text.js, shared/stocks.js, tools/stocks_fetch.cjs, .github/workflows/stocks-daily.yml, content/stocks/daily.json, test/stocks.test.cjs, test/load_shared.cjs, test/run_all.cjs]
PR: 無
版本: 2026.11.11-1
測試: npm test 全過、npm run build 成功、tools/stocks_fetch.cjs 在本機真的抓了一次（22 個市場日）、workflow 沒在 GitHub 上跑過
狀態: 還沒驗證
相關: [docs/經濟體系規劃.md]
---

## 為什麼要改

> 「除了館內，還可以規劃一些館外股票，抓真正的股票來玩，NVIDIA AMD Nasdaq那些，每天更新，但是可以改成符合這個世界的版本」（翊文 11-13）

銀行第三步「股票」的館外那一半，這篇只做「每天的資料」。買賣規則、畫面、股池不在這裡。

## 改了什麼

- `shared/stocks_text.js`：7 檔的名字表（綠眼顯卡、紅爪晶片、夜光科技指數、島上鑄晶坊、銀蘋果工坊、閃電車行、方窗軟體）。不寫真公司名、代號、商標。文字是草稿，Yuga 可以改。
- `shared/stocks.js`：純函式。真實漲跌（%）→ 遊戲漲跌：乘 `scale`（現在 1）、一天最多 ±10%（`cap`）；休市（null）不動；週末不動；平日整天沒資料就用最近一筆有數字的；`outStockReady` 告訴你前一天的資料到了沒；`outStockStep` 算新股價（四捨五入、最低 1）。
- `tools/stocks_fetch.cjs`：抓資料、合進 `daily.json`、`--check` 檢查格式。真實代號只放在這支，不進 `shared/`。
- `.github/workflows/stocks-daily.yml`：台灣每天 05:30（補 06:30）跑，也能手動按。結果推到資料分支 `stocks-data` 的 `daily.json`，不推 main、不碰 Firebase、不用金鑰。
- `content/stocks/daily.json`：本機抓的真實資料（到 11-12），給測試和開發用。
- `test/stocks.test.cjs`：10 項，進 `npm test`。

## 資料格式

```
{ "updated": ISO時間, "source": "...", "days": {
  "2026-11-12": { "greeneye": -4.34, "redclaw": 5.86, "nightindex": -0.39, "islandforge": -2.3, "silverapple": -0.21, "flashcar": 1.69, "squarewin": 0.36 },
  "2026-11-13": { ..., "squarewin": null } } }
```

- key＝市場所在地的日期；值＝當天收盤比前一個收盤的漲跌幅（%，兩位小數）；null＝那家那天休市。
- 市場日 M 的漲跌，用在遊戲日期 M+1（美股台灣時間 M+1 早上收盤，遊戲 05:00 換日，剛好接上）。
- 只留最近 40 個市場日。

## 資料來源：為什麼選 Yahoo、有什麼限制

- 想用的 Stooq 現在擋掉程式：回的是要瀏覽器跑 JS 驗證的頁面，抓不到 CSV。
- 改用 Yahoo Finance 的公開圖表介面（`query1.finance.yahoo.com/v8/finance/chart/代號`）：不用金鑰、台股美股指數都有、一次回一個月的日線。
- 限制：這是沒公開保證的介面，可能被擋、改格式、限流；Actions 的機房 IP 有可能被擋（沒在 GitHub 上試過）。抓失敗的那家這次留空，全部失敗就不寫檔、workflow 失敗（GitHub 會寄信）。
- 資料只用來決定遊戲裡漲跌，不是投資建議，也不做真錢（`docs/界線.md`）。

## 怎麼確認的

- npm test 全過、npm run build 成功。
- 本機跑 `node tools/stocks_fetch.cjs`，7 檔都抓到；盤中的最新一根會丟掉，所以沒有收盤的 11-13 不會寫進去。

## 還沒做、要注意

- **workflow 沒在 GitHub 上跑過**。合併後請按一次「館外股票每日資料」的 Run workflow，看 `stocks-data` 分支有沒有出現 `daily.json`；要確認機房抓得到 Yahoo。
- **伺服器怎麼讀還沒決定**。Functions 只拿得到部署包裡的東西，資料分支進不去。選項：(a) 排程的最後一步用 `firebase-task.yml` 那條路寫進資料庫（碰正式 Firebase，要翊文同意、要新增固定動作，決定 0038）；(b) 讓每天部署時把 `stocks-data` 的檔拉進 `functions/`（`tools/copy_shared.cjs` 像 `events_data.js` 那樣打包），但資料最多晚一次部署；(c) 前端直接讀 GitHub raw（repo 私有，不行）。我建議 (a)，要主 session 和翊文決定。
- 排程時間：美股冬令 05:00 收盤，遊戲 05:00 換日，所以 05:00～05:30 之間資料還沒到。伺服器要先問 `outStockReady`，沒到就先等，不要直接用「缺資料」的補法把今天定下來。
- `scale` 現在是 1（照真的），真實的日漲跌常在 ±5% 內，ARM 類股偶爾 ±10%；要不要壓小是平衡 session 的事。
- `test/load_shared.cjs` 的 ORDER 加在最後，和銀行那條分支（也會改這一行）合併時可能要手動併一下。
- 名字表的文字沒給 Yuga 看過。

## 給下一個人

- 不要把真實代號寫進 `shared/`，名字表測試會擋。
- 加股票：名字表和 `tools/stocks_fetch.cjs` 的 `SYMBOLS` 都要加，測試會檢查兩邊 id 一樣。
- 台股用台灣日期、美股用美東日期當 key，所以同一天兩邊都有 key 不代表同時間收盤；用 `outStockMovesFor` 就好，不要自己對日期。
- 這台電腦的 `python` 是商店的空殼，會悄悄什麼都不做；改檔用編輯工具。
