---
日期: 2026-11-13 16:20:00
作者: Claude
AI: Claude Sonnet 5.5（Claude Code）
類型: 伺服器
範圍: [tools/stocks_publish.cjs, .github/workflows/stocks-daily.yml, test/stocks.test.cjs]
PR: 無
版本: 2026.11.11-1
測試: npm test 全過、npm run build 成功、buildDoc 的測試、沒連過正式資料庫
狀態: 還沒驗證
相關: [維護日誌/2026/11-13_Claude_館外股票每日資料.md, docs/決定/0038-Firebase的固定動作.md]
---

## 為什麼要改

上一篇把每日漲跌放在資料分支 `stocks-data`，伺服器讀不到。我問了要不要讓排程寫進資料庫，翊文回「好，可以」（11-13），我選了當時建議的 (a)。

## 改了什麼

- `tools/stocks_publish.cjs`：整份覆蓋正式資料庫的 `stocksDaily/latest`，內容只有 `{ updated, days, publishedAt }`。先過格式檢查才寫；金鑰不是 `pepe-museum` 的就不寫。
- `stocks-daily.yml` 多一步用 `FIREBASE_SERVICE_ACCOUNT` 跑它，跑完刪掉金鑰檔。這步失敗，整個 workflow 就失敗（不會悄悄漏掉）。
- 規則 `firestore.rules` 預設全擋，用戶端讀不到；只有 Functions（admin）讀得到。

## 怎麼確認的

- npm test、build 全過。
- 只測了組文件的函式；沒連正式資料庫。

## 還沒做、要注意

- **Functions 還沒讀**：`functions/casino.js` 主 session 在改，我沒碰。讀法：`getFirestore().doc("stocksDaily/latest").get()`，拿 `days` 丟進 `outStockMovesFor` 和 `outStockReady`。
- 合併後要按一次 Run workflow，到 Firebase 控制台看 `stocksDaily/latest` 有沒有出現。
- 這是定時自動寫正式資料庫的第一個流程，範圍只有這一份文件；要擴大要再問翊文。

## 給下一個人

- 一定是整份覆蓋，不是 merge；刪舊日子靠 `KEEP` 40 天。
- 資料沒到時 `latest` 還是上一次的，伺服器靠 `outStockReady` 判斷。
