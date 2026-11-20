---
日期: 2026-11-20 14:30:00
作者: 數值平衡
AI: Claude Sonnet 5.5（Claude Code）
類型: 平衡
範圍: [shared/casino_wallet.js, shared/casino_bank.js, shared/casino_text.js, shared/config.js, functions/casino.js, test/gift_multi.test.cjs]
PR: 無
版本: 2026.11.20-1
測試: npm test 全過
狀態: 待合併
相關: [docs/決定/0143-文化部再撥款和水位看兩人合計.md]
---

## 為什麼要改
- 翊文 11-20：館友 Jerry 也收文化部 10 億；Yuga 再收 5 億（附第二封信）；水位改看兩人合計賺的，撥款不算賺的。

## 改了什麼
- 資助改成可以多筆（cultureGiftMore）、每筆各壹次；第二封信 CAS_GIFT2。
- house.pool 多人（who），日報用 poolNws；撥款同步加起點；兩人的後續處理照決定 0143。

## 怎麼確認的
- test/gift_multi.test.cjs；culture_gift、pool、pool_take 測試跟著調。

## 還沒做、要注意
- 動錢：已知世界少 25 億（Jerry 10 億＋Yuga 15 億），上線前 Yuga 存基準。
- 正式站有幾位 Jerry 我看不到，要 Yuga 確認；沒發公告、Discord 由 Yuga 發。

## 給下一個人
- 之後再撥款：加進 cultureGiftMore，不用改水位程式。
