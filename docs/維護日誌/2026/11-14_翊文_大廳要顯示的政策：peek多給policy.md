---
日期: 2026-11-14 12:46:54
作者: 翊文
AI: Claude Opus 5.5（Claude Code）
類型: 伺服器
範圍: [shared/casino_econ.js, functions/casino.js, test/casino_econ.test.cjs]
PR: 無
版本: 2026.11.11-1
測試: npm test 全過
狀態: 待合併
相關: []
---

## 為什麼要改

> 「翊文 11-14（附拚經濟成功、政策效果「門票多一成，到明天」的截圖）：「這些政策效果能也在大廳展示嗎」」

## 改了什麼

- casPolicyView(house, day)：現在有效的政策 { name, effect, day, until }，沒有就 null
- peek 多回 policy，大廳的畫面由美術統籌接

## 怎麼確認的

- npm test 全過；新測試：有效、沒有、過期

## 還沒做、要注意

- 畫面接 peek.policy

## 給下一個人

- 無。
