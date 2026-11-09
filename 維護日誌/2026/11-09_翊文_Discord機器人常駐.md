---
日期: 2026-11-09 20:06:37
作者: 翊文
AI: Claude Opus 5.5（Claude Code）
類型: 伺服器
範圍: [functions/discord.js, docs/Discord聯動規劃.md]
PR: 無
版本: 2026.11.08-1
測試: npm test 全過
狀態: 待合併
相關: [docs/Discord聯動規劃.md, docs/決定/0051-Discord聯動.md]
---

## 為什麼要改

> 「好啊，我們現在有免費額度呢」

## 改了什麼

- `discordBot` 設 `minInstances: 1`、`cpu: gcf_gen1`：閒置後第一個指令不再超過 Discord 的 3 秒。

## 怎麼確認的

- 真的 Discord 上，閒置約 17 分鐘後 `/pepe-莊家` 回「該申請未受回應」；喚醒後回應不到 0.1 秒。
- `npm test` 全過。

## 還沒做、要注意

- 常駐之後的回應時間要在真的 Discord 確認。
- 實際費用要看帳單，官方的例子約每月 3 美元。

## 給下一個人

- 無。
