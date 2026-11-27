---
日期: 2026-11-27 11:05:15
作者: 翊文
AI: Claude Opus 5.5（Claude Code）
類型: 伺服器
範圍: [tools/fb/fb_task.cjs]
PR: 無
版本: 2026.11.11-1
測試: node --check 過、npm test 全過
狀態: 待合併
相關: []
---

## 為什麼要改

> 「翊文 11-27：「昨天水位已經超過了，劇情可以推進了對吧」「順便查一下問題」。公開的 pool.json 只有水位格數和到過幾次，看不到門檻那晚是哪天、名字收了沒」

## 改了什麼

- house-size 多印館門口池子：水位、門檻那晚、到過門檻幾次、待收名字還剩幾人、上次收的那晚和有沒有收到、最近的漲退（不印是誰）

## 怎麼確認的

- npm test 全過

## 還沒做、要注意

- 跑 house-size 看門檻那晚是哪天

## 給下一個人

- 池子的欄位說明在 shared/casino/bank.js 的 casPoolDay、casPoolTake
