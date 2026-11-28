---
日期: 2026-11-28 13:12:23
作者: 翊文
AI: Claude Opus 5.5（Claude Code）
類型: 內容
範圍: [shared/stock/text.js]
PR: 無
版本: 2026.11.11-1
測試: npm test 全過
狀態: 待合併
相關: []
---

## 為什麼要改

> 「翊文 11-28：「綠眼顯卡 🎮、紅爪晶片 能換壹下emoji嗎」」

## 改了什麼

- 綠眼顯卡 🎮 → 👁️（綠色的眼睛）
- 紅爪晶片 🦀 → ❤️（紅色；翊文從建議裡挑的）

## 怎麼確認的

- npm test 全過（emoji 不重複的測試也過）

## 還沒做、要注意

- 無。

## 給下一個人

- emoji 只改 shared/stock/text.js、in_text.js 的 emo，銀行和 Discord 會跟著變
