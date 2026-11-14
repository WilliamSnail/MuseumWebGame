---
日期: 2026-11-14 13:00:00
作者: 翊文
AI: Claude Sonnet 5.5（Claude Code）
類型: 修正
範圍: [tools/fb_task.cjs, tools/econ_check.cjs, test/econ_check.test.cjs, docs/經濟自我檢查.md]
PR: 無
版本: 2026.11.11-1
測試: npm test 全過；econ_check 加 hex 格式測試（少行、遮罩、檢查碼、過渡期假差額）；正式站沒重按
狀態: 待合併
相關: [docs/經濟自我檢查.md]
---

## 為什麼要改

Yuga 按了 econ-status，base64 每份最後一塊的結尾「fQ==」又被 GitHub 遮成 `***`（某個祕密的值剛好包含這串），econ_check 解析失敗。

## 改了什麼

- `econ-status` 改輸出 hex（只有 0-9a-f）：`ECON_HEX H|R 第幾份/共幾份 總長度 檢查碼 <120 字> .`，每行結尾固定「.」。
- `econ_check --ledger` 讀 hex：少行、有 `***`（被遮）、長度或檢查碼對不上，都會用白話說（不再默默壞掉）；舊的 base64、JSON 格式還讀得到。
- 已知的過渡期假差額：日報對帳差剛好等於 −(日報快照的外面世界 − 起始) 時，印成「已知的過渡期假差額，下壹份日報會校正」，不紅字（PR 419 的校正要等下壹份日報，每天第壹個進館的人觸發；現在最新的還是 11-14 那份，所以差額還在，不是錢不見）。

## 怎麼確認的

`npm test`（econ_check 5 項：正常、過渡差額、真的有差額、少行、遮罩、檢查碼）。

## 還沒做、要注意

- 需要翊文同意後再按一次 econ-status；hex 不含大括號和 base64 的結尾，被遮的機率很小，萬一還是被遮，錯誤訊息會講。

## 給下一個人

- 輸出格式要改的話，fb_task 的 `emit` 和 econ_check 的 `decHex` 要壹起改，並改測試。
