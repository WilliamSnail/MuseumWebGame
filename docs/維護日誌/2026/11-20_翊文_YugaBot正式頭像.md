---
日期: 2026-11-20 16:45:13
作者: 翊文
AI: Claude Sonnet 5.5（Claude Code）
類型: 內容
範圍: [web/public/tasks/giver-yuga.webp, web/src/ui_tasks.js, docs/界線.md, docs/決定/]
PR: 無
版本: 2026.11.11-1
測試: ship 跑 npm test、build；#tasks 電腦、手機看過頭像
狀態: 待合併
相關: [docs/決定/0147-YugaBot的頭像用玩家Yuga自己畫的圖（0005的例外）.md]
---

## 為什麼要改

> 「翊文 11-20：Yuga Bot 的正式頭像是玩家 Yuga 自己畫的；「可以，放進去當正式頭像」」

## 改了什麼

- web/public/tasks/giver-yuga.webp：從翊文給的手機截圖裁出中間那塊（256×256），任務卡的交代人頭像換成這張（圓框會切掉四角）
- GIVER_ART 加 yuga；其他五位仍是剪影
- 界線第 1 條加例外，寫決定 0147

## 怎麼確認的

- 任務卡頭像：電腦、手機

## 還沒做、要注意

- 無。

## 給下一個人

- 這張頭像是手繪的 Pepe 臉，是 0005 的唯壹例外；別的地方不要因此再放 Pepe 的圖
- 圖是從手機截圖裁的，之後有原檔可以換同壹個檔名
