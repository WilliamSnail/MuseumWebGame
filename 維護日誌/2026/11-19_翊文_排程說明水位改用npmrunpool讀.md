---
日期: 2026-11-19 15:43:34
作者: 翊文
AI: Claude Opus 5.5（Claude Code）
類型: 文件
範圍: [content/排程說明.md]
PR: 無
版本: 2026.11.11-1
測試: node tools/week_check.cjs 過
狀態: 待合併
相關: []
---

## 為什麼要改

> 「PR 789 上線後，把一之九之五改成用 npm run pool 讀、核對欄位名」

## 改了什麼

- 一之九之五：資料改用 npm run pool 讀，欄位照 tools/pool_levels.cjs（day、lv 0～24、dir、band 的五段、night、trace、hits）；漲退照 dir 寫，edge 寫腳印，night 是 true 那晚的場面直接寫在說明裡（排程在雲端讀不到 .claude/）

## 怎麼確認的

- 欄位名對過 pool_levels.cjs 和決定 0133

## 還沒做、要注意

- 沒有

## 給下一個人

- 每日排程每天先跑 npm run pool
