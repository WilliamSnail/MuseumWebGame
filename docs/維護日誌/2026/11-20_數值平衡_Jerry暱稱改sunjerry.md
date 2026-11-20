---
日期: 2026-11-20 15:10:00
作者: 數值平衡
AI: Claude Sonnet 5.5（Claude Code）
類型: 修正
範圍: [shared/config.js, test/gift_multi.test.cjs]
PR: 無
版本: 2026.11.20-1
測試: npm test 全過
狀態: 待合併
相關: [docs/決定/0143-文化部再撥款和水位看兩人合計.md]
---

## 為什麼要改
- 翊文說要給的館友暱稱是「sun jerry」，不是「Jerry」；去空白、小寫後是 sunjerry，原本的設定對不上。

## 改了什麼
- cultureGiftMore 的 moc-jerry-2026-11 nicks 改成 ["sun jerry"]（id 不改）。水位合計和資助用同一份名單，認的是同一個人。

## 怎麼確認的
- test/gift_multi.test.cjs 改用 sun jerry（含多餘空白、大小寫）。

## 還沒做、要注意
- 還沒有人收到，基準照舊有效。

## 給下一個人
- 暱稱比對是去空白、小寫，「sun jerry」和「SunJerry」會當同一個人。
